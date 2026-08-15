-- 83 — CLUB & MONÉTISATION (chantier v3, lot D).
-- À coller dans Supabase → SQL Editor → Run. Idempotent.
--
-- 12) RÉSERVATION RÉCURRENTE habitués : `block_recurring` pose le même créneau sur N semaines
--     (mêmes gardes que block_slot, verrous club:jour ORDONNÉS — motif 74) et rend un résultat
--     HONNÊTE {blocked, conflicts} (une date déjà réservée part en conflit, le reste passe).
-- 17) CARNETS club : `club_passes` (crédité par le gérant, par téléphone) + `pass_uses`
--     (décompte MANUEL v1 : un tap gérant par réservation, idempotent + audité).
-- 18) PARTS WAVE des matchs partagés : le créateur colle SON lien Wave sur SA résa ;
--     chaque participant déclare « j'ai payé », le créateur confirme (webhook `share_payments`).
-- 19) COURS COLLECTIFS à places : le coach crée la résa (mêmes gardes 68→79, double validation
--     club préservée) + une lesson `accepted` à capacité ; les élèves rejoignent/quittent.
-- 20) ANNONCES CLUB : `club_news` éditées par le gérant, lues sur la fiche club ; push aux
--     SUIVEURS du club (webhook `club_news`, ciblage dans notify-club).
-- 21) AVIS STRUCTURÉS : 3 notes optionnelles (terrains / accueil / vestiaires) en plus de la
--     note globale — anciens clients et anciens avis inchangés.

-- ── 12) Réservation récurrente (fermetures en série) ────────────────────────────

-- CONFIDENTIALITÉ (doctrine 78/54) : `blocked_slots.reason` est LISIBLE PAR TOUS les joueurs
-- (le fetch de dispo sélectionne la colonne). Le motif d'un créneau récurrent porte le NOM du
-- client du gérant (« Récurrent · Awa ») → il ne part JAMAIS dans blocked_slots : la colonne
-- publique reçoit le générique « Récurrent », le libellé réel vit ici, lisible du seul gérant
-- (RLS can_manage_club). FK composite ON DELETE CASCADE : débloquer le créneau purge la note.
create table if not exists public.blocked_slot_notes (
  club_id text not null,
  date_key text not null,
  "time" text not null,
  court text not null,
  note text not null default '',
  primary key (club_id, date_key, "time", court),
  foreign key (club_id, date_key, "time", court)
    references public.blocked_slots (club_id, date_key, "time", court) on delete cascade
);

alter table public.blocked_slot_notes enable row level security;
drop policy if exists blocked_slot_notes_select_managers on public.blocked_slot_notes;
create policy blocked_slot_notes_select_managers on public.blocked_slot_notes
  for select using (public.can_manage_club(club_id));
-- Écritures via block_recurring uniquement.

-- Pose le MÊME créneau (terrain, heure, durée) sur plusieurs dates (le client calcule les
-- dates du jour de semaine choisi). Retour jsonb { blocked: [dates], conflicts: [dates] } —
-- null = refus global (droits, paramètres invalides). Chaque date passe les MÊMES gardes que
-- block_slot (chevauchement d'intervalle avec une résa 'booked' → la date part en conflicts).
-- p_reason (« Récurrent · {nom} ») = note PRIVÉE gérant ; le public ne voit que « Récurrent ».
create or replace function public.block_recurring(
  p_club_id text,
  p_court text,
  p_time text,
  p_duration integer,
  p_date_keys text[],
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
  v_dates text[];
  dk text;
  v_blocked text[] := '{}';
  v_conflicts text[] := '{}';
begin
  if not public.can_manage_club(p_club_id) then return null; end if;
  if coalesce(trim(p_court), '') = '' or public.hhmm_to_min(p_time) is null then return null; end if;
  if p_duration is null or p_duration not in (60, 90) then return null; end if;
  -- 1 à 26 dates (26 semaines = 6 mois), format strict, réellement calendaires, bornées à 366 j.
  if p_date_keys is null or coalesce(array_length(p_date_keys, 1), 0) < 1 or array_length(p_date_keys, 1) > 26 then
    return null;
  end if;
  if exists (select 1 from unnest(p_date_keys) d where d !~ '^\d{4}-\d{2}-\d{2}$') then return null; end if;
  begin
    perform d::date from unnest(p_date_keys) d;
  exception when others then
    return null;
  end;
  if exists (select 1 from unnest(p_date_keys) d
             where d::date > (now() + interval '366 days')::date) then
    return null;
  end if;
  -- Toutes FUTURES : bloquer un créneau passé n'a pas de sens (et le résultat mentirait).
  if exists (select 1 from unnest(p_date_keys) d where public.slot_start_ms(d, p_time) <= v_now) then
    return null;
  end if;
  -- Dédoublonnées et ORDONNÉES : les verrous club:jour se prennent en ordre croissant PARTOUT
  -- (motif 74 anti-interblocage — block_range boucle aussi en ordre croissant).
  select array_agg(distinct d order by d) into v_dates from unnest(p_date_keys) d;
  foreach dk in array v_dates loop
    perform pg_advisory_xact_lock(hashtext(p_club_id || ':' || dk));
  end loop;
  foreach dk in array v_dates loop
    -- Même garde que block_slot : résa 'booked' qui CHEVAUCHE [time, time+durée) sur ce terrain.
    if exists (
      select 1 from public.reservations r
      where r.club_id = p_club_id and r.date_key = dk and r.court = p_court and r.status = 'booked'
        and public.hhmm_to_min(r."time") is not null
        and public.hhmm_to_min(r."time") < public.hhmm_to_min(p_time) + p_duration
        and public.hhmm_to_min(p_time) < public.hhmm_to_min(r."time") + r.duration_min
    ) then
      v_conflicts := v_conflicts || dk;
    else
      -- Motif PUBLIC générique (jamais le nom du client — cf. blocked_slot_notes ci-dessus).
      insert into public.blocked_slots (club_id, date_key, time, court, reason, created_by, duration_min)
        values (p_club_id, dk, p_time, p_court, 'Récurrent', auth.uid(), p_duration)
        on conflict (club_id, date_key, time, court)
          do update set reason = excluded.reason, duration_min = excluded.duration_min;
      insert into public.blocked_slot_notes (club_id, date_key, "time", court, note)
        values (p_club_id, dk, p_time, p_court, left(trim(coalesce(p_reason, '')), 200))
        on conflict (club_id, date_key, "time", court) do update set note = excluded.note;
      v_blocked := v_blocked || dk;
    end if;
  end loop;
  return jsonb_build_object('blocked', to_jsonb(v_blocked), 'conflicts', to_jsonb(v_conflicts));
end;
$$;

revoke execute on function public.block_recurring(text, text, text, integer, text[], text) from public, anon;
grant execute on function public.block_recurring(text, text, text, integer, text[], text) to authenticated;

-- ── 17) Carnets & abonnements club ──────────────────────────────────────────────

create table if not exists public.club_passes (
  id uuid primary key default gen_random_uuid(),
  club_id text not null check (length(club_id) between 1 and 64),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null default '',
  total int not null check (total between 1 and 100),
  remaining int not null check (remaining >= 0),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists club_passes_by_club on public.club_passes (club_id);
create index if not exists club_passes_by_user on public.club_passes (user_id);

alter table public.club_passes enable row level security;
drop policy if exists club_passes_select_own on public.club_passes;
create policy club_passes_select_own on public.club_passes
  for select using (user_id = auth.uid() or public.can_manage_club(club_id));
-- Écritures via RPC uniquement (crédit gérant, décompte atomique).

-- Trace de décompte : une réservation ne se décompte qu'UNE fois (unique), et on sait
-- toujours de quel carnet elle est partie (audit).
create table if not exists public.pass_uses (
  pass_id uuid not null references public.club_passes (id) on delete cascade,
  reservation_id uuid not null unique,
  used_at timestamptz not null default now(),
  primary key (pass_id, reservation_id)
);

alter table public.pass_uses enable row level security;
drop policy if exists pass_uses_select_own on public.pass_uses;
create policy pass_uses_select_own on public.pass_uses
  for select using (exists (
    select 1 from public.club_passes cp
    where cp.id = pass_id and (cp.user_id = auth.uid() or public.can_manage_club(cp.club_id))
  ));

-- Gérant : crédite un carnet à un joueur PAR TÉLÉPHONE (appariement 10 derniers chiffres,
-- REFUS d'ambiguïté — motif grant_club_access_by_phone). Renvoie le nom du joueur, null = refus.
create or replace function public.club_grant_pass(p_club_id text, p_phone text, p_total integer, p_label text default '')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
  full_name text;
  matches int;
begin
  if not public.can_manage_club(p_club_id) then return null; end if;
  if p_total is null or p_total < 1 or p_total > 100 then return null; end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 8 then return null; end if;
  -- Écriture bornée : pas plus de 200 carnets ACTIFS par club (large — anti-emballement).
  if (select count(*) from public.club_passes cp where cp.club_id = p_club_id and cp.remaining > 0) >= 200 then
    return null;
  end if;
  select count(*) into matches from public.profiles p
    where right(regexp_replace(p.phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10);
  if matches <> 1 then
    return null; -- 0 = introuvable ; >1 = AMBIGU → on refuse (anti-usurpation)
  end if;
  select p.id, trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
    into target, full_name
  from public.profiles p
  where right(regexp_replace(p.phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10);
  insert into public.club_passes (club_id, user_id, label, total, remaining, created_by)
    values (p_club_id, target, left(trim(coalesce(p_label, '')), 60), p_total, p_total, auth.uid());
  return coalesce(nullif(full_name, ''), 'Joueur');
end;
$$;

-- Gérant : décompte UNE réservation du carnet de son auteur. Atomique (FOR UPDATE sur le
-- carnet) et idempotent (reservation_id UNIQUE dans pass_uses → un double-tap rend 'already').
create or replace function public.club_use_pass(p_reservation_id uuid)
returns text -- 'ok' | 'forbidden' | 'gone' | 'already' | 'none'
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_pass uuid;
begin
  select * into r from public.reservations where id = p_reservation_id;
  if r.id is null or r.status <> 'booked' then return 'gone'; end if;
  if not public.can_manage_club(r.club_id) then return 'forbidden'; end if;
  if exists (select 1 from public.pass_uses u where u.reservation_id = p_reservation_id) then
    return 'already';
  end if;
  select cp.id into v_pass from public.club_passes cp
    where cp.club_id = r.club_id and cp.user_id = r.user_id and cp.remaining > 0
    order by cp.created_at
    limit 1
    for update;
  if v_pass is null then return 'none'; end if;
  update public.club_passes set remaining = remaining - 1 where id = v_pass;
  begin
    insert into public.pass_uses (pass_id, reservation_id) values (v_pass, p_reservation_id);
  exception when unique_violation then
    -- Course entre deux gérants : l'autre a décompté d'abord → on rend la séance au carnet.
    update public.club_passes set remaining = remaining + 1 where id = v_pass;
    return 'already';
  end;
  return 'ok';
end;
$$;

-- Gérant : les carnets de SON club (soldes + porteurs).
create or replace function public.club_passes_list(p_club_id text)
returns table (id uuid, user_id uuid, player_name text, label text, total int, remaining int, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select cp.id, cp.user_id,
         coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Joueur'),
         cp.label, cp.total, cp.remaining, cp.created_at
    from public.club_passes cp
    left join public.profiles p on p.id = cp.user_id
    where public.can_manage_club(p_club_id) and cp.club_id = p_club_id
    order by (cp.remaining > 0) desc, cp.created_at desc
    limit 200;
$$;

-- Joueur : MES carnets (tous clubs), actifs d'abord.
create or replace function public.my_passes()
returns table (id uuid, club_id text, label text, total int, remaining int, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select cp.id, cp.club_id, cp.label, cp.total, cp.remaining, cp.created_at
    from public.club_passes cp
    where cp.user_id = auth.uid()
    order by (cp.remaining > 0) desc, cp.created_at desc
    limit 50;
$$;

revoke execute on function public.club_grant_pass(text, text, integer, text) from public, anon;
revoke execute on function public.club_use_pass(uuid) from public, anon;
revoke execute on function public.club_passes_list(text) from public, anon;
revoke execute on function public.my_passes() from public, anon;
grant execute on function public.club_grant_pass(text, text, integer, text) to authenticated;
grant execute on function public.club_use_pass(uuid) to authenticated;
grant execute on function public.club_passes_list(text) to authenticated;
grant execute on function public.my_passes() to authenticated;

-- ── 18) Parts Wave des matchs partagés ──────────────────────────────────────────

alter table public.reservations add column if not exists wave_link text;

-- Le CRÉATEUR colle son lien Wave sur SA résa à venir ('' = effacer). https strict : ce lien
-- est OUVERT par les autres joueurs — même règle que les liens d'actu/agenda.
create or replace function public.set_reservation_wave_link(p_id uuid, p_link text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link text := trim(coalesce(p_link, ''));
begin
  if auth.uid() is null then return false; end if;
  if v_link <> '' and (v_link !~ '^https://' or length(v_link) > 300) then return false; end if;
  update public.reservations
    set wave_link = nullif(v_link, '')
    where id = p_id and user_id = auth.uid() and status = 'booked';
  return found;
end;
$$;

-- Suivi des parts : chaque participant déclare « j'ai payé », le créateur confirme.
create table if not exists public.share_payments (
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'declared' check (status in ('declared', 'confirmed')),
  declared_at timestamptz not null default now(),
  confirmed_at timestamptz,
  primary key (reservation_id, user_id)
);

alter table public.share_payments enable row level security;
drop policy if exists share_payments_select_own on public.share_payments;
create policy share_payments_select_own on public.share_payments
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.reservations r where r.id = reservation_id and r.user_id = auth.uid())
  );
-- Écritures via RPC (transitions contrôlées).

-- Participant ACCEPTÉ d'une résa à venir : déclare sa part payée. Idempotent (une ligne déjà
-- 'confirmed' ne redescend jamais). true = pris en compte.
create or replace function public.declare_share_paid(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if auth.uid() is null then return false; end if;
  select * into r from public.reservations where id = p_reservation_id and status = 'booked';
  if r.id is null then return false; end if;
  if r.user_id = auth.uid() then return false; end if; -- le créateur encaisse, il ne se paie pas lui-même
  if not exists (
    select 1 from public.reservation_participants rp
    where rp.reservation_id = p_reservation_id and rp.user_id = auth.uid() and rp.status = 'accepted'
  ) then
    return false;
  end if;
  insert into public.share_payments (reservation_id, user_id)
    values (p_reservation_id, auth.uid())
    on conflict (reservation_id, user_id) do nothing;
  return true;
end;
$$;

-- Créateur : confirme la part d'UN joueur (déclarée). true = confirmée.
create or replace function public.confirm_share_paid(p_reservation_id uuid, p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return false; end if;
  if not exists (
    select 1 from public.reservations r
    where r.id = p_reservation_id and r.user_id = auth.uid()
  ) then
    return false;
  end if;
  update public.share_payments
    set status = 'confirmed', confirmed_at = now()
    where reservation_id = p_reservation_id and user_id = p_user and status = 'declared';
  return found;
end;
$$;

-- État des parts d'une résa (créateur OU participant accepté) : lien Wave + statut par joueur.
-- jsonb (extensible sans drop) : { "wave_link": text|null, "shares": [{user_id,name,status}] }.
create or replace function public.fetch_share_payments(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  r record;
begin
  if auth.uid() is null then return null; end if;
  select * into r from public.reservations where id = p_reservation_id;
  if r.id is null then return null; end if;
  if r.user_id <> auth.uid() and not exists (
    select 1 from public.reservation_participants rp
    where rp.reservation_id = p_reservation_id and rp.user_id = auth.uid() and rp.status = 'accepted'
  ) then
    return null;
  end if;
  return jsonb_build_object(
    'wave_link', r.wave_link,
    'shares', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', sp.user_id,
        'name', coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Un joueur'),
        'status', sp.status
      ) order by sp.declared_at)
      from public.share_payments sp
      left join public.profiles p on p.id = sp.user_id
      where sp.reservation_id = p_reservation_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.set_reservation_wave_link(uuid, text) from public, anon;
revoke execute on function public.declare_share_paid(uuid) from public, anon;
revoke execute on function public.confirm_share_paid(uuid, uuid) from public, anon;
revoke execute on function public.fetch_share_payments(uuid) from public, anon;
grant execute on function public.set_reservation_wave_link(uuid, text) to authenticated;
grant execute on function public.declare_share_paid(uuid) to authenticated;
grant execute on function public.confirm_share_paid(uuid, uuid) to authenticated;
grant execute on function public.fetch_share_payments(uuid) to authenticated;

-- ── 19) Cours collectifs à places ───────────────────────────────────────────────

-- capacity = nombre de PLACES ÉLÈVES (1 = cours particulier historique, >1 = collectif).
alter table public.lessons add column if not exists capacity int not null default 1;
alter table public.lessons drop constraint if exists lessons_capacity_chk;
alter table public.lessons add constraint lessons_capacity_chk check (capacity between 1 and 8);
-- Note libre du coach (« Apporte ta raquette », niveau visé…) — affichée sur la carte du cours.
alter table public.lessons add column if not exists note text not null default '';

create table if not exists public.lesson_students (
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (lesson_id, user_id)
);

alter table public.lesson_students enable row level security;
drop policy if exists lesson_students_select_own on public.lesson_students;
create policy lesson_students_select_own on public.lesson_students
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.lessons l where l.id = lesson_id and l.coach_id = auth.uid())
  );
-- Écritures via RPC (capacité, blocages, fenêtres temporelles).

-- Coach ACTIF du club : crée un cours collectif = LA RÉSERVATION STANDARD à son nom (mêmes
-- gardes 68→79, GiST anti double-vente intacte, club_confirmed=false → double validation club
-- préservée) + la lesson 'accepted' liée, à capacité. Renvoie l'id de la lesson, null = refus.
create or replace function public.create_group_lesson(
  p_club_id text,
  p_court text,
  p_date_key text,
  p_time text,
  p_duration integer,
  p_capacity integer,
  p_note text default '',
  p_date_label text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_starts bigint;
  v_price integer;
  v_courts text[];
  cname text;
  cphone text;
  club_label text;
  res_id uuid;
  new_id uuid;
begin
  if v_uid is null then return null; end if;
  if p_duration is null or p_duration not in (60, 90) then return null; end if;
  if p_capacity is null or p_capacity < 2 or p_capacity > 8 then return null; end if;
  if p_date_key !~ '^\d{4}-\d{2}-\d{2}$' or public.hhmm_to_min(p_time) is null then return null; end if;
  begin
    perform p_date_key::date;
  exception when others then
    return null;
  end;
  -- Coach ACTIF de CE club (le tarif du cours = celui fixé par le club, borné comme en 48).
  select c.price into v_price from public.coaches c
    where c.user_id = v_uid and c.club_id = p_club_id and c.active;
  if not found then return null; end if;
  if v_price is not null and (v_price < 1000 or v_price > 1000000) then v_price := null; end if;
  -- Terrain déclaré + (heure, durée) = créneau OUVERT de CE terrain (motif request_lesson).
  select courts into v_courts from public.club_config where club_id = p_club_id;
  if v_courts is not null and array_length(v_courts, 1) > 0 and not (p_court = any (v_courts)) then
    return null;
  end if;
  if not exists (
    select 1 from public.resolve_court_slots(p_club_id, p_court) rs
    where not rs.x and rs.t = p_time and rs.d = p_duration
  ) then
    return null;
  end if;
  v_starts := public.slot_start_ms(p_date_key, p_time);
  if v_starts <= (extract(epoch from now()) * 1000)::bigint then return null; end if;
  -- Chevauchement avec MES autres cours acceptés (verrou coach:jour, motif respond_lesson).
  perform pg_advisory_xact_lock(hashtext('lesson:' || v_uid || ':' || p_date_key));
  if exists (
    select 1 from public.lessons x
    where x.coach_id = v_uid and x.status = 'accepted' and x.date_key = p_date_key
      and public.hhmm_to_min(x."time") is not null
      and public.hhmm_to_min(x."time") < public.hhmm_to_min(p_time) + p_duration
      and public.hhmm_to_min(p_time) < public.hhmm_to_min(x."time") + x.duration_min
  ) then
    return null;
  end if;
  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), 'Coach'), phone
    into cname, cphone from public.profiles where id = v_uid;
  club_label := coalesce((select name from public.clubs c where c.id = p_club_id), p_club_id);
  begin
    insert into public.reservations (
      user_id, club_id, club_name, date_key, date_label, "time", starts_at, court, price, duration_min,
      players, invited, booked_by_name, booked_by_phone, coach_name, club_confirmed, status
    )
    values (
      v_uid, p_club_id, club_label, p_date_key, coalesce(p_date_label, ''), p_time, v_starts, p_court,
      v_price, p_duration, 1, '[]'::jsonb, cname, cphone, cname, false, 'booked'
    )
    returning id into res_id;
  exception when others then
    -- Conflit d'occupation (contrainte d'exclusion 23P01, terrain fermé, etc.) → refus propre.
    return null;
  end;
  insert into public.lessons (
    coach_id, coach_name, club_id, club_name, student_id, student_name,
    date_key, date_label, "time", court, starts_at, price, duration_min,
    status, responded_at, reservation_id, capacity, note
  )
  values (
    v_uid, cname, p_club_id, club_label, v_uid, 'Cours collectif',
    p_date_key, coalesce(p_date_label, ''), p_time, p_court, v_starts, v_price, p_duration,
    'accepted', now(), res_id, p_capacity, left(trim(coalesce(p_note, '')), 200)
  )
  returning id into new_id;
  return new_id;
end;
$$;

-- Élève : rejoint un cours collectif à venir. Blocage coach↔élève masqué en 'gone' (convention 53).
create or replace function public.join_group_lesson(p_lesson_id uuid)
returns text -- 'ok' | 'full' | 'gone' | 'already'
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
begin
  if auth.uid() is null then return 'gone'; end if;
  select * into l from public.lessons
    where id = p_lesson_id and status = 'accepted' and capacity > 1
    for update;
  if l.id is null then return 'gone'; end if;
  if l.coach_id = auth.uid() then return 'gone'; end if;
  if l.starts_at <= (extract(epoch from now()) * 1000)::bigint then return 'gone'; end if;
  -- La résa porteuse doit encore tenir (annulation coach/club → le cours n'existe plus).
  if not exists (select 1 from public.reservations r where r.id = l.reservation_id and r.status = 'booked') then
    return 'gone';
  end if;
  if exists (select 1 from public.blocked_users b
             where (b.blocker_id = l.coach_id and b.blocked_id = auth.uid())
                or (b.blocker_id = auth.uid() and b.blocked_id = l.coach_id)) then
    return 'gone';
  end if;
  if exists (select 1 from public.lesson_students s where s.lesson_id = p_lesson_id and s.user_id = auth.uid()) then
    return 'already';
  end if;
  if (select count(*) from public.lesson_students s where s.lesson_id = p_lesson_id) >= l.capacity then
    return 'full';
  end if;
  insert into public.lesson_students (lesson_id, user_id) values (p_lesson_id, auth.uid());
  return 'ok';
end;
$$;

-- Élève : se désinscrit AVANT le début du cours. true = désinscrit.
create or replace function public.leave_group_lesson(p_lesson_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
begin
  if auth.uid() is null then return false; end if;
  select * into l from public.lessons where id = p_lesson_id and status = 'accepted';
  if l.id is null then return false; end if;
  if l.starts_at <= (extract(epoch from now()) * 1000)::bigint then return false; end if;
  delete from public.lesson_students where lesson_id = p_lesson_id and user_id = auth.uid();
  return found;
end;
$$;

-- Cours collectifs À VENIR d'un club (fiche club, écran coachs). `mine` = j'y suis inscrit.
-- Les cours d'un coach bloqué (un sens OU l'autre) sont MASQUÉS (convention 53).
create or replace function public.fetch_group_lessons(p_club_id text)
returns table (
  id uuid, coach_id uuid, coach_name text, date_key text, "time" text, court text,
  duration_min int, capacity int, note text, joined int, mine boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select l.id, l.coach_id, l.coach_name, l.date_key, l."time", l.court,
         l.duration_min, l.capacity, l.note,
         (select count(*) from public.lesson_students s where s.lesson_id = l.id)::int,
         exists (select 1 from public.lesson_students s where s.lesson_id = l.id and s.user_id = auth.uid())
    from public.lessons l
    where l.club_id = p_club_id
      and l.status = 'accepted'
      and l.capacity > 1
      and l.starts_at > (extract(epoch from now()) * 1000)::bigint
      and exists (select 1 from public.reservations r where r.id = l.reservation_id and r.status = 'booked')
      and not exists (select 1 from public.blocked_users b
                      where (b.blocker_id = l.coach_id and b.blocked_id = auth.uid())
                         or (b.blocker_id = auth.uid() and b.blocked_id = l.coach_id))
    order by l.starts_at
    limit 30;
$$;

-- Mes cours collectifs rejoints, à venir (« Mes réservations » côté élève).
create or replace function public.my_group_lessons()
returns table (
  id uuid, club_id text, club_name text, coach_name text, date_key text, "time" text,
  court text, duration_min int, note text, starts_at bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select l.id, l.club_id, l.club_name, l.coach_name, l.date_key, l."time",
         l.court, l.duration_min, l.note, l.starts_at
    from public.lesson_students s
    join public.lessons l on l.id = s.lesson_id
    where s.user_id = auth.uid()
      and l.status = 'accepted'
      and l.starts_at > (extract(epoch from now()) * 1000)::bigint
      and exists (select 1 from public.reservations r where r.id = l.reservation_id and r.status = 'booked')
    order by l.starts_at
    limit 30;
$$;

revoke execute on function public.create_group_lesson(text, text, text, text, integer, integer, text, text) from public, anon;
revoke execute on function public.join_group_lesson(uuid) from public, anon;
revoke execute on function public.leave_group_lesson(uuid) from public, anon;
revoke execute on function public.fetch_group_lessons(text) from public, anon;
revoke execute on function public.my_group_lessons() from public, anon;
grant execute on function public.create_group_lesson(text, text, text, text, integer, integer, text, text) to authenticated;
grant execute on function public.join_group_lesson(uuid) to authenticated;
grant execute on function public.leave_group_lesson(uuid) to authenticated;
grant execute on function public.fetch_group_lessons(text) to authenticated;
grant execute on function public.my_group_lessons() to authenticated;

-- ── 20) Annonces club (suivre un club) ──────────────────────────────────────────

create table if not exists public.club_news (
  id uuid primary key default gen_random_uuid(),
  club_id text not null check (length(club_id) between 1 and 64),
  title text not null,
  body text not null default '',
  link text not null default '',
  push boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists club_news_by_club on public.club_news (club_id, created_at desc);

alter table public.club_news enable row level security;
drop policy if exists club_news_select_all on public.club_news;
create policy club_news_select_all on public.club_news
  for select using (true); -- annonces publiques (fiche club, lisible par tout joueur connecté)
-- Écritures via RPC gérant.

-- Gérant : crée (p_id null) ou modifie une annonce de SON club. Lien '' ou https strict.
-- p_push n'a d'effet qu'à la CRÉATION (le webhook club_news est INSERT seul — pas de re-push
-- silencieusement promis sur une correction de texte).
create or replace function public.upsert_club_news(
  p_id uuid,
  p_club_id text,
  p_title text,
  p_body text,
  p_link text,
  p_push boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_title text := left(trim(coalesce(p_title, '')), 120);
  v_link text := trim(coalesce(p_link, ''));
begin
  if not public.can_manage_club(p_club_id) then return null; end if;
  if length(v_title) < 3 then return null; end if;
  if v_link <> '' and (v_link !~ '^https://' or length(v_link) > 300) then return null; end if;
  if p_id is null then
    -- Écriture bornée : 100 annonces max par club (la fiche n'en montre que 10).
    if (select count(*) from public.club_news n where n.club_id = p_club_id) >= 100 then return null; end if;
    insert into public.club_news (club_id, title, body, link, push, created_by)
      values (p_club_id, v_title, left(trim(coalesce(p_body, '')), 1000), v_link, coalesce(p_push, false), auth.uid())
      returning id into v_id;
  else
    update public.club_news
      set title = v_title, body = left(trim(coalesce(p_body, '')), 1000), link = v_link
      where id = p_id and club_id = p_club_id
      returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_club_news(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club text;
begin
  select club_id into v_club from public.club_news where id = p_id;
  if v_club is null or not public.can_manage_club(v_club) then return false; end if;
  delete from public.club_news where id = p_id;
  return true;
end;
$$;

-- Fiche club : les 10 dernières annonces.
create or replace function public.fetch_club_news(p_club_id text)
returns table (id uuid, title text, body text, link text, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select n.id, n.title, n.body, n.link, n.created_at
    from public.club_news n
    where n.club_id = p_club_id
    order by n.created_at desc
    limit 10;
$$;

revoke execute on function public.upsert_club_news(uuid, text, text, text, text, boolean) from public, anon;
revoke execute on function public.delete_club_news(uuid) from public, anon;
revoke execute on function public.fetch_club_news(text) from public, anon;
grant execute on function public.upsert_club_news(uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.delete_club_news(uuid) to authenticated;
grant execute on function public.fetch_club_news(text) to authenticated;

-- ── 21) Avis structurés ─────────────────────────────────────────────────────────

alter table public.reviews add column if not exists rating_courts smallint;
alter table public.reviews add column if not exists rating_service smallint;
alter table public.reviews add column if not exists rating_facilities smallint;
alter table public.reviews drop constraint if exists reviews_rating_courts_chk;
alter table public.reviews add constraint reviews_rating_courts_chk
  check (rating_courts is null or (rating_courts >= 1 and rating_courts <= 5));
alter table public.reviews drop constraint if exists reviews_rating_service_chk;
alter table public.reviews add constraint reviews_rating_service_chk
  check (rating_service is null or (rating_service >= 1 and rating_service <= 5));
alter table public.reviews drop constraint if exists reviews_rating_facilities_chk;
alter table public.reviews add constraint reviews_rating_facilities_chk
  check (rating_facilities is null or (rating_facilities >= 1 and rating_facilities <= 5));

-- submit_review gagne 3 notes OPTIONNELLES (default null → les anciens clients continuent de
-- marcher). ⚠️ DROP de l'ancienne signature 3-args OBLIGATOIRE : sinon deux surcharges
-- coexistent et PostgREST ne sait plus choisir (« could not choose best candidate »).
-- Le drop de la signature 6-args rend le fichier RE-COLLABLE (idempotence §8).
drop function if exists public.submit_review(text, integer, text);
drop function if exists public.submit_review(text, integer, text, integer, integer, integer);
create function public.submit_review(
  p_club_id text,
  p_rating integer,
  p_text text,
  p_rating_courts integer default null,
  p_rating_service integer default null,
  p_rating_facilities integer default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  aname text;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if uid is null or p_rating < 1 or p_rating > 5 then return false; end if;
  -- Notes par critère : null = non renseignée, sinon bornée [1,5] (refus net, pas d'écrêtage).
  if p_rating_courts is not null and (p_rating_courts < 1 or p_rating_courts > 5) then return false; end if;
  if p_rating_service is not null and (p_rating_service < 1 or p_rating_service > 5) then return false; end if;
  if p_rating_facilities is not null and (p_rating_facilities < 1 or p_rating_facilities > 5) then return false; end if;
  -- « A réellement joué ici » = réservation CONFIRMÉE passée dont il est l'AUTEUR,
  -- OU participation ACCEPTÉE à une réservation confirmée passée de ce club (invité par un ami).
  if not exists (
    select 1 from public.reservations r
    where r.user_id = uid and r.club_id = p_club_id and r.status = 'booked' and r.starts_at <= now_ms
  ) and not exists (
    select 1
    from public.reservation_participants p
    join public.reservations r on r.id = p.reservation_id
    where p.user_id = uid and p.status = 'accepted'
      and r.club_id = p_club_id and r.status = 'booked' and r.starts_at <= now_ms
  ) then
    return false;
  end if;
  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), 'Joueur')
    into aname from public.profiles where id = uid;
  insert into public.reviews (club_id, user_id, author_name, rating, text, rating_courts, rating_service, rating_facilities)
    values (p_club_id, uid, aname, p_rating, nullif(trim(coalesce(p_text, '')), ''),
            p_rating_courts, p_rating_service, p_rating_facilities)
    on conflict (club_id, user_id)
      do update set rating = excluded.rating, text = excluded.text,
                    rating_courts = excluded.rating_courts, rating_service = excluded.rating_service,
                    rating_facilities = excluded.rating_facilities, created_at = now();
  return true;
end;
$$;

-- La SIGNATURE de retour change (colonnes ajoutées EN FIN) → drop + create (convention §8).
-- avg(col) ignore les null nativement ; structured_count = avis portant AU MOINS un critère
-- (le client n'affiche les moyennes par critère qu'à partir de 3 avis structurés).
drop function if exists public.fetch_club_ratings();
create function public.fetch_club_ratings()
returns table (
  club_id text, avg_rating numeric, review_count integer,
  avg_courts numeric, avg_service numeric, avg_facilities numeric, structured_count integer
)
language sql
security definer
set search_path = public
as $$
  select r.club_id,
         round(avg(r.rating)::numeric, 1),
         count(*)::integer,
         round(avg(r.rating_courts)::numeric, 1),
         round(avg(r.rating_service)::numeric, 1),
         round(avg(r.rating_facilities)::numeric, 1),
         count(*) filter (where r.rating_courts is not null or r.rating_service is not null
                             or r.rating_facilities is not null)::integer
  from public.reviews r
  group by r.club_id;
$$;

-- ⚠️ Le drop + create EFFACE les privilèges antérieurs (leçon de la 81 sur fetch_open_matches) :
-- on re-ferme anon et on re-donne authenticated EXPLICITEMENT sur les deux fonctions.
revoke execute on function public.submit_review(text, integer, text, integer, integer, integer) from public, anon;
revoke execute on function public.fetch_club_ratings() from public, anon;
grant execute on function public.submit_review(text, integer, text, integer, integer, integer) to authenticated;
grant execute on function public.fetch_club_ratings() to authenticated;
