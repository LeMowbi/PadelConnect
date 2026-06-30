import { StyleSheet } from 'react-native';
import { colors, font, radius, spacing } from '@/theme';

// Styles partagés par l'Espace opérateur et ses sous-composants (saisies, sélecteur de club).
// Factorisés ici pour éviter de dupliquer les mêmes blocs dans chaque fichier.
export const opStyles = StyleSheet.create({
  clubInput: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    padding: spacing.md,
    marginTop: spacing.sm,
    fontSize: font.size.md,
  },
  newsInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    padding: spacing.md,
    marginTop: spacing.sm,
    fontSize: 15,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
});
