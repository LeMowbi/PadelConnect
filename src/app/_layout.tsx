import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AnimatedSplash } from '@/components/AnimatedSplash';
import { hasSeenWelcome, markWelcomeSeen } from '@/components/BienvenuePrefs';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastProvider, useToast } from '@/components/Toast';
import { DAY_MS } from '@/lib/days';
import { installGlobalErrorLogging, logError } from '@/lib/diagnostics';
import { useNotificationTapRouter } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { useEmailConfirmLink } from '@/lib/useEmailConfirmLink';
import { AppProvider, useApp } from '@/store/AppContext';
import { colors } from '@/theme';

// On garde l’écran de démarrage natif affiché jusqu’à ce que les polices soient
// prêtes : sinon, sur iPhone/Android, le splash se masque trop tôt et l’utilisateur
// voit un bref écran crème vide. (No-op sur le web.)
SplashScreen.preventAutoHideAsync().catch(() => {});

// Écran Bienvenue (E1) : réservé aux comptes NEUFS — créés il y a moins de 7 jours (laisse le temps
// de confirmer l'e-mail puis d'ouvrir l'app). Un compte plus ancien qui se connecte sur un nouvel
// appareil ne le voit jamais : ses réglages existent déjà (profil → Notifications).
const WELCOME_MAX_AGE_MS = 7 * DAY_MS;

// Routes PUBLIQUES (1ᵉʳ segment) : ouvrables sans compte. reset-password parce que l’utilisateur qui
// clique le lien « mot de passe oublié » est par définition déconnecté ; legal et decouvrir parce que
// l’onboarding lui-même y renvoie (lien « CGU & confidentialité », aperçu des clubs) ; auth-callback
// (échange du code PKCE d'e-mail) parce qu'un cold-start déconnecté via `padelco://auth-callback?code=`
// rebondissait sinon brièvement vers /onboarding avant que useEmailConfirmLink ne pose le compte.
// invite : la route doit RESTER montée jusqu'à l'hydratation pour mettre le code de parrainage de
// côté (son public, ce sont justement les visiteurs déconnectés) ; elle redirige ensuite elle-même
// vers « / », où la garde renvoie à l'onboarding (code pré-rempli).
const PUBLIC_ROUTES = ['onboarding', 'reset-password', 'auth-callback', 'email-confirmed', 'legal', 'decouvrir', 'invite'];
const isPublicRoute = (segment: string | undefined) => PUBLIC_ROUTES.includes(segment ?? '');

// Thème de navigation : le fond crème de l'app, y compris DERRIÈRE les écrans — expo-router le
// transmet au conteneur natif de la pile (56.2.13) ; sans lui, le gris du thème par défaut
// apparaissait pendant le balayage retour sur iOS.
const NAV_THEME = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg } };

// Journalise les erreurs JS non rattrapées (crashs) dans nos diagnostics (self-hosted Supabase).
// Appelé une fois au chargement du module — avant tout rendu.
installGlobalErrorLogging();

export default function RootLayout() {
  // Polices embarquées localement (assets/fonts). Refonte : Bricolage Grotesque
  // pour les titres/chiffres, Schibsted Grotesk pour le corps/UI. Les clés
  // correspondent aux familles déclarées dans src/theme.
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_600SemiBold: require('../../assets/fonts/BricolageGrotesque_600SemiBold.ttf'),
    BricolageGrotesque_700Bold: require('../../assets/fonts/BricolageGrotesque_700Bold.ttf'),
    BricolageGrotesque_800ExtraBold: require('../../assets/fonts/BricolageGrotesque_800ExtraBold.ttf'),
    SchibstedGrotesk_400Regular: require('../../assets/fonts/SchibstedGrotesk_400Regular.ttf'),
    SchibstedGrotesk_500Medium: require('../../assets/fonts/SchibstedGrotesk_500Medium.ttf'),
    SchibstedGrotesk_600SemiBold: require('../../assets/fonts/SchibstedGrotesk_600SemiBold.ttf'),
    SchibstedGrotesk_700Bold: require('../../assets/fonts/SchibstedGrotesk_700Bold.ttf'),
  });

  // Police en échec (web lent : le chargeur abandonne après 12 s ; police locale illisible) →
  // on démarre QUAND MÊME, sur la police système : sans ce repli, la page restait vide à jamais
  // (R-96). L'échec est journalisé pour la carte « Santé de l'app ».
  const ready = fontsLoaded || !!fontError;
  useEffect(() => {
    if (fontError) logError(fontError, 'fonts');
  }, [fontError]);

  // Splash animée jouée une fois après le chargement des polices — en NATIF seulement : sur le web
  // (Espace Club), elle se rejouait à chaque rechargement de page (F5), ~1,8 s d'attente pour rien.
  const [splashDone, setSplashDone] = useState(Platform.OS === 'web');

  // Polices prêtes → on masque le splash NATIF (la splash animée prend le relais sans flash).
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        {ready ? (
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
        {ready && !splashDone ? <AnimatedSplash onDone={() => setSplashDone(true)} /> : null}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNav() {
  const { state, hydrated, refreshSession } = useApp();
  const segments = useSegments();
  const router = useRouter();
  const toast = useToast();

  // « Connecté » = une SESSION existe (serverUserId), pas seulement un profil chargé : loadSession
  // pose serverUserId dès que getSession() rend un userId, mais laisse account=null si le fetch
  // profiles a flanché (réseau). Se baser sur account seul éjectait un inscrit fraîchement confirmé
  // vers /onboarding malgré une session valide.
  const signedIn = !!state.account || !!state.serverUserId;

  // Sans compte → onboarding obligatoire (hors routes PUBLIQUES) ; avec compte → on quitte l’onboarding.
  useEffect(() => {
    if (!hydrated) return;
    const onboarding = segments[0] === 'onboarding';
    if (!signedIn && !isPublicRoute(segments[0])) router.replace('/onboarding');
    else if (state.account && onboarding) router.replace('/');
  }, [hydrated, signedIn, state.account, segments, router]);

  // Écran Bienvenue (E1) — UNE fois par compte, juste après l'inscription : dès que le nouvel
  // inscrit (connecté, joueur) arrive dans les onglets, on le redirige vers /bienvenue. On attend
  // les ONGLETS (jamais par-dessus email-confirmed, onboarding ou un lien profond ouvert à froid).
  // Vérifié une seule fois par compte et par lancement (ref) ; le drapeau persistant est posé par
  // l'écran lui-même à l'affichage, ou ici quand le compte n'est plus « neuf » (rien à relire).
  const welcomeCheckedFor = useRef<string | null>(null);
  useEffect(() => {
    const userId = state.serverUserId;
    if (!hydrated || !userId || !state.account || state.accountType === 'club') return;
    if (segments[0] !== '(tabs)' || welcomeCheckedFor.current === userId) return;
    welcomeCheckedFor.current = userId;
    void (async () => {
      if (await hasSeenWelcome(userId)) return;
      // Lecture LOCALE de la session (aucun réseau) : date de création du compte.
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user || user.id !== userId) return; // bascule de compte entre-temps : on ne fait rien
      const createdAt = Date.parse(user.created_at ?? '');
      if (!Number.isFinite(createdAt) || Date.now() - createdAt > WELCOME_MAX_AGE_MS) {
        void markWelcomeSeen(userId); // compte ancien : plus jamais candidat sur cet appareil
        return;
      }
      router.replace('/bienvenue');
    })().catch(() => {}); // lecture de session impossible : pas de Bienvenue, l'app reste utilisable
  }, [hydrated, state.serverUserId, state.account, state.accountType, segments, router]);

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
  // Lien de confirmation ouvert sur un AUTRE appareil ou navigateur (R-70) : l'adresse est confirmée
  // côté serveur, seule la session n'a pas pu s'ouvrir ici (pas de code_verifier PKCE). Connecté :
  // un toast ; sinon, l'écran dédié invite à se connecter (≠ « Lien expiré »).
  const onConfirmedElsewhere = useCallback(() => {
    if (state.account || state.serverUserId) toast.show('Adresse e-mail confirmée ✓');
    else router.replace('/email-confirmed?kind=elsewhere');
  }, [router, toast, state.account, state.serverUserId]);
  useEmailConfirmLink(onConfirm, onConfirmedElsewhere);

  // Tap sur une notification (rappel local ou push serveur) → écran concerné plutôt que
  // de rouvrir l’app là où elle en était.
  const pushRoute = useCallback((route: string) => router.push(route as never), [router]);
  useNotificationTapRouter(pushRoute);

  return (
    <>
      <StatusBar style="dark" />
      <ThemeProvider value={NAV_THEME}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'slide_from_right',
          }}
          // Écran PROTÉGÉ ouvert sans compte (lien direct, F5 sur le web) : le renvoi vers /onboarding
          // part d'un effet, APRÈS un premier rendu — l'écran se montait une frame et lançait ses
          // lectures serveur (401 en console). On rend un fond nu à sa place jusqu'au renvoi (C-09),
          // y compris AVANT l'hydratation (on ne sait pas encore s'il y a un compte : une seule
          // lecture AsyncStorage). Les routes publiques, elles, restent montées dès le départ.
          screenLayout={({ route, children }) =>
            (!hydrated || !signedIn) && !isPublicRoute(route.name.split('/')[0]) ? (
              <View style={{ flex: 1, backgroundColor: colors.bg }} />
            ) : (
              children
            )
          }
        />
      </ThemeProvider>
    </>
  );
}
