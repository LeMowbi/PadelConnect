-- PadelConnect — stockage des photos de profil (à coller dans Supabase → SQL Editor → Run).
-- Idempotent. Crée un bucket PUBLIC « avatars » et les règles d'accès : chacun lit toutes les
-- photos (affichage), mais ne peut écrire/écraser QUE la sienne (dossier = son user_id).

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Lecture publique des avatars (bucket public ; on garde une policy SELECT explicite).
drop policy if exists "avatars_read" on storage.objects;
create policy "avatars_read" on storage.objects
  for select using (bucket_id = 'avatars');

-- Dépôt de SA propre photo (chemin « {user_id}/... » → 1er dossier = son id).
drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Mise à jour / écrasement de SA propre photo (upsert).
drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
