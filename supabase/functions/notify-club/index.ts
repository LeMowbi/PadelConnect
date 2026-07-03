// PadelConnect — Edge Function « notify-club » (Supabase Functions, runtime Deno).
// Déclenchée par des Database Webhooks. Cas gérés :
//   • reservations INSERT  → notif au(x) GÉRANT(s) du club (nouvelle réservation).
//   • reservations UPDATE (club_confirmed passe à true) → notif au JOUEUR (résa confirmée).
//   • reservations UPDATE (status → cancelled, depuis 'booked') → notif au(x) GÉRANT(s) du club
//     (le joueur a annulé — terrain à libérer côté préparation).
//   • reservation_participants INSERT → notif à l'AMI INVITÉ (nouvelle invitation à jouer).
//   • reservation_participants UPDATE (accepted) → notif à l'AUTEUR (un invité a accepté).
//   • competitions INSERT (tournoi JOUEUR en attente) → notif au(x) gérant(s) du club hôte (à valider).
//   • competitions UPDATE (pending → published) → notif à l'ORGANISATEUR (tournoi validé) ET, si
//     frais > 0, à l'OPÉRATEUR (« frais à encaisser ») — donc seulement après validation du club.
//   • competitions UPDATE (pending → rejected) → notif à l'ORGANISATEUR (tournoi refusé).
//   • friend_requests INSERT (pending) → notif au DESTINATAIRE (nouvelle demande d'ami).
//   • friend_requests UPDATE (→ pending) → notif au DESTINATAIRE (demande RENVOYÉE après un refus :
//     send_friend_request fait un UPDATE on conflict, pas un INSERT).
//   • friend_requests UPDATE (→ accepted) → notif à l'EXPÉDITEUR (demande acceptée).
//   • lessons INSERT (pending) → notif au COACH (nouvelle demande de cours).
//   • lessons UPDATE (→ accepted) → notif à l'ÉLÈVE (cours accepté, terrain réservé) — le club
//     reçoit la notif « nouvelle réservation » via le webhook reservations, automatiquement.
//   • lessons UPDATE (→ declined) → notif à l'ÉLÈVE (cours refusé, aucun terrain réservé).
//   • match_results INSERT / UPDATE (→ pending) → notif aux AUTRES joueurs du match (score à
//     confirmer — l'UPDATE couvre la ressaisie après contestation).
//   • match_results UPDATE (→ confirmed / disputed) → notif au joueur qui avait SAISI le score.
// L'envoi passe par l'API Push d'Expo (pas besoin de gérer APNs soi-même : Expo route vers
// Apple/Google). Les webhooks « reservations », « reservation_participants », « competitions »
// et « lessons » doivent écouter INSERT **et** UPDATE (cf. docs/PUSH-SETUP.md).
//
// Aucune clé secrète ici — on lit les jetons en base via la SERVICE ROLE (injectée par
// Supabase dans les variables d'environnement de la fonction).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

// `data` (optionnel) : payload lu par le CLIENT au tap sur la notif (src/lib/notifications.ts,
// useNotificationTapRouter) pour amener directement à l'écran concerné. Seulement posé sur les
// notifs reçues par un JOUEUR — les écrans /amis, /reservations, /competition/[id] existent pour
// tous les comptes joueur, contrairement aux écrans gérant/opérateur (hors périmètre de ce routage).
type Notif = {
  targets: string[];
  title: string;
  body: string;
  // 'club_reservation' / 'club_tournament' = push destiné au GÉRANT → l'app ouvre l'Espace Club.
  data?: { kind: 'friend_request' | 'reservation' | 'club_reservation' | 'tournament' | 'club_tournament' | 'lesson'; id?: string };
};

Deno.serve(async (req) => {
  try {
    // Authenticité du webhook : si WEBHOOK_SECRET est configuré (variable d'env de la fonction),
    // on exige l'en-tête `x-webhook-secret` correspondant → refuse les appels arbitraires qui
    // pourraient déclencher des push. Tant que le secret n'est pas posé, comportement inchangé.
    const expectedSecret = Deno.env.get('WEBHOOK_SECRET');
    if (expectedSecret && req.headers.get('x-webhook-secret') !== expectedSecret) {
      return new Response('unauthorized', { status: 401 });
    }

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
        data: { kind: 'club_reservation', id: record.id },
      });
    } else if (table === 'reservations' && type === 'UPDATE' && record.club_confirmed === true && oldRecord.club_confirmed !== true) {
      // Le club vient de CONFIRMER la réservation → prévenir le joueur (auteur).
      notifs.push({
        targets: await userToken(record.user_id),
        title: 'Réservation confirmée ✅',
        body: `${record.club_name ?? 'Le club'} a confirmé ton créneau du ${record.date_label ?? ''} à ${record.time ?? ''}.`,
        data: { kind: 'reservation', id: record.id },
      });
    } else if (table === 'reservations' && type === 'UPDATE' && record.status === 'cancelled' && oldRecord.status === 'booked') {
      // Le joueur vient d'ANNULER une réservation qu'il avait faite (peut-être déjà confirmée) →
      // prévenir le(s) gérant(s) du club (terrain à libérer côté préparation).
      notifs.push({
        targets: await clubManagerTokens(record.club_id),
        title: 'Réservation annulée',
        body: `${record.booked_by_name ?? 'Un joueur'} a annulé son créneau du ${record.date_label ?? ''} à ${record.time ?? ''} (${record.court ?? ''}).`,
        data: { kind: 'club_reservation', id: record.id },
      });
      // Et prévenir les PARTICIPANTS (amis invités / joueurs qui avaient rejoint un match
      // ouvert) : sans ça, le match disparaît en silence de leurs réservations.
      const { data: parts } = await supabase.from('reservation_participants').select('user_id, status').eq('reservation_id', record.id);
      const partIds = (parts ?? []).filter((p) => p.status !== 'declined').map((p) => p.user_id as string);
      if (partIds.length > 0) {
        const { data: toks } = await supabase.from('profiles').select('expo_push_token').in('id', partIds);
        notifs.push({
          targets: (toks ?? []).map((t) => t.expo_push_token as string).filter(Boolean),
          title: 'Match annulé',
          body: `Le match du ${record.date_label ?? ''} à ${record.time ?? ''} (${record.club_name ?? ''}) a été annulé par son créateur.`,
          data: { kind: 'reservation', id: record.id },
        });
      }
    } else if (table === 'reservation_participants' && type === 'INSERT' && record.status === 'accepted') {
      // MATCH OUVERT (45) : quelqu'un vient de REJOINDRE — join_open_match insère directement
      // 'accepted' (≠ 'invited') → on prévient le CRÉATEUR du match, pas le nouveau venu.
      const { data: resa } = await supabase
        .from('reservations')
        .select('user_id, club_name, date_label, time')
        .eq('id', record.reservation_id)
        .maybeSingle();
      notifs.push({
        targets: await userToken(resa?.user_id ?? ''),
        title: 'Un joueur a rejoint ton match 🎾',
        body: `${await userName(record.user_id)} a rejoint ton match du ${resa?.date_label ?? ''} à ${resa?.time ?? ''} (${resa?.club_name ?? ''}).`,
        data: { kind: 'reservation', id: record.reservation_id },
      });
    } else if (table === 'reservation_participants' && type === 'INSERT') {
      // Un ami vient d'être INVITÉ à une réservation (link_participants) → prévenir l'invité.
      const { data: resa } = await supabase
        .from('reservations')
        .select('user_id, club_name, date_label, time, court')
        .eq('id', record.reservation_id)
        .maybeSingle();
      notifs.push({
        targets: await userToken(record.user_id),
        title: 'Invitation à jouer 🎾',
        body: `${await userName(resa?.user_id ?? '')} t'invite à jouer le ${resa?.date_label ?? ''} à ${resa?.time ?? ''} (${resa?.club_name ?? ''}).`,
        data: { kind: 'reservation', id: record.reservation_id },
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
        data: { kind: 'reservation', id: record.reservation_id },
      });
    } else if (
      table === 'competitions' &&
      type === 'INSERT' &&
      record.status === 'pending' &&
      (record.organizer_type === 'joueur' || record.organizer_type === 'operator')
    ) {
      // Tournoi créé par un JOUEUR ou par PADELCONNECT (43) → en attente : prévenir le club
      // hôte (c'est lui qui valide — sa permission, dans l'app).
      notifs.push({
        targets: await clubManagerTokens(record.club_id),
        title: 'Nouvelle demande de tournoi 🏆',
        body: `${record.organizer_name ?? 'Un joueur'} propose « ${record.title ?? ''} » — à valider ou refuser.`,
        data: { kind: 'club_tournament', id: record.id },
      });
    } else if (table === 'competitions' && type === 'UPDATE' && record.status === 'published' && oldRecord.status === 'pending') {
      // Le club a VALIDÉ un tournoi joueur → prévenir l'organisateur ET, si c'est un tournoi
      // joueur avec frais, l'opérateur (à encaisser par Wave). On ne facture QUE les tournois
      // réellement confirmés — un tournoi refusé ne génère aucun frais.
      notifs.push({
        targets: await userToken(record.organizer_id),
        title: 'Tournoi validé ✅',
        body: `${record.club_name ?? 'Le club'} a validé ton tournoi « ${record.title ?? ''} ». Il est maintenant visible.`,
        data: { kind: 'tournament', id: record.id },
      });
      const fee = Number(record.commission ?? 0);
      if (record.organizer_type === 'joueur' && fee > 0) {
        notifs.push({
          targets: await operatorTokens(),
          title: 'Tournoi joueur à encaisser 🏆',
          body: `« ${record.title ?? ''} » validé — frais à encaisser : ${fee.toLocaleString('fr-FR')} FCFA (Wave).`,
        });
      }
    } else if (table === 'competitions' && type === 'UPDATE' && record.status === 'rejected' && oldRecord.status === 'pending') {
      // Le club a REFUSÉ un tournoi joueur en attente → prévenir l'organisateur (sinon il reste
      // dans le flou, contrairement à la validation qui, elle, notifie déjà).
      notifs.push({
        targets: await userToken(record.organizer_id),
        title: 'Tournoi non retenu',
        body: `${record.club_name ?? 'Le club'} n'a pas retenu ton tournoi « ${record.title ?? ''} ».`,
        data: { kind: 'tournament', id: record.id },
      });
    } else if (table === 'friend_requests' && type === 'INSERT' && record.status === 'pending') {
      // Nouvelle demande d'ami → prévenir le DESTINATAIRE (il accepte/refuse dans l'app).
      notifs.push({
        targets: await userToken(record.to_user),
        title: 'Nouvelle demande d’ami 👋',
        body: `${await userName(record.from_user)} veut t’ajouter sur PadelConnect.`,
        data: { kind: 'friend_request' },
      });
    } else if (table === 'friend_requests' && type === 'UPDATE' && record.status === 'pending' && oldRecord.status !== 'pending') {
      // Demande RENVOYÉE après un refus : send_friend_request fait alors un UPDATE (on conflict),
      // pas un INSERT (cf. 30_friend_requests.sql). Sans ce cas, la 2ᵉ demande n'enverrait aucun push.
      notifs.push({
        targets: await userToken(record.to_user),
        title: 'Nouvelle demande d’ami 👋',
        body: `${await userName(record.from_user)} veut t’ajouter sur PadelConnect.`,
        data: { kind: 'friend_request' },
      });
    } else if (table === 'friend_requests' && type === 'UPDATE' && record.status === 'accepted' && oldRecord.status !== 'accepted') {
      // Demande acceptée → prévenir l'EXPÉDITEUR (vous êtes désormais amis).
      notifs.push({
        targets: await userToken(record.from_user),
        title: 'Demande acceptée ✅',
        body: `${await userName(record.to_user)} a accepté ta demande d’ami.`,
        data: { kind: 'friend_request' },
      });
    } else if (table === 'lessons' && type === 'INSERT' && record.status === 'pending') {
      // Nouvelle DEMANDE DE COURS → prévenir le COACH (il accepte/refuse depuis son Espace Coach).
      notifs.push({
        targets: await userToken(record.coach_id),
        title: 'Nouvelle demande de cours 🎾',
        body: `${record.student_name ?? 'Un joueur'} — ${record.date_label ?? record.date_key ?? ''} à ${record.time ?? ''} (${record.court ?? ''}).`,
        data: { kind: 'lesson' },
      });
    } else if (table === 'lessons' && type === 'UPDATE' && record.status === 'accepted' && oldRecord.status !== 'accepted') {
      // Le coach a ACCEPTÉ → prévenir l'ÉLÈVE (le terrain vient d'être réservé ; le club
      // recevra la notif « nouvelle réservation » via le webhook reservations, comme d'habitude).
      notifs.push({
        targets: await userToken(record.student_id),
        title: 'Cours accepté ✅',
        body: `${await userName(record.coach_id)} a accepté ton cours du ${record.date_label ?? record.date_key ?? ''} à ${record.time ?? ''} — terrain réservé.`,
        data: { kind: 'reservation' },
      });
    } else if (table === 'lessons' && type === 'UPDATE' && record.status === 'declined' && oldRecord.status === 'pending') {
      // Le coach a REFUSÉ → prévenir l'élève (aucun terrain n'a été réservé).
      // kind 'reservation' (→ « Mes réservations », où l'élève voit ses cours) : 'lesson'
      // routerait vers l'Espace Coach, verrouillé pour un simple joueur.
      notifs.push({
        targets: await userToken(record.student_id),
        title: 'Cours non disponible',
        body: `${await userName(record.coach_id)} ne peut pas assurer le cours du ${record.date_label ?? record.date_key ?? ''} à ${record.time ?? ''}. Aucun terrain n’a été réservé.`,
        data: { kind: 'reservation' },
      });
    } else if (table === 'lessons' && type === 'UPDATE' && record.status === 'cancelled' && oldRecord.status === 'accepted') {
      // La réservation née du cours n'a plus lieu (annulation de l'élève OU « pas venu »
      // marqué par le club — trigger lessons_follow_reservation) → prévenir le COACH.
      // Formulation NEUTRE : on ne sait pas ici lequel des deux cas s'est produit.
      notifs.push({
        targets: await userToken(record.coach_id),
        title: 'Cours annulé',
        body: `Le cours avec ${record.student_name ?? 'un joueur'} du ${record.date_label ?? record.date_key ?? ''} à ${record.time ?? ''} n’aura pas lieu — le créneau est libéré.`,
        data: { kind: 'lesson' },
      });
    } else if (table === 'lessons' && type === 'UPDATE' && record.status === 'cancelled' && oldRecord.status === 'pending') {
      // L'élève a retiré sa DEMANDE avant la réponse → petit mot au coach (sa liste se met à jour).
      notifs.push({
        targets: await userToken(record.coach_id),
        title: 'Demande de cours retirée',
        body: `${record.student_name ?? 'Un joueur'} a retiré sa demande du ${record.date_label ?? record.date_key ?? ''} à ${record.time ?? ''}.`,
        data: { kind: 'lesson' },
      });
    } else if (
      table === 'coaches' &&
      ((type === 'INSERT' && record.active === true) || (type === 'UPDATE' && record.active === true && oldRecord.active !== true))
    ) {
      // Un club vient de PROMOUVOIR (ou re-promouvoir) ce compte en coach → on le lui annonce,
      // sinon il ne découvre son Espace Coach que par hasard en rouvrant son profil.
      const { data: clubRow } = await supabase.from('clubs').select('name').eq('id', record.club_id).maybeSingle();
      notifs.push({
        targets: await userToken(record.user_id),
        title: 'Tu es maintenant coach 🎾',
        body: `${clubRow?.name ?? 'Ton club'} t’a déclaré coach — règle tes disponibilités dans ton Espace Coach.`,
        data: { kind: 'lesson' }, // route vers /coach-admin (même écran que les demandes de cours)
      });
    } else if (
      table === 'match_results' &&
      record.status === 'pending' &&
      (type === 'INSERT' || (type === 'UPDATE' && oldRecord.status !== 'pending'))
    ) {
      // SCORE DE MATCH saisi (46) — ou RESSAISI après contestation (UPDATE disputed → pending) :
      // prévenir les AUTRES joueurs du match pour qu'ils confirment (48 h avant auto-validation).
      const { data: resa } = await supabase
        .from('reservations')
        .select('user_id, club_name, date_label, time')
        .eq('id', record.reservation_id)
        .maybeSingle();
      const { data: parts } = await supabase
        .from('reservation_participants')
        .select('user_id, status')
        .eq('reservation_id', record.reservation_id);
      const others = [resa?.user_id, ...(parts ?? []).filter((p) => p.status === 'accepted').map((p) => p.user_id as string)].filter(
        (id): id is string => Boolean(id) && id !== record.submitted_by,
      );
      if (others.length > 0) {
        const { data: toks } = await supabase.from('profiles').select('expo_push_token').in('id', others);
        notifs.push({
          targets: (toks ?? []).map((t) => t.expo_push_token as string).filter(Boolean),
          title: 'Score à confirmer 🎾',
          body: `${await userName(record.submitted_by)} a noté le résultat de votre match du ${resa?.date_label ?? ''} à ${resa?.time ?? ''} (${resa?.club_name ?? ''}) — confirme-le dans Mes réservations.`,
          data: { kind: 'reservation', id: record.reservation_id },
        });
      }
    } else if (
      table === 'match_results' &&
      type === 'UPDATE' &&
      (record.status === 'confirmed' || record.status === 'disputed') &&
      oldRecord.status === 'pending'
    ) {
      // Verdict d'un joueur du match → prévenir celui qui avait SAISI le score.
      notifs.push({
        targets: await userToken(record.submitted_by),
        title: record.status === 'confirmed' ? 'Score confirmé ✅' : 'Score contesté',
        body:
          record.status === 'confirmed'
            ? 'Un joueur du match a confirmé le score — la victoire compte au classement.'
            : 'Un joueur du match a contesté le score — il ne comptera pas. Vous pouvez le ressaisir ensemble.',
        data: { kind: 'reservation', id: record.reservation_id },
      });
    }

    // Aplatis toutes les notifs en messages Expo (une entrée par destinataire).
    const messages = notifs.flatMap((n) =>
      n.targets.map((to) => ({ to, title: n.title, body: n.body, sound: 'default', ...(n.data ? { data: n.data } : {}) })),
    );
    if (messages.length === 0) return new Response('no targets', { status: 200 });

    const pushRes = await fetch(EXPO_PUSH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });

    // On LIT la réponse d'Expo : les jetons d'appareils désinstallés (DeviceNotRegistered) sont
    // purgés en base → on n'accumule pas de jetons morts et on cesse d'envoyer dans le vide.
    try {
      const json = await pushRes.json();
      const tickets = Array.isArray(json?.data) ? json.data : [];
      const dead: string[] = [];
      tickets.forEach((t: { status?: string; details?: { error?: string } }, i: number) => {
        if (t?.status === 'error' && t?.details?.error === 'DeviceNotRegistered' && messages[i]?.to) {
          dead.push(messages[i].to);
        }
      });
      if (dead.length > 0) {
        await supabase.from('profiles').update({ expo_push_token: null }).in('expo_push_token', dead);
      }
    } catch {
      // réponse illisible : on ignore (best-effort, ne bloque pas la fonction).
    }

    return new Response('ok', { status: 200 });
  } catch (e) {
    return new Response(`error: ${e}`, { status: 500 });
  }
});
