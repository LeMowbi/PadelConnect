import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AnimatedSplash } from '@/components/AnimatedSplash';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastProvider, useToast } from '@/components/Toast';
import { installGlobalErrorLogging } from '@/lib/diagnostics';
import { useNotificationTapRouter } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { useEmailConfirmLink } from '@/lib/useEmailConfirmLink';
import { AppProvider, useApp } from '@/store/AppContext';
import { colors } from '@/theme';

// On garde l’écran de démarrage natif affiché jusqu’à ce que les polices soient
// prêtes : sinon, sur iPhone/Android, le splash se masque trop tôt et l’utilisateur
// voit un bref écran crème vide. (No-op sur le web.)
SplashScreen.preventAutoHideAsync().catch(() => {});

// Journalise les erreurs JS non rattrapées (crashs) dans nos diagnostics (self-hosted Supabase).
// Appelé une fois au chargement du module — avant tout rendu.
installGlobalErrorLogging();

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

  // Splash animée jouée une fois après le chargement des polices.
  const [splashDone, setSplashDone] = useState(false);

  // Polices chargées → on masque le splash NATIF (la splash animée prend le relais sans flash).
  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        {fontsLoaded ? (
          <ErrorBoundary>
            <AppProvider>
              <ToastProvider>
                <RootNav />
              </ToastProvider>
            </AppProvider>
          </ErrorBoundary>
        ) : (
          <View style={{ flex: 1, backgroundColor: colors.bg }} />
        )}
        {/* Par-dessus l’app : la splash animée « P → PadelConnect », puis fondu de sortie. */}
        {fontsLoaded && !splashDone ? <AnimatedSplash onDone={() => setSplashDone(true)} /> : null}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNav() {
  const { state, hydrated, refreshSession } = useApp();
  const segments = useSegments();
  const router = useRouter();
  const toast = useToast();

  // Sans compte → onboarding obligatoire ; avec compte → on quitte l’onboarding.
  // reset-password, legal et decouvrir sont des routes PUBLIQUES : reset-password parce que
  // l’utilisateur qui clique le lien « mot de passe oublié » est par définition déconnecté ;
  // legal et decouvrir parce que l’onboarding lui-même y renvoie (lien « CGU & confidentialité »,
  // aperçu des clubs) — sans cette exemption, un visiteur sans compte ne pourrait jamais les lire.
  useEffect(() => {
    if (!hydrated) return;
    const onboarding = segments[0] === 'onboarding';
    // `auth-callback` (échange du code PKCE d'e-mail) est public : sans ça, un cold-start
    // déconnecté via `padelco://auth-callback?code=` rebondissait brièvement vers /onboarding
    // avant que useEmailConfirmLink ne pose le compte (micro-flash).
    const publicRoute =
      onboarding || ['reset-password', 'auth-callback', 'email-confirmed', 'legal', 'decouvrir'].includes(segments[0] ?? '');
    // « Connecté » = une SESSION existe (serverUserId), pas seulement un profil chargé : loadSession
    // pose serverUserId dès que getSession() rend un userId, mais laisse account=null si le fetch
    // profiles a flanché (réseau). Se baser sur account seul éjectait un inscrit fraîchement confirmé
    // vers /onboarding malgré une session valide.
    const signedIn = !!state.account || !!state.serverUserId;
    if (!signedIn && !publicRoute) router.replace('/onboarding');
    else if (state.account && onboarding) router.replace('/');
  }, [hydrated, state.account, state.serverUserId, segments, router]);

  // Confirmation d’e-mail : le lien reçu par mail rouvre l’app → on échange le code contre
  // une session, on recharge le profil. Trois cas distincts : NOUVEL inscrit (bienvenue +
  // accueil), utilisateur DÉJÀ connecté qui change d’adresse (message neutre, on ne le déplace
  // pas), ou lien d’un AUTRE compte cliqué connecté → BASCULE de compte (dire la vérité +
  // repartir de l’accueil, loadSession a déjà purgé les données du compte précédent).
  const onConfirm = useCallback(
    async (r: 'confirmed' | 'error') => {
      const alreadySignedIn = !!state.account || !!state.serverUserId;
      if (r === 'error') {
        // Lien expiré. Si l'utilisateur est DÉJÀ connecté (échec d'un CHANGEMENT d'e-mail), on ne
        // l'envoie PAS vers l'écran « reconnecte-toi » (sa session est intacte, le garde le renverrait
        // aussitôt à l'accueil → message mensonger) : un toast, et il reste dans l'app.
        if (alreadySignedIn) {
          toast.show('Lien expiré — relance un changement d’e-mail depuis ton profil.', { icon: 'alert-circle' });
          return;
        }
        router.replace('/email-confirmed?kind=error');
        return;
      }
      const prevUserId = state.serverUserId;
      await refreshSession();
      // getSession() = lecture LOCALE (la session vient d'être posée) : getUser() interrogeait le
      // serveur et, en cas de réseau flanchant, rendait null → faux « changement d'e-mail » lors
      // d'une BASCULE de compte.
      const { data } = await supabase.auth.getSession();
      const newUserId = data.session?.user?.id ?? null;
      const kind =
        alreadySignedIn && prevUserId && newUserId && newUserId !== prevUserId ? 'switch' : alreadySignedIn ? 'change' : 'signup';
      // Écran de succès DÉDIÉ (plus de simple toast) : la session est déjà posée → l'utilisateur est
      // CONNECTÉ. Il n'y a PLUS de router.replace('/') qui, à froid, le faisait rebondir vers la
      // connexion. Il entre dans l'app par le bouton de cet écran.
      router.replace(`/email-confirmed?kind=${kind}`);
    },
    [refreshSession, router, toast, state.account, state.serverUserId],
  );
  useEmailConfirmLink(onConfirm);

  // Tap sur une notification (rappel local ou push serveur) → écran concerné plutôt que
  // de rouvrir l’app là où elle en était.
  const pushRoute = useCallback((route: string) => router.push(route as never), [router]);
  useNotificationTapRouter(pushRoute);

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
