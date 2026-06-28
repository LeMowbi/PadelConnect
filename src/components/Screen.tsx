import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from './ui';
import { colors, radius, spacing } from '@/theme';

type Props = {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  back?: boolean;
  scroll?: boolean;
  headerRight?: React.ReactNode;
  contentStyle?: ViewStyle;
  overlay?: React.ReactNode;
  scrollRef?: React.Ref<ScrollView>;
};

export function Screen({ children, title, subtitle, back, scroll = true, headerRight, contentStyle, overlay, scrollRef }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const header = (title || back) && (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        {back ? (
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12} accessibilityLabel="Retour">
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
        ) : null}
        <View style={{ flex: 1 }}>
          {title ? (
            <Txt variant="h1" style={{ fontSize: 28 }}>
              {title}
            </Txt>
          ) : null}
          {subtitle ? (
            <Txt variant="muted" style={{ marginTop: 2 }}>
              {subtitle}
            </Txt>
          ) : null}
        </View>
        {headerRight}
      </View>
    </View>
  );

  const body = (
    <>
      {header}
      <View style={[styles.content, contentStyle]}>{children}</View>
    </>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          // Le 1er tap sur un bouton ne doit pas être « avalé » par la fermeture du clavier ;
          // et on referme le clavier dès qu'on fait défiler un formulaire.
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxxl }}
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
      {overlay}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
});
