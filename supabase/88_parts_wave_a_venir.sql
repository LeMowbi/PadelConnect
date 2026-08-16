-- 88 — Parts Wave : borner au match NON TERMINÉ (audit complet, tour 7, 2026-08-16).
-- À coller dans Supabase → SQL Editor → Run. Idempotent, rejouable.
--
-- Constat (LOW, écart contrat↔code) : le commentaire de la 83 (« SA résa à venir ») et le contrat
-- client (sharePayments.ts : « false = … déjà passée ») promettaient le refus d'une résa passée,
-- mais ni set_reservation_wave_link ni declare_share_paid ne vérifiaient starts_at. Inatteignable
-- via l'app (l'UI ne rend les parts que sur « À venir »), mais un appel forgé pouvait poser un lien
-- Wave / déclarer une part sur une résa 'booked' jouée depuis des mois → lignes share_payments et
-- push « part déclarée » parasites au créateur, indéfiniment. On aligne le code sur le contrat :
-- la FENÊTRE des parts se ferme à la FIN du match (starts_at + durée) — déclarer sa part pendant
-- ou juste après coup d'envoi reste possible tant que la résa vit, comme l'UI le laisse croire.
-- (confirm_share_paid n'est PAS borné : confirmer après le match une part déclarée à temps est
-- légitime — la 85 exige déjà status='booked'.)
-- Recopies STRICTES des versions live hormis la garde temporelle ajoutée.

create or replace function public.set_reservation_wave_link(p_id uuid, p_link text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link text := trim(coalesce(p_link, ''));
begin
  if auth.uid() is null then return false; end if;
  if v_link <> '' and (v_link !~ '^https://(pay\.)?wave\.com/' or length(v_link) > 300) then return false; end if;
  update public.reservations
    set wave_link = nullif(v_link, '')
    where id = p_id and user_id = auth.uid() and status = 'booked'
      -- 88 : la fenêtre se ferme à la FIN du match (contrat « résa à venir »).
      and starts_at + coalesce(duration_min, 90) * 60000 > (extract(epoch from now()) * 1000)::bigint;
  return found;
end;
$$;

revoke execute on function public.set_reservation_wave_link(uuid, text) from public, anon;
grant execute on function public.set_reservation_wave_link(uuid, text) to authenticated;

create or replace function public.declare_share_paid(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if auth.uid() is null then return false; end if;
  select * into r from public.reservations where id = p_reservation_id and status = 'booked';
  if r.id is null then return false; end if;
  -- 88 : match terminé → la fenêtre de déclaration est close (contrat « résa à venir »).
  if r.starts_at + coalesce(r.duration_min, 90) * 60000 <= (extract(epoch from now()) * 1000)::bigint then
    return false;
  end if;
  if r.user_id = auth.uid() then return false; end if; -- le créateur encaisse, il ne se paie pas lui-même
  if not exists (
    select 1 from public.reservation_participants rp
    where rp.reservation_id = p_reservation_id and rp.user_id = auth.uid() and rp.status = 'accepted'
  ) then
    return false;
  end if;
  insert into public.share_payments (reservation_id, user_id)
    values (p_reservation_id, auth.uid())
    on conflict (reservation_id, user_id) do nothing;
  return true;
end;
$$;

revoke execute on function public.declare_share_paid(uuid) from public, anon;
grant execute on function public.declare_share_paid(uuid) to authenticated;
