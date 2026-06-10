import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/bricolage-grotesque';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from '@/store/AppContext';
import { colors } from '@/theme';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
  });

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        {fontsLoaded ? (
          <AppProvider>
            <RootNav />
          </AppProvider>
        ) : (
          <View style={{ flex: 1, backgroundColor: colors.bg }} />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNav() {
  const { state, hydrated } = useApp();
  const segments = useSegments();
  const router = useRouter();

  // Sans compte → onboarding obligatoire ; avec compte → on quitte l'onboarding.
  useEffect(() => {
    if (!hydrated) return;
    const onboarding = segments[0] === 'onboarding';
    if (!state.account && !onboarding) router.replace('/onboarding');
    else if (state.account && onboarding) router.replace('/');
  }, [hydrated, state.account, segments, router]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}
      />
    </>
  );
}
