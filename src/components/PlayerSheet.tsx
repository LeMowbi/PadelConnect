import { StyleSheet, View } from 'react-native';
import { Avatar } from './Avatar';
import { BottomSheet } from './BottomSheet';
import { Tag, Txt } from './ui';
import { findClub } from '@/data/clubs';
import { levelLabel } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

// Données minimales d'un joueur (ou d'une équipe inscrite) pour la mini-fiche.
export type PlayerLike = {
  id: string;
  name: string;
  level?: number;
  tournamentsPlayed?: number;
  tournamentsWon?: number;
  favoriteClubId?: string;
  isTeam?: boolean;
};

// Mini-fiche joueur en bottom sheet : niveau, stats, club favori.
export function PlayerSheet({ player, onClose }: { player: PlayerLike | null; onClose: () => void }) {
  const { state } = useApp();
  const club = player?.favoriteClubId ? findClub(player.favoriteClubId, state.customClubs, state.clubInfo) : undefined;

  return (
    <BottomSheet
      visible={!!player}
      title={player?.name ?? ''}
      subtitle={
        player?.isTeam
          ? 'Équipe inscrite'
          : player?.level !== undefined
            ? `${levelLabel(player.level)} · Niveau ${player.level.toFixed(2)}`
            : undefined
      }
      onClose={onClose}
    >
      {player ? (
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Avatar name={player.name} size={48} />
            <View style={{ flex: 1 }}>
              {player.level !== undefined ? <Tag label={`Niveau ${player.level.toFixed(2)}`} tone="amber" icon="ribbon" /> : null}
              {club ? (
                <Txt variant="small" color={colors.textMuted} style={{ marginTop: 4 }}>
                  Club favori : {club.name}
                </Txt>
              ) : null}
            </View>
          </View>

          {!player.isTeam && (player.tournamentsPlayed !== undefined || player.tournamentsWon !== undefined) ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Stat value={player.tournamentsPlayed ?? 0} label="Tournois joués" />
              <Stat value={player.tournamentsWon ?? 0} label="Tournois gagnés" />
            </View>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Txt variant="h2" color={colors.purple}>
        {value}
      </Txt>
      <Txt variant="small" color={colors.textMuted} style={{ textAlign: 'center' }}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  stat: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
});
