import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { ClubPhoto } from '@/components/ClubPhoto';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Button, Card, Divider, EmptyState, IconCircle, SectionHeader, Tag, Txt } from '@/components/ui';
import { SAMPLE_SLOTS, clubsByName, defaultCourts, findClub, manageableClubs, type Club } from '@/data/clubs';
import { seedCompetitions } from '@/data/competitions';
import { hasCompetition } from '@/lib/availability';
import { nextDays } from '@/lib/days';
import { useApp } from '@/store/AppContext';
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
  } = useApp();

  const [section, setSection] = useState<(typeof SECTIONS)[number]>('Réservations');
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
  const [ncName, setNcName] = useState('');
  const [ncArea, setNcArea] = useState('');
  const [ncType, setNcType] = useState<Club['type']>('Extérieur');
  const [ncCourts, setNcCourts] = useState(2);
  const [ncPrice, setNcPrice] = useState('');
  const [ncPhone, setNcPhone] = useState('');

  const manageable = manageableClubs(state.customClubs);
  const club = findClub(state.managedClubId, state.customClubs) ?? clubsByName[0];
  const pendingOwn = state.customClubs.find((c) => c.id === club.id)?.status === 'pending';

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
  const boosted = state.boostedClubIds.includes(club.id);
  const shareBoost = () =>
    Share.share({ message: `Bonjour PadelConnect, je souhaite booster le profil de ${club.name} (paiement par Wave).` }).catch(() => {});

  // Réservations du club : à venir (à confirmer) et historique (déjà jouées).
  const now = Date.now();
  const clubRes = state.reservations.filter((r) => r.clubId === club.id);
  const upcomingRes = clubRes.filter((r) => r.startsAt > now).sort((a, b) => a.startsAt - b.startsAt);
  const pastRes = clubRes.filter((r) => r.startsAt <= now).sort((a, b) => b.startsAt - a.startsAt);

  const comps = [
    ...state.myCompetitions.filter((c) => c.clubId === club.id),
    ...seedCompetitions.filter((c) => c.clubId === club.id),
  ];

  // Planning de la semaine : jours × créneaux ouverts, colorés selon l'occupation.
  const week = nextDays(7);
  const planTimes = [...openSlots].sort();
  const cellState = (dKey: string, time: string): 'tournoi' | 'complet' | 'partiel' | 'libre' => {
    if (hasCompetition(club.id, dKey, comps)) return 'tournoi';
    const booked = clubRes.filter((r) => r.dateKey === dKey && r.time === time).length;
    if (booked === 0) return 'libre';
    return booked >= courts.length ? 'complet' : 'partiel';
  };

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
              placeholder="Tarif par heure (FCFA, ex. 12000)"
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

      <SegmentedControl options={SECTIONS} value={section} onChange={setSection} />

      {section === 'Réservations' ? (
        <>
          {/* Vue d'ensemble */}
          <View style={styles.stats}>
            <StatTile value={upcomingRes.length} label="À venir" color={colors.gold} bg={colors.goldSoft} />
            <StatTile value={pastRes.length} label="Jouées" color={colors.blue} bg={colors.blueSoft} />
            <StatTile value={clubRes.length} label="Total" color={colors.green} bg={colors.greenSoft} />
          </View>

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
                    const s = cellState(d.key, t);
                    const booked = clubRes.filter((r) => r.dateKey === d.key && r.time === t).length;
                    const bg =
                      s === 'tournoi' ? colors.purple : s === 'complet' ? colors.gold : s === 'partiel' ? colors.goldSoft : colors.surfaceAlt;
                    return (
                      <View key={d.key} style={[styles.planCell, { backgroundColor: bg }]}>
                        {s === 'partiel' ? (
                          <Txt variant="small" color={colors.gold} style={{ fontSize: 10, fontWeight: '800' }}>
                            {booked}/{courts.length}
                          </Txt>
                        ) : null}
                        {s === 'complet' ? <Ionicons name="checkmark" size={11} color={colors.onGold} /> : null}
                        {s === 'tournoi' ? <Ionicons name="trophy" size={10} color={colors.white} /> : null}
                      </View>
                    );
                  })}
                </View>
              ))}
              <View style={styles.planLegend}>
                <LegendDot color={colors.surfaceAlt} label="Libre" />
                <LegendDot color={colors.goldSoft} label="Partiel" />
                <LegendDot color={colors.gold} label="Complet" />
                <LegendDot color={colors.purple} label="Tournoi" />
              </View>
            </Card>
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
                    {r.clubConfirmed ? <Tag label="Confirmée ✓" tone="green" /> : <Tag label="Nouvelle" tone="coral" />}
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

          {/* Historique du club */}
          <View style={{ marginTop: spacing.xl }}>
            <SectionHeader title={`Historique · ${pastRes.length}`} />
            {pastRes.length === 0 ? (
              <Card>
                <Txt variant="muted">Les réservations déjà jouées s'afficheront ici.</Txt>
              </Card>
            ) : (
              <Card>
                {pastRes.map((r, i) => (
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
                      <Tag label="Jouée" tone="blue" />
                    </View>
                  </View>
                ))}
              </Card>
            )}
            <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
              La commission PadelConnect se calcule sur cet historique (transmis en fin de mois, règlement par Wave).
            </Txt>
          </View>
        </>
      ) : null}

      {section === 'Mon club' ? (
        <>
          {/* Booster le profil */}
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

      {section === 'Tournois' ? (
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
              comps.map((c) => (
                <Card key={c.id} onPress={() => router.push(`/competition/${c.id}`)} style={{ marginBottom: spacing.sm }}>
                  <Txt variant="h3" style={{ fontSize: 15 }}>
                    {c.title}
                  </Txt>
                  <Txt variant="muted">
                    {c.date} · {c.registered}/{c.slots} inscrits
                  </Txt>
                </Card>
              ))
            )}
          </View>
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
            Un tournoi bloque automatiquement tes terrains ce jour-là.
          </Txt>
        </>
      ) : null}
    </Screen>
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

function StatTile({ value, label, color, bg }: { value: number; label: string; color: string; bg: string }) {
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
    height: 24,
    borderRadius: 6,
    marginHorizontal: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
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
