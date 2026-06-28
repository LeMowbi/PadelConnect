// Système de design PadelConnect — « luxe sportif » (brief 28/06/2026).
// PALETTE DISCIPLINÉE : le VERT structure, le LIME ne sert qu'à 1 action clé par écran,
// l'OR est réservé au prestige (tournois, trophées, premium), la TERRE aux erreurs/urgences.
// Violet / corail / bleu / orange ont été retirés : leurs tokens sont remappés sur cette
// échelle (les noms restent pour compat, mais rendent en vert/or/terre).

export const colors = {
  // Fonds — crème chaud (plus premium qu'un blanc froid), cartes blanches.
  bg: '#F4F1E8',
  bgElevated: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#ECE8DC',
  border: '#E6E0D2', // filets (brief)
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
  // « Bleu » (univers Coachs/info) → remappé sur le vert signature.
  blue: '#0A6B5D',
  blueSoft: 'rgba(10,107,93,0.12)',
  // « Corail » (univers Découvrir) → remappé sur le vert vif.
  coral: '#1E9E73',
  coralSoft: 'rgba(30,158,115,0.14)',
  // « Violet » (univers Tournois/récompenses) → remappé sur l'OR (prestige).
  purple: '#C2922B',
  purpleDark: '#9A7322', // bas du dégradé héros Tournois (or profond)
  purpleSoft: 'rgba(194,146,43,0.16)',
  // OR réel (champagne) — prestige : tournois, trophées, Sponsorisé.
  amber: '#C2922B',
  amberSoft: 'rgba(194,146,43,0.16)',
  // Balle de padel (vert lime/fluo) — réservé à 1 action clé par écran (brief).
  lime: '#C6F24A',

  text: '#0C1A16',
  textMuted: '#5C6B62',
  textFaint: '#7C857B', // assombri (handoff v4.6) → ~4,6:1 sur le crème, passe WCAG AA

  hairline: '#ECE7DB', // séparateurs INTERNES (lignes de listes/tarifs) ≠ border de carte
  scrim: 'rgba(12,26,22,0.55)', // overlay bas de photo + fond des bottom sheets
  scrimStrong: 'rgba(12,26,22,0.85)', // bas d'un en-tête photo, pour garantir le contraste du texte blanc

  // TERRE — erreurs et urgences (brief #C0492F).
  danger: '#C0492F',
  dangerSoft: 'rgba(192,73,47,0.16)',
  // « Warning » (orange retiré) → remappé sur l'or.
  warning: '#C2922B',
  warningSoft: 'rgba(194,146,43,0.16)',
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

// Palette d'accents pour les visuels de club (placeholders) — référence les tokens
// (zéro couleur en dur), pas de hex épars.
export const ACCENTS = [colors.green, colors.amber, colors.blue, colors.coral, colors.purple, colors.signature] as const;

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
