import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '@/components/Toast';
import { AppProvider, useApp } from '@/store/AppContext';
import { colors } from '@/theme';

// On garde l'écran de démarrage natif affiché jusqu'à ce que les polices soient
// prêtes : sinon, sur iPhone/Android, le splash se masque trop tôt et l'utilisateur
// voit un bref écran crème vide. (No-op sur le web.)
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  // Polices embarquées localement (assets/fonts). Refonte : Bricolage Grotesque
  // pour les titres/chiffres, Schibsted Grotesk pour le corps/UI. Les clés
  // correspondent aux familles déclarées dans src/theme.
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_600SemiBold: require('../../assets/fonts/BricolageGrotesque_600SemiBold.ttf'),
    BricolageGrotesque_700Bold: require('../../assets/fonts/BricolageGrotesque_700Bold.ttf'),
    BricolageGrotesque_800ExtraBold: require('../../assets/fonts/BricolageGrotesque_800ExtraBold.ttf'),
    SchibstedGrotesk_400Regular: require('../../assets/fonts/SchibstedGrotesk_400Regular.ttf'),
    SchibstedGrotesk_500Medium: require('../../assets/fonts/SchibstedGrotesk_500Medium.ttf'),
    SchibstedGrotesk_600SemiBold: require('../../assets/fonts/SchibstedGrotesk_600SemiBold.ttf'),
    SchibstedGrotesk_700Bold: require('../../assets/fonts/SchibstedGrotesk_700Bold.ttf'),
  });

  // Polices chargées → on masque le splash (la transition se fait sans flash blanc).
  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        {fontsLoaded ? (
          <AppProvider>
            <ToastProvider>
              <RootNav />
            </ToastProvider>
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
