-- PadelConnect — statut pilotable de N'IMPORTE QUEL club, y compris les clubs « de base »
-- embarqués dans l'app (à coller dans Supabase → SQL Editor → Run). Idempotent.
--
-- Permet à l'opérateur de basculer un club entre « Actif » (réservable) et « Bientôt »
-- (visible mais pas réservable) — ou de le masquer — depuis l'Espace opérateur, pour TOUS
-- les joueurs. Vaut pour les 9 clubs de base comme pour les clubs ajoutés via l'app.

create table if not exists public.club_status (
  club_id text primary key,
  status text not null check (status in ('active', 'coming_soon', 'hidden')),
  updated_at timestamptz not null default now()
);

alter table public.club_status enable row level security;

-- Lecture publique (tout compte connecté applique le statut).
drop policy if exists "club_status_select" on public.club_status;
create policy "club_status_select" on public.club_status for select using (true);

-- Écriture réservée à l'opérateur (via la fonction ci-dessous).
create or replace function public.set_base_club_status(p_club_id text, p_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return false; -- réservé à l'opérateur
  end if;
  if p_status not in ('active', 'coming_soon', 'hidden') then
    return false;
  end if;
  insert into public.club_status (club_id, status)
    values (p_club_id, p_status)
    on conflict (club_id) do update set status = excluded.status, updated_at = now();
  return true;
end;
$$;

grant execute on function public.set_base_club_status(text, text) to authenticated;
