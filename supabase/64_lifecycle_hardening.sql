-- PadelConnect — Audit tour 5 : durcissement des cycles de vie.
-- À coller dans Supabase → SQL Editor → Run. Idempotent.

-- ─── 1) Suppression de compte : ne PAS détruire les tournois OFFICIELS CLÔTURÉS ──────────────
-- competitions.organizer_id référençait auth.users ON DELETE CASCADE : quand un ORGANISATEUR
-- (gérant/opérateur) supprime son compte, ses tournois clôturés étaient effacés en cascade — y
-- compris les OFFICIELS, alors que delete_competition refuse explicitement de supprimer un tournoi
-- 'closed' + officiel. Conséquence : le vainqueur perdait ses 100 pts et chaque inscrit ses 10 pts
-- au classement (recalculé à la lecture). On passe la FK en ON DELETE SET NULL et on rend la
-- colonne nullable : le tournoi (et son winner_user_id + ses inscriptions) SURVIT, simplement
-- détaché de l'organisateur supprimé — le classement reste intègre. Le niveau, déjà permanent
-- sur profiles, n'était pas touché.
alter table public.competitions alter column organizer_id drop not null;
alter table public.competitions drop constraint if exists competitions_organizer_id_fkey;
alter table public.competitions
  add constraint competitions_organizer_id_fkey
  foreign key (organizer_id) references auth.users (id) on delete set null;

-- ─── 2) Accepter une demande d'ami : re-vérifier le BLOCAGE au moment de la réponse ──────────
-- send_friend_request refuse déjà tout envoi entre comptes bloqués, mais respond_friend_request
-- ne re-vérifiait pas : si un blocage était posé APRÈS l'envoi, accepter une demande en mémoire
-- créait quand même l'amitié mutuelle (le bloqué réapparaissait chez le bloqueur). On aligne la
-- garde : un blocage dans un sens OU l'autre → la demande passe 'declined', aucun lien créé.
create or replace function public.respond_friend_request(p_request_id uuid, p_accept boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  r public.friend_requests%rowtype;
begin
  select * into r from public.friend_requests where id = p_request_id and to_user = me and status = 'pending';
  if r.id is null then
    return false; -- demande inexistante, déjà traitée, ou pas pour moi
  end if;
  -- Blocage posé entre l'envoi et la réponse → on refuse l'amitié (miroir de send_friend_request).
  if exists (select 1 from public.blocked_users b
             where (b.blocker_id = r.from_user and b.blocked_id = r.to_user)
                or (b.blocker_id = r.to_user and b.blocked_id = r.from_user)) then
    update public.friend_requests set status = 'declined', responded_at = now() where id = r.id;
    return false;
  end if;
  if p_accept then
    update public.friend_requests set status = 'accepted', responded_at = now() where id = r.id;
    insert into public.friends (user_id, friend_id) values (r.from_user, r.to_user), (r.to_user, r.from_user) on conflict do nothing;
  else
    update public.friend_requests set status = 'declined', responded_at = now() where id = r.id;
  end if;
  return true;
end;
$$;

revoke execute on function public.respond_friend_request(uuid, boolean) from public, anon;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
