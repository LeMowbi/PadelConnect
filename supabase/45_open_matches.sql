-- PadelConnect — MATCHS OUVERTS, modèle Playtomic (SQL Editor → Run). Idempotent.
--
-- Le créateur réserve son terrain NORMALEMENT (terrain bloqué direct, le club a sa
-- réservation garantie quoi qu'il arrive) et peut l'ouvrir aux autres joueurs : le match
-- apparaît alors dans « Matchs ouverts » (onglet Réserver) et chacun peut REJOINDRE une
-- des places restantes (padel = 4 joueurs : le créateur + 3). Rejoindre réutilise le
-- circuit des réservations partagées : une ligne reservation_participants directement
-- « accepted » + le prénom ajouté à `invited` — plannings club, partage des frais et
-- push (webhook reservation_participants) fonctionnent donc à l'identique. GRATUIT pour
-- tous (décision porteur : c'est le moteur de croissance — un futur Gold l'ÉPINGLERA
-- en tête, il ne le verrouillera pas).

alter table public.reservations
  add column if not exists open_match boolean not null default false,
  add column if not exists open_level text not null default '';

-- Matchs ouverts À VENIR avec au moins une place — SANS donnée sensible (jamais le téléphone).
create or replace function public.fetch_open_matches()
returns table (
  id uuid, club_id text, club_name text, date_key text, date_label text, "time" text, court text,
  starts_at bigint, open_level text, creator_id uuid, creator_name text, places_left int
)
language sql
security definer
set search_path = public
stable
as $$
  select r.id, r.club_id, r.club_name, r.date_key, r.date_label, r."time", r.court, r.starts_at,
         r.open_level, r.user_id,
         coalesce(nullif(r.booked_by_name, ''), 'Un joueur'),
         greatest(0, 3 - coalesce(jsonb_array_length(r.invited), 0))::int
    from public.reservations r
    where r.status = 'booked'
      and r.open_match
      and r.starts_at > (extract(epoch from now()) * 1000)::bigint
      and coalesce(jsonb_array_length(r.invited), 0) < 3
    order by r.starts_at;
$$;

grant execute on function public.fetch_open_matches() to authenticated;

-- Rejoindre un match ouvert : place prise IMMÉDIATEMENT (pas d'attente de validation — le
-- créateur est prévenu par push). `for update` : deux joueurs qui tapent en même temps ne
-- prennent pas la même dernière place.
create or replace function public.join_open_match(p_id uuid)
returns text -- 'ok' | 'full' | 'gone' | 'own' | 'already' | 'forbidden'
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_name text;
begin
  if auth.uid() is null then return 'forbidden'; end if;
  select * into r from public.reservations
    where id = p_id and status = 'booked' and open_match
    for update;
  if r.id is null or r.starts_at <= (extract(epoch from now()) * 1000)::bigint then return 'gone'; end if;
  if r.user_id = auth.uid() then return 'own'; end if;
  if exists (select 1 from public.reservation_participants rp
             where rp.reservation_id = p_id and rp.user_id = auth.uid() and rp.status <> 'declined') then
    return 'already';
  end if;
  if coalesce(jsonb_array_length(r.invited), 0) >= 3 then return 'full'; end if;
  select coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Un joueur')
    into v_name from public.profiles p where p.id = auth.uid();
  -- Directement 'accepted' (≠ 'invited') : c'est LUI qui a choisi de rejoindre. Un joueur qui
  -- avait refusé une invitation sur ce match peut re-rejoindre (upsert).
  insert into public.reservation_participants (reservation_id, user_id, status)
    values (p_id, auth.uid(), 'accepted')
    on conflict (reservation_id, user_id) do update set status = 'accepted';
  update public.reservations
    set invited = coalesce(invited, '[]'::jsonb) || to_jsonb(v_name)
    where id = p_id;
  return 'ok';
end;
$$;

grant execute on function public.join_open_match(uuid) to authenticated;
