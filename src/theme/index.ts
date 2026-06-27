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

  // Couleur SIGNATURE = vert profond du terrain (CTA, héros, sélection, prix, niveau).
  // Texte blanc dessus (onSignature).
  signature: '#0A6B5D',
  signatureDark: '#00544D',
  signatureSoft: 'rgba(10,107,93,0.12)',
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
  purpleDark: '#5B3FB0', // bas du dégradé héros Tournois
  purpleSoft: 'rgba(124,92,214,0.14)',
  // OR réel (champagne) — Sponsorisé, trophées, victoires.
  amber: '#C2922B',
  amberSoft: 'rgba(194,146,43,0.16)',
  // Balle de padel (vert lime/fluo) — touche d'énergie / logo.
  lime: '#C6F24A',

  text: '#0C1A16',
  textMuted: '#5C6B62',
  textFaint: '#7C857B', // assombri (handoff v4.6) → ~4,6:1 sur le crème, passe WCAG AA

  hairline: '#ECE7DB', // séparateurs INTERNES (lignes de listes/tarifs) ≠ border de carte
  scrim: 'rgba(12,26,22,0.55)', // overlay bas de photo + fond des bottom sheets
  scrimStrong: 'rgba(12,26,22,0.85)', // bas d'un en-tête photo, pour garantir le contraste du texte blanc

  danger: '#E5484D',
  dangerSoft: 'rgba(229,72,77,0.16)',
  warning: '#E0973A',
  warningSoft: 'rgba(224,151,58,0.16)',
  white: '#FFFFFF',
  black: '#000000',
  onSignature: '#FFFFFF', // texte / icône posés sur la couleur signature (vert profond)
  onPhoto: 'rgba(255,255,255,0.85)', // texte blanc sur photo / dégradé (légèrement adouci)
  onPhotoSoft: 'rgba(255,255,255,0.16)', // pastille / bouton translucide blanc sur fond sombre
  limeGlow: 'rgba(198,242,74,0.35)', // halo autour du point « live » (= lime à 35 %)
  overlay: 'rgba(0,0,0,0.45)',
  viewerBg: '#000000', // visionneuse photos plein écran
} as const;

// Dégradés réutilisables (tokens — pas de hex en dur dans les écrans).
export const gradients = {
  heroSoft: ['#CBE7DB', '#EFE9DA', colors.bg] as const, // accueil / onboarding (un cran plus profond en haut)
  deepGreen: [colors.signature, colors.signatureDark] as const, // rappels, boutons signature
  deepPurple: [colors.purple, colors.purpleDark] as const, // héros univers Tournois (fiche tournoi)
} as const;

// Palette d'accents pour les visuels de club (placeholders) — tokens, pas de hex épars.
export const ACCENTS = ['#1FB57A', '#C2922B', '#3C85D4', '#E0653A', '#7C5CD6', '#0A6B5D'] as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

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

// Échelle d'élévations (handoff v4.6) — remplace l'ombre unique.
// e1 : cartes au repos · e2 : héros / CTA primaire / cartes mises en avant ·
// e3 : bottom sheets & modales.
export const shadows = {
  e1: { shadowColor: '#1A2A20', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  e2: { shadowColor: '#1A2A20', shadowOpacity: 0.1, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 5 },
  e3: { shadowColor: '#0C1A16', shadowOpacity: 0.18, shadowRadius: 40, shadowOffset: { width: 0, height: 20 }, elevation: 12 },
} as const;

// Conservé pour compatibilité (= e1).
export const shadowCard = shadows.e1;

export const theme = { colors, gradients, spacing, radius, font, shadows, shadowCard };
export default theme;
