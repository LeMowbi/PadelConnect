-- PadelConnect — Durcissements de l'AUDIT COMPLET (2026-07-11). À coller dans Supabase → SQL
-- Editor → Run. IDEMPOTENT (create or replace, drop trigger if exists). `search_path` figé sur
-- chaque SECURITY DEFINER. À appliquer AVANT que le prochain build ne devienne LIVE.
--
-- ⚠️ NE PAS recoller `68_creneaux_duree.sql` (ni 69→72) : cette migration 73 s'empile PAR-DESSUS
-- l'état actuel de la base (02→72) sans les toucher.
--
-- Contenu :
--   1) link_participants        — le BLOCAGE (51) est opposable aux INVITATIONS de résa (M1).
--   2) respond_invitation       — verrou de ligne (FOR UPDATE) anti-TOCTOU surbooking (M4).
--   3) delete_competition       — suppression d'un tournoi PUBLIÉ (inscrits / frais dus) refusée à
--                                 l'organisateur seul (M5).
--   4) competitions (trigger)   — plage de dates bornée à l'INSERT → plus de DoS de verrous quand le
--                                 club valide un tournoi joueur forgé (M6).
--
-- NON inclus (décision / défense en profondeur) :
--   • M2 « inscription non confirmée qui squatte le numéro » : touche le chemin d'auth LIVE →
--     décision porteur (purge des comptes non confirmés > 24 h, ou phone_available qui ignore un
--     ghost non confirmé). À écrire quand le porteur tranche.
--   • respond_lesson clé de verrou coach:jour:heure → coach:jour, et court_slots `d` numérique dans
--     upsert_club_config : LOW « appel forgé uniquement », aucune double-vente possible (la GiST lit
--     la durée réelle), même famille que l'écart `price60` déjà « gardé pour plus tard » (§10). À
--     regrouper dans une future migration si le porteur y tient — reproduire ces grosses fonctions
--     pour un LOW forgé ferait courir plus de risque qu'il n'en retire.

-- ─── 1) link_participants : blocage opposable aux invitations de réservation (M1) ──────────────
-- Reproduit la définition de 06 + garde bilatérale `blocked_users` (même patron que join_open_match).
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
    -- BLOCAGE (51) opposable aux INVITATIONS (audit 2026-07-11) : on n'invite pas un compte bloqué
    -- dans un sens ou l'autre — même garde bilatérale que join_open_match. Sans ça, un bloqué restait
    -- joignable EN BOUCLE par une simple invitation (une résa = un push) : canal de harcèlement.
    if uid2 is not null and not exists (
      select 1 from public.blocked_users b
      where (b.blocker_id = owner and b.blocked_id = uid2)
         or (b.blocker_id = uid2 and b.blocked_id = owner)
    ) then
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

-- ─── 2) respond_invitation : verrou de ligne anti-TOCTOU (M4) ──────────────────────────────────
-- Reproduit la définition de 53 + `for update` sur la réservation avant de recalculer `invited`.
create or replace function public.respond_invitation(p_reservation_id uuid, p_accept boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_target text := case when p_accept then 'accepted' else 'declined' end;
  v_changed boolean;
  v_new jsonb;
begin
  -- Verrou de LIGNE sur la réservation (comme join_open_match) : sérialise les entrées/sorties
  -- concurrentes du même match ouvert (audit 2026-07-11). Sans lui, un refus recalculait `invited`
  -- sur un instantané NON verrouillé et écrasait l'ajout d'un « Rejoindre » concurrent → surbooking
  -- (5-6 joueurs sur un terrain de 4) ou place gelée à jamais (entrée d'un partant ressuscitée).
  perform 1 from public.reservations where id = p_reservation_id for update;
  if exists (select 1 from public.reservations r
             where r.id = p_reservation_id
               and r.starts_at <= (extract(epoch from now()) * 1000)::bigint) then
    return false; -- le match a commencé : plus d'entrée/sortie
  end if;
  update public.reservation_participants
    set status = v_target
    where reservation_id = p_reservation_id and user_id = v_uid
      and status is distinct from v_target;
  v_changed := found;
  if v_changed and not p_accept then
    select coalesce(jsonb_agg(e), '[]'::jsonb) into v_new
      from jsonb_array_elements(
        (select case when jsonb_typeof(invited) = 'array' then invited else '[]'::jsonb end
           from public.reservations where id = p_reservation_id)) e
      where e ->> 'id' <> v_uid::text and e ->> 'id' <> 'open-' || v_uid::text;
    update public.reservations
      set invited = v_new, players = greatest(1, 1 + jsonb_array_length(v_new))
      where id = p_reservation_id;
  end if;
  return v_changed;
end;
$$;

grant execute on function public.respond_invitation(uuid, boolean) to authenticated;

-- ─── 3) delete_competition : suppression d'un tournoi PUBLIÉ refusée à l'organisateur seul (M5) ──
-- Reproduit la définition de 53 + garde « publié avec inscrits ou frais dus ».
create or replace function public.delete_competition(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_club text;
begin
  select organizer_id, club_id into v_owner, v_club from public.competitions where id = p_id;
  if v_owner is null then return false; end if;
  if v_owner <> auth.uid() and not public.can_manage_club(v_club) then return false; end if;
  if exists (select 1 from public.competitions c where c.id = p_id and c.status = 'closed' and c.official) then
    return false; -- le palmarès (niveau attribué, points) s'appuie dessus
  end if;
  -- Un tournoi PUBLIÉ (validé par le club) avec des INSCRITS ou des frais opérateur DUS ne peut plus
  -- être supprimé par l'ORGANISATEUR seul (audit 2026-07-11) : les équipes inscrites perdraient le
  -- tournoi SANS notification (pas de webhook DELETE) et la carte « Frais à encaisser » de l'opérateur
  -- disparaîtrait. Ce cas reste réservé au club / à l'opérateur (can_manage_club), qui préviennent.
  if v_owner = auth.uid() and not public.can_manage_club(v_club)
     and exists (select 1 from public.competitions c where c.id = p_id and c.status = 'published')
     and (
       exists (select 1 from public.competition_registrations cr where cr.competition_id = p_id)
       or exists (select 1 from public.competitions c where c.id = p_id
                    and coalesce(c.commission, 0) > 0 and coalesce(c.payment_status, 'unpaid') <> 'paid')
     ) then
    return false;
  end if;
  delete from public.competitions where id = p_id;
  return true;
end;
$$;

grant execute on function public.delete_competition(uuid) to authenticated;

-- ─── 4) competitions : plage de dates bornée à l'INSERT — anti-DoS de verrous (M6) ──────────────
-- create_competition (branches joueur/opérateur) ne validait pas les dates ; un tournoi `pending`
-- forgé avec end_date_key='9999-12-31' faisait ~2,9 M pg_advisory_xact_lock quand le CLUB tapait
-- « Valider » (approve_competition), saturant la table de verrous (« out of shared memory ») et
-- laissant le tournoi in-validable. On borne la plage DÈS L'INSERT (seule voie d'écriture, RLS +
-- SECURITY DEFINER) : le tournoi absurde ne peut plus exister → approve_competition ne le voit
-- jamais. (Résiduel connu, faible : la boucle interne de create_competition en branche 'club' tourne
-- AVANT l'insert — réservée à un gérant de club DÉJÀ validé par l'opérateur ; le tournoi ne persiste
-- de toute façon pas. Bornage complet de cette boucle = future migration si besoin.)
create or replace function public.competitions_date_range_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.date_key is null or new.date_key !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Tournoi : date de début invalide (%).', new.date_key using errcode = '22007';
  end if;
  if new.end_date_key is not null and new.end_date_key <> '' then
    if new.end_date_key !~ '^\d{4}-\d{2}-\d{2}$'
       or new.end_date_key::date < new.date_key::date
       or new.end_date_key::date > ((now() at time zone 'utc')::date + 366) then
      raise exception 'Tournoi : plage de dates invalide (fin avant début, ou au-delà de 366 jours).'
        using errcode = '22007';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists competitions_date_range_guard_ins on public.competitions;
create trigger competitions_date_range_guard_ins
  before insert on public.competitions
  for each row execute function public.competitions_date_range_guard();
