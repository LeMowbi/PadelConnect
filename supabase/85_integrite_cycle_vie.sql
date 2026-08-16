-- 85 — INTÉGRITÉ DU CYCLE DE VIE (audit complet, tour 2, 2026-08-15).
-- À coller dans Supabase → SQL Editor → Run. Idempotent, rejouable.
--
-- L'audit d'intégrité inter-tables a trouvé des ÉTATS INCOHÉRENTS à l'ANNULATION / la SUPPRESSION
-- (jamais des courses ni des double-ventes — celles-ci sont fermées). On les referme ici.

-- ── C1 (MEDIUM) — Carnets : restituer la séance décomptée quand la résa est annulée ───────────
-- club_use_pass décrémente club_passes.remaining + insère pass_uses dès qu'une résa est 'booked'.
-- Si la résa est ensuite ANNULÉE (par le joueur ou par le club — pas sa faute), la séance était
-- perdue : le joueur payait un match jamais joué, sans outil de correction. Trigger symétrique de
-- lessons_follow_reservation : on rend la séance et on efface la trace. On EXCLUT 'no_show' (le
-- joueur ne s'est pas présenté → la séance est bien consommée, décision assumée).
create or replace function public.pass_refund_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('cancelled', 'club_cancelled') and old.status = 'booked' then
    update public.club_passes cp
       set remaining = least(cp.total, cp.remaining + 1)
      from public.pass_uses u
     where u.reservation_id = new.id and cp.id = u.pass_id;
    delete from public.pass_uses where reservation_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists pass_refund_on_cancel on public.reservations;
create trigger pass_refund_on_cancel after update on public.reservations
  for each row execute function public.pass_refund_on_cancel();

-- ── C3 (MEDIUM) — Dé-marquer « pas venu » ressuscite AUSSI le cours lié ────────────────────────
-- lessons_follow_reservation ne gérait que booked→cancelled/no_show/club_cancelled. mark_no_show(false)
-- repasse la résa no_show→booked, mais la lesson restait 'cancelled' à jamais : terrain tenu par une
-- résa 'booked' mais cours « Annulé » et élèves masqués. On ajoute la branche INVERSE. Sûr : la seule
-- transition X→booked du système est no_show→booked, et une lesson liée à cette résa n'a pu être
-- annulée QUE par ce trigger (l'annulation élève passe par un statut résa 'cancelled', définitif).
create or replace function public.lessons_follow_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('cancelled', 'no_show', 'club_cancelled') and old.status = 'booked' then
    update public.lessons
      set status = 'cancelled', responded_at = now()
      where reservation_id = new.id and status = 'accepted';
  elsif new.status = 'booked' and old.status = 'no_show' then
    -- Correction d'un « pas venu » posé par erreur : le cours reprend vie.
    update public.lessons
      set status = 'accepted', responded_at = now()
      where reservation_id = new.id and status = 'cancelled';
  end if;
  return new;
end;
$$;

-- ── C6 (LOW) — mark_no_show refuse un match dont le NIVEAU a déjà été appliqué ─────────────────
-- Un match dont le score est validé et le niveau ajusté (level_history) a été RÉELLEMENT joué :
-- le marquer 'no_show' retirerait les points du classement mais laisserait le niveau acquis →
-- les deux moteurs (points / niveau) divergeraient sur le même fait.
create or replace function public.mark_no_show(p_id uuid, p_value boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare allowed boolean;
begin
  select exists (
    select 1
    from public.reservations r
    join public.profiles p on p.id = auth.uid()
    where r.id = p_id
      and ((p.role = 'club' and p.managed_club_id = r.club_id) or p.role = 'operator')
  ) into allowed;
  if not allowed then return false; end if;
  if p_value then
    -- Score validé + niveau appliqué → ce match a été joué, pas un no-show.
    if exists (select 1 from public.level_history lh where lh.reservation_id = p_id) then
      return false;
    end if;
    update public.reservations set status = 'no_show' where id = p_id and status in ('booked', 'no_show');
  else
    -- Annule l'absence (repasse en réservé) — possible seulement si le créneau est resté libre.
    update public.reservations set status = 'booked' where id = p_id and status = 'no_show';
  end if;
  return found;
exception when unique_violation or exclusion_violation or check_violation then
  return false;
end;
$$;

-- ── C5 (LOW) — confirm_share_paid : refuser sur une résa non 'booked' ──────────────────────────
-- declare_share_paid exige déjà status='booked' ; la confirmation ne vérifiait rien → le créateur
-- pouvait confirmer des parts sur une résa annulée (historique « payé » pour un match jamais joué).
create or replace function public.confirm_share_paid(p_reservation_id uuid, p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return false; end if;
  if not exists (
    select 1 from public.reservations r
    where r.id = p_reservation_id and r.user_id = auth.uid() and r.status = 'booked'
  ) then
    return false;
  end if;
  update public.share_payments
    set status = 'confirmed', confirmed_at = now()
    where reservation_id = p_reservation_id and user_id = p_user and status = 'declared';
  return found;
end;
$$;

-- ── C7 / C9 (LOW) — clés étrangères manquantes (uuid pendouillants après cascade) ──────────────
-- lessons.reservation_id : nu → après suppression du compte élève (cascade auth.users→reservations),
-- il pointait dans le vide. Idem colonnes d'audit created_by (parité avec events/blocked_slots qui
-- font déjà `set null`). On pré-nettoie les orphelins existants avant de poser la contrainte.
update public.lessons set reservation_id = null
  where reservation_id is not null
    and not exists (select 1 from public.reservations r where r.id = lessons.reservation_id);
alter table public.lessons drop constraint if exists lessons_reservation_fk;
alter table public.lessons
  add constraint lessons_reservation_fk foreign key (reservation_id)
  references public.reservations (id) on delete set null;

update public.club_news set created_by = null
  where created_by is not null
    and not exists (select 1 from public.profiles p where p.id = club_news.created_by);
alter table public.club_news drop constraint if exists club_news_created_by_fk;
alter table public.club_news
  add constraint club_news_created_by_fk foreign key (created_by)
  references public.profiles (id) on delete set null;

update public.club_passes set created_by = null
  where created_by is not null
    and not exists (select 1 from public.profiles p where p.id = club_passes.created_by);
alter table public.club_passes drop constraint if exists club_passes_created_by_fk;
alter table public.club_passes
  add constraint club_passes_created_by_fk foreign key (created_by)
  references public.profiles (id) on delete set null;

-- ── C4 (MEDIUM) — delete_club : purger les TOURNOIS orphelins ──────────────────────────────────
-- Recopie STRICTE de la version live (83) + suppression des tournois du club (competitions.club_id
-- n'a pas de FK vers clubs) : sinon un tournoi 'published' restait visible et rejoignable dans un
-- club fantôme (plus personne pour l'héberger/valider/clôturer). Les CLÔTURÉS (status='closed',
-- palmarès + points ancrés) survivent ; pending/published partent (leurs inscriptions cascadent).
create or replace function public.delete_club(p_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return false; -- réservé à l'opérateur
  end if;
  delete from public.club_config where club_id = p_id;
  delete from public.club_overrides where club_id = p_id;
  delete from public.club_status where club_id = p_id;
  delete from public.club_commission where club_id = p_id;
  delete from public.club_boost where club_id = p_id;
  delete from public.blocked_slots where club_id = p_id;
  delete from public.blocked_ranges where club_id = p_id;
  delete from public.club_passes where club_id = p_id;
  delete from public.club_news where club_id = p_id;
  delete from public.club_followers where club_id = p_id;
  delete from public.slot_waitlist where club_id = p_id;
  delete from public.reviews where club_id = p_id;
  -- C4 : tournois NON clôturés du club → supprimés (avec leurs inscriptions, en cascade) ; les
  -- clôturés survivent pour le palmarès. Un tournoi orphelin dans un club fantôme est ingérable.
  delete from public.competitions where club_id = p_id and status in ('pending', 'published');
  update public.reservations set status = 'cancelled'
    where club_id = p_id and status = 'booked' and starts_at > (extract(epoch from now()) * 1000)::bigint;
  update public.coaches set active = false where club_id = p_id;
  update public.lessons set status = 'declined', responded_at = now()
    where club_id = p_id and status = 'pending';
  delete from public.manager_clubs where club_id = p_id;
  update public.profiles p
    set managed_club_id = (select mc.club_id from public.manager_clubs mc where mc.user_id = p.id order by mc.created_at limit 1)
    where p.managed_club_id = p_id;
  update public.profiles p
    set role = 'player', managed_club_id = null
    where p.managed_club_id is null and p.role = 'club'
      and not exists (select 1 from public.manager_clubs mc where mc.user_id = p.id);
  -- Storage (bug plateforme storage.protect_delete, cf. 83) : GUC officiel le temps du delete.
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'club-photos' and (storage.foldername(name))[1] = p_id;
  perform set_config('storage.allow_delete_query', 'false', true);
  delete from public.clubs where id = p_id;
  return true;
end;
$$;

revoke execute on function public.delete_club(text) from public, anon;
grant execute on function public.delete_club(text) to authenticated;

-- ── C2 + C8 (MEDIUM) — delete_account : purge des fantômes + cours du coach ────────────────────
-- Recopie STRICTE de la version live (83) + deux purges AVANT la cascade :
--   C2 : le compte est PARTICIPANT d'un match ouvert d'un TIERS → retirer son entrée `invited` et
--        décrémenter `players`, sinon une place reste occupée par un fantôme (le match ne se remplit
--        plus, `fetch_open_matches` compte une place fantôme). La cascade efface la ligne participant.
--   C8 : le compte est COACH → annuler les résas (appartenant aux ÉLÈVES) de ses cours à venir
--        (le trigger 76 passe la lesson à 'cancelled' → webhook `lessons` → l'élève est prévenu ; le
--        terrain est libéré) et refuser ses demandes en attente. Sans ça, l'élève gardait une résa
--        'booked' pour un coach disparu, sans notification.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  -- Avatar (bucket public, hors cascade) — GUC storage (bug plateforme, cf. 83).
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects
    where bucket_id = 'avatars' and (storage.foldername(name))[1] = uid::text;
  perform set_config('storage.allow_delete_query', 'false', true);
  -- C2 : retirer ce compte des matchs ouverts des AUTRES (avant la cascade des participations).
  update public.reservations r
    set invited = coalesce((
          select jsonb_agg(e)
          from jsonb_array_elements(case when jsonb_typeof(r.invited) = 'array' then r.invited else '[]'::jsonb end) e
          where e ->> 'id' <> uid::text and e ->> 'id' <> 'open-' || uid::text
        ), '[]'::jsonb),
        players = greatest(1, r.players - 1)
    where r.status = 'booked' and r.starts_at > now_ms and r.user_id <> uid
      and exists (select 1 from public.reservation_participants rp where rp.reservation_id = r.id and rp.user_id = uid);
  -- C8 : coach supprimé → libérer/annuler les résas de ses cours acceptés (élève prévenu via le
  -- trigger 76 + webhook lessons) et refuser ses demandes en attente.
  update public.reservations set status = 'cancelled'
    where status = 'booked' and starts_at > now_ms
      and id in (select l.reservation_id from public.lessons l
                 where l.coach_id = uid and l.status = 'accepted' and l.reservation_id is not null);
  update public.lessons set status = 'declined', responded_at = now()
    where coach_id = uid and status = 'pending';
  -- Mes propres réservations À VENIR : annulées avant la cascade (webhook → club prévenu).
  update public.reservations
    set status = 'cancelled'
    where user_id = uid and status = 'booked' and starts_at > now_ms;
  -- Cascade ON DELETE : profil, réservations, participations, favoris, etc.
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
