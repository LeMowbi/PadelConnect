import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar } from './Avatar';
import { BottomSheet } from './BottomSheet';
import { useToast } from './Toast';
import { Button, Tag, Txt } from './ui';
import { findClub } from '@/data/clubs';
import { levelLabel } from '@/lib/format';
import { fetchPublicReliability, type PublicReliability } from '@/lib/social';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

// Nombre de parties minimum avant d’afficher le badge de fiabilité : un nouveau joueur
// n’est pas pénalisé par une poignée de réservations (règle du chantier v3, lot A).
const RELIABILITY_MIN_PLAYED = 5;

// Données minimales d’un joueur (ou d’une équipe inscrite) pour la mini-fiche.
export type PlayerLike = {
  id: string;
  name: string;
  level?: number;
  tournamentsPlayed?: number;
  tournamentsWon?: number;
  favoriteClubId?: string;
  isTeam?: boolean;
};

// Prénom affiché dans les messages (« Tu suis maintenant Awa ») — les noms serveur peuvent
// porter un nom de famille, on n’en garde que le premier mot.
function firstNameOf(name: string): string {
  return name.trim().split(' ')[0] || name;
}

// Mini-fiche joueur en bottom sheet : niveau, fiabilité, stats, club favori, joueur suivi.
export function PlayerSheet({ player, onClose }: { player: PlayerLike | null; onClose: () => void }) {
  const { state, toggleFavoritePlayer } = useApp();
  const toast = useToast();
  const club = player?.favoriteClubId ? findClub(player.favoriteClubId, state.customClubs, state.clubInfo) : undefined;
  // Fiabilité publique par compte (agrégat serveur). Un id ABSENT = pas encore chargé ou échec
  // réseau → aucun badge (convention §8 : on n’invente jamais un chiffre).
  const [reliability, setReliability] = useState<Record<string, PublicReliability>>({});
  const [following, setFollowing] = useState(false); // garde anti double-tap sur le cœur

  // Une équipe de tournoi (`isTeam`) n’est pas un compte : ni fiabilité, ni suivi.
  const playerId = player && !player.isTeam ? player.id : null;
  useEffect(() => {
    if (!playerId) return;
    let alive = true;
    // setState APRÈS await (React Compiler) : jamais de setState synchrone dans l’effet.
    void fetchPublicReliability([playerId]).then((res) => {
      if (!alive || !res) return; // null = échec réseau : on garde ce qu’on a déjà
      setReliability((cur) => ({ ...cur, ...res }));
    });
    return () => {
      alive = false;
    };
  }, [playerId]);

  // Suivre / ne plus suivre : écriture honnête (le store attend le serveur), toast dans tous les cas.
  const toggleFollow = async (p: PlayerLike) => {
    if (following) return;
    setFollowing(true);
    const res = await toggleFavoritePlayer(p.id);
    setFollowing(false);
    const first = firstNameOf(p.name);
    toast.show(
      res === 'added'
        ? `Tu suis maintenant ${first}`
        : res === 'removed'
          ? `Tu ne suis plus ${first}`
          : res === 'not_found'
            ? 'Compte introuvable.'
            : 'Connexion impossible — réessaie',
      res === 'added' || res === 'removed' ? { icon: 'heart' } : { icon: 'alert-circle' },
    );
  };

  const rel = playerId ? reliability[playerId] : undefined;
  const reliable = rel && rel.played >= RELIABILITY_MIN_PLAYED ? rel : undefined;
  // Cœur visible seulement si je suis connecté, sur la fiche d’un AUTRE compte joueur.
  const canFollow = !!playerId && !!state.serverUserId && playerId !== state.serverUserId;
  const followed = !!playerId && state.favoritePlayerIds.includes(playerId);

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
              <View style={styles.badges}>
                {player.level !== undefined ? <Tag label={`Niveau ${player.level.toFixed(2)}`} tone="amber" icon="ribbon" /> : null}
                {/* Fiabilité PUBLIQUE : uniquement l’agrégat de présence (le détail reste au club). */}
                {reliable ? <Tag label={`Fiable · ${reliable.presencePct} %`} tone="green" icon="shield-checkmark-outline" /> : null}
              </View>
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

          {/* Joueurs favoris (80) : les matchs ouverts des joueurs suivis remontent en tête. */}
          {canFollow ? (
            <Button
              label={followed ? 'Suivi ✓' : 'Suivre'}
              icon={followed ? 'heart' : 'heart-outline'}
              variant="secondary"
              onPress={() => void toggleFollow(player)}
              disabled={following}
              accessibilityLabel={followed ? `Ne plus suivre ${firstNameOf(player.name)}` : `Suivre ${firstNameOf(player.name)}`}
              full
            />
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
  badges: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  stat: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
});
