import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { SkeletonLines } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, SectionHeader, Tag, Txt } from '@/components/ui';
import { durationLabel } from '@/lib/courtSchedule';
import { dateKeyLabel } from '@/lib/days';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { levelInRange, levelRangeText } from '@/lib/levelRange';
import { fetchOpenMatches, joinOpenMatch, type OpenMatch } from '@/lib/openMatches';
import { fetchPublicReliability, type PublicReliability } from '@/lib/social';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

const PREVIEW = 4; // liste repliée par défaut (l'onglet Réserver reste centré sur la grille)
// Badge de fiabilité affiché seulement à partir de 5 parties : un nouveau joueur n'est pas
// pénalisé par une poignée de réservations (même règle que PlayerSheet).
const RELIABILITY_MIN_PLAYED = 5;

// MATCHS OUVERTS (45, modèle Playtomic) : des joueurs ont réservé leur terrain et cherchent
// du monde — un tap et tu es de la partie (place prise immédiatement, créateur prévenu).
export function OpenMatches({ refreshToken, full = false }: { refreshToken?: number; full?: boolean } = {}) {
  const { state, refreshSession, submitSupportMessage, blockUserAccount } = useApp();
  const toast = useToast();
  // undefined = chargement ; null = échec réseau (≠ [] = aucun match), convention §8.
  const [matches, setMatches] = useState<OpenMatch[] | null | undefined>(undefined);
  const [showAll, setShowAll] = useState(false);
  const [joining, setJoining] = useState<string | null>(null); // garde anti double-tap
  // Modération UGC (App Store 1.2) : chaque match d'un AUTRE joueur porte « Signaler / Bloquer »
  // (le prénom du créateur est un contenu joueur) — feuille ouverte par le bouton « ⋯ » de la ligne.
  const [moderating, setModerating] = useState<OpenMatch | null>(null);
  const [moderationBusy, setModerationBusy] = useState(false); // garde anti double-tap (2 actions)
  // Fiabilité publique des CRÉATEURS (badge « Fiable · N % »), par compte. Un id absent = pas
  // encore chargé ou échec réseau → aucun badge (convention §8 : jamais de chiffre inventé).
  const [reliability, setReliability] = useState<Record<string, PublicReliability>>({});

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
  }, [state.serverUserId]);
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
    // 'level' (81) : le créateur a fixé une fourchette de niveau et le serveur m'a refusé —
    // on redit la fourchette DEMANDÉE (la garde est serveur, jamais un simple masquage d'UI).
    const rangeText = levelRangeText(m.levelMin, m.levelMax);
    toast.show(
      res === 'full'
        ? 'Complet — un joueur a pris la dernière place.'
        : res === 'gone'
          ? 'Ce match n’est plus disponible.'
          : res === 'already'
            ? 'Tu es déjà dans ce match.'
            : res === 'own'
              ? 'C’est ton propre match 😊'
              : res === 'level'
                ? rangeText
                  ? `Ce match cherche un niveau ${rangeText}.`
                  : 'Ce match cherche un niveau précis.'
                : 'Connexion impossible — réessaie',
      { icon: 'alert-circle' },
    );
    if (res === 'full' || res === 'gone') void load(); // liste périmée → on la corrige
  };

  // Signaler le match à l'opérateur : passe par le canal support existant (section
  // « Signalements » de l'espace opérateur, même circuit que l'aide) — pas de nouveau SQL.
  const reportMatch = async (m: OpenMatch) => {
    if (moderationBusy) return;
    setModerationBusy(true);
    const res = await submitSupportMessage(
      `[Signalement match ouvert] Match de ${m.creatorName} — ${m.clubName}, ${dateKeyLabel(m.dateKey)} à ${m.time}. Contenu inapproprié à vérifier.`,
    );
    setModerationBusy(false);
    setModerating(null);
    toast.show(
      res.ok ? 'Match signalé — merci, on le vérifie.' : 'Signalement impossible — réessaie.',
      res.ok ? undefined : { icon: 'alert-circle' },
    );
  };
  // Bloquer le créateur : ses matchs ouverts (et ses avis) disparaissent aussitôt de ma vue —
  // via le miroir du store (persisté), pas un état local qu'un échec réseau réinitialiserait.
  const blockCreator = async (m: OpenMatch) => {
    if (moderationBusy) return;
    setModerationBusy(true);
    const ok = await blockUserAccount(m.creatorId);
    setModerationBusy(false);
    setModerating(null);
    toast.show(
      ok ? `${m.creatorName} bloqué — tu ne verras plus ses matchs.` : 'Blocage impossible — réessaie.',
      ok ? undefined : { icon: 'alert-circle' },
    );
  };

  // On masque les matchs des comptes que j'ai bloqués (modération UGC — prénom du créateur
  // affiché). Miroir du STORE : persisté, chargé en session et au premier plan (convention §8).
  // Calculé AVANT les retours anticipés : les hooks qui suivent doivent rester inconditionnels.
  const visible = (matches ?? []).filter((m) => !state.blockedUserIds.includes(m.creatorId));
  // UN SEUL appel groupé pour tous les créateurs visibles (clé = ids distincts triés : l'appel
  // ne repart que si la liste des créateurs change réellement).
  const creatorKey = Array.from(new Set(visible.map((m) => m.creatorId)))
    .sort()
    .join(',');
  useEffect(() => {
    if (!creatorKey) return;
    let alive = true;
    // setState APRÈS await (React Compiler) : jamais de setState synchrone dans l'effet.
    void fetchPublicReliability(creatorKey.split(',')).then((res) => {
      if (!alive || !res) return; // null = échec réseau : on garde ce qu'on a déjà
      setReliability((cur) => ({ ...cur, ...res }));
    });
    return () => {
      alive = false;
    };
  }, [creatorKey]);

  // Chargement / hors-ligne : sur l'ÉCRAN DÉDIÉ (full), une page vide serait illisible — on
  // affiche un squelette puis, en échec réseau, une carte « Réessayer » (motif classement.tsx).
  // En section d'accueil, on reste discret : rien (pas de section fantôme).
  if (matches === undefined) {
    return full ? (
      <View style={{ marginTop: spacing.lg }}>
        <SectionHeader title="Matchs ouverts" />
        <Card>
          <SkeletonLines lines={5} />
        </Card>
      </View>
    ) : null;
  }
  if (matches === null) {
    return full ? (
      <View style={{ marginTop: spacing.lg }}>
        <SectionHeader title="Matchs ouverts" />
        <Card style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
          <Ionicons name="cloud-offline-outline" size={24} color={colors.textFaint} />
          <Txt variant="muted" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
            Impossible de charger les matchs — vérifie ta connexion.
          </Txt>
          <View style={{ marginTop: spacing.md }}>
            <Button size="sm" label="Réessayer" icon="refresh" variant="secondary" onPress={() => void load()} />
          </View>
        </Card>
      </View>
    ) : null;
  }

  // AUCUN match ouvert : la section reste VISIBLE avec le mode d'emploi — sinon la
  // fonctionnalité est introuvable tant que personne n'a créé le premier match (retour porteur).
  if (visible.length === 0) {
    return (
      <View style={{ marginTop: spacing.lg }}>
        <SectionHeader title="Matchs ouverts" />
        <Card style={styles.emptyRow}>
          <View style={styles.emptyIcon}>
            <Ionicons name="people-outline" size={20} color={colors.signature} />
          </View>
          <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
            Aucun match ouvert pour l’instant. Réserve un terrain et coche « Ouvrir ce match aux autres joueurs » : ta partie s’affichera
            ici et n’importe quel joueur pourra rejoindre les places restantes.
          </Txt>
        </Card>
      </View>
    );
  }

  // Joueurs favoris (80) : les matchs des joueurs que je suis passent EN TÊTE — partition
  // stable (l'ordre serveur, par date, est conservé dans chaque groupe).
  const favs = state.favoritePlayerIds;
  const ordered = favs.length
    ? [...visible.filter((m) => favs.includes(m.creatorId)), ...visible.filter((m) => !favs.includes(m.creatorId))]
    : visible;
  // Sur l'écran dédié (full), on montre TOUT ; en section d'accueil, un aperçu repliable.
  const shown = full || showAll ? ordered : ordered.slice(0, PREVIEW);
  const me = state.serverUserId;

  return (
    <View style={{ marginTop: spacing.lg }}>
      <SectionHeader title={`Matchs ouverts · ${visible.length}`} />
      <Card>
        <Txt variant="small" color={colors.textMuted}>
          Des joueurs ont déjà leur terrain et cherchent du monde — le prix du terrain se partage entre les joueurs, sur place.
        </Txt>
        {shown.map((m, i) => {
          const mine = m.creatorId === me;
          const joined = state.participantReservationIds.includes(m.id);
          const followed = favs.includes(m.creatorId);
          const rel = reliability[m.creatorId];
          const reliable = rel && rel.played >= RELIABILITY_MIN_PLAYED ? rel : undefined;
          // Fourchette de niveau (81) : '' = ouvert à tous. `outOfRange` est le MIROIR EXACT de la
          // garde serveur (join → 'level') — on grise « Rejoindre » avec la raison plutôt que de
          // laisser le joueur se faire refuser après coup. Sans compte, on ne présume rien.
          const rangeText = levelRangeText(m.levelMin, m.levelMax);
          const outOfRange = !!me && !levelInRange(state.level, m.levelMin, m.levelMax);
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
                  {/* Format scannable (badge) + urgence corail « dernière place » (même idiome que
                      les tournois, CompetitionCard) — plus lisible qu'une phrase grise noyée. */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 }}>
                    {/* Joueur suivi : la raison pour laquelle ce match est remonté en tête. */}
                    {followed ? <Tag label="Partenaire suivi" tone="signature" icon="heart" /> : null}
                    <Tag label={m.capacity === 2 ? '1v1' : '2v2'} tone={m.capacity === 2 ? 'signature' : 'purple'} />
                    <Tag label={durationLabel(m.durationMin)} tone="neutral" />
                    {/* Fourchette de niveau demandée par le créateur (81) — barrière RÉELLE. */}
                    {rangeText ? <Tag label={`Niveau ${rangeText}`} tone="amber" icon="stats-chart-outline" /> : null}
                    {/* Fiabilité PUBLIQUE du créateur (agrégat de présence, jamais le détail). */}
                    {reliable ? <Tag label={`Fiable · ${reliable.presencePct} %`} tone="green" icon="shield-checkmark-outline" /> : null}
                    {m.placesLeft === 1 ? <Tag label="Dernière place !" tone="coral" icon="flame" /> : null}
                  </View>
                  <Txt variant="small" color={colors.textMuted} numberOfLines={1} style={{ marginTop: 2 }}>
                    par {m.creatorName}
                    {/* Fourchette affichée en badge : le niveau ne se répète pas ici. Sinon, on
                        garde l'ancien texte libre (matchs créés avant la 81) ou « tous niveaux ». */}
                    {rangeText ? '' : m.level ? ` · niveau ${m.level}` : ' · tous niveaux'}
                    {m.placesLeft > 1 ? ` · ${m.placesLeft} places` : ''}
                  </Txt>
                </View>
                {mine ? (
                  <Tag label="Ton match" tone="green" />
                ) : joined ? (
                  <Tag label="Inscrit ✓" tone="green" />
                ) : (
                  <Button
                    size="sm"
                    label={joining === m.id ? '…' : outOfRange ? `Niveau ${rangeText} demandé` : 'Rejoindre'}
                    icon={outOfRange ? 'lock-closed' : 'enter-outline'}
                    onPress={() => void join(m)}
                    disabled={!!joining || outOfRange}
                    accessibilityLabel={
                      outOfRange
                        ? `Rejoindre impossible : ce match cherche un niveau ${rangeText}`
                        : `Rejoindre le match de ${m.creatorName}`
                    }
                  />
                )}
                {!mine && me ? (
                  <Pressable
                    onPress={() => setModerating(m)}
                    hitSlop={14}
                    accessibilityRole="button"
                    accessibilityLabel={`Signaler ce match ou bloquer ${m.creatorName}`}
                  >
                    <Ionicons name="ellipsis-vertical" size={16} color={colors.textFaint} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}
        {!full && visible.length > PREVIEW ? (
          <Button
            size="sm"
            variant="ghost"
            label={showAll ? 'Réduire' : `Voir tous les matchs ouverts (${visible.length})`}
            icon={showAll ? 'chevron-up' : 'chevron-down'}
            onPress={() => setShowAll((v) => !v)}
          />
        ) : null}
      </Card>

      {/* Feuille Signaler / Bloquer — modération UGC exigée là où le contenu apparaît */}
      <BottomSheet
        visible={moderating !== null}
        title="Signaler ou bloquer"
        subtitle={moderating ? `Match de ${moderating.creatorName} — ${moderating.clubName}` : undefined}
        onClose={() => setModerating(null)}
      >
        <Txt variant="body" color={colors.textMuted}>
          Un contenu te semble déplacé ? Signale le match (vérifié sous 24 h) ou bloque son créateur : ses matchs ouverts et ses avis
          disparaîtront de ton app.
        </Txt>
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          <Button
            label="Signaler ce match"
            icon="flag-outline"
            variant="secondary"
            onPress={() => moderating && void reportMatch(moderating)}
            disabled={moderationBusy}
            full
          />
          <Button
            label={moderating ? `Bloquer ${moderating.creatorName}` : 'Bloquer'}
            icon="hand-left-outline"
            variant="danger"
            onPress={() => moderating && void blockCreator(moderating)}
            disabled={moderationBusy}
            full
          />
        </View>
      </BottomSheet>
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
