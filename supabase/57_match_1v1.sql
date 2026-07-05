-- PadelConnect — MATCH 1v1 (v2, demande porteur). À coller dans SQL Editor → Run.
-- Idempotent. Étend les matchs ouverts (45) : en plus du 2v2 (4 joueurs), un joueur peut
-- ouvrir un match 1v1 (2 joueurs). Une seule colonne `open_capacity` (2 ou 4) ; toute la
-- logique (places restantes, garde « complet ») en dérive. Le terrain reste bloqué direct,
-- la durée de session (1h30), les tarifs et la commission NE CHANGENT PAS — c'est juste le
-- nombre de joueurs attendus qui varie.

alter table public.reservations
  add column if not exists open_capacity int not null default 4; -- 2 = 1v1 · 4 = 2v2

-- Garde serveur : seules 2 (1v1) et 4 (2v2) sont valides — l'app ne propose que ça, mais un appel
-- REST direct pourrait forcer une valeur aberrante (fausserait places_left / la garde « complet »).
-- Idempotent : on retire l'ancienne contrainte avant de la (re)poser. Les lignes existantes valent 4.
alter table public.reservations drop constraint if exists reservations_open_capacity_chk;
alter table public.reservations add constraint reservations_open_capacity_chk check (open_capacity in (2, 4));

-- Matchs ouverts À VENIR avec au moins une place — places restantes = capacité − 1 (créateur)
-- − joueurs déjà arrivés. On expose aussi open_capacity pour que l'app affiche « 1v1 »/« 2v2 ».
-- La 45 renvoyait 11 colonnes ; on en ajoute une (capacity) → le TYPE DE RETOUR change,
-- ce qu'un simple « create or replace » refuse (42P13). On DROP d'abord puis on recrée.
drop function if exists public.fetch_open_matches();
create or replace function public.fetch_open_matches()
returns table (
  id uuid, club_id text, club_name text, date_key text, date_label text, "time" text, court text,
  starts_at bigint, open_level text, creator_id uuid, creator_name text, places_left int, capacity int
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
         greatest(0, coalesce(r.open_capacity, 4) - 1
           - coalesce(case when jsonb_typeof(r.invited) = 'array' then jsonb_array_length(r.invited) end, 0))::int,
         coalesce(r.open_capacity, 4)::int
    from public.reservations r
    where r.status = 'booked'
      and r.open_match
      and r.starts_at > (extract(epoch from now()) * 1000)::bigint
      and coalesce(case when jsonb_typeof(r.invited) = 'array' then jsonb_array_length(r.invited) end, 0)
          < coalesce(r.open_capacity, 4) - 1
    order by r.starts_at;
$$;

-- Convention audit 7 : on retire le grant EXECUTE que Postgres accorde à PUBLIC par défaut
-- (sinon `anon` pourrait lire les matchs ouverts via REST — fuite lieu/horaire/prénom).
revoke execute on function public.fetch_open_matches() from public, anon;
grant execute on function public.fetch_open_matches() to authenticated;

-- Rejoindre : la garde « complet » utilise la capacité du match (2 ou 4). `for update` : deux
-- joueurs qui tapent en même temps ne prennent pas la même dernière place.
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
  v_cap int;
begin
  if auth.uid() is null then return 'forbidden'; end if;
  select * into r from public.reservations
    where id = p_id and status = 'booked' and open_match
    for update;
  if r.id is null or r.starts_at <= (extract(epoch from now()) * 1000)::bigint then return 'gone'; end if;
  if r.user_id = auth.uid() then return 'own'; end if;
  -- Blocage (exigé par l'App Store 1.2, garde ajoutée en 53) : un compte bloqué — dans un sens
  -- OU l'autre — ne peut pas rejoindre le match. RÉ-INSÉRÉ ici car cette redéfinition de
  -- join_open_match (57, pour open_capacity) écrase celle de la 53 : sans ce bloc, le blocage des
  -- matchs ouverts serait silencieusement levé à l'application des migrations v2.
  if exists (select 1 from public.blocked_users b
             where (b.blocker_id = r.user_id and b.blocked_id = auth.uid())
                or (b.blocker_id = auth.uid() and b.blocked_id = r.user_id)) then
    return 'gone';
  end if;
  if exists (select 1 from public.reservation_participants rp
             where rp.reservation_id = p_id and rp.user_id = auth.uid() and rp.status <> 'declined') then
    return 'already';
  end if;
  v_cap := coalesce(r.open_capacity, 4);
  if coalesce(case when jsonb_typeof(r.invited) = 'array' then jsonb_array_length(r.invited) end, 0) >= v_cap - 1 then
    return 'full';
  end if;
  select coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Un joueur')
    into v_name from public.profiles p where p.id = auth.uid();
  insert into public.reservation_participants (reservation_id, user_id, status)
    values (p_id, auth.uid(), 'accepted')
    on conflict (reservation_id, user_id) do update set status = 'accepted';
  v_entry_id := 'open-' || auth.uid();
  if not exists (select 1 from jsonb_array_elements(coalesce(case when jsonb_typeof(r.invited) = 'array' then r.invited end, '[]'::jsonb)) e
                 where e ->> 'id' = v_entry_id) then
    update public.reservations
      set invited = coalesce(case when jsonb_typeof(invited) = 'array' then invited end, '[]'::jsonb)
                    || jsonb_build_object('id', v_entry_id, 'name', v_name, 'confirmed', true),
          players = least(v_cap, coalesce(players, 1) + 1)
      where id = p_id;
  end if;
  return 'ok';
end;
$$;

revoke execute on function public.join_open_match(uuid) from public, anon;
grant execute on function public.join_open_match(uuid) to authenticated;
