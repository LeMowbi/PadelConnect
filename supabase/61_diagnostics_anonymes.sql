-- PadelConnect — Audit tour 3 : diagnostics VRAIMENT anonymes.
-- À coller dans Supabase → SQL Editor → Run. Idempotent.
--
-- CONTEXTE. La politique de confidentialité publiée (site/privacy.html, site/cgu.html) promet des
-- « diagnostics techniques … enregistrés SANS identifiant personnel (jamais rattachés à ton
-- compte) ». Or 33_diagnostics.sql posait `user_id` par défaut à `auth.uid()` : pour un compte
-- CONNECTÉ, chaque ligne d'erreur / d'événement était en réalité rattachée à son identifiant —
-- en contradiction directe avec le texte légal (et avec l'intention « Anonyme » de CLAUDE.md §10).
--
-- CORRECTIF. On retire le défaut `auth.uid()` : sans valeur envoyée par le client (le client n'en
-- envoie jamais, cf. src/lib/diagnostics.ts), `user_id` reste NULL → réellement anonyme. La policy
-- d'insertion `with check (user_id is null or user_id = auth.uid())` continue d'empêcher toute
-- USURPATION (impossible d'imputer une ligne à un tiers). La lecture opérateur (DiagnosticsCard)
-- n'a jamais lu `user_id` — aucun impact d'affichage.

alter table public.app_errors alter column user_id drop default;
alter table public.app_events alter column user_id drop default;

-- Respect RÉTROACTIF de la promesse : on efface les rattachements déjà enregistrés.
update public.app_errors set user_id = null where user_id is not null;
update public.app_events set user_id = null where user_id is not null;
