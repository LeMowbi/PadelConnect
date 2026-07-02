// Coachs & cours côté serveur. Le CLUB promeut un compte joueur en coach (retrouvé par
// téléphone) ; le coach règle sa fiche (spécialité, tarif indicatif, disponibilités) et
// reçoit les demandes de cours. LE TERRAIN N’EST RÉSERVÉ QU’À L’ACCEPTATION du coach
// (respond_lesson crée la réservation, que le club confirme ensuite comme d’habitude).
// Convention réseau (CLAUDE.md §8) : `null` en cas d’échec (≠ []/{} = succès vide).

import { supabase } from './supabase';

// Coach visible sur une fiche club (compte réel promu par le gérant).
export type ServerCoach = {
  userId: string;
  name: string;
  specialty: string;
  price?: number; // tarif indicatif du cours (FCFA, réglé au coach, hors app)
  slots: string[]; // créneaux 1h30 où il donne cours
};

// Ma fiche coach (affichage de l'« Espace Coach » + réglages).
export type CoachProfile = { clubId: string; specialty: string; price?: number; slots: string[] };

// Un cours (demande → accepté/refusé). Vu par l’élève ET par le coach.
export type Lesson = {
  id: string;
  coachId: string;
  coachName: string; // figé à la demande (« Cours avec X » côté élève)
  clubId: string;
  clubName: string;
  studentId: string;
  studentName: string;
  dateKey: string;
  dateLabel: string;
  time: string;
  court: string;
  startsAt: number;
  price?: number; // prix du terrain (la réservation créée le reprend)
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  reservationId?: string;
};

type LessonRow = {
  id: string;
  coach_id: string;
  coach_name: string;
  club_id: string;
  club_name: string;
  student_id: string;
  student_name: string;
  date_key: string;
  date_label: string;
  time: string;
  court: string;
  starts_at: number;
  price: number | null;
  status: Lesson['status'];
  reservation_id: string | null;
};

function toLesson(r: LessonRow): Lesson {
  return {
    id: r.id,
    coachId: r.coach_id,
    coachName: r.coach_name || 'Coach',
    clubId: r.club_id,
    clubName: r.club_name,
    studentId: r.student_id,
    studentName: r.student_name,
    dateKey: r.date_key,
    dateLabel: r.date_label,
    time: r.time,
    court: r.court,
    startsAt: r.starts_at,
    price: r.price ?? undefined,
    status: r.status,
    reservationId: r.reservation_id ?? undefined,
  };
}

// Coachs ACTIFS d’un club (fiche club, réservation de cours).
export async function fetchClubCoaches(clubId: string): Promise<ServerCoach[] | null> {
  const { data, error } = await supabase.rpc('fetch_club_coaches', { p_club_id: clubId });
  if (error) return null;
  return ((data ?? []) as { user_id: string; name: string; specialty: string; price: number | null; slots: string[] }[]).map((r) => ({
    userId: r.user_id,
    name: r.name,
    specialty: r.specialty,
    price: r.price ?? undefined,
    slots: r.slots ?? [],
  }));
}

// Coachs réservables de TOUS les clubs (44) — écran « Réserver un cours » de l'accueil.
// Le nom du club est résolu côté app (les 9 clubs de base ne vivent pas en table).
export async function fetchBookableCoaches(): Promise<(ServerCoach & { clubId: string })[] | null> {
  const { data, error } = await supabase.rpc('fetch_bookable_coaches');
  if (error) return null;
  return (
    (data ?? []) as { user_id: string; club_id: string; name: string; specialty: string; price: number | null; slots: string[] }[]
  ).map((r) => ({
    userId: r.user_id,
    clubId: r.club_id,
    name: r.name,
    specialty: r.specialty,
    price: r.price ?? undefined,
    slots: r.slots ?? [],
  }));
}

// Ma fiche coach — null si je ne suis pas coach actif (ou en cas d’échec réseau : undefined).
export async function fetchMyCoachProfile(): Promise<CoachProfile | null | undefined> {
  const { data, error } = await supabase.rpc('my_coach_profile');
  if (error) return undefined; // échec réseau ≠ « pas coach »
  const row = ((data ?? []) as { club_id: string; specialty: string; price: number | null; slots: string[] }[])[0];
  if (!row) return null;
  return { clubId: row.club_id, specialty: row.specialty, price: row.price ?? undefined, slots: row.slots ?? [] };
}

// Le coach règle sa fiche (spécialité / tarif / disponibilités).
export async function updateCoachProfile(specialty: string, price: number | null, slots: string[]): Promise<boolean> {
  const { data, error } = await supabase.rpc('coach_update_profile', { p_specialty: specialty, p_price: price, p_slots: slots });
  return !error && data === true;
}

// Le GÉRANT promeut un compte joueur en coach de son club (retrouvé par les 10 derniers chiffres).
export async function clubAddCoach(
  clubId: string,
  phone: string,
  specialty: string,
): Promise<{ status: 'ok' | 'already' | 'not_found' | 'forbidden' | 'error'; name?: string }> {
  const { data, error } = await supabase.rpc('club_add_coach', { p_club_id: clubId, p_phone: phone, p_specialty: specialty });
  if (error) return { status: 'error' };
  const row = ((data ?? []) as { status: string; coach_id: string | null; name: string | null }[])[0];
  if (!row) return { status: 'error' };
  return { status: row.status as 'ok' | 'already' | 'not_found' | 'forbidden', name: row.name ?? undefined };
}

// Le GÉRANT fixe le tarif du cours d’un de ses coachs (null = tarif non affiché). Même
// colonne que la fiche coach → affiché à l’identique partout (fiche club, réservation, coach).
export async function clubSetCoachPrice(userId: string, price: number | null): Promise<boolean> {
  const { data, error } = await supabase.rpc('club_set_coach_price', { p_user_id: userId, p_price: price });
  return !error && data === true;
}

// Le gérant retire un coach (désactivation — l’historique de cours est conservé).
export async function clubRemoveCoach(userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('club_remove_coach', { p_user_id: userId });
  return !error && data === true;
}

// L’ÉLÈVE demande un cours (le terrain n’est pas réservé : il le sera à l’acceptation).
export async function requestLesson(input: {
  coachId: string;
  clubId: string;
  clubName: string;
  dateKey: string;
  dateLabel: string;
  time: string;
  court: string;
  startsAt: number;
  price: number;
}): Promise<string | null> {
  const { data, error } = await supabase.rpc('request_lesson', {
    p_coach: input.coachId,
    p_club_id: input.clubId,
    p_club_name: input.clubName,
    p_date_key: input.dateKey,
    p_date_label: input.dateLabel,
    p_time: input.time,
    p_court: input.court,
    p_starts_at: input.startsAt,
    p_price: input.price,
  });
  if (error || !data) return null;
  return data as string;
}

// LE COACH répond. 'ok' = accepté (réservation créée) ; 'conflict' = terrain parti entre-temps.
export async function respondLesson(id: string, accept: boolean): Promise<'ok' | 'declined' | 'conflict' | 'gone' | 'error'> {
  const { data, error } = await supabase.rpc('respond_lesson', { p_id: id, p_accept: accept });
  if (error) return 'error';
  const s = data as string;
  return s === 'ok' || s === 'declined' || s === 'conflict' || s === 'gone' ? s : 'error';
}

// L’élève annule sa demande EN ATTENTE (un cours accepté = une réservation → annulation normale).
export async function cancelLessonRequest(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('cancel_lesson_request', { p_id: id });
  return !error && data === true;
}

// Mes cours côté ÉLÈVE (RLS : student_id = moi). Plus récents d’abord.
export async function fetchMyLessons(userId: string): Promise<Lesson[] | null> {
  const { data, error } = await supabase.from('lessons').select('*').eq('student_id', userId).order('starts_at', { ascending: false });
  if (error) return null;
  return ((data ?? []) as LessonRow[]).map(toLesson);
}

// Les cours côté COACH (RLS : coach_id = moi). Demandes en attente d’abord, puis par date.
export async function fetchCoachLessons(userId: string): Promise<Lesson[] | null> {
  const { data, error } = await supabase.from('lessons').select('*').eq('coach_id', userId).order('starts_at', { ascending: false });
  if (error) return null;
  return ((data ?? []) as LessonRow[]).map(toLesson);
}
