import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Chip } from '@/components/Chip';
import { Button, Card, Txt } from '@/components/ui';
import { type Club, type PriceTier } from '@/data/clubs';
import { PRICE_MAX, PRICE_MIN, validateTiers } from '@/lib/pricing';
import { minutesToSlot } from '@/lib/slots';
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

// Infos éditables du club (nom, quartier, description, type, tarifs par plage, WhatsApp, Maps).
// openMin/closeMin = heures d'ouverture du club (minutes depuis minuit) → les plages tarifaires
// doivent couvrir CETTE amplitude, pas un 07:00→24:00 forcé (chaque club ouvre à son heure).
export function ClubInfoCard({
  club,
  onSave,
  openMin = 7 * 60,
  closeMin = 24 * 60,
}: {
  club: Club & { contactPhone?: string };
  onSave: (patch: ClubInfo) => Promise<{ ok: boolean }>;
  openMin?: number;
  closeMin?: number;
}) {
  const [name, setName] = useState(club.name);
  const [area, setArea] = useState(club.area);
  const [blurb, setBlurb] = useState(club.blurb);
  const [type, setType] = useState<Club['type']>(club.type);
  const [price, setPrice] = useState(String(club.priceFrom));
  const [tiers, setTiers] = useState<TierRow[]>(emptyTiers(club));
  const [phone, setPhone] = useState(club.contactPhone ?? '');
  const [mapsQuery, setMapsQuery] = useState(club.mapsQuery ?? '');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tierError, setTierError] = useState<string | null>(null);
  // Timer du « Enregistré ✓ » : nettoyé au démontage (comme le reste du projet).
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  // Instantané des valeurs au MONTAGE : « Enregistrer » n'envoie que les champs réellement
  // modifiés. Un champ non touché n'écrase ainsi jamais une valeur serveur plus récente
  // (réglée depuis un autre appareil pendant que ce formulaire était ouvert) — setClubInfo
  // complète le patch avec le miroir local, lui, tenu à jour en arrière-plan.
  const initial = useRef({
    name: club.name,
    area: club.area,
    blurb: club.blurb,
    type: club.type,
    price: String(club.priceFrom),
    tiers: JSON.stringify(emptyTiers(club)),
    phone: club.contactPhone ?? '',
    mapsQuery: club.mapsQuery ?? '',
  }).current;

  const openLabel = minutesToSlot(openMin);
  const closeLabel = minutesToSlot(closeMin);

  const setTier = (i: number, patch: Partial<TierRow>) => {
    setTierError(null);
    setTiers((cur) => cur.map((t, k) => (k === i ? { ...t, ...patch } : t)));
  };

  const ready = name.trim().length >= 2 && area.trim().length >= 2 && Number(price) > 0;
  const save = () => {
    if (!ready) return;
    // Tarif unique borné COMME LE SERVEUR (SQL 40) : hors bornes, il refuserait en silence
    // et la page divergerait entre ce téléphone et ceux des joueurs.
    if (Number(price) < PRICE_MIN || Number(price) > PRICE_MAX) {
      setTierError(`Tarif unique invalide (${price} F) : entre 1 000 et 1 000 000 FCFA la session.`);
      return;
    }
    // On ne garde que les plages complètes (début, fin, prix > 0). Aucune → tarif unique.
    const built: PriceTier[] = tiers
      .filter((t) => t.start.trim() && t.end.trim() && Number(t.price) > 0)
      .map((t) => ({ start: t.start.trim(), end: t.end.trim(), price: Number(t.price), label: t.label.trim() || undefined }));
    // Validation À LA SOURCE : des plages doivent couvrir les HEURES D’OUVERTURE du club
    // (openMin→closeMin) sans trou ni chevauchement. Échec → on N’ENREGISTRE RIEN (état intact).
    // SEULEMENT si les plages ont été touchées : une amplitude élargie entre-temps (horaire
    // libre ajouté) ne doit pas bloquer l'enregistrement d'un champ sans rapport (WhatsApp…).
    const tiersChanged = JSON.stringify(tiers) !== initial.tiers;
    if (tiersChanged) {
      const v = validateTiers(built, openMin, closeMin);
      if (!v.ok) {
        setTierError(v.error);
        return;
      }
    }
    setTierError(null);
    // Patch limité aux champs MODIFIÉS depuis le montage (cf. `initial`) : un champ intact
    // reprend la valeur du miroir local dans setClubInfo, jamais une valeur périmée d'ici.
    const patch: ClubInfo = {};
    if (name.trim() !== initial.name) patch.name = name.trim();
    if (area.trim() !== initial.area) patch.area = area.trim();
    if (blurb.trim() !== initial.blurb) patch.blurb = blurb.trim();
    if (type !== initial.type) patch.type = type;
    if (price !== initial.price) patch.priceFrom = Number(price);
    if (tiersChanged) patch.priceTiers = built.length ? built : undefined;
    if (phone.trim() !== initial.phone) patch.contactPhone = phone.trim() || undefined;
    if (mapsQuery.trim() !== initial.mapsQuery) patch.mapsQuery = mapsQuery.trim() || undefined;
    // On ATTEND le serveur : « Enregistré ✓ » ne s’affiche qu’au vrai succès (sinon, hors-ligne,
    // l’accusé mentait et la page se rétablissait silencieusement au prochain chargement).
    setSaving(true);
    void onSave(patch).then(({ ok }) => {
      setSaving(false);
      if (!ok) {
        setTierError('Enregistrement impossible — vérifie ta connexion et réessaie.');
        return;
      }
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 2500);
    });
  };

  return (
    <Card>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Nom du club"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />
      <TextInput
        value={area}
        onChangeText={setArea}
        placeholder="Quartier / commune"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />
      <TextInput
        value={blurb}
        onChangeText={setBlurb}
        placeholder="Description (visible par les joueurs)"
        placeholderTextColor={colors.textMuted}
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
        placeholderTextColor={colors.textMuted}
        keyboardType="numeric"
        style={styles.input}
      />

      {/* Tarifs par plage horaire — définis librement (nom optionnel + heures creuses / prime time / soirée). */}
      <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.md }}>
        TARIFS PAR PLAGE (OPTIONNEL — SINON LE TARIF UNIQUE S’APPLIQUE)
      </Txt>
      {tiers.map((t, i) => (
        <View key={i} style={{ marginTop: spacing.sm }}>
          <TextInput
            value={t.label}
            onChangeText={(v) => setTier(i, { label: v })}
            placeholder="Nom de la plage (ex. Journée — optionnel)"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { marginTop: 0 }]}
          />
          <View style={[styles.tierRow, { marginTop: spacing.xs }]}>
            <TextInput
              value={t.start}
              onChangeText={(v) => setTier(i, { start: v })}
              placeholder={openLabel}
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.tierCell, { marginTop: 0 }]}
            />
            <Txt variant="muted">→</Txt>
            <TextInput
              value={t.end}
              onChangeText={(v) => setTier(i, { end: v })}
              placeholder="16:00"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.tierCell, { marginTop: 0 }]}
            />
            <TextInput
              value={t.price}
              onChangeText={(v) => setTier(i, { price: v })}
              placeholder="FCFA"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              style={[styles.input, styles.tierPrice, { marginTop: 0 }]}
            />
          </View>
        </View>
      ))}
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.xs }}>
        Si tu définis des plages, elles doivent couvrir tes heures d’ouverture ({openLabel} → {closeLabel}) sans trou. Nomme-les (Journée,
        Soirée…) pour les afficher en onglets sur ta page.
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
        placeholderTextColor={colors.textMuted}
        keyboardType="phone-pad"
        style={styles.input}
      />

      {/* Position Google Maps : nom + adresse. Ouvre Maps depuis la fiche → « Itinéraire ».
          Éditable pour TOUS les clubs (même les fondateurs, dont le nom peut changer). */}
      <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.md }}>
        POSITION GOOGLE MAPS
      </Txt>
      <TextInput
        value={mapsQuery}
        onChangeText={setMapsQuery}
        placeholder="Nom + adresse (ex. Padelta, Cocody Danga, Abidjan)"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.xs }}>
        C’est ce que « Voir sur la carte » ouvre dans Google Maps. Le nom seul suffit s’il est bien référencé ; ajoute l’adresse ou le
        quartier pour être sûr de tomber au bon endroit.
      </Txt>

      <View style={{ marginTop: spacing.md }}>
        <Button
          size="sm"
          label={saving ? 'Enregistrement…' : saved ? 'Enregistré ✓' : 'Enregistrer les infos'}
          icon={saved ? 'checkmark-circle' : 'save-outline'}
          variant={saved ? 'secondary' : 'primary'}
          onPress={save}
          disabled={!ready || saving}
          full
        />
      </View>
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
        Ces infos s’appliquent immédiatement sur ta page et dans les listes.
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
