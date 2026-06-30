-- PadelConnect — AVIS VÉRIFIÉS + réponse du gérant (à coller dans Supabase → SQL Editor →
-- Run). Idempotent. Seul un joueur qui a RÉELLEMENT joué au club (réservation passée) peut
-- laisser un avis → tous les avis sont « vérifiés » par construction. Le gérant du club peut
-- répondre. Un joueur a un seul avis par club (modifiable) et peut le supprimer.

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  club_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  author_name text,
  rating int not null check (rating between 1 and 5),
  text text,
  reply text,                 -- réponse publique du gérant
  reply_at timestamptz,
  created_at timestamptz not null default now(),
  unique (club_id, user_id)   -- un avis par joueur et par club (mis à jour si re-soumis)
);

alter table public.reviews enable row level security;

-- Lecture publique (tout compte connecté lit les avis d'un club).
drop policy if exists "reviews_select" on public.reviews;
create policy "reviews_select" on public.reviews for select using (true);

-- Suppression de SON propre avis (les écritures passent par les fonctions ci-dessous).
drop policy if exists "reviews_delete_own" on public.reviews;
create policy "reviews_delete_own" on public.reviews for delete using (auth.uid() = user_id);

-- ─── Déposer/mettre à jour SON avis — seulement si on a joué au club (vérifié) ──
create or replace function public.submit_review(p_club_id text, p_rating int, p_text text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  aname text;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if uid is null or p_rating < 1 or p_rating > 5 then return false; end if;
  -- Vérification : une réservation CONFIRMÉE et déjà passée dans ce club (a réellement joué).
  if not exists (
    select 1 from public.reservations r
    where r.user_id = uid and r.club_id = p_club_id and r.status = 'booked' and r.starts_at <= now_ms
  ) then
    return false;
  end if;
  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), 'Joueur')
    into aname from public.profiles where id = uid;
  insert into public.reviews (club_id, user_id, author_name, rating, text)
    values (p_club_id, uid, aname, p_rating, nullif(trim(coalesce(p_text, '')), ''))
    on conflict (club_id, user_id)
      do update set rating = excluded.rating, text = excluded.text, created_at = now();
  return true;
end;
$$;

grant execute on function public.submit_review(text, int, text) to authenticated;

-- ─── Le GÉRANT du club (ou l'opérateur) répond à un avis ───────────────────────
create or replace function public.reply_to_review(p_review_id uuid, p_reply text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  rclub text;
  clean text := nullif(trim(coalesce(p_reply, '')), '');
begin
  select club_id into rclub from public.reviews where id = p_review_id;
  if rclub is null then return false; end if;
  if not exists (
    select 1 from public.profiles p where p.id = uid and (p.managed_club_id = rclub or p.role = 'operator')
  ) then
    return false; -- seul le gérant du club concerné (ou l'opérateur) peut répondre
  end if;
  update public.reviews
    set reply = clean, reply_at = case when clean is null then null else now() end
    where id = p_review_id;
  return true;
end;
$$;

grant execute on function public.reply_to_review(uuid, text) to authenticated;
