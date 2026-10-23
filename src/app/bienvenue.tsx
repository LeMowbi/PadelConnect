import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Linking, Pressable, StyleSheet, Switch, View } from 'react-native';
import { deviceLabel, markWelcomeSeen, useMatchAlerts, usePushPermission } from '@/components/BienvenuePrefs';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, IconCircle, SectionHeader, Tag, Txt, type IconName } from '@/components/ui';
import { activeClubs } from '@/data/clubs';
import { hapticLight, hapticSuccess } from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

// Aperçu des notifications : les VRAIS titres envoyés par notify-club (mêmes emojis), avec un
// corps générique — on montre ce que le joueur recevra, sans inventer de club ni de créneau.
const PREVIEW: { icon: IconName; tint: string; bg: string; title: string; body: string }[] = [
  {
    icon: 'checkmark-circle',
    tint: colors.green,
    bg: colors.greenSoft,
    title: 'Réservation confirmée ✅',
    body: 'Le club a confirmé ton créneau.',
  },
  {
    icon: 'time',
    tint: colors.coral,
    bg: colors.coralSoft,
    title: 'Un créneau s’est libéré 🏃',
    body: 'Fonce, premier arrivé premier servi.',
  },
  {
    icon: 'flash',
    tint: colors.purple,
    bg: colors.purpleSoft,
    title: 'Un match à ton niveau vient d’ouvrir 🎾',
    body: 'Dans un club que tu suis.',
  },
];

// Nombre de réglages en toutes lettres pour le sous-titre (1 à 3 cartes affichées).
const COUNT_WORD = ['', 'Un réglage', 'Deux réglages', 'Trois réglages'];

// Écran « Bienvenue » (E1) : montré UNE fois par compte juste après l'inscription (routage dans
// _layout). Jusqu'à trois réglages qui donnent vie aux alertes : suivre ses clubs (cœurs, Padelta en
// tête), « Matchs à ton niveau », puis les notifications — la fenêtre système ne s'ouvre QUE
// sur « Activer les notifications », après l'explication (un refus iOS est définitif).
export default function Bienvenue() {
  const router = useRouter();
  const toast = useToast();
  const { state, toggleFavorite } = useApp();
  const userId = state.serverUserId;
  const push = usePushPermission();
  const alerts = useMatchAlerts();

  // Vue = consommée dès l'affichage : tuer l'app ici ne la fait pas revenir à chaque lancement.
  useEffect(() => {
    if (userId) void markWelcomeSeen(userId);
  }, [userId]);

  // Mêmes clubs (et même ordre, Padelta en tête via compareClubs) que la liste des clubs.
  // state.clubStatus = dépendance indirecte réelle (registre clubStatusMap lu par activeClubs).
  const clubs = useMemo(
    () => activeClubs(state.customClubs, state.clubInfo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.customClubs, state.clubInfo, state.clubStatus],
  );

  const finish = () => router.replace('/');

  // Garde anti double-tap (même frame : `push.asking` n'est pas encore rendu). Sans elle, le 2ᵉ
  // ask() rendait false et quittait l'écran pendant que la fenêtre système était ouverte.
  const activatingRef = useRef(false);
  const activate = async () => {
    if (activatingRef.current) return;
    activatingRef.current = true;
    const ok = await push.ask();
    if (ok) {
      hapticSuccess();
      toast.show('Notifications activées ✓');
    }
    finish(); // refus dans la fenêtre système : on n'insiste pas (réactivable depuis le profil)
  };

  // Web : aucun push → pas de carte « Reste au courant ». Natif : tant que la permission n'est ni
  // accordée ni bloquée (ou pas encore lue), le bouton « Activer » est le geste principal.
  const showNotifs = push.status !== 'unsupported';
  const canAsk = showNotifs && (push.status === 'ask' || push.status === null);
  // Le sous-titre compte les cartes RÉELLEMENT affichées (web : pas de « Reste au courant »).
  const settingsCount = (clubs.length > 0 ? 1 : 0) + 1 + (showNotifs ? 1 : 0);

  return (
    <Screen
      title={`Bienvenue${state.account?.firstName ? `, ${state.account.firstName}` : ''} 🎾`}
      subtitle={`${COUNT_WORD[settingsCount]} et c’est parti — tout se change plus tard dans ton profil.`}
    >
      {/* Tes clubs — cœur = suivi (annonces du club, matchs à ton niveau, favoris en tête). */}
      {clubs.length > 0 ? (
        <View style={{ marginTop: spacing.md }}>
          <SectionHeader title="Tes clubs" />
          <Txt variant="muted" style={{ marginBottom: spacing.sm }}>
            Touche le cœur des clubs où tu joues : tu recevras leurs annonces et leurs matchs à ton niveau.
          </Txt>
          <Card style={{ paddingVertical: spacing.xs }}>
            {clubs.map((c, i) => {
              const fav = state.favoriteClubIds.includes(c.id);
              return (
                <View key={c.id}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable
                    onPress={() => {
                      hapticLight();
                      toggleFavorite(c.id);
                    }}
                    style={({ pressed }) => [styles.clubRow, pressed && { opacity: 0.7 }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: fav }}
                    accessibilityLabel={fav ? `Ne plus suivre ${c.name}` : `Suivre ${c.name}`}
                  >
                    <View style={{ flex: 1 }}>
                      <Txt variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>
                        {c.name}
                      </Txt>
                      <Txt variant="small" color={colors.textMuted} numberOfLines={1}>
                        {c.area}
                      </Txt>
                    </View>
                    {c.comingSoon ? <Tag label="Bientôt" tone="purple" icon="time" /> : null}
                    <Ionicons name={fav ? 'heart' : 'heart-outline'} size={24} color={fav ? colors.danger : colors.textMuted} />
                  </Pressable>
                </View>
              );
            })}
          </Card>
        </View>
      ) : null}

      {/* Matchs à ton niveau (81) — préférence serveur, écriture honnête (useMatchAlerts). */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Matchs à ton niveau" />
        <Card style={styles.row}>
          <IconCircle icon="flash" color={colors.purple} bg={colors.purpleSoft} />
          <View style={{ flex: 1 }}>
            <Txt variant="body" style={{ fontWeight: '600' }}>
              Préviens-moi
            </Txt>
            <Txt variant="small" color={colors.textMuted}>
              Une notification quand un match ouvert à ton niveau se crée dans un club que tu suis.
            </Txt>
          </View>
          {/* Réglage pas encore connu : on le dit, plutôt que de montrer un faux « désactivé ». */}
          {alerts.on === null ? (
            <Txt variant="small" color={colors.textMuted}>
              …
            </Txt>
          ) : null}
          <Switch
            value={alerts.on === true}
            onValueChange={(v) => void alerts.toggle(v)}
            disabled={alerts.on === null || alerts.busy}
            trackColor={{ true: colors.signature, false: colors.border }}
            thumbColor={colors.white}
            accessibilityRole="switch"
            accessibilityLabel="Matchs à ton niveau"
          />
        </Card>
      </View>

      {/* Reste au courant — explication AVANT la fenêtre système (natif seulement). */}
      {showNotifs ? (
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title="Reste au courant" />
          <Card>
            <View style={{ gap: spacing.sm }}>
              {PREVIEW.map((p) => (
                <View key={p.title} style={styles.preview}>
                  <IconCircle icon={p.icon} color={p.tint} bg={p.bg} size={36} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="small" style={{ fontWeight: '700' }} numberOfLines={1}>
                      {p.title}
                    </Txt>
                    <Txt variant="small" color={colors.textMuted} numberOfLines={1}>
                      {p.body}
                    </Txt>
                  </View>
                </View>
              ))}
            </View>
            {push.status === 'granted' ? (
              <View style={{ marginTop: spacing.md, alignSelf: 'flex-start' }}>
                <Tag label="Notifications activées" tone="green" icon="checkmark-circle" />
              </View>
            ) : push.status === 'blocked' ? (
              <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                <Txt variant="small" color={colors.textMuted}>
                  Notifications désactivées sur {deviceLabel} — réactive-les dans les Réglages pour ne rien rater.
                </Txt>
                <Button
                  label="Ouvrir les Réglages"
                  icon="settings-outline"
                  variant="secondary"
                  onPress={() => void Linking.openSettings()}
                  full
                />
              </View>
            ) : (
              <View style={{ marginTop: spacing.md }}>
                <Button
                  label={push.asking ? 'Un instant…' : 'Activer les notifications'}
                  icon="notifications"
                  onPress={() => void activate()}
                  disabled={push.asking}
                  full
                />
              </View>
            )}
          </Card>
        </View>
      ) : null}

      <View style={{ marginTop: spacing.xl }}>
        {canAsk ? (
          <Button label="Plus tard" variant="ghost" onPress={finish} disabled={push.asking} full />
        ) : (
          <Button label="C’est parti" icon="arrow-forward" onPress={finish} full />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  clubRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52, paddingVertical: spacing.sm },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
});
