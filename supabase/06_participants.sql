-- PadelConnect — réservations PARTAGÉES (à coller dans Supabase → SQL Editor → Run).
-- Une réservation reste UNIQUE (un terrain, une commission). On y rattache les amis
-- invités qui ont un compte (reconnus par leur numéro) → la résa apparaît aussi chez eux.
-- Idempotent.

create table if not exists public.reservation_participants (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (reservation_id, user_id)
);

alter table public.reservation_participants enable row level security;

-- Je vois mes lignes de participant ; l'auteur de la résa voit celles de SA résa.
drop policy if exists "rp_select" on public.reservation_participants;
create policy "rp_select" on public.reservation_participants
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.reservations r where r.id = reservation_id and r.user_id = auth.uid())
  );

-- Un participant peut LIRE la réservation où il est invité (en plus de l'auteur/club/opérateur).
drop policy if exists "reservations_select_participant" on public.reservations;
create policy "reservations_select_participant" on public.reservations
  for select using (
    exists (select 1 from public.reservation_participants p where p.reservation_id = reservations.id and p.user_id = auth.uid())
  );

-- Rattache des amis à une résa, par numéro — SECURITY DEFINER (résout les numéros sans
-- exposer les profils). Appelable UNIQUEMENT par l'auteur de la réservation. Comparaison
-- sur les 10 derniers chiffres (tolère +225 / espaces). Renvoie le nombre rattachés.
create or replace function public.link_participants(p_reservation_id uuid, p_phones text[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
  n int := 0;
  ph text;
  uid2 uuid;
begin
  select user_id into owner from public.reservations where id = p_reservation_id;
  if owner is null or owner <> auth.uid() then return 0; end if;
  foreach ph in array coalesce(p_phones, '{}') loop
    if length(regexp_replace(ph, '\D', '', 'g')) < 8 then continue; end if;
    select id into uid2 from public.profiles p
      where right(regexp_replace(p.phone, '\D', '', 'g'), 10) = right(regexp_replace(ph, '\D', '', 'g'), 10)
        and p.id <> owner
      limit 1;
    if uid2 is not null then
      insert into public.reservation_participants (reservation_id, user_id)
        values (p_reservation_id, uid2)
        on conflict (reservation_id, user_id) do nothing;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

grant execute on function public.link_participants(uuid, text[]) to authenticated;
