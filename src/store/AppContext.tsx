// État global de l'app (prototype) + persistance locale via AsyncStorage.

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Competition } from '@/data/competitions';
import type { Match, Visibility } from '@/data/matches';
import type { Review } from '@/data/reviews';
import { seedFriends, type Friend } from '@/data/user';
import { dayKey, nextDays } from '@/lib/days';

export type Account = { firstName: string; lastName: string; phone: string; photoUri?: string };
export type Invited = { id: string; name: string; confirmed: boolean };

export type Reservation = {
  id: string;
  clubId: string;
  clubName: string;
  court: string; // terrain précis réservé (ex. « Terrain 2 »)
  date: string; // libellé d'affichage (ex. « Demain »)
  dateKey: string; // identité stable du jour (AAAA-MM-JJ) — base des calculs
  time: string;
  startsAt: number; // horodatage réel du créneau (rappel, anti double-réservation)
  players: number;
  invited: Invited[];
  result?: 'win' | 'loss';
  resultAt?: number;
  createdAt: number;
};

export type OfficialResult = { id: string; compId?: string; title: string; result: 'win' | 'loss'; at: number; levelAfter: number };

type AppState = {
  account: Account | null;
  level: number; // 1.0 → 7.0
  defaultVisibility: Visibility;
  userReviews: Review[];
  myMatches: Match[];
  joinedMatchIds: string[]; // matchs d'autres joueurs que j'ai rejoints
  myCompetitions: Competition[];
  reservations: Reservation[];
  favoriteClubIds: string[];
  friends: Friend[];
  officialResults: OfficialResult[];
  compRegistrations: Record<string, { partner: string; at: number }>;
  clubPhotos: Record<string, string[]>;
  clubOffers: Record<string, { id: string; kind: 'offre' | 'actu'; title: string; detail: string }[]>;
  clubCoaches: Record<string, { id: string; name: string; specialty: string; phone?: string }[]>;
  boostedClubIds: string[];
  clubMode: boolean;
  managedClubId: string;
  clubSlots: Record<string, string[]>; // horaires ouverts par club
  clubCourts: Record<string, string[]>; // terrains (courts) gérés par club
};

export type Stats = { wins: number; losses: number; played: number; winRate: number; streak: number };

export const COMMISSION_RATE = 0.1; // commission opérateur (10 %)
const LEVEL_STEP = 0.25; // évolution du niveau par compétition officielle
const STORAGE_KEY = 'padelco_state_v3';

const initialState: AppState = {
  account: null,
  level: 3.0,
  defaultVisibility: 'public',
  userReviews: [],
  myMatches: [],
  joinedMatchIds: [],
  myCompetitions: [],
  reservations: [],
  favoriteClubIds: [],
  friends: seedFriends,
  officialResults: [],
  compRegistrations: {},
  clubPhotos: {},
  clubOffers: {},
  clubCoaches: {},
  boostedClubIds: [],
  clubMode: false,
  managedClubId: 'padelta',
  clubSlots: {},
  clubCourts: {},
};

type AppContextType = {
  state: AppState;
  hydrated: boolean;
  stats: Stats;
  setAccount: (a: Account) => void;
  updateAccount: (patch: Partial<Account>) => void;
  loadDemo: () => void;
  signOut: () => void;
  setLevel: (n: number) => void;
  recordOfficialResult: (title: string, result: 'win' | 'loss', compId?: string) => void;
  setDefaultVisibility: (v: Visibility) => void;
  addReview: (clubId: string, rating: number, text: string) => void;
  addMatch: (m: Omit<Match, 'id' | 'createdByMe'>) => void;
  toggleJoinMatch: (id: string) => void;
  addCompetition: (c: Omit<Competition, 'id' | 'createdByMe'>) => void;
  registerCompetition: (id: string, partner: string) => void;
  unregisterCompetition: (id: string) => void;
  addReservation: (r: Omit<Reservation, 'id' | 'createdAt'>) => boolean;
  setReservationResult: (id: string, result: 'win' | 'loss') => void;
  cancelReservation: (id: string) => void;
  confirmInvite: (reservationId: string, friendId: string) => void;
  addFriend: (name: string, phone: string) => void;
  removeFriend: (id: string) => void;
  toggleFavorite: (clubId: string) => void;
  addClubPhoto: (clubId: string, uri: string) => void;
  removeClubPhoto: (clubId: string, uri: string) => void;
  addClubOffer: (clubId: string, kind: 'offre' | 'actu', title: string, detail: string) => void;
  removeClubOffer: (clubId: string, id: string) => void;
  addClubCoach: (clubId: string, name: string, specialty: string, phone: string) => void;
  removeClubCoach: (clubId: string, id: string) => void;
  toggleBoostClub: (clubId: string) => void;
  setClubMode: (on: boolean) => void;
  setManagedClub: (id: string) => void;
  setClubSlots: (clubId: string, slots: string[]) => void;
  setClubCourts: (clubId: string, courts: string[]) => void;
  resetAll: () => void;
};

const AppContext = createContext<AppContextType | null>(null);
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const clampLevel = (n: number) => Math.min(7, Math.max(1, Math.round(n * 100) / 100));

function computeStats(reservations: Reservation[]): Stats {
  const decided = reservations.filter((r) => r.result);
  const wins = decided.filter((r) => r.result === 'win').length;
  const played = decided.length;
  const losses = played - wins;
  const winRate = played > 0 ? Math.round((wins / played) * 100) : 0;
  let streak = 0;
  for (const r of [...decided].sort((a, b) => (b.resultAt ?? 0) - (a.resultAt ?? 0))) {
    if (r.result === 'win') streak++;
    else break;
  }
  return { wins, losses, played, winRate, streak };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setState({ ...initialState, ...JSON.parse(raw) });
      } catch {
        // état par défaut
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, hydrated]);

  const stats = useMemo(() => computeStats(state.reservations), [state.reservations]);

  const api = useMemo<AppContextType>(
    () => ({
      state,
      hydrated,
      stats,
      setAccount: (a) => setState((s) => ({ ...s, account: a })),
      updateAccount: (patch) => setState((s) => ({ ...s, account: s.account ? { ...s.account, ...patch } : s.account })),
      loadDemo: () =>
        setState(() => {
          const now = Date.now();
          const demain = nextDays(2)[1]; // jour « Demain » stable
          const lastWeek = new Date(now - 3 * 86400000);
          return {
            ...initialState,
            account: { firstName: 'Invité', lastName: 'Démo', phone: '+225 07 00 00 00 00' },
            level: 3.5,
            favoriteClubIds: ['padelta'],
            reservations: [
              { id: uid(), clubId: 'district-club', clubName: 'District Club', court: 'Terrain 1', date: demain.label, dateKey: demain.key, time: '18:00', startsAt: demain.value + 18 * 3600000, players: 4, invited: [], createdAt: now },
              { id: uid(), clubId: 'padel-zone-4', clubName: 'Padel Zone 4', court: 'Terrain 2', date: 'Sem. dernière', dateKey: dayKey(lastWeek), time: '18:00', startsAt: now - 3 * 86400000, players: 4, invited: [], result: 'win', resultAt: now - 3 * 86400000, createdAt: now - 3 * 86400000 },
            ],
          };
        }),
      signOut: () => setState((s) => ({ ...s, account: null })),
      setLevel: (n) => setState((s) => ({ ...s, level: clampLevel(n) })),
      recordOfficialResult: (title, result, compId) =>
        setState((s) => {
          // Un même tournoi ne peut être déclaré qu'une seule fois.
          if (compId && s.officialResults.some((o) => o.compId === compId)) return s;
          const next = clampLevel(s.level + (result === 'win' ? LEVEL_STEP : -LEVEL_STEP));
          return {
            ...s,
            level: next,
            officialResults: [{ id: uid(), compId, title, result, at: Date.now(), levelAfter: next }, ...s.officialResults],
          };
        }),
      setDefaultVisibility: (v) => setState((s) => ({ ...s, defaultVisibility: v })),
      addReview: (clubId, rating, text) =>
        setState((s) => ({
          ...s,
          userReviews: [{ id: uid(), clubId, author: 'Vous', rating, text: text.trim() || 'Bonne expérience.', date: "À l'instant" }, ...s.userReviews],
        })),
      addMatch: (m) => setState((s) => ({ ...s, myMatches: [{ ...m, id: uid(), createdByMe: true }, ...s.myMatches] })),
      toggleJoinMatch: (id) =>
        setState((s) => ({
          ...s,
          joinedMatchIds: s.joinedMatchIds.includes(id) ? s.joinedMatchIds.filter((x) => x !== id) : [...s.joinedMatchIds, id],
        })),
      addCompetition: (c) => setState((s) => ({ ...s, myCompetitions: [{ ...c, id: uid(), createdByMe: true }, ...s.myCompetitions] })),
      registerCompetition: (id, partner) =>
        setState((s) =>
          s.compRegistrations[id]
            ? s
            : { ...s, compRegistrations: { ...s.compRegistrations, [id]: { partner: partner.trim() || 'Partenaire', at: Date.now() } } }
        ),
      unregisterCompetition: (id) =>
        setState((s) => {
          const next = { ...s.compRegistrations };
          delete next[id];
          return { ...s, compRegistrations: next };
        }),
      addReservation: (r) => {
        // Anti double-réservation : un même TERRAIN ne peut être pris 2× au même créneau.
        // (Deux terrains différents au même horaire restent possibles.) Indexé sur dateKey.
        const taken = (x: Reservation) => x.clubId === r.clubId && x.dateKey === r.dateKey && x.time === r.time && x.court === r.court;
        if (state.reservations.some(taken)) return false;
        setState((s) => (s.reservations.some(taken) ? s : { ...s, reservations: [{ ...r, id: uid(), createdAt: Date.now() }, ...s.reservations] }));
        return true;
      },
      setReservationResult: (id, result) =>
        setState((s) => ({
          ...s,
          reservations: s.reservations.map((r) => (r.id === id && !r.result ? { ...r, result, resultAt: Date.now() } : r)),
        })),
      cancelReservation: (id) => setState((s) => ({ ...s, reservations: s.reservations.filter((r) => r.id !== id) })),
      confirmInvite: (reservationId, friendId) =>
        setState((s) => ({
          ...s,
          reservations: s.reservations.map((r) =>
            r.id === reservationId
              ? { ...r, invited: r.invited.map((iv) => (iv.id === friendId ? { ...iv, confirmed: !iv.confirmed } : iv)) }
              : r
          ),
        })),
      addFriend: (name, phone) =>
        setState((s) => {
          const n = name.trim();
          if (n.length < 2) return s;
          return { ...s, friends: [{ id: uid(), name: n, phone: phone.trim() || undefined }, ...s.friends] };
        }),
      removeFriend: (id) => setState((s) => ({ ...s, friends: s.friends.filter((f) => f.id !== id) })),
      toggleFavorite: (clubId) =>
        setState((s) => ({
          ...s,
          favoriteClubIds: s.favoriteClubIds.includes(clubId) ? s.favoriteClubIds.filter((x) => x !== clubId) : [...s.favoriteClubIds, clubId],
        })),
      addClubPhoto: (clubId, uri) =>
        setState((s) => {
          const existing = s.clubPhotos[clubId] ?? [];
          if (!uri || existing.includes(uri)) return s;
          return { ...s, clubPhotos: { ...s.clubPhotos, [clubId]: [...existing, uri] } };
        }),
      removeClubPhoto: (clubId, uri) =>
        setState((s) => ({ ...s, clubPhotos: { ...s.clubPhotos, [clubId]: (s.clubPhotos[clubId] ?? []).filter((x) => x !== uri) } })),
      addClubOffer: (clubId, kind, title, detail) =>
        setState((s) => {
          const t = title.trim();
          if (!t) return s;
          const existing = s.clubOffers[clubId] ?? [];
          return { ...s, clubOffers: { ...s.clubOffers, [clubId]: [{ id: uid(), kind, title: t, detail: detail.trim() }, ...existing] } };
        }),
      removeClubOffer: (clubId, id) =>
        setState((s) => ({ ...s, clubOffers: { ...s.clubOffers, [clubId]: (s.clubOffers[clubId] ?? []).filter((o) => o.id !== id) } })),
      addClubCoach: (clubId, name, specialty, phone) =>
        setState((s) => {
          const n = name.trim();
          if (!n) return s;
          const existing = s.clubCoaches[clubId] ?? [];
          return { ...s, clubCoaches: { ...s.clubCoaches, [clubId]: [{ id: uid(), name: n, specialty: specialty.trim() || 'Coach', phone: phone.trim() || undefined }, ...existing] } };
        }),
      removeClubCoach: (clubId, id) =>
        setState((s) => ({ ...s, clubCoaches: { ...s.clubCoaches, [clubId]: (s.clubCoaches[clubId] ?? []).filter((c) => c.id !== id) } })),
      toggleBoostClub: (clubId) =>
        setState((s) => ({
          ...s,
          boostedClubIds: s.boostedClubIds.includes(clubId) ? s.boostedClubIds.filter((x) => x !== clubId) : [...s.boostedClubIds, clubId],
        })),
      setClubMode: (on) => setState((s) => ({ ...s, clubMode: on })),
      setManagedClub: (id) => setState((s) => ({ ...s, managedClubId: id })),
      setClubSlots: (clubId, slots) =>
        setState((s) => ({ ...s, clubSlots: { ...s.clubSlots, [clubId]: [...slots].sort() } })),
      setClubCourts: (clubId, courts) =>
        setState((s) => ({ ...s, clubCourts: { ...s.clubCourts, [clubId]: courts } })),
      resetAll: () => setState(initialState),
    }),
    [state, hydrated, stats]
  );

  return <AppContext.Provider value={api}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp doit être utilisé dans <AppProvider>');
  return ctx;
}
