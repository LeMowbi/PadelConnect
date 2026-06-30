-- PadelConnect — boucle de retour du support (à coller dans Supabase → SQL Editor → Run).
-- Idempotent. Permet à un joueur de RELIRE ses propres messages d'aide et leur statut
-- (Reçu / Traité), pour fermer la boucle : il sait que son signalement a été pris en compte.
-- L'opérateur garde son accès complet (05_support.sql) ; on ajoute juste la lecture de SES
-- messages pour leur auteur.

drop policy if exists "support_select_own" on public.support_messages;
create policy "support_select_own" on public.support_messages
  for select using (auth.uid() = user_id);
