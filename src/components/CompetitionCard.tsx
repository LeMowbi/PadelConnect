import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Card, Tag, Txt } from './ui';
import { compDateLabel, compFill, formatFee, isCompFinished, teamCount, type Competition } from '@/data/competitions';
import { dayKey } from '@/lib/days';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

export function CompetitionCard({ comp }: { comp: Competition }) {
  const router = useRouter();
  const { state } = useApp();
  const byClub = comp.organizerType === 'club';
  // Tournoi officiel PADELCONNECT (organisé par l'opérateur, validé par le club hôte) :
  // présentation PREMIUM — bandeau doré + liseré — pour accueillir demain les tournois
  // officiels externes (FIP…) par le même canal.
  const byPadel = comp.organizerType === 'operator';
  const registered = !!state.compRegistrations[comp.id];
  const teams = teamCount(comp, registered);
  const { left, pct } = compFill(comp, teams);
  const full = left === 0;
  // Remplissage animé de la barre (0 → pct) — se rejoue si le nombre d’équipes change.
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fill, { toValue: pct, duration: 600, useNativeDriver: false }).start();
  }, [pct, fill]);
  const fillWidth = fill.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  // Cycle de vie : à venir → terminé (jour STRICTEMENT passé) → clôturé (vainqueur désigné).
  const finished = isCompFinished(comp, dayKey(new Date()));
  const result = state.compResults[comp.id];
  const mine = state.officialResults.find((o) => o.compId === comp.id);

  return (
    <Card onPress={() => router.push(`/competition/${comp.id}`)} style={[{ marginBottom: spacing.md }, byPadel && styles.padelCard]}>
      {byPadel ? (
        <View style={styles.padelBanner}>
          <Ionicons name="shield-checkmark" size={13} color={colors.amberDark} />
          <Txt variant="label" color={colors.amberDark}>
            TOURNOI OFFICIEL PADELCONNECT
          </Txt>
        </View>
      ) : null}
      <View style={styles.top}>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', flex: 1 }}>
          <Tag
            label={byClub ? `Club · ${comp.organizer}` : byPadel ? comp.organizer : `Joueur · ${comp.organizer}`}
            tone={byClub ? 'signature' : byPadel ? 'amber' : 'green'}
            icon={byClub ? 'business' : byPadel ? 'star' : 'person'}
          />
          {/* Officiel = compte pour le niveau ; sinon « Amical » (entre joueurs), dit explicitement.
              (Le bandeau doré porte déjà « officiel » pour les tournois PadelConnect.) */}
          {comp.official ? (
            byPadel ? null : (
              <Tag label="Officiel" tone="amber" icon="shield-checkmark" />
            )
          ) : (
            <Tag label="Amical" tone="neutral" icon="happy-outline" />
          )}
          {comp.status === 'pending' ? <Tag label="En attente" tone="coral" icon="hourglass-outline" /> : null}
          {comp.status === 'rejected' ? <Tag label="Refusé" tone="neutral" icon="close-circle-outline" /> : null}
        </View>
        <Txt variant="muted">{compDateLabel(comp)}</Txt>
      </View>

      <Txt variant="h3" style={{ marginTop: spacing.sm }}>
        {comp.title}
      </Txt>

      {comp.reward.trim() ? (
        <View style={styles.reward}>
          <Ionicons name="gift-outline" size={16} color={colors.purple} />
          <Txt variant="small" color={colors.purpleDark} style={{ flex: 1, fontWeight: '600' }}>
            {formatFee(comp.reward)}
          </Txt>
        </View>
      ) : null}

      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, { width: fillWidth }]} />
      </View>

      <View style={styles.footer}>
        <Txt variant="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
          {teams}/{comp.slots} équipes · {formatFee(comp.fee)}
        </Txt>
        {result ? (
          mine?.result === 'win' ? (
            <Tag label="Vainqueur !" tone="amber" icon="trophy" />
          ) : mine?.result === 'last' ? (
            <Tag label="Fin de tableau" tone="coral" icon="arrow-down" />
          ) : registered ? (
            <Tag label="Participé" tone="signature" icon="checkmark" />
          ) : (
            <Tag label={`Vainqueur : ${result.winner}`} tone="neutral" icon="trophy" />
          )
        ) : finished ? (
          <Tag label={registered ? 'Résultats à venir' : 'Terminé'} tone="neutral" icon="hourglass-outline" />
        ) : registered ? (
          <Tag label="Inscrit ✓" tone="green" />
        ) : full ? (
          <Tag label="Complet" tone="danger" />
        ) : left <= 3 ? (
          <Tag label={`Plus que ${left} place${left > 1 ? 's' : ''} !`} tone="coral" icon="flame" />
        ) : (
          <Tag label={`${left} places`} tone="purple" />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // Habillage premium des tournois officiels PadelConnect : liseré + bandeau dorés.
  padelCard: { borderWidth: 1.5, borderColor: colors.amber },
  padelBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.amberSoft,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  reward: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: colors.purpleSoft,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  barTrack: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginTop: spacing.md, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.purple },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
});
