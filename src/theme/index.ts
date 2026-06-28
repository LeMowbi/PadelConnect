// Système de design PadelConnect — REFONTE (handoff Claude Design).
// Couleurs PAR RÔLE : VERT = navigation/réservation/validation · OR = notes/avis,
// trophées, jauges de progression · VIOLET = tournois & récompenses · CORAIL = urgence
// (places limitées). Fond beige chaud, cartes blanches.

export const colors = {
  // Fonds
  bg: '#EFEADF', // beige chaud app
  bgElevated: '#FFFFFF',
  surface: '#FFFFFF', // surface carte
  surfaceAlt: '#F5F2EA', // champs / surfaces secondaires
  surfaceBeige: '#E4DFD2', // puce / track segmenté (beige foncé)
  border: '#E7E1D4', // bordure / ligne
  borderSoft: 'rgba(21,33,28,0.06)',

  // VERT primaire (actions, réservation, sélection). Texte blanc dessus.
  signature: '#0C6A57',
  signatureDark: '#084C3F',
  signatureSoft: 'rgba(12,106,87,0.12)',
  // Vert (disponibilité, succès, jauges) + tints clairs de la refonte.
  green: '#0E7A64',
  greenDark: '#0C6A57',
  greenSoft: '#DCEBE4', // vert tint (fond doux)
  greenOnDark: '#BFEAD9', // vert clair sur fond vert (texte/accents)
  // « Bleu » (legacy) → vert signature (pas de bleu dans la refonte).
  blue: '#0C6A57',
  blueSoft: 'rgba(12,106,87,0.12)',
  // CORAIL — urgence (« + que X places »).
  coral: '#C0492F',
  coralSoft: '#FBE7DF',
  // VIOLET — tournois & récompenses.
  purple: '#7B6CE8',
  purpleDark: '#5B4FC9',
  purpleSoft: '#E7E3FA',
  // OR — notes/avis, trophées, jauges de trophée.
  amber: '#C29A3A',
  amberDark: '#8A6A14', // texte or foncé (sur tint or)
  amberSoft: '#F3E7CC',
  // Balle de padel (touche d'énergie / point « live »).
  lime: '#C6F24A',

  text: '#15211C', // encre principale (quasi-noir vert)
  textMuted: '#6B7A70', // texte secondaire
  textFaint: '#9AA097', // tertiaire / placeholder

  hairline: '#E7E1D4', // séparateurs internes
  scrim: 'rgba(12,26,22,0.55)', // overlay bas de photo + fond des bottom sheets
  scrimStrong: 'rgba(12,26,22,0.85)',

  // CORAIL réutilisé pour erreurs (cohérent avec l'urgence).
  danger: '#C0492F',
  dangerSoft: '#FBE7DF',
  warning: '#C29A3A',
  warningSoft: '#F3E7CC',
  white: '#FFFFFF',
  black: '#000000',
  onSignature: '#FFFFFF',
  onPhoto: 'rgba(255,255,255,0.85)',
  onPhotoSoft: 'rgba(255,255,255,0.16)',
  limeGlow: 'rgba(198,242,74,0.35)',
  overlay: 'rgba(12,26,22,0.5)', // backdrop des sheets (refonte)
  viewerBg: '#000000',
} as const;

// Dégradés réutilisables (tokens — pas de hex en dur dans les écrans).
export const gradients = {
  heroSoft: ['#DCEBE4', '#EFE9DA', colors.bg] as const, // accueil / onboarding
  deepGreen: ['#0E7A64', '#0C6A57', '#084C3F'] as const, // héros vert (refonte, 3 paliers)
  deepPurple: ['#7B6CE8', '#5B4FC9'] as const, // bandeau univers Tournois (violet)
} as const;

// Palette d'accents pour les visuels de club (placeholders) — référence les tokens.
export const ACCENTS = [colors.green, colors.amber, colors.purple, colors.coral, colors.signature] as const;

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
