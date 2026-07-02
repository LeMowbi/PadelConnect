import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useApp } from '@/store/AppContext';
import { colors, font } from '@/theme';

// Barre de navigation du bas — les 5 univers du joueur, accessibles en un tap depuis
// partout (comme les grandes apps grand public). Les écrans de détail (fiche club,
// tunnel de réservation, tournoi…) restent dans la pile racine : ils GLISSENT PAR-DESSUS
// la barre, qui réapparaît au retour. Les espaces pro (club, coach, opérateur) restent
// accessibles depuis Profil — ils ne concernent pas tous les joueurs.
export default function TabsLayout() {
  const { state } = useApp();
  // Demandes d'ami en attente → pastille sur l'onglet Amis (découvrabilité, comme avant
  // sur l'accès rapide de l'accueil).
  const pendingRequests = state.friendRequests.length;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.signature,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontFamily: font.family.bodySemi,
          fontSize: 11,
        },
        // Le clavier ne doit pas pousser la barre au-dessus des champs (Android).
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={23} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reserver"
        options={{
          title: 'Réserver',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'tennisball' : 'tennisball-outline'} size={23} color={color} />,
        }}
      />
      <Tabs.Screen
        name="competitions"
        options={{
          title: 'Tournois',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'trophy' : 'trophy-outline'} size={23} color={color} />,
        }}
      />
      <Tabs.Screen
        name="amis"
        options={{
          title: 'Amis',
          tabBarBadge: pendingRequests > 0 ? (pendingRequests > 9 ? '9+' : pendingRequests) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.coral, color: colors.white, fontSize: 11 },
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'people' : 'people-outline'} size={23} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'person' : 'person-outline'} size={23} color={color} />,
        }}
      />
    </Tabs>
  );
}
