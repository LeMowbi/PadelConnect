-- 86 — INTÉGRITÉ DU CYCLE DE VIE, tour 2 (audit complet, tour 3, 2026-08-16).
-- À coller dans Supabase → SQL Editor → Run. Idempotent, rejouable.
--
-- Le tour 3 de l'audit a trouvé des RÉGRESSIONS/angles morts introduits ou laissés par la 85 :
--   R1 — delete_account décrémentait `players` de 1 en aveugle → faux compte quand le partant
--        était un participant DÉCLINÉ (déjà hors de `invited`).
--   R4 — delete_club ne purgeait pas les tournois 'rejected' (ni clôturés ni actifs → orphelins).
--   R5 — club_use_pass ne verrouillait pas la RÉSERVATION → course avec pass_refund_on_cancel.
--   L3 — follow_club était non borné (club_id est du TEXTE libre, sans FK) → une table gonflable.
-- (L1 « add_friend_by_phone mort » : DÉJÀ retiré par la 30 ; L2 « portée player_reliability » :
--  DÉJÀ club-scopée en base — rien à faire.)

-- ── R1 (MEDIUM) — delete_account : recalculer `players` à partir de `invited`, pas en -1 ──────────
-- `players` = 1 (créateur) + nb d'entrées `invited` (invariant de respond_invitation). En -1
-- aveugle, retirer un participant DÉCLINÉ (absent d'`invited`) faisait chuter `players` à tort →
-- match ouvert affichant une place fantôme de MOINS. On recompte depuis le tableau filtré, EXACTEMENT
-- comme respond_invitation (greatest(1, 1 + length)). Recopie STRICTE de la 85 hormis ce set.
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
  -- `players` RECALCULÉ depuis le tableau `invited` filtré (R1) — jamais un -1 aveugle.
  -- ⚠️ Un `UPDATE … FROM LATERAL (…)` ne peut PAS référencer la table CIBLE (`r`) → on passe par une
  -- table dérivée auto-jointe sur `id` (le LATERAL référence `r2`, qui est dans son propre FROM).
  -- Le `left join … on true` + `filter` rend `arr='[]'` même si `invited` est vide ou non-tableau.
  -- ⚠️ VERROU DE LIGNE D'ABORD (patron 73/M4) : la table dérivée `f` de l'UPDATE serait matérialisée
  -- sur le snapshot d'AVANT un « Rejoindre » concurrent, et EvalPlanQual ne re-évalue que la jointure
  -- (`r.id=f.id`), PAS `f.arr` → l'ajout concurrent serait écrasé (place fantôme). Le `for update`
  -- sérialise avec join_open_match/respond_invitation ; l'UPDATE suivant prend alors un snapshot
  -- READ COMMITTED frais après les verrous → `f.arr` inclut bien l'entrée du joiner.
  perform 1 from public.reservations r
    where r.status = 'booked' and r.starts_at > now_ms and r.user_id <> uid
      and exists (select 1 from public.reservation_participants rp
                  where rp.reservation_id = r.id and rp.user_id = uid)
    for update;
  update public.reservations r
    set invited = f.arr,
        players = greatest(1, 1 + jsonb_array_length(f.arr))
    from (
      select r2.id,
             coalesce(jsonb_agg(e) filter (where e ->> 'id' <> uid::text
                                             and e ->> 'id' <> 'open-' || uid::text), '[]'::jsonb) as arr
      from public.reservations r2
      left join lateral jsonb_array_elements(
        case when jsonb_typeof(r2.invited) = 'array' then r2.invited else '[]'::jsonb end) e on true
      where r2.status = 'booked' and r2.starts_at > now_ms and r2.user_id <> uid
        and exists (select 1 from public.reservation_participants rp
                    where rp.reservation_id = r2.id and rp.user_id = uid)
      group by r2.id
    ) f
    where r.id = f.id;
  -- C8 : coach supprimé → libérer/annuler les résas de ses cours acceptés et refuser ses demandes
  -- en attente. La cohérence des données est préservée (résa annulée, terrain libéré, lesson passée
  -- à 'cancelled' par le trigger 76). NB honnête : sur cette voie le webhook `lessons` cible le
  -- COACH (qui disparaît) pour un cours INDIVIDUEL → l'élève n'a pas de push dédié, il le voit dans
  -- « Mes réservations » au rafraîchissement ; un cours COLLECTIF, lui, prévient bien ses inscrits.
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

-- ── R4 (LOW) — delete_club : purger AUSSI les tournois 'rejected' ──────────────────────────────
-- Recopie STRICTE de la 85 hormis la liste des statuts purgés : 'rejected' rejoint 'pending'/
-- 'published'. Un tournoi refusé n'a ni palmarès (jamais clôturé) ni club hôte après suppression →
-- orphelin ingérable, à effacer comme les actifs. Les 'closed' (points ancrés) survivent.
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
  -- R4 : tournois NON clôturés du club → supprimés (avec leurs inscriptions, en cascade) ; les
  -- clôturés survivent pour le palmarès. 'rejected' inclus (orphelin ingérable comme les actifs).
  delete from public.competitions where club_id = p_id and status in ('pending', 'published', 'rejected');
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

-- ── R5 (LOW) — club_use_pass : verrouiller la RÉSERVATION ──────────────────────────────────────
-- Sans `for update` sur la résa, deux transactions concurrentes (le gérant décompte un carnet
-- pendant qu'une annulation passe la résa en 'cancelled' → trigger pass_refund_on_cancel) pouvaient
-- s'entrelacer : le pass_use s'insérait sur une résa déjà annulée (séance perdue, carnet décrémenté
-- pour un match jamais joué). Le verrou sérialise : l'annulation attend, puis rembourse proprement.
-- Recopie STRICTE de la version live (83) hormis le `for update` ajouté au SELECT de la résa.
create or replace function public.club_use_pass(p_reservation_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_pass uuid;
begin
  select * into r from public.reservations where id = p_reservation_id for update;
  if r.id is null or r.status <> 'booked' then return 'gone'; end if;
  if not public.can_manage_club(r.club_id) then return 'forbidden'; end if;
  if exists (select 1 from public.pass_uses u where u.reservation_id = p_reservation_id) then
    return 'already';
  end if;
  select cp.id into v_pass from public.club_passes cp
    where cp.club_id = r.club_id and cp.user_id = r.user_id and cp.remaining > 0
    order by cp.created_at
    limit 1
    for update;
  if v_pass is null then return 'none'; end if;
  update public.club_passes set remaining = remaining - 1 where id = v_pass;
  begin
    insert into public.pass_uses (pass_id, reservation_id) values (v_pass, p_reservation_id);
  exception when unique_violation then
    -- Course entre deux gérants : l'autre a décompté d'abord → on rend la séance au carnet.
    update public.club_passes set remaining = remaining + 1 where id = v_pass;
    return 'already';
  end;
  return 'ok';
end;
$$;

revoke execute on function public.club_use_pass(uuid) from public, anon;
grant execute on function public.club_use_pass(uuid) to authenticated;

-- ── L3 (LOW) — follow_club : borner le nombre de clubs suivis par joueur ────────────────────────
-- club_id est du TEXTE LIBRE (pas de FK vers clubs — les 9 fondateurs vivent côté client), donc un
-- appel forgé pouvait insérer une infinité de lignes avec des identifiants bidon. Plafond 100 (très
-- au-dessus du nombre réel de clubs) : garde-fou anti-gonflage sans gêner l'usage légitime.
-- Recopie STRICTE de la version live (81) hormis le plafond ajouté avant l'insert.
create or replace function public.follow_club(p_club_id text, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_club text := nullif(trim(coalesce(p_club_id, '')), '');
begin
  if v_uid is null or v_club is null or length(v_club) > 64 then return false; end if;
  if p_on then
    -- Plafond anti-gonflage (club_id non contraint par FK) MAIS seulement pour un NOUVEAU club :
    -- re-suivre un club DÉJÀ suivi au plafond est un no-op légitime (insert on conflict) → jamais un
    -- faux échec au resync best-effort du client.
    if not exists (select 1 from public.club_followers f where f.user_id = v_uid and f.club_id = v_club)
       and (select count(*) from public.club_followers where user_id = v_uid) >= 100 then
      return false;
    end if;
    insert into public.club_followers (user_id, club_id) values (v_uid, v_club)
      on conflict do nothing;
  else
    delete from public.club_followers where user_id = v_uid and club_id = v_club;
  end if;
  return true;
end;
$$;

revoke execute on function public.follow_club(text, boolean) from public, anon;
grant execute on function public.follow_club(text, boolean) to authenticated;
