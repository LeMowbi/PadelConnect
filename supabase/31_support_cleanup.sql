-- PadelConnect — nettoyage automatique des signalements RÉSOLUS (Supabase → SQL Editor → Run).
-- Idempotent.
--
-- Les messages d'aide / signalements « résolus » n'ont pas à s'empiler indéfiniment dans l'espace
-- opérateur. On horodate la résolution (resolved_at) et on SUPPRIME automatiquement ceux résolus
-- depuis plus de 7 jours. Le nettoyage est déclenché sans tâche planifiée : l'app appelle la
-- fonction de purge à chaque ouverture de l'espace opérateur (voir fetchSupportMessages).

alter table public.support_messages add column if not exists resolved_at timestamptz;

-- Horodate le passage à « resolved » (et remet à zéro si le message est rouvert) — quel que soit
-- le chemin de mise à jour (RPC ou update direct de l'opérateur).
create or replace function public.support_stamp_resolved()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'resolved' and (old.status is distinct from 'resolved') then
    new.resolved_at := now();
  elsif new.status <> 'resolved' then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_support_stamp_resolved on public.support_messages;
create trigger trg_support_stamp_resolved
  before update on public.support_messages
  for each row execute function public.support_stamp_resolved();

-- Purge des signalements résolus depuis plus de 7 jours. Réservée à l'opérateur (SECURITY DEFINER
-- + garde de rôle). Renvoie le nombre de lignes supprimées.
create or replace function public.purge_old_resolved_support()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return 0; -- seul l'opérateur déclenche la purge
  end if;
  with del as (
    delete from public.support_messages
    where status = 'resolved' and resolved_at is not null and resolved_at < now() - interval '7 days'
    returning 1
  )
  select count(*) into n from del;
  return n;
end;
$$;

grant execute on function public.purge_old_resolved_support() to authenticated;
