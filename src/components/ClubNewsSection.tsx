import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, View } from 'react-native';
import { Card, SectionHeader, Txt } from '@/components/ui';
import { fetchClubNews, type ClubNews } from '@/lib/clubNews';
import { alertAsync } from '@/lib/confirm';
import { dateKeyLabel, dayKey } from '@/lib/days';
import { hapticLight } from '@/lib/haptics';
import { colors, radius, spacing } from '@/theme';

const PREVIEW = 3; // liste repliée par défaut (la fiche reste centrée sur la réservation)

// Date de publication (ms) → libellé court FR en UTC, comme partout ailleurs (jamais le fuseau
// de l'appareil) ; repli silencieux si la date est invalide.
function newsDate(ms: number): string {
  return Number.isFinite(ms) ? dateKeyLabel(dayKey(new Date(ms))) : '';
}

// ANNONCES CLUB (20, fiche club) : le gérant publie sur SA fiche (promo, horaires exceptionnels,
// travaux…) ; les suiveurs du club reçoivent un push si la case l'était à la création.
// Section entièrement MASQUÉE tant qu'il n'y a aucune annonce — jamais d'en-tête suivi de vide.
// Convention §8 : un échec réseau ne vide jamais la liste déjà affichée.
export function ClubNewsSection({ clubId }: { clubId: string }) {
  // undefined = chargement ; null = échec réseau (≠ [] = aucune annonce).
  const [news, setNews] = useState<ClubNews[] | null | undefined>(undefined);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let alive = true;
    // setState APRÈS await (règle React Compiler) : jamais de setState synchrone dans l'effet.
    const load = () =>
      void fetchClubNews(clubId).then((rows) => {
        if (!alive) return;
        setNews((cur) => rows ?? (cur === undefined ? null : cur));
      });
    load();
    // Retour au premier plan : le club a pu publier une annonce entre-temps.
    const sub = AppState.addEventListener('change', (st) => st === 'active' && load());
    return () => {
      alive = false;
      sub.remove();
    };
  }, [clubId]);

  // Repli web-safe (idiome AgendaSection) : openURL rejette si le lien est invalide ou si
  // aucune app ne sait l'ouvrir.
  const openLink = (link: string) => {
    hapticLight();
    void Linking.openURL(link).catch(() => alertAsync('Lien indisponible', 'Impossible d’ouvrir ce lien pour le moment.'));
  };

  // Chargement, échec réseau ou aucune annonce → rien du tout sur la fiche (section discrète).
  if (!news || news.length === 0) return null;
  const shown = showAll ? news : news.slice(0, PREVIEW);

  return (
    <View style={{ marginTop: spacing.lg }}>
      <SectionHeader
        title={`Annonces · ${news.length}`}
        actionLabel={news.length > PREVIEW ? (showAll ? 'Réduire' : `Voir tout (${news.length})`) : undefined}
        onAction={news.length > PREVIEW ? () => setShowAll((v) => !v) : undefined}
      />
      <View style={{ gap: spacing.sm }}>
        {shown.map((n) => (
          <Card key={n.id}>
            <View style={styles.head}>
              <View style={styles.icon}>
                <Ionicons name="megaphone" size={18} color={colors.signature} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="body" style={{ fontWeight: '700' }} numberOfLines={2}>
                  {n.title}
                </Txt>
                <Txt variant="small" color={colors.textFaint}>
                  {newsDate(n.createdAt)}
                </Txt>
              </View>
            </View>
            {n.body ? (
              <Txt variant="body" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
                {n.body}
              </Txt>
            ) : null}
            {n.link ? (
              <Pressable
                onPress={() => openLink(n.link)}
                style={({ pressed }) => [styles.action, pressed && { opacity: 0.75 }]}
                accessibilityRole="link"
                accessibilityLabel={`En savoir plus sur ${n.title}`}
              >
                <Ionicons name="open-outline" size={14} color={colors.signature} />
                <Txt variant="small" color={colors.signature} style={{ fontWeight: '700' }}>
                  En savoir plus
                </Txt>
              </Pressable>
            ) : null}
          </Card>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.signatureSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // minHeight 44 : cible tactile confortable (a11y), même règle que l'agenda de l'accueil.
  action: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
});
