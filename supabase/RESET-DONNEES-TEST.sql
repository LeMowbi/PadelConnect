-- =====================================================================================
-- PadelConnect — REMISE À ZÉRO DES DONNÉES DE TEST (avant lancement public)
-- =====================================================================================
-- Choix du porteur (2026-07-04) :
--   • EFFACER L'ACTIVITÉ, GARDER LES COMPTES  → les joueurs restent, tout leur historique
--     part (réservations, matchs ouverts, scores, tournois, avis, amis, cours…) et les
--     niveaux/points repartent de zéro. Personne n'est supprimé.
--   • SUPPRIMER LES CLUBS DE TEST → on vide la table `clubs` de la base (tout ce qui s'y
--     trouve a été créé pendant les essais). Les 9 clubs FONDATEURS vivent dans le code de
--     l'app : ils réapparaissent automatiquement, remis à leur état d'origine.
--   • TON COMPTE OPÉRATEUR EST PRÉSERVÉ (toute ligne profiles avec role = 'operator').
--   • ⚠️ APRÈS LE RESET, re-saisis dans l'Espace opérateur : le LIEN WAVE de paiement, le
--     MONTANT des frais de tournoi et le PLAFOND de la remise fidélité (5 000 FCFA par défaut)
--     — ces réglages sont effacés (section 2) pour qu'aucun réglage de TEST ne survive au lancement.
--
-- ⚠️ IRRÉVERSIBLE. À lancer UNE FOIS, juste avant d'ouvrir l'app au public.
-- ⚠️ À lancer APRÈS avoir collé les migrations 92 → 94 dans l'ordre : les sections 1 et 2
--   lisent puis vident `rate_counters` (créée par la 94). Lancé avant, le script s'arrête sur
--   « relation does not exist », SANS rien effacer (la transaction est annulée).
-- Comment faire, sans terminal :
--   1) Dashboard Supabase → SQL Editor.
--   2) D'ABORD la SECTION 1 (aperçu) : copie-la, Run → tu vois combien de lignes vont partir.
--   3) SEULEMENT si les chiffres te vont, copie la SECTION 2, Run → la remise à zéro se fait.
-- =====================================================================================


-- ─────────────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — APERÇU (lecture seule, NE SUPPRIME RIEN) — à lancer en premier
-- ─────────────────────────────────────────────────────────────────────────────────────
select 'Comptes joueurs conservés (dont opérateurs)'         as element, count(*) as total from public.profiles
union all select 'dont comptes OPÉRATEUR préservés',           count(*) from public.profiles where role = 'operator'
union all select 'Réservations (matchs) à effacer',            count(*) from public.reservations
union all select 'Participants de réservation à effacer',      count(*) from public.reservation_participants
union all select 'Scores de match à effacer',                  count(*) from public.match_results
union all select 'Tournois à effacer',                         count(*) from public.competitions
union all select 'Inscriptions à des tournois à effacer',      count(*) from public.competition_registrations
union all select 'Demandes d''ami à effacer',                  count(*) from public.friend_requests
union all select 'Amitiés à effacer',                          count(*) from public.friends
union all select 'Avis à effacer',                             count(*) from public.reviews
union all select 'Signalements d''avis à effacer',             count(*) from public.review_reports
union all select 'Comptes bloqués (modération) à effacer',     count(*) from public.blocked_users
union all select 'Cours à effacer',                            count(*) from public.lessons
union all select 'Coachs réservables à retirer',               count(*) from public.coaches
union all select 'Créneaux fermés (ponctuels) à effacer',      count(*) from public.blocked_slots
union all select 'Périodes fermées à effacer',                 count(*) from public.blocked_ranges
union all select 'Parrainages à effacer',                      count(*) from public.referrals
union all select 'Messages de support à effacer',              count(*) from public.support_messages
union all select 'Actus opérateur à effacer',                  count(*) from public.operator_news
union all select 'CLUBS de test à supprimer (base)',           count(*) from public.clubs
union all select 'Demandes de club à effacer',                 count(*) from public.club_requests
union all select 'Configs de club à effacer',                  count(*) from public.club_config
union all select 'Surcharges de club à effacer',               count(*) from public.club_overrides
union all select 'Statuts de club à effacer',                  count(*) from public.club_status
union all select 'Commissions de club à effacer',              count(*) from public.club_commission
union all select 'Boosts de club à effacer',                   count(*) from public.club_boost
union all select 'Accès multi-clubs à effacer',                count(*) from public.manager_clubs
union all select 'Décomptes opérateur à effacer',              count(*) from public.operator_payments
-- Chantier v3 (80→83) : TOUT ce que la section 2 efface doit apparaître ici, sinon l'aperçu ment.
union all select 'Historique de niveau à effacer',             count(*) from public.level_history
union all select 'Joueurs favoris à effacer',                  count(*) from public.favorite_players
union all select 'Suivis de club à effacer',                   count(*) from public.club_followers
union all select 'Alertes de liste d''attente à effacer',      count(*) from public.slot_waitlist
union all select 'Réclamations fidélité à effacer',            count(*) from public.loyalty_claims
union all select 'Agenda (événements) à effacer',              count(*) from public.events
union all select 'Décomptes de carnet à effacer',              count(*) from public.pass_uses
union all select 'Carnets club à effacer',                     count(*) from public.club_passes
union all select 'Annonces club à effacer',                    count(*) from public.club_news
union all select 'Compteurs anti-abus à effacer',               count(*) from public.rate_counters
union all select 'Parts Wave à effacer',                       count(*) from public.share_payments
union all select 'Élèves de cours collectifs à effacer',       count(*) from public.lesson_students
union all select 'Notes privées de créneaux à effacer',        count(*) from public.blocked_slot_notes
union all select 'Réglages tournoi (lien Wave, frais) à effacer', count(*) from public.tournament_config
union all select 'Réglages app (fidélité) à effacer',          count(*) from public.app_config
order by element;
-- (Facultatif — journaux de diagnostic anonymes, si tu veux aussi les nettoyer :)
--   select 'Erreurs app', count(*) from public.app_errors
--   union all select 'Événements app', count(*) from public.app_events;


-- ─────────────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — RÉINITIALISATION (SUPPRIME) — à lancer SEULEMENT quand l'aperçu te convient
-- ─────────────────────────────────────────────────────────────────────────────────────
-- Tout est dans une seule transaction : si une ligne échoue, RIEN n'est appliqué (pas de
-- demi-suppression). Le récapitulatif final confirme l'état après coup.
begin;

  -- ⚠️ GUC du moteur de niveau (34/80) : sans lui, le trigger protect_level ANNULE en silence la
  -- remise à 3.0 des niveaux plus bas (new.level := old.level, même depuis SQL Editor) — le reset
  -- semblerait réussi mais les niveaux de test amorceraient le moteur au lancement public.
  select set_config('padel.level_write', 'on', true);

  -- 1) Activité des joueurs — on efface les « enfants » avant les « parents » (clés étrangères).
  delete from public.reservation_participants;
  delete from public.share_payments;             -- parts Wave (83) — cascade avec reservations, explicite quand même
  delete from public.reservations;               -- inclut les matchs ouverts (open_match)
  delete from public.competition_registrations;
  delete from public.competitions;
  delete from public.match_results;
  delete from public.review_reports;
  delete from public.reviews;
  delete from public.friend_requests;
  delete from public.friends;
  delete from public.blocked_users;
  delete from public.lesson_students;            -- élèves des cours collectifs (83)
  delete from public.lessons;
  delete from public.coaches;
  delete from public.blocked_slot_notes;         -- notes privées des créneaux récurrents (83)
  delete from public.blocked_slots;
  delete from public.blocked_ranges;
  delete from public.referrals;
  delete from public.support_messages;
  delete from public.operator_news;
  -- Chantier v3 : moteur de niveau (80), suivis/attentes (81), fidélité/agenda (82), lot D (83).
  delete from public.level_history;
  delete from public.favorite_players;
  delete from public.club_followers;
  delete from public.slot_waitlist;
  delete from public.loyalty_claims;
  delete from public.events;
  delete from public.pass_uses;
  delete from public.club_passes;
  delete from public.club_news;
  delete from public.rate_counters;             -- compteurs anti-abus (94)

  -- 2) Clubs de test + tout ce qui les décrit. Les 9 fondateurs vivent dans le code de l'app :
  --    vider ces tables les remet à leur apparence d'origine (nom, horaires, photos par défaut).
  delete from public.manager_clubs;
  delete from public.club_boost;
  delete from public.club_commission;
  delete from public.club_status;
  delete from public.club_overrides;
  delete from public.club_config;
  delete from public.club_requests;
  delete from public.operator_payments;
  delete from public.clubs;
  -- Réglages OPÉRATEUR à effacer AUSSI (sinon un réglage de TEST survit à la remise à zéro) :
  --   • tournament_config : le LIEN WAVE de paiement + le montant des frais de tournoi — un lien
  --     Wave de test survivant enverrait de vrais organisateurs vers une caisse de test (argent réel) ;
  --   • app_config : le plafond de la remise fidélité (`loyalty_cap`, 92 — revient à 5 000 FCFA
  --     par défaut). Le porteur les re-saisit dans l'Espace opérateur après le reset (cf. note en
  --     tête de fichier).
  delete from public.tournament_config;
  delete from public.app_config;

  -- 3) Comptes CONSERVÉS, mais remis à neuf :
  --    - niveau ramené au défaut d'inscription (3.0) ; les points du classement, eux, sont
  --      CALCULÉS à partir des matchs/tournois → déjà à zéro après l'étape 1 ;
  --    - les gérants de test redeviennent de simples joueurs (leurs clubs ont été supprimés) ;
  --    - TON compte OPÉRATEUR n'est jamais rétrogradé (role = 'operator' préservé).
  update public.profiles set level = 3.0;
  update public.profiles
     set role = 'player', managed_club_id = null
   where role <> 'operator';

  -- 4) (Facultatif) Journaux de diagnostic anonymes — décommente si tu veux repartir propre :
  -- delete from public.app_errors;
  -- delete from public.app_events;

commit;

-- Récapitulatif après remise à zéro (doit afficher 0 partout, sauf les comptes conservés).
select 'Comptes conservés'          as element, count(*) as total from public.profiles
union all select 'dont opérateurs',   count(*) from public.profiles where role = 'operator'
union all select 'dont gérants',       count(*) from public.profiles where role = 'club'
union all select 'Réservations',       count(*) from public.reservations
union all select 'Tournois',           count(*) from public.competitions
union all select 'Scores',             count(*) from public.match_results
union all select 'Clubs (base)',       count(*) from public.clubs
union all select 'Carnets club',       count(*) from public.club_passes
union all select 'Réclamations fidélité', count(*) from public.loyalty_claims
union all select 'Listes d''attente',  count(*) from public.slot_waitlist
union all select 'Annonces club',      count(*) from public.club_news
union all select 'Parts Wave',         count(*) from public.share_payments
union all select 'Réglages tournoi',   count(*) from public.tournament_config
union all select 'Réglages app',       count(*) from public.app_config
order by element;
