// Cours collectifs à places (83) : le COACH crée un cours = une réservation standard à son nom
// (mêmes gardes que toute résa, double validation club préservée) + une lesson 'accepted' à
// capacité ; les élèves rejoignent/quittent tant qu'il reste des places et que le cours n'a pas
// commencé. Le tarif se règle au coach, hors app. Convention §8 : null = échec réseau.

import { supabase } from './supabase';

export type GroupLesson = {
  id: string;
  coachId: string;
  coachName: string;
  dateKey: string;
  time: string;
  court: string;
  durationMin: number;
  capacity: number;
  note: string;
  joined: number;
  mine: boolean; // j'y suis inscrit
};

export type MyGroupLesson = {
  id: string;
  clubId: string;
  clubName: string;
  coachName: string;
  dateKey: string;
  time: string;
  court: string;
  durationMin: number;
  note: string;
  startsAt: number;
};

// Coach actif du club : crée le cours (réservation + lesson, atomique serveur). Renvoie l'id
// de la lesson, null = refus (pas coach, créneau fermé/pris, chevauchement, bornes) ou réseau.
// `price` = prix du TERRAIN (priceForSlot — motif request_lesson) : reservations.price porte
// partout le prix du terrain (revenu club, commission) — jamais le tarif du coach.
export async function createGroupLesson(input: {
  clubId: string;
  court: string;
  dateKey: string;
  dateLabel: string;
  time: string;
  durationMin: 60 | 90;
  capacity: number;
  price: number;
  note: string;
}): Promise<string | null> {
  const { data, error } = await supabase.rpc('create_group_lesson', {
    p_club_id: input.clubId,
    p_court: input.court,
    p_date_key: input.dateKey,
    p_time: input.time,
    p_duration: input.durationMin,
    p_capacity: input.capacity,
    p_price: input.price,
    p_note: input.note,
    p_date_label: input.dateLabel,
  });
  if (error || !data) return null;
  return data as string;
}

// Élève : rejoint un cours. 'gone' couvre aussi le blocage coach↔élève (jamais révélé, 53).
export async function joinGroupLesson(lessonId: string): Promise<'ok' | 'full' | 'gone' | 'already' | 'error'> {
  const { data, error } = await supabase.rpc('join_group_lesson', { p_lesson_id: lessonId });
  if (error) return 'error';
  return data === 'ok' || data === 'full' || data === 'gone' || data === 'already' ? data : 'error';
}

// Élève : se désinscrit AVANT le début. false = trop tard / pas inscrit / échec réseau.
export async function leaveGroupLesson(lessonId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('leave_group_lesson', { p_lesson_id: lessonId });
  return !error && data === true;
}

// Cours collectifs à venir d'un club (fiche club, écran coachs). Les cours d'un coach bloqué
// sont masqués côté serveur.
export async function fetchGroupLessons(clubId: string): Promise<GroupLesson[] | null> {
  const { data, error } = await supabase.rpc('fetch_group_lessons', { p_club_id: clubId });
  if (error) return null;
  return (
    (data ?? []) as {
      id: string;
      coach_id: string;
      coach_name: string;
      date_key: string;
      time: string;
      court: string;
      duration_min: number;
      capacity: number;
      note: string;
      joined: number;
      mine: boolean;
    }[]
  ).map((r) => ({
    id: r.id,
    coachId: r.coach_id,
    coachName: r.coach_name || 'Coach',
    dateKey: r.date_key,
    time: r.time,
    court: r.court,
    durationMin: r.duration_min,
    capacity: r.capacity,
    note: r.note ?? '',
    joined: r.joined,
    mine: r.mine === true,
  }));
}

// Mes cours collectifs rejoints, à venir (« Mes réservations » côté élève).
export async function fetchMyGroupLessons(): Promise<MyGroupLesson[] | null> {
  const { data, error } = await supabase.rpc('my_group_lessons');
  if (error) return null;
  return (
    (data ?? []) as {
      id: string;
      club_id: string;
      club_name: string;
      coach_name: string;
      date_key: string;
      time: string;
      court: string;
      duration_min: number;
      note: string;
      starts_at: number;
    }[]
  ).map((r) => ({
    id: r.id,
    clubId: r.club_id,
    clubName: r.club_name || r.club_id,
    coachName: r.coach_name || 'Coach',
    dateKey: r.date_key,
    time: r.time,
    court: r.court,
    durationMin: r.duration_min,
    note: r.note ?? '',
    startsAt: Number(r.starts_at),
  }));
}
