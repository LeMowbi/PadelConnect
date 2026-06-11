import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { ClubPhoto } from '@/components/ClubPhoto';
import { Screen } from '@/components/Screen';
import { BottomSheet } from '@/components/BottomSheet';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Button, Card, Divider, EmptyState, IconCircle, SectionHeader, Tag, Txt } from '@/components/ui';
import { SAMPLE_SLOTS, clubsByName, defaultCourts, findClub, manageableClubs, type Club } from '@/data/clubs';
import { coaches as allCoaches } from '@/data/coaches';
import { demoTeams, seedCompetitions, teamCount, type Competition } from '@/data/competitions';
import { hasCompetition } from '@/lib/availability';
import { dayKey, nextDays, slotTimestamp, weekKeyOf, weekLabel } from '@/lib/days';
import { isPlayed, useApp, type ClubInfo } from '@/store/AppContext';
import { openWhatsApp } from '@/lib/contact';
import { fcfa, initials } from '@/lib/format';
import { pickImage } from '@/lib/pickImage';
import { colors, radius, spacing } from '@/theme';

// Sessions de 1h30 — la grille complète que le club peut ouvrir/fermer.
const ALL_TIMES = [
  '06:00', '07:30', '09:00', '10:30', '12:00', '13:30',
  '15:00', '16:30', '18:00', '19:30', '21:00', '22:30',
];

const SECTIONS = ['Réservations', 'Mon club', 'Tournois'] as const;
// Motifs de blocage d'un créneau hors app.
const BLOCK_REASONS = ['Résa téléphone/WhatsApp', 'Entretien', 'Privatisé', 'Autre'];
const CLUB_TYPES: Club['type'][] = ['Couvert', 'Extérieur', 'Mixte'];

export default function ClubAdmin() {
  const router = useRouter();
  const {
    state,
    setClubMode,
    setManagedClub,
    setClubSlots,
    setClubCourts,
    addClubPhoto,
    removeClubPhoto,
    addClubOffer,
    removeClubOffer,
    addClubCoach,
    removeClubCoach,
    confirmReservationByClub,
    requestClub,
    closeCompetition,
    setClubInfo,
    toggleHideCoach,
    unlockClub,
    blockSlot,
    unblockSlot,
  } = useApp();

  const [section, setSection] = useState<(typeof SECTIONS)[number]>('Réservations');
  const [closingId, setClosingId] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ dateKey: string; time: string; label: string; value: number } | null>(null);
  const [blockingCourt, setBlockingCourt] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [offerKind, setOfferKind] = useState<'offre' | 'actu' | 'evenement'>('offre');
  const [offerTitle, setOfferTitle] = useState('');
  const [offerDetail, setOfferDetail] = useState('');
  const [coachName, setCoachName] = useState('');
  const [coachSpec, setCoachSpec] = useState('');
  const [coachPhone, setCoachPhone] = useState('');
  const [courtName, setCourtName] = useState('');

  // Inscription d'un nouveau club (validée ensuite par l'opérateur PadelConnect).
  const [showSignup, setShowSignup] = useState(false);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [ncName, setNcName] = useState('');
  const [ncArea, setNcArea] = useState('');
  const [ncType, setNcType] = useState<Club['type']>('Extérieur');
  const [ncCourts, setNcCourts] = useState(2);
  const [ncPrice, setNcPrice] = useState('');
  const [ncPhone, setNcPhone] = useState('');

  const manageable = manageableClubs(state.customClubs, state.clubInfo);
  const club = findClub(state.managedClubId, state.customClubs, state.clubInfo) ?? clubsByName[0];
  const pendingOwn = state.customClubs.find((c) => c.id === club.id)?.status === 'pending';
  // Espace verrouillé par un code à 4 chiffres tant que ce club n'a pas été déverrouillé ici.
  const locked = !state.unlockedClubIds.includes(club.id);

  const openSlots = state.clubSlots[club.id] ?? SAMPLE_SLOTS;
  const toggleSlot = (t: string) => {
    const set = new Set(openSlots);
    if (set.has(t)) set.delete(t);
    else set.add(t);
    setClubSlots(club.id, [...set]);
  };
  const courts = state.clubCourts[club.id] ?? defaultCourts(club);
  const addCourt = () => {
    const n = courtName.trim();
    if (n.length < 1 || courts.includes(n)) return;
    setClubCourts(club.id, [...courts, n]);
    setCourtName('');
  };
  const removeCourt = (n: string) => {
    if (courts.length <= 1) return; // garder au moins un terrain
    setClubCourts(club.id, courts.filter((c) => c !== n));
  };
  const photos = state.clubPhotos[club.id] ?? [];
  const offers = state.clubOffers[club.id] ?? [];
  const coaches = state.clubCoaches[club.id] ?? [];
  const seedClubCoaches = allCoaches.filter((c) => c.clubId === club.id);
  const boosted = state.boostedClubIds.includes(club.id);
  const shareBoost = () =>
    Share.share({ message: `Bonjour PadelConnect, je souhaite booster le profil de ${club.name} (paiement par Wave).` }).catch(() => {});

  // Réservations du club : à venir (à confirmer) et historique (déjà jouées).
  const now = Date.now();
  const clubRes = state.reservations.filter((r) => r.clubId === club.id);
  // « Jouée » = heure de fin passée (la même règle que côté joueur — base de la commission).
  const upcomingRes = clubRes.filter((r) => !isPlayed(r, now)).sort((a, b) => a.startsAt - b.startsAt);
  const pastRes = clubRes.filter((r) => isPlayed(r, now)).sort((a, b) => b.startsAt - a.startsAt);
  // Historique regroupé PAR SEMAINE (le décompte de la commission est hebdomadaire).
  const pastByWeek: { week: string; items: typeof pastRes }[] = [];
  for (const r of pastRes) {
    const wk = weekKeyOf(r.startsAt);
    const g = pastByWeek.find((x) => x.week === wk);
    if (g) g.items.push(r);
    else pastByWeek.push({ week: wk, items: [r] });
  }
  // Blocages hors app de ce club.
  const clubBlocked = state.blockedSlots.filter((b) => b.clubId === club.id);

  const comps = [
    ...state.myCompetitions.filter((c) => c.clubId === club.id),
    ...seedCompetitions.filter((c) => c.clubId === club.id),
  ];

  const todayKey = dayKey(new Date());
  const closingComp = comps.find((c) => c.id === closingId);

  // Planning de la semaine : jours × créneaux ouverts, colorés selon l'occupation.
  const week = nextDays(7);
  const planTimes = [...openSlots].sort();
  const cellInfo = (dKey: string, time: string) => {
    const booked = clubRes.filter((r) => r.dateKey === dKey && r.time === time).length;
    const blocked = clubBlocked.filter((b) => b.dateKey === dKey && b.time === time).length;
    const occupied = booked + blocked;
    const kind: 'tournoi' | 'complet' | 'horsapp' | 'partiel' | 'libre' = hasCompetition(club.id, dKey, comps)
      ? 'tournoi'
      : occupied === 0
        ? 'libre'
        : occupied >= courts.length
          ? 'complet'
          : booked === 0
            ? 'horsapp'
            : 'partiel';
    return { booked, blocked, occupied, kind };
  };

  // Mini-stats de la semaine : taux d'occupation + créneau le plus demandé.
  const weekKeys = new Set(week.map((d) => d.key));
  const weekRes = clubRes.filter((r) => weekKeys.has(r.dateKey));
  const capacity = Math.max(1, planTimes.length * courts.length * 7);
  const occupancy = Math.round((weekRes.length / capacity) * 100);
  const byHour = new Map<string, number>();
  for (const r of weekRes) byHour.set(r.time, (byHour.get(r.time) ?? 0) + 1);
  const topHour = [...byHour.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

  // Détail d'une case du planning (réservations du créneau sélectionné).
  const cellRes = selectedCell
    ? clubRes.filter((r) => r.dateKey === selectedCell.dateKey && r.time === selectedCell.time).sort((a, b) => a.court.localeCompare(b.court))
    : [];

  const addPhotoFromDevice = async () => {
    const uri = await pickImage();
    if (uri) addClubPhoto(club.id, uri);
  };
  const addPhotoFromUrl = () => {
    if (/^https?:\/\//.test(url.trim())) {
      addClubPhoto(club.id, url.trim());
      setUrl('');
    }
  };
  const submitOffer = () => {
    if (offerTitle.trim().length < 2) return;
    addClubOffer(club.id, offerKind, offerTitle, offerDetail);
    setOfferTitle('');
    setOfferDetail('');
  };
  const submitCoach = () => {
    if (coachName.trim().length < 2) return;
    addClubCoach(club.id, coachName, coachSpec, coachPhone);
    setCoachName('');
    setCoachSpec('');
    setCoachPhone('');
  };

  const signupReady = ncName.trim().length >= 2 && ncArea.trim().length >= 2 && Number(ncPrice) > 0;
  const submitSignup = () => {
    if (!signupReady) return;
    requestClub({ name: ncName, area: ncArea, type: ncType, courts: ncCourts, priceFrom: Number(ncPrice), contactPhone: ncPhone });
    setShowSignup(false);
    setNcName('');
    setNcArea('');
    setNcPrice('');
    setNcPhone('');
  };

  const header = (
    <>
      <View style={styles.note}>
        <Ionicons name="information-circle-outline" size={15} color={colors.textFaint} />
        <Txt variant="small" color={colors.textFaint} style={{ flex: 1 }}>
          Démo de l’interface gérant. En production, l’accès serait réservé au club connecté.
        </Txt>
      </View>

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconCircle icon="business" />
        <View style={{ flex: 1 }}>
          <Txt variant="h3">Compte club (démo)</Txt>
          <Txt variant="muted">Active le mode gérant pour gérer ton club.</Txt>
        </View>
        <Switch value={state.clubMode} onValueChange={setClubMode} trackColor={{ true: colors.gold, false: colors.border }} thumbColor={colors.white} />
      </Card>
    </>
  );

  // Espace verrouillé tant que le mode gérant n'est pas activé.
  if (!state.clubMode) {
    return (
      <Screen back title="Espace Club" subtitle="Gérez votre club">
        {header}
        <Card style={{ marginTop: spacing.md, alignItems: 'center', paddingVertical: spacing.xl }}>
          <Ionicons name="lock-closed-outline" size={28} color={colors.textFaint} />
          <Txt variant="h3" style={{ marginTop: spacing.sm }}>
            Espace réservé au gérant
          </Txt>
          <Txt variant="muted" style={{ marginTop: 4, textAlign: 'center' }}>
            Active le mode gérant ci-dessus pour recevoir tes réservations et gérer photos, offres, coachs, terrains, créneaux et tournois.
          </Txt>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen back title="Espace Club" subtitle="Gérez votre club">
      {header}

      {/* Club géré */}
      <View style={{ marginTop: spacing.lg }}>
        <SectionHeader title="Club géré" />
        <View style={styles.wrap}>
          {manageable.map((c) => {
            const isPending = state.customClubs.find((x) => x.id === c.id)?.status === 'pending';
            return (
              <Chip
                key={c.id}
                label={isPending ? `${c.name} · en attente` : c.name}
                active={c.id === club.id}
                onPress={() => setManagedClub(c.id)}
              />
            );
          })}
        </View>

        {/* Inscription d'un nouveau club — validée par PadelConnect */}
        <Pressable onPress={() => setShowSignup((v) => !v)} style={styles.signupLink}>
          <Ionicons name={showSignup ? 'chevron-down' : 'add-circle-outline'} size={16} color={colors.blue} />
          <Txt variant="small" color={colors.blue} style={{ fontWeight: '700' }}>
            Ton club n'est pas dans la liste ? Inscris-le
          </Txt>
        </Pressable>
        <Pressable onPress={() => router.push('/pourquoi')} style={styles.signupLink}>
          <Ionicons name="sparkles-outline" size={15} color={colors.textMuted} />
          <Txt variant="small" color={colors.textMuted} style={{ fontWeight: '600' }}>
            Pourquoi rejoindre PadelConnect ?
          </Txt>
        </Pressable>

        {showSignup ? (
          <Card style={{ marginTop: spacing.sm, borderColor: colors.blue }}>
            <Txt variant="h3">Inscrire mon club</Txt>
            <Txt variant="small" color={colors.textMuted} style={{ marginTop: 2 }}>
              Ta demande passe par PadelConnect : tu prépares ta page tout de suite, elle devient visible des joueurs dès l'activation.
            </Txt>
            <TextInput value={ncName} onChangeText={setNcName} placeholder="Nom du club" placeholderTextColor={colors.textFaint} style={styles.input} />
            <TextInput value={ncArea} onChangeText={setNcArea} placeholder="Quartier / commune (ex. Cocody)" placeholderTextColor={colors.textFaint} style={styles.input} />
            <View style={[styles.wrap, { marginTop: spacing.md }]}>
              {CLUB_TYPES.map((t) => (
                <Chip key={t} label={t} active={ncType === t} onPress={() => setNcType(t)} />
              ))}
            </View>
            <View style={[styles.wrap, { marginTop: spacing.md }]}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Chip key={n} label={`${n} terrain${n > 1 ? 's' : ''}`} active={ncCourts === n} onPress={() => setNcCourts(n)} />
              ))}
            </View>
            <TextInput
              value={ncPrice}
              onChangeText={setNcPrice}
              placeholder="Tarif de la session 1h30 (FCFA, ex. 15000)"
              placeholderTextColor={colors.textFaint}
              keyboardType="numeric"
              style={styles.input}
            />
            <TextInput value={ncPhone} onChangeText={setNcPhone} placeholder="Téléphone du club (optionnel)" placeholderTextColor={colors.textFaint} keyboardType="phone-pad" style={styles.input} />
            <View style={{ marginTop: spacing.md }}>
              <Button label="Envoyer la demande à PadelConnect" icon="paper-plane" onPress={submitSignup} disabled={!signupReady} full />
            </View>
          </Card>
        ) : null}

        {pendingOwn ? (
          <View style={styles.pendingBanner}>
            <Ionicons name="hourglass-outline" size={16} color={colors.blue} />
            <Txt variant="small" color={colors.text} style={{ flex: 1 }}>
              {club.name} est <Txt variant="small" style={{ fontWeight: '700' }}>en attente d'activation</Txt> par PadelConnect.
              Prépare ta page (photos, terrains, créneaux) : les joueurs la verront dès l'activation.
            </Txt>
          </View>
        ) : null}
      </View>

      {locked ? (
        <CodeGate club={club} onUnlock={(code) => unlockClub(club.id, code)} />
      ) : (
        <SegmentedControl options={SECTIONS} value={section} onChange={setSection} />
      )}

      {!locked && section === 'Réservations' ? (
        <>
          {/* Vue d'ensemble */}
          <View style={styles.stats}>
            <StatTile value={upcomingRes.length} label="À venir" color={colors.gold} bg={colors.goldSoft} />
            <StatTile value={pastRes.length} label="Jouées" color={colors.blue} bg={colors.blueSoft} />
            <StatTile value={clubRes.length} label="Total" color={colors.green} bg={colors.greenSoft} />
          </View>

          {/* Bloquer un créneau réservé hors app (téléphone, WhatsApp, sur place) */}
          <View style={{ marginTop: spacing.md }}>
            <Button
              size="sm"
              label={showBlockForm ? 'Fermer' : '+ Bloquer un créneau (résa hors app)'}
              icon={showBlockForm ? 'chevron-up' : 'lock-closed'}
              variant="secondary"
              onPress={() => setShowBlockForm((v) => !v)}
              full
            />
          </View>
          {showBlockForm ? (
            <QuickBlock
              days={week}
              times={openSlots}
              courts={courts}
              dayHasTournament={(dKey) => hasCompetition(club.id, dKey, comps)}
              courtStatus={(dKey, time, court) => {
                const resa = clubRes.find((r) => r.dateKey === dKey && r.time === time && r.court === court);
                if (resa) return { state: 'reserved', label: resa.bookedBy?.name ?? 'Joueur' };
                const blk = clubBlocked.find((b) => b.dateKey === dKey && b.time === time && b.court === court);
                if (blk) return { state: 'blocked', label: blk.reason };
                return { state: 'free' };
              }}
              onBlock={(dKey, time, court, reason, ts) => blockSlot({ clubId: club.id, dateKey: dKey, time, court, reason }, ts)}
              onUnblock={(dKey, time, court) => unblockSlot(club.id, dKey, time, court)}
            />
          ) : null}

          {/* Planning de la semaine */}
          <View style={{ marginTop: spacing.xl }}>
            <SectionHeader title="Planning de la semaine" />
            <Card>
              {/* En-tête : jours */}
              <View style={styles.planRow}>
                <View style={styles.planTime} />
                {week.map((d) => {
                  const dd = new Date(d.value);
                  return (
                    <View key={d.key} style={styles.planHead}>
                      <Txt variant="label" color={colors.textFaint} style={{ fontSize: 9 }}>
                        {['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'][dd.getDay()]}
                      </Txt>
                      <Txt variant="small" color={colors.text} style={{ fontWeight: '700' }}>
                        {dd.getDate()}
                      </Txt>
                    </View>
                  );
                })}
              </View>
              {planTimes.map((t) => (
                <View key={t} style={styles.planRow}>
                  <View style={styles.planTime}>
                    <Txt variant="small" color={colors.textMuted} style={{ fontSize: 11 }}>
                      {t}
                    </Txt>
                  </View>
                  {week.map((d) => {
                    const info = cellInfo(d.key, t);
                    const bg =
                      info.kind === 'tournoi'
                        ? colors.purple
                        : info.kind === 'complet'
                          ? colors.gold
                          : info.kind === 'horsapp'
                            ? colors.coralSoft
                            : info.kind === 'partiel'
                              ? colors.goldSoft
                              : colors.surfaceAlt;
                    const sel = selectedCell?.dateKey === d.key && selectedCell?.time === t;
                    return (
                      <Pressable
                        key={d.key}
                        onPress={() => setSelectedCell({ dateKey: d.key, time: t, label: `${d.label} · ${t}`, value: d.value })}
                        style={[styles.planCell, { backgroundColor: bg }, sel && styles.planCellSel]}
                      >
                        {info.kind === 'partiel' ? (
                          <Txt variant="small" color={colors.gold} style={{ fontSize: 10, fontWeight: '800' }}>
                            {info.occupied}/{courts.length}
                          </Txt>
                        ) : null}
                        {info.kind === 'complet' ? <Ionicons name="checkmark" size={11} color={colors.onGold} /> : null}
                        {info.kind === 'horsapp' ? <Ionicons name="lock-closed" size={10} color={colors.coral} /> : null}
                        {info.kind === 'tournoi' ? <Ionicons name="trophy" size={10} color={colors.white} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
              <View style={styles.planLegend}>
                <LegendDot color={colors.surfaceAlt} label="Libre" />
                <LegendDot color={colors.goldSoft} label="Partiel" />
                <LegendDot color={colors.gold} label="Complet" />
                <LegendDot color={colors.coralSoft} label="Hors app" />
                <LegendDot color={colors.purple} label="Tournoi" />
              </View>
            </Card>

            {/* Mini-stats de la semaine */}
            <View style={[styles.stats, { marginTop: spacing.md }]}>
              <StatTile value={`${occupancy}%`} label="Occupation (7 j)" color={colors.green} bg={colors.greenSoft} />
              <StatTile value={weekRes.length} label="Résas (7 j)" color={colors.blue} bg={colors.blueSoft} />
              <StatTile value={topHour} label="Heure phare" color={colors.purple} bg={colors.purpleSoft} />
            </View>
          </View>

          {/* À venir — à confirmer */}
          <View style={{ marginTop: spacing.xl }}>
            <SectionHeader title={`Réservations à venir · ${upcomingRes.length}`} />
            {upcomingRes.length === 0 ? (
              <Card>
                <Txt variant="muted">
                  Aucune réservation à venir pour {club.name}. Dès qu'un joueur réserve, elle apparaît ici avec son nom et son numéro.
                </Txt>
              </Card>
            ) : (
              upcomingRes.map((r) => (
                <Card key={r.id} style={{ marginBottom: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    <IconCircle icon="time" color={colors.gold} bg={colors.goldSoft} size={40} />
                    <View style={{ flex: 1 }}>
                      <Txt variant="h3" style={{ fontSize: 15 }}>
                        {r.date} · {r.time}
                      </Txt>
                      <Txt variant="muted">{r.court} · {r.players} joueurs</Txt>
                      {r.bookedBy ? (
                        <Txt variant="small" color={colors.textMuted}>
                          Réservé par {r.bookedBy.name}{r.bookedBy.phone ? ` · ${r.bookedBy.phone}` : ''}
                        </Txt>
                      ) : null}
                    </View>
                    {r.clubConfirmed ? <Tag label="Confirmée ✓" tone="green" /> : <Tag label="À confirmer" tone="coral" />}
                  </View>
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <Button
                        size="sm"
                        label={r.clubConfirmed ? 'Annuler la confirmation' : 'Confirmer la réservation'}
                        icon={r.clubConfirmed ? 'close' : 'checkmark'}
                        variant={r.clubConfirmed ? 'ghost' : 'primary'}
                        onPress={() => confirmReservationByClub(r.id)}
                        full
                      />
                    </View>
                    {r.bookedBy?.phone ? (
                      <Button
                        size="sm"
                        label="WhatsApp"
                        icon="logo-whatsapp"
                        variant="secondary"
                        onPress={() =>
                          openWhatsApp(
                            r.bookedBy!.phone,
                            `Bonjour ${r.bookedBy!.name}, votre réservation du ${r.date} à ${r.time} (${r.court}) à ${club.name} est bien confirmée ✅`
                          )
                        }
                      />
                    ) : null}
                  </View>
                </Card>
              ))
            )}
          </View>

          {/* Historique du club — regroupé par semaine, base de la commission PadelConnect */}
          <View style={{ marginTop: spacing.xl }}>
            <SectionHeader title={`Historique · ${pastRes.length}`} />
            {pastRes.length === 0 ? (
              <Card>
                <Txt variant="muted">Les réservations déjà jouées s'afficheront ici, semaine par semaine.</Txt>
              </Card>
            ) : (
              pastByWeek.map((g) => (
                <Card key={g.week} style={{ marginBottom: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                    <Txt variant="label" color={colors.textFaint}>
                      Semaine {weekLabel(g.week)}
                    </Txt>
                    <Tag label={`${g.items.length} jouée${g.items.length > 1 ? 's' : ''}`} tone="blue" />
                  </View>
                  {g.items.map((r, i) => (
                    <View key={r.id}>
                      {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                        <View style={{ flex: 1 }}>
                          <Txt variant="body" style={{ fontWeight: '600' }}>
                            {r.date} · {r.time} · {r.court}
                          </Txt>
                          {r.bookedBy ? (
                            <Txt variant="small" color={colors.textFaint}>
                              {r.bookedBy.name}
                            </Txt>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  ))}
                </Card>
              ))
            )}
            <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
              La commission PadelConnect se calcule sur cet historique — décompte transmis chaque fin de
              semaine, règlement par Wave.
            </Txt>
          </View>
        </>
      ) : null}

      {!locked && section === 'Mon club' ? (
        <>
          {/* Infos du club — éditables par le gérant */}
          <SectionHeader title="Infos du club" />
          <ClubInfoCard key={club.id} club={club} onSave={(patch) => setClubInfo(club.id, patch)} />

          {/* Booster le profil */}
          <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title="Booster mon profil" />
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <IconCircle icon="megaphone" color={colors.coral} bg={colors.coralSoft} />
              <View style={{ flex: 1 }}>
                <Txt variant="h3">Mettre {club.name} en avant</Txt>
                <Txt variant="muted">Apparais en tête de liste avec un badge « Sponsorisé ». Paiement par Wave auprès de PadelConnect, qui active le boost.</Txt>
              </View>
              {boosted ? <Tag label="Actif" tone="amber" icon="megaphone" /> : null}
            </View>
            <View style={{ marginTop: spacing.md }}>
              <Button size="sm" label="Contacter PadelConnect" icon="paper-plane" onPress={shareBoost} full />
            </View>
          </Card>
          </View>

          {/* Photos du terrain */}
          <View style={{ marginTop: spacing.xl }}>
            <SectionHeader title="Photos du terrain" />
            <Card>
              <Txt variant="muted">Ajoute les vraies photos de ton club (visibles par les joueurs).</Txt>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginTop: spacing.md }}>
                {photos.map((uri) => (
                  <View key={uri}>
                    <ClubPhoto uri={uri} accent={club.accent} initials={initials(club.name)} height={90} width={120} rounded={radius.md} />
                    <Pressable onPress={() => removeClubPhoto(club.id, uri)} style={styles.removeBadge} hitSlop={6}>
                      <Ionicons name="close" size={14} color={colors.white} />
                    </Pressable>
                  </View>
                ))}
                <Pressable onPress={addPhotoFromDevice} style={styles.addTile}>
                  <Ionicons name="camera-outline" size={22} color={colors.gold} />
                  <Txt variant="small" color={colors.gold} style={{ marginTop: 4 }}>
                    Ajouter
                  </Txt>
                </Pressable>
              </ScrollView>
              <View style={styles.inlineRow}>
                <TextInput value={url} onChangeText={setUrl} placeholder="…ou coller un lien d'image (https://)" placeholderTextColor={colors.textFaint} autoCapitalize="none" style={styles.input} />
                <Button size="sm" label="Ajouter" icon="add" onPress={addPhotoFromUrl} />
              </View>
            </Card>
          </View>

          {/* Offres, actus & événements */}
          <View style={{ marginTop: spacing.xl }}>
            <SectionHeader title="Offres, actus & événements" />
            <Card>
              <Txt variant="muted">
                Publie ce que tu veux : promotions, infos du club, soirées, animations… Les événements
                s'affichent dans la section « Événements & tournois » de ta page.
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
                placeholderTextColor={colors.textFaint}
                style={styles.input}
              />
              <TextInput value={offerDetail} onChangeText={setOfferDetail} placeholder="Détail (optionnel)" placeholderTextColor={colors.textFaint} style={styles.input} />
              <View style={{ marginTop: spacing.sm }}>
                <Button size="sm" label="Publier" icon="add" onPress={submitOffer} />
              </View>
              <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                {offers.length === 0 ? (
                  <Txt variant="small" color={colors.textFaint}>Aucune publication — les offres par défaut sont affichées aux joueurs.</Txt>
                ) : (
                  offers.map((o) => (
                    <View key={o.id} style={styles.listRow}>
                      <Tag
                        label={o.kind === 'actu' ? 'Actu' : o.kind === 'evenement' ? 'Événement' : 'Offre'}
                        tone={o.kind === 'actu' ? 'green' : o.kind === 'evenement' ? 'purple' : 'gold'}
                      />
                      <View style={{ flex: 1 }}>
                        <Txt variant="body" style={{ fontWeight: '600' }}>{o.title}</Txt>
                        {o.detail ? <Txt variant="muted">{o.detail}</Txt> : null}
                      </View>
                      <Pressable onPress={() => removeClubOffer(club.id, o.id)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={18} color={colors.danger} />
                      </Pressable>
                    </View>
                  ))
                )}
              </View>
            </Card>
          </View>

          {/* Coachs du club */}
          <View style={{ marginTop: spacing.xl }}>
            <SectionHeader title="Coachs du club" />
            <Card>
              <Txt variant="muted">Ajoute les coachs de ton club.</Txt>
              <TextInput value={coachName} onChangeText={setCoachName} placeholder="Nom du coach" placeholderTextColor={colors.textFaint} style={styles.input} />
              <TextInput value={coachSpec} onChangeText={setCoachSpec} placeholder="Spécialité (ex. Initiation, Compétition)" placeholderTextColor={colors.textFaint} style={styles.input} />
              <TextInput value={coachPhone} onChangeText={setCoachPhone} placeholder="Téléphone (+225…)" placeholderTextColor={colors.textFaint} keyboardType="phone-pad" style={styles.input} />
              <View style={{ marginTop: spacing.sm }}>
                <Button size="sm" label="Ajouter le coach" icon="add" onPress={submitCoach} />
              </View>
              <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                {coaches.map((c) => (
                  <View key={c.id} style={styles.listRow}>
                    <IconCircle icon="person" color={colors.blue} bg={colors.blueSoft} size={36} />
                    <View style={{ flex: 1 }}>
                      <Txt variant="body" style={{ fontWeight: '600' }}>{c.name}</Txt>
                      <Txt variant="muted">{c.specialty}{c.phone ? ` · ${c.phone}` : ''}</Txt>
                    </View>
                    <Pressable onPress={() => removeClubCoach(club.id, c.id)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </Pressable>
                  </View>
                ))}
                {/* Coachs déjà listés pour ce club (profils de démo) : retirables / réaffichables. */}
                {seedClubCoaches.map((c) => {
                  const hidden = state.hiddenCoachIds.includes(c.id);
                  return (
                    <View key={c.id} style={styles.listRow}>
                      <IconCircle icon="person" color={hidden ? colors.textFaint : colors.blue} bg={hidden ? colors.surfaceAlt : colors.blueSoft} size={36} />
                      <View style={{ flex: 1 }}>
                        <Txt variant="body" style={{ fontWeight: '600', ...(hidden ? { color: colors.textFaint } : null) }}>{c.name}</Txt>
                        <Txt variant="muted">{c.level}{hidden ? ' · retiré de ta page' : ''}</Txt>
                      </View>
                      <Button
                        size="sm"
                        label={hidden ? 'Réafficher' : 'Retirer'}
                        variant={hidden ? 'secondary' : 'ghost'}
                        onPress={() => toggleHideCoach(c.id)}
                      />
                    </View>
                  );
                })}
              </View>
            </Card>
          </View>

          {/* Terrains (courts) */}
          <View style={{ marginTop: spacing.xl }}>
            <SectionHeader title={`Terrains · ${courts.length}`} />
            <Card>
              <Txt variant="muted">Ajoute ou retire les terrains de ton club. La disponibilité se calcule terrain par terrain.</Txt>
              <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                {courts.map((c) => (
                  <View key={c} style={styles.listRow}>
                    <IconCircle icon="tennisball" color={colors.green} bg={colors.greenSoft} size={36} />
                    <Txt variant="body" style={{ flex: 1, fontWeight: '600' }}>{c}</Txt>
                    {courts.length > 1 ? (
                      <Pressable onPress={() => removeCourt(c)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={18} color={colors.danger} />
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
              <View style={styles.inlineRow}>
                <TextInput value={courtName} onChangeText={setCourtName} placeholder="Nom du terrain (ex. Terrain 4, Central…)" placeholderTextColor={colors.textFaint} style={styles.input} />
                <Button size="sm" label="Ajouter" icon="add" onPress={addCourt} />
              </View>
            </Card>
          </View>

          {/* Disponibilités */}
          <View style={{ marginTop: spacing.xl }}>
            <SectionHeader title="Disponibilités" />
            <Card>
              <Txt variant="muted">Touche un horaire pour l'ouvrir ou le fermer à la réservation.</Txt>
              <View style={styles.wrap}>
                {ALL_TIMES.map((t) => (
                  <Chip key={t} label={t} active={openSlots.includes(t)} onPress={() => toggleSlot(t)} />
                ))}
              </View>
              <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
                Les créneaux actifs (verts) sont réservables par les joueurs ; les autres sont fermés.
              </Txt>
            </Card>
          </View>

          <Card style={{ marginTop: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <IconCircle icon="cash" color={colors.purple} bg={colors.purpleSoft} size={40} />
            <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
              Tarif affiché aux joueurs : <Txt variant="small" style={{ fontWeight: '700' }}>dès {fcfa(club.priceFrom)} la session (1h30)</Txt> — le règlement se fait directement au club.
            </Txt>
          </Card>
        </>
      ) : null}

      {!locked && section === 'Tournois' ? (
        <>
          <SectionHeader title="Tournois du club" />
          <Button
            label="Créer un tournoi (club)"
            icon="trophy"
            onPress={() => router.push(`/competition/nouvelle?as=club&clubId=${club.id}`)}
            full
          />
          <View style={{ marginTop: spacing.md }}>
            {comps.length === 0 ? (
              <EmptyState icon="trophy-outline" title="Aucun tournoi" text="Crée le premier tournoi de ton club." />
            ) : (
              comps.map((c) => {
                const finished = c.dateKey <= todayKey;
                const result = state.compResults[c.id];
                return (
                  <Card key={c.id} style={{ marginBottom: spacing.sm }}>
                    <Pressable onPress={() => router.push(`/competition/${c.id}`)}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                        <View style={{ flex: 1 }}>
                          <Txt variant="h3" style={{ fontSize: 15 }}>
                            {c.title}
                          </Txt>
                          <Txt variant="muted">
                            {c.date} · {teamCount(c, !!state.compRegistrations[c.id])}/{c.slots} équipes
                          </Txt>
                        </View>
                        {result ? (
                          <Tag label={`Vainqueur : ${result.winner}`} tone="amber" icon="trophy" />
                        ) : finished ? (
                          <Tag label="À clôturer" tone="coral" icon="flag" />
                        ) : (
                          <Tag label="À venir" tone="purple" />
                        )}
                      </View>
                    </Pressable>
                    {finished && !result ? (
                      <View style={{ marginTop: spacing.sm }}>
                        <Button size="sm" label="Clôturer & désigner le vainqueur" icon="flag" onPress={() => setClosingId(c.id)} full />
                      </View>
                    ) : null}
                  </Card>
                );
              })
            )}
          </View>
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
            Un tournoi bloque automatiquement tes terrains ce jour-là. Une fois la date passée,
            clôture-le en désignant l'équipe vainqueure : les joueurs inscrits sont mis à jour.
          </Txt>
        </>
      ) : null}

      {/* Détail d'un créneau (bottom sheet) — état de chaque terrain + Bloquer / Débloquer */}
      <BottomSheet
        visible={!!selectedCell}
        title={selectedCell?.label ?? ''}
        subtitle="Touche « Bloquer » pour fermer un terrain (résa hors app)."
        onClose={() => { setSelectedCell(null); setBlockingCourt(null); }}
      >
        {selectedCell ? (
          hasCompetition(club.id, selectedCell.dateKey, comps) ? (
            <View style={styles.banner}>
              <Ionicons name="trophy" size={16} color={colors.purple} />
              <Txt variant="small" color={colors.text} style={{ flex: 1 }}>
                Jour de tournoi — tous les terrains sont indisponibles ce jour-là.
              </Txt>
            </View>
          ) : (
            (() => {
              const cellTs = slotTimestamp(selectedCell.value, selectedCell.time);
              const isPast = cellTs <= now;
              return courts.map((c, i) => {
                const resa = cellRes.find((r) => r.court === c);
                const blk = clubBlocked.find((b) => b.dateKey === selectedCell.dateKey && b.time === selectedCell.time && b.court === c);
                const isBlocking = blockingCourt === c;
                return (
                  <View key={c} style={{ marginTop: spacing.sm }}>
                    {i > 0 ? <Divider style={{ marginBottom: spacing.sm }} /> : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Tag label={c} tone="neutral" />
                      {resa ? (
                        <>
                          <Txt variant="small" color={colors.text} style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>
                            Réservé via PadelConnect · {resa.bookedBy?.name ?? 'Joueur'}
                          </Txt>
                          {resa.clubConfirmed ? <Tag label="Confirmée ✓" tone="green" /> : <Tag label="À confirmer" tone="coral" />}
                        </>
                      ) : blk ? (
                        <>
                          <Txt variant="small" color={colors.coral} style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>
                            Bloqué · {blk.reason}
                          </Txt>
                          <Button
                            size="sm"
                            label="Débloquer"
                            icon="lock-open"
                            variant="secondary"
                            onPress={() => unblockSlot(club.id, selectedCell.dateKey, selectedCell.time, c)}
                          />
                        </>
                      ) : (
                        <>
                          <Txt variant="small" color={colors.green} style={{ flex: 1, fontWeight: '600' }}>
                            Libre
                          </Txt>
                          {!isPast ? (
                            <Button size="sm" label="Bloquer" icon="lock-closed" variant="ghost" onPress={() => setBlockingCourt(isBlocking ? null : c)} />
                          ) : (
                            <Txt variant="small" color={colors.textFaint}>passé</Txt>
                          )}
                        </>
                      )}
                    </View>
                    {isBlocking && !resa && !blk && !isPast ? (
                      <View style={[styles.wrap, { marginTop: spacing.sm }]}>
                        {BLOCK_REASONS.map((reason) => (
                          <Chip
                            key={reason}
                            label={reason}
                            onPress={() => {
                              blockSlot({ clubId: club.id, dateKey: selectedCell.dateKey, time: selectedCell.time, court: c, reason }, cellTs);
                              setBlockingCourt(null);
                            }}
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              });
            })()
          )
        ) : null}
        <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.md }}>
          Un créneau bloqué n'est jamais facturé ni compté — c'est une simple indisponibilité.
        </Txt>
      </BottomSheet>

      {/* Clôture d'un tournoi (bottom sheet) — désignation du vainqueur par l'organisateur */}
      <BottomSheet
        visible={!!closingComp}
        title="Clôturer le tournoi"
        subtitle={closingComp?.title}
        onClose={() => setClosingId(null)}
      >
        {closingComp ? (
          <ClosePanel
            comp={closingComp}
            myTeam={state.compRegistrations[closingComp.id] ? `${state.account?.firstName ?? 'Toi'} & ${state.compRegistrations[closingComp.id].partner}` : undefined}
            onClose={(winner, isMe) => {
              closeCompetition(closingComp, winner, isMe);
              setClosingId(null);
            }}
            onCancel={() => setClosingId(null)}
          />
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

// Infos éditables du club (nom, quartier, description, type, tarif session, WhatsApp).
function ClubInfoCard({ club, onSave }: { club: Club & { contactPhone?: string }; onSave: (patch: ClubInfo) => void }) {
  const [name, setName] = useState(club.name);
  const [area, setArea] = useState(club.area);
  const [blurb, setBlurb] = useState(club.blurb);
  const [type, setType] = useState<Club['type']>(club.type);
  const [price, setPrice] = useState(String(club.priceFrom));
  const [phone, setPhone] = useState(club.contactPhone ?? '');
  const [saved, setSaved] = useState(false);

  const ready = name.trim().length >= 2 && area.trim().length >= 2 && Number(price) > 0;
  const save = () => {
    if (!ready) return;
    onSave({
      name: name.trim(),
      area: area.trim(),
      blurb: blurb.trim(),
      type,
      priceFrom: Number(price),
      contactPhone: phone.trim() || undefined,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <Card>
      <TextInput value={name} onChangeText={setName} placeholder="Nom du club" placeholderTextColor={colors.textFaint} style={styles.input} />
      <TextInput value={area} onChangeText={setArea} placeholder="Quartier / commune" placeholderTextColor={colors.textFaint} style={styles.input} />
      <TextInput
        value={blurb}
        onChangeText={setBlurb}
        placeholder="Description (visible par les joueurs)"
        placeholderTextColor={colors.textFaint}
        multiline
        style={[styles.input, { minHeight: 64, textAlignVertical: 'top' }]}
      />
      <View style={[styles.wrap, { marginTop: spacing.md }]}>
        {CLUB_TYPES.map((t) => (
          <Chip key={t} label={t} active={type === t} onPress={() => setType(t)} />
        ))}
      </View>
      <TextInput
        value={price}
        onChangeText={setPrice}
        placeholder="Tarif de la session 1h30 (FCFA)"
        placeholderTextColor={colors.textFaint}
        keyboardType="numeric"
        style={styles.input}
      />
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="WhatsApp du club (optionnel — affiche « Contacter le club »)"
        placeholderTextColor={colors.textFaint}
        keyboardType="phone-pad"
        style={styles.input}
      />
      <View style={{ marginTop: spacing.md }}>
        <Button
          size="sm"
          label={saved ? 'Enregistré ✓' : 'Enregistrer les infos'}
          icon={saved ? 'checkmark-circle' : 'save-outline'}
          variant={saved ? 'secondary' : 'primary'}
          onPress={save}
          disabled={!ready}
          full
        />
      </View>
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
        Ces infos s'appliquent immédiatement sur ta page et dans les listes.
      </Txt>
    </Card>
  );
}

// Panneau de clôture (organisateur) : liste des équipes inscrites → sélection →
// « Valider le vainqueur » → confirmation. Tournoi officiel : l'équipe gagnante prend +0.25.
function ClosePanel({
  comp,
  myTeam,
  onClose,
  onCancel,
}: {
  comp: Competition;
  myTeam?: string;
  onClose: (winner: string, winnerIsMe: boolean) => void;
  onCancel: () => void;
}) {
  const teams = demoTeams(comp, myTeam);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  return (
    <View style={{ marginTop: spacing.sm }}>
      {comp.official ? (
        <Txt variant="small" color={colors.amber} style={{ fontWeight: '600' }}>
          Tournoi officiel — l'équipe vainqueure gagne +0.25 de niveau.
        </Txt>
      ) : null}
      <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
        Équipes inscrites · {teams.length}
      </Txt>
      <View style={{ marginTop: spacing.sm, gap: 6 }}>
        {teams.map((t) => {
          const sel = selected === t;
          return (
            <Pressable
              key={t}
              onPress={() => {
                setSelected(t);
                setConfirming(false);
              }}
              style={[styles.teamRow, sel && styles.teamRowSel]}
            >
              <Ionicons name={sel ? 'radio-button-on' : 'radio-button-off'} size={18} color={sel ? colors.gold : colors.textMuted} />
              <Txt variant="body" style={{ flex: 1, fontWeight: sel ? '700' : '400' }}>
                {t}
              </Txt>
              {myTeam === t ? <Tag label="Ton équipe" tone="blue" /> : null}
            </Pressable>
          );
        })}
      </View>
      {confirming && selected ? (
        <View style={styles.confirmBox}>
          <Txt variant="small" color={colors.text} style={{ fontWeight: '600', textAlign: 'center' }}>
            Confirmer : « {selected} » remporte le tournoi ?
          </Txt>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button size="sm" label="Confirmer le vainqueur" icon="trophy" onPress={() => onClose(selected, selected === myTeam)} full />
            </View>
            <Button size="sm" label="Non" variant="ghost" onPress={() => setConfirming(false)} />
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Button size="sm" label="Valider le vainqueur" icon="flag" onPress={() => setConfirming(true)} disabled={!selected} full />
          </View>
          <Button size="sm" label="Annuler" variant="ghost" onPress={onCancel} />
        </View>
      )}
    </View>
  );
}

// Mini-formulaire « Bloquer un créneau » : date → heure → terrain → motif.
// Distingue réservé / bloqué / libre, et permet de débloquer (avec confirmation).
type CourtStatus = { state: 'free' | 'reserved' | 'blocked'; label?: string };
function QuickBlock({
  days,
  times,
  courts,
  dayHasTournament,
  courtStatus,
  onBlock,
  onUnblock,
}: {
  days: { key: string; label: string; value: number }[];
  times: string[];
  courts: string[];
  dayHasTournament: (dateKey: string) => boolean;
  courtStatus: (dateKey: string, time: string, court: string) => CourtStatus;
  onBlock: (dateKey: string, time: string, court: string, reason: string, ts: number) => boolean;
  onUnblock: (dateKey: string, time: string, court: string) => void;
}) {
  const [day, setDay] = useState(days[0]);
  const [time, setTime] = useState<string | null>(null);
  const [court, setCourt] = useState<string | null>(null);
  const [confirmUnblock, setConfirmUnblock] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tsOf = (t: string) => slotTimestamp(day.value, t);
  const reset = () => { setTime(null); setCourt(null); setError(null); setConfirmUnblock(null); };
  const tournamentDay = dayHasTournament(day.key);

  return (
    <Card style={{ marginTop: spacing.sm, borderColor: colors.coral }}>
      <Txt variant="label" color={colors.textFaint}>Jour</Txt>
      <View style={styles.wrap}>
        {days.map((d) => (
          <Chip key={d.key} label={d.label} active={d.key === day.key} onPress={() => { setDay(d); reset(); }} />
        ))}
      </View>

      {tournamentDay ? (
        <View style={styles.banner}>
          <Ionicons name="trophy" size={16} color={colors.purple} />
          <Txt variant="small" color={colors.text} style={{ flex: 1 }}>
            Jour de tournoi — terrains indisponibles ce jour-là.
          </Txt>
        </View>
      ) : (
        <>
          <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.md }}>Heure</Txt>
          <View style={styles.wrap}>
            {[...times].sort().map((t) => {
              const past = tsOf(t) <= Date.now();
              return <Chip key={t} label={past ? `${t} · passé` : t} active={t === time} disabled={past} onPress={() => { setTime(t); setCourt(null); setError(null); setConfirmUnblock(null); }} />;
            })}
          </View>

          {time ? (
            <>
              <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.md }}>Terrain</Txt>
              <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
                {courts.map((c) => {
                  const st = courtStatus(day.key, time, c);
                  const label =
                    st.state === 'reserved' ? `${c} · réservé (${st.label})` : st.state === 'blocked' ? `${c} · bloqué (${st.label})` : c;
                  const tone = st.state === 'reserved' ? colors.textMuted : st.state === 'blocked' ? colors.coral : colors.text;
                  return (
                    <Pressable
                      key={c}
                      onPress={() => {
                        setError(null);
                        if (st.state === 'reserved') {
                          setError(`Déjà réservé par ${st.label} — vois avec le joueur.`);
                          return;
                        }
                        if (st.state === 'blocked') {
                          setConfirmUnblock(confirmUnblock === c ? null : c);
                          setCourt(null);
                          return;
                        }
                        setCourt(c === court ? null : c);
                        setConfirmUnblock(null);
                      }}
                      style={[styles.courtRow, court === c && styles.courtRowSel, st.state === 'reserved' && { opacity: 0.6 }]}
                    >
                      <Ionicons
                        name={st.state === 'reserved' ? 'person' : st.state === 'blocked' ? 'lock-closed' : court === c ? 'radio-button-on' : 'radio-button-off'}
                        size={16}
                        color={tone}
                      />
                      <Txt variant="small" color={tone} style={{ flex: 1, fontWeight: '600' }}>
                        {label}
                      </Txt>
                      {st.state === 'blocked' ? <Txt variant="small" color={colors.coral}>Débloquer ?</Txt> : null}
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {/* Confirmation de déblocage */}
          {time && confirmUnblock ? (
            <View style={styles.confirmBox}>
              <Txt variant="small" color={colors.text} style={{ fontWeight: '600' }}>
                Débloquer {confirmUnblock} à {time} ? Il redeviendra réservable.
              </Txt>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button size="sm" label="Débloquer" icon="lock-open" onPress={() => { onUnblock(day.key, time, confirmUnblock); setConfirmUnblock(null); }} full />
                </View>
                <Button size="sm" label="Annuler" variant="ghost" onPress={() => setConfirmUnblock(null)} />
              </View>
            </View>
          ) : null}

          {/* Motif de blocage */}
          {time && court ? (
            <>
              <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.md }}>Motif</Txt>
              <View style={styles.wrap}>
                {BLOCK_REASONS.map((reason) => (
                  <Chip
                    key={reason}
                    label={reason}
                    onPress={() => {
                      if (!onBlock(day.key, time, court, reason, tsOf(time))) {
                        setError('Impossible de bloquer ce créneau.');
                        return;
                      }
                      reset();
                    }}
                  />
                ))}
              </View>
            </>
          ) : null}
        </>
      )}

      {error ? (
        <Txt variant="small" color={colors.danger} style={{ marginTop: spacing.sm }}>
          {error}
        </Txt>
      ) : null}
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
        Un créneau bloqué n'est jamais facturé ni compté — c'est une simple indisponibilité.
      </Txt>
    </Card>
  );
}

// Verrou d'accès : 4 chiffres (mémorisé sur l'appareil après la 1ʳᵉ saisie correcte).
function CodeGate({ club, onUnlock }: { club: Club; onUnlock: (code: string) => boolean }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  return (
    <Card style={{ marginTop: spacing.md, alignItems: 'center', borderColor: colors.gold }}>
      <IconCircle icon="lock-closed" />
      <Txt variant="h3" style={{ marginTop: spacing.sm }}>
        Accès gérant — {club.name}
      </Txt>
      <Txt variant="muted" style={{ marginTop: 4, textAlign: 'center' }}>
        Entre le code à 4 chiffres du club. (Démo : le code est visible dans l'Espace opérateur.)
      </Txt>
      <TextInput
        value={code}
        onChangeText={(t) => {
          setCode(t.replace(/\D/g, '').slice(0, 4));
          setError(false);
        }}
        placeholder="••••"
        placeholderTextColor={colors.textFaint}
        keyboardType="number-pad"
        maxLength={4}
        style={styles.codeInput}
      />
      {error ? (
        <Txt variant="small" color={colors.danger} style={{ marginTop: spacing.sm }}>
          Code incorrect — réessaie.
        </Txt>
      ) : null}
      <View style={{ alignSelf: 'stretch', marginTop: spacing.md }}>
        <Button
          label="Déverrouiller"
          icon="lock-open"
          disabled={code.length !== 4}
          onPress={() => {
            if (!onUnlock(code)) setError(true);
          }}
          full
        />
      </View>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color, borderWidth: 1, borderColor: colors.border }} />
      <Txt variant="small" color={colors.textMuted} style={{ fontSize: 11 }}>
        {label}
      </Txt>
    </View>
  );
}

function StatTile({ value, label, color, bg }: { value: number | string; label: string; color: string; bg: string }) {
  return (
    <View style={[styles.stat, { backgroundColor: bg }]}>
      <Txt variant="h2" color={color}>
        {value}
      </Txt>
      <Txt variant="small" color={colors.textMuted}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.purpleSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  signupLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md, paddingVertical: spacing.xs },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.blueSoft,
    borderWidth: 1,
    borderColor: colors.blue,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  stats: { flexDirection: 'row', gap: spacing.sm },
  planRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  planTime: { width: 44, alignItems: 'flex-start' },
  planHead: { flex: 1, alignItems: 'center', paddingBottom: 2 },
  planCell: {
    flex: 1,
    height: 30,
    borderRadius: 6,
    marginHorizontal: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planCellSel: { borderWidth: 2, borderColor: colors.text },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  teamRowSel: { backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.gold },
  courtRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  courtRowSel: { backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.gold },
  confirmBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.amberSoft,
  },
  codeInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 28,
    letterSpacing: 12,
    textAlign: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.md,
    alignSelf: 'stretch',
  },
  planLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
  stat: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
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
