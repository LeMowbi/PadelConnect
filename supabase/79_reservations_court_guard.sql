-- 79 — Terrain OBLIGATOIRE sur une réservation (fermeture d'un trou « INSERT forgé »).
--
-- reservations.court était NULLABLE : un INSERT REST forgé (policy reservations_insert_own,
-- l'appelant est authentifié mais contourne l'app) avec court = NULL passait ENTRE TOUTES les
-- gardes — dans reservations_insert_guard, `new.court = any(v_courts)` vaut NULL (jamais vrai,
-- jamais faux → pas d'exception « unknown court »), resolve_court_slots(club, null) retombe sur
-- la grille par DÉFAUT (pas d'exception « slot closed »), et la contrainte d'exclusion GiST
-- reservations_no_overlap n'apparie jamais deux NULL (null <> null) → réservation « fantôme »
-- sans terrain, INVISIBLE de l'anti double-vente, comptée dans le revenu/planning du club et
-- posable même sur un créneau de tournoi. Non atteignable via l'app (le tunnel choisit toujours
-- un terrain) ; on ferme au niveau du SCHÉMA, la garde la plus dure.
-- Idempotent (re-collable sans effet). Vérifié : 0 ligne court NULL/blanc en base avant pose.

alter table public.reservations
  alter column court set not null;

-- Ceinture : un terrain « vide » ('' ou espaces) est refusé aussi — même classe de contournement.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reservations_court_not_blank'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_court_not_blank check (length(trim(court)) > 0);
  end if;
end $$;
