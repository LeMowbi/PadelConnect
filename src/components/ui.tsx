import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { colors, font, radius, shadowCard, spacing } from '@/theme';

export type IconName = keyof typeof Ionicons.glyphMap;

/* ---------------------------------- Texte --------------------------------- */

type TxtVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'body'
  | 'small'
  | 'muted'
  | 'label'
  | 'price';

export function Txt({
  variant = 'body',
  color,
  style,
  children,
  numberOfLines,
}: {
  variant?: TxtVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
  numberOfLines?: number;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[txt[variant], color ? { color } : null, style]}
    >
      {children}
    </Text>
  );
}

const txt = StyleSheet.create({
  display: {
    fontSize: font.size.display,
    fontFamily: font.family.heavy,
    fontWeight: font.weight.heavy,
    color: colors.text,
    letterSpacing: -0.5,
  },
  h1: { fontSize: font.size.xxl, fontFamily: font.family.heavy, fontWeight: font.weight.bold, color: colors.text, letterSpacing: -0.3 },
  h2: { fontSize: font.size.xl, fontFamily: font.family.bold, fontWeight: font.weight.bold, color: colors.text, letterSpacing: -0.2 },
  h3: { fontSize: font.size.lg, fontFamily: font.family.bold, fontWeight: font.weight.semibold, color: colors.text },
  body: { fontSize: font.size.md, fontWeight: font.weight.regular, color: colors.text, lineHeight: 22 },
  small: { fontSize: font.size.sm, fontWeight: font.weight.regular, color: colors.text },
  muted: { fontSize: font.size.sm, fontWeight: font.weight.regular, color: colors.textMuted, lineHeight: 19 },
  label: {
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    color: colors.textFaint,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  price: { fontSize: font.size.lg, fontFamily: font.family.bold, fontWeight: font.weight.bold, color: colors.gold },
});

/* ---------------------------------- Carte --------------------------------- */

export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [card.base, pressed && card.pressed, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[card.base, style]}>{children}</View>;
}

const card = StyleSheet.create({
  base: {
    ...shadowCard,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
});

/* --------------------------------- Bouton --------------------------------- */

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  full,
  size = 'md',
  disabled,
}: {
  label: string;
  onPress?: () => void;
  variant?: BtnVariant;
  icon?: IconName;
  full?: boolean;
  size?: 'sm' | 'md';
  disabled?: boolean;
}) {
  const tone = btnTones[variant];
  const inner = (
    <>
      {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={tone.fg} /> : null}
      <Text style={[btn.label, size === 'sm' && { fontSize: font.size.sm }, { color: tone.fg }]}>
        {label}
      </Text>
    </>
  );

  // Variante primaire : dégradé or (effet premium).
  if (variant === 'primary') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          shadowCard,
          { borderRadius: size === 'sm' ? radius.sm : radius.md },
          full && { alignSelf: 'stretch' },
          pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] },
          disabled && { opacity: 0.45 },
        ]}
      >
        <LinearGradient
          colors={[colors.gold, colors.goldDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[btn.base, size === 'sm' && btn.sm, { borderColor: 'transparent' }]}
        >
          {inner}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        btn.base,
        size === 'sm' && btn.sm,
        { backgroundColor: tone.bg, borderColor: tone.border },
        full && { alignSelf: 'stretch' },
        pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
        disabled && { opacity: 0.45 },
      ]}
    >
      {inner}
    </Pressable>
  );
}

const btnTones: Record<BtnVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.gold, fg: colors.onGold, border: colors.gold },
  secondary: { bg: colors.surfaceAlt, fg: colors.text, border: colors.border },
  ghost: { bg: 'transparent', fg: colors.gold, border: 'transparent' },
  danger: { bg: colors.dangerSoft, fg: colors.danger, border: 'transparent' },
};

const btn = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  sm: { height: 40, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  label: { fontSize: font.size.md, fontFamily: font.family.bold, fontWeight: font.weight.bold },
});

/* ---------------------------------- Tag ----------------------------------- */

type TagTone = 'gold' | 'green' | 'neutral' | 'danger' | 'blue' | 'coral' | 'purple' | 'amber';

export function Tag({
  label,
  tone = 'neutral',
  icon,
}: {
  label: string;
  tone?: TagTone;
  icon?: IconName;
}) {
  const t = tagTones[tone];
  return (
    <View style={[tag.base, { backgroundColor: t.bg }]}>
      {icon ? <Ionicons name={icon} size={12} color={t.fg} /> : null}
      <Text style={[tag.text, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const tagTones: Record<TagTone, { bg: string; fg: string }> = {
  gold: { bg: colors.goldSoft, fg: colors.gold },
  green: { bg: colors.greenSoft, fg: colors.green },
  neutral: { bg: colors.surfaceAlt, fg: colors.text },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  blue: { bg: colors.blueSoft, fg: colors.blue },
  coral: { bg: colors.coralSoft, fg: colors.coral },
  purple: { bg: colors.purpleSoft, fg: colors.purple },
  amber: { bg: colors.amberSoft, fg: colors.amber },
};

const tag = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  text: { fontSize: font.size.xs, fontWeight: font.weight.semibold },
});

/* ----------------------------- Section / divers --------------------------- */

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={sh.row}>
      <Txt variant="h3">{title}</Txt>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={sh.action}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const sh = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  action: { color: colors.gold, fontSize: font.size.sm, fontWeight: font.weight.semibold },
});

export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[{ height: 1, backgroundColor: colors.border }, style]} />;
}

export function IconCircle({
  icon,
  color = colors.gold,
  bg = colors.goldSoft,
  size = 44,
}: {
  icon: IconName;
  color?: string;
  bg?: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.pill,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={icon} size={size * 0.45} color={color} />
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  text,
}: {
  icon: IconName;
  title: string;
  text?: string;
}) {
  return (
    <View style={empty.box}>
      <IconCircle icon={icon} color={colors.textMuted} bg={colors.surfaceAlt} size={56} />
      <Txt variant="h3" style={{ marginTop: spacing.md, textAlign: 'center' }}>
        {title}
      </Txt>
      {text ? (
        <Txt variant="muted" style={{ marginTop: 4, textAlign: 'center' }}>
          {text}
        </Txt>
      ) : null}
    </View>
  );
}

const empty = StyleSheet.create({
  box: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
});
