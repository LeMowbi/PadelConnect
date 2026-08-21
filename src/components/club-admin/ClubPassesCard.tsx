import { useEffect, useState } from 'react';
import { AppState, StyleSheet, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, Tag, Txt } from '@/components/ui';
import { clubGrantPass, fetchClubPasses, type ClubPass } from '@/lib/passes';
import { isValidPhone } from '@/lib/phone';
import { colors, radius, spacing } from '@/theme';

// Carnets de séances (17) : le gérant crédite N séances à un joueur (par téléphone) puis
// DÉCOMPTE une réservation à la fois depuis l'onglet « Réservations » (un tap, côté serveur).
// Ici : le formulaire de crédit + les soldes des porteurs. Écriture honnête (on attend le
// serveur avant de vider le formulaire), convention §8 (null = échec réseau ≠ [] = aucun carnet).

// Indicatif Côte d'Ivoire pré-rempli (modifiable) — même idiome que les autres flux « par
// téléphone » (amis, coach, accès gérant).
const DEFAULT_DIAL = '+225 ';
// Formules courantes en un tap ; la saisie libre couvre le reste (1 à 100 = borne serveur).
const PRESETS = [5, 10, 20];

export function ClubPassesCard({ clubId, clubName, connected }: { clubId: string; clubName: string; connected: boolean }) {
  const toast = useToast();
  // undefined = chargement ; null = échec réseau (≠ [] = aucun carnet), convention §8.
  const [passes, setPasses] = useState<ClubPass[] | null | undefined>(undefined);
  const [phone, setPhone] = useState(DEFAULT_DIAL);
  const [total, setTotal] = useState('10');
  const [label, setLabel] = useState('');
  const [granting, setGranting] = useState(false); // garde anti double-tap (deux taps = deux carnets)

  useEffect(() => {
    if (!connected) return;
    let alive = true;
    // Échec réseau → on garde la liste déjà affichée (jamais de liste vidée à tort, §8).
    const load = () => void fetchClubPasses(clubId).then((rows) => alive && setPasses((cur) => rows ?? (cur === undefined ? null : cur)));
    load();
    // Retour au premier plan : le solde serveur bouge dans le dos du miroir (décompte d'un autre
    // gérant, séance REMBOURSÉE par le trigger 85 à l'annulation d'une résa) — parité ClubPassCard.
    const sub = AppState.addEventListener('change', (st) => st === 'active' && load());
    return () => {
      alive = false;
      sub.remove();
    };
  }, [clubId, connected]);

  const reload = async () => {
    const rows = await fetchClubPasses(clubId);
    setPasses((cur) => rows ?? (cur === undefined ? null : cur));
  };

  const count = Number(total);
  const countOk = Number.isInteger(count) && count >= 1 && count <= 100;
  const canGrant = connected && isValidPhone(phone) && countOk && !granting;

  const grant = async () => {
    if (!canGrant) return;
    setGranting(true);
    const name = await clubGrantPass(clubId, phone, count, label.trim());
    setGranting(false);
    // null = numéro introuvable, AMBIGU (deux comptes portent ce numéro → refus anti-usurpation),
    // hors bornes, ou panne réseau : un seul message net, et le formulaire reste rempli.
    if (!name) {
      toast.show('Numéro introuvable ou ambigu — vérifie avec le joueur', { icon: 'alert-circle' });
      return;
    }
    toast.show(`Carnet crédité à ${name} ✓`);
    setPhone(DEFAULT_DIAL);
    setLabel('');
    await reload();
  };

  return (
    <Card>
      <Txt variant="muted">
        Vends un carnet de séances à tes habitués (payé au club, hors app) : tu le crédites ici avec leur numéro, puis tu décomptes une
        séance sur leur réservation dans l’onglet « Réservations ».
      </Txt>

      {!connected ? (
        <Txt variant="small" color={colors.amberDark} style={{ marginTop: spacing.sm }}>
          Connecte-toi pour créditer les carnets de {clubName}.
        </Txt>
      ) : (
        <>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="Numéro du joueur (+225…)"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            maxLength={20}
            accessibilityLabel="Numéro de téléphone du joueur"
            style={styles.input}
          />

          <Txt variant="label" style={{ marginTop: spacing.md }}>
            Séances
          </Txt>
          <View style={styles.wrap}>
            {PRESETS.map((n) => (
              <Chip key={n} label={`${n} séances`} active={total === String(n)} onPress={() => setTotal(String(n))} />
            ))}
          </View>
          <TextInput
            value={total}
            onChangeText={setTotal}
            placeholder="Nombre de séances (1 à 100)"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            maxLength={3}
            accessibilityLabel="Nombre de séances du carnet"
            style={styles.input}
          />
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="Libellé (optionnel — ex. Carnet 10 séances 1h30)"
            placeholderTextColor={colors.textMuted}
            maxLength={60}
            accessibilityLabel="Libellé du carnet (optionnel)"
            style={styles.input}
          />
          <View style={{ marginTop: spacing.sm }}>
            <Button
              size="sm"
              label={granting ? 'Enregistrement…' : 'Créditer le carnet'}
              icon="ticket-outline"
              onPress={() => void grant()}
              disabled={!canGrant}
            />
          </View>
          {total.trim() !== '' && !countOk ? (
            <Txt variant="small" color={colors.danger} style={{ marginTop: spacing.sm }}>
              Le carnet doit faire entre 1 et 100 séances.
            </Txt>
          ) : null}

          {/* Soldes — les carnets encore actifs d'abord (ordre serveur). */}
          <Divider style={{ marginVertical: spacing.md }} />
          <Txt variant="label">Carnets du club</Txt>
          <View style={{ marginTop: spacing.sm }}>
            {passes === undefined ? (
              <Txt variant="small" color={colors.textMuted}>
                Chargement…
              </Txt>
            ) : passes === null ? (
              <Txt variant="small" color={colors.textMuted}>
                Carnets indisponibles — vérifie ta connexion.
              </Txt>
            ) : passes.length === 0 ? (
              <Txt variant="small" color={colors.textFaint}>
                Aucun carnet pour l’instant.
              </Txt>
            ) : (
              passes.map((p, i) => (
                <View key={p.id}>
                  {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
                  <View style={styles.listRow}>
                    <View style={{ flex: 1 }}>
                      <Txt variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>
                        {p.playerName}
                      </Txt>
                      <Txt variant="small" color={colors.textFaint} numberOfLines={1}>
                        {p.label || 'Carnet de séances'}
                      </Txt>
                    </View>
                    <Tag label={`${p.remaining}/${p.total}`} tone={p.remaining > 0 ? 'green' : 'neutral'} icon="ticket-outline" />
                    {p.remaining === 0 ? <Tag label="Épuisé" tone="coral" /> : null}
                  </View>
                </View>
              ))
            )}
          </View>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    marginTop: spacing.sm,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
  },
});
