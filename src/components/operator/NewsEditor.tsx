import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Button, Card, Txt } from '@/components/ui';
import { opStyles } from '@/components/operator/styles';
import { colors, spacing } from '@/theme';

// Petit éditeur d'actu d'accueil : titre (obligatoire), sous-titre + lien (optionnels).
export function NewsEditor({
  news,
  onPublish,
  onRemove,
}: {
  news: { title: string; subtitle?: string; link?: string } | null;
  onPublish: (n: { title: string; subtitle?: string; link?: string }) => void;
  onRemove: () => void;
}) {
  const [title, setTitle] = useState(news?.title ?? '');
  const [subtitle, setSubtitle] = useState(news?.subtitle ?? '');
  const [link, setLink] = useState(news?.link ?? '');
  const [saved, setSaved] = useState(false);

  const publish = () => {
    if (title.trim().length < 3) return;
    onPublish({ title, subtitle, link });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <Card>
      <Txt variant="muted" style={{ marginBottom: spacing.sm }}>
        S'affiche en bandeau en haut de l'accueil joueur. Publier une nouvelle actu la fait réapparaître même chez ceux qui l'avaient
        fermée.
      </Txt>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Titre (obligatoire)"
        placeholderTextColor={colors.textFaint}
        style={opStyles.newsInput}
      />
      <TextInput
        value={subtitle}
        onChangeText={setSubtitle}
        placeholder="Sous-titre (optionnel)"
        placeholderTextColor={colors.textFaint}
        style={opStyles.newsInput}
      />
      <TextInput
        value={link}
        onChangeText={setLink}
        placeholder="Lien (optionnel — https://…)"
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        keyboardType="url"
        style={opStyles.newsInput}
      />
      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
        <Button
          size="sm"
          label={saved ? 'Publiée ✓' : 'Publier l’actu'}
          icon={saved ? 'checkmark' : 'megaphone'}
          onPress={publish}
          disabled={title.trim().length < 3}
          full
        />
        {news ? (
          <Button
            size="sm"
            variant="ghost"
            label="Retirer l’actu de l’accueil"
            icon="trash-outline"
            onPress={() => {
              onRemove();
              setTitle('');
              setSubtitle('');
              setLink('');
            }}
            full
          />
        ) : null}
      </View>
    </Card>
  );
}
