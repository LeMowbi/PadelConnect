import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { Button, Card, EmptyState, Tag, Txt } from '@/components/ui';
import { getClub } from '@/data/clubs';
import { coachClubName, getCoach } from '@/data/coaches';
import { callNumber, openWhatsApp } from '@/lib/contact';
import { initials } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, font, radius, shadows, spacing } from '@/theme';

export default function CoachDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { state } = useApp();
  const coach = getCoach(id);

  if (!coach) {
    return (
      <Screen back>
        <EmptyState
          icon="alert-circle-outline"
          title="Coach introuvable"
          text="Ce profil n’existe plus ou le lien est périmé."
          actionLabel="Voir tous les coachs"
          onAction={() => router.replace('/coachs')}
        />
      </Screen>
    );
  }

  const club = getClub(coach.clubId);

  return (
    <Screen
      back
      contentStyle={{ paddingTop: 0, paddingHorizontal: 0, paddingBottom: 112 }}
      overlay={
        <CoachActionBar
          onClub={club ? () => router.push(`/club/${club.id}`) : undefined}
          onCall={() => callNumber(coach.phone)}
          onWhatsApp={() => openWhatsApp(coach.phone)}
        />
      }
    >
      {/* En-tête héros bleu (univers Coachs) — avatar + identité en surimpression */}
      <View style={styles.hero}>
        <View style={styles.heroFooter}>
          <View style={styles.avatar}>
            <Txt variant="display" color={colors.white}>
              {initials(coach.name)}
            </Txt>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.coachPill}>
              <Ionicons name="ribbon" size={12} color={colors.text} />
              <Txt variant="small" color={colors.text} style={styles.coachPillTxt} numberOfLines={1}>
                Coach Pro · {coach.level}
              </Txt>
            </View>
            <Txt variant="display" color={colors.white} style={styles.heroName}>
              {coach.name}
            </Txt>
          </View>
        </View>
      </View>

      <View style={styles.body}>
        {/* Rangée de 3 « info chips » : niveau enseigné · niveau · club */}
        <View style={styles.infoChips}>
          <View style={styles.infoChip}>
            <View style={styles.chipTop}>
              <Ionicons name="star" size={15} color={colors.amber} />
              <Txt variant="h3">{coach.levelValue.toFixed(1)}</Txt>
            </View>
            <Txt variant="small" color={colors.textFaint}>
              niveau
            </Txt>
          </View>
          <View style={styles.infoChip}>
            <Txt variant="body" style={styles.chipStrong} numberOfLines={1}>
              {coach.level}
            </Txt>
            <Txt variant="small" color={colors.textFaint}>
              catégorie
            </Txt>
          </View>
          <View style={styles.infoChip}>
            <Txt variant="body" style={styles.chipStrong} numberOfLines={1}>
              {coachClubName(coach, state.customClubs, state.clubInfo)}
            </Txt>
            <Txt variant="small" color={colors.textFaint}>
              club
            </Txt>
          </View>
        </View>

        {/* Bio */}
        <Card style={{ marginTop: spacing.lg }}>
          <Txt variant="label">
            À propos
          </Txt>
          <Txt variant="body" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
            {coach.bio}
          </Txt>
        </Card>

        {/* Spécialités */}
        <Txt variant="label" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
          Spécialités
        </Txt>
        <View style={styles.specs}>
          {coach.specialties.map((s) => (
            <Tag key={s} label={s} tone="blue" />
          ))}
        </View>

        {/* Disponibilité — secteur où le coach exerce */}
        <View style={styles.availRow}>
          <Ionicons name="time-outline" size={16} color={colors.blue} />
          <Txt variant="muted">Disponible sur {coach.area} — horaires à convenir.</Txt>
        </View>

        <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.md }}>
          La réservation d’un cours se fait directement avec le coach (appel / WhatsApp).
        </Txt>
      </View>
    </Screen>
  );
}

// Barre d’action basse collante : « Voir le club » (secondaire) + « Appeler » (pill bleu) +
// « WhatsApp » (canal n°1 en Côte d’Ivoire — le texte au-dessus de cette barre promet les deux).
function CoachActionBar({ onClub, onCall, onWhatsApp }: { onClub?: () => void; onCall: () => void; onWhatsApp: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.actionBar, { paddingBottom: spacing.md + insets.bottom }]}>
      {onClub ? (
        <View style={{ flex: 1 }}>
          <Button label="Voir le club" icon="location-outline" variant="secondary" onPress={onClub} full />
        </View>
      ) : null}
      <Pressable
        onPress={onCall}
        style={({ pressed }) => [styles.callBtn, { flex: 1 }, pressed && styles.callBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel="Appeler le coach"
      >
        <Ionicons name="call" size={18} color={colors.white} />
        <Txt variant="body" color={colors.white} style={styles.callBtnTxt}>
          Appeler
        </Txt>
      </Pressable>
      <View style={{ flex: 1 }}>
        <Button label="WhatsApp" icon="logo-whatsapp" variant="secondary" onPress={onWhatsApp} full />
      </View>
    </View>
  );
}

const HERO_HEIGHT = 240;

const styles = StyleSheet.create({
  hero: {
    height: HERO_HEIGHT,
    backgroundColor: colors.blue,
    justifyContent: 'flex-end',
  },
  heroFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  avatar: {
    width: 74,
    height: 74,
    borderRadius: radius.lg,
    backgroundColor: colors.blueSoft,
    borderWidth: 1,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.lime,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.xs,
  },
  coachPillTxt: { fontWeight: font.weight.semibold, flexShrink: 1 },
  heroName: { fontSize: font.size.xxl },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  infoChips: { flexDirection: 'row', gap: spacing.sm },
  infoChip: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  chipTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipStrong: { fontWeight: font.weight.bold },
  specs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  availRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bgElevated,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    shadowColor: shadows.e2.shadowColor,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.blue,
    ...shadows.e2,
  },
  callBtnPressed: { opacity: 0.9, transform: [{ scale: 0.97 }] },
  callBtnTxt: { fontFamily: font.family.bold, fontWeight: font.weight.bold },
});
