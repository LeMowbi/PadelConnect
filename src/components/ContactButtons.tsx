import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Button } from './ui';
import { callNumber, openWhatsApp } from '@/lib/contact';
import { spacing } from '@/theme';

// Paire de boutons « Appeler / WhatsApp » — le contact direct passe partout par ces deux canaux.
export function ContactButtons({
  phone,
  size = 'sm',
  primaryCall = false,
  style,
}: {
  phone: string;
  size?: 'sm' | 'md';
  primaryCall?: boolean; // « Appeler » en vert signature (action principale de l'écran)
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.row, style]}>
      <View style={{ flex: 1 }}>
        <Button
          size={size}
          label="Appeler"
          icon="call"
          variant={primaryCall ? 'primary' : 'secondary'}
          onPress={() => callNumber(phone)}
          full
        />
      </View>
      <View style={{ flex: 1 }}>
        <Button size={size} label="WhatsApp" icon="logo-whatsapp" variant="secondary" onPress={() => openWhatsApp(phone)} full />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
});
