import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useToast } from '@/components/Toast';
import { Button, Card, EmptyState, IconCircle, SectionHeader, Tag, Txt } from '@/components/ui';
import { type Club } from '@/data/clubs';
import { isTournamentPublic, teamCount, type Competition } from '@/data/competitions';
import { dayKey } from '@/lib/days';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { colors, spacing } from '@/theme';

export function SectionTournois({ club, comps, onCloseComp }: { club: Club; comps: Competition[]; onCloseComp: (id: string) => void }) {
  const router = useRouter();
  const { state, approveCompetition, rejectCompetition } = useApp();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null); // demande en cours de traitement (anti double-tap)

  // Valider/refuser une demande : on ATTEND le serveur et on confirme (ou signale l’échec) —
  // avant, un échec réseau était totalement silencieux et le gérant croyait avoir publié.
  const decide = async (id: string, approve: boolean) => {
    if (busyId) return;
    setBusyId(id);
    const ok = approve ? await approveCompetition(id) : await rejectCompetition(id);
    setBusyId(null);
    if (ok) {
      hapticSuccess();
      toast.show(approve ? 'Tournoi validé — il est maintenant visible ✓' : 'Demande refusée.');
    } else {
      hapticWarning();
      // Deux causes possibles côté serveur : réseau, ou des réservations occupent déjà la plage (37).
      toast.show(
        approve ? 'Publication impossible — des réservations occupent peut-être déjà ces créneaux.' : 'Action impossible — réessaie.',
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
                  <Txt variant="muted">
                    par {c.organizer} · {c.date} · {c.slots} équipes
                  </Txt>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                <Button
                  size="sm"
                  label="Refuser"
                  icon="close"
                  variant="danger"
                  disabled={busyId === c.id}
                  onPress={() => decide(c.id, false)}
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
          <EmptyState icon="trophy-outline" title="Aucun tournoi" text="Crée le premier tournoi de ton club." />
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
