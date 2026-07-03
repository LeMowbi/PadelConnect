import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, SectionHeader, Tag, Txt } from '@/components/ui';
import { dateKeyLabel } from '@/lib/days';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { fetchOpenMatches, joinOpenMatch, type OpenMatch } from '@/lib/openMatches';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

const PREVIEW = 4; // liste repliée par défaut (l'onglet Réserver reste centré sur la grille)

// MATCHS OUVERTS (45, modèle Playtomic) : des joueurs ont réservé leur terrain et cherchent
// du monde — un tap et tu es de la partie (place prise immédiatement, créateur prévenu).
export function OpenMatches() {
  const { state, refreshSession } = useApp();
  const toast = useToast();
  // undefined = chargement ; null = échec réseau (≠ [] = aucun match), convention §8.
  const [matches, setMatches] = useState<OpenMatch[] | null | undefined>(undefined);
  const [showAll, setShowAll] = useState(false);
  const [joining, setJoining] = useState<string | null>(null); // garde anti double-tap

  const load = async () => {
    const ms = await fetchOpenMatches();
    setMatches((cur) => ms ?? (cur === undefined ? null : cur)); // échec → on garde l'existant
  };
  useEffect(() => {
    let alive = true;
    // Même règle que load() : un échec tardif n'écrase pas une liste déjà rechargée.
    void fetchOpenMatches().then((ms) => alive && setMatches((cur) => ms ?? (cur === undefined ? null : cur)));
    // Retour au premier plan : les matchs ouverts bougent vite (places prises entre-temps).
    const sub = AppState.addEventListener('change', (st) => st === 'active' && void load());
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const join = async (m: OpenMatch) => {
    if (joining) return;
    setJoining(m.id);
    const res = await joinOpenMatch(m.id);
    setJoining(null);
    if (res === 'ok') {
      hapticSuccess();
      toast.show('Tu es de la partie 🎾 — retrouve le match dans « Mes réservations »');
      void load();
      void refreshSession(); // rattache le match à mon compte (participations)
      return;
    }
    hapticWarning();
    toast.show(
      res === 'full'
        ? 'Complet — un joueur a pris la dernière place.'
        : res === 'gone'
          ? 'Ce match n’est plus disponible.'
          : res === 'already'
            ? 'Tu es déjà dans ce match.'
            : res === 'own'
              ? 'C’est ton propre match 😊'
              : 'Connexion impossible — réessaie',
      { icon: 'alert-circle' },
    );
    if (res === 'full' || res === 'gone') void load(); // liste périmée → on la corrige
  };

  // Rien à afficher tant que le serveur n'a rien donné (pas de section vide qui encombre).
  if (!matches || matches.length === 0) return null;

  const shown = showAll ? matches : matches.slice(0, PREVIEW);
  const me = state.serverUserId;

  return (
    <View style={{ marginTop: spacing.lg }}>
      <SectionHeader title={`Matchs ouverts · ${matches.length}`} />
      <Card>
        <Txt variant="small" color={colors.textMuted}>
          Des joueurs ont déjà leur terrain et cherchent du monde — rejoins, c’est gratuit.
        </Txt>
        {shown.map((m, i) => {
          const mine = m.creatorId === me;
          const joined = state.participantReservationIds.includes(m.id);
          return (
            <View key={m.id}>
              {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : <View style={{ height: spacing.sm }} />}
              <View style={styles.row}>
                <View style={styles.when}>
                  <Txt variant="h3" style={{ textAlign: 'center' }}>
                    {m.time}
                  </Txt>
                  <Txt variant="small" color={colors.textMuted} style={{ textAlign: 'center' }}>
                    {dateKeyLabel(m.dateKey)}
                  </Txt>
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="body" numberOfLines={1} style={{ fontWeight: '600' }}>
                    {m.clubName}
                  </Txt>
                  <Txt variant="small" color={colors.textMuted} numberOfLines={1}>
                    par {m.creatorName}
                    {m.level ? ` · niveau ${m.level}` : ' · tous niveaux'} · {m.placesLeft} place{m.placesLeft > 1 ? 's' : ''}
                  </Txt>
                </View>
                {mine ? (
                  <Tag label="Ton match" tone="green" />
                ) : joined ? (
                  <Tag label="Inscrit ✓" tone="green" />
                ) : (
                  <Button
                    size="sm"
                    label={joining === m.id ? '…' : 'Rejoindre'}
                    icon="enter-outline"
                    onPress={() => void join(m)}
                    disabled={!!joining}
                  />
                )}
              </View>
            </View>
          );
        })}
        {matches.length > PREVIEW ? (
          <Button
            size="sm"
            variant="ghost"
            label={showAll ? 'Réduire' : `Voir tous les matchs ouverts (${matches.length})`}
            icon={showAll ? 'chevron-up' : 'chevron-down'}
            onPress={() => setShowAll((v) => !v)}
          />
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  when: {
    minWidth: 64,
    backgroundColor: colors.signatureSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
});
