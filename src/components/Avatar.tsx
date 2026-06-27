import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { Txt } from './ui';
import { initials } from '@/lib/format';
import { colors } from '@/theme';

// L'avatar UNIQUE de l'app : photo (ou initiales en repli) en cercle, anneau
// dégradé fin aux couleurs de l'app + ombre douce. Même rendu partout — profil,
// accueil, mini-fiches, amis. Tailles usuelles : 76 (profil), 48 (mini-fiche),
// 34–46 (en-têtes et listes).
const RING = 2.5; // épaisseur de l'anneau dégradé
const GAP = 2; // liseré entre l'anneau et la photo

export function Avatar({ uri, name, size = 46 }: { uri?: string | null; name: string; size?: number }) {
  const mid = size - 2 * RING;
  const inner = mid - 2 * GAP;
  return (
    <LinearGradient
      colors={[colors.signature, colors.amber]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <View style={[styles.gap, { width: mid, height: mid, borderRadius: mid / 2 }]}>
        {uri ? (
          <Image
            source={{ uri }}
            contentFit="cover"
            transition={120}
            style={{ width: inner, height: inner, borderRadius: inner / 2 }}
          />
        ) : (
          <View style={[styles.fallback, { width: inner, height: inner, borderRadius: inner / 2 }]}>
            <Txt
              variant="h3"
              color={colors.signature}
              style={{ fontSize: Math.max(10, Math.round(inner * 0.34)), lineHeight: Math.round(inner * 0.46) }}
            >
              {initials(name)}
            </Txt>
          </View>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.15,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  gap: { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  fallback: {
    backgroundColor: colors.signatureSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
