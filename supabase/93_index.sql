-- 93 — Index manquants sur les prédicats CHAUDS (audit pré-lancement 2026-10, lot F4).
-- À coller dans Supabase → SQL Editor → Run APRÈS la 92. Idempotent, rejouable.
--
-- UNIQUEMENT les index réellement absents du catalogue live (vérifié table par table) : aucun
-- index historique n'est re-posé, aucune fonction touchée, rien côté client. Chaque index est
-- justifié par la requête qui le consomme (RPC live, policy RLS, lecture PostgREST du client ou
-- notify-club). Les index partiels `where status = 'booked'` ne portent que les lignes utiles :
-- ils restent petits même quand l'historique (annulées, jouées) grossit.
--
-- NON posé, déjà couvert : `reviews(club_id)` — l'index unique `reviews_club_id_user_id_key
-- (club_id, user_id)` sert les lookups par club (préfixe gauche : club_reviews_summary,
-- fetch_club_ratings, delete_club). Un index dédié serait un doublon.
--
-- Preuve : EXPLAIN sur Postgres 16 local avec un échantillon synthétique (chaque requête ci-dessous
-- passe en Index Scan / Bitmap Index Scan sur l'index nommé) — voir le rapport du lot.

-- ── 1) reservations ───────────────────────────────────────────────────────────────
-- (date_key) partiel booked : lecture client de la vue `slot_occupancy` (fetchOccupancy :
-- `date_key >= aujourd'hui`, TOUS clubs — reservations_club_idx ne peut pas servir sans club),
-- et, croisé avec reservations_club_idx (bitmap AND), les gardes `club_id = … and date_key = …
-- and status = 'booked'` de reservations_availability_guard (chaque INSERT), block_range,
-- competition_overlaps_reservations (validation de tournoi).
create index if not exists reservations_booked_date_idx
  on public.reservations (date_key)
  where status = 'booked';

-- (starts_at) partiel booked : fetchReservations (miroir de session — `status = 'booked' and
-- starts_at >= now − fenêtre`, tri desc), fetch_open_matches (`status = 'booked' and starts_at >
-- now`), fetch_group_lessons / delete_account / club_stats (même forme).
create index if not exists reservations_booked_starts_idx
  on public.reservations (starts_at)
  where status = 'booked';

-- ── 2) reservation_participants (user_id) ─────────────────────────────────────────
-- L'index unique (reservation_id, user_id) ne sert pas un lookup par joueur seul : policy
-- `rp_select` (`auth.uid() = user_id`, évaluée à chaque lecture), fetchParticipations client
-- (`.eq('user_id', …)`), cascade de la FK à la suppression du compte (delete_account).
create index if not exists reservation_participants_user_idx
  on public.reservation_participants (user_id);

-- ── 3) friend_requests (to_user) partiel pending ──────────────────────────────────
-- fetch_friend_requests (`to_user = auth.uid() and status = 'pending'`, à chaque session et
-- retour au premier plan) : l'unique (from_user, to_user) ne sert pas le destinataire.
create index if not exists friend_requests_to_pending_idx
  on public.friend_requests (to_user)
  where status = 'pending';

-- ── 4) manager_clubs (club_id) ────────────────────────────────────────────────────
-- notify-club lit les gérants d'un club (`manager_clubs?club_id=eq.…`) à CHAQUE push vers un
-- club ; delete_club purge par club. La clé primaire (user_id, club_id) ne sert pas club_id seul.
create index if not exists manager_clubs_club_idx
  on public.manager_clubs (club_id);

-- ── 5) profiles (managed_club_id) partiel ─────────────────────────────────────────
-- notify-club (`profiles?managed_club_id=eq.…`, comptes mono-club antérieurs à la 55) à chaque
-- push vers un club ; delete_club (`where p.managed_club_id = p_id`). Partiel : la quasi-totalité
-- des profils (joueurs) porte null.
create index if not exists profiles_managed_club_idx
  on public.profiles (managed_club_id)
  where managed_club_id is not null;

-- ── 6) lessons (reservation_id) partiel ───────────────────────────────────────────
-- Trigger lessons_follow_reservation (`update lessons where reservation_id = new.id`, à CHAQUE
-- UPDATE d'une réservation), FK lessons_reservation_fk ON DELETE SET NULL (chaque suppression de
-- résa), fetch_group_lessons. Partiel : une demande 'pending' n'a pas encore de réservation.
create index if not exists lessons_reservation_idx
  on public.lessons (reservation_id)
  where reservation_id is not null;

-- ── 7) match_results (user_id) ────────────────────────────────────────────────────
-- FK match_results_user_id_fkey ON DELETE CASCADE sans index : la suppression d'un compte
-- (delete_account, exigence App Store 5.1.1) balayait toute la table ; l'unique
-- (reservation_id, user_id) ne sert pas user_id seul.
create index if not exists match_results_user_idx
  on public.match_results (user_id);

-- ── 8) blocked_slots (date_key) ───────────────────────────────────────────────────
-- fetchBlockedSlots client (`date_key >= aujourd'hui`, TOUS clubs, tri par date) : la clé
-- primaire (club_id, date_key, time, court) ne sert pas date_key sans club.
create index if not exists blocked_slots_date_idx
  on public.blocked_slots (date_key);
