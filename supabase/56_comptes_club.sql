-- PadelConnect — COMPTES CLUB ≠ JOUEUR (Chantier 1, v2). À coller dans
-- Supabase → SQL Editor → Run. Idempotent (relançable sans casser l'existant).
--
-- OBJECTIF : à l'inscription, la personne choisit « Joueur » ou « Je gère un club ».
-- Un compte club est marqué `account_type = 'club'` et voit son club passer par une
-- VALIDATION opérateur avant d'obtenir l'Espace Club. On réutilise 100 % du socle
-- existant (table club_requests + fonction approve_club_request de 07_clubs.sql) :
--   • le TRIGGER d'inscription pose account_type ET crée automatiquement la demande
--     de club (club_requests) quand le compte est un compte club ;
--   • l'opérateur valide dans son espace (approve_club_request → role='club' + club) ;
--   • tant que ce n'est pas validé : account_type='club' mais role reste 'player'
--     → l'app affiche « club en cours de validation » (aucun accès gérant prématuré).
-- AUCUNE table nouvelle, AUCun changement de sécurité : que du branchement.

-- ─── 1) Type de compte (choisi à l'inscription, indépendant du RÔLE vérifié) ──────
-- Le RÔLE ('player'|'club'|'operator') reste la VRAIE sécurité (promotion serveur
-- uniquement). account_type ne fait que MÉMORISER l'intention d'inscription pour
-- piloter l'affichage (« mon club est en validation »). Défaut 'player' : tous les
-- comptes existants restent des joueurs, aucun impact.
alter table public.profiles
  add column if not exists account_type text not null default 'player'; -- 'player' | 'club'

-- ─── 2) Trigger d'inscription : pose account_type + crée la demande de club ───────
-- Remplace handle_new_user (08_signup.sql) en AJOUTANT deux choses, sans rien retirer :
--   a) on renseigne profiles.account_type depuis les métadonnées d'inscription ;
--   b) si c'est un compte club, on insère AUTOMATIQUEMENT la demande dans club_requests
--      (mêmes colonnes que « Inscrire mon club ») → l'opérateur la voit aussitôt.
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
  acct text := lower(nullif(meta->>'account_type', ''));
begin
  if acct is null or acct not in ('player', 'club') then acct := 'player'; end if;

  -- Profil (créé une seule fois). Le RÔLE reste 'player' par défaut ; seul account_type
  -- retient l'intention (joueur / club). La promotion 'club' passe par approve_club_request.
  insert into public.profiles (id, first_name, last_name, phone, email, birth_date, gender, level, referral_code, account_type)
    values (
      new.id,
      nullif(meta->>'first_name', ''),
      nullif(meta->>'last_name', ''),
      nullif(meta->>'phone', ''),
      new.email,
      nullif(meta->>'birth_date', ''),
      nullif(meta->>'gender', ''),
      -- Niveau borné [1,7] à l'inscription (durcissement 36) : on RE-applique le clamp ici, car
      -- cette redéfinition de handle_new_user écrase la précédente — sans lui, un signUp forgé
      -- hors app (level=99) créerait un profil hors bornes. Via l'app c'est déjà clampé côté client.
      least(7.0, greatest(1.0, coalesce((meta->>'level')::numeric, 3.0))),
      upper(substr(replace(new.id::text, '-', ''), 1, 12)),
      acct
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

  -- Compte CLUB : demande d'inscription créée d'office (statut 'new') → visible par
  -- l'opérateur dans « Demandes ». Il valide ensuite (approve_club_request). Le nom du
  -- club vient des métadonnées ; à défaut, on retombe sur le nom de la personne.
  if acct = 'club' then
    insert into public.club_requests (requested_by, name, area, type, courts, price_from, contact_phone, message, status)
      values (
        new.id,
        coalesce(nullif(meta->>'club_name', ''), nullif(meta->>'first_name', ''), 'Mon club'),
        nullif(meta->>'club_area', ''),
        nullif(meta->>'club_type', ''),
        nullif(meta->>'club_courts', '')::int,
        nullif(meta->>'club_price_from', '')::int,
        nullif(meta->>'phone', ''),
        nullif(meta->>'club_message', ''),
        'new'
      );
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
