-- PadelConnect — ROBUSTESSE config opérateur (audit v2). À coller dans SQL Editor → Run.
-- Idempotent. Deux durcissements :
--   1) set_tournament_fee / set_wave_link : UPSERT (INSERT … ON CONFLICT) au lieu d'un simple
--      UPDATE WHERE id=true. Si la ligne singleton venait à manquer, l'ancien UPDATE renvoyait
--      `true` SANS rien écrire → la modif de l'opérateur « se réinitialisait » en silence.
--      L'upsert garantit que la valeur est TOUJOURS persistée (ou la ligne créée).
--   2) tournament_config : lecture réservée aux comptes AUTHENTIFIÉS (le lien Wave marchand et le
--      montant des frais n'ont aucune raison d'être lisibles par un visiteur anonyme ; le site
--      public ne lit PAS cette table — il lit clubs/overrides/config/status).

-- ─── 1) Upserts idempotents ────────────────────────────────────────────────────────────────
create or replace function public.set_tournament_fee(p_amount integer)
  returns boolean
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return false; -- réservé à l'opérateur
  end if;
  insert into public.tournament_config (id, player_fee, updated_at)
    values (true, greatest(coalesce(p_amount, 0), 0), now())
    on conflict (id) do update set player_fee = excluded.player_fee, updated_at = now();
  return true;
end;
$$;

create or replace function public.set_wave_link(p_link text)
  returns boolean
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return false; -- réservé à l'opérateur
  end if;
  insert into public.tournament_config (id, wave_link, updated_at)
    values (true, nullif(trim(coalesce(p_link, '')), ''), now())
    on conflict (id) do update set wave_link = excluded.wave_link, updated_at = now();
  return true;
end;
$$;

revoke execute on function public.set_tournament_fee(integer) from public, anon;
revoke execute on function public.set_wave_link(text) from public, anon;
grant execute on function public.set_tournament_fee(integer) to authenticated;
grant execute on function public.set_wave_link(text) to authenticated;

-- ─── 2) Lecture de tournament_config réservée aux authentifiés (frais + lien Wave privés) ─────
drop policy if exists tournament_config_select on public.tournament_config;
create policy tournament_config_select on public.tournament_config
  for select to authenticated using (true);
