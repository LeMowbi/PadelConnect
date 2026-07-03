// Actu d’accueil de l’opérateur, synchronisée (table public.operator_news, une seule ligne 'home').
// Lue par TOUS les joueurs (bandeau d’accueil) ; écrite par le seul opérateur (RLS).

import type { OperatorNews } from '@/store/AppContext';
import { supabase } from './supabase';

type Row = { news_id: string; title: string; subtitle: string | null; link: string | null };

// Renvoie l’actu publiée, null si aucune, ou undefined si échec réseau (l’appelant garde l’existant).
export async function fetchOperatorNews(): Promise<OperatorNews | null | undefined> {
  const { data, error } = await supabase.from('operator_news').select('news_id, title, subtitle, link').eq('key', 'home').maybeSingle();
  if (error) return undefined; // échec réseau / RLS → on ne touche pas au miroir local
  if (!data) return null; // aucune actu publiée
  const row = data as Row;
  return { id: row.news_id, title: row.title, subtitle: row.subtitle ?? undefined, link: row.link ?? undefined };
}

// Publie / met à jour l’actu (opérateur). true si le serveur a accepté.
// `push` (47) : case cochée à la publication → notify-club (webhook operator_news) envoie
// AUSSI l’actu en notification à tous les joueurs. Décochée = bandeau d’accueil seulement.
export async function setOperatorNewsServer(news: OperatorNews, push: boolean): Promise<boolean> {
  const { error } = await supabase
    .from('operator_news')
    .upsert({ key: 'home', news_id: news.id, title: news.title, subtitle: news.subtitle ?? null, link: news.link ?? null, push });
  return !error;
}

// Retire l’actu publiée (opérateur). true si le serveur a accepté.
export async function clearOperatorNewsServer(): Promise<boolean> {
  const { error } = await supabase.from('operator_news').delete().eq('key', 'home');
  return !error;
}
