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

-- Matchs ouverts À VENIR avec au moins une place — SANS donnée sensible : jamais le
-- téléphone, et le créateur est affiché « Prénom N. » (même règle que le classement, 44).
-- jsonb_typeof : un `invited` forgé non-tableau ne doit pas faire planter la liste de tous.
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
         case
           when coalesce(trim(r.booked_by_name), '') = '' then 'Un joueur'
           else split_part(trim(r.booked_by_name), ' ', 1) ||
                case when split_part(trim(r.booked_by_name), ' ', 2) <> ''
                     then ' ' || left(split_part(trim(r.booked_by_name), ' ', 2), 1) || '.'
                     else '' end
         end,
         greatest(0, 3 - coalesce(case when jsonb_typeof(r.invited) = 'array' then jsonb_array_length(r.invited) end, 0))::int
    from public.reservations r
    where r.status = 'booked'
      and r.open_match
      and r.starts_at > (extract(epoch from now()) * 1000)::bigint
      and coalesce(case when jsonb_typeof(r.invited) = 'array' then jsonb_array_length(r.invited) end, 0) < 3
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
  v_entry_id text;
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
  if coalesce(case when jsonb_typeof(r.invited) = 'array' then jsonb_array_length(r.invited) end, 0) >= 3 then
    return 'full';
  end if;
  select coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Un joueur')
    into v_name from public.profiles p where p.id = auth.uid();
  -- Directement 'accepted' (≠ 'invited') : c'est LUI qui a choisi de rejoindre. Un joueur qui
  -- avait refusé une invitation sur ce match peut re-rejoindre (upsert).
  insert into public.reservation_participants (reservation_id, user_id, status)
    values (p_id, auth.uid(), 'accepted')
    on conflict (reservation_id, user_id) do update set status = 'accepted';
  -- `invited` contient des OBJETS {id,name,confirmed} (modèle de l'app — jamais une chaîne
  -- brute) ; l'id déterministe déduplique une boucle rejoindre→refuser→rejoindre, qui sinon
  -- gonflerait la liste jusqu'à verrouiller le match. players suit (affichage club/accueil).
  v_entry_id := 'open-' || auth.uid();
  if not exists (select 1 from jsonb_array_elements(coalesce(case when jsonb_typeof(r.invited) = 'array' then r.invited end, '[]'::jsonb)) e
                 where e ->> 'id' = v_entry_id) then
    update public.reservations
      set invited = coalesce(case when jsonb_typeof(invited) = 'array' then invited end, '[]'::jsonb)
                    || jsonb_build_object('id', v_entry_id, 'name', v_name, 'confirmed', true),
          players = least(4, coalesce(players, 1) + 1)
      where id = p_id;
  end if;
  return 'ok';
end;
$$;

grant execute on function public.join_open_match(uuid) to authenticated;

-- Un participant qui a REFUSÉ (ou quitté) ne lit plus la réservation : sans ça, rejoindre
-- puis refuser laissait à un inconnu la lecture durable de la ligne (dont booked_by_phone).
-- Les participants ACTIFS, eux, la lisent — les 4 joueurs d'un match se coordonnent.
create or replace function public.is_reservation_participant(p_res uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.reservation_participants p
    where p.reservation_id = p_res and p.user_id = auth.uid() and p.status <> 'declined'
  );
$$;
