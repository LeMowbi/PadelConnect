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
  border: '#E7E1D4', // bordure / ligne (contour de carte)

  // VERT primaire (actions, réservation, sélection). Texte blanc dessus.
  signature: '#0C6A57',
  signatureDark: '#084C3F',
  signatureSoft: 'rgba(12,106,87,0.12)',
  // Vert (disponibilité, succès, jauges) + tints clairs de la refonte.
  green: '#0E7A64',
  greenSoft: '#DCEBE4', // vert tint (fond doux)
  // CORAIL — urgence (« + que X places »).
  coral: '#C0492F',
  coralDark: '#9A3220', // corail « texte » sur coralSoft/dangerSoft : WCAG AA (≈ 5:1) pour les Tags
  coralSoft: '#FBE7DF',
  // VIOLET — tournois & récompenses.
  purple: '#7B6CE8',
  purpleDark: '#5B4FC9',
  purpleSoft: '#E7E3FA',
  // OR — notes/avis, trophées, jauges de trophée.
  amber: '#C29A3A', // or « accent » (icônes/étoiles/jauges sur fond clair ou photo)
  amberDark: '#785A10', // or « texte » sur tint or (amberSoft) : contraste ≈ 5.2:1 → WCAG AA OK
  amberSoft: '#F3E7CC',
  goldBright: '#F0D488', // or « champagne » LISIBLE sur fond vert sombre (carte de résultat) :
  // ≈ 3.6:1 sur le palier le plus clair du dégradé (texte large OK) et ≈ 6.8:1 sur le vert foncé
  // (petit texte OK) — l'`amber` accent, lui, échoue en TEXTE sur ce fond (audit a11y).
  // Balle de padel (touche d’énergie / point « live »).
  lime: '#C6F24A',

  text: '#15211C', // encre principale (quasi-noir vert)
  textMuted: '#6B7A70', // texte secondaire
  // Tertiaire / placeholder. ASSOMBRI (audit a11y) de #7C857B → #68746C pour repasser le seuil
  // WCAG AA (~4.6:1 sur surface claire) : l'ancienne valeur (~3.2-3.8:1) échouait sur du texte
  // informatif (règles, noms, aides) répandu dans l'app. Reste le ton le plus discret de la
  // hiérarchie (légendes de graphe, jours de calendrier), mais désormais lisible.
  textFaint: '#68746C',

  hairline: '#ECE7DB', // séparateurs INTERNES — plus clair que `border` (contour) pour hiérarchiser
  scrim: 'rgba(12,26,22,0.55)', // overlay bas de photo + fond des bottom sheets
  scrimStrong: 'rgba(12,26,22,0.85)',

  // CORAIL réutilisé pour erreurs (cohérent avec l’urgence).
  danger: '#C0492F',
  dangerSoft: '#FBE7DF',
  white: '#FFFFFF',
  black: '#000000',
  onSignature: '#FFFFFF',
  onPhoto: 'rgba(255,255,255,0.85)',
  onPhotoSoft: 'rgba(255,255,255,0.16)',
  sheen: 'rgba(255,255,255,0.12)', // reflet animé qui balaie la bannière d’accueil
  limeGlow: 'rgba(198,242,74,0.35)',
  overlay: 'rgba(12,26,22,0.5)', // backdrop des sheets (refonte)
  viewerBg: '#000000',
} as const;

// Dégradés réutilisables (tokens — pas de hex en dur dans les écrans). Ils référencent les
// couleurs par token pour suivre automatiquement un changement de palette.
export const gradients = {
  deepGreen: [colors.green, colors.signature, colors.signatureDark] as const, // héros vert (3 paliers)
  deepPurple: [colors.purple, colors.purpleDark] as const, // bandeau univers Tournois (violet)
} as const;

// Palette d’accents pour les visuels de club (placeholders) — référence les tokens.
export const ACCENTS = [colors.green, colors.amber, colors.purple, colors.coral, colors.signature] as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

export const font = {
  // REFONTE — Titres/chiffres : Bricolage Grotesque (semi/bold/heavy).
  //           Corps/UI : Schibsted Grotesk (body/bodyMedium/bodySemi/bodyBold).
  family: {
    semi: 'BricolageGrotesque_600SemiBold',
    bold: 'BricolageGrotesque_700Bold',
    heavy: 'BricolageGrotesque_800ExtraBold',
    body: 'SchibstedGrotesk_400Regular',
    bodyMedium: 'SchibstedGrotesk_500Medium',
    bodySemi: 'SchibstedGrotesk_600SemiBold',
    bodyBold: 'SchibstedGrotesk_700Bold',
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

// Échelle d’élévations (handoff v4.6) — remplace l’ombre unique.
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
