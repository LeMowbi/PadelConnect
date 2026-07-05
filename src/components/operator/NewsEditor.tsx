import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';
import { Button, Card, Txt } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { opStyles } from '@/components/operator/styles';
import { colors, radius, spacing } from '@/theme';

// Petit éditeur d’actu d’accueil : titre (obligatoire), sous-titre + lien (optionnels),
// et case « Envoyer aussi en notification » (47) — décochée par défaut, et re-décochée après
// chaque publication : le push aux joueurs est un choix EXPLICITE, actu par actu.
export function NewsEditor({
  news,
  onPublish,
  onRemove,
}: {
  news: { title: string; subtitle?: string; link?: string } | null;
  onPublish: (n: { title: string; subtitle?: string; link?: string; push?: boolean }) => Promise<{ ok: boolean }>;
  onRemove: () => Promise<{ ok: boolean }>;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(news?.title ?? '');
  const [subtitle, setSubtitle] = useState(news?.subtitle ?? '');
  const [link, setLink] = useState(news?.link ?? '');
  const [sendPush, setSendPush] = useState(false);
  const [saved, setSaved] = useState(false);
  const [publishing, setPublishing] = useState(false);
  // Timer du « Enregistré ✓ » : mémorisé et nettoyé au démontage (comme le reste du projet) —
  // pas de setState orphelin si l'éditeur se ferme dans les 2,5 s suivant une publication.
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  const publish = async () => {
    if (title.trim().length < 3 || publishing) return;
    setPublishing(true);
    const { ok } = await onPublish({ title, subtitle, link, push: sendPush });
    setPublishing(false);
    if (!ok) {
      toast.show('Publication impossible — réessaie', { icon: 'alert-circle' });
      return;
    }
    if (sendPush) setSendPush(false); // choix par actu — jamais mémorisé
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 2500);
  };

  return (
    <Card>
      <Txt variant="muted" style={{ marginBottom: spacing.sm }}>
        S’affiche en bandeau en haut de l’accueil joueur. Publier une nouvelle actu la fait réapparaître même chez ceux qui l’avaient
        fermée.
      </Txt>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Titre (obligatoire)"
        placeholderTextColor={colors.textMuted}
        style={opStyles.newsInput}
      />
      <TextInput
        value={subtitle}
        onChangeText={setSubtitle}
        placeholder="Sous-titre (optionnel)"
        placeholderTextColor={colors.textMuted}
        style={opStyles.newsInput}
      />
      <TextInput
        value={link}
        onChangeText={setLink}
        placeholder="Lien (optionnel — https://…)"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        keyboardType="url"
        style={opStyles.newsInput}
      />
      {/* Aperçu EN DIRECT du bandeau tel qu’il apparaîtra sur l’accueil joueur (mêmes
          couleurs/typo que index.tsx) — l’opérateur ne publie plus à l’aveugle. */}
      {title.trim().length > 0 ? (
        <View style={{ marginTop: spacing.md }}>
          <Txt variant="label" color={colors.textFaint}>
            Aperçu sur l’accueil joueur
          </Txt>
          <View style={styles.preview}>
            <Ionicons name="megaphone" size={18} color={colors.purple} />
            <View style={{ flex: 1 }}>
              <Txt variant="body" style={{ fontWeight: '700' }} numberOfLines={2}>
                {title.trim()}
              </Txt>
              {subtitle.trim() ? (
                <Txt variant="small" color={colors.textMuted} numberOfLines={2}>
                  {subtitle.trim()}
                </Txt>
              ) : null}
              {link.trim() ? (
                <Txt variant="small" color={colors.purple} style={{ fontWeight: '600', marginTop: 2 }}>
                  En savoir plus →
                </Txt>
              ) : null}
            </View>
            <View style={styles.previewClose}>
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </View>
          </View>
        </View>
      ) : null}
      {/* Push OPTIONNEL (47) : l'actu s'affiche toujours en bandeau ; la notification aux
          joueurs, elle, ne part que si cette case est cochée AU moment de publier. */}
      <View style={styles.pushRow}>
        <View style={{ flex: 1 }}>
          <Txt variant="body" style={{ fontWeight: '600' }}>
            Envoyer aussi en notification
          </Txt>
          <Txt variant="small" color={colors.textMuted}>
            Tous les joueurs reçoivent l’actu en push — à réserver aux annonces importantes.
          </Txt>
        </View>
        <Switch
          value={sendPush}
          onValueChange={setSendPush}
          trackColor={{ true: colors.signature, false: colors.border }}
          thumbColor={colors.white}
        />
      </View>
      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
        <Button
          size="sm"
          label={publishing ? 'Publication…' : saved ? 'Publiée ✓' : sendPush ? 'Publier + notifier' : 'Publier l’actu'}
          icon={saved ? 'checkmark' : 'megaphone'}
          onPress={publish}
          disabled={title.trim().length < 3 || publishing}
          full
        />
        {news ? (
          <Button
            size="sm"
            variant="ghost"
            label="Retirer l’actu de l’accueil"
            icon="trash-outline"
            onPress={() => {
              // On ATTEND le serveur : on ne vide les champs qu'au vrai succès (sinon, hors-ligne,
              // l'actu resterait publiée pour tous alors que l'éditeur semble vidé).
              void onRemove().then(({ ok }) => {
                if (!ok) {
                  toast.show('Retrait impossible — vérifie ta connexion', { icon: 'alert-circle' });
                  return;
                }
                setTitle('');
                setSubtitle('');
                setLink('');
              });
            }}
            full
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  pushRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  // Réplique fidèle du bandeau d’accueil (index.tsx, styles.newsBanner/newsClose).
  preview: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.purpleSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  previewClose: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
