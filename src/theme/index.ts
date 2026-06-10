// Système de design PadelConnect — « luxe sportif » : fond crème chaud, vert profond signature,
// accents par univers (vert / bleu / violet / corail) et or réel pour Sponsorisé & trophées.

export const colors = {
  // Fonds — crème chaud (plus premium qu'un blanc froid), cartes blanches.
  bg: '#F4F1E8',
  bgElevated: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#ECE8DC',
  border: '#D8D2C4',
  borderSoft: 'rgba(0,0,0,0.06)',

  // Couleur SIGNATURE = vert profond du terrain (CTA, héros, niveau). Texte blanc dessus.
  // (Clé historiquement nommée « gold » — conservée pour ne rien casser ; c'est le vert profond.)
  gold: '#0A6B5D',
  goldDark: '#00544D',
  goldSoft: 'rgba(10,107,93,0.12)',
  // Vert vif — disponibilité, succès, victoire, « X libres ».
  green: '#1E9E73',
  greenDark: '#167A58',
  greenSoft: 'rgba(30,158,115,0.14)',
  // Bleu — univers Coachs / info.
  blue: '#3C85D4',
  blueSoft: 'rgba(60,133,212,0.14)',
  // Corail — univers Découvrir + alertes douces.
  coral: '#E0653A',
  coralSoft: 'rgba(224,101,58,0.14)',
  // Violet — univers Tournois & récompenses.
  purple: '#7C5CD6',
  purpleSoft: 'rgba(124,92,214,0.14)',
  // OR réel (champagne) — Sponsorisé, trophées, victoires.
  amber: '#C2922B',
  amberSoft: 'rgba(194,146,43,0.16)',
  // Balle de padel (vert lime/fluo) — touche d'énergie / logo.
  lime: '#C6F24A',

  text: '#0C1A16',
  textMuted: '#5C6B62',
  textFaint: '#97A096',

  danger: '#E5484D',
  dangerSoft: 'rgba(229,72,77,0.16)',
  warning: '#E0973A',
  warningSoft: 'rgba(224,151,58,0.16)',
  white: '#FFFFFF',
  black: '#000000',
  onGold: '#FFFFFF', // texte / icône posés sur la couleur signature (vert profond)
  overlay: 'rgba(0,0,0,0.45)',
  viewerBg: '#000000', // visionneuse photos plein écran
} as const;

// Dégradés réutilisables (tokens — pas de hex en dur dans les écrans).
export const gradients = {
  heroSoft: ['#DCEFE6', '#F1ECDD', colors.bg] as const, // accueil / onboarding
  deepGreen: [colors.gold, colors.goldDark] as const, // rappels, boutons signature
} as const;

// Palette d'accents pour les visuels de club (placeholders) — tokens, pas de hex épars.
export const ACCENTS = ['#1FB57A', '#C2922B', '#3C85D4', '#E0653A', '#7C5CD6', '#0A6B5D'] as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

export const font = {
  // Famille signée (titres, chiffres clés, boutons). Corps en système pour lisibilité/perf.
  family: {
    semi: 'BricolageGrotesque_600SemiBold',
    bold: 'BricolageGrotesque_700Bold',
    heavy: 'BricolageGrotesque_800ExtraBold',
  },
  size: { xs: 11, sm: 13, md: 15, lg: 17, xl: 22, xxl: 26, display: 32 },
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    heavy: '800',
  },
} as const;

export const shadowCard = {
  shadowColor: '#1A2A20',
  shadowOpacity: 0.08,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
} as const;

export const theme = { colors, gradients, spacing, radius, font, shadowCard };
export default theme;
