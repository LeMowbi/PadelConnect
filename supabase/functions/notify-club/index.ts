// PadelConnect — Edge Function « notify-club » (Supabase Functions, runtime Deno).
// Déclenchée par des Database Webhooks. Cas gérés :
//   • reservations INSERT  → notif au(x) GÉRANT(s) du club (nouvelle réservation) — statut RELU
//     d'abord (v49) : une résa déjà annulée quand le webhook arrive ne pousse plus rien.
//   • reservations UPDATE (club_confirmed passe à true) → notif au JOUEUR (résa confirmée).
//   • reservations UPDATE (status → cancelled, depuis 'booked') → notif au(x) GÉRANT(s) du club
//     (terrain à libérer côté préparation) et aux participants — textes NEUTRES : la même
//     transition vient d'une annulation joueur ou de delete_club ; marqueur `club_deleted`
//     (97) → push neutre en plus à l'AUTEUR (« ton créneau n'a plus lieu »).
//   • reservations UPDATE (booked → club_cancelled) → AUTEUR (motif, proposition — jamais pour un
//     cours) + participants, même si le créneau a commencé (pluie en cours de match) ; cours
//     annulé PAR LE COACH (96, lessons.cancelled_by) → push dédié à l'élève ; coach qui a
//     supprimé son compte → « choisis un autre coach » ; cours COLLECTIF → rien ici (la résa est
//     au nom du coach : la branche lessons prévient coach et élèves) ; créneau LIBÉRÉ (aucune
//     fermeture posée : coach qui annule ou supprimé) → gérants et liste d'attente prévenus ;
//     élèves d'un cours collectif d'un coach supprimé relus dans lesson_cancel_notices (97).
//   • reservations UPDATE (booked → no_show) → push factuel au CRÉATEUR (« marqué pas venu »).
//   • reservation_participants INSERT → notif à l'AMI INVITÉ (nouvelle invitation à jouer).
//   • reservation_participants UPDATE (accepted) → notif à l'AUTEUR (un invité a accepté, NOMMÉ).
//   • reservation_participants UPDATE (accepted → declined) → notif à l'AUTEUR (un joueur a quitté
//     ton match ouvert / s'est retiré de ta partie) ; (invited → declined) → « a décliné ».
//   • competitions INSERT (tournoi JOUEUR ou PadelConnect/opérateur, en attente) → notif au(x) gérant(s) du club hôte (à valider).
//   • competitions UPDATE (pending → published) → notif à l'ORGANISATEUR (tournoi validé) ET, si
//     frais > 0, à l'OPÉRATEUR (« frais à encaisser ») — donc seulement après validation du club.
//   • competitions UPDATE (pending → rejected) → notif à l'ORGANISATEUR (tournoi refusé).
//   • competitions UPDATE (published → cancelled, 97) → INSCRITS + ORGANISATEUR (motif ; jamais à
//     l'organisateur qui l'a annulé lui-même — 98 `cancelled_by`) ; frais
//     déjà encaissés d'un tournoi annulé par le club / l'opérateur (98 : 'refund_due') → OPÉRATEUR.
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
//     → notif de l'ACTU à tous les comptes qui n'ont pas coupé « Actus et agenda » (98, news_push).
//   • reservations INSERT d'un match OUVERT (80/81) → deux branches best-effort en plus de la
//     notif gérant : « partenaire suivi » aux joueurs qui ont mis le créateur en FAVORI, puis
//     « un match à ton niveau vient d'ouvrir » aux SUIVEURS du club (match_alerts + fourchette).
//   • reservations UPDATE (TOUTE transition booked → cancelled : joueur, delete_club, coach
//     disparu — le créneau est réellement libéré) → alerte LISTE D'ATTENTE (81) aux inscrits dont
//     l'attente chevauche le créneau libéré (one-shot). JAMAIS sur club_cancelled : l'annulation
//     club re-bloque le créneau (75), il n'est jamais réellement libéré.
//   • events INSERT — ou UPDATE qui vient d'ACTIVER le push — (82, agenda du padel) →
//     broadcast aux comptes `news_push` (98) (anti-doublon : un événement déjà poussé ne repart pas).
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
// Réponse 202 IMMÉDIATE après le contrôle du secret, travail en arrière-plan
// (EdgeRuntime.waitUntil) : une grosse diffusion ne dépasse plus le délai du déclencheur (pg_net
// coupe et ne rejoue jamais). Envois Expo réessayés (429/5xx), lectures en échec journalisées
// dans app_errors (contexte « notify-club »), coupure de l'instance journalisée.
// Une place ANONYME (compte supprimé, 98 : participation ou saisie de score à user_id NULL) n'est
// jamais une cible : les ids sont filtrés avant tout in() (un NULL ferait échouer la requête).
// Version dépôt : v50 (décisions du porteur 2026-10-22) — le compteur de la plateforme suit (§7).

// Version EXACTE (celle de l'app, package.json) : jamais une version flottante dans la fonction qui
// détient la clé maître — un redéploiement ne doit pas embarquer un supabase-js inconnu.
// eslint-disable-next-line import/no-unresolved -- import URL Deno, résolu au déploiement
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

// `data` (optionnel) : payload lu par le CLIENT au tap sur la notif (src/lib/notifications.ts,
// useNotificationTapRouter) pour amener directement à l'écran concerné. Posé sur tous les push
// joueur, gérant (club_reservation / club_tournament → Espace Club, avec `clubId` : un gérant
// multi-clubs sait de quel club il s'agit) et coach (lesson → Espace Coach) ; seul le push
// OPÉRATEUR « frais à encaisser » n'en porte pas — les écrans opérateur sont hors routage tap.
type Notif = {
  targets: string[];
  title: string;
  body: string;
  // Début du créneau (ms epoch) d'un push lié à une partie : il ne sert plus une fois la partie
  // commencée → durée de vie Expo (`ttl`) jusqu'au début, et AUCUN envoi si c'est déjà commencé
  // (sinon « Un créneau s'est libéré, fonce » arrivait après le match sur un Android en veille).
  // JAMAIS sur une annulation par le club ou d'un cours : le club peut annuler un créneau EN
  // COURS (pluie, terrain impraticable — 78) et le joueur doit l'apprendre, avec la proposition.
  startsAt?: number;
  // Diffusion non transactionnelle (actu, agenda, annonce club) : priorité normale, 72 h de vie.
  broadcast?: boolean;
  // 'club_reservation' / 'club_tournament' = push destiné au GÉRANT → l'app ouvre l'Espace Club.
  // `event: 'cancelled'` = la partie `id` n'a plus lieu → l'app retire ses rappels locaux.
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
    event?: 'cancelled';
  };
};

// Client SERVICE ROLE (accès complet, réservé au serveur), partagé par toutes les requêtes.
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// Incident d'envoi (lecture en échec, diffusion partielle, lot Expo perdu, coupure) : console ET
// journal app_errors (contexte « notify-club », lu dans la carte « Santé de l'app » de
// l'opérateur). Bornes de la 94 respectées (message ≤ 1000). Jamais d'exception : best-effort.
async function logIssue(message: string): Promise<void> {
  console.error(`notify-club : ${message}`);
  try {
    await supabase.from('app_errors').insert({ message: message.slice(0, 1000), context: 'notify-club', platform: 'edge' });
  } catch {
    // journal best-effort : un échec ici ne doit rien casser
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Début du créneau lu dans une ligne (bigint JSON → number) ; undefined si absent ou invalide.
const slotStart = (v: unknown): number | undefined => {
  const n = Number(v);
  return v != null && Number.isFinite(n) && n > 0 ? n : undefined;
};

// Ids de COMPTES lus dans `invited` (« open-<uuid> » d'un match ouvert, « <uuid> » d'un ami) —
// les entrées « x-… » (nom sans compte) sont écartées, doublons retirés.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invitedAccountIds = (invited: unknown): string[] =>
  Array.isArray(invited)
    ? [...new Set(invited.map((e) => String((e as { id?: unknown })?.id ?? '').replace(/^open-/, '')).filter((id) => UUID_RE.test(id)))]
    : [];

// Traitements en cours en arrière-plan : si la plateforme arrête l'instance avant la fin, la
// coupure est journalisée (des push ont pu ne pas partir).
let inFlight = 0;
addEventListener('beforeunload', () => {
  if (inFlight > 0) void logIssue(`instance arrêtée avec ${inFlight} traitement(s) en cours — push possiblement perdus`);
});

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
  // Authenticité du webhook : si WEBHOOK_SECRET est configuré (variable d'env de la fonction),
  // on exige l'en-tête `x-webhook-secret` correspondant → refuse les appels arbitraires qui
  // pourraient déclencher des push. Tant que le secret n'est pas posé, comportement inchangé.
  const expectedSecret = Deno.env.get('WEBHOOK_SECRET');
  if (expectedSecret && !timingSafeEqual(req.headers.get('x-webhook-secret') ?? '', expectedSecret)) {
    return new Response('unauthorized', { status: 401 });
  }
  let payload;
  try {
    payload = await req.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }
  // Réponse 202 TOUT DE SUITE, travail en arrière-plan : pg_net coupe à son délai et ne rejoue
  // jamais — une diffusion à des milliers de comptes ne doit plus dépendre de ce délai.
  inFlight++;
  const work = handle(payload)
    .catch((e) => logIssue(`échec du traitement ${payload?.table ?? '?'} ${payload?.type ?? '?'} : ${e}`))
    .finally(() => {
      inFlight--;
    });
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(work);
    return new Response('accepted', { status: 202 });
  }
  await work; // hors Edge Runtime (exécution locale) : traitement avant la réponse
  return new Response('ok', { status: 200 });
});

// Traitement d'un webhook Supabase : { type, table, record, old_record }.
async function handle(payload: {
  type?: string;
  table?: string;
  record?: Record<string, any>;
  old_record?: Record<string, any>;
}): Promise<void> {
  const record = payload.record ?? {};
  const oldRecord = payload.old_record ?? {};
  const table = payload.table ?? '';
  const type = payload.type ?? ''; // INSERT | UPDATE | DELETE

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
  // Jetons de push de TOUS les comptes qui acceptent « Actus et agenda PadelConnect » (98,
  // `news_push`, activé par défaut, désactivable dans Profil → Notifications — Apple 4.5.4) :
  // broadcast actu opérateur / agenda. PAGINÉ : PostgREST plafonne
  // toute requête à `db-max-rows` (défaut 1000) → au-delà de 1000 comptes, un simple select
  // n'enverrait qu'aux 1000 premières lignes, dans un ordre arbitraire, SANS erreur. On boucle
  // par pages de 1000 (tri par id stable) jusqu'à épuisement. Une page en échec est relue UNE
  // fois ; si elle échoue encore, la diffusion s'arrête là et c'est JOURNALISÉ (plus jamais un
  // envoi partiel annoncé comme réussi). ⚠️ La colonne vient de la 98 : la coller AVANT de
  // déployer cette version (sinon chaque page échoue → diffusion journalisée, rien n'est envoyé).
  const newsPushTokens = async (): Promise<string[]> => {
    const out: string[] = [];
    const PAGE = 1000;
    const readPage = (page: number) =>
      supabase
        .from('profiles')
        .select('expo_push_token')
        .not('expo_push_token', 'is', null)
        .eq('news_push', true)
        .order('id', { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1);
    for (let page = 0; ; page++) {
      let { data, error } = await readPage(page);
      if (error) ({ data, error } = await readPage(page));
      if (error) {
        await logIssue(
          `diffusion partielle : lecture des jetons arrêtée à la page ${page + 1} (${out.length} jetons lus) — ${error.message}`,
        );
        break;
      }
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
  // Ordre IDENTIQUE à applyInfo côté app : le nom SURCHARGÉ par le gérant (club_overrides, 66 —
  // un nom effacé y est stocké NULL) prime sur le nom de base (table clubs, puis fondateurs).
  const clubName = async (clubId: string): Promise<string> => {
    const { data: ov } = await supabase.from('club_overrides').select('name').eq('club_id', clubId).maybeSingle();
    if (ov?.name) return ov.name;
    const { data } = await supabase.from('clubs').select('name').eq('id', clubId).maybeSingle();
    return data?.name ?? FOUNDER_NAMES[clubId] ?? 'Ton club';
  };
  // Nom de club FIGÉ sur une ligne (lessons/reservations.club_name). Avant la 91,
  // create_group_lesson y écrivait l'IDENTIFIANT (« padelta ») pour un club fondateur : une
  // valeur vide OU égale à l'identifiant retombe sur clubName() (même repli que le client).
  const recordClubName = async (rec: Record<string, unknown>): Promise<string> => {
    const stored = String(rec.club_name ?? '');
    return stored && stored !== rec.club_id ? stored : await clubName(String(rec.club_id ?? ''));
  };
  // Libellé ABSOLU d'une clé AAAA-MM-JJ (« Lun 8 juin ») — miroir de src/lib/days.ts
  // (dateKeyLabel ; Deno ne peut pas l'importer). Repli sur la clé brute si le format est
  // inattendu : `proposed_date_key` n'est pas contraint côté SQL, un appel forgé ne doit pas
  // faire planter la fonction.
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const DAYS_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const dateKeyLabel = (key: unknown): string => {
    const k = String(key ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return k;
    const [y, m, d] = k.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    return `${DAYS_SHORT[date.getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
  };
  // Fourchette de niveau — miroir de src/lib/levelRange.ts (levelRangeText + levelText) :
  // « 3 », « 2,5 – 4 », « 3 et plus », « 4 maximum » ('' = ouverte à tous).
  const levelText = (n: number): string => (Number.isInteger(n) ? `${n}` : n.toFixed(1).replace('.', ','));
  const levelRangeText = (min: number | null, max: number | null): string => {
    if (min !== null && max !== null) return min === max ? levelText(min) : `${levelText(min)} – ${levelText(max)}`;
    if (min !== null) return `${levelText(min)} et plus`;
    if (max !== null) return `${levelText(max)} maximum`;
    return '';
  };
  // LISTE D'ATTENTE (81) : un créneau vient de se LIBÉRER (toute transition booked→cancelled :
  // joueur, delete_club, coach disparu — jamais club_cancelled, qui re-bloque le créneau, cf.
  // sa branche) → notifier les
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
        const { data: profs, error: profErr } = await supabase
          .from('profiles')
          .select('id, expo_push_token')
          .in('id', userIds.slice(i, i + 100))
          .not('expo_push_token', 'is', null);
        if (profErr) await logIssue(`liste d'attente : jetons non lus (tranche ${i / 100 + 1}) — ${profErr.message}`);
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
          startsAt: slotStart(rec.starts_at),
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
    // Statut RELU d'abord : l'ordre d'arrivée de deux webhooks n'est pas garanti (INSERT puis
    // UPDATE en moins d'une seconde) → une résa déjà annulée ne pousse plus « Nouvelle
    // réservation » ni d'alerte « match ouvert ». Lecture en échec : on pousse comme avant.
    const { data: live, error: liveErr } = await supabase.from('reservations').select('status').eq('id', record.id).maybeSingle();
    if (!liveErr && live?.status !== 'booked') return;
    // Nouvelle réservation (INSERT uniquement — jamais un DELETE) → prévenir le(s) gérant(s).
    notifs.push({
      targets: await clubManagerTokens(record.club_id),
      title: 'Nouvelle réservation 🎾',
      body: `${record.booked_by_name ?? 'Un joueur'} — ${record.club_name ?? ''} · ${record.date_label ?? ''} à ${record.time ?? ''} (${record.court ?? ''}).`,
      data: { kind: 'club_reservation', id: record.id, clubId: record.club_id },
      startsAt: slotStart(record.starts_at),
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
        // FAIL-CLOSED (§8) : si la lecture des blocages ÉCHOUE, on abandonne ce push facultatif
        // plutôt que de notifier peut-être un compte bloqué (harcèlement). null ≠ [] : un [] est
        // une absence réelle de blocage, un échec (error) ferme la branche.
        const { data: blocks, error: blkErr } = await supabase
          .from('blocked_users')
          .select('blocker_id, blocked_id')
          .or(`blocker_id.eq.${record.user_id},blocked_id.eq.${record.user_id}`);
        if (!blkErr && blocks) {
          const excluded = new Set(blocks.flatMap((b: { blocker_id: string; blocked_id: string }) => [b.blocker_id, b.blocked_id]));
          const fanIds = favFanIds.filter((id: string) => !excluded.has(id));
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
                startsAt: slotStart(record.starts_at),
              });
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
            const rangeText = levelRangeText(lo, hi);
            const range = rangeText ? ` · niveau ${rangeText}` : '';
            notifs.push({
              targets,
              title: 'Un match à ton niveau vient d’ouvrir 🎾',
              body: `${record.club_name ?? ''} · ${record.date_label ?? ''} à ${record.time ?? ''}${range}.`,
              data: { kind: 'open_match', id: record.id },
              startsAt: slotStart(record.starts_at),
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
      startsAt: slotStart(record.starts_at),
    });
  } else if (table === 'reservations' && type === 'UPDATE' && record.status === 'cancelled' && oldRecord.status === 'booked') {
    // La réservation n'a plus lieu : annulation JOUEUR, OU suppression du club (delete_club) —
    // la transition booked→cancelled est la même. Textes NEUTRES (toujours vrais) :
    // prévenir le(s) gérant(s) du club (terrain à libérer côté préparation).
    const startsAt = slotStart(record.starts_at);
    notifs.push({
      targets: await clubManagerTokens(record.club_id),
      title: 'Réservation annulée',
      body: `Le créneau de ${record.booked_by_name ?? 'un joueur'} du ${record.date_label ?? ''} à ${record.time ?? ''} (${record.court ?? ''} · ${record.club_name ?? ''}) a été annulé.`,
      data: { kind: 'club_reservation', id: record.id, clubId: record.club_id },
      startsAt,
    });
    notifs.push(...(await waitlistAlerts(record)));
    // Club retiré de PadelConnect (97, marqueur technique jamais affiché) : l'AUTEUR n'a rien
    // annulé lui-même → push neutre (sans lui, sa résa disparaissait en silence).
    if (record.cancel_reason === 'club_deleted') {
      notifs.push({
        targets: await userToken(record.user_id),
        title: 'Réservation annulée',
        body: `Ton créneau du ${record.date_label ?? ''} à ${record.time ?? ''} (${record.club_name ?? ''}) n’a plus lieu : le club a quitté PadelConnect.`,
        data: { kind: 'reservation', id: record.id, event: 'cancelled' },
        startsAt,
      });
    }
    // Et prévenir les PARTICIPANTS (amis invités / joueurs qui avaient rejoint un match
    // ouvert) : sans ça, le match disparaît en silence de leurs réservations.
    const { data: parts } = await supabase.from('reservation_participants').select('user_id, status').eq('reservation_id', record.id);
    let partIds = (parts ?? []).filter((p) => p.status !== 'declined' && p.user_id).map((p) => p.user_id as string);
    // Créateur qui SUPPRIME son compte (delete_account) : la cascade a déjà effacé les
    // participations quand ce webhook arrive → repli sur les comptes de `invited` (payload),
    // SEULEMENT si le profil du créateur n'existe plus (jamais pour une annulation ordinaire :
    // un ami non relié — ex. qui l'avait bloqué — n'a pas à être prévenu).
    if (!partIds.length) {
      const { data: owner, error: ownerErr } = await supabase.from('profiles').select('id').eq('id', record.user_id).maybeSingle();
      if (!ownerErr && !owner) partIds = invitedAccountIds(record.invited).filter((id) => id !== record.user_id);
    }
    if (partIds.length > 0) {
      const { data: toks } = await supabase.from('profiles').select('expo_push_token').in('id', partIds);
      notifs.push({
        targets: (toks ?? []).map((t) => t.expo_push_token as string).filter(Boolean),
        title: 'Match annulé',
        body: `Le match du ${record.date_label ?? ''} à ${record.time ?? ''} (${record.club_name ?? ''}) a été annulé.`,
        data: { kind: 'reservation', id: record.id, event: 'cancelled' },
        startsAt,
      });
    }
  } else if (table === 'reservations' && type === 'UPDATE' && record.status === 'club_cancelled' && oldRecord.status === 'booked') {
    // Annulation CÔTÉ CLUB (75) — ou d'un COURS par son coach (96) / par la suppression du coach
    // (97), qui passent par le même statut pour ne pas compter d'annulation à l'élève.
    // Tap sur la notif → « Mes réservations ». Formulation NEUTRE (pluie, panne, chevauchement…) :
    // « a dû annuler », jamais une cause supposée.
    // `startsAt` ne sert qu'au push gérant « Créneau libéré » et à la liste d'attente (plus bas) :
    // les push d'ANNULATION partent même si le créneau a commencé (cf. type Notif).
    const startsAt = slotStart(record.starts_at);
    const club = await recordClubName(record);
    const when = `du ${record.date_label ?? ''} à ${record.time ?? ''}`;
    const coach = String(record.coach_name ?? '').trim();
    const reasonPart = record.cancel_reason ? ` Motif : ${record.cancel_reason}.` : '';
    // Cours : la lesson rattachée dit QUI annule et QUI est l'auteur de la résa.
    //  • annulé PAR SON COACH (lessons.cancelled_by, 96) → push dédié à l'élève ;
    //  • cours COLLECTIF (capacity > 1) : la résa est au nom du COACH (create_group_lesson) — la
    //    branche lessons prévient déjà le coach et les élèves → rien ici pour l'« auteur » ;
    //  • coach qui a SUPPRIMÉ son compte (delete_account : motif « Coach indisponible », lesson
    //    effacée par la cascade avant ce webhook) → l'élève ne peut plus « redemander à son coach ».
    let byCoach = false;
    let groupHost = false;
    let coachGone = false;
    let lessonUnknown = false;
    if (coach) {
      const { data: lsn, error: lsnErr } = await supabase
        .from('lessons')
        .select('cancelled_by, capacity, coach_id')
        .eq('reservation_id', record.id)
        .limit(1);
      const rows = (lsn ?? []) as { cancelled_by: string | null; capacity: number | null; coach_id: string }[];
      byCoach = rows.some((l) => l.cancelled_by === 'coach');
      groupHost = rows.some((l) => Number(l.capacity ?? 1) > 1 || l.coach_id === record.user_id);
      coachGone = !lsnErr && rows.length === 0 && record.cancel_reason === 'Coach indisponible';
      if (lsnErr) {
        lessonUnknown = true;
        await logIssue(`lesson d'une résa annulée non relue (${record.id}) — ${lsnErr.message}`);
      }
    }
    if (groupHost) {
      // Cours collectif : coach et élèves prévenus par la branche lessons (aucun doublon absurde
      // « Ton cours avec <toi-même> » au coach).
    } else if (byCoach) {
      notifs.push({
        targets: await userToken(record.user_id),
        title: 'Cours annulé par ton coach',
        body: `${coach} a annulé ton cours ${when} (${club}) — aucune pénalité pour toi, redemande un créneau quand tu veux.`,
        data: { kind: 'reservation', id: record.id, event: 'cancelled' },
      });
    } else if (coachGone) {
      notifs.push({
        targets: await userToken(record.user_id),
        title: 'Cours annulé',
        body: `Ton cours avec ${coach} ${when} (${club}) est annulé : ton coach n’est plus disponible sur PadelConnect. Aucune pénalité pour toi — choisis un autre coach dans « Réserver un cours ».`,
        data: { kind: 'reservation', id: record.id, event: 'cancelled' },
      });
    } else if (lessonUnknown) {
      // Lesson NON RELUE : l'auteur peut être l'élève OU le coach d'un cours collectif, et le coach
      // a peut-être supprimé son compte → texte NEUTRE, vrai dans tous les cas (ni « Ton cours avec
      // <toi-même> », ni « Redemande un créneau à ton coach »). L'élève d'un cours individuel n'a
      // que ce push (la branche lessons ne prévient que le coach) : on ne le coupe pas.
      notifs.push({
        targets: await userToken(record.user_id),
        title: 'Cours annulé',
        body: `Ton cours ${when} (${club}) est annulé.${reasonPart}`,
        data: { kind: 'reservation', id: record.id, event: 'cancelled' },
      });
    } else if (coach) {
      // Un COURS ne se re-réserve pas sans le coach : jamais de proposition d'alternative.
      notifs.push({
        targets: await userToken(record.user_id),
        title: 'Cours annulé',
        body: `Ton cours avec ${coach} ${when} (${club}) est annulé.${reasonPart} Redemande un créneau à ton coach.`,
        data: { kind: 'reservation', id: record.id, event: 'cancelled' },
      });
    } else {
      // Motif et proposition d'alternative (jour/heure/terrain) : pour l'AUTEUR seulement.
      const proposalPart = record.proposed_time
        ? ` Le club te propose le ${record.proposed_date_key ? dateKeyLabel(record.proposed_date_key) : (record.date_label ?? '')} à ${record.proposed_time}${record.proposed_court ? ` (${record.proposed_court})` : ''}.`
        : ' Ouvre l’app pour choisir un autre créneau.';
      notifs.push({
        targets: await userToken(record.user_id),
        title: 'Créneau annulé par le club',
        body: `${club} a dû annuler ton créneau ${when}.${reasonPart}${proposalPart}`,
        data: { kind: 'reservation', id: record.id, event: 'cancelled' },
      });
    }
    // Participants (amis invités / match ouvert) : prévenus eux aussi que le créneau saute, mais
    // avec un texte NEUTRE — la proposition d'alternative et « ton créneau » ne s'adressent qu'à
    // l'AUTEUR (c'est lui qui re-réserve pour le groupe). Dire « le club te propose » à un invité
    // serait faux (le créneau de courtoisie ne lui est pas destiné).
    const { data: cparts } = await supabase.from('reservation_participants').select('user_id, status').eq('reservation_id', record.id);
    const cpartIds = (cparts ?? []).filter((p) => p.status !== 'declined' && p.user_id).map((p) => p.user_id as string);
    if (cpartIds.length > 0) {
      const { data: toks } = await supabase.from('profiles').select('expo_push_token').in('id', cpartIds);
      notifs.push({
        targets: (toks ?? []).map((t) => t.expo_push_token as string).filter(Boolean),
        title: 'Match annulé par le club',
        // Sans le MOTIF libre : il peut nommer un tiers (« M. X a réservé au téléphone ») et ne
        // regarde que l'auteur de la résa — un participant n'a pas à le recevoir (confidentialité).
        body: `${club} a dû annuler le créneau ${when}.`,
        data: { kind: 'reservation', id: record.id, event: 'cancelled' },
      });
    }
    // Cours COLLECTIF d'un coach SUPPRIMÉ (97) : la cascade a effacé la résa du coach et ses
    // inscrits avant ce webhook — delete_account les a notés dans lesson_cancel_notices. One-shot :
    // les lignes lues sont effacées tout de suite.
    if (coach) {
      const { data: notes, error: notesErr } = await supabase
        .from('lesson_cancel_notices')
        .select('user_id')
        .eq('reservation_id', record.id)
        .limit(100);
      const noteIds = (notes ?? []).map((n: { user_id: string }) => n.user_id).filter(Boolean);
      if (notesErr) await logIssue(`élèves d'un cours collectif non relus (${record.id}) — ${notesErr.message}`);
      if (noteIds.length) {
        await supabase.from('lesson_cancel_notices').delete().eq('reservation_id', record.id);
        const { data: toks } = await supabase
          .from('profiles')
          .select('expo_push_token')
          .in('id', noteIds)
          .not('expo_push_token', 'is', null);
        notifs.push({
          targets: (toks ?? []).map((t: { expo_push_token: string }) => t.expo_push_token).filter(Boolean),
          title: 'Cours collectif annulé',
          body: `Le cours collectif ${when} (${club}) n’aura pas lieu : le coach n’est plus disponible.`,
          data: { kind: 'reservation' },
        });
      }
    }
    // Créneau réellement LIBÉRÉ ? club_cancel_reservation (75) re-bloque TOUJOURS le créneau
    // d'origine (occupé hors app : « fonce » serait un mensonge) ; un cours annulé par son coach
    // (96) ou par sa suppression (97) ne pose aucune fermeture → gérants prévenus (terrain libre)
    // et alerte LISTE D'ATTENTE comme pour une annulation joueur. Lecture en échec : rien (prudence).
    const { data: blk, error: blkErr } = await supabase
      .from('blocked_slots')
      .select('club_id')
      .eq('club_id', record.club_id)
      .eq('date_key', record.date_key)
      .eq('time', record.time)
      .eq('court', record.court)
      .limit(1);
    if (!blkErr && !(blk ?? []).length) {
      notifs.push({
        targets: await clubManagerTokens(record.club_id),
        title: 'Créneau libéré',
        body: `${coach ? `Le cours de ${coach}` : 'La réservation'} du ${record.date_label ?? ''} à ${record.time ?? ''} (${record.court ?? ''} · ${club}) n’aura pas lieu${byCoach ? ' (annulé par le coach)' : ''} — le terrain est de nouveau libre.`,
        data: { kind: 'club_reservation', id: record.id, clubId: record.club_id },
        startsAt,
      });
      notifs.push(...(await waitlistAlerts(record)));
    }
  } else if (table === 'reservations' && type === 'UPDATE' && record.status === 'no_show' && oldRecord.status === 'booked') {
    // « PAS VENU » marqué par le club (borné au créneau + 48 h, 96) : la fiabilité publique du
    // joueur baisse — il doit le savoir et pouvoir contester auprès du club. Message FACTUEL.
    notifs.push({
      targets: await userToken(record.user_id),
      title: 'Absence signalée par le club',
      body: `${await recordClubName(record)} a marqué ta réservation du ${record.date_label ?? ''} à ${record.time ?? ''} comme « pas venu ». Une erreur ? Contacte le club.`,
      data: { kind: 'reservation', id: record.id },
    });
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
        body: `Ton créneau du ${record.date_label ?? record.date_key ?? ''} à ${record.time ?? ''} (${record.club_name ?? ''}) est de nouveau réservé — l’absence a été annulée.`,
        data: { kind: 'reservation', id: record.id },
      });
    }
  } else if (table === 'reservation_participants' && type === 'INSERT' && record.status === 'accepted') {
    // MATCH OUVERT (45) : quelqu'un vient de REJOINDRE — join_open_match insère directement
    // 'accepted' (≠ 'invited') → on prévient le CRÉATEUR du match, pas le nouveau venu.
    // Statut relu : jamais un push pour une résa qui n'est plus active.
    const { data: resa } = await supabase
      .from('reservations')
      .select('user_id, status, starts_at, club_name, date_label, time')
      .eq('id', record.reservation_id)
      .maybeSingle();
    if (resa?.status === 'booked') {
      notifs.push({
        targets: await userToken(resa.user_id ?? ''),
        title: 'Un joueur a rejoint ton match 🎾',
        body: `${await userName(record.user_id)} a rejoint ton match du ${resa.date_label ?? ''} à ${resa.time ?? ''} (${resa.club_name ?? ''}).`,
        data: { kind: 'reservation', id: record.reservation_id },
        startsAt: slotStart(resa.starts_at),
      });
    }
  } else if (table === 'reservation_participants' && type === 'INSERT') {
    // Un ami vient d'être INVITÉ à une réservation (link_participants) → prévenir l'invité.
    const { data: resa } = await supabase
      .from('reservations')
      .select('user_id, status, starts_at, club_name, date_label, time, court')
      .eq('id', record.reservation_id)
      .maybeSingle();
    if (resa?.status === 'booked') {
      notifs.push({
        targets: await userToken(record.user_id),
        title: 'Invitation à jouer 🎾',
        body: `${await userName(resa.user_id ?? '')} t’invite à jouer le ${resa.date_label ?? ''} à ${resa.time ?? ''} (${resa.club_name ?? ''}).`,
        data: { kind: 'reservation', id: record.reservation_id },
        startsAt: slotStart(resa.starts_at),
      });
    }
  } else if (table === 'reservation_participants' && type === 'UPDATE' && record.status === 'accepted' && oldRecord.status !== 'accepted') {
    // Un invité vient d'ACCEPTER (transition → accepted) → prévenir l'AUTEUR, en NOMMANT le
    // joueur (le créateur sait enfin qui vient). Garde de transition : sans elle, chaque UPDATE
    // d'une ligne déjà 'accepted' renotifierait. MATCH OUVERT : un joueur qui re-rejoint après
    // avoir quitté passe aussi par cette transition (upsert declined → accepted) — le texte
    // « invitation » serait faux pour un inconnu qui rejoint : on adapte au type de réservation.
    // Statut relu : jamais « Invitation acceptée » pour un match annulé.
    const { data: resa } = await supabase
      .from('reservations')
      .select('user_id, status, starts_at, open_match, club_name, date_label, time')
      .eq('id', record.reservation_id)
      .maybeSingle();
    if (resa?.status === 'booked') {
      const who = await userName(record.user_id);
      notifs.push({
        targets: await userToken(resa.user_id ?? ''),
        title: resa.open_match ? 'Un joueur a rejoint ton match 🎾' : 'Invitation acceptée ✅',
        body: resa.open_match
          ? `${who} a rejoint ton match du ${resa.date_label ?? ''} à ${resa.time ?? ''} (${resa.club_name ?? ''}).`
          : `${who} a accepté de jouer avec toi le ${resa.date_label ?? ''} à ${resa.time ?? ''} (${resa.club_name ?? ''}).`,
        data: { kind: 'reservation', id: record.reservation_id },
        startsAt: slotStart(resa.starts_at),
      });
    }
  } else if (
    table === 'reservation_participants' &&
    type === 'UPDATE' &&
    record.status === 'declined' &&
    (oldRecord.status === 'accepted' || oldRecord.status === 'invited')
  ) {
    // Un joueur QUITTE un match ouvert (leave_open_match → declined) → prévenir le créateur :
    // une place se relibère. Partie PRIVÉE encore active : le créateur apprend aussi qu'un ami a
    // DÉCLINÉ son invitation ou s'est RETIRÉ après avoir accepté — sinon son nom disparaissait
    // en silence de « Avec … ».
    const { data: resa } = await supabase
      .from('reservations')
      .select('user_id, status, starts_at, open_match, club_name, date_label, time')
      .eq('id', record.reservation_id)
      .maybeSingle();
    const where = `du ${resa?.date_label ?? ''} à ${resa?.time ?? ''} (${resa?.club_name ?? ''})`;
    if (resa?.open_match && oldRecord.status === 'accepted') {
      notifs.push({
        targets: await userToken(resa.user_id ?? ''),
        title: 'Un joueur a quitté ton match',
        body: `${await userName(record.user_id)} a quitté ton match ${where} — une place se libère.`,
        data: { kind: 'reservation', id: record.reservation_id },
        startsAt: slotStart(resa.starts_at),
      });
    } else if (resa && !resa.open_match && resa.status === 'booked') {
      const declined = oldRecord.status === 'invited';
      notifs.push({
        targets: await userToken(resa.user_id ?? ''),
        title: declined ? 'Invitation déclinée' : 'Un joueur s’est retiré',
        body: declined
          ? `${await userName(record.user_id)} a décliné ton invitation ${where}.`
          : `${await userName(record.user_id)} ne jouera finalement pas avec toi ${where}.`,
        data: { kind: 'reservation', id: record.reservation_id },
        startsAt: slotStart(resa.starts_at),
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
      data: { kind: 'club_tournament', id: record.id, clubId: record.club_id },
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
    const reason = typeof record.reject_reason === 'string' && record.reject_reason.trim() ? ` Motif : ${record.reject_reason.trim()}` : '';
    notifs.push({
      targets: await userToken(record.organizer_id),
      title: 'Tournoi non retenu',
      body: `${record.club_name ?? 'Le club'} n’a pas retenu ton tournoi « ${record.title ?? ''} ».${reason}`,
      data: { kind: 'tournament', id: record.id },
    });
  } else if (table === 'competitions' && type === 'UPDATE' && record.status === 'cancelled' && oldRecord.status === 'published') {
    // Tournoi ANNULÉ (97 : club hôte, opérateur, organisateur sans inscrit, ou club retiré) →
    // les INSCRITS et l'ORGANISATEUR sont prévenus, motif joint. Texte RELU en base (anti-
    // phishing, idiome actu/agenda). L'organisateur qui vient d'annuler LUI-MÊME (98,
    // `cancelled_by` — gérant qui annule le tournoi de son club, organisateur sans inscrit) ne
    // reçoit pas son propre geste. Aucun filtre de blocage sur les inscrits : un tournoi qui a des
    // inscrits n'est annulable que par le club ou l'opérateur — le message vient d'eux et concerne
    // l'inscription de chacun (sans ce push, le tournoi disparaît de sa liste en silence).
    const { data: comp } = await supabase
      .from('competitions')
      .select('id, title, club_id, club_name, organizer_id, cancel_reason, status, commission, payment_status, cancelled_by')
      .eq('id', record.id)
      .maybeSingle();
    if (comp && comp.status === 'cancelled') {
      const club = comp.club_name || (await clubName(String(comp.club_id ?? '')));
      const reason = comp.cancel_reason ? ` Motif : ${comp.cancel_reason}.` : '';
      if (comp.organizer_id && comp.organizer_id !== comp.cancelled_by) {
        notifs.push({
          targets: await userToken(comp.organizer_id),
          title: 'Ton tournoi est annulé',
          body: `« ${comp.title ?? ''} » (${club}) est annulé.${reason}`,
          data: { kind: 'tournament', id: comp.id, event: 'cancelled' },
        });
      }
      const { data: regs, error: regErr } = await supabase
        .from('competition_registrations')
        .select('user_id')
        .eq('competition_id', comp.id)
        .limit(500);
      const regIds = [...new Set((regs ?? []).map((r: { user_id: string }) => r.user_id))].filter((id) => id && id !== comp.organizer_id);
      if (regErr) await logIssue(`inscrits d'un tournoi annulé non relus (${comp.id}) — ${regErr.message}`);
      if (regIds.length) {
        const targets: string[] = [];
        for (let i = 0; i < regIds.length; i += 100) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('expo_push_token')
            .in('id', regIds.slice(i, i + 100))
            .not('expo_push_token', 'is', null);
          for (const p of profs ?? []) if (p.expo_push_token) targets.push(p.expo_push_token as string);
        }
        notifs.push({
          targets,
          title: 'Tournoi annulé',
          body: `« ${comp.title ?? ''} » (${club}), auquel tu étais inscrit, est annulé.${reason}`,
          data: { kind: 'tournament', id: comp.id, event: 'cancelled' },
        });
      }
      // Frais PadelConnect DÉJÀ encaissés d'un tournoi annulé par le club ou l'opérateur (98,
      // décision 14) : dus à l'organisateur → l'opérateur rembourse (Wave). Statut relu en base.
      const fee = Number(comp.commission ?? 0);
      if (comp.payment_status === 'refund_due' && fee > 0) {
        notifs.push({
          targets: await operatorTokens(),
          title: 'Frais de tournoi à rembourser 💸',
          body: `« ${comp.title ?? ''} » (${club}) a été annulé : rembourse ${fee.toLocaleString('fr-FR')} FCFA de frais à l’organisateur (Wave).`,
        });
      }
    }
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
            body: `Le cours collectif du ${record.date_label ?? record.date_key ?? ''} à ${record.time ?? ''} (${await recordClubName(record)}) est de nouveau maintenu.`,
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
  } else if (
    table === 'lessons' &&
    type === 'UPDATE' &&
    record.status === 'cancelled' &&
    oldRecord.status === 'accepted' &&
    record.cancelled_by !== 'coach'
  ) {
    // (Cours annulé PAR LE COACH lui-même, 96 : rien ici — il le sait, et l'élève reçoit son push
    // dédié via la branche reservations club_cancelled.)
    // La réservation née du cours n'a plus lieu (annulation de l'élève, « pas venu » marqué par
    // le club, ou annulation PAR LE CLUB — trigger lessons_follow_reservation) → prévenir le COACH.
    // Formulation NEUTRE : on ne sait pas ici lequel des cas s'est produit — sans annoncer un
    // terrain libre (le club qui annule RE-BLOQUE le créneau, 78).
    // Formulation dédiée pour un COURS COLLECTIF (sa lesson porte student_name = « Cours
    // collectif » — « Le cours avec Cours collectif » serait absurde).
    notifs.push({
      targets: await userToken(record.coach_id),
      title: 'Cours annulé',
      body:
        Number(record.capacity ?? 1) > 1
          ? `Ton cours collectif du ${record.date_label ?? record.date_key ?? ''} à ${record.time ?? ''} est annulé — les élèves inscrits sont prévenus.`
          : `Le cours avec ${record.student_name ?? 'un joueur'} du ${record.date_label ?? record.date_key ?? ''} à ${record.time ?? ''} n’aura pas lieu.`,
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
          body: `Le cours collectif du ${record.date_label ?? record.date_key ?? ''} à ${record.time ?? ''} (${await recordClubName(record)}) n’aura pas lieu.`,
          data: { kind: 'reservation', ...(record.reservation_id ? { id: record.reservation_id, event: 'cancelled' as const } : {}) },
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
    //   • PREMIÈRE saisie d'un match (la plus ancienne, created_at puis user_id — deux saisies
    //     quasi simultanées voyaient chacune déjà 2 lignes et personne n'envoyait) → « Score à
    //     saisir » aux joueurs identifiés qui n'ont PAS encore saisi, une seule fois par match.
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
        .select('user_id, canon, i_won, created_at')
        .eq('reservation_id', record.reservation_id);
      // user_id NULL = saisie d'un compte supprimé (98) : comptée pour l'état du match, jamais ciblée.
      const all = (entries ?? []) as { user_id: string | null; canon: string; i_won: boolean; created_at: string }[];
      // Joueurs identifiés (créateur + participants 'accepted'), chargés une fois, réutilisés plus bas.
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
      const tokensFor = async (userIds: (string | null | undefined)[]) => {
        const ids = userIds.filter((id): id is string => Boolean(id));
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
          body: `Les saisies de ton match ${when} ne concordent pas (score différent ou plusieurs vainqueurs déclarés) — vérifiez ensemble dans Mes réservations.`,
          data: { kind: 'reservation', id: record.reservation_id },
        });
      } else if (type === 'INSERT' && !after.validated && !after.conflict) {
        // « Score à saisir » émis par la SEULE saisie la plus ancienne du match (une correction
        // = UPDATE ne re-pousse jamais). Cible : les joueurs identifiés SANS saisie.
        const oldest = [...all].sort((x, y) =>
          x.created_at === y.created_at ? ((x.user_id ?? '') < (y.user_id ?? '') ? -1 : 1) : x.created_at < y.created_at ? -1 : 1,
        )[0];
        if (oldest?.user_id === record.user_id) {
          const entered = new Set(all.map((e) => e.user_id));
          const others = [...new Set([resa?.user_id, ...acceptedParts.map((p) => p.user_id as string)])].filter(
            (id): id is string => Boolean(id) && !entered.has(id as string),
          );
          // Texte HONNÊTE sur la règle anti-collusion : la confirmation d'un ADVERSAIRE valide ;
          // celle d'un coéquipier du gagnant BLOQUERAIT la validation à 48 h (deux « je gagne »
          // ne valident jamais) — on le dit, au lieu d'inviter tout le monde à saisir.
          // Nom du saisisseur masqué (« Un joueur ») auprès des joueurs en relation de blocage
          // avec lui, comme à l'écran (96, R-32) ; blocages illisibles → masqué pour tous
          // (fail-closed sur le NOM, jamais sur l'information).
          const tail = record.i_won
            ? ` a mis le score de votre match ${when}. Si tu étais dans l’autre camp, confirme-le pour le valider. Coéquipiers : inutile, il sera validé sous 48 h.`
            : ` a mis le score de votre match ${when}. Si tu étais dans l’autre camp, confirme-le pour le valider.`;
          const { data: blocks, error: blkErr } = await supabase
            .from('blocked_users')
            .select('blocker_id, blocked_id')
            .or(`blocker_id.eq.${record.user_id},blocked_id.eq.${record.user_id}`);
          const hidden = new Set((blocks ?? []).flatMap((b: { blocker_id: string; blocked_id: string }) => [b.blocker_id, b.blocked_id]));
          const named = blkErr ? [] : others.filter((id) => !hidden.has(id));
          const masked = blkErr ? others : others.filter((id) => hidden.has(id));
          if (named.length) {
            notifs.push({
              targets: await tokensFor(named),
              title: 'Score à saisir 🎾',
              body: `${await userName(record.user_id)}${tail}`,
              data: { kind: 'reservation', id: record.reservation_id },
            });
          }
          if (masked.length) {
            notifs.push({
              targets: await tokensFor(masked),
              title: 'Score à saisir 🎾',
              body: `Un joueur${tail}`,
              data: { kind: 'reservation', id: record.reservation_id },
            });
          }
        }
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
        targets: await newsPushTokens(), // paginé, comptes news_push seulement
        title: live.title ?? 'Actu PadelConnect 📣',
        body: live.subtitle ?? 'Ouvre l’app pour découvrir la nouveauté.',
        data: { kind: 'news' },
        broadcast: true,
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
        targets: await newsPushTokens(), // paginé, comptes news_push seulement
        title: '📅 Agenda padel — ' + (ev.title ?? ''),
        body: `${dateKeyLabel(ev.date_key)}${ev.place ? ' · ' + ev.place : ''} — ouvre l’app pour les détails.`,
        data: { kind: 'event' },
        broadcast: true,
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
    const { data: nw } = await supabase.from('club_news').select('id, club_id, title, push, created_by').eq('id', record.id).maybeSingle();
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
          const { data: profs, error: profErr } = await supabase
            .from('profiles')
            .select('expo_push_token')
            .in('id', ids.slice(i, i + 100))
            .not('expo_push_token', 'is', null);
          if (profErr) await logIssue(`annonce club ${nw.club_id} : diffusion partielle (tranche ${i / 100 + 1}) — ${profErr.message}`);
          for (const p of profs ?? []) if (p.expo_push_token) targets.push(p.expo_push_token as string);
        }
        if (targets.length) {
          notifs.push({
            targets,
            title: 'Annonce de ton club 📣',
            body: `${await clubName(nw.club_id as string)} : ${nw.title ?? ''}`,
            data: { kind: 'club_news', clubId: nw.club_id },
            broadcast: true,
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

  // Aplatis toutes les notifs en messages Expo (une entrée par destinataire). Canal Android
  // 'default' (créé par l'app) et priorité HAUTE pour les push transactionnels (sinon livrés en
  // retard en veille Android) ; une diffusion reste en priorité normale. Durée de vie (`ttl`) :
  // jusqu'au début de la partie pour un push qui la concerne — aucun envoi si elle a commencé —,
  // 72 h pour une diffusion, défaut Expo sinon.
  const nowMs = Date.now();
  const messages = notifs.flatMap((n) => {
    let ttl: number | undefined;
    if (n.startsAt !== undefined) {
      ttl = Math.floor((n.startsAt - nowMs) / 1000);
      if (ttl <= 0) return [];
    } else if (n.broadcast) {
      ttl = 72 * 3600;
    }
    return n.targets.map((to) => ({
      to,
      title: n.title,
      body: n.body,
      sound: 'default',
      channelId: 'default',
      priority: n.broadcast ? 'normal' : 'high',
      ...(ttl !== undefined ? { ttl } : {}),
      ...(n.data ? { data: n.data } : {}),
    }));
  });
  if (messages.length === 0) return;

  // Expo REFUSE un lot de plus de 100 notifications (PUSH_TOO_MANY_NOTIFICATIONS) : un push
  // d'actu à tous les joueurs (47) échouerait en bloc. On envoie par tranches de 100 et on
  // agrège les tickets (index aligné sur `messages`) pour purger les jetons morts ensuite.
  // Nouveaux essais (doc Expo) : 2 sur une réponse 429 / 5xx (après 1 s puis 3 s), 1 seul sur
  // une erreur réseau sans réponse (Expo n'a pas de clé d'idempotence : un doublon n'est
  // accepté que là), dans un BUDGET global de 6 nouveaux essais par webhook — une panne Expo
  // ne retient jamais l'instance indéfiniment. Un lot perdu est journalisé.
  const CHUNK = 100;
  const BACKOFF_MS = [1000, 3000];
  let retryBudget = 6;
  const tickets: { status?: string; details?: { error?: string } }[] = [];
  for (let i = 0; i < messages.length; i += CHUNK) {
    const slice = messages.slice(i, i + CHUNK);
    let data: { status?: string; details?: { error?: string } }[] = [];
    for (let attempt = 0; ; attempt++) {
      try {
        const pushRes = await fetch(EXPO_PUSH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(slice),
        });
        if (pushRes.status === 429 || pushRes.status >= 500) {
          if (attempt < BACKOFF_MS.length && retryBudget > 0) {
            retryBudget--;
            await sleep(BACKOFF_MS[attempt]);
            continue;
          }
          await logIssue(`lot Expo perdu (HTTP ${pushRes.status}, ${slice.length} messages, ${attempt + 1} essai(s))`);
          break;
        }
        const json = await pushRes.json();
        if (json?.errors) console.error(`notify-club : erreurs Expo ${JSON.stringify(json.errors).slice(0, 500)}`);
        data = Array.isArray(json?.data) ? json.data : [];
        break;
      } catch (e) {
        if (attempt < 1 && retryBudget > 0) {
          retryBudget--;
          await sleep(BACKOFF_MS[0]);
          continue;
        }
        await logIssue(`lot Expo perdu (réseau, ${slice.length} messages) — ${e}`);
        break;
      }
    }
    // Réaligne : une tranche sans `data` (erreur) laisse des trous → on comble pour garder
    // l'index messages[i] ↔ tickets[i] exact lors de la purge DeviceNotRegistered et de la
    // consommation de la liste d'attente.
    for (let j = 0; j < slice.length; j++) tickets.push(data[j] ?? {});
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
}
