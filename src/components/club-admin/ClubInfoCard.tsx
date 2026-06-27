import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Chip } from '@/components/Chip';
import { Button, Card, Txt } from '@/components/ui';
import { type Club, type PriceTier } from '@/data/clubs';
import { validateTiers } from '@/lib/pricing';
import { type ClubInfo } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

// 3 lignes de plages tarifaires éditables (nom optionnel, heure début, fin, prix). Vide = ignorée.
type TierRow = { start: string; end: string; price: string; label: string };

const CLUB_TYPES: Club['type'][] = ['Couvert', 'Extérieur', 'Mixte'];

function emptyTiers(club: Club): TierRow[] {
  const seed = (club.priceTiers ?? []).map((t) => ({ start: t.start, end: t.end, price: String(t.price), label: t.label ?? '' }));
  const rows = [...seed];
  while (rows.length < 3) rows.push({ start: '', end: '', price: '', label: '' });
  return rows.slice(0, 3);
}

// Infos éditables du club (nom, quartier, description, type, tarifs par plage, WhatsApp).
export function ClubInfoCard({ club, onSave }: { club: Club & { contactPhone?: string }; onSave: (patch: ClubInfo) => void }) {
  const [name, setName] = useState(club.name);
  const [area, setArea] = useState(club.area);
  const [blurb, setBlurb] = useState(club.blurb);
  const [type, setType] = useState<Club['type']>(club.type);
  const [price, setPrice] = useState(String(club.priceFrom));
  const [tiers, setTiers] = useState<TierRow[]>(emptyTiers(club));
  const [phone, setPhone] = useState(club.contactPhone ?? '');
  const [saved, setSaved] = useState(false);
  const [tierError, setTierError] = useState<string | null>(null);

  const setTier = (i: number, patch: Partial<TierRow>) => {
    setTierError(null);
    setTiers((cur) => cur.map((t, k) => (k === i ? { ...t, ...patch } : t)));
  };

  const ready = name.trim().length >= 2 && area.trim().length >= 2 && Number(price) > 0;
  const save = () => {
    if (!ready) return;
    // On ne garde que les plages complètes (début, fin, prix > 0). Aucune → tarif unique.
    const built: PriceTier[] = tiers
      .filter((t) => t.start.trim() && t.end.trim() && Number(t.price) > 0)
      .map((t) => ({ start: t.start.trim(), end: t.end.trim(), price: Number(t.price), label: t.label.trim() || undefined }));
    // Validation À LA SOURCE : des plages doivent couvrir 07:00→24:00 sans trou ni
    // chevauchement. Échec → on N'ENREGISTRE RIEN (l'état du club reste intact).
    const v = validateTiers(built);
    if (!v.ok) {
      setTierError(v.error);
      return;
    }
    setTierError(null);
    onSave({
      name: name.trim(),
      area: area.trim(),
      blurb: blurb.trim(),
      type,
      priceFrom: Number(price),
      priceTiers: built.length ? built : undefined,
      contactPhone: phone.trim() || undefined,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <Card>
      <TextInput value={name} onChangeText={setName} placeholder="Nom du club" placeholderTextColor={colors.textFaint} style={styles.input} />
      <TextInput value={area} onChangeText={setArea} placeholder="Quartier / commune" placeholderTextColor={colors.textFaint} style={styles.input} />
      <TextInput
        value={blurb}
        onChangeText={setBlurb}
        placeholder="Description (visible par les joueurs)"
        placeholderTextColor={colors.textFaint}
        multiline
        style={[styles.input, { minHeight: 64, textAlignVertical: 'top' }]}
      />
      <View style={[styles.wrap, { marginTop: spacing.md }]}>
        {CLUB_TYPES.map((t) => (
          <Chip key={t} label={t} active={type === t} onPress={() => setType(t)} />
        ))}
      </View>
      <TextInput
        value={price}
        onChangeText={setPrice}
        placeholder="Tarif unique de la session 1h30 (FCFA)"
        placeholderTextColor={colors.textFaint}
        keyboardType="numeric"
        style={styles.input}
      />

      {/* Tarifs par plage horaire — définis librement (nom optionnel + heures creuses / prime time / soirée). */}
      <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.md }}>
        TARIFS PAR PLAGE (OPTIONNEL — SINON LE TARIF UNIQUE S'APPLIQUE)
      </Txt>
      {tiers.map((t, i) => (
        <View key={i} style={{ marginTop: spacing.sm }}>
          <TextInput value={t.label} onChangeText={(v) => setTier(i, { label: v })} placeholder="Nom de la plage (ex. Journée — optionnel)" placeholderTextColor={colors.textFaint} style={[styles.input, { marginTop: 0 }]} />
          <View style={[styles.tierRow, { marginTop: spacing.xs }]}>
            <TextInput value={t.start} onChangeText={(v) => setTier(i, { start: v })} placeholder="07:00" placeholderTextColor={colors.textFaint} style={[styles.input, styles.tierCell, { marginTop: 0 }]} />
            <Txt variant="muted">→</Txt>
            <TextInput value={t.end} onChangeText={(v) => setTier(i, { end: v })} placeholder="16:00" placeholderTextColor={colors.textFaint} style={[styles.input, styles.tierCell, { marginTop: 0 }]} />
            <TextInput value={t.price} onChangeText={(v) => setTier(i, { price: v })} placeholder="FCFA" placeholderTextColor={colors.textFaint} keyboardType="numeric" style={[styles.input, styles.tierPrice, { marginTop: 0 }]} />
          </View>
        </View>
      ))}
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.xs }}>
        Si tu définis des plages, elles doivent couvrir 07:00 → 24:00 sans trou. Nomme-les (Journée, Soirée…) pour les afficher en onglets sur ta page.
      </Txt>
      {tierError ? (
        <View style={styles.tierErrorBox}>
          <Ionicons name="alert-circle" size={15} color={colors.danger} />
          <Txt variant="small" color={colors.danger} style={{ flex: 1 }}>
            {tierError}
          </Txt>
        </View>
      ) : null}

      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="WhatsApp du club (optionnel — affiche « Contacter le club »)"
        placeholderTextColor={colors.textFaint}
        keyboardType="phone-pad"
        style={styles.input}
      />
      <View style={{ marginTop: spacing.md }}>
        <Button
          size="sm"
          label={saved ? 'Enregistré ✓' : 'Enregistrer les infos'}
          icon={saved ? 'checkmark-circle' : 'save-outline'}
          variant={saved ? 'secondary' : 'primary'}
          onPress={save}
          disabled={!ready}
          full
        />
      </View>
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
        Ces infos s'appliquent immédiatement sur ta page et dans les listes.
      </Txt>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    marginTop: spacing.sm,
    flex: 1,
  },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  tierCell: { flex: 1, textAlign: 'center' },
  tierPrice: { flex: 1.3 },
  tierErrorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
});
