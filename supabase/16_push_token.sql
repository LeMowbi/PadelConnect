-- PadelConnect — jeton de notifications push (à coller dans Supabase → SQL Editor → Run).
-- Idempotent. Stocke le jeton de push Expo de l'appareil sur le profil, pour que le serveur
-- puisse notifier ce compte (club prévenu d'une réservation, ami qui accepte une invitation…).
-- L'envoi réel des push se fait depuis une Edge Function (cf. docs/PUSH-SETUP.md).

alter table public.profiles add column if not exists expo_push_token text;
