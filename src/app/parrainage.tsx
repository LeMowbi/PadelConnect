import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import { Reveal } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { Button, Card, IconCircle, StatTile, Txt } from '@/components/ui';
import { openWhatsApp } from '@/lib/contact';
import { fetchReferralCount, inviteUrl, referralCodeForUser } from '@/lib/referrals';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { useApp } from '@/store/AppContext';
import { colors, gradients, radius, shadows, spacing } from '@/theme';

// Lien d'invitation : Universal Link padelconnectci.com/invite/CODE — ouvre DIRECTEMENT l'app si
// installée (code pré-rempli), sinon la page redirige vers l'App Store. Repli sans code : App Store.
const APP_STORE_URL = 'https://apps.apple.com/app/id6785261310';

// Parrainage : chaque joueur connecté a un CODE unique. Son filleul le saisit à
// l'inscription → le lien parrain→filleul est créé côté serveur, et le compteur ci-dessous
// reflète le nombre RÉEL de filleuls (table referrals, RLS). En démo (hors session) : code
// indisponible, on garde l'invitation simple.
export default function ParrainageScreen() {
  const { state } = useApp();
  const toast = useToast();
  const myCode = state.serverUserId ? referralCodeForUser(state.serverUserId) : null;
  const [count, setCount] = useState<number | null>(null);

  // Recharge le compteur de filleuls (au montage ET au pull-to-refresh — sinon il restait figé
  // à la valeur du premier affichage, contrairement aux autres écrans).
  const reloadCount = async () => {
    const uid = state.serverUserId;
    if (!uid) return;
    const n = await fetchReferralCount(uid);
    if (n != null) setCount(n); // null = échec réseau → on garde le compteur affiché
  };
  const { refreshControl } = usePullToRefresh(reloadCount);

  useEffect(() => {
    let alive = true;
    const uid = state.serverUserId;
    if (!uid) return;
    fetchReferralCount(uid).then((n) => {
      if (alive && n != null) setCount(n); // null = échec réseau → pas d'écrasement
    });
    return () => {
      alive = false;
    };
  }, [state.serverUserId]);

  // Avec un code : lien direct qui ouvre l'app (code auto-rempli). Sans code : simple App Store.
  const link = myCode ? inviteUrl(myCode) : APP_STORE_URL;
  const message =
    `Rejoins-moi sur PadelConnect 🎾 — on réserve un terrain de padel à Abidjan en 2 minutes.` +
    (myCode ? `\nMon code de parrainage : ${myCode}` : '') +
    `\n${link}`;

  const invite = () => openWhatsApp('', message);
  const shareMore = () => Share.share({ message }).catch(() => {});
  // Copie RÉELLE du code dans le presse-papiers (le bouton le promettait sans le faire).
  const copyCode = async () => {
    if (!myCode) return;
    await Clipboard.setStringAsync(myCode);
    toast.show('Code copié ✓');
  };

  return (
    <Screen back title="Parrainage" subtitle="Invite tes amis à jouer" refreshControl={refreshControl}>
      <Reveal>
        <LinearGradient colors={gradients.deepGreen} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="gift-outline" size={26} color={colors.lime} />
          </View>
          <Txt variant="display" color={colors.onSignature} style={{ fontSize: 24, marginTop: spacing.md }}>
            Joue à plusieurs
          </Txt>
          <Txt variant="small" color={colors.onPhoto} style={{ marginTop: 4 }}>
            Le padel, c'est mieux entre amis. Invite-les — tu les retrouves direct sur tes réservations.
          </Txt>
        </LinearGradient>

        {/* Mon code de parrainage — à partager, tape pour copier dans le message */}
        {myCode ? (
          <Pressable onPress={invite} style={styles.codeCard} accessibilityLabel="Partager mon code de parrainage">
            <View style={{ flex: 1 }}>
              <Txt variant="label" color={colors.textFaint}>
                MON CODE DE PARRAINAGE
              </Txt>
              <Txt variant="display" color={colors.signature} style={styles.code}>
                {myCode}
              </Txt>
            </View>
            <View style={styles.shareBtn}>
              <Ionicons name="share-social" size={18} color={colors.signature} />
            </View>
          </Pressable>
        ) : (
          <Card style={{ marginTop: spacing.lg, flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <IconCircle icon="information-circle-outline" color={colors.purple} bg={colors.purpleSoft} />
            <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
              Connecte-toi pour obtenir ton code de parrainage personnel.
            </Txt>
          </Card>
        )}

        <View style={styles.stats}>
          <StatTile value={count == null ? '—' : `${count}`} label="Amis rejoints" color={colors.signature} bg={colors.signatureSoft} />
          <StatTile value="Illimité" label="Invitations à envoyer" color={colors.amberDark} bg={colors.amberSoft} />
        </View>

        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <Button label="Inviter par WhatsApp" icon="logo-whatsapp" onPress={invite} full pill />
          {myCode ? (
            <>
              <Button label="Copier mon code" icon="copy-outline" variant="secondary" onPress={copyCode} full />
              <Button label="Plus d'options de partage" icon="share-outline" variant="ghost" onPress={shareMore} full />
            </>
          ) : null}
        </View>

        <Card style={{ marginTop: spacing.lg, flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
          <IconCircle icon="people-outline" color={colors.purple} bg={colors.purpleSoft} />
          <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
            Ton filleul saisit ton code à l'inscription : il apparaît alors dans ton compteur « Amis rejoints ».
          </Txt>
        </Card>
      </Reveal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: spacing.lg, marginTop: spacing.sm, ...shadows.e2 },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.onPhotoSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  code: { fontSize: 30, letterSpacing: 4, marginTop: 2 },
  shareBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.signatureSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
});
