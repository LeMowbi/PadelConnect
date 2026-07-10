import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { ClubPhoto } from '@/components/ClubPhoto';
import { useToast } from '@/components/Toast';
import { Button, Card, IconCircle, SectionHeader, Tag, Txt } from '@/components/ui';
import { ClubInfoCard } from '@/components/club-admin/ClubInfoCard';
import { SAMPLE_SLOTS, type Club } from '@/data/clubs';
import { courtsFor, resolvedGridFor, type ScheduleCtx } from '@/lib/availability';
import { canAddCourtSlot, durationLabel, offeredDurations, overlaps, slotEnd, toMin, type CourtSlot } from '@/lib/courtSchedule';
import { clubAddCoach, clubRemoveCoach, clubSetCoachPrice, fetchClubCoaches, type ServerCoach } from '@/lib/coachesServer';
import { isPlayed, MAX_CLUB_PHOTOS, useApp, type Reservation } from '@/store/AppContext';
import { fcfa, initials } from '@/lib/format';
import { pickImage } from '@/lib/pickImage';
import { shareText } from '@/lib/share';
import { minPrice, priceTiersFor, timeToMinutes } from '@/lib/pricing';
import {
  buildSlots,
  canAddSlot,
  closedSlot,
  deriveGrid,
  inferOpenClose,
  minutesToSlot,
  slotTime,
  slotToMinutes,
  SESSION_MIN,
} from '@/lib/slots';
import { colors, radius, spacing } from '@/theme';

// ── Éditeur d'horaires PAR TERRAIN (1h/1h30 mélangeables) — une ligne par terrain, chacune
// affichant SA grille effective. Remplace la grille club unique dès que `state.courtSlots[club.id]`
// existe (setCourtSlots posé au moins une fois) ; sinon on garde l'éditeur simple ci-dessous.
function CourtScheduleRow({
  court,
  slots,
  reservations,
  clubId,
  onSave,
}: {
  court: string;
  slots: CourtSlot[]; // grille COMPLÈTE de ce terrain (ouverts + fermés), triée par heure
  reservations: Reservation[];
  clubId: string;
  onSave: (next: CourtSlot[]) => Promise<boolean>;
}) {
  const toast = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [removeMode, setRemoveMode] = useState(false);
  const [durMode, setDurMode] = useState(false); // toucher un créneau = basculer sa durée 1h ↔ 1h30
  const [draftT, setDraftT] = useState('09:00');
  const [draftD, setDraftD] = useState<60 | 90>(90);
  const [saving, setSaving] = useState(false);

  const sorted = slots.slice().sort((a, b) => (toMin(a.t) ?? 0) - (toMin(b.t) ?? 0));

  // Un créneau à venir sur CE terrain chevauche-t-il le créneau candidat ? Même convention
  // demi-ouverte que courtSchedule.overlaps (durée propre à chaque réservation).
  const hasUpcoming = (s: CourtSlot) => {
    const now = Date.now();
    return reservations.some(
      (r) =>
        r.clubId === clubId &&
        r.court === court &&
        !isPlayed(r, now) &&
        overlaps({ t: s.t, d: s.d }, { t: r.time, d: (r.durationMin === 60 ? 60 : 90) as 60 | 90 }),
    );
  };

  const persist = async (next: CourtSlot[], successMsg?: string) => {
    setSaving(true);
    const ok = await onSave(next);
    setSaving(false);
    if (ok && successMsg) toast.show(successMsg);
    if (!ok) toast.show('Enregistrement impossible — vérifie ta connexion', { icon: 'alert-circle' });
    return ok;
  };

  // Fermer/rouvrir un créneau existant (x:true ↔ ouvert) — refuse la FERMETURE d'un créneau qui
  // porte une réservation à venir (même garde que l'éditeur simple), jamais la réouverture.
  const toggleClosed = async (s: CourtSlot) => {
    if (!s.x && hasUpcoming(s)) {
      toast.show('Ce créneau a des réservations à venir sur ce terrain — vois avec les joueurs pour qu’ils annulent depuis l’app.', {
        icon: 'alert-circle',
      });
      return;
    }
    const next = sorted.map((x) => (x.t === s.t ? (s.x ? { t: x.t, d: x.d } : { ...x, x: true as const }) : x));
    await persist(next, s.x ? `Créneau ${s.t} rouvert sur ${court}` : `Créneau ${s.t} fermé sur ${court}`);
  };

  // Retirer DÉFINITIVEMENT un créneau de la grille de ce terrain (≠ le fermer).
  const removeSlot = async (s: CourtSlot) => {
    if (hasUpcoming(s)) {
      toast.show('Ce créneau a des réservations à venir sur ce terrain — vois avec les joueurs pour qu’ils annulent depuis l’app.', {
        icon: 'alert-circle',
      });
      return;
    }
    if (sorted.length <= 1) {
      toast.show('Garde au moins un créneau sur ce terrain — ferme-le plutôt si besoin', { icon: 'alert-circle' });
      return;
    }
    const next = sorted.filter((x) => x.t !== s.t);
    await persist(next, `Créneau ${s.t} retiré de ${court}`);
  };

  // Basculer la durée d'un créneau (1h ↔ 1h30) en gardant la grille SANS TROU : les créneaux
  // qui s'enchaînaient juste derrière se DÉCALENT automatiquement de 30 min (en avant ou en
  // arrière) pour rester collés — un club mélange librement 1h et 1h30 sans jamais créer de
  // trou. Une PAUSE volontaire (vrai trou dans la grille) arrête le décalage : on n'y touche
  // pas. Gardes : refus si le créneau modifié OU un créneau déplacé porte une réservation à
  // venir (leurs heures sont vendues), et l'allongement ne doit pas dépasser minuit.
  const switchDuration = async (s: CourtSlot) => {
    const nextD: 60 | 90 = s.d === 90 ? 60 : 90;
    const delta = nextD - s.d; // -30 (vers 1h) ou +30 (vers 1h30)
    // Chaîne contiguë derrière `s` : chaque créneau qui démarre EXACTEMENT à la fin du
    // précédent suit le décalage ; le premier trou (pause volontaire) arrête la chaîne.
    const idx = sorted.findIndex((x) => x.t === s.t);
    const moved: CourtSlot[] = [];
    let chainEnd = (toMin(s.t) ?? 0) + s.d;
    for (let i = idx + 1; i < sorted.length; i++) {
      const st = toMin(sorted[i].t) ?? 0;
      if (st !== chainEnd) break;
      moved.push(sorted[i]);
      chainEnd = st + sorted[i].d;
    }
    if ([s, ...moved].some(hasUpcoming)) {
      toast.show(
        'Ce changement déplacerait des créneaux qui ont des réservations à venir — vois avec les joueurs pour qu’ils annulent depuis l’app.',
        { icon: 'alert-circle' },
      );
      return;
    }
    if (delta > 0 && chainEnd + delta > 24 * 60) {
      toast.show('Impossible : la grille dépasserait minuit — retire d’abord le dernier créneau.', { icon: 'alert-circle' });
      return;
    }
    const movedTimes = new Set(moved.map((x) => x.t));
    const next = sorted.map((x) => {
      if (x.t === s.t) return { ...x, d: nextD };
      if (movedTimes.has(x.t)) return { ...x, t: minutesToSlot((toMin(x.t) ?? 0) + delta) };
      return x;
    });
    // Ceinture : la grille candidate doit rester saine (aucun chevauchement) — sinon on refuse
    // plutôt que d'enregistrer une grille invalide (le serveur la rejetterait de toute façon).
    const clash = next.some((a, i) => next.some((b, j) => j > i && overlaps(a, b)));
    if (clash) {
      toast.show('Impossible ici : le décalage ferait se chevaucher deux créneaux.', { icon: 'alert-circle' });
      return;
    }
    await persist(
      next,
      `Créneau ${s.t} passé en ${durationLabel(nextD)} sur ${court}` +
        (moved.length
          ? ` — ${moved.length} créneau${moved.length > 1 ? 'x' : ''} décalé${moved.length > 1 ? 's' : ''} pour rester sans trou`
          : ''),
    );
  };

  // Refaire TOUTE la grille du terrain à une durée unique, SANS trou : sessions enchaînées de
  // l'ouverture à la fermeture actuelles (bascule créneau par créneau = un trou de 30 min à
  // chaque raccourcissement — ici la grille est recompactée d'une traite). Les heures de départ
  // changent → refusé si une réservation à venir vit sur ce terrain (elle ne retomberait plus
  // sur un créneau) ; les créneaux fermés sont rouverts (leurs heures n'existent plus), on le dit.
  const rebuildAll = async (d: 60 | 90) => {
    if (!sorted.length) return;
    const now = Date.now();
    if (reservations.some((r) => r.clubId === clubId && r.court === court && !isPlayed(r, now))) {
      toast.show('Ce terrain a des réservations à venir — vois avec les joueurs pour qu’ils annulent depuis l’app.', {
        icon: 'alert-circle',
      });
      return;
    }
    const start = toMin(sorted[0].t) ?? 0;
    const last = sorted[sorted.length - 1];
    const close = slotEnd(last.t, last.d) ?? start;
    const next: CourtSlot[] = [];
    for (let m = start; m + d <= close; m += d) next.push({ t: minutesToSlot(m), d });
    if (!next.length) {
      toast.show(`Plage trop courte pour une session de ${durationLabel(d)}`, { icon: 'alert-circle' });
      return;
    }
    const hadClosed = sorted.some((s) => s.x);
    await persist(
      next,
      `${court} : tout en ${durationLabel(d)} — ${next.length} créneaux sans trou` +
        (hadClosed ? ' (créneaux fermés rouverts — referme ta pause si besoin)' : ''),
    );
  };

  // Ajouter un créneau (heure + durée) — `canAddCourtSlot` porte toutes les règles (format,
  // bornes, chevauchement AVEC les créneaux fermés compris — un créneau fermé occupe sa place).
  const addSlot = async () => {
    const v = canAddCourtSlot(sorted, draftT, draftD);
    if (!v.ok) {
      toast.show(v.error, { icon: 'alert-circle' });
      return;
    }
    const next = [...sorted, { t: draftT, d: draftD }];
    const ok = await persist(next, `Créneau ${draftT} · ${durationLabel(draftD)} ajouté sur ${court}`);
    if (ok) setShowAdd(false);
  };

  return (
    <View style={{ marginTop: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Txt variant="body" style={{ fontWeight: '700', flex: 1 }}>
          {court}
        </Txt>
        <Pressable
          onPress={() => {
            setDurMode((v) => !v);
            setRemoveMode(false);
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${durMode ? 'Terminer le changement de durée' : 'Changer la durée d’un créneau (1h ↔ 1h30)'} sur ${court}`}
        >
          <Ionicons name={durMode ? 'checkmark' : 'time-outline'} size={18} color={durMode ? colors.green : colors.textFaint} />
        </Pressable>
        <Pressable
          onPress={() => {
            setRemoveMode((v) => !v);
            setDurMode(false);
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${removeMode ? 'Terminer le retrait de créneaux' : 'Retirer un créneau'} sur ${court}`}
        >
          <Ionicons
            name={removeMode ? 'checkmark' : 'remove-circle-outline'}
            size={18}
            color={removeMode ? colors.green : colors.textFaint}
          />
        </Pressable>
      </View>
      {durMode ? (
        <View style={{ gap: spacing.xs }}>
          <Txt variant="small" color={colors.textMuted}>
            Touche un créneau pour le passer de 1h à 1h30 (et inversement) : les créneaux suivants se décalent tout seuls pour rester sans
            trou — mélange librement les deux durées. Les pauses (vrais trous) ne bougent pas. Ou refais toute la grille d’un coup :
          </Txt>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Chip
              label="Tout en 1h"
              disabled={saving}
              accessibilityLabel={`Refaire toute la grille de ${court} en sessions de 1h, sans trou`}
              onPress={() => void rebuildAll(60)}
            />
            <Chip
              label="Tout en 1h30"
              disabled={saving}
              accessibilityLabel={`Refaire toute la grille de ${court} en sessions de 1h30, sans trou`}
              onPress={() => void rebuildAll(90)}
            />
          </View>
        </View>
      ) : null}
      <View style={styles.wrap}>
        {sorted.length === 0 ? (
          <Txt variant="small" color={colors.textMuted}>
            Aucun créneau sur ce terrain — ajoutes-en un ci-dessous.
          </Txt>
        ) : null}
        {sorted.map((s) => {
          const end = slotEnd(s.t, s.d);
          const endLabel = end !== null ? minutesToSlot(end) : '?';
          return (
            <Chip
              key={s.t}
              label={`${s.t}→${endLabel} · ${durationLabel(s.d)}`}
              icon={removeMode ? 'close' : durMode ? 'time-outline' : undefined}
              active={!s.x}
              disabled={saving}
              accessibilityLabel={
                removeMode
                  ? `Retirer définitivement le créneau ${s.t}-${endLabel} de ${court}`
                  : durMode
                    ? `Passer le créneau ${s.t} de ${court} en ${durationLabel(s.d === 90 ? 60 : 90)}`
                    : `${court}, créneau ${s.t}-${endLabel}, ${durationLabel(s.d)}, ${s.x ? 'fermé' : 'ouvert'}`
              }
              onPress={() => (removeMode ? void removeSlot(s) : durMode ? void switchDuration(s) : void toggleClosed(s))}
            />
          );
        })}
      </View>
      {showAdd ? (
        <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
          <TimeStepper
            label="Heure"
            value={draftT}
            stepLabel="de 30 minutes"
            canDec={(toMin(draftT) ?? 0) - 30 >= 5 * 60}
            canInc={(toMin(draftT) ?? 0) + 30 + draftD <= 24 * 60}
            onDec={() => setDraftT(minutesToSlot((toMin(draftT) ?? 0) - 30))}
            onInc={() => setDraftT(minutesToSlot((toMin(draftT) ?? 0) + 30))}
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Chip label="1h" active={draftD === 60} onPress={() => setDraftD(60)} />
            <Chip label="1h30" active={draftD === 90} onPress={() => setDraftD(90)} />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button size="sm" label="Ajouter" icon="add" onPress={() => void addSlot()} disabled={saving} />
            <Button size="sm" label="Annuler" variant="ghost" onPress={() => setShowAdd(false)} disabled={saving} />
          </View>
        </View>
      ) : (
        <View style={{ marginTop: spacing.sm, alignItems: 'flex-start' }}>
          <Button
            size="sm"
            variant="ghost"
            label="Ajouter un créneau"
            icon="add-circle-outline"
            onPress={() => setShowAdd(true)}
            disabled={saving}
          />
        </View>
      )}
    </View>
  );
}

// Réglage des heures : l'OUVERTURE se décale par pas de 30 min (un club démarre à 8h00, un autre
// à 8h30 → grilles décalées), la FERMETURE par session entière de 1h30 (le seul pas qui ajoute ou
// retire réellement un créneau). Bornes réalistes d'un club : 05:00 → minuit.
const OPEN_STEP = 30;
const MIN_OPEN = 5 * 60; // 05:00
const MAX_CLOSE = 24 * 60; // 24:00 (minuit)
// Bornes du sélecteur d'ajout d'horaire libre (grille libre) : mêmes 05:00 minimum que l'ouverture,
// 22:30 maximum pour garder une session (1h30) qui finit avant minuit dans le cas courant.
const FREE_ADD_MAX = 22 * 60 + 30; // 22:30

// Sélecteur d'heure « − valeur + » (accessible, simple) — sert à l'ouverture et à la fermeture.
function TimeStepper({
  label,
  value,
  stepLabel,
  onDec,
  onInc,
  canDec,
  canInc,
}: {
  label: string;
  value: string;
  stepLabel: string;
  onDec: () => void;
  onInc: () => void;
  canDec: boolean;
  canInc: boolean;
}) {
  return (
    <View style={styles.stepperRow}>
      <Txt variant="body" style={{ flex: 1, fontWeight: '600' }}>
        {label}
      </Txt>
      <Pressable
        onPress={onDec}
        disabled={!canDec}
        hitSlop={8}
        style={[styles.stepBtn, !canDec && styles.stepBtnOff]}
        accessibilityRole="button"
        accessibilityLabel={`${label} : reculer ${stepLabel}`}
        accessibilityValue={{ text: value }}
      >
        <Ionicons name="remove" size={18} color={canDec ? colors.signature : colors.textFaint} />
      </Pressable>
      <Txt variant="h3" style={styles.stepValue}>
        {value}
      </Txt>
      <Pressable
        onPress={onInc}
        disabled={!canInc}
        hitSlop={8}
        style={[styles.stepBtn, !canInc && styles.stepBtnOff]}
        accessibilityRole="button"
        accessibilityLabel={`${label} : avancer ${stepLabel}`}
        accessibilityValue={{ text: value }}
      >
        <Ionicons name="add" size={18} color={canInc ? colors.signature : colors.textFaint} />
      </Pressable>
    </View>
  );
}

export function SectionMonClub({ club }: { club: Club }) {
  const {
    state,
    setClubSlots,
    setCourtSlots,
    setCourtClosed,
    setClubCourts,
    addClubPhoto,
    removeClubPhoto,
    setClubCover,
    setClubCourtPhoto,
    addClubOffer,
    removeClubOffer,
    setClubInfo,
  } = useApp();
  const toast = useToast();

  const [url, setUrl] = useState('');
  const [offerKind, setOfferKind] = useState<'offre' | 'actu' | 'evenement'>('offre');
  const [offerTitle, setOfferTitle] = useState('');
  const [offerDetail, setOfferDetail] = useState('');
  const [courtName, setCourtName] = useState('');

  // Heures d’ouverture/fermeture DÉRIVÉES de la grille stockée (créneaux fermés '!' compris) —
  // aucun état local : les sélecteurs reflètent toujours la config réelle, rien ne se
  // « réinitialise » en rouvrant l’écran, et un changement de club se répercute aussitôt.
  // La grille affichée EST la grille stockée (dédupliquée/triée) : un horaire retiré ne
  // réapparaît jamais — l'ancienne union avec buildSlots ressuscitait les retraits et créait
  // des chips fantômes à moins de 90 min d'un vrai créneau, rouvrables (double-vente).
  const storedSlots = state.clubSlots[club.id] ?? SAMPLE_SLOTS;
  const grid = deriveGrid(storedSlots);
  // Créneaux OUVERTS (LEGACY, grille club unique) : ceux présents SANS préfixe '!' dans la
  // config stockée (un '!t' stocké = fermé, exclu).
  const openSlots = grid.filter((t) => storedSlots.includes(t));
  const { open: openTime, close: closeTime } = inferOpenClose(grid);
  const openMin = slotToMinutes(openTime) ?? MIN_OPEN;
  const closeMin = slotToMinutes(closeTime) ?? MAX_CLOSE;
  const courts = courtsFor(club, state.clubCourts);

  // ── Grille PAR TERRAIN (68) : source de vérité dès que `courtSlots[club.id]` existe (posée par
  // « Passer aux horaires par terrain » ci-dessous, ou déjà réglée). Tant qu'elle est absente, on
  // garde l'éditeur simple (grille club unique, 1h30 fixe) ci-dessus — écran plus léger pour les
  // clubs qui n'ont pas besoin de mélanger 1h/1h30.
  const sched: ScheduleCtx = {
    clubSlots: state.clubSlots,
    clubCourts: state.clubCourts,
    courtSlots: state.courtSlots,
    courtClosed: state.clubCourtClosed,
  };
  const hasPerCourtGrid = !!state.courtSlots[club.id];
  const perCourtGrid = resolvedGridFor(club, sched);

  // ── Grille libre : ajouter/retirer un horaire précis à la grille (au-delà de la simple
  // plage ouverture/fermeture) — voir addFreeSlot/removeFreeSlot plus bas. `savingGrid` sert de
  // garde anti double-tap commune à ces deux écritures.
  // Pré-rempli VALIDE quelle que soit la fermeture : au plus 22:30 (dernière session finissant
  // à minuit) — `closeTime` brut pouvait dépasser (club fermant à 23:00 ou minuit) et garantir
  // une erreur au premier tap sur « Ajouter ».
  const [draftSlot, setDraftSlot] = useState(() => minutesToSlot(Math.min(closeMin, FREE_ADD_MAX)));
  const [removingSlot, setRemovingSlot] = useState(false);
  const [savingGrid, setSavingGrid] = useState(false);
  // ── Horaires par terrain (fermetures récurrentes) — voir toggleCourtSlot plus bas.
  // Replié par défaut : réglage rare, et la grille courts × créneaux alourdissait la carte
  // (elle se re-rendait aussi à chaque frappe dans les champs de la section).
  const [savingCourtHours, setSavingCourtHours] = useState(false);
  const [showCourtHours, setShowCourtHours] = useState(false);

  const photos = state.clubPhotos[club.id] ?? [];
  const offers = state.clubOffers[club.id] ?? [];
  const boosted = state.boostedClubIds.includes(club.id);
  const cover = state.clubCovers[club.id];
  const courtPhotos = state.clubCourtPhotos[club.id] ?? {};

  // ── Coachs RÉSERVABLES (comptes promus, serveur) — nécessite une session gérant ──
  const [bookableCoaches, setBookableCoaches] = useState<ServerCoach[]>([]);
  const [promotePhone, setPromotePhone] = useState('');
  const [promoteSpec, setPromoteSpec] = useState('');
  const [promoting, setPromoting] = useState(false);
  const connected = !!state.serverUserId;
  const clubId = club.id;
  useEffect(() => {
    if (!connected) return;
    let alive = true;
    void fetchClubCoaches(clubId).then((cs) => {
      if (alive && cs) setBookableCoaches(cs); // null = échec réseau → on garde l’existant
    });
    return () => {
      alive = false;
    };
  }, [clubId, connected]);

  const promoteCoach = async () => {
    if (promoting || promotePhone.trim().length < 8) return;
    setPromoting(true);
    const res = await clubAddCoach(club.id, promotePhone, promoteSpec.trim());
    if (res.status === 'ok') {
      toast.show(`${res.name ?? 'Ce joueur'} est maintenant coach de ${club.name} ✓`);
      setPromotePhone('');
      setPromoteSpec('');
      const cs = await fetchClubCoaches(club.id);
      if (cs) setBookableCoaches(cs);
    } else if (res.status === 'already') {
      toast.show(`${res.name ?? 'Ce joueur'} est déjà coach de ${club.name}`, { icon: 'information-circle' });
    } else if (res.status === 'other_club') {
      toast.show(`${res.name ?? 'Ce joueur'} est déjà coach d’un autre club — il doit d’abord y être retiré`, { icon: 'alert-circle' });
    } else if (res.status === 'not_found') {
      toast.show('Aucun compte PadelConnect avec ce numéro — il doit d’abord créer son compte', { icon: 'alert-circle' });
    } else if (res.status === 'forbidden') {
      toast.show('Action réservée au gérant du club', { icon: 'alert-circle' });
    } else {
      toast.show('Connexion impossible — réessaie', { icon: 'cloud-offline-outline' });
    }
    setPromoting(false);
  };

  // Confirmation légère « en place » avant retrait (motif : amis.tsx, « Retirer … de tes amis ? »)
  // + garde anti double-tap par userId (le retrait refuse définitivement les demandes de cours
  // en attente du coach côté serveur — irréversible — même si sa fiche reste re-promouvable).
  const [confirmDemoteId, setConfirmDemoteId] = useState<string | null>(null);
  const [demoting, setDemoting] = useState<string | null>(null);
  const demoteCoach = async (c: ServerCoach) => {
    if (demoting) return;
    setConfirmDemoteId(null);
    setDemoting(c.userId);
    const ok = await clubRemoveCoach(c.userId);
    setDemoting(null);
    if (ok) {
      setBookableCoaches((cur) => cur.filter((x) => x.userId !== c.userId));
      toast.show(`${c.name} n’est plus coach du club`);
    } else {
      toast.show('Retrait impossible — réessaie', { icon: 'alert-circle' });
    }
  };

  // Tarif du cours fixé par le CLUB (42) — édition inline sur la ligne du coach.
  const [priceEditing, setPriceEditing] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);
  const saveCoachPrice = async (c: ServerCoach) => {
    if (savingPrice) return;
    const price = priceDraft.trim() === '' ? null : Number(priceDraft);
    if (price !== null && (!Number.isFinite(price) || price < 1000 || price > 1000000)) {
      toast.show('Tarif entre 1 000 et 1 000 000 FCFA (vide = non affiché)', { icon: 'alert-circle' });
      return;
    }
    setSavingPrice(true);
    const ok = await clubSetCoachPrice(c.userId, price);
    setSavingPrice(false);
    if (ok) {
      setBookableCoaches((cur) => cur.map((x) => (x.userId === c.userId ? { ...x, price: price ?? undefined } : x)));
      setPriceEditing(null);
      toast.show(price === null ? 'Tarif retiré' : `Tarif de la session de cours : ${fcfa(price)} ✓`);
    } else {
      toast.show('Enregistrement impossible — réessaie', { icon: 'alert-circle' });
    }
  };

  // ── Photos : cover (photo « de profil ») + une photo par terrain ──
  const [uploadingCover, setUploadingCover] = useState(false);
  const changeCover = async () => {
    const uri = await pickImage();
    if (!uri) return;
    setUploadingCover(true);
    const ok = await setClubCover(club.id, uri);
    setUploadingCover(false);
    toast.show(
      ok ? 'Photo de profil enregistrée ✓' : 'Photo non envoyée — vérifie ta connexion',
      ok ? undefined : { icon: 'alert-circle' },
    );
  };
  const [uploadingCourt, setUploadingCourt] = useState<string | null>(null);
  const changeCourtPhoto = async (courtName: string) => {
    const uri = await pickImage();
    if (!uri) return;
    setUploadingCourt(courtName);
    const ok = await setClubCourtPhoto(club.id, courtName, uri);
    setUploadingCourt(null);
    toast.show(
      ok ? `Photo du ${courtName} enregistrée ✓` : 'Photo non envoyée — vérifie ta connexion',
      ok ? undefined : { icon: 'alert-circle' },
    );
  };

  // Change la plage d’ouverture : régénère les créneaux de 1h30. On PRÉSERVE les créneaux que le
  // gérant a fermés manuellement (pause déjeuner…) tant qu’ils restent dans la nouvelle grille, et
  // on refuse de retirer un créneau qui porte une réservation à venir (comme toggleSlot). On
  // stocke la grille COMPLÈTE (fermés préfixés '!') : les sélecteurs se re-déduisent d’elle.
  const applyRange = async (nextOpen: string, nextClose: string) => {
    const closed = new Set(grid.filter((t) => !openSlots.includes(t)));
    const nextOpenMin = slotToMinutes(nextOpen) ?? MIN_OPEN;
    const nextCloseMin = slotToMinutes(nextClose) ?? MAX_CLOSE;
    // Échelle standard recalée + ré-injection des horaires LIBRES (hors échelle actuelle) qui
    // tiennent encore : la grille libre du gérant survit à un réglage de plage tant qu'elle est
    // compatible (avant, tout horaire ajouté à la main sautait silencieusement).
    const ladderNow = buildSlots(openTime, closeTime);
    const freeTimes = grid.filter((t) => !ladderNow.includes(t));
    const next = buildSlots(nextOpen, nextClose);
    for (const t of freeTimes) {
      const m = slotToMinutes(t);
      if (m !== null && m >= nextOpenMin && m + SESSION_MIN <= nextCloseMin && canAddSlot(next, t).ok) next.push(t);
    }
    next.sort();
    const now = Date.now();
    const dropped = openSlots.filter((t) => !next.includes(t));
    if (dropped.some((t) => state.reservations.some((r) => r.clubId === club.id && r.time === t && !isPlayed(r, now)))) {
      toast.show('Un créneau à retirer a des réservations à venir — vois avec les joueurs pour qu’ils annulent depuis l’app.', {
        icon: 'alert-circle',
      });
      return;
    }
    const ok = await setClubSlots(
      club.id,
      next.map((t) => (closed.has(t) ? closedSlot(t) : t)),
    );
    if (!ok) {
      toast.show('Horaires non enregistrés — vérifie ta connexion', { icon: 'alert-circle' });
      return;
    }
    // Un décalage de grille (ex. 8h00 → 8h30) peut faire disparaître un créneau fermé à la main
    // (pause déjeuner) ou un horaire libre devenu incompatible : on le dit, sinon le gérant
    // croit son créneau conservé alors qu'il a silencieusement sauté.
    const lost = [...new Set([...closed, ...freeTimes.filter((t) => openSlots.includes(t))])].filter((t) => !next.includes(t)).sort();
    if (lost.length) {
      toast.show(
        `Nouvelle grille : ${lost.join(', ')} ${lost.length > 1 ? 'ne tiennent plus' : 'ne tient plus'} dans la plage — ré-ajoute via « Ajouter un horaire » si besoin.`,
        { icon: 'information-circle' },
      );
    }
  };

  const toggleSlot = async (t: string) => {
    if (openSlots.includes(t)) {
      // Fermer un horaire qui porte encore une réservation À VENIR la rendrait invisible du
      // planning sans l'annuler → on refuse tant qu'elle n'est pas jouée (ou annule-la avant).
      const now = Date.now();
      if (state.reservations.some((r) => r.clubId === club.id && r.time === t && !isPlayed(r, now))) {
        toast.show('Cet horaire a des réservations à venir — vois avec les joueurs pour qu’ils annulent depuis l’app.', {
          icon: 'alert-circle',
        });
        return;
      }
    } else {
      // Ceinture avant RÉOUVERTURE : jamais deux créneaux ouverts à moins d'une session (une
      // grille saine l'exclut déjà, mais une double-vente physique serait grave).
      const v = canAddSlot(
        grid.filter((x) => x !== t && openSlots.includes(x)),
        t,
      );
      if (!v.ok) {
        toast.show(v.error, { icon: 'alert-circle' });
        return;
      }
    }
    // Réécrit la grille complète : `t` bascule ouvert ↔ fermé ('!t'), le reste est inchangé
    // (une vieille config « ouverts seuls » est normalisée en grille complète au passage).
    const willBeOpen = (x: string) => (x === t ? !openSlots.includes(x) : openSlots.includes(x));
    const ok = await setClubSlots(
      club.id,
      grid.map((x) => (willBeOpen(x) ? x : closedSlot(x))),
    );
    if (!ok) toast.show('Horaires non enregistrés — vérifie ta connexion', { icon: 'alert-circle' });
  };

  // Ajoute un horaire précis à la grille (ex. 10:00 après avoir retiré 9:30) — `canAddSlot`
  // porte toutes les règles (format, bornes, chevauchement) et fournit un message prêt à afficher.
  const addFreeSlot = async () => {
    if (savingGrid) return;
    const v = canAddSlot(grid, draftSlot);
    if (!v.ok) {
      toast.show(v.error, { icon: 'alert-circle' });
      return;
    }
    // Un horaire hors de la couverture des plages tarifaires serait vendu au TARIF MINIMUM
    // (repli silencieux de priceForSlot) : on prévient — l'ajout reste possible, le gérant
    // ajuste ses plages dans « Infos du club » quand il veut.
    const tiers = priceTiersFor(club);
    const draftMin = slotToMinutes(draftSlot);
    if (
      tiers.length > 0 &&
      draftMin !== null &&
      !tiers.some((p) => {
        const s = timeToMinutes(p.start);
        const e = timeToMinutes(p.end);
        return s !== null && e !== null && draftMin >= s && draftMin < e;
      })
    ) {
      toast.show(
        'Ce créneau sera vendu au tarif minimum tant que tes plages tarifaires ne le couvrent pas — ajuste-les dans « Infos du club »',
        {
          icon: 'information-circle',
        },
      );
    }
    const next = [...grid.map((t) => (openSlots.includes(t) ? t : closedSlot(t))), draftSlot].sort((a, b) =>
      slotTime(a).localeCompare(slotTime(b)),
    );
    setSavingGrid(true);
    const ok = await setClubSlots(club.id, next);
    setSavingGrid(false);
    if (!ok) toast.show('Horaires non enregistrés — vérifie ta connexion', { icon: 'alert-circle' });
  };

  // Retire DÉFINITIVEMENT un horaire de la grille (≠ le fermer) — même garde qu'un
  // retrait/fermeture normal : refuse tant qu'une réservation à venir l'occupe.
  const removeFreeSlot = async (t: string) => {
    if (savingGrid) return;
    // Une grille vide retomberait sur la grille par défaut (fausse) et rendrait l'écran
    // incohérent : on garde toujours au moins un horaire (même motif que removeCourt).
    if (grid.length <= 1) {
      toast.show('Garde au moins un horaire — ferme-le plutôt si besoin', { icon: 'alert-circle' });
      return;
    }
    const now = Date.now();
    if (state.reservations.some((r) => r.clubId === club.id && r.time === t && !isPlayed(r, now))) {
      toast.show('Cet horaire a des réservations à venir — vois avec les joueurs pour qu’ils annulent depuis l’app.', {
        icon: 'alert-circle',
      });
      return;
    }
    const next = grid.filter((x) => x !== t).map((x) => (openSlots.includes(x) ? x : closedSlot(x)));
    setSavingGrid(true);
    const ok = await setClubSlots(club.id, next);
    setSavingGrid(false);
    // Succès confirmé (toast = annoncé au lecteur d'écran) : le silence ne confirmait rien.
    if (ok) toast.show(`Horaire ${t} retiré de la grille`);
    else toast.show('Horaires non enregistrés — vérifie ta connexion', { icon: 'alert-circle' });
  };

  // Ferme/rouvre un horaire sur UN SEUL terrain (les autres restent réservables) — carte complète
  // { terrain: [horaires fermés] } remplacée d'un coup côté serveur.
  const toggleCourtSlot = async (court: string, t: string) => {
    if (savingCourtHours) return;
    const closedTimes = state.clubCourtClosed[club.id]?.[court] ?? [];
    const closingNow = !closedTimes.includes(t);
    if (closingNow) {
      // Fermer un horaire qui porte encore une réservation À VENIR sur CE terrain le rendrait
      // invisible du planning sans l'annuler → on refuse, comme pour une fermeture globale.
      const now = Date.now();
      if (state.reservations.some((r) => r.clubId === club.id && r.court === court && r.time === t && !isPlayed(r, now))) {
        toast.show('Cet horaire a des réservations à venir sur ce terrain — vois avec les joueurs pour qu’ils annulent depuis l’app.', {
          icon: 'alert-circle',
        });
        return;
      }
    }
    const nextList = closingNow ? [...closedTimes, t] : closedTimes.filter((x) => x !== t);
    const nextMap = { ...(state.clubCourtClosed[club.id] ?? {}) };
    if (nextList.length) nextMap[court] = nextList;
    else delete nextMap[court];
    setSavingCourtHours(true);
    const ok = await setCourtClosed(club.id, nextMap);
    setSavingCourtHours(false);
    if (!ok) toast.show('Enregistrement impossible — vérifie ta connexion', { icon: 'alert-circle' });
  };

  const addCourt = async () => {
    const n = courtName.trim();
    if (n.length < 1 || courts.includes(n)) return;
    const ok = await setClubCourts(club.id, [...courts, n]);
    if (!ok) {
      toast.show('Terrain non enregistré — vérifie ta connexion', { icon: 'alert-circle' });
      return;
    }
    // Sous grille PAR TERRAIN : le nouveau terrain hérite tout de suite de la grille du premier
    // terrain du club (mêmes horaires ET durées 1h/1h30). Sans ça il retomberait sur la grille
    // générique @90 — PAS les horaires du club — et la prochaine sauvegarde figerait ce défaut
    // (c'est ce qui a effacé les réglages d'un gérant qui re-créait ses terrains). Best-effort,
    // comme les nettoyages de removeCourt.
    const storedGrid = state.courtSlots[club.id];
    if (storedGrid && Object.keys(storedGrid).length) {
      const model = storedGrid[courts[0]] ?? Object.values(storedGrid)[0] ?? [];
      if (model.length) void setCourtSlots(club.id, { ...storedGrid, [n]: model.map((s) => ({ ...s })) });
    }
    setCourtName('');
  };
  const removeCourt = async (n: string) => {
    if (courts.length <= 1) return; // garder au moins un terrain
    // Retirer un terrain qui a des réservations À VENIR les rendrait invisibles du planning ET
    // rouvrirait le créneau à la réservation → double occupation physique. On refuse.
    const now = Date.now();
    if (state.reservations.some((r) => r.clubId === club.id && r.court === n && !isPlayed(r, now))) {
      toast.show(`« ${n} » a des réservations à venir — annule-les ou attends qu’elles soient jouées.`, { icon: 'alert-circle' });
      return;
    }
    const ok = await setClubCourts(
      club.id,
      courts.filter((c) => c !== n),
    );
    if (!ok) {
      toast.show('Terrain non retiré — vérifie ta connexion', { icon: 'alert-circle' });
      return;
    }
    // Sa photo ne sert plus à rien (et resterait orpheline en base/Storage) → on la retire aussi.
    if (courtPhotos[n]) void setClubCourtPhoto(club.id, n, null);
    // Idem pour ses fermetures récurrentes : un terrain RE-CRÉÉ au même nom ne doit pas hériter
    // en silence d'anciens horaires fermés (best-effort, comme la photo).
    if (state.clubCourtClosed[club.id]?.[n]) {
      const nextMap = { ...(state.clubCourtClosed[club.id] ?? {}) };
      delete nextMap[n];
      void setCourtClosed(club.id, nextMap);
    }
    // Idem pour sa grille par terrain : une entrée orpheline serait ré-héritée en silence par un
    // terrain re-créé au même nom (et fausse le comptage des grilles explicites).
    const storedGrid = state.courtSlots[club.id];
    if (storedGrid?.[n]) {
      const nextGrid = { ...storedGrid };
      delete nextGrid[n];
      void setCourtSlots(club.id, nextGrid);
    }
  };

  const shareBoost = () =>
    void shareText(`Bonjour PadelConnect, je souhaite booster le profil de ${club.name} (paiement par Wave).`).then((r) => {
      if (r === 'copied') toast.show('Message copié dans le presse-papiers ✅');
    });

  const photosFull = photos.length >= MAX_CLUB_PHOTOS;
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const addPhotoFromDevice = async () => {
    if (photosFull) {
      toast.show(`Maximum ${MAX_CLUB_PHOTOS} photos par club`, { icon: 'alert-circle' });
      return;
    }
    const uri = await pickImage();
    if (!uri) return;
    // La photo est envoyée au serveur (visible par tous) : court délai → on signale l’envoi.
    setUploadingPhoto(true);
    const ok = await addClubPhoto(club.id, uri);
    setUploadingPhoto(false);
    // L'échec d'UPLOAD a déjà son alerte dans addClubPhoto ; ici on couvre l'échec d'ÉCRITURE.
    if (!ok) toast.show('Photo non enregistrée — vérifie ta connexion', { icon: 'alert-circle' });
  };
  const addPhotoFromUrl = async () => {
    if (photosFull) {
      toast.show(`Maximum ${MAX_CLUB_PHOTOS} photos par club`, { icon: 'alert-circle' });
      return;
    }
    if (/^https?:\/\//.test(url.trim())) {
      const ok = await addClubPhoto(club.id, url.trim());
      if (!ok) {
        toast.show('Photo non enregistrée — vérifie ta connexion', { icon: 'alert-circle' });
        return;
      }
      setUrl('');
    }
  };
  const submitOffer = async () => {
    if (offerTitle.trim().length < 2) return;
    const ok = await addClubOffer(club.id, offerKind, offerTitle, offerDetail);
    if (!ok) {
      toast.show('Offre non enregistrée — vérifie ta connexion', { icon: 'alert-circle' });
      return;
    }
    setOfferTitle('');
    setOfferDetail('');
  };
  // Checklist d’accueil : guide un club fraîchement rattaché vers une page complète.
  // Chaque ligne reflète l’état RÉEL ; la carte disparaît quand tout est fait.
  const checklist = [
    { done: !!cover || photos.length > 0, label: 'Ajoute tes photos (profil + galerie)' },
    { done: !!state.clubSlots[club.id] || hasPerCourtGrid, label: 'Vérifie tes horaires ouverts à la réservation' },
    { done: !!state.clubCourts[club.id], label: 'Vérifie tes terrains (noms, photo par terrain)' },
    {
      done: !!state.clubInfo[club.id]?.priceFrom || !!state.clubInfo[club.id]?.priceTiers?.length,
      label: 'Renseigne tes tarifs',
    },
  ];
  const checklistDone = checklist.every((c) => c.done);

  return (
    <>
      {!checklistDone ? (
        <Card style={{ marginTop: spacing.md, borderColor: colors.signature }}>
          <Txt variant="h3">Complète ta page 🎾</Txt>
          <Txt variant="muted" style={{ marginTop: 2 }}>
            Une page complète attire plus de joueurs : vraies photos, horaires et tarifs justes.
          </Txt>
          <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
            {checklist.map((c) => (
              <View key={c.label} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons
                  name={c.done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={16}
                  color={c.done ? colors.green : colors.textFaint}
                />
                <Txt variant="small" color={c.done ? colors.textFaint : colors.text} style={{ flex: 1 }}>
                  {c.label}
                </Txt>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {/* Infos du club — éditables par le gérant. On transmet les heures d’ouverture (déduites
          des créneaux) : les plages tarifaires doivent couvrir CETTE amplitude, pas un 07→24 forcé. */}
      <SectionHeader title="Infos du club" />
      <ClubInfoCard key={club.id} club={club} onSave={(patch) => setClubInfo(club.id, patch)} openMin={openMin} closeMin={closeMin} />

      {/* Booster le profil */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Booster mon profil" />
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <IconCircle icon="megaphone" color={colors.signature} bg={colors.greenSoft} />
            <View style={{ flex: 1 }}>
              <Txt variant="h3">Mettre {club.name} en avant</Txt>
              <Txt variant="muted">
                Apparais en tête de liste avec un badge « Sponsorisé ». Paiement par Wave auprès de PadelConnect, qui active le boost.
              </Txt>
            </View>
            {boosted ? <Tag label="Actif" tone="amber" icon="megaphone" /> : null}
          </View>
          <View style={{ marginTop: spacing.md }}>
            <Button size="sm" label="Contacter PadelConnect" icon="paper-plane" onPress={shareBoost} full />
          </View>
        </Card>
      </View>

      {/* Photos du club : photo de profil (carte des listes) + galerie générale */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Photos du club" />
        <Card>
          <Txt variant="label">Photo de profil</Txt>
          <Txt variant="muted" style={{ marginTop: 2 }}>
            C’est elle que les joueurs voient sur ta carte, avant d’ouvrir ta fiche.
          </Txt>
          <View style={styles.coverRow}>
            <ClubPhoto uri={cover} accent={club.accent} initials={initials(club.name)} height={90} width={120} rounded={radius.md} />
            <View style={{ flex: 1, gap: spacing.sm }}>
              <Button
                size="sm"
                label={uploadingCover ? 'Envoi…' : cover ? 'Changer' : 'Choisir une photo'}
                icon="camera-outline"
                variant="secondary"
                onPress={changeCover}
                disabled={uploadingCover}
              />
              {cover ? (
                <Button
                  size="sm"
                  label="Retirer"
                  icon="trash-outline"
                  variant="ghost"
                  onPress={async () => {
                    const ok = await setClubCover(club.id, null);
                    toast.show(ok ? 'Photo de profil retirée' : 'Retrait impossible — réessaie', ok ? undefined : { icon: 'alert-circle' });
                  }}
                />
              ) : null}
            </View>
          </View>
          <View style={styles.coverDivider} />
          <Txt variant="label">Galerie</Txt>
          <Txt variant="muted" style={{ marginTop: 2 }}>
            Ajoute les vraies photos de ton club (visibles par les joueurs). Jusqu’à {MAX_CLUB_PHOTOS} photos.
          </Txt>
          {state.storageFull ? (
            <View style={styles.storageWarn}>
              <Ionicons name="warning-outline" size={16} color={colors.danger} />
              <Txt variant="small" color={colors.danger} style={{ flex: 1 }}>
                Stockage plein — certaines photos n’ont pas pu être enregistrées. Retire-en quelques-unes.
              </Txt>
            </View>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginTop: spacing.md }}>
            {photos.map((uri) => (
              <View key={uri}>
                <ClubPhoto uri={uri} accent={club.accent} initials={initials(club.name)} height={90} width={120} rounded={radius.md} />
                <Pressable
                  onPress={() =>
                    void removeClubPhoto(club.id, uri).then((ok) => {
                      if (!ok) toast.show('Photo non retirée — vérifie ta connexion', { icon: 'alert-circle' });
                    })
                  }
                  style={styles.removeBadge}
                  hitSlop={13}
                  accessibilityRole="button"
                  accessibilityLabel="Retirer cette photo"
                >
                  <Ionicons name="close" size={14} color={colors.white} />
                </Pressable>
              </View>
            ))}
            {photosFull ? null : (
              <Pressable
                onPress={addPhotoFromDevice}
                style={styles.addTile}
                disabled={uploadingPhoto}
                accessibilityRole="button"
                accessibilityLabel="Ajouter une photo"
                accessibilityState={{ disabled: uploadingPhoto }}
              >
                <Ionicons name={uploadingPhoto ? 'cloud-upload-outline' : 'camera-outline'} size={22} color={colors.signature} />
                <Txt variant="small" color={colors.signature} style={{ marginTop: 4 }}>
                  {uploadingPhoto ? 'Envoi…' : 'Ajouter'}
                </Txt>
              </Pressable>
            )}
          </ScrollView>
          <View style={styles.inlineRow}>
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder="…ou coller un lien d’image (https://)"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              maxLength={300}
              accessibilityLabel="Lien d’une image de terrain (https)"
              style={styles.input}
            />
            <Button size="sm" label="Ajouter" icon="add" onPress={addPhotoFromUrl} />
          </View>
        </Card>
      </View>

      {/* Offres, actus & événements */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Offres, actus & événements" />
        <Card>
          <Txt variant="muted">
            Publie ce que tu veux : promotions, infos du club, soirées, animations… Les événements s’affichent dans la section « Événements
            & tournois » de ta page.
          </Txt>
          <View style={[styles.wrap, { marginTop: spacing.md }]}>
            <Chip label="Offre" active={offerKind === 'offre'} onPress={() => setOfferKind('offre')} />
            <Chip label="Actu" active={offerKind === 'actu'} onPress={() => setOfferKind('actu')} />
            <Chip label="Événement" active={offerKind === 'evenement'} onPress={() => setOfferKind('evenement')} />
          </View>
          <TextInput
            value={offerTitle}
            onChangeText={setOfferTitle}
            placeholder={offerKind === 'evenement' ? 'Titre (ex. Soirée Americano vendredi 20h)' : 'Titre (ex. -20% le mardi)'}
            placeholderTextColor={colors.textMuted}
            maxLength={80}
            accessibilityLabel="Titre de l’offre, actu ou événement"
            style={styles.input}
          />
          <TextInput
            value={offerDetail}
            onChangeText={setOfferDetail}
            placeholder="Détail (optionnel)"
            placeholderTextColor={colors.textMuted}
            maxLength={200}
            accessibilityLabel="Détail de l’offre (optionnel)"
            style={styles.input}
          />
          <View style={{ marginTop: spacing.sm }}>
            <Button size="sm" label="Publier" icon="add" onPress={submitOffer} />
          </View>
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {offers.length === 0 ? (
              <Txt variant="small" color={colors.textFaint}>
                Aucune publication — les offres par défaut sont affichées aux joueurs.
              </Txt>
            ) : (
              offers.map((o) => (
                <View key={o.id} style={styles.listRow}>
                  <Tag
                    label={o.kind === 'actu' ? 'Actu' : o.kind === 'evenement' ? 'Événement' : 'Offre'}
                    tone={o.kind === 'actu' ? 'green' : o.kind === 'evenement' ? 'purple' : 'signature'}
                  />
                  <View style={{ flex: 1 }}>
                    <Txt variant="body" style={{ fontWeight: '600' }}>
                      {o.title}
                    </Txt>
                    {o.detail ? <Txt variant="muted">{o.detail}</Txt> : null}
                  </View>
                  <Pressable
                    onPress={() =>
                      void removeClubOffer(club.id, o.id).then((ok) => {
                        if (!ok) toast.show('Publication non retirée — vérifie ta connexion', { icon: 'alert-circle' });
                      })
                    }
                    hitSlop={13}
                    accessibilityRole="button"
                    accessibilityLabel={`Supprimer la publication ${o.title}`}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                </View>
              ))
            )}
          </View>
        </Card>
      </View>

      {/* Coachs RÉSERVABLES : un compte joueur promu coach reçoit son « Espace Coach » et les
          joueurs lui demandent un cours dans l’app (terrain réservé à son acceptation). */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Coachs réservables" />
        <Card>
          <Txt variant="muted">
            Le coach doit avoir l’application : il crée d’abord un compte PadelConnect normal, puis tu le déclares ici avec son numéro. Il
            choisit ensuite ses créneaux dans son Espace Coach, les joueurs réservent leurs cours dans l’app — et c’est TOI qui fixes le
            tarif de sa session (touche l’étiquette de prix sur sa ligne).
          </Txt>
          {!connected ? (
            <Txt variant="small" color={colors.amberDark} style={{ marginTop: spacing.sm }}>
              Connecte-toi pour déclarer tes coachs.
            </Txt>
          ) : (
            <>
              <TextInput
                value={promotePhone}
                onChangeText={setPromotePhone}
                placeholder="Numéro du coach (+225…)"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                maxLength={20}
                style={styles.input}
                accessibilityLabel="Numéro de téléphone du coach"
              />
              <TextInput
                value={promoteSpec}
                onChangeText={setPromoteSpec}
                placeholder="Spécialité (ex. Initiation, Compétition — optionnel)"
                placeholderTextColor={colors.textMuted}
                maxLength={60}
                style={styles.input}
                accessibilityLabel="Spécialité du coach"
              />
              <View style={{ marginTop: spacing.sm }}>
                <Button
                  size="sm"
                  label={promoting ? 'Vérification…' : 'Déclarer ce coach'}
                  icon="person-add"
                  onPress={() => void promoteCoach()}
                  disabled={promoting || promotePhone.trim().length < 8}
                />
              </View>
              <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                {bookableCoaches.length === 0 ? (
                  <Txt variant="small" color={colors.textFaint}>
                    Aucun coach réservable pour le moment.
                  </Txt>
                ) : (
                  bookableCoaches.map((c) => (
                    <View key={c.userId}>
                      <View style={styles.listRow}>
                        <IconCircle icon="school" color={colors.purple} bg={colors.purpleSoft} size={36} />
                        <View style={{ flex: 1 }}>
                          <Txt variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>
                            {c.name}
                          </Txt>
                          <Txt variant="muted" numberOfLines={1}>
                            {c.specialty || 'Coach'}
                            {c.slots.length ? ` · ${c.slots.length} créneau${c.slots.length > 1 ? 'x' : ''}` : ' · pas encore de créneau'}
                          </Txt>
                        </View>
                        {/* Tarif du cours (fixé par le club) : tap = édition inline. */}
                        <Pressable
                          onPress={() => {
                            setPriceEditing((cur) => (cur === c.userId ? null : c.userId));
                            setPriceDraft(c.price ? String(c.price) : '');
                          }}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={`Modifier le tarif du cours de ${c.name}`}
                        >
                          <Tag
                            label={c.price ? fcfa(c.price) : 'Fixer le tarif'}
                            tone={c.price ? 'green' : 'amber'}
                            icon="pricetag-outline"
                          />
                        </Pressable>
                        <Pressable
                          onPress={() => setConfirmDemoteId((cur) => (cur === c.userId ? null : c.userId))}
                          hitSlop={13}
                          accessibilityRole="button"
                          accessibilityLabel={`Retirer le coach ${c.name}`}
                        >
                          <Ionicons name="trash-outline" size={18} color={colors.danger} />
                        </Pressable>
                      </View>
                      {confirmDemoteId === c.userId ? (
                        // Confirmation légère, en place — pas de retrait au premier tap.
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs }}>
                          <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
                            Retirer {c.name} de tes coachs ?
                          </Txt>
                          <Button
                            size="sm"
                            label={demoting === c.userId ? '…' : 'Oui, retirer'}
                            variant="danger"
                            onPress={() => void demoteCoach(c)}
                            disabled={demoting === c.userId}
                          />
                          <Button size="sm" label="Non" variant="secondary" onPress={() => setConfirmDemoteId(null)} />
                        </View>
                      ) : null}
                      {priceEditing === c.userId ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs }}>
                          <TextInput
                            value={priceDraft}
                            onChangeText={setPriceDraft}
                            placeholder="Tarif d’une session de cours (FCFA) — vide = non affiché"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="numeric"
                            maxLength={7}
                            style={[styles.input, { marginTop: 0, flex: 1 }]}
                            accessibilityLabel={`Tarif d’une session de cours de ${c.name} en FCFA`}
                          />
                          <Button
                            size="sm"
                            label={savingPrice ? '…' : 'OK'}
                            onPress={() => void saveCoachPrice(c)}
                            disabled={savingPrice}
                          />
                        </View>
                      ) : null}
                    </View>
                  ))
                )}
              </View>
            </>
          )}
        </Card>
      </View>

      {/* Terrains (courts) — avec une photo par terrain (montrée sur la fiche du club) */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title={`Terrains · ${courts.length}`} />
        <Card>
          <Txt variant="muted">
            Ajoute ou retire les terrains de ton club, et mets une photo par terrain pour le montrer aux joueurs. La disponibilité se
            calcule terrain par terrain.
          </Txt>
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {courts.map((c) => (
              <View key={c} style={styles.listRow}>
                {courtPhotos[c] ? (
                  <View>
                    <ClubPhoto uri={courtPhotos[c]} accent={club.accent} height={40} width={54} rounded={radius.sm} />
                    {/* « × » sur la vignette = retirer la photo (même idiome que la galerie) */}
                    <Pressable
                      onPress={async () => {
                        const ok = await setClubCourtPhoto(club.id, c, null);
                        if (!ok) toast.show('Retrait impossible — réessaie', { icon: 'alert-circle' });
                      }}
                      style={styles.courtPhotoRemove}
                      hitSlop={13}
                      accessibilityRole="button"
                      accessibilityLabel={`Retirer la photo du ${c}`}
                    >
                      <Ionicons name="close" size={11} color={colors.white} />
                    </Pressable>
                  </View>
                ) : (
                  <IconCircle icon="tennisball" color={colors.green} bg={colors.greenSoft} size={36} />
                )}
                <Txt variant="body" style={{ flex: 1, fontWeight: '600' }}>
                  {c}
                </Txt>
                <Pressable
                  onPress={() => void changeCourtPhoto(c)}
                  hitSlop={8}
                  disabled={uploadingCourt !== null}
                  accessibilityRole="button"
                  accessibilityLabel={`${courtPhotos[c] ? 'Changer' : 'Ajouter'} la photo du ${c}`}
                >
                  <Ionicons name={uploadingCourt === c ? 'cloud-upload-outline' : 'camera-outline'} size={18} color={colors.signature} />
                </Pressable>
                {courts.length > 1 ? (
                  <Pressable onPress={() => removeCourt(c)} hitSlop={13} accessibilityRole="button" accessibilityLabel={`Retirer ${c}`}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
          <View style={styles.inlineRow}>
            <TextInput
              value={courtName}
              onChangeText={setCourtName}
              placeholder="Nom du terrain (ex. Terrain 4, Central…)"
              placeholderTextColor={colors.textMuted}
              maxLength={40}
              accessibilityLabel="Nom du terrain à ajouter"
              style={styles.input}
            />
            <Button size="sm" label="Ajouter" icon="add" onPress={addCourt} />
          </View>
        </Card>
      </View>

      {/* Disponibilités — le gérant choisit ses heures d’ouverture, l’app crée les créneaux —
          OU passe à l’éditeur par terrain pour mélanger des sessions de 1h et 1h30. */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Horaires d’ouverture" />
        <Card>
          {hasPerCourtGrid ? (
            <>
              <Txt variant="muted">
                Chaque terrain a SA grille : mélange librement des sessions de 1h et 1h30, sans chevauchement. Touche un créneau pour le
                fermer ou le rouvrir ; l’icône horloge (à droite du nom du terrain) passe un créneau de 1h à 1h30 et inversement ; l’icône «
                − » retire un créneau définitivement.
              </Txt>
              {courts.map((c) => (
                <CourtScheduleRow
                  key={c}
                  clubId={club.id}
                  court={c}
                  slots={perCourtGrid[c] ?? []}
                  reservations={state.reservations}
                  onSave={(next) => {
                    // Base = grille STOCKÉE (pas la grille résolue) : on ne fige jamais un repli
                    // d'affichage comme donnée réelle, et on purge les entrées de terrains retirés
                    // (une grille orpheline a déjà écrasé les réglages d'un club en production).
                    const base = state.courtSlots[club.id] ?? perCourtGrid;
                    const nextGrid: Record<string, CourtSlot[]> = {};
                    for (const k of courts) if (base[k]) nextGrid[k] = base[k];
                    nextGrid[c] = next;
                    return setCourtSlots(club.id, nextGrid);
                  }}
                />
              ))}
              <View style={styles.coverDivider} />
              <Txt variant="small" color={colors.textFaint}>
                Besoin de revenir à une grille simple (un seul horaire pour tous les terrains, sessions de 1h30) ? Ça efface la grille par
                terrain — tes horaires actuels servent de point de départ.
              </Txt>
              <View style={{ marginTop: spacing.sm, alignItems: 'flex-start' }}>
                <Button
                  size="sm"
                  variant="ghost"
                  label="Repasser aux horaires simples"
                  icon="swap-horizontal-outline"
                  onPress={() => {
                    void setCourtSlots(club.id, {}).then((ok) => {
                      if (!ok) toast.show('Action impossible — vérifie ta connexion', { icon: 'alert-circle' });
                      else toast.show('Horaires simples rétablis ✓');
                    });
                  }}
                />
              </View>
            </>
          ) : (
            <>
              <Txt variant="muted">
                Choisis ton heure d’ouverture et de fermeture : l’app crée automatiquement tes créneaux de 1h30. Tu peux ensuite fermer un
                créneau précis (pause déjeuner…) en le touchant, ou ajouter un horaire libre à la grille (l’app garde toujours des sessions
                de 1h30 sans chevauchement). Besoin de mélanger 1h et 1h30 selon le terrain ? Utilise l’outil « par terrain » plus bas.
              </Txt>
              <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                <TimeStepper
                  label="Ouverture"
                  value={openTime}
                  stepLabel="de 30 minutes"
                  canDec={openMin - OPEN_STEP >= MIN_OPEN}
                  canInc={openMin + OPEN_STEP + SESSION_MIN <= closeMin}
                  onDec={() => applyRange(minutesToSlot(openMin - OPEN_STEP), closeTime)}
                  onInc={() => applyRange(minutesToSlot(openMin + OPEN_STEP), closeTime)}
                />
                {/* La fermeture avance par SESSION entière (1h30) : c'est le seul pas qui ajoute ou
                    retire réellement un créneau — un pas de 30 min ne changerait souvent rien. */}
                <TimeStepper
                  label="Fermeture"
                  value={closeTime}
                  stepLabel="d’une session (1h30)"
                  canDec={closeMin - SESSION_MIN - SESSION_MIN >= openMin}
                  canInc={closeMin + SESSION_MIN <= MAX_CLOSE}
                  onDec={() => applyRange(openTime, minutesToSlot(closeMin - SESSION_MIN))}
                  onInc={() => applyRange(openTime, minutesToSlot(closeMin + SESSION_MIN))}
                />
              </View>
              <Txt variant="label" style={{ marginTop: spacing.md }}>
                {removingSlot ? 'TES CRÉNEAUX — TOUCHE POUR RETIRER DÉFINITIVEMENT' : 'TES CRÉNEAUX — TOUCHE POUR FERMER / ROUVRIR'}
              </Txt>
              <View style={styles.wrap}>
                {/* Pas de `disabled` global pendant l'écriture (la garde savingGrid des handlers
                    suffit) : tout griser faisait croire à des créneaux fermés. L'icône ✕ passe par
                    la prop icon (couleur gérée par Chip), et le lecteur d'écran entend l'action
                    RÉELLE (« retirer définitivement ») ou l'état réel du créneau. */}
                {grid.map((t) => (
                  <Chip
                    key={t}
                    label={t}
                    icon={removingSlot ? 'close' : undefined}
                    active={openSlots.includes(t)}
                    accessibilityLabel={
                      removingSlot ? `Retirer définitivement l’horaire ${t}` : `Créneau ${t}, ${openSlots.includes(t) ? 'ouvert' : 'fermé'}`
                    }
                    onPress={() => (removingSlot ? void removeFreeSlot(t) : void toggleSlot(t))}
                  />
                ))}
              </View>
              {removingSlot ? (
                <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
                  Touche un horaire pour le retirer définitivement de la grille — pour une simple pause, ferme-le plutôt.
                </Txt>
              ) : (
                <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
                  Les créneaux verts sont réservables par les joueurs ; les gris sont fermés.
                </Txt>
              )}

              {/* Grille libre : ajouter un horaire précis, ou basculer en mode retrait définitif. */}
              <View style={{ marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <TimeStepper
                    label="Ajouter un horaire"
                    value={draftSlot}
                    stepLabel="de 30 minutes"
                    canDec={(slotToMinutes(draftSlot) ?? closeMin) - OPEN_STEP >= MIN_OPEN}
                    canInc={(slotToMinutes(draftSlot) ?? closeMin) + OPEN_STEP <= FREE_ADD_MAX}
                    onDec={() => setDraftSlot(minutesToSlot((slotToMinutes(draftSlot) ?? closeMin) - OPEN_STEP))}
                    onInc={() => setDraftSlot(minutesToSlot((slotToMinutes(draftSlot) ?? closeMin) + OPEN_STEP))}
                  />
                </View>
                <Button size="sm" label="Ajouter" icon="add" onPress={() => void addFreeSlot()} disabled={savingGrid} />
              </View>
              <View style={{ marginTop: spacing.sm, alignItems: 'flex-start' }}>
                <Button
                  size="sm"
                  variant="ghost"
                  label={removingSlot ? 'Terminé' : 'Retirer un horaire'}
                  icon={removingSlot ? 'checkmark' : 'remove-circle-outline'}
                  onPress={() => {
                    const next = !removingSlot;
                    setRemovingSlot(next);
                    // Le changement de mode est invisible à l'écoute (mêmes chips) : on l'annonce,
                    // même canal que Toast.
                    AccessibilityInfo.announceForAccessibility(
                      next
                        ? 'Mode retrait : touche un horaire pour le retirer définitivement'
                        : 'Mode normal : touche un créneau pour le fermer ou le rouvrir',
                    );
                  }}
                />
              </View>

              {openSlots.length > 0 ? (
                <>
                  <View style={styles.coverDivider} />
                  <Txt variant="label">HORAIRES PAR TERRAIN</Txt>
                  <Txt variant="muted" style={{ marginTop: 2 }}>
                    Ferme un horaire sur UN terrain seulement — ex. Terrain 1 indisponible tous les jours à 18:00 (entretien, usage privé…).
                    Il n’est alors plus réservable par personne, cours compris ; les autres terrains restent ouverts.
                  </Txt>
                  <View style={{ marginTop: spacing.sm, alignItems: 'flex-start' }}>
                    <Button
                      size="sm"
                      variant="ghost"
                      label={showCourtHours ? 'Masquer' : 'Régler par terrain'}
                      icon={showCourtHours ? 'chevron-up' : 'options-outline'}
                      onPress={() => setShowCourtHours((v) => !v)}
                    />
                  </View>
                  {showCourtHours ? (
                    <View style={{ marginTop: spacing.sm, gap: spacing.md }}>
                      {courts.map((c) => {
                        const closedTimes = state.clubCourtClosed[club.id]?.[c] ?? [];
                        return (
                          <View key={c}>
                            <Txt variant="body" style={{ fontWeight: '600' }}>
                              {c}
                            </Txt>
                            {/* Pas de `disabled` global pendant l'écriture (garde savingCourtHours
                                dans le handler) : tout griser = la couleur « fermé », illisible.
                                Le lecteur d'écran entend le TERRAIN + l'heure + l'état. */}
                            <View style={styles.wrap}>
                              {openSlots.map((t) => (
                                <Chip
                                  key={t}
                                  label={t}
                                  active={!closedTimes.includes(t)}
                                  accessibilityLabel={`${c}, ${t}, ${closedTimes.includes(t) ? 'fermé sur ce terrain' : 'ouvert'}`}
                                  onPress={() => void toggleCourtSlot(c, t)}
                                />
                              ))}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </>
              ) : null}

              <View style={styles.coverDivider} />
              <Txt variant="small" color={colors.textFaint}>
                Tu veux proposer des sessions de 1h EN PLUS du 1h30, ou des horaires différents selon le terrain ? Passe à l’éditeur par
                terrain.
              </Txt>
              <View style={{ marginTop: spacing.sm, alignItems: 'flex-start' }}>
                <Button
                  size="sm"
                  variant="secondary"
                  label="Passer aux horaires par terrain (1h/1h30)"
                  icon="grid-outline"
                  onPress={() => {
                    void setCourtSlots(club.id, perCourtGrid).then((ok) => {
                      if (!ok) toast.show('Action impossible — vérifie ta connexion', { icon: 'alert-circle' });
                    });
                  }}
                />
              </View>
            </>
          )}
        </Card>
      </View>

      <Card style={{ marginTop: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconCircle icon="cash" color={colors.amberDark} bg={colors.amberSoft} size={40} />
        <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
          Tarif affiché aux joueurs :{' '}
          <Txt variant="small" style={{ fontWeight: '700' }}>
            dès {fcfa(minPrice(club, offeredDurations(perCourtGrid, courts)))} la session
            {(() => {
              const offered = offeredDurations(perCourtGrid, courts);
              return offered.size === 1 ? ` (${durationLabel([...offered][0])})` : '';
            })()}
          </Txt>{' '}
          — le règlement se fait directement au club.
        </Txt>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  storageWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  removeBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: {
    width: 120,
    height: 90,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnOff: { opacity: 0.4 },
  stepValue: { minWidth: 64, textAlign: 'center' },
  coverRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  coverDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  courtPhotoRemove: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 17,
    height: 17,
    borderRadius: radius.pill,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    marginTop: spacing.sm,
    flex: 1,
  },
});
