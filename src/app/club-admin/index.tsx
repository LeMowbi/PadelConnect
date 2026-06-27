import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { BottomSheet } from '@/components/BottomSheet';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Button, Card, Divider, IconCircle, SectionHeader, Tag, Txt } from '@/components/ui';
import { ClosePanel } from '@/components/club-admin/ClosePanel';
import { CodeGate } from '@/components/club-admin/CodeGate';
import { SectionMonClub } from '@/components/club-admin/SectionMonClub';
import { SectionReservations } from '@/components/club-admin/SectionReservations';
import { SectionTournois } from '@/components/club-admin/SectionTournois';
import { clubsByName, findClub, manageableClubs, type Club } from '@/data/clubs';
import { seedCompetitions } from '@/data/competitions';
import { canAccessClub } from '@/lib/access';
import { hasCompetition } from '@/lib/availability';
import { slotTimestamp } from '@/lib/days';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

const SECTIONS = ['Réservations', 'Mon club', 'Tournois'] as const;
// Motifs de blocage d'un créneau hors app (repris dans le bottom sheet de détail créneau).
const BLOCK_REASONS = ['Résa téléphone/WhatsApp', 'Entretien', 'Privatisé', 'Autre'];
const CLUB_TYPES: Club['type'][] = ['Couvert', 'Extérieur', 'Mixte'];

export default function ClubAdmin() {
  const router = useRouter();
  const {
    state,
    setClubMode,
    setManagedClub,
    requestClub,
    closeCompetition,
    deleteCompetition,
    unlockClub,
    blockSlot,
    unblockSlot,
  } = useApp();

  const [section, setSection] = useState<(typeof SECTIONS)[number]>('Réservations');
  const [closingId, setClosingId] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ dateKey: string; time: string; label: string; value: number } | null>(null);
  const [blockingCourt, setBlockingCourt] = useState<string | null>(null);

  // Inscription d'un nouveau club (validée ensuite par l'opérateur PadelConnect).
  const [showSignup, setShowSignup] = useState(false);
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
  // Décision d'accès déléguée au module central (src/lib/access.ts) — point de
  // branchement unique pour la vérification serveur de l'app finale.
  const locked = !canAccessClub(club.id, state.unlockedClubIds);

  const comps = [
    ...state.myCompetitions.filter((c) => c.clubId === club.id),
    ...seedCompetitions.filter((c) => c.clubId === club.id),
  ];
  const closingComp = comps.find((c) => c.id === closingId);

  // Données du bottom sheet de détail créneau.
  const now = Date.now();
  const clubRes = state.reservations.filter((r) => r.clubId === club.id);
  const clubBlocked = state.blockedSlots.filter((b) => b.clubId === club.id);
  const courts = state.clubCourts[club.id] ?? [];
  const cellRes = selectedCell
    ? clubRes.filter((r) => r.dateKey === selectedCell.dateKey && r.time === selectedCell.time).sort((a, b) => a.court.localeCompare(b.court))
    : [];

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
          Démo de l'interface gérant. En production, l'accès serait réservé au club connecté.
        </Txt>
      </View>

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconCircle icon="business" />
        <View style={{ flex: 1 }}>
          <Txt variant="h3">Compte club (démo)</Txt>
          <Txt variant="muted">Active le mode gérant pour gérer ton club.</Txt>
        </View>
        <Switch value={state.clubMode} onValueChange={setClubMode} trackColor={{ true: colors.signature, false: colors.border }} thumbColor={colors.white} />
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
        <SectionReservations club={club} comps={comps} onSelectCell={setSelectedCell} />
      ) : null}

      {!locked && section === 'Mon club' ? (
        <SectionMonClub club={club} />
      ) : null}

      {!locked && section === 'Tournois' ? (
        <SectionTournois club={club} comps={comps} onCloseComp={setClosingId} />
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
            onClose={(winner, isMe, loser, loserIsMe) => {
              closeCompetition(closingComp, winner, isMe, loser, loserIsMe);
              setClosingId(null);
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
