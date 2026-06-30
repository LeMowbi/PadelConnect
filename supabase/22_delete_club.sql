-- PadelConnect — suppression d'un club serveur (à coller dans Supabase → SQL Editor → Run).
-- Idempotent. Réservé à l'opérateur.
--
-- Supprime DÉFINITIVEMENT un club AJOUTÉ via l'app (présent dans la table clubs) et nettoie
-- toutes ses données liées (config, surcharges, statut, commission). Les gérants de ce club
-- repassent simples joueurs. Les 9 clubs « de base » ne sont pas en table → pour eux on utilise
-- plutôt set_base_club_status('hidden') (retrait réversible), géré côté app.
--
-- Note : les réservations passées gardent leur club_id (texte, sans clé étrangère) pour
-- l'historique/commissions ; on ne touche pas à l'historique.

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
  -- Données liées (aucune FK : on supprime explicitement).
  delete from public.club_config where club_id = p_id;
  delete from public.club_overrides where club_id = p_id;
  delete from public.club_status where club_id = p_id;
  delete from public.club_commission where club_id = p_id;
  -- Les gérants de ce club redeviennent de simples joueurs.
  update public.profiles set role = 'player', managed_club_id = null where managed_club_id = p_id;
  -- Le club serveur lui-même (no-op pour un club de base, absent de la table).
  delete from public.clubs where id = p_id;
  return true;
end;
$$;

grant execute on function public.delete_club(text) to authenticated;
