import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { BottomSheet } from '@/components/BottomSheet';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, SectionHeader, Tag, Txt } from '@/components/ui';
import { ClosePanel } from '@/components/club-admin/ClosePanel';
import { SectionMonClub } from '@/components/club-admin/SectionMonClub';
import { SectionReservations } from '@/components/club-admin/SectionReservations';
import { SectionTournois } from '@/components/club-admin/SectionTournois';
import { clubsByName, findClub, manageableClubs, type Club } from '@/data/clubs';
import { seedCompetitions } from '@/data/competitions';
import { competitionBlockedCourts, courtsFor, hasFullDayCompetition } from '@/lib/availability';
import { openWhatsApp } from '@/lib/contact';
import { dateKeyLabel, slotTimestamp } from '@/lib/days';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { isPlayed, useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

const SECTIONS = ['Réservations', 'Mon club', 'Tournois'] as const;
// Motifs de blocage d’un créneau hors app (repris dans le bottom sheet de détail créneau).
const BLOCK_REASONS = ['Résa téléphone/WhatsApp', 'Entretien', 'Privatisé', 'Autre'];
const CLUB_TYPES: Club['type'][] = ['Couvert', 'Extérieur', 'Mixte'];
// Guide de démarrage fermé (drapeau local persistant — pas une donnée serveur).
const GUIDE_SEEN_KEY = 'padelco_club_guide_seen';
// Les 4 gestes essentiels d'un gérant — un club non rodé qui les ignore crée des doublons
// (résas téléphone non bloquées) et des joueurs inquiets (résas jamais confirmées).
const GUIDE_STEPS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'time-outline', text: 'Renseigne tes créneaux et tes terrains (onglet « Mon club »)' },
  { icon: 'checkmark-circle-outline', text: 'Confirme chaque réservation reçue — le joueur est rassuré' },
  { icon: 'lock-closed-outline', text: 'Un créneau pris par téléphone/WhatsApp ? Bloque-le pour éviter les doublons' },
  { icon: 'alert-circle-outline', text: 'Un joueur absent ? Marque « pas venu » — sa fiabilité en tient compte' },
];

export default function ClubAdmin() {
  const {
    state,
    setManagedClub,
    requestClub,
    submitClubRequest,
    cancelOwnClubRequest,
    closeCompetition,
    deleteCompetition,
    blockSlot,
    unblockSlot,
  } = useApp();
  const toast = useToast();
  const { refreshControl } = usePullToRefresh();

  const [section, setSection] = useState<(typeof SECTIONS)[number]>('Réservations');
  // Guide de démarrage : null = drapeau pas encore lu (on n'affiche rien pour éviter un flash).
  const [guideSeen, setGuideSeen] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem(GUIDE_SEEN_KEY).then((v) => alive && setGuideSeen(v === '1'));
    return () => {
      alive = false;
    };
  }, []);
  const dismissGuide = () => {
    setGuideSeen(true);
    void AsyncStorage.setItem(GUIDE_SEEN_KEY, '1');
  };
  const [closingId, setClosingId] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ dateKey: string; time: string; label: string } | null>(null);
  const [blockingCourt, setBlockingCourt] = useState<string | null>(null);

  // Inscription d’un nouveau club (validée ensuite par l’opérateur PadelConnect).
  const [showSignup, setShowSignup] = useState(false);
  const [ncName, setNcName] = useState('');
  const [ncArea, setNcArea] = useState('');
  const [ncType, setNcType] = useState<Club['type']>('Extérieur');
  const [ncCourts, setNcCourts] = useState(2);
  const [ncPrice, setNcPrice] = useState('');
  const [ncPhone, setNcPhone] = useState('');

  const manageable = manageableClubs(state.customClubs, state.clubInfo);
  // Un compte 'club' gère UNIQUEMENT le club que le serveur lui a attribué
  // (serverManagedClubId). L’opérateur, lui, peut basculer librement.
  const isOperator = state.role === 'operator';
  const managedId = isOperator ? state.managedClubId : (state.serverManagedClubId ?? undefined);
  const club = findClub(managedId, state.customClubs, state.clubInfo) ?? clubsByName[0];
  const pendingOwn = state.customClubs.find((c) => c.id === club.id)?.status === 'pending';

  const comps = [...state.myCompetitions.filter((c) => c.clubId === club.id), ...seedCompetitions.filter((c) => c.clubId === club.id)];
  const closingComp = comps.find((c) => c.id === closingId);

  // Données du bottom sheet de détail créneau.
  const now = Date.now();
  const clubRes = state.reservations.filter((r) => r.clubId === club.id);
  // Réservations à venir en attente de confirmation → rappel visible depuis tous les onglets.
  // MÊME règle que la liste de l'onglet Réservations (!isPlayed) : une partie en cours non
  // confirmée reste confirmable — la pastille doit la compter comme la liste l'affiche.
  const pendingConfirm = clubRes.filter((r) => !r.clubConfirmed && !isPlayed(r, now)).length;
  const clubBlocked = state.blockedSlots.filter((b) => b.clubId === club.id);
  // Repli sur les terrains par défaut : la fiche détail d’un créneau doit lister les terrains
  // même si le gérant n’a pas encore personnalisé sa configuration.
  const courts = courtsFor(club, state.clubCourts);
  const cellRes = selectedCell
    ? clubRes
        .filter((r) => r.dateKey === selectedCell.dateKey && r.time === selectedCell.time)
        .sort((a, b) => a.court.localeCompare(b.court))
    : [];

  const signupReady = ncName.trim().length >= 2 && ncArea.trim().length >= 2 && Number(ncPrice) > 0;
  const [sendingSignup, setSendingSignup] = useState(false);
  const submitSignup = async () => {
    if (!signupReady || sendingSignup) return;
    setSendingSignup(true);
    // La demande part D’ABORD sur le SERVEUR (club_requests) : sans ça l’opérateur ne la
    // voit jamais dans son espace. En cas de succès seulement, on crée aussi le club local
    // « en attente » pour que le gérant prépare sa page tout de suite (activé après validation).
    const res = await submitClubRequest({
      name: ncName,
      area: ncArea,
      type: ncType,
      courts: ncCourts,
      priceFrom: Number(ncPrice),
      contactPhone: ncPhone,
    });
    setSendingSignup(false);
    if (!res.ok) {
      toast.show(res.error ?? 'Envoi impossible — réessaie', { icon: 'alert-circle' });
      return;
    }
    requestClub({ name: ncName, area: ncArea, type: ncType, courts: ncCourts, priceFrom: Number(ncPrice), contactPhone: ncPhone });
    setShowSignup(false);
    setNcName('');
    setNcArea('');
    setNcPrice('');
    setNcPhone('');
    toast.show('Demande envoyée à PadelConnect ✅');
  };

  const header = (
    <View style={styles.note}>
      <Ionicons name="business" size={15} color={colors.textFaint} />
      <Txt variant="small" color={colors.textFaint} style={{ flex: 1 }}>
        {club.name} — Espace Club.
      </Txt>
    </View>
  );

  // Espace réservé aux comptes CLUB (et à l’opérateur). Un joueur normal est bloqué —
  // l’entrée n’apparaît déjà pas dans son profil, et un accès direct est refusé ici.
  if (state.role !== 'club' && state.role !== 'operator') {
    return (
      <Screen back title="Espace Club">
        <Card style={{ marginTop: spacing.md, alignItems: 'center', paddingVertical: spacing.xl }}>
          <Ionicons name="lock-closed-outline" size={28} color={colors.textFaint} />
          <Txt variant="h3" style={{ marginTop: spacing.sm }}>
            Réservé aux clubs
          </Txt>
          <Txt variant="muted" style={{ marginTop: 4, textAlign: 'center' }}>
            Cet espace est réservé aux clubs partenaires. Tu gères un club ? Inscris-le depuis ton profil.
          </Txt>
        </Card>
      </Screen>
    );
  }

  // Compte 'club' sans club rattaché (serverManagedClubId nul) : on NE retombe PAS sur
  // un club réel par défaut — on bloque proprement (sinon il éditerait le club d’un autre).
  if (!isOperator && !state.serverManagedClubId) {
    return (
      <Screen back title="Espace Club">
        <Card style={{ marginTop: spacing.md, alignItems: 'center', paddingVertical: spacing.xl }}>
          <Ionicons name="business-outline" size={28} color={colors.textFaint} />
          <Txt variant="h3" style={{ marginTop: spacing.sm }}>
            Aucun club rattaché
          </Txt>
          <Txt variant="muted" style={{ marginTop: 4, textAlign: 'center' }}>
            Ton compte n’est rattaché à aucun club pour l’instant. Contacte PadelConnect pour activer ton club.
          </Txt>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen back title="Espace Club" subtitle="Gère ton club" refreshControl={refreshControl}>
      {header}

      {/* Guide de démarrage — les 4 gestes essentiels, fermable une fois assimilé. */}
      {guideSeen === false ? (
        <Card style={{ borderColor: colors.signature, marginBottom: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Txt variant="h3" style={{ flex: 1 }}>
              Bien démarrer en 4 gestes 🎾
            </Txt>
            <Pressable onPress={dismissGuide} hitSlop={8} accessibilityRole="button" accessibilityLabel="Fermer le guide">
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
          <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
            {GUIDE_STEPS.map((s, i) => (
              <View key={s.text} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                <Txt variant="small" color={colors.signature} style={{ fontWeight: '700', width: 14 }}>
                  {i + 1}
                </Txt>
                <Ionicons name={s.icon} size={16} color={colors.signature} style={{ marginTop: 1 }} />
                <Txt variant="small" color={colors.text} style={{ flex: 1 }}>
                  {s.text}
                </Txt>
              </View>
            ))}
          </View>
          <View style={{ marginTop: spacing.md }}>
            <Button size="sm" label="C'est compris" icon="checkmark" variant="secondary" onPress={dismissGuide} full />
          </View>
        </Card>
      ) : null}

      {/* Mode HORS-LIGNE uniquement : sans session serveur, les modifs restent locales. Connecté,
          tout (config, photos, offres, coachs, confirmations) est enregistré côté serveur. */}
      {!state.serverUserId ? (
        <View style={styles.demoBanner}>
          <Ionicons name="information-circle" size={16} color={colors.signatureDark} />
          <Txt variant="small" color={colors.signatureDark} style={{ flex: 1 }}>
            Tu n’es pas connecté : tes modifications restent sur cet appareil. Connecte-toi pour qu’elles soient enregistrées et visibles
            par les joueurs.
          </Txt>
        </View>
      ) : null}

      {/* Club géré — l’opérateur peut basculer entre clubs ; un compte club voit le sien. */}
      <View style={{ marginTop: spacing.lg }}>
        <SectionHeader title="Club géré" />
        {isOperator ? (
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
        ) : (
          <View style={styles.wrap}>
            <Chip label={club.name} active onPress={() => {}} />
          </View>
        )}

        {/* Inscription d’un nouveau club — validée par PadelConnect */}
        <Pressable onPress={() => setShowSignup((v) => !v)} style={styles.signupLink}>
          <Ionicons name={showSignup ? 'chevron-down' : 'add-circle-outline'} size={16} color={colors.blue} />
          <Txt variant="small" color={colors.blue} style={{ fontWeight: '700' }}>
            Ton club n’est pas dans la liste ? Inscris-le
          </Txt>
        </Pressable>

        {showSignup ? (
          <Card style={{ marginTop: spacing.sm, borderColor: colors.blue }}>
            <Txt variant="h3">Inscrire mon club</Txt>
            <Txt variant="small" color={colors.textMuted} style={{ marginTop: 2 }}>
              Ta demande passe par PadelConnect : tu prépares ta page tout de suite, elle devient visible des joueurs dès l’activation.
            </Txt>
            <TextInput
              value={ncName}
              onChangeText={setNcName}
              placeholder="Nom du club"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <TextInput
              value={ncArea}
              onChangeText={setNcArea}
              placeholder="Quartier / commune (ex. Cocody)"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
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
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              style={styles.input}
            />
            <TextInput
              value={ncPhone}
              onChangeText={setNcPhone}
              placeholder="Téléphone du club (optionnel)"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              style={styles.input}
            />
            <View style={{ marginTop: spacing.md }}>
              <Button label="Envoyer la demande à PadelConnect" icon="paper-plane" onPress={submitSignup} disabled={!signupReady} full />
            </View>
          </Card>
        ) : null}

        {pendingOwn ? (
          <View style={styles.pendingBanner}>
            <Ionicons name="hourglass-outline" size={16} color={colors.blue} />
            <Txt variant="small" color={colors.text} style={{ flex: 1 }}>
              {club.name} est{' '}
              <Txt variant="small" style={{ fontWeight: '700' }}>
                en attente d’activation
              </Txt>{' '}
              par PadelConnect. Prépare ta page (photos, terrains, créneaux) : les joueurs la verront dès l’activation.
            </Txt>
            <Pressable
              onPress={() => {
                cancelOwnClubRequest(club.id);
                toast.show('Demande annulée');
              }}
              hitSlop={8}
              accessibilityLabel="Annuler ma demande de club"
            >
              <Txt variant="small" color={colors.danger} style={{ fontWeight: '700' }}>
                Annuler
              </Txt>
            </Pressable>
          </View>
        ) : null}
      </View>

      <SegmentedControl options={SECTIONS} value={section} onChange={setSection} />

      {/* Rappel visible depuis les AUTRES onglets : des réservations attendent la confirmation
          du gérant (un tap ramène à l’onglet Réservations). */}
      {section !== 'Réservations' && pendingConfirm > 0 ? (
        <Pressable
          onPress={() => setSection('Réservations')}
          style={styles.pendingConfirm}
          accessibilityRole="button"
          accessibilityLabel={`${pendingConfirm} réservation${pendingConfirm > 1 ? 's' : ''} à confirmer`}
        >
          <Ionicons name="hourglass-outline" size={14} color={colors.amberDark} />
          <Txt variant="small" color={colors.amberDark} style={{ fontWeight: '700', flex: 1 }}>
            {pendingConfirm} réservation{pendingConfirm > 1 ? 's' : ''} à confirmer
          </Txt>
          <Ionicons name="chevron-forward" size={14} color={colors.amberDark} />
        </Pressable>
      ) : null}

      {section === 'Réservations' ? <SectionReservations club={club} comps={comps} onSelectCell={setSelectedCell} /> : null}

      {section === 'Mon club' ? <SectionMonClub club={club} /> : null}

      {section === 'Tournois' ? <SectionTournois club={club} comps={comps} onCloseComp={setClosingId} /> : null}

      {/* Détail d’un créneau (bottom sheet) — état de chaque terrain + Bloquer / Débloquer */}
      <BottomSheet
        visible={!!selectedCell}
        title={selectedCell?.label ?? ''}
        subtitle="Touche « Bloquer » pour fermer un terrain (résa hors app)."
        onClose={() => {
          setSelectedCell(null);
          setBlockingCourt(null);
        }}
      >
        {selectedCell ? (
          hasFullDayCompetition(club.id, selectedCell.dateKey, comps) ? (
            <View style={styles.banner}>
              <Ionicons name="trophy" size={16} color={colors.purple} />
              <Txt variant="small" color={colors.text} style={{ flex: 1 }}>
                Jour de tournoi — tous les terrains sont indisponibles ce jour-là.
              </Txt>
            </View>
          ) : (
            (() => {
              const cellTs = slotTimestamp(selectedCell.dateKey, selectedCell.time);
              const isPast = cellTs <= now;
              // Terrains retenus par un tournoi PARTIEL (certains terrains/créneaux seulement —
              // la journée entière est déjà couverte par hasFullDayCompetition ci-dessus).
              const compBlocked = competitionBlockedCourts(club.id, selectedCell.dateKey, selectedCell.time, comps);
              return courts.map((c, i) => {
                const isTournoi = compBlocked === 'all' || compBlocked.includes(c);
                const resa = cellRes.find((r) => r.court === c);
                const blk = clubBlocked.find((b) => b.dateKey === selectedCell.dateKey && b.time === selectedCell.time && b.court === c);
                const isBlocking = blockingCourt === c;
                return (
                  <View key={c} style={{ marginTop: spacing.sm }}>
                    {i > 0 ? <Divider style={{ marginBottom: spacing.sm }} /> : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Tag label={c} tone="neutral" />
                      {isTournoi ? (
                        <>
                          <Ionicons name="trophy" size={14} color={colors.purple} />
                          <Txt variant="small" color={colors.purple} style={{ flex: 1, fontWeight: '600' }}>
                            Retenu par un tournoi
                          </Txt>
                        </>
                      ) : resa ? (
                        <>
                          <Txt variant="small" color={colors.text} style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>
                            Réservé via PadelConnect · {resa.bookedBy?.name ?? 'Joueur'}
                          </Txt>
                          {resa.clubConfirmed ? <Tag label="Confirmée ✓" tone="green" /> : <Tag label="À confirmer" tone="amber" />}
                          {resa.bookedBy?.phone ? (
                            // Contact direct depuis le planning — même message que la liste
                            // « À confirmer » (on n'affirme « confirmée » que si c'est vrai).
                            <Pressable
                              onPress={() =>
                                openWhatsApp(
                                  resa.bookedBy!.phone,
                                  resa.clubConfirmed
                                    ? `Bonjour ${resa.bookedBy!.name}, votre réservation du ${dateKeyLabel(resa.dateKey)} à ${resa.time} (${resa.court}) à ${club.name} est bien confirmée ✅`
                                    : `Bonjour ${resa.bookedBy!.name}, votre réservation du ${dateKeyLabel(resa.dateKey)} à ${resa.time} (${resa.court}) à ${club.name} est bien reçue, je reviens vers vous pour la confirmer.`,
                                )
                              }
                              hitSlop={8}
                              accessibilityRole="button"
                              accessibilityLabel={`Contacter ${resa.bookedBy.name} sur WhatsApp`}
                            >
                              <Ionicons name="logo-whatsapp" size={18} color={colors.green} />
                            </Pressable>
                          ) : null}
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
                            onPress={() => {
                              void unblockSlot(club.id, selectedCell.dateKey, selectedCell.time, c).then((ok) =>
                                toast.show(
                                  ok ? 'Créneau rouvert' : 'Impossible de rouvrir — réessaie',
                                  ok ? undefined : { icon: 'alert-circle' },
                                ),
                              );
                            }}
                          />
                        </>
                      ) : (
                        <>
                          <Txt variant="small" color={colors.green} style={{ flex: 1, fontWeight: '600' }}>
                            Libre
                          </Txt>
                          {!isPast ? (
                            <Button
                              size="sm"
                              label="Bloquer"
                              icon="lock-closed"
                              variant="ghost"
                              onPress={() => setBlockingCourt(isBlocking ? null : c)}
                            />
                          ) : (
                            <Txt variant="small" color={colors.textFaint}>
                              passé
                            </Txt>
                          )}
                        </>
                      )}
                    </View>
                    {isBlocking && !isTournoi && !resa && !blk && !isPast ? (
                      <View style={[styles.wrap, { marginTop: spacing.sm }]}>
                        {BLOCK_REASONS.map((reason) => (
                          <Chip
                            key={reason}
                            label={reason}
                            onPress={() => {
                              setBlockingCourt(null);
                              void blockSlot(
                                { clubId: club.id, dateKey: selectedCell.dateKey, time: selectedCell.time, court: c, reason },
                                cellTs,
                              ).then((ok) =>
                                toast.show(
                                  ok ? 'Créneau bloqué' : 'Impossible de bloquer ce créneau',
                                  ok ? undefined : { icon: 'alert-circle' },
                                ),
                              );
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
          Un créneau bloqué n’est jamais facturé ni compté — c’est une simple indisponibilité.
        </Txt>
      </BottomSheet>

      {/* Clôture d’un tournoi (bottom sheet) — désignation du vainqueur par l’organisateur */}
      <BottomSheet visible={!!closingComp} title="Clôturer le tournoi" subtitle={closingComp?.title} onClose={() => setClosingId(null)}>
        {closingComp ? (
          <ClosePanel
            comp={closingComp}
            myTeam={
              state.compRegistrations[closingComp.id]
                ? `${state.account?.firstName ?? 'Toi'} & ${state.compRegistrations[closingComp.id].partner}`
                : undefined
            }
            onClose={(winner, isMe, loser, loserIsMe, podium) => {
              void closeCompetition(closingComp, winner, isMe, loser, loserIsMe, podium).then((ok) => {
                toast.show(ok ? 'Tournoi clôturé' : 'Clôture impossible — réessaie.', ok ? undefined : { icon: 'alert-circle' });
                if (ok) setClosingId(null);
              });
            }}
            onCancel={() => setClosingId(null)}
            onDelete={
              closingComp.createdByMe
                ? () => {
                    deleteCompetition(closingComp.id);
                    setClosingId(null);
                  }
                : undefined
            }
          />
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  demoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.greenSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
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
  pendingConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.amberSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
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
