-- PadelConnect — PUSH D'ACTU OPTIONNEL (SQL Editor → Run). Idempotent.
--
-- Demande porteur : quand l'opérateur publie une actu, pouvoir AUSSI envoyer une
-- notification push aux joueurs — mais pas pour toutes les actus : c'est une case à
-- cocher au moment de la publication. Le drapeau est enregistré avec l'actu ; c'est la
-- fonction notify-club (webhook `operator_news`, INSERT + UPDATE) qui lit `push` et
-- n'envoie la notification QUE si la case était cochée.

alter table public.operator_news
  add column if not exists push boolean not null default false;
