import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Button, Card, IconCircle, Txt } from '@/components/ui';
import { type Club } from '@/data/clubs';
import { colors, radius, spacing } from '@/theme';

// Verrou d'accès : 4 chiffres (mémorisé sur l'appareil après la 1ʳᵉ saisie correcte).
export function CodeGate({ club, onUnlock }: { club: Club; onUnlock: (code: string) => boolean }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  return (
    <Card style={{ marginTop: spacing.md, alignItems: 'center', borderColor: colors.signature }}>
      <IconCircle icon="lock-closed" />
      <Txt variant="h3" style={{ marginTop: spacing.sm }}>
        Accès gérant — {club.name}
      </Txt>
      <Txt variant="muted" style={{ marginTop: 4, textAlign: 'center' }}>
        Entre le code à 4 chiffres du club. (Démo : le code est visible dans l'Espace opérateur.)
      </Txt>
      <TextInput
        value={code}
        onChangeText={(t) => {
          setCode(t.replace(/\D/g, '').slice(0, 4));
          setError(false);
        }}
        placeholder="••••"
        placeholderTextColor={colors.textFaint}
        keyboardType="number-pad"
        maxLength={4}
        style={styles.codeInput}
      />
      {error ? (
        <Txt variant="small" color={colors.danger} style={{ marginTop: spacing.sm }}>
          Code incorrect — réessaie.
        </Txt>
      ) : null}
      <View style={{ alignSelf: 'stretch', marginTop: spacing.md }}>
        <Button
          label="Déverrouiller"
          icon="lock-open"
          disabled={code.length !== 4}
          onPress={() => {
            if (!onUnlock(code)) setError(true);
          }}
          full
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  codeInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 28,
    letterSpacing: 12,
    textAlign: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.md,
    alignSelf: 'stretch',
  },
});
