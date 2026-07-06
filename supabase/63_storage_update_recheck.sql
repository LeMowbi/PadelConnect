-- PadelConnect — Audit tour 5 : RE-durcissement des policies UPDATE de Storage.
-- À coller dans Supabase → SQL Editor → Run. Idempotent.
--
-- CONTEXTE. Un audit de la base de PRODUCTION a trouvé que les policies UPDATE
-- `avatars_update_own` et `club_photos_update` n'avaient PLUS de `with check` (seulement `using`)
-- côté serveur, alors que les migrations 17 et 20 les définissent AVEC. La base a donc dérivé
-- (très probablement une recréation via l'UI « Storage » du Dashboard, qui génère des policies
-- USING-only). Or, sans `with check`, un UPDATE peut RENOMMER un objet vers le dossier d'AUTRUI
-- (changer le `name`/chemin) : la garde `using` ne valide que la ligne d'ORIGINE, pas la ligne
-- RÉSULTANTE — un joueur pourrait déplacer son avatar dans le dossier d'un autre compte, un
-- gérant une photo dans le dossier d'un autre club. On ré-applique la version durcie (using ET
-- with check identiques), conformément à la convention (CLAUDE.md §8).

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "club_photos_update" on storage.objects;
create policy "club_photos_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'club-photos'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.managed_club_id = (storage.foldername(name))[1] or p.role = 'operator')
    )
  )
  with check (
    bucket_id = 'club-photos'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.managed_club_id = (storage.foldername(name))[1] or p.role = 'operator')
    )
  );
