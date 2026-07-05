-- PadelConnect — DURCISSEMENT CONCURRENCE (audit). À coller dans SQL Editor → Run, APRÈS la 58.
-- Idempotent (create or replace). Corrige deux courses TOCTOU repérées à l'audit :
--   • close_competition : deux clôtures simultanées (l'organisateur ET un gérant du club hôte
--     peuvent clôturer) ré-appliquaient le +0,5 de niveau au vainqueur (inflation, bornée [1,7]).
--   • register_competition : `count` puis `insert` sans verrou → deux inscriptions simultanées sur
--     la DERNIÈRE place passaient toutes les deux (capacité dépassée de 1).
-- Aucune colonne, aucune policy : uniquement le corps de ces deux fonctions.

-- ─── 1) Clôture de tournoi : l'UPDATE porte désormais la garde de statut = verrou atomique ────
-- La 1ʳᵉ clôture bascule status 'published'→'closed' ; la 2ᵉ (débloquée après commit) ne matche
-- plus AUCUNE ligne (status ≠ 'published') → `if not found` → sortie, l'attribution de niveau ne
-- s'exécute pas deux fois. Corps IDENTIQUE à la 44 hormis la clause `and status='published'` + le
-- `if not found`. (Le classement, lui, était déjà sûr : les points se recalculent à la lecture.)
create or replace function public.close_competition(p_id uuid, p_winner text, p_second text, p_third text, p_loser text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_club text;
  v_official boolean;
  v_winner text := nullif(trim(coalesce(p_winner, '')), '');
  v_loser text := nullif(trim(coalesce(p_loser, '')), '');
  v_winner_n int;
  v_loser_n int;
begin
  select organizer_id, club_id, official into v_owner, v_club, v_official
    from public.competitions where id = p_id and status = 'published';
  if v_owner is null then return false; end if;
  if v_owner <> auth.uid() and not public.can_manage_club(v_club) then return false; end if;
  update public.competitions
    set status = 'closed',
        winner = v_winner,
        second = nullif(trim(coalesce(p_second, '')), ''),
        third = nullif(trim(coalesce(p_third, '')), ''),
        loser = v_loser,
        closed_at = now()
    where id = p_id and status = 'published';
  if not found then return false; end if; -- déjà clôturé par une transaction concurrente

  if v_official then
    -- Autorise l'écriture de `level` pour cette transaction uniquement (le trigger la laissera passer).
    perform set_config('padel.level_write', 'on', true);
    if v_winner is not null then
      -- Combien d'inscriptions de CE tournoi portent la chaîne gagnante ? (anti-collision)
      select count(*) into v_winner_n
        from public.competition_registrations rg
        join public.profiles pr on pr.id = rg.user_id
        where rg.competition_id = p_id
          and trim(coalesce(pr.first_name, '') || ' & ' || rg.partner) = v_winner;
      if v_winner_n = 1 then
        update public.profiles pr
          set level = least(7, greatest(1, coalesce(pr.level, 3) + 0.5))
          from public.competition_registrations rg
          where rg.competition_id = p_id and rg.user_id = pr.id
            and trim(coalesce(pr.first_name, '') || ' & ' || rg.partner) = v_winner;
        -- Vainqueur ANCRÉ une fois pour toutes (même règle d'unicité que le niveau) :
        -- le classement (fetch_leaderboard) compte sur cet id, jamais sur la chaîne.
        update public.competitions c
          set winner_user_id = (
            select rg.user_id from public.competition_registrations rg
              join public.profiles pr on pr.id = rg.user_id
              where rg.competition_id = p_id
                and trim(coalesce(pr.first_name, '') || ' & ' || rg.partner) = v_winner
              limit 1)
          where c.id = p_id;
      end if;
    end if;
    if v_loser is not null then
      select count(*) into v_loser_n
        from public.competition_registrations rg
        join public.profiles pr on pr.id = rg.user_id
        where rg.competition_id = p_id
          and trim(coalesce(pr.first_name, '') || ' & ' || rg.partner) = v_loser;
      if v_loser_n = 1 then
        update public.profiles pr
          set level = least(7, greatest(1, coalesce(pr.level, 3) - 0.25))
          from public.competition_registrations rg
          where rg.competition_id = p_id and rg.user_id = pr.id
            and trim(coalesce(pr.first_name, '') || ' & ' || rg.partner) = v_loser;
      end if;
    end if;
  end if;
  return true;
end;
$$;

revoke execute on function public.close_competition(uuid, text, text, text, text) from public, anon;
grant execute on function public.close_competition(uuid, text, text, text, text) to authenticated;

-- ─── 2) Inscription à un tournoi : verrou consultatif par tournoi avant count+insert ─────────
-- Sérialise les inscriptions concurrentes au MÊME tournoi (même patron que la garde d'insertion
-- des réservations, 54) → la dernière place ne peut plus être prise deux fois. Corps IDENTIQUE à
-- la 26 hormis le `pg_advisory_xact_lock` en tête.
create or replace function public.register_competition(p_id uuid, p_partner text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity int;
  v_count int;
begin
  perform pg_advisory_xact_lock(hashtext('reg:' || p_id::text)); -- sérialise ce tournoi
  select capacity into v_capacity from public.competitions where id = p_id and status = 'published';
  if v_capacity is null then return false; end if; -- inexistant ou non publié
  select count(*) into v_count from public.competition_registrations where competition_id = p_id;
  if v_count >= v_capacity and not exists (
    select 1 from public.competition_registrations where competition_id = p_id and user_id = auth.uid()
  ) then
    return false; -- complet
  end if;
  insert into public.competition_registrations (competition_id, user_id, partner)
    values (p_id, auth.uid(), coalesce(nullif(trim(p_partner), ''), 'Partenaire'))
    on conflict (competition_id, user_id) do update set partner = excluded.partner;
  return true;
end;
$$;

revoke execute on function public.register_competition(uuid, text) from public, anon;
grant execute on function public.register_competition(uuid, text) to authenticated;
