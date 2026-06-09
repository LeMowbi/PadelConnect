// Système de design PadelConnect — sobre, épuré, sensation « luxe + sport ».
// Base sombre, accent or champagne (luxe) et vert émeraude (sport).

export const colors = {
  bg: '#0E0F12',
  bgElevated: '#121419',
  surface: '#16181D',
  surfaceAlt: '#1C1F26',
  border: '#23262E',
  borderSoft: 'rgba(255,255,255,0.06)',

  gold: '#C9A24B',
  goldDark: '#A07E2C',
  goldSoft: 'rgba(201,162,75,0.14)',
  green: '#1FB57A',
  greenDark: '#178A5C',
  greenSoft: 'rgba(31,181,122,0.14)',

  text: '#F5F5F2',
  textMuted: '#9A9DA5',
  textFaint: '#6C7079',

  danger: '#E5484D',
  dangerSoft: 'rgba(229,72,77,0.14)',
  white: '#FFFFFF',
  black: '#000000',
  onGold: '#10120F', // texte / icône posés sur le fond or
  overlay: 'rgba(0,0,0,0.55)',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

export const font = {
  size: { xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 26, display: 34 },
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    heavy: '800',
  },
} as const;

export const shadowCard = {
  shadowColor: '#000',
  shadowOpacity: 0.35,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 10 },
  elevation: 6,
} as const;

export const theme = { colors, spacing, radius, font, shadowCard };
export default theme;
