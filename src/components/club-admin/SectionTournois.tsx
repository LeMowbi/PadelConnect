import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Button, Card, EmptyState, IconCircle, SectionHeader, Tag, Txt } from '@/components/ui';
import { type Club } from '@/data/clubs';
import { isTournamentPublic, teamCount, type Competition } from '@/data/competitions';
import { dayKey } from '@/lib/days';
import { useApp } from '@/store/AppContext';
import { colors, spacing } from '@/theme';

export function SectionTournois({ club, comps, onCloseComp }: { club: Club; comps: Competition[]; onCloseComp: (id: string) => void }) {
  const router = useRouter();
  const { state, approveCompetition, deleteCompetition } = useApp();

  // Demandes de tournoi : créés par un joueur, en attente de validation de CE club.
  const tournamentRequests = state.myCompetitions.filter(
    (c) => c.clubId === club.id && c.status === 'pending' && c.organizerType === 'joueur',
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
            Un tournoi créé par un joueur n'est visible qu'après ta validation.
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
                <Button size="sm" label="Refuser" icon="close" variant="danger" onPress={() => deleteCompetition(c.id)} />
                <View style={{ flex: 1 }}>
                  <Button size="sm" label="Valider & publier" icon="checkmark" onPress={() => approveCompetition(c.id)} full />
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
            const finished = c.dateKey < todayKey;
            const result = state.compResults[c.id];
            return (
              <Card key={c.id} style={{ marginBottom: spacing.sm }}>
                {/* Zone titre NON cliquable : le gérant ne quitte plus l'Espace Club par erreur.
                    La fiche joueur s'ouvre uniquement via « Voir la fiche ». */}
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
        Un tournoi bloque automatiquement tes terrains ce jour-là. Une fois la date passée, clôture-le en désignant l'équipe vainqueure :
        les joueurs inscrits sont mis à jour.
      </Txt>
    </>
  );
}
