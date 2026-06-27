import { View } from 'react-native';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';

export function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color, borderWidth: 1, borderColor: colors.border }} />
      <Txt variant="small" color={colors.textMuted} style={{ fontSize: 11 }}>
        {label}
      </Txt>
    </View>
  );
}
