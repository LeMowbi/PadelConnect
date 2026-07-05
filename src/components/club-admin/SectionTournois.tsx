import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useToast } from '@/components/Toast';
import { Button, Card, EmptyState, IconCircle, SectionHeader, Tag, Txt } from '@/components/ui';
import { type Club } from '@/data/clubs';
import { compDateLabel, formatFee, isTournamentPublic, teamCount, type Competition } from '@/data/competitions';
import { openWhatsApp } from '@/lib/contact';
import { dayKey } from '@/lib/days';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

// Ligne d'information compacte d'une demande de tournoi (icône + libellé + valeur).
function ReqInfo({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string }) {
  return (
    <View style={styles.reqInfoRow}>
      <Ionicons name={icon} size={14} color={colors.textFaint} />
      <Txt variant="small" color={colors.textFaint}>
        {label}
      </Txt>
      <Txt variant="small" style={{ flex: 1, textAlign: 'right', fontWeight: '600' }} numberOfLines={2}>
        {value}
      </Txt>
    </View>
  );
}

export function SectionTournois({ club, comps, onCloseComp }: { club: Club; comps: Competition[]; onCloseComp: (id: string) => void }) {
  const router = useRouter();
  const { state, approveCompetition, rejectCompetition } = useApp();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null); // demande en cours de traitement (anti double-tap)
  // Refus COMMENTÉ : « Refuser » ouvre d'abord un champ motif (ex. « ces créneaux sont pris —
  // possible du 12 au 14 après 18h ») pour que l'organisateur sache quoi changer.
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Valider/refuser une demande : on ATTEND le serveur et on confirme (ou signale l’échec) —
  // avant, un échec réseau était totalement silencieux et le gérant croyait avoir publié.
  const decide = async (id: string, approve: boolean, reason = '') => {
    if (busyId) return;
    setBusyId(id);
    const ok = approve ? await approveCompetition(id) : await rejectCompetition(id, reason);
    setBusyId(null);
    if (ok) {
      hapticSuccess();
      toast.show(approve ? 'Tournoi validé — il est maintenant visible ✓' : 'Demande refusée — l’organisateur est prévenu.');
      setRejectingId(null);
      setRejectReason('');
    } else {
      hapticWarning();
      // Causes possibles côté serveur : réseau, ou la plage est déjà occupée — réservations,
      // autre tournoi, créneau bloqué ou période fermée (37/53/54).
      toast.show(
        approve
          ? 'Publication impossible — des réservations, un autre tournoi ou une période/créneau fermé occupent déjà cette plage.'
          : 'Action impossible — réessaie.',
        { icon: 'alert-circle' },
      );
    }
  };

  // Demandes de tournoi : créés par un joueur, en attente de validation de CE club.
  const tournamentRequests = state.myCompetitions.filter(
    (c) => c.clubId === club.id && c.status === 'pending' && c.organizerType !== 'club',
  );
  // Tournois publiés du club (hors demandes en attente) — pour la liste « Tournois du club ».
  const publishedComps = comps.filter(isTournamentPublic);
  const todayKey = dayKey(new Date());

  return (
    <>
      {/* Demandes de tournoi — créés par des joueurs, à valider avant publication */}
      {tournamentRequests.length > 0 ? (
        <View style={{ marginBottom: spacing.xl }}>
          <SectionHeader title={`Demandes de tournoi · ${tournamentRequests.length}`} />
          <Txt variant="small" color={colors.textFaint} style={{ marginBottom: spacing.sm }}>
            Un tournoi créé par un joueur n’est visible qu’après ta validation.
          </Txt>
          {tournamentRequests.map((c) => (
            <Card key={c.id} style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <IconCircle icon="trophy" color={colors.purple} bg={colors.purpleSoft} size={40} />
                <View style={{ flex: 1 }}>
                  <Txt variant="h3" style={{ fontSize: 15 }} numberOfLines={1}>
                    {c.title}
                  </Txt>
                  <Txt variant="muted">par {c.organizer}</Txt>
                </View>
              </View>

              {/* TOUTES les infos AVANT de décider : dates, terrains, créneaux bloqués, format,
                  frais d'inscription… — le gérant sait exactement ce qu'il accepte. */}
              <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
                <ReqInfo icon="calendar-outline" label="Dates" value={compDateLabel(c)} />
                <ReqInfo
                  icon="tennisball-outline"
                  label="Terrains bloqués"
                  value={c.courtNames?.length ? c.courtNames.join(', ') : 'Tout le club'}
                />
                <ReqInfo
                  icon="time-outline"
                  label="Créneaux bloqués"
                  value={c.timeSlots?.length ? c.timeSlots.join(' · ') : 'Toute la journée'}
                />
                <ReqInfo icon="people-outline" label="Capacité" value={`${c.slots} équipes`} />
                <ReqInfo icon="git-network-outline" label="Format" value={c.format} />
                <ReqInfo icon="podium-outline" label="Niveau" value={c.level} />
                <ReqInfo icon="cash-outline" label="Inscription" value={formatFee(c.fee)} />
                {c.reward.trim() ? <ReqInfo icon="gift-outline" label="Récompense" value={formatFee(c.reward)} /> : null}
              </View>

              {/* Contacter l'organisateur AVANT de valider (négocier une autre date, préciser…). */}
              {c.organizerPhone ? (
                <View style={{ marginTop: spacing.md }}>
                  <Button
                    size="sm"
                    label={`Contacter ${c.organizer}`}
                    icon="logo-whatsapp"
                    variant="secondary"
                    onPress={() =>
                      openWhatsApp(
                        c.organizerPhone ?? '',
                        `Bonjour, c’est ${club.name} (PadelConnect) au sujet de ta demande de tournoi « ${c.title} ».`,
                      )
                    }
                    full
                  />
                </View>
              ) : null}

              {rejectingId === c.id ? (
                <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                  <TextInput
                    value={rejectReason}
                    onChangeText={setRejectReason}
                    placeholder="Motif (ex. ces créneaux sont pris — possible du 12 au 14 après 18h)"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    style={styles.reasonInput}
                    accessibilityLabel="Motif du refus, montré à l’organisateur"
                  />
                  <Txt variant="small" color={colors.textFaint}>
                    Le motif est montré à l’organisateur : dis-lui quand c’est possible, il pourra recréer son tournoi.
                  </Txt>
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <Button
                      size="sm"
                      label="Annuler"
                      variant="ghost"
                      onPress={() => {
                        setRejectingId(null);
                        setRejectReason('');
                      }}
                    />
                    <View style={{ flex: 1 }}>
                      <Button
                        size="sm"
                        label={busyId === c.id ? 'Refus…' : 'Confirmer le refus'}
                        icon="close"
                        variant="danger"
                        disabled={busyId === c.id}
                        onPress={() => decide(c.id, false, rejectReason)}
                        full
                      />
                    </View>
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                  <Button
                    size="sm"
                    label="Refuser"
                    icon="close"
                    variant="danger"
                    disabled={busyId === c.id}
                    onPress={() => {
                      setRejectingId(c.id);
                      setRejectReason('');
                    }}
                  />
                  <View style={{ flex: 1 }}>
                    <Button
                      size="sm"
                      label={busyId === c.id ? 'Publication…' : 'Valider & publier'}
                      icon="checkmark"
                      disabled={busyId === c.id}
                      onPress={() => decide(c.id, true)}
                      full
                    />
                  </View>
                </View>
              )}
            </Card>
          ))}
        </View>
      ) : null}

      <SectionHeader title="Tournois du club" />
      <Button
        label="Créer un tournoi (club)"
        icon="trophy"
        variant="tournament"
        onPress={() => router.push(`/competition/nouvelle?as=club&clubId=${club.id}`)}
        full
      />
      <View style={{ marginTop: spacing.md }}>
        {publishedComps.length === 0 ? (
          <EmptyState icon="trophy-outline" title="Aucun tournoi" text="Crée le premier tournoi de ton club." tone="purple" />
        ) : (
          publishedComps.map((c) => {
            const finished = (c.endDateKey ?? c.dateKey) < todayKey;
            const result = state.compResults[c.id];
            return (
              <Card key={c.id} style={{ marginBottom: spacing.sm }}>
                {/* Zone titre NON cliquable : le gérant ne quitte plus l’Espace Club par erreur.
                    La fiche joueur s’ouvre uniquement via « Voir la fiche ». */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="h3" style={{ fontSize: 15 }}>
                      {c.title}
                    </Txt>
                    <Txt variant="muted">
                      {c.date} · {teamCount(c, false)}/{c.slots} équipes
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
                {finished && !result ? (
                  <View style={{ marginTop: spacing.sm }}>
                    <Button size="sm" label="Clôturer & désigner le vainqueur" icon="flag" onPress={() => onCloseComp(c.id)} full />
                  </View>
                ) : null}
                <View style={{ marginTop: spacing.sm }}>
                  <Button
                    size="sm"
                    label="Voir la fiche (vue joueur)"
                    icon="open-outline"
                    variant="ghost"
                    onPress={() => router.push(`/competition/${c.id}`)}
                    full
                  />
                </View>
              </Card>
            );
          })
        )}
      </View>
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
        Un tournoi bloque les terrains et créneaux que tu as choisis (ou tout le club si tu n’en précises aucun). Une fois la date passée,
        clôture-le en désignant l’équipe vainqueure : les joueurs inscrits sont mis à jour.
      </Txt>
    </>
  );
}

const styles = StyleSheet.create({
  reqInfoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  reasonInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    minHeight: 64,
    textAlignVertical: 'top',
  },
});
