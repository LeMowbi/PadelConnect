import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { PhotoPlaceholder } from './PhotoPlaceholder';
import { Txt } from './ui';
import { colors, radius, spacing } from '@/theme';

// Photo distante (réelle) avec repli automatique sur le visuel doré si l'image manque.
// `overlay` + `caption` permettent un rendu "héros" (nom du club superposé sur la photo).
export function ClubPhoto({
  uri,
  accent,
  initials,
  height = 150,
  width,
  rounded = radius.lg,
  overlay,
  caption,
  subtitle,
}: {
  uri?: string;
  accent: string;
  initials?: string;
  height?: number;
  width?: number;
  rounded?: number;
  overlay?: boolean;
  caption?: string;
  subtitle?: string;
}) {
  const [error, setError] = useState(false);
  const showImage = !!uri && !error;

  return (
    <View style={{ width: width ?? '100%', height, borderRadius: rounded, overflow: 'hidden', backgroundColor: colors.surfaceAlt }}>
      {showImage ? (
        <Image source={{ uri }} onError={() => setError(true)} contentFit="cover" transition={200} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={StyleSheet.absoluteFill}>
          <PhotoPlaceholder accent={accent} initials={initials} height={height} rounded={0} showBadge={false} />
        </View>
      )}

      {overlay ? (
        <LinearGradient colors={['transparent', colors.scrim, colors.scrimStrong]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      ) : null}

      {caption ? (
        <View style={styles.caption} pointerEvents="none">
          <Txt variant="h2" color={colors.white} numberOfLines={1}>
            {caption}
          </Txt>
          {subtitle ? (
            <Txt variant="small" color={colors.onPhoto}>
              {subtitle}
            </Txt>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.md },
});
