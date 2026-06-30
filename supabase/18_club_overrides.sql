-- PadelConnect — page club éditable, visible par TOUS (à coller dans Supabase → SQL Editor →
-- Run). Idempotent. Aujourd'hui, quand un gérant modifie la page de son club (nom, quartier,
-- description, tarifs, WhatsApp), le changement restait sur SON téléphone. On le stocke côté
-- serveur pour que tous les joueurs le voient. Écriture réservée au gérant du club (ou opérateur).

create table if not exists public.club_overrides (
  club_id text primary key,
  name text,
  area text,
  blurb text,
  type text,                 -- 'Couvert' | 'Extérieur' | 'Mixte'
  price_from integer,
  price_tiers jsonb,         -- [{start,end,price,label}]
  contact_phone text,
  updated_at timestamptz not null default now()
);

alter table public.club_overrides enable row level security;

-- Lecture publique : tout joueur voit la page à jour.
drop policy if exists "club_overrides_read" on public.club_overrides;
create policy "club_overrides_read" on public.club_overrides for select using (true);

-- Écriture par le GÉRANT du club concerné (ou l'opérateur), via fonction SECURITY DEFINER.
create or replace function public.upsert_club_override(
  p_club_id text,
  p_name text,
  p_area text,
  p_blurb text,
  p_type text,
  p_price_from integer,
  p_price_tiers jsonb,
  p_contact_phone text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.managed_club_id = p_club_id or p.role = 'operator')
  ) then
    return false; -- seul le gérant de CE club (ou l'opérateur) peut modifier sa page
  end if;
  insert into public.club_overrides (club_id, name, area, blurb, type, price_from, price_tiers, contact_phone, updated_at)
    values (p_club_id, nullif(p_name, ''), nullif(p_area, ''), nullif(p_blurb, ''), nullif(p_type, ''),
            p_price_from, p_price_tiers, nullif(p_contact_phone, ''), now())
    on conflict (club_id) do update set
      name = excluded.name, area = excluded.area, blurb = excluded.blurb, type = excluded.type,
      price_from = excluded.price_from, price_tiers = excluded.price_tiers,
      contact_phone = excluded.contact_phone, updated_at = now();
  return true;
end;
$$;

grant execute on function public.upsert_club_override(text, text, text, text, text, integer, jsonb, text) to authenticated;
