-- PadelConnect — boosts « Sponsorisé » côté serveur (à coller dans Supabase → SQL Editor → Run).
-- Idempotent.
--
-- Jusqu'ici un boost était LOCAL à l'appareil de l'opérateur → invisible des joueurs. Cette
-- table le rend réel : visible par TOUS (le club boosté remonte en tête avec son badge doré),
-- avec une date d'expiration. Écriture réservée à l'opérateur.

create table if not exists public.club_boost (
  club_id text primary key,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.club_boost enable row level security;

-- Lecture publique (chaque joueur applique le boost à l'affichage).
drop policy if exists "club_boost_select" on public.club_boost;
create policy "club_boost_select" on public.club_boost for select using (true);

-- Active/prolonge un boost (p_expires_at) ou le retire (p_expires_at null). Opérateur seulement.
create or replace function public.set_club_boost(p_club_id text, p_expires_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return false; -- réservé à l'opérateur
  end if;
  if p_expires_at is null then
    delete from public.club_boost where club_id = p_club_id;
  else
    insert into public.club_boost (club_id, expires_at)
      values (p_club_id, p_expires_at)
      on conflict (club_id) do update set expires_at = excluded.expires_at, updated_at = now();
  end if;
  return true;
end;
$$;

grant execute on function public.set_club_boost(text, timestamptz) to authenticated;
