-- 87 — mark_no_show renvoie un TEXTE (audit complet, tour 4, 2026-08-16).
-- À coller dans Supabase → SQL Editor → Run APRÈS la 86. Idempotent, rejouable.
--
-- Constat (LOW) : mark_no_show renvoyait un booléen. Depuis la 85 (C6), il refuse (false, sans
-- lever d'erreur) de marquer « pas venu » un match dont le SCORE est validé et le NIVEAU appliqué
-- (level_history) — c'est un match réellement joué. Côté client, ce false était indistinct d'un
-- échec réseau → message « Action impossible — réessaie », et le gérant retentait à l'infini sans
-- jamais comprendre que le refus est LÉGITIME et définitif. On renvoie désormais un code TEXTE pour
-- que le client affiche un message honnête et distinct :
--   'ok'        — marquage (ou dé-marquage) effectué
--   'played'    — refusé : match noté + niveau appliqué (réellement joué, jamais un no-show)
--   'gone'      — la réservation n'est pas dans un état marquable (ni 'booked' ni 'no_show')
--   'taken'     — dé-marquage impossible : le créneau a été repris entre-temps (chevauchement)
--   'forbidden' — appelant non autorisé (ni gérant du club, ni opérateur)
-- (Le changement de type de retour impose un drop+create : create or replace ne peut pas le faire.)

drop function if exists public.mark_no_show(uuid, boolean);
create or replace function public.mark_no_show(p_id uuid, p_value boolean default true)
returns text
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
  if not allowed then return 'forbidden'; end if;
  if p_value then
    -- Score validé + niveau appliqué → ce match a été joué, pas un no-show (85 C6).
    if exists (select 1 from public.level_history lh where lh.reservation_id = p_id) then
      return 'played';
    end if;
    update public.reservations set status = 'no_show' where id = p_id and status in ('booked', 'no_show');
    return case when found then 'ok' else 'gone' end;
  else
    -- Annule l'absence (repasse en réservé) — possible seulement si le créneau est resté libre.
    update public.reservations set status = 'booked' where id = p_id and status = 'no_show';
    return case when found then 'ok' else 'gone' end;
  end if;
exception when unique_violation or exclusion_violation or check_violation then
  -- Dé-marquage : le créneau a été repris entre-temps (contrainte d'exclusion GiST) → refus net.
  return 'taken';
end;
$$;

revoke execute on function public.mark_no_show(uuid, boolean) from public, anon;
grant execute on function public.mark_no_show(uuid, boolean) to authenticated;
