-- 67_phone_unique.sql — UN numéro de téléphone = UN seul compte (demande porteur 2026-07-07).
--
-- Le porteur donne lui-même l'accès à partir du numéro : deux comptes ne doivent JAMAIS partager
-- un même numéro. On applique l'unicité sur les 10 DERNIERS chiffres (exactement la convention
-- déjà utilisée pour l'appariement amis / participants / coachs / clubs) → « +225 07 12 34 56 78 »
-- et « 07 12 34 56 78 » comptent comme le MÊME numéro. Les numéros vides/nuls n'imposent rien.
--
-- Idempotent : create or replace / create index if not exists. À coller dans SQL Editor → Run.

-- 1) Normalisation PURE (immuable → utilisable dans un index d'expression et partout ailleurs).
create or replace function public.phone10(p text)
returns text
language sql
immutable
as $$
  select case
    when p is null then null
    when length(regexp_replace(p, '\D', '', 'g')) = 0 then null
    else right(regexp_replace(p, '\D', '', 'g'), 10)
  end;
$$;

-- 2) Garde-fou DUR : un numéro (10 derniers chiffres) ne peut appartenir qu'à UN profil.
--    Index partiel = on n'indexe que les numéros réellement renseignés (null/vide = rien à bloquer).
--    C'est ce qui garantit l'unicité quelle que soit la voie d'écriture (inscription, édition profil,
--    et même un appel forgé hors app) et gère la course concurrente (2 inscriptions simultanées).
create unique index if not exists profiles_phone10_uniq
  on public.profiles (public.phone10(phone))
  where public.phone10(phone) is not null;

-- 3) Message clair côté inscription : le trigger REFUSE avant l'insert si le numéro est déjà pris.
--    (L'index ci-dessus reste le garde-fou dur ; ce contrôle explicite donne une erreur nette.)
--    Redéfinition COMPLÈTE de handle_new_user (56) — on n'ajoute QUE le bloc « numéro déjà pris »,
--    tout le reste (profil, clamp niveau, parrainage, demande club) est conservé à l'identique.
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

  -- Un numéro = un seul compte : on refuse AVANT tout si le numéro est déjà porté par un profil.
  if public.phone10(meta->>'phone') is not null
     and exists (
       select 1 from public.profiles
       where public.phone10(phone) = public.phone10(meta->>'phone')
     ) then
    raise exception 'PHONE_TAKEN' using errcode = 'unique_violation';
  end if;

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

-- 4) Contrôle AVANT inscription (UX) : l'app demande si un numéro est libre pour afficher un
--    message net sans même créer de compte auth. Renvoie true = libre, false = déjà pris.
--    SECURITY DEFINER (profiles jamais exposée) ; ne renvoie qu'un booléen (aucune donnée de profil).
create or replace function public.phone_available(p_phone text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles
    where public.phone10(phone) = public.phone10(p_phone)
  )
  -- Un numéro vide/illisible n'est jamais « pris » (l'app valide déjà ≥ 8 chiffres avant).
  or public.phone10(p_phone) is null;
$$;

revoke all on function public.phone_available(text) from public;
grant execute on function public.phone_available(text) to anon, authenticated;
