-- PadelConnect — Audit tour 3 : téléphone de l'organisateur de tournoi RESTREINT.
-- À coller dans Supabase → SQL Editor → Run. Idempotent.
--
-- CONTEXTE. `fetch_competitions` renvoyait `organizer_phone` à TOUT compte authentifié pour
-- chaque tournoi publié/clôturé. Or le projet minimise partout les téléphones (jamais exposés
-- depuis `profiles`, retirés des matchs ouverts par `strip_open_match_phone` en 51, pour éviter
-- la RÉCOLTE). Un joueur pouvait donc moissonner le numéro personnel de tous les organisateurs
-- sans jamais interagir avec leurs tournois — écart avec la politique « téléphone = sensible ».
--
-- CORRECTIF. On restreint la COLONNE `organizer_phone` (le reste de la RPC est inchangé) aux
-- seuls profils qui en ont un besoin légitime :
--   - l'organisateur lui-même (`organizer_id = auth.uid()`),
--   - le club hôte ou l'opérateur (`can_manage_club` → vue Espace Club / Finances opérateur),
--   - les INSCRITS au tournoi (ils règlent les frais via WhatsApp — bouton visible seulement
--     dans le bloc `registered` de competition/[id].tsx).
-- Les autres joueurs reçoivent `null` → plus de récolte. Aucune régression d'affichage : le
-- numéro n'est montré qu'à ces trois profils dans l'app.

drop function if exists public.fetch_competitions();
create or replace function public.fetch_competitions()
returns table (
  id uuid, organizer_id uuid, organizer_type text, organizer_name text, organizer_phone text,
  club_id text, club_name text, title text, format text, level text,
  date_key text, end_date_key text, courts text[], slots text[],
  capacity int, fee text, reward text, official boolean, status text, commission int,
  winner text, second text, third text, loser text, registered int, teams text[],
  reject_reason text, payment_status text, wave_link text
)
language sql
security definer
set search_path = public
stable
as $$
  select c.id, c.organizer_id, c.organizer_type, c.organizer_name,
    case when c.organizer_id = auth.uid()
              or public.can_manage_club(c.club_id)
              or exists (select 1 from public.competition_registrations r
                           where r.competition_id = c.id and r.user_id = auth.uid())
         then c.organizer_phone else null end,
    c.club_id, c.club_name, c.title, c.format, c.level,
    c.date_key, c.end_date_key, c.courts, c.slots,
    c.capacity, c.fee, c.reward, c.official, c.status, c.commission,
    c.winner, c.second, c.third, c.loser,
    (select count(*) from public.competition_registrations r where r.competition_id = c.id)::int,
    (select coalesce(array_agg(trim(coalesce(pr.first_name, '') || ' & ' || rg.partner) order by rg.created_at), '{}')
       from public.competition_registrations rg
       join public.profiles pr on pr.id = rg.user_id
       where rg.competition_id = c.id),
    c.reject_reason,
    c.payment_status,
    (select tc.wave_link from public.tournament_config tc where tc.id = true)
  from public.competitions c
  where c.status in ('published', 'closed')
    or c.organizer_id = auth.uid()
    or public.can_manage_club(c.club_id);
$$;

revoke execute on function public.fetch_competitions() from public, anon;
grant execute on function public.fetch_competitions() to authenticated;
