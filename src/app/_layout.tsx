import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from '@/store/AppContext';
import { colors } from '@/theme';

// On garde l'écran de démarrage natif affiché jusqu'à ce que les polices soient
// prêtes : sinon, sur iPhone/Android, le splash se masque trop tôt et l'utilisateur
// voit un bref écran crème vide. (No-op sur le web.)
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  // Polices embarquées localement (assets/fonts) plutôt que via le paquet
  // @expo-google-fonts, qui embarquait les 7 graisses + leurs aperçus et
  // provoquait une collision de fichiers au build iOS. Ici on ne charge que
  // les 3 graisses réellement utilisées. Les clés correspondent à src/theme.
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_600SemiBold: require('../../assets/fonts/BricolageGrotesque_600SemiBold.ttf'),
    BricolageGrotesque_700Bold: require('../../assets/fonts/BricolageGrotesque_700Bold.ttf'),
    BricolageGrotesque_800ExtraBold: require('../../assets/fonts/BricolageGrotesque_800ExtraBold.ttf'),
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
