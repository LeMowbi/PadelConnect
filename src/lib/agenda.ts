// Agenda du padel ivoirien (chantier v3, lot C — SQL 82) : événements édités par l'opérateur
// (FIP Gold, soirées clubs, stages…), lisibles par tous sur l'accueil. Le push de publication
// part du webhook `events` (notify-club v35) ; le rappel de la veille est une notification
// LOCALE posée par le joueur (« Me rappeler », mécanique matchReminders).

import { supabase } from './supabase';

export type AgendaEvent = {
  id: string;
  title: string;
  dateKey: string; // AAAA-MM-JJ
  place: string; // '' = non renseigné
  link: string; // '' = pas de lien (sinon https:// strict, validé serveur)
  push: boolean; // la publication a envoyé une notification
};

// Événements à venir (l'accueil n'affiche que le futur). Convention §8 : null = échec réseau.
export async function fetchEvents(todayKey: string): Promise<AgendaEvent[] | null> {
  const { data, error } = await supabase
    .from('events')
    .select('id, title, date_key, place, link, push')
    .gte('date_key', todayKey)
    .order('date_key', { ascending: true })
    .limit(20);
  if (error) return null;
  return ((data ?? []) as { id: string; title: string; date_key: string; place: string; link: string; push: boolean }[]).map((r) => ({
    id: r.id,
    title: r.title,
    dateKey: r.date_key,
    place: r.place ?? '',
    link: r.link ?? '',
    push: r.push === true,
  }));
}

// Opérateur : crée (id null) ou modifie un événement. Renvoie l'id, ou null si refusé/échec
// (lien non-https, non-opérateur, réseau).
export async function upsertEvent(ev: {
  id: string | null;
  title: string;
  dateKey: string;
  place: string;
  link: string;
  push: boolean;
}): Promise<string | null> {
  const { data, error } = await supabase.rpc('upsert_event', {
    p_id: ev.id,
    p_title: ev.title,
    p_date_key: ev.dateKey,
    p_place: ev.place,
    p_link: ev.link,
    p_push: ev.push,
  });
  if (error || !data) return null;
  return data as string;
}

// Opérateur : supprime un événement. true = supprimé.
export async function deleteEvent(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('delete_event', { p_id: id });
  return !error && data === true;
}
