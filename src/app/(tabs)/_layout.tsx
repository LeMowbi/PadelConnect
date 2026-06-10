import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt, type IconName } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

const META: Record<string, { on: IconName; off: IconName; label: string }> = {
  index: { on: 'home', off: 'home-outline', label: 'Accueil' },
  reserver: { on: 'calendar', off: 'calendar-outline', label: 'Réserver' },
  matchs: { on: 'tennisball', off: 'tennisball-outline', label: 'Jouer' },
  competitions: { on: 'trophy', off: 'trophy-outline', label: 'Tournois' },
  profil: { on: 'person', off: 'person-outline', label: 'Profil' },
};

type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
};

function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + 6 }]}>
      {state.routes.map((route, i) => {
        const meta = META[route.name];
        if (!meta) return null;
        const focused = state.index === i;
        return (
          <Pressable key={route.key} style={styles.item} onPress={() => navigation.navigate(route.name)} hitSlop={6}>
            <View style={[styles.pill, focused && styles.pillActive]}>
              <Ionicons name={focused ? meta.on : meta.off} size={21} color={focused ? colors.onGold : colors.textMuted} />
            </View>
            <Txt variant="label" color={focused ? colors.gold : colors.textFaint} style={{ marginTop: 3, fontSize: 10 }}>
              {meta.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="reserver" />
      <Tabs.Screen name="matchs" />
      <Tabs.Screen name="competitions" />
      <Tabs.Screen name="profil" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.bgElevated,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pill: {
    width: 52,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: { backgroundColor: colors.gold },
});
