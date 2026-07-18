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
//   • match_results INSERT / UPDATE (une SAISIE de score par joueur, 46) → selon l'état du
//     match : « Score à saisir » aux autres joueurs (1ʳᵉ saisie), « Match validé » (saisies
//     concordantes) ou « Vos scores ne correspondent pas » (discordantes) aux autres saisisseurs.
//   • operator_news INSERT / UPDATE (47, si la case « push » était cochée et que l'actu change)
//     → notif de l'ACTU à tous les joueurs.
// L'envoi passe par l'API Push d'Expo (pas besoin de gérer APNs soi-même : Expo route vers
// Apple/Google). ⚠️ LES 8 WEBHOOKS doivent écouter INSERT **ET** UPDATE (corrigé en base le
// 2026-07-16 : `reservations` et `reservation_participants` avaient dérivé en INSERT-seul /
// UPDATE-seul) : reservations, reservation_participants, competitions, friend_requests, lessons,
// coaches, match_results, operator_news (cf. docs/PUSH-SETUP.md).
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
  data?: {
    kind: 'friend_request' | 'reservation' | 'club_reservation' | 'tournament' | 'club_tournament' | 'lesson' | 'news';
    id?: string;
  };
};

// Comparaison à temps CONSTANT du secret : un `!==` classique s'arrête au 1ᵉʳ caractère qui
// diffère → fuite d'information de timing. On XOR tous les octets pour ne pas trahir la position
// de la 1ʳᵉ différence. (Attaque peu praticable sur Internet, mais durcissement gratuit.)
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  if (ba.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < ba.length; i++) out |= ba[i] ^ bb[i];
  return out === 0;
}

Deno.serve(async (req) => {
  try {
    // Authenticité du webhook : si WEBHOOK_SECRET est configuré (variable d'env de la fonction),
    // on exige l'en-tête `x-webhook-secret` correspondant → refuse les appels arbitraires qui
    // pourraient déclencher des push. Tant que le secret n'est pas posé, comportement inchangé.
    const expectedSecret = Deno.env.get('WEBHOOK_SECRET');
    if (expectedSecret && !timingSafeEqual(req.headers.get('x-webhook-secret') ?? '', expectedSecret)) {
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

    // Jetons de push des gérants d'un club. Multi-clubs (55) : un compte gère PLUSIEURS clubs via
    // `manager_clubs` ; `managed_club_id` n'est que le club ACTIF. On notifie donc TOUS les gérants
    // dont la liste contient ce club (union avec `managed_club_id` pour couvrir les comptes mono-club
    // antérieurs à la 55, qui n'ont pas forcément d'entrée dans manager_clubs). Sans ça, un gérant
    // de A et B basculé sur B ne recevait plus aucune notif (réservation/annulation/tournoi) de A.
    const clubManagerTokens = async (clubId: string): Promise<string[]> => {
      const tokens = new Set<string>();
      const active = await supabase
        .from('profiles')
        .select('expo_push_token')
        .eq('managed_club_id', clubId)
        .not('expo_push_token', 'is', null);
      for (const m of active.data ?? []) if (m.expo_push_token) tokens.add(m.expo_push_token);
      const links = await supabase.from('manager_clubs').select('user_id').eq('club_id', clubId);
      const ids = (links.data ?? []).map((r: { user_id: string }) => r.user_id).filter(Boolean);
      if (ids.length) {
        const profs = await supabase.from('profiles').select('expo_push_token').in('id', ids).not('expo_push_token', 'is', null);
        for (const m of profs.data ?? []) if (m.expo_push_token) tokens.add(m.expo_push_token);
      }
      return [...tokens];
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
    } else if (
      table === 'reservations' &&
      type === 'UPDATE' &&
      record.club_confirmed === true &&
      oldRecord.club_confirmed !== true &&
      record.status === 'booked'
    ) {
      // Le club vient de CONFIRMER la réservation → prévenir le joueur (auteur). Garde status='booked'
      // (le webhook écoute désormais TOUT UPDATE) : on ne dit jamais « confirmée » sur une résa annulée.
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
    } else if (table === 'reservations' && type === 'UPDATE' && record.status === 'club_cancelled' && oldRecord.status === 'booked') {
      // Le CLUB vient d'annuler la réservation (75) car le créneau chevauche une réservation prise
      // HORS APP → prévenir le joueur (auteur) + les participants, avec le motif et, si le club en a
      // proposé une, l'alternative (jour/heure/terrain). Tap sur la notif → « Mes réservations ».
      const reasonPart = record.cancel_reason ? ` Motif : ${record.cancel_reason}.` : '';
      const proposalPart = record.proposed_time
        ? ` Le club te propose le ${record.proposed_date_key ?? record.date_label ?? ''} à ${record.proposed_time}${record.proposed_court ? ` (${record.proposed_court})` : ''}.`
        : ' Ouvre l’app pour choisir un autre créneau.';
      const cancelBody = `${record.club_name ?? 'Le club'} a annulé ton créneau du ${record.date_label ?? ''} à ${record.time ?? ''} (chevauchement avec une réservation hors app).${reasonPart}${proposalPart}`;
      notifs.push({
        targets: await userToken(record.user_id),
        title: 'Créneau annulé par le club',
        body: cancelBody,
        data: { kind: 'reservation', id: record.id },
      });
      // Participants (amis invités / match ouvert) : prévenus eux aussi que le créneau saute, mais
      // avec un texte NEUTRE — la proposition d'alternative et « ton créneau » ne s'adressent qu'à
      // l'AUTEUR (c'est lui qui re-réserve pour le groupe). Dire « le club te propose » à un invité
      // serait faux (le créneau de courtoisie ne lui est pas destiné).
      const { data: cparts } = await supabase.from('reservation_participants').select('user_id, status').eq('reservation_id', record.id);
      const cpartIds = (cparts ?? []).filter((p) => p.status !== 'declined').map((p) => p.user_id as string);
      if (cpartIds.length > 0) {
        const { data: toks } = await supabase.from('profiles').select('expo_push_token').in('id', cpartIds);
        notifs.push({
          targets: (toks ?? []).map((t) => t.expo_push_token as string).filter(Boolean),
          title: 'Match annulé par le club',
          // Sans le MOTIF libre : il peut nommer un tiers (« M. X a réservé au téléphone ») et ne
          // regarde que l'auteur de la résa — un participant n'a pas à le recevoir (confidentialité).
          body: `${record.club_name ?? 'Le club'} a annulé le créneau du ${record.date_label ?? ''} à ${record.time ?? ''} (chevauchement avec une réservation hors application).`,
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
      // MATCH OUVERT : un joueur qui re-rejoint après avoir quitté passe aussi par cette
      // transition (upsert declined → accepted) — le texte « invitation » serait faux pour un
      // inconnu qui rejoint : on adapte au type de réservation.
      const { data: resa } = await supabase
        .from('reservations')
        .select('user_id, open_match, club_name, date_label, time')
        .eq('id', record.reservation_id)
        .maybeSingle();
      notifs.push({
        targets: await userToken(resa?.user_id ?? ''),
        title: resa?.open_match ? 'Un joueur a rejoint ton match 🎾' : 'Invitation acceptée ✅',
        body: resa?.open_match
          ? `${await userName(record.user_id)} a rejoint ton match du ${resa?.date_label ?? ''} à ${resa?.time ?? ''} (${resa?.club_name ?? ''}).`
          : 'Un ami a accepté de jouer avec toi.',
        data: { kind: 'reservation', id: record.reservation_id },
      });
    } else if (
      table === 'reservation_participants' &&
      type === 'UPDATE' &&
      record.status === 'declined' &&
      oldRecord.status === 'accepted'
    ) {
      // Un joueur QUITTE un match ouvert (leave_open_match → declined) → prévenir le créateur :
      // une place se relibère, il peut chercher quelqu'un d'autre. (Un simple refus d'invitation
      // part de 'invited', pas de 'accepted' — cette branche ne concerne que les départs réels.)
      const { data: resa } = await supabase
        .from('reservations')
        .select('user_id, open_match, club_name, date_label, time')
        .eq('id', record.reservation_id)
        .maybeSingle();
      if (resa?.open_match) {
        notifs.push({
          targets: await userToken(resa?.user_id ?? ''),
          title: 'Un joueur a quitté ton match',
          body: `${await userName(record.user_id)} a quitté ton match du ${resa?.date_label ?? ''} à ${resa?.time ?? ''} (${resa?.club_name ?? ''}) — une place se libère.`,
          data: { kind: 'reservation', id: record.reservation_id },
        });
      }
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
      // dans le flou). Le MOTIF laissé par le club (52) est joint : il sait quoi changer.
      const reason =
        typeof record.reject_reason === 'string' && record.reject_reason.trim() ? ` Motif : ${record.reject_reason.trim()}` : '';
      notifs.push({
        targets: await userToken(record.organizer_id),
        title: 'Tournoi non retenu',
        body: `${record.club_name ?? 'Le club'} n'a pas retenu ton tournoi « ${record.title ?? ''} ».${reason}`,
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
      // Cours refusé → prévenir l'élève (aucun terrain n'a été réservé). Formulation NEUTRE :
      // le refus peut venir du coach comme d'un conflit de créneau (terrain pris entre-temps,
      // horaire/période fermé par le club — respond_lesson refuse alors 'conflict') ; accuser
      // le coach serait faux dans ces cas-là.
      // kind 'reservation' (→ « Mes réservations », où l'élève voit ses cours) : 'lesson'
      // routerait vers l'Espace Coach, verrouillé pour un simple joueur.
      notifs.push({
        targets: await userToken(record.student_id),
        title: 'Cours non disponible',
        body: `Le cours du ${record.date_label ?? record.date_key ?? ''} à ${record.time ?? ''} n’a pas pu être confirmé. Aucun terrain n’a été réservé — choisis un autre créneau.`,
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
      // Les 9 clubs FONDATEURS ne sont pas dans la table `clubs` (embarqués dans l'app) : on
      // garde leur nom ici pour ne pas dire « Ton club » (miroir de src/data/clubs.ts).
      const FOUNDER_NAMES: Record<string, string> = {
        'abidjan-padel': 'Abidjan Padel',
        'district-club': 'District Club',
        'elite-club': 'Elite Club',
        'ivoire-padel': 'Ivoire Padel Club',
        'padel-magic': 'Padel Magic',
        'padel-palmeraie': 'Padel Palmeraie',
        'padel-zone-4': 'Padel Zone 4',
        padelta: 'Padelta',
        padelhouse: 'PadelHouse',
      };
      const { data: clubRow } = await supabase.from('clubs').select('name').eq('id', record.club_id).maybeSingle();
      const promoClub = clubRow?.name ?? FOUNDER_NAMES[record.club_id as string] ?? 'Ton club';
      notifs.push({
        targets: await userToken(record.user_id),
        title: 'Tu es maintenant coach 🎾',
        body: `${promoClub} t’a déclaré coach — règle tes disponibilités dans ton Espace Coach.`,
        data: { kind: 'lesson' }, // route vers /coach-admin (même écran que les demandes de cours)
      });
    } else if (table === 'match_results' && (type === 'INSERT' || type === 'UPDATE')) {
      // SCORE DE MATCH (46/48) : chaque joueur saisit ses sets ; l'app valide quand un CAMP
      // gagnant et un CAMP perdant s'accordent sur le score (règle serveur, cf. 48). On ne
      // notifie que sur les vraies TRANSITIONS (sinon 3ᵉ/4ᵉ saisie et re-soumissions spamment) :
      //   • bascule vers « validé »   → « Match validé » aux autres saisisseurs ;
      //   • bascule vers « discordant » → « Vos scores ne correspondent pas » aux autres saisisseurs ;
      //   • toute PREMIÈRE saisie d'un match → « Score à saisir » aux joueurs qui n'ont pas saisi.
      // Re-soumission à l'identique (canon + i_won inchangés) : on ne fait rien.
      if (type === 'UPDATE' && record.canon === oldRecord.canon && record.i_won === oldRecord.i_won) {
        // saisie inchangée → aucun push
      } else {
        const { data: resa } = await supabase
          .from('reservations')
          .select('user_id, club_name, date_label, time')
          .eq('id', record.reservation_id)
          .maybeSingle();
        const { data: entries } = await supabase
          .from('match_results')
          .select('user_id, canon, i_won')
          .eq('reservation_id', record.reservation_id);
        const all = (entries ?? []) as { user_id: string; canon: string; i_won: boolean }[];
        // Joueurs identifiés (créateur + participants 'accepted') → vainqueurs légitimes max =
        // least(2, joueurs-1), STRICTEMENT comme la SQL 49 (le commentaire « floor(joueurs/2) »
        // était une règle d'avant l'audit 7). Chargé une fois, réutilisé plus bas.
        const { data: parts } = await supabase
          .from('reservation_participants')
          .select('user_id, status')
          .eq('reservation_id', record.reservation_id);
        const acceptedParts = (parts ?? []).filter((p) => p.status === 'accepted');
        // Vainqueurs max = least(2, comptes-1), STRICTEMENT comme la SQL 49 (padel : 2 au plus,
        // jamais tous les comptes — un 2v2 où seuls 3 joueurs ont l'app garde ses 2 « je gagne »).
        const wn = Math.min(2, acceptedParts.length);
        const when = `du ${resa?.date_label ?? ''} à ${resa?.time ?? ''} (${resa?.club_name ?? ''})`;
        const otherEntrants = all.map((e) => e.user_id).filter((id) => id !== record.user_id);
        // Classe un ensemble de saisies (même règle que la SQL 49) : validé = 1 canon, 1 ≤ « je
        // gagne » ≤ floor(joueurs/2), ET au moins un « je perds » (le camp perdant reconnaît). La
        // porte « saisie unique à 48 h » n'est PAS déclenchée par un webhook (aucune écriture à
        // T+48 h) — on ne notifie donc « validé » que via le miroir perdant, jamais deux « je
        // gagne » seuls (anti-triche §9, aligné sur submit_match_score).
        const classify = (es: { canon: string; i_won: boolean }[]) => {
          const canons = new Set(es.map((e) => e.canon));
          const w = es.filter((e) => e.i_won).length;
          const l = es.filter((e) => !e.i_won).length;
          const conflict = canons.size > 1 || w > wn;
          return { conflict, validated: !conflict && canons.size === 1 && w >= 1 && w <= wn && l >= 1, n: es.length };
        };
        // État AVANT cette écriture : on retire (INSERT) ou on restaure (UPDATE) la ligne de ce joueur.
        const before =
          type === 'UPDATE'
            ? all.map((e) => (e.user_id === record.user_id ? { canon: oldRecord.canon, i_won: oldRecord.i_won } : e))
            : all.filter((e) => e.user_id !== record.user_id);
        const after = classify(all);
        const prev = classify(before);
        const tokensFor = async (ids: string[]) => {
          if (ids.length === 0) return [] as string[];
          const { data: toks } = await supabase.from('profiles').select('expo_push_token').in('id', ids);
          return (toks ?? []).map((t) => t.expo_push_token as string).filter(Boolean);
        };
        if (after.validated && !prev.validated) {
          notifs.push({
            targets: await tokensFor(otherEntrants),
            title: 'Match validé ✅',
            body: `Le score de votre match ${when} concorde (${record.canon ?? ''}) — il compte au classement.`,
            data: { kind: 'reservation', id: record.reservation_id },
          });
        } else if (after.conflict && !prev.conflict) {
          notifs.push({
            targets: await tokensFor(otherEntrants),
            title: 'Vos scores ne correspondent pas 🤔',
            body: `Le score saisi pour votre match ${when} diffère du tien — vérifiez ensemble dans Mes réservations.`,
            data: { kind: 'reservation', id: record.reservation_id },
          });
        } else if (after.n === 1 && prev.n === 0) {
          // VRAIE première saisie du match (cette écriture a créé la 1ʳᵉ entrée) → inviter les
          // AUTRES joueurs à saisir. Le test prev.n === 0 évite de re-pousser « Score à saisir »
          // quand l'unique saisisseur CORRIGE simplement son score (before garde sa ligne, n=1).
          const others = [resa?.user_id, ...acceptedParts.map((p) => p.user_id as string)].filter(
            (id): id is string => Boolean(id) && id !== record.user_id,
          );
          notifs.push({
            targets: await tokensFor(others),
            title: 'Score à saisir 🎾',
            body: `${await userName(record.user_id)} a mis le score de votre match ${when} — saisis le tien pour le valider.`,
            data: { kind: 'reservation', id: record.reservation_id },
          });
        }
      }
    } else if (
      table === 'operator_news' &&
      record.push === true &&
      (type === 'INSERT' || (type === 'UPDATE' && (record.news_id !== oldRecord.news_id || oldRecord.push !== true)))
    ) {
      // ACTU opérateur publiée AVEC la case « Envoyer une notification » cochée (47) → push à
      // TOUS les joueurs. Garde anti-doublon : on n'envoie que si l'actu change réellement
      // (nouvel id) ou si le push vient d'être activé — jamais deux fois la même.
      //
      // SÉCURITÉ (anti-phishing) : le titre/sous-titre proviennent de la BASE (relecture par
      // key='home'), jamais des champs `record` du payload. Un appel forgé (quiconque possède
      // la clé anon publique) ne peut donc PAS injecter un texte de phishing dans un push de
      // masse — au pire il rejoue la dernière actu réellement publiée. On vérifie aussi que
      // l'actu en base porte bien push=true et le même news_id que le webhook.
      const { data: live } = await supabase.from('operator_news').select('news_id, title, subtitle, push').eq('key', 'home').maybeSingle();
      if (live && live.push === true && live.news_id === record.news_id) {
        // TOUS les comptes (joueurs, gérants ET opérateur) : le bandeau d'accueil est visible par
        // tous, et l'opérateur reçoit ainsi sa propre actu — c'est sa confirmation d'envoi (sinon
        // il publie et ne voit jamais rien partir sur SON téléphone).
        const { data: players } = await supabase.from('profiles').select('expo_push_token').not('expo_push_token', 'is', null);
        notifs.push({
          targets: (players ?? []).map((t) => t.expo_push_token as string).filter(Boolean),
          title: live.title ?? 'Actu PadelConnect 📣',
          body: live.subtitle ?? 'Ouvre l’app pour découvrir la nouveauté.',
          data: { kind: 'news' },
        });
      }
    }

    // Aplatis toutes les notifs en messages Expo (une entrée par destinataire).
    const messages = notifs.flatMap((n) =>
      n.targets.map((to) => ({ to, title: n.title, body: n.body, sound: 'default', ...(n.data ? { data: n.data } : {}) })),
    );
    if (messages.length === 0) return new Response('no targets', { status: 200 });

    // Expo REFUSE un lot de plus de 100 notifications (PUSH_TOO_MANY_NOTIFICATIONS) : un push
    // d'actu à tous les joueurs (47) échouerait en bloc. On envoie par tranches de 100 et on
    // agrège les tickets (index aligné sur `messages`) pour purger les jetons morts ensuite.
    const CHUNK = 100;
    const tickets: { status?: string; details?: { error?: string } }[] = [];
    for (let i = 0; i < messages.length; i += CHUNK) {
      const slice = messages.slice(i, i + CHUNK);
      try {
        const pushRes = await fetch(EXPO_PUSH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(slice),
        });
        const json = await pushRes.json();
        const data = Array.isArray(json?.data) ? json.data : [];
        // Réaligne : une tranche sans `data` (erreur) laisse des trous → on comble pour garder
        // l'index messages[i] ↔ tickets[i] exact lors de la purge DeviceNotRegistered.
        for (let j = 0; j < slice.length; j++) tickets.push(data[j] ?? {});
      } catch {
        for (let j = 0; j < slice.length; j++) tickets.push({});
      }
    }

    // Jetons d'appareils désinstallés (DeviceNotRegistered) → purgés en base (on cesse d'envoyer
    // dans le vide et on n'accumule pas de jetons morts).
    const dead: string[] = [];
    tickets.forEach((t, i) => {
      if (t?.status === 'error' && t?.details?.error === 'DeviceNotRegistered' && messages[i]?.to) {
        dead.push(messages[i].to);
      }
    });
    if (dead.length > 0) {
      await supabase.from('profiles').update({ expo_push_token: null }).in('expo_push_token', dead);
    }

    return new Response('ok', { status: 200 });
  } catch (e) {
    return new Response(`error: ${e}`, { status: 500 });
  }
});
