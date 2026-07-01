// PadelConnect — Edge Function « notify-club » (Supabase Functions, runtime Deno).
// Déclenchée par des Database Webhooks. Cas gérés :
//   • reservations INSERT  → notif au(x) GÉRANT(s) du club (nouvelle réservation).
//   • reservations UPDATE (club_confirmed passe à true) → notif au JOUEUR (résa confirmée).
//   • reservation_participants UPDATE (accepted) → notif à l'AUTEUR (un invité a accepté).
//   • competitions INSERT (tournoi JOUEUR en attente) → notif au(x) gérant(s) du club hôte
//     (à valider) ET à l'OPÉRATEUR (frais à encaisser).
//   • competitions UPDATE (pending → published) → notif à l'ORGANISATEUR (tournoi validé).
//   • friend_requests INSERT (pending) → notif au DESTINATAIRE (nouvelle demande d'ami).
//   • friend_requests UPDATE (→ accepted) → notif à l'EXPÉDITEUR (demande acceptée).
// L'envoi passe par l'API Push d'Expo (pas besoin de gérer APNs soi-même : Expo route vers
// Apple/Google). Les webhooks « reservations » et « competitions » doivent écouter INSERT
// **et** UPDATE (cf. docs/PUSH-SETUP.md).
//
// Aucune clé secrète ici — on lit les jetons en base via la SERVICE ROLE (injectée par
// Supabase dans les variables d'environnement de la fonction).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

type Notif = { targets: string[]; title: string; body: string };

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    // Webhook Supabase : { type, table, record, old_record }
    const record = payload.record ?? {};
    const oldRecord = payload.old_record ?? {};
    const table = payload.table ?? '';
    const type = payload.type ?? ''; // INSERT | UPDATE | DELETE

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // accès complet, réservé au serveur
    );

    // Jetons de push des gérants d'un club (managed_club_id = clubId).
    const clubManagerTokens = async (clubId: string): Promise<string[]> => {
      const { data } = await supabase
        .from('profiles')
        .select('expo_push_token')
        .eq('managed_club_id', clubId)
        .not('expo_push_token', 'is', null);
      return (data ?? []).map((m: { expo_push_token: string }) => m.expo_push_token).filter(Boolean);
    };
    // Jeton de push d'un utilisateur précis (par id).
    const userToken = async (userId: string): Promise<string[]> => {
      if (!userId) return [];
      const { data } = await supabase.from('profiles').select('expo_push_token').eq('id', userId).maybeSingle();
      return data?.expo_push_token ? [data.expo_push_token] : [];
    };
    // Jetons de push de l'opérateur (role = 'operator').
    const operatorTokens = async (): Promise<string[]> => {
      const { data } = await supabase.from('profiles').select('expo_push_token').eq('role', 'operator').not('expo_push_token', 'is', null);
      return (data ?? []).map((m: { expo_push_token: string }) => m.expo_push_token).filter(Boolean);
    };
    // Nom affiché d'un utilisateur (prénom + nom) — pour personnaliser une notif sociale.
    const userName = async (userId: string): Promise<string> => {
      if (!userId) return 'Un joueur';
      const { data } = await supabase.from('profiles').select('first_name, last_name').eq('id', userId).maybeSingle();
      const name = `${data?.first_name ?? ''} ${data?.last_name ?? ''}`.trim();
      return name || 'Un joueur';
    };

    const notifs: Notif[] = [];

    if (table === 'reservations' && type === 'INSERT') {
      // Nouvelle réservation (INSERT uniquement — jamais un DELETE) → prévenir le(s) gérant(s).
      notifs.push({
        targets: await clubManagerTokens(record.club_id),
        title: 'Nouvelle réservation 🎾',
        body: `${record.booked_by_name ?? 'Un joueur'} — ${record.date_label ?? ''} à ${record.time ?? ''} (${record.court ?? ''}).`,
      });
    } else if (table === 'reservations' && type === 'UPDATE' && record.club_confirmed === true && oldRecord.club_confirmed !== true) {
      // Le club vient de CONFIRMER la réservation → prévenir le joueur (auteur).
      notifs.push({
        targets: await userToken(record.user_id),
        title: 'Réservation confirmée ✅',
        body: `${record.club_name ?? 'Le club'} a confirmé ton créneau du ${record.date_label ?? ''} à ${record.time ?? ''}.`,
      });
    } else if (
      table === 'reservation_participants' &&
      type === 'UPDATE' &&
      record.status === 'accepted' &&
      oldRecord.status !== 'accepted'
    ) {
      // Un invité vient d'ACCEPTER (transition → accepted) → prévenir l'AUTEUR (notif sociale).
      // Garde de transition : sans elle, chaque UPDATE d'une ligne déjà 'accepted' renotifierait.
      const { data: resa } = await supabase.from('reservations').select('user_id').eq('id', record.reservation_id).maybeSingle();
      notifs.push({
        targets: await userToken(resa?.user_id ?? ''),
        title: 'Invitation acceptée ✅',
        body: 'Un ami a accepté de jouer avec toi.',
      });
    } else if (table === 'competitions' && type === 'INSERT' && record.status === 'pending' && record.organizer_type === 'joueur') {
      // Tournoi créé par un JOUEUR → en attente : prévenir le club hôte (à valider).
      notifs.push({
        targets: await clubManagerTokens(record.club_id),
        title: 'Nouvelle demande de tournoi 🏆',
        body: `${record.organizer_name ?? 'Un joueur'} propose « ${record.title ?? ''} » — à valider ou refuser.`,
      });
    } else if (table === 'competitions' && type === 'UPDATE' && record.status === 'published' && oldRecord.status === 'pending') {
      // Le club a VALIDÉ un tournoi joueur → prévenir l'organisateur ET, si c'est un tournoi
      // joueur avec frais, l'opérateur (à encaisser par Wave). On ne facture QUE les tournois
      // réellement confirmés — un tournoi refusé ne génère aucun frais.
      notifs.push({
        targets: await userToken(record.organizer_id),
        title: 'Tournoi validé ✅',
        body: `${record.club_name ?? 'Le club'} a validé ton tournoi « ${record.title ?? ''} ». Il est maintenant visible.`,
      });
      const fee = Number(record.commission ?? 0);
      if (record.organizer_type === 'joueur' && fee > 0) {
        notifs.push({
          targets: await operatorTokens(),
          title: 'Tournoi joueur à encaisser 🏆',
          body: `« ${record.title ?? ''} » validé — frais à encaisser : ${fee.toLocaleString('fr-FR')} FCFA (Wave).`,
        });
      }
    } else if (table === 'friend_requests' && type === 'INSERT' && record.status === 'pending') {
      // Nouvelle demande d'ami → prévenir le DESTINATAIRE (il accepte/refuse dans l'app).
      notifs.push({
        targets: await userToken(record.to_user),
        title: 'Nouvelle demande d’ami 👋',
        body: `${await userName(record.from_user)} veut t’ajouter sur PadelConnect.`,
      });
    } else if (table === 'friend_requests' && type === 'UPDATE' && record.status === 'accepted' && oldRecord.status !== 'accepted') {
      // Demande acceptée → prévenir l'EXPÉDITEUR (vous êtes désormais amis).
      notifs.push({
        targets: await userToken(record.from_user),
        title: 'Demande acceptée ✅',
        body: `${await userName(record.to_user)} a accepté ta demande d’ami.`,
      });
    }

    // Aplatis toutes les notifs en messages Expo (une entrée par destinataire).
    const messages = notifs.flatMap((n) => n.targets.map((to) => ({ to, title: n.title, body: n.body, sound: 'default' })));
    if (messages.length === 0) return new Response('no targets', { status: 200 });

    await fetch(EXPO_PUSH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });

    return new Response('ok', { status: 200 });
  } catch (e) {
    return new Response(`error: ${e}`, { status: 500 });
  }
});
