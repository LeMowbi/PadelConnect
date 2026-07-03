import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
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
export function OpenMatches({ refreshToken, full = false }: { refreshToken?: number; full?: boolean } = {}) {
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
  // Tiré-pour-rafraîchir depuis l'écran parent (Réserver) : PAS de remontage via `key` — juste
  // ce token qui déclenche un load(). load() garde déjà l'existant en cas d'échec (§8), donc un
  // pull hors-ligne ne fait plus disparaître la section, et en ligne il n'y a plus de clignotement.
  const skipFirst = useRef(true); // le premier chargement est déjà fait par l'effet de montage
  useEffect(() => {
    if (refreshToken === undefined) return;
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    void load();
    // load() est redéfini à chaque rendu mais son comportement est stable (mêmes setState) —
    // seul refreshToken doit déclencher un nouvel appel.
  }, [refreshToken]);

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

  // Chargement ou hors-ligne sans donnée : rien (pas de section fantôme).
  if (matches === undefined || matches === null) return null;

  // AUCUN match ouvert : la section reste VISIBLE avec le mode d'emploi — sinon la
  // fonctionnalité est introuvable tant que personne n'a créé le premier match (retour porteur).
  if (matches.length === 0) {
    return (
      <View style={{ marginTop: spacing.lg }}>
        <SectionHeader title="Matchs ouverts" />
        <Card style={styles.emptyRow}>
          <View style={styles.emptyIcon}>
            <Ionicons name="people-outline" size={20} color={colors.signature} />
          </View>
          <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
            Aucun match ouvert pour l’instant. Réserve un terrain et coche « Ouvrir ce match aux autres joueurs » : ta partie s’affichera
            ici et n’importe quel joueur pourra rejoindre les places restantes — gratuit.
          </Txt>
        </Card>
      </View>
    );
  }

  // Sur l'écran dédié (full), on montre TOUT ; en section d'accueil, un aperçu repliable.
  const shown = full || showAll ? matches : matches.slice(0, PREVIEW);
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
        {!full && matches.length > PREVIEW ? (
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
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.signatureSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  when: {
    minWidth: 64,
    backgroundColor: colors.signatureSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
});
