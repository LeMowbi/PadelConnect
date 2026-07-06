-- PadelConnect — DURCISSEMENT audit n°9 (SQL Editor → Run). Idempotent. À coller APRÈS 59.
-- Deux correctifs indépendants :
--   1) create_competition : RESTAURER la branche 'operator' (perdue dans la 53).
--   2) reject_club_request : refuser une demande de club SANS laisser le demandeur bloqué
--      sur « club en cours de validation ».

-- ─── 1) create_competition : restaurer la branche 'operator' ──────────────────────
-- La 53 (durcissement audit 7) a redéfini create_competition en NE gardant que les branches
-- 'club' et « else » (joueur) — la branche 'operator' (tournois OFFICIELS PadelConnect, 43) a
-- disparu. Conséquences en production :
--   a) un tournoi créé par l'opérateur « en tant que PadelConnect » tombait dans le « else » →
--      official=false : la clôture n'attribuait JAMAIS le niveau (seule voie sanctionnée) et
--      facturait à tort une commission joueur ;
--   b) le « else » ne contrôle AUCUN rôle → n'importe quel compte pouvait forger
--      p_organizer_type='operator' et obtenir la présentation premium « officiel » (spoofing).
-- On reprend EXACTEMENT la 53 (verrou + competition_slot_conflict sur la branche club) et on
-- RÉ-INSÈRE la branche 'operator' de la 43 (role='operator', official, 'pending', commission 0 ;
-- la double occupation est vérifiée à la validation par approve_competition).
create or replace function public.create_competition(
  p_organizer_type text, p_organizer_name text, p_organizer_phone text, p_club_id text, p_club_name text,
  p_title text, p_format text, p_level text, p_date_key text, p_end_date_key text,
  p_courts text[], p_slots text[], p_capacity int, p_fee text, p_reward text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  v_official boolean;
  v_status text;
  v_commission int := 0;
begin
  if auth.uid() is null then return null; end if;
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_date_key), '') = '' then return null; end if;

  if p_organizer_type = 'club' then
    if not public.can_manage_club(p_club_id) then return null; end if; -- réservé au gérant du club
    perform pg_advisory_xact_lock(hashtext(p_club_id || ':' || p_date_key));
    if public.competition_slot_conflict(p_club_id, p_date_key, p_end_date_key, coalesce(p_slots, '{}'), coalesce(p_courts, '{}')) then
      return null;
    end if;
    v_official := true;
    v_status := 'published';
  elsif p_organizer_type = 'operator' then
    -- Tournoi officiel PADELCONNECT : RÉSERVÉ au compte opérateur (contrôle de rôle = anti-spoofing).
    -- En attente tant que le club hôte ne l'a pas validé (approve_competition vérifie la double
    -- occupation avec le même verrou consultatif). Officiel (compte pour le niveau), sans commission.
    if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
      return null;
    end if;
    v_official := true;
    v_status := 'pending';
  else
    v_official := false;
    v_status := 'pending';
    select player_fee into v_commission from public.tournament_config where id = true;
    v_commission := coalesce(v_commission, 0);
  end if;

  insert into public.competitions (
    organizer_id, organizer_type, organizer_name, organizer_phone, club_id, club_name,
    title, format, level, date_key, end_date_key, courts, slots,
    capacity, fee, reward, official, status, commission
  ) values (
    auth.uid(), p_organizer_type, coalesce(p_organizer_name, ''), nullif(trim(coalesce(p_organizer_phone, '')), ''), p_club_id, p_club_name,
    trim(p_title), coalesce(p_format, ''), coalesce(p_level, ''), p_date_key, nullif(p_end_date_key, ''),
    coalesce(p_courts, '{}'), coalesce(p_slots, '{}'),
    greatest(coalesce(p_capacity, 8), 1), coalesce(p_fee, ''), coalesce(p_reward, ''),
    v_official, v_status, v_commission
  ) returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.create_competition(text, text, text, text, text, text, text, text, text, text, text[], text[], int, text, text) from public, anon;
grant execute on function public.create_competition(text, text, text, text, text, text, text, text, text, text, text[], text[], int, text, text) to authenticated;

-- ─── 2) reject_club_request : refuser proprement une demande de compte club ────────
-- Avant : l'opérateur « écartait » une demande via un simple UPDATE club_requests.status='rejected',
-- MAIS profiles.account_type restait 'club' → l'app du demandeur affichait « club en cours de
-- validation » INDÉFINIMENT (impasse, aucun recours). Cette RPC (réservée à l'opérateur) refuse la
-- demande ET repasse le demandeur en compte JOUEUR (son RÔLE était déjà 'player' — seul
-- account_type restait bloqué) : il redevient un joueur normal, la carte « en attente » disparaît.
create or replace function public.reject_club_request(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return false; -- réservé à l'opérateur
  end if;
  update public.club_requests set status = 'rejected' where id = p_id
    returning requested_by into v_user;
  if not found then return false; end if;
  -- Le demandeur redevient joueur (no-op s'il l'était déjà — cas d'une demande « Inscrire mon club »
  -- envoyée par un joueur, où account_type valait déjà 'player').
  if v_user is not null then
    update public.profiles set account_type = 'player' where id = v_user;
  end if;
  return true;
end;
$$;

revoke execute on function public.reject_club_request(uuid) from public, anon;
grant execute on function public.reject_club_request(uuid) to authenticated;
