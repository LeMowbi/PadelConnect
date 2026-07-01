-- PadelConnect — Durcissements d'audit (à coller dans Supabase → SQL Editor → Run). Idempotent.
--
-- Deux corrections issues de l'audit :
--   1) NIVEAU À L'INSCRIPTION : `handle_new_user` copiait `level` depuis les métadonnées CLIENT
--      (user_metadata). Un appelant forgeant lui-même supabase.auth.signUp pouvait donc se donner
--      un niveau de départ arbitraire (borné 1–7 par la contrainte, mais quand même choisi).
--      Règle du projet : le niveau n'est attribué QUE par les tournois (close_competition).
--      → on FORCE 3.0 à la création ; le metadata `level` est ignoré.
--   2) ATTRIBUTION DE NIVEAU (close_competition) : le vainqueur/perdant était apparié par la
--      chaîne « prénom & partenaire », 100 % contrôlée par l'utilisateur. Deux équipes d'un même
--      tournoi portant la même chaîne créaient une collision (un joueur pouvait « voler » le +0.50).
--      → on n'attribue le niveau que si la chaîne correspond à UNE SEULE inscription du tournoi
--        (sinon on ne touche à aucun niveau : mieux vaut ne rien attribuer que mal attribuer).

-- ── 1) Inscription : niveau initial fixé côté serveur ───────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  ref_code text;
  ref_id uuid;
begin
  -- Profil (créé une seule fois). `level` FORCÉ à 3.0 : il n'évoluera ensuite que via
  -- close_competition (tournois officiels), protégé par le trigger protect_level (migration 34).
  insert into public.profiles (id, first_name, last_name, phone, email, birth_date, gender, level, referral_code)
    values (
      new.id,
      nullif(meta->>'first_name', ''),
      nullif(meta->>'last_name', ''),
      nullif(meta->>'phone', ''),
      new.email,
      nullif(meta->>'birth_date', ''),
      nullif(meta->>'gender', ''),
      3.0, -- niveau de départ non négociable (on IGNORE meta->>'level')
      upper(substr(replace(new.id::text, '-', ''), 1, 12)) -- même code que l'app (referralCodeForUser)
    )
    on conflict (id) do nothing;

  -- Parrainage : si un code a été saisi à l'inscription, on crée le lien parrain→filleul.
  ref_code := upper(trim(coalesce(meta->>'referred_by', '')));
  if length(ref_code) >= 4 then
    select id into ref_id from public.profiles where referral_code = ref_code limit 1;
    if ref_id is not null and ref_id <> new.id then
      insert into public.referrals (referrer_id, referee_id)
        values (ref_id, new.id)
        on conflict (referee_id) do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 2) Clôture de tournoi : anti-collision de noms ──────────────────────────────
-- Identique à 34_level_integrity.sql, MAIS l'attribution de niveau n'a lieu que si la chaîne
-- « prénom & partenaire » désigne EXACTEMENT une inscription du tournoi (anti-vol par collision).
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
    where id = p_id;

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

grant execute on function public.close_competition(uuid, text, text, text, text) to authenticated;
