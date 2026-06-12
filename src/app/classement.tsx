import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { PlayerSheet, type PlayerLike } from '@/components/PlayerSheet';
import { Screen } from '@/components/Screen';
import { Card, Divider, Tag, Txt } from '@/components/ui';
import { findClub } from '@/data/clubs';
import { seedPlayers } from '@/data/players';
import { initials } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

export default function ClassementScreen() {
  const { state } = useApp();
  const [open, setOpen] = useState<PlayerLike | null>(null);

  // Classement = joueurs seeds + toi, triés par niveau décroissant. Ton rang se
  // met à jour dès que ton niveau change (victoire / dernière place en tournoi).
  const me: PlayerLike & { level: number } = {
    id: 'me',
    name: state.account?.firstName ?? 'Toi',
    level: state.level,
    favoriteClubId: state.favoriteClubIds[0],
    isTeam: false,
  };
  const ranked = [...seedPlayers.map((p) => ({ ...p })), me].sort((a, b) => b.level - a.level);

  return (
    <Screen back title="Classement" subtitle="Les joueurs d'Abidjan, par niveau">
      <Card style={{ marginTop: spacing.sm }}>
        {ranked.map((p, i) => {
          const isMe = p.id === 'me';
          const club = p.favoriteClubId ? findClub(p.favoriteClubId, state.customClubs, state.clubInfo) : undefined;
          return (
            <View key={p.id}>
              {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
              <Pressable
                disabled={isMe}
                onPress={() => setOpen({ ...p })}
                style={[styles.row, isMe && styles.me]}
              >
                <Txt variant="h3" color={i < 3 ? colors.amber : colors.textMuted} style={{ width: 28, textAlign: 'center' }}>
                  {i + 1}
                </Txt>
                <View style={styles.avatar}>
                  <Txt variant="small" color={colors.blue} style={{ fontWeight: '800' }}>
                    {initials(p.name)}
                  </Txt>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Txt variant="body" style={{ fontWeight: isMe ? '800' : '600' }}>
                      {p.name}
                    </Txt>
                    {isMe ? <Tag label="Toi" tone="gold" /> : null}
                  </View>
                  {club ? (
                    <Txt variant="small" color={colors.textFaint} numberOfLines={1}>
                      {club.name}
                    </Txt>
                  ) : null}
                </View>
                <Txt variant="price" style={{ fontSize: 16 }}>
                  {p.level.toFixed(2)}
                </Txt>
              </Pressable>
            </View>
          );
        })}
      </Card>
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.md, textAlign: 'center' }}>
        Le niveau évolue uniquement par les tournois officiels : +0.50 en cas de victoire, −0.25 pour la dernière place.
      </Txt>

      <PlayerSheet player={open} onClose={() => setOpen(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  me: { backgroundColor: colors.goldSoft, borderRadius: radius.md, paddingHorizontal: spacing.sm, marginHorizontal: -spacing.sm },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
