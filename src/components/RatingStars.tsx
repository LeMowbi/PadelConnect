import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';
import { colors } from '@/theme';

type Props = {
  value: number;
  size?: number;
  onChange?: (n: number) => void;
};

// Affichage (avec demi-étoiles) ou sélection interactive si `onChange` est fourni.
export function RatingStars({ value, size = 16, onChange }: Props) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {stars.map((i) => {
        let name: keyof typeof Ionicons.glyphMap = 'star-outline';
        if (onChange) {
          name = i <= value ? 'star' : 'star-outline';
        } else {
          if (value >= i) name = 'star';
          else if (value >= i - 0.5) name = 'star-half';
          else name = 'star-outline';
        }
        const icon = (
          <Ionicons name={name} size={size} color={colors.signature} />
        );
        return onChange ? (
          <Pressable key={i} onPress={() => onChange(i)} hitSlop={6}>
            {icon}
          </Pressable>
        ) : (
          <View key={i}>{icon}</View>
        );
      })}
    </View>
  );
}
