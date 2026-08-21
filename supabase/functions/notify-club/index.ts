// PadelConnect — Edge Function « notify-club » (Supabase Functions, runtime Deno).
// Déclenchée par des Database Webhooks. Cas gérés :
//   • reservations INSERT  → notif au(x) GÉRANT(s) du club (nouvelle réservation).
//   • reservations UPDATE (club_confirmed passe à true) → notif au JOUEUR (résa confirmée).
//   • reservations UPDATE (status → cancelled, depuis 'booked') → notif au(x) GÉRANT(s) du club
//     (le joueur a annulé — terrain à libérer côté préparation).
//   • reservation_participants INSERT → notif à l'AMI INVITÉ (nouvelle invitation à jouer).
//   • reservation_participants UPDATE (accepted) → notif à l'AUTEUR (un invité a accepté).
//   • reservation_participants UPDATE (accepted → declined) → notif à l'AUTEUR d'un MATCH OUVERT
//     (un joueur a quitté ton match — une place se relibère).
//   • competitions INSERT (tournoi JOUEUR en attente) → notif au(x) gérant(s) du club hôte (à valider).
//   • competitions UPDATE (pending → published) → notif à l'ORGANISATEUR (tournoi validé) ET, si
//     frais > 0, à l'OPÉRATEUR (« frais à encaisser ») — donc seulement après validation du club.
//   • competitions UPDATE (pending → rejected) → notif à l'ORGANISATEUR (tournoi refusé).
//   • friend_requests INSERT (pending) → notif au DESTINATAIRE (nouvelle demande d'ami).
//   • friend_requests UPDATE (→ pending) → notif au DESTINATAIRE (demande RENVOYÉE après un refus :
//     send_friend_request fait un UPDATE on conflict, pas un INSERT).
//   • friend_requests UPDATE (→ accepted) → notif à l'EXPÉDITEUR (demande acceptée).
//   • lessons INSERT (pending) → notif au COACH (nouvelle demande de cours).
//   • lessons UPDATE (pending → accepted) → notif à l'ÉLÈVE (cours accepté, terrain réservé) — le
//     club reçoit la notif « nouvelle réservation » via le webhook reservations, automatiquement.
//   • lessons UPDATE (cancelled → accepted) → RÉTABLISSEMENT (85 C3, un « pas venu » dé-marqué) :
//     texte « cours rétabli » dédié (jamais « accepté ») — COACH (parité avec l'annulation) +
//     l'élève, ou les élèves inscrits si cours collectif.
//   • lessons UPDATE (→ declined) → notif à l'ÉLÈVE (cours refusé, aucun terrain réservé).
//   • lessons UPDATE (pending → cancelled) → notif au COACH (l'élève a retiré sa demande).
//   • reservations UPDATE (no_show → booked, 87 « Annuler l'absence ») → « Réservation rétablie »
//     au JOUEUR — résa SIMPLE seulement (un cours passe par la branche lessons, pas de doublon).
//   • match_results INSERT / UPDATE (une SAISIE de score par joueur, 46) → selon l'état du
//     match : « Score à saisir » aux autres joueurs (1ʳᵉ saisie), « Match validé » (saisies
//     concordantes) ou « Vos scores ne correspondent pas » (discordantes) aux autres saisisseurs.
//   • operator_news INSERT / UPDATE (47, si la case « push » était cochée et que l'actu change)
//     → notif de l'ACTU à tous les joueurs.
//   • reservations INSERT d'un match OUVERT (80/81) → deux branches best-effort en plus de la
//     notif gérant : « partenaire suivi » aux joueurs qui ont mis le créateur en FAVORI, puis
//     « un match à ton niveau vient d'ouvrir » aux SUIVEURS du club (match_alerts + fourchette).
//   • reservations UPDATE (status → cancelled JOUEUR uniquement) → alerte LISTE D'ATTENTE (81)
//     aux inscrits dont l'attente chevauche le créneau libéré (one-shot). PAS sur club_cancelled :
//     l'annulation club re-bloque le créneau (75), il n'est jamais réellement libéré.
//   • events INSERT — ou UPDATE qui vient d'ACTIVER le push — (82, agenda du padel) →
//     broadcast à tous les comptes (anti-doublon : un événement déjà poussé ne repart pas).
//   • club_news INSERT (83, si « push » coché) → annonce du club à ses SUIVEURS (club_followers).
//   • share_payments INSERT (declared) → « part déclarée payée » au CRÉATEUR de la résa ;
//     UPDATE (→ confirmed) → « ta part est confirmée » au PAYEUR.
//   • lessons UPDATE (→ cancelled, capacity > 1) → en plus du coach, les ÉLÈVES inscrits
//     (lesson_students) sont prévenus que le cours collectif saute.
// L'envoi passe par l'API Push d'Expo (pas besoin de gérer APNs soi-même : Expo route vers
// Apple/Google). ⚠️ LES 11 WEBHOOKS doivent écouter INSERT **ET** UPDATE (corrigé en base le
// 2026-07-16 : `reservations` et `reservation_participants` avaient dérivé en INSERT-seul /
// UPDATE-seul), SAUF `club_news` (INSERT seul, décision assumée — le push ne part qu'à la
// création d'une annonce) : reservations, reservation_participants, competitions,
// friend_requests, lessons, coaches, match_results, operator_news, events, club_news,
// share_payments (cf. docs/PUSH-SETUP.md).
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
    kind:
      | 'friend_request'
      | 'reservation'
      | 'club_reservation'
      | 'tournament'
      | 'club_tournament'
      | 'lesson'
      | 'news'
      | 'open_match'
      | 'waitlist'
      | 'event'
      | 'club_news';
    id?: string;
    clubId?: string;
    dateKey?: string;
    time?: string; // le routeur client (notifications.ts) l'attend en string (query param du tunnel)
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
    // TOUS les jetons de push (broadcast actu opérateur / agenda), PAGINÉ : PostgREST plafonne
    // toute requête à `db-max-rows` (défaut 1000) → au-delà de 1000 comptes, un simple select
    // n'enverrait qu'aux 1000 premières lignes, dans un ordre arbitraire, SANS erreur. On boucle
    // par pages de 1000 (tri par id stable) jusqu'à épuisement.
    const allPlayerTokens = async (): Promise<string[]> => {
      const out: string[] = [];
      const PAGE = 1000;
      for (let page = 0; ; page++) {
        const { data, error } = await supabase
          .from('profiles')
          .select('expo_push_token')
          .not('expo_push_token', 'is', null)
          .order('id', { ascending: true })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) break;
        const batch = (data ?? []) as { expo_push_token: string }[];
        for (const t of batch) if (t.expo_push_token) out.push(t.expo_push_token);
        if (batch.length < PAGE) break; // dernière page atteinte
        if (page > 100) break; // garde-fou dur (~102 000 comptes) — jamais une boucle infinie
      }
      return out;
    };
    // Nom affiché d'un utilisateur (prénom + nom) — pour personnaliser une notif sociale.
    const userName = async (userId: string): Promise<string> => {
      if (!userId) return 'Un joueur';
      const { data } = await supabase.from('profiles').select('first_name, last_name').eq('id', userId).maybeSingle();
      const name = `${data?.first_name ?? ''} ${data?.last_name ?? ''}`.trim();
      return name || 'Un joueur';
    };
    // Nom affiché d'un club. Les 9 clubs FONDATEURS ne sont pas dans la table `clubs`
    // (embarqués dans l'app) : miroir de src/data/clubs.ts pour ne pas dire « Ton club ».
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
    const clubName = async (clubId: string): Promise<string> => {
      const { data } = await supabase.from('clubs').select('name').eq('id', clubId).maybeSingle();
      return data?.name ?? FOUNDER_NAMES[clubId] ?? 'Ton club';
    };
    // LISTE D'ATTENTE (81) : un créneau vient de se LIBÉRER (annulation JOUEUR uniquement —
    // une annulation CLUB re-bloque le créneau, cf. branche club_cancelled) → notifier les
    // inscrits dont l'attente CHEVAUCHE l'intervalle libéré (même arithmétique demi-ouverte
    // [t, t+d) que la dispo). One-shot HONNÊTE : seules les entrées des joueurs qui ONT un
    // jeton push sont consommées — et seulement APRÈS l'envoi Expo (via waitlistConsumed) ;
    // un joueur sans jeton (ou un envoi en échec) garde son alerte pour la prochaine libération.
    // Jamais d'exception : un échec ici ne doit pas casser les pushes d'annulation.
    const toMin = (t: string): number => {
      const [h, m] = String(t ?? '')
        .split(':')
        .map(Number);
      return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
    };
    const waitlistAlerts = async (rec: Record<string, unknown>): Promise<Notif[]> => {
      try {
        const clubId = rec.club_id as string;
        const dateKey = rec.date_key as string;
        const start = toMin(rec.time as string);
        const dur = Number(rec.duration_min ?? 90);
        if (!clubId || !dateKey || !Number.isFinite(start)) return [];
        // Borné À LA SOURCE (récence) : le nombre d'inscrits DISTINCTS sur un club/jour n'est
        // pas plafonné côté serveur (81 borne par joueur, pas par créneau) — sans limit, un
        // `in(...)` sur des centaines d'ids exploserait l'URL PostgREST → 0 alerte silencieuse.
        const { data: waits } = await supabase
          .from('slot_waitlist')
          .select('id, user_id, time, duration_min')
          .eq('club_id', clubId)
          .eq('date_key', dateKey)
          .order('created_at', { ascending: false })
          .limit(200);
        const hits = (waits ?? []).filter((w) => {
          const ws = toMin(w.time as string);
          const wd = Number(w.duration_min ?? 90);
          return Number.isFinite(ws) && ws < start + dur && start < ws + wd; // chevauchement [t, t+d)
        });
        const userIds = [...new Set(hits.map((w) => w.user_id as string))].filter((id) => id && id !== rec.user_id);
        if (!userIds.length) return [];
        // Jetons relus par TRANCHES de 100 ids (idiome club_news) — jamais un in() géant.
        const tokenByUser = new Map<string, string>();
        const targets: string[] = [];
        for (let i = 0; i < userIds.length; i += 100) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, expo_push_token')
            .in('id', userIds.slice(i, i + 100))
            .not('expo_push_token', 'is', null);
          for (const p of profs ?? []) {
            if (p.expo_push_token) {
              tokenByUser.set(p.id as string, p.expo_push_token as string);
              targets.push(p.expo_push_token as string);
            }
          }
        }
        if (!targets.length) return [];
        // Consommation DIFFÉRÉE + PAR CIBLE : chaque entrée porte son jeton ; à la fin, seules
        // celles dont le jeton a reçu un ticket Expo 'ok' sont supprimées (one-shot honnête —
        // un joueur dont l'envoi a échoué garde son alerte, cf. bloc de purge en fin de handler).
        for (const w of hits) {
          const tok = tokenByUser.get(w.user_id as string);
          if (tok) waitlistConsumed.push({ id: w.id as string, token: tok });
        }
        return [
          {
            targets,
            title: 'Un créneau s’est libéré 🏃',
            body: `${rec.club_name ?? 'Le club'} — ${rec.date_label ?? ''} à ${rec.time ?? ''} : fonce, premier arrivé premier servi.`,
            data: { kind: 'waitlist', clubId, dateKey, time: String(rec.time ?? '') },
          },
        ];
      } catch {
        return []; // best-effort : jamais bloquer la branche d'annulation
      }
    };

    const notifs: Notif[] = [];
    // Entrées de liste d'attente à supprimer APRÈS un envoi Expo réussi (alerte one-shot honnête).
    // On garde le jeton de chaque entrée pour ne consommer que celles réellement notifiées ('ok').
    const waitlistConsumed: { id: string; token: string }[] = [];

    if (table === 'reservations' && type === 'INSERT') {
      // Nouvelle réservation (INSERT uniquement — jamais un DELETE) → prévenir le(s) gérant(s).
      notifs.push({
        targets: await clubManagerTokens(record.club_id),
        title: 'Nouvelle réservation 🎾',
        body: `${record.booked_by_name ?? 'Un joueur'} — ${record.club_name ?? ''} · ${record.date_label ?? ''} à ${record.time ?? ''} (${record.court ?? ''}).`,
        data: { kind: 'club_reservation', id: record.id },
      });
      // Lecture UNIQUE des favoris du créateur, PARTAGÉE par les deux branches « match ouvert »
      // ci-dessous (push favoris + alerte niveau) : deux lectures séparées de favorite_players
      // n'étaient pas atomiques → si un favori changeait entre les deux (ou égalité de created_at à
      // la frontière du 100ᵉ), la fenêtre glissait et un joueur déjà notifié « partenaire suivi »
      // pouvait recevoir EN PLUS « match à ton niveau » (doublon). Les 100 plus récents servent de
      // CIBLES au push favoris ET de dédup à l'alerte. null = lecture en échec (le push favoris ne
      // part pas → l'alerte n'a alors RIEN à dédupliquer, donc aucun doublon possible non plus).
      let favFanIds: string[] | null = null;
      if (record.open_match === true && record.user_id) {
        const { data: favData, error: favErr } = await supabase
          .from('favorite_players')
          .select('user_id')
          .eq('fav_user_id', record.user_id)
          .order('created_at', { ascending: false })
          .limit(100);
        favFanIds = favErr ? null : (favData ?? []).map((f: { user_id: string }) => f.user_id).filter(Boolean);
      }
      // JOUEURS FAVORIS (80) : match OUVERT créé → prévenir ceux qui SUIVENT le créateur
      // (« ton partenaire habituel a créé un match »). Blocages exclus dans les deux sens.
      // best-effort (try/catch) : une panne ici ne doit pas empêcher la notif GÉRANT déjà empilée.
      if (record.open_match === true && record.user_id && favFanIds && favFanIds.length) {
        try {
          let fanIds = favFanIds.slice();
          if (fanIds.length) {
            // FAIL-CLOSED (§8) : si la lecture des blocages ÉCHOUE, on abandonne ce push facultatif
            // plutôt que de notifier peut-être un compte bloqué (harcèlement). null ≠ [] : un [] est
            // une absence réelle de blocage, un échec (error) ferme la branche.
            const { data: blocks, error: blkErr } = await supabase
              .from('blocked_users')
              .select('blocker_id, blocked_id')
              .or(`blocker_id.eq.${record.user_id},blocked_id.eq.${record.user_id}`);
            if (!blkErr && blocks) {
              const excluded = new Set(blocks.flatMap((b: { blocker_id: string; blocked_id: string }) => [b.blocker_id, b.blocked_id]));
              fanIds = fanIds.filter((id: string) => !excluded.has(id));
              if (fanIds.length) {
                const { data: profs } = await supabase
                  .from('profiles')
                  .select('expo_push_token')
                  .in('id', fanIds.slice(0, 100))
                  .not('expo_push_token', 'is', null);
                const targets = (profs ?? []).map((p: { expo_push_token: string }) => p.expo_push_token).filter(Boolean);
                if (targets.length) {
                  notifs.push({
                    targets,
                    title: 'Ton partenaire habituel a créé un match 🎾',
                    body: `${record.booked_by_name ?? 'Un joueur'} — ${record.club_name ?? ''} · ${record.date_label ?? ''} à ${record.time ?? ''}.`,
                    data: { kind: 'open_match', id: record.id },
                  });
                }
              }
            }
          }
        } catch {
          // best-effort : le push « partenaire suivi » ne doit jamais casser la notif gérant
        }
      }
      // ALERTES « un match à ton niveau vient d'ouvrir » (81) : suiveurs du CLUB ayant activé
      // match_alerts, niveau dans la fourchette du match (fourchette absente = tous niveaux),
      // hors créateur / bloqués / déjà notifiés « partenaire suivi ». PLAFOND 100 appliqué À LA
      // SOURCE (tri par récence de follow) : sans le limit(), un club à milliers de suiveurs
      // ferait exploser l'URL du `in(...)` PostgREST → requête en échec → plus aucune alerte.
      if (record.open_match === true && record.user_id && record.club_id) {
        try {
          // Dédup vs le push favoris via la lecture UNIQUE partagée `favFanIds` (plus de 2ᵉ lecture
          // non atomique → plus de fenêtre de course qui dupliquait l'alerte). null = favoris non lu
          // → le push favoris n'est pas parti, donc `already` vide et AUCUN doublon possible.
          const already = new Set<string>(favFanIds ?? []);
          // FAIL-CLOSED (§8) : un ÉCHEC de lecture des blocages abandonne l'alerte (ne jamais
          // notifier un bloqué). null (error) ≠ [] (aucun blocage réel).
          const { data: blocks, error: blkErr } = await supabase
            .from('blocked_users')
            .select('blocker_id, blocked_id')
            .or(`blocker_id.eq.${record.user_id},blocked_id.eq.${record.user_id}`);
          if (blkErr || !blocks) throw new Error('blocked_users read failed — fail closed');
          const blocked = new Set(blocks.flatMap((b: { blocker_id: string; blocked_id: string }) => [b.blocker_id, b.blocked_id]));
          const { data: fols } = await supabase
            .from('club_followers')
            .select('user_id')
            .eq('club_id', record.club_id)
            .order('created_at', { ascending: false })
            .limit(100);
          let ids = [...new Set((fols ?? []).map((f: { user_id: string }) => f.user_id))].filter(
            (id) => id && id !== record.user_id && !already.has(id) && !blocked.has(id),
          );
          if (ids.length) {
            const { data: profs } = await supabase
              .from('profiles')
              .select('id, expo_push_token, level, match_alerts')
              .in('id', ids)
              .eq('match_alerts', true)
              .not('expo_push_token', 'is', null);
            const lo = record.open_level_min == null ? null : Number(record.open_level_min);
            const hi = record.open_level_max == null ? null : Number(record.open_level_max);
            const eligible = (profs ?? []).filter((p: { level: number }) => {
              const lv = Number(p.level ?? 0);
              return (lo == null || lv >= lo) && (hi == null || lv <= hi);
            });
            const targets = eligible
              .slice(0, 100)
              .map((p: { expo_push_token: string }) => p.expo_push_token)
              .filter(Boolean);
            if (targets.length) {
              const range = lo != null || hi != null ? ` · niveau ${lo ?? '≤'}${lo != null && hi != null ? '–' : ''}${hi ?? '+'}` : '';
              notifs.push({
                targets,
                title: 'Un match à ton niveau vient d’ouvrir 🎾',
                body: `${record.club_name ?? ''} · ${record.date_label ?? ''} à ${record.time ?? ''}${range}.`,
                data: { kind: 'open_match', id: record.id },
              });
            }
          }
        } catch {
          // best-effort : l'alerte ne doit jamais casser la notif gérant
        }
      }
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
        body: `${record.booked_by_name ?? 'Un joueur'} a annulé son créneau du ${record.date_label ?? ''} à ${record.time ?? ''} (${record.court ?? ''} · ${record.club_name ?? ''}).`,
        data: { kind: 'club_reservation', id: record.id },
      });
      notifs.push(...(await waitlistAlerts(record)));
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
      // ⚠️ PAS d'alerte liste d'attente ici : une annulation CLUB (75) re-bloque immédiatement le
      // créneau d'origine (occupé hors app) — il ne redevient PAS réservable, pousser « fonce »
      // serait un mensonge. Seule l'annulation JOUEUR (ci-dessus) libère réellement le créneau.
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
    } else if (table === 'reservations' && type === 'UPDATE' && record.status === 'booked' && oldRecord.status === 'no_show') {
      // ABSENCE ANNULÉE par le club (87, « Annuler l'absence ») : la résa revit. Pour un COURS,
      // la branche lessons (v45, cancelled→accepted) prévient déjà élève(s) + coach — on ne
      // double-notifie pas ; ce push ne couvre que la RÉSA SIMPLE (aucune lesson rattachée).
      const { data: linked, error: linkErr } = await supabase.from('lessons').select('id').eq('reservation_id', record.id).limit(1);
      // FAIL-CLOSED (idiome §8) : si on ne peut PAS savoir si un cours est rattaché, on n'envoie
      // PAS — sinon un cours rétabli recevait CE push EN DOUBLON du « Cours rétabli » (branche lessons).
      if (!linkErr && !(linked ?? []).length) {
        notifs.push({
          targets: await userToken(record.user_id),
          title: 'Réservation rétablie ✅',
          body: `Ton créneau du ${record.date_label ?? record.date_key ?? ''} à ${record.time ?? ''} (${record.club_name ?? ''}) est de nouveau réservé — l'absence a été annulée.`,
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
        body: `${record.organizer_name ?? 'Un joueur'} propose « ${record.title ?? ''} » (${record.club_name ?? ''}) — à valider ou refuser.`,
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
      if (oldRecord.status === 'cancelled') {
        // RÉTABLISSEMENT (85 C3) : le club a DÉ-MARQUÉ un « pas venu » → le cours et sa réservation
        // reprennent vie. Le coach n'a rien « accepté » ici → texte DÉDIÉ (dire « accepté » serait
        // faux). Parité EXACTE avec la branche d'annulation : on prévient le COACH dans tous les cas
        // (il avait reçu « Cours annulé » et pourrait ne pas se présenter), puis l'élève ou les élèves.
        notifs.push({
          targets: await userToken(record.coach_id),
          title: 'Cours rétabli',
          body:
            Number(record.capacity ?? 1) > 1
              ? `Ton cours collectif du ${record.date_label ?? record.date_key ?? ''} à ${record.time ?? ''} est rétabli — le créneau est de nouveau réservé, les élèves inscrits sont prévenus.`
              : `Le cours avec ${record.student_name ?? 'un joueur'} du ${record.date_label ?? record.date_key ?? ''} à ${record.time ?? ''} est rétabli — le créneau est de nouveau réservé.`,
          data: { kind: 'lesson' },
        });
        if (Number(record.capacity ?? 1) > 1) {
          const { data: studs } = await supabase.from('lesson_students').select('user_id').eq('lesson_id', record.id);
          const studIds = (studs ?? []).map((s: { user_id: string }) => s.user_id).filter(Boolean);
          if (studIds.length) {
            const { data: toks } = await supabase
              .from('profiles')
              .select('expo_push_token')
              .in('id', studIds)
              .not('expo_push_token', 'is', null);
            notifs.push({
              targets: (toks ?? []).map((t: { expo_push_token: string }) => t.expo_push_token).filter(Boolean),
              title: 'Cours collectif rétabli',
              body: `Le cours collectif du ${record.date_label ?? record.date_key ?? ''} à ${record.time ?? ''} (${record.club_name ?? ''}) est de nouveau maintenu.`,
              data: { kind: 'reservation' },
            });
          }
        } else {
          notifs.push({
            targets: await userToken(record.student_id),
            title: 'Cours rétabli ✅',
            body: `Ton cours du ${record.date_label ?? record.date_key ?? ''} à ${record.time ?? ''} est rétabli — le terrain est de nouveau réservé.`,
            data: { kind: 'reservation' },
          });
        }
      } else {
        // Le coach a ACCEPTÉ (depuis 'pending') → prévenir l'ÉLÈVE (le terrain vient d'être réservé ;
        // le club recevra la notif « nouvelle réservation » via le webhook reservations, comme d'habitude).
        notifs.push({
          targets: await userToken(record.student_id),
          title: 'Cours accepté ✅',
          body: `${await userName(record.coach_id)} a accepté ton cours du ${record.date_label ?? record.date_key ?? ''} à ${record.time ?? ''} — terrain réservé.`,
          data: { kind: 'reservation' },
        });
      }
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
      // Formulation dédiée pour un COURS COLLECTIF (sa lesson porte student_name = « Cours
      // collectif » — « Le cours avec Cours collectif » serait absurde).
      notifs.push({
        targets: await userToken(record.coach_id),
        title: 'Cours annulé',
        body:
          Number(record.capacity ?? 1) > 1
            ? `Ton cours collectif du ${record.date_label ?? record.date_key ?? ''} à ${record.time ?? ''} est annulé — le créneau est libéré, les élèves inscrits sont prévenus.`
            : `Le cours avec ${record.student_name ?? 'un joueur'} du ${record.date_label ?? record.date_key ?? ''} à ${record.time ?? ''} n’aura pas lieu — le créneau est libéré.`,
        data: { kind: 'lesson' },
      });
      // COURS COLLECTIF (83, capacity > 1) : les ÉLÈVES inscrits doivent aussi le savoir —
      // sans ce push, le cours disparaît en silence de leur liste. kind 'reservation' (leurs
      // cours vivent dans « Mes réservations », l'Espace Coach leur est fermé).
      if (Number(record.capacity ?? 1) > 1) {
        const { data: studs } = await supabase.from('lesson_students').select('user_id').eq('lesson_id', record.id);
        const studIds = (studs ?? []).map((s: { user_id: string }) => s.user_id).filter(Boolean);
        if (studIds.length) {
          const { data: toks } = await supabase
            .from('profiles')
            .select('expo_push_token')
            .in('id', studIds)
            .not('expo_push_token', 'is', null);
          notifs.push({
            targets: (toks ?? []).map((t: { expo_push_token: string }) => t.expo_push_token).filter(Boolean),
            title: 'Cours collectif annulé',
            body: `Le cours collectif du ${record.date_label ?? record.date_key ?? ''} à ${record.time ?? ''} (${record.club_name ?? ''}) n’aura pas lieu.`,
            data: { kind: 'reservation' },
          });
        }
      }
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
      const promoClub = await clubName(record.club_id as string);
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
        // gagne » ≤ least(2, joueurs-1) — le `wn` ci-dessus —, ET au moins un « je perds ». La
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
        notifs.push({
          targets: await allPlayerTokens(), // paginé : pas de cap silencieux à 1000 comptes
          title: live.title ?? 'Actu PadelConnect 📣',
          body: live.subtitle ?? 'Ouvre l’app pour découvrir la nouveauté.',
          data: { kind: 'news' },
        });
      }
    } else if (table === 'events' && record.push === true && (type === 'INSERT' || (type === 'UPDATE' && oldRecord.push !== true))) {
      // AGENDA du padel (82) : événement publié avec la case « push » → broadcast. Garde
      // anti-doublon : INSERT, ou UPDATE qui vient d'activer le push (une simple correction de
      // texte d'un événement déjà poussé ne repart pas). MÊME anti-phishing que l'actu : le
      // texte est RELU en base par id — un appel forgé ne peut pas injecter son propre message.
      const { data: ev } = await supabase.from('events').select('id, title, date_key, place, push').eq('id', record.id).maybeSingle();
      if (ev && ev.push === true) {
        notifs.push({
          targets: await allPlayerTokens(), // paginé : pas de cap silencieux à 1000 comptes
          title: '📅 Agenda padel — ' + (ev.title ?? ''),
          body: `${ev.date_key ?? ''}${ev.place ? ' · ' + ev.place : ''} — ouvre l’app pour les détails.`,
          data: { kind: 'event' },
        });
      }
    } else if (table === 'club_news' && type === 'INSERT' && record.push === true && record.club_id) {
      // ANNONCE CLUB (83, si la case « push » était cochée à la CRÉATION — le webhook est
      // INSERT seul, une correction de texte ne re-pousse jamais) → aux SUIVEURS du club
      // (cœur favori synchronisé via club_followers), hors bloqués avec l'auteur de l'annonce.
      // MÊME anti-phishing que l'actu/l'agenda : le texte est RELU en base par id — un appel
      // forgé ne peut pas injecter son propre message. L'éditeur promet « envoyée aux joueurs
      // qui suivent ton club » : plafond LARGE (500, par récence de follow) et jetons relus par
      // TRANCHES de 100 ids (une seule requête in() exploserait l'URL PostgREST) ; l'écrêtage
      // éventuel est journalisé au lieu d'être silencieux.
      const { data: nw } = await supabase
        .from('club_news')
        .select('id, club_id, title, push, created_by')
        .eq('id', record.id)
        .maybeSingle();
      if (nw && nw.push === true) {
        const { data: fols } = await supabase
          .from('club_followers')
          .select('user_id')
          .eq('club_id', nw.club_id)
          .order('created_at', { ascending: false })
          .limit(500);
        if ((fols ?? []).length === 500) console.log(`annonce club ${nw.club_id} : 500 suiveurs atteints, les plus anciens écrêtés`);
        let ids = [...new Set((fols ?? []).map((f: { user_id: string }) => f.user_id))].filter(Boolean);
        if (nw.created_by && ids.length) {
          const { data: blocks, error: blkErr } = await supabase
            .from('blocked_users')
            .select('blocker_id, blocked_id')
            .or(`blocker_id.eq.${nw.created_by},blocked_id.eq.${nw.created_by}`);
          // FAIL-CLOSED (invariant §8 / favoris+alertes) : si on ne peut PAS lire les blocages, on
          // n'envoie PAS l'annonce (une lecture ratée ne doit jamais laisser passer un push à un bloqué).
          if (blkErr || !blocks) throw new Error('blocked_users read failed — fail closed');
          const excluded = new Set(blocks.flatMap((b: { blocker_id: string; blocked_id: string }) => [b.blocker_id, b.blocked_id]));
          ids = ids.filter((id: string) => id !== nw.created_by && !excluded.has(id));
        }
        if (ids.length) {
          const targets: string[] = [];
          for (let i = 0; i < ids.length; i += 100) {
            const { data: profs } = await supabase
              .from('profiles')
              .select('expo_push_token')
              .in('id', ids.slice(i, i + 100))
              .not('expo_push_token', 'is', null);
            for (const p of profs ?? []) if (p.expo_push_token) targets.push(p.expo_push_token as string);
          }
          if (targets.length) {
            notifs.push({
              targets,
              title: 'Annonce de ton club 📣',
              body: `${await clubName(nw.club_id as string)} : ${nw.title ?? ''}`,
              data: { kind: 'club_news', clubId: nw.club_id },
            });
          }
        }
      }
    } else if (table === 'share_payments' && type === 'INSERT' && record.status === 'declared') {
      // PART WAVE déclarée (83) : un participant dit « j'ai payé ma part » → prévenir le
      // CRÉATEUR de la résa (c'est lui qui encaisse et confirme).
      const { data: resa } = await supabase
        .from('reservations')
        .select('user_id, club_name, date_label, time')
        .eq('id', record.reservation_id)
        .maybeSingle();
      notifs.push({
        targets: await userToken(resa?.user_id ?? ''),
        title: 'Part déclarée payée 💸',
        body: `${await userName(record.user_id)} a déclaré avoir payé sa part du match du ${resa?.date_label ?? ''} à ${resa?.time ?? ''} (${resa?.club_name ?? ''}) — confirme la réception.`,
        data: { kind: 'reservation', id: record.reservation_id },
      });
    } else if (table === 'share_payments' && type === 'UPDATE' && record.status === 'confirmed' && oldRecord.status !== 'confirmed') {
      // Part CONFIRMÉE par le créateur → petit reçu au payeur (transition seule : un UPDATE
      // re-joué sur une ligne déjà confirmée ne re-pousse pas).
      const { data: resa } = await supabase
        .from('reservations')
        .select('club_name, date_label, time')
        .eq('id', record.reservation_id)
        .maybeSingle();
      notifs.push({
        targets: await userToken(record.user_id),
        title: 'Ta part est confirmée ✓',
        body: `Ta part du match du ${resa?.date_label ?? ''} à ${resa?.time ?? ''} (${resa?.club_name ?? ''}) est bien reçue.`,
        data: { kind: 'reservation', id: record.reservation_id },
      });
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

    // Jetons dont le MESSAGE DE LISTE D'ATTENTE précis a reçu un ticket Expo 'ok'. On cible le
    // message par son `kind: 'waitlist'` (et non « n'importe quel message vers ce jeton ») : un
    // même joueur peut recevoir DEUX push dans le même événement (participant du match annulé +
    // inscrit en attente sur un créneau chevauchant) — consommer son alerte parce que l'AUTRE
    // message a réussi la ferait disparaître sans qu'elle soit jamais partie.
    const waitlistOkTokens = new Set<string>();
    // Jetons d'appareils désinstallés (DeviceNotRegistered) → purgés en base (on cesse d'envoyer
    // dans le vide et on n'accumule pas de jetons morts).
    const dead: string[] = [];
    tickets.forEach((t, i) => {
      const m = messages[i];
      if (!m?.to) return;
      if (t?.status === 'ok' && m.data?.kind === 'waitlist') waitlistOkTokens.add(m.to);
      if (t?.status === 'error' && t?.details?.error === 'DeviceNotRegistered') dead.push(m.to);
    });
    // Purge des jetons morts PAR TRANCHES de 100 (un in() géant casserait l'URL après un broadcast).
    for (let i = 0; i < dead.length; i += 100) {
      await supabase
        .from('profiles')
        .update({ expo_push_token: null })
        .in('expo_push_token', dead.slice(i, i + 100));
    }

    // LISTE D'ATTENTE : consommer UNIQUEMENT les entrées dont le message d'alerte a réellement
    // abouti ('ok') — un joueur dont l'envoi a échoué (jeton mort, débit dépassé) garde son alerte
    // pour la prochaine libération. Suppression par tranches de 100.
    const toConsume = [...new Set(waitlistConsumed.filter((e) => waitlistOkTokens.has(e.token)).map((e) => e.id))];
    for (let i = 0; i < toConsume.length; i += 100) {
      await supabase
        .from('slot_waitlist')
        .delete()
        .in('id', toConsume.slice(i, i + 100));
    }

    return new Response('ok', { status: 200 });
  } catch (e) {
    return new Response(`error: ${e}`, { status: 500 });
  }
});
