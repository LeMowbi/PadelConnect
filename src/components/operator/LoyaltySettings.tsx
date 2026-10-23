import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, IconCircle, StatTile, Txt } from '@/components/ui';
import { opStyles } from '@/components/operator/styles';
import { weekLabel } from '@/lib/days';
import { fcfa } from '@/lib/format';
import { LOYALTY_CAP_MAX, LOYALTY_CAP_MIN } from '@/lib/loyalty';
import { fetchLoyaltyCap, fetchOperatorLoyaltyCost, setLoyaltyCap } from '@/lib/social';
import { colors, spacing } from '@/theme';

// FIDÉLITÉ PadelConnect (92) — réglages opérateur : le PLAFOND de la remise (−50 % du match,
// jusqu'à ce montant, 5 000 FCFA par défaut) et le COÛT de la fidélité (remises servies par
// les clubs, remboursées par déduction de leur décompte). Écriture HONNÊTE : on attend le
// serveur avant de dire « enregistré » ; resync du champ sans écraser une saisie (patron WaveLink).
export function LoyaltySettings({
  week,
  weekCost,
  refreshKey,
  toast,
}: {
  week: string;
  // Coût de la semaine SÉLECTIONNÉE dans Finances (dérivé des remises déjà chargées par l'écran) :
  // undefined = chargement, null = remises non lues (échec réseau) — jamais « 0 FCFA » à tort.
  weekCost: number | null | undefined;
  // Incrémenté par le pull-to-refresh de l'écran : relit le plafond et le coût total.
  refreshKey: number;
  toast: ReturnType<typeof useToast>;
}) {
  // Plafond SERVEUR : null = pas encore lu (ou échec réseau) — jamais une valeur inventée (§8).
  const [server, setServer] = useState<number | null>(null);
  const [capError, setCapError] = useState(false); // dernière lecture du plafond en échec
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  // Resynchronise le champ quand la valeur serveur arrive/change, SEULEMENT si l'opérateur n'a
  // pas de saisie en cours (rendu, pas effet — même patron que WaveLink).
  const [synced, setSynced] = useState<number | null>(null);
  if (server !== synced) {
    const untouched = value.trim() === (synced === null ? '' : String(synced));
    setSynced(server);
    if (untouched) setValue(server === null ? '' : String(server));
  }
  // Coût TOTAL depuis le lancement : undefined = chargement, null = échec réseau.
  const [total, setTotal] = useState<{ total: number; served: number } | null | undefined>(undefined);

  // Montage + chaque pull-to-refresh. Échec réseau : on garde la dernière valeur connue (§8).
  useEffect(() => {
    let alive = true;
    void fetchLoyaltyCap().then((c) => {
      if (!alive) return;
      setCapError(c === null);
      if (c !== null) setServer(c);
    });
    void fetchOperatorLoyaltyCost(0, Date.now() + 86400000).then((c) => alive && setTotal((cur) => c ?? (cur === undefined ? null : cur)));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const cap = Number(value);
  const capOk = Number.isInteger(cap) && cap >= LOYALTY_CAP_MIN && cap <= LOYALTY_CAP_MAX;
  const dirty = value.trim() !== (server === null ? '' : String(server));
  const save = async () => {
    if (saving || !capOk) return; // garde anti double-tap + bornes serveur
    setSaving(true);
    const ok = await setLoyaltyCap(cap);
    setSaving(false);
    if (ok) setServer(cap);
    toast.show(ok ? `Plafond fixé à ${fcfa(cap)} ✅` : 'Enregistrement impossible — réessaie', ok ? undefined : { icon: 'alert-circle' });
  };

  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <IconCircle icon="gift" color={colors.amberDark} bg={colors.amberSoft} size={40} />
        <Txt variant="h3" style={{ flex: 1 }}>
          Fidélité PadelConnect
        </Txt>
      </View>
      <Divider />
      <Txt variant="muted">
        10 réservations créées et jouées (ni invitations, ni cours, ni absences) = −50 % sur le prochain match, offert par PadelConnect. Le
        club sert la remise sur présentation du code du joueur ; elle est déduite de son décompte de la semaine, ligne par ligne ci-dessus.
      </Txt>

      <Txt variant="label">Plafond de la remise (FCFA)</Txt>
      <TextInput
        value={value}
        onChangeText={(t) => setValue(t.replace(/\D/g, ''))}
        placeholder={server !== null ? String(server) : capError ? 'Plafond non lu' : 'Chargement…'}
        placeholderTextColor={colors.textMuted}
        keyboardType="numeric"
        maxLength={7}
        accessibilityLabel="Plafond de la remise fidélité, en FCFA"
        style={[opStyles.clubInput, { marginTop: 0 }]}
      />
      {server === null && capError ? (
        <Txt variant="small" color={colors.textMuted}>
          Plafond actuel non lu — vérifie ta connexion, puis tire pour rafraîchir.
        </Txt>
      ) : null}
      {value.trim() !== '' && !capOk ? (
        <Txt variant="small" color={colors.danger}>
          Le plafond doit être entre {fcfa(LOYALTY_CAP_MIN)} et {fcfa(LOYALTY_CAP_MAX)}.
        </Txt>
      ) : null}
      <Button
        label={saving ? 'Enregistrement…' : 'Enregistrer le plafond'}
        icon="save-outline"
        onPress={save}
        disabled={saving || !dirty || !capOk}
        full
      />

      <Divider />
      <Txt variant="label">Coût de la fidélité</Txt>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <StatTile
          value={weekCost === undefined ? '…' : weekCost === null ? '—' : fcfa(weekCost)}
          label={`Semaine ${weekLabel(week)}`}
          color={colors.amberDark}
          bg={colors.amberSoft}
        />
        <StatTile
          value={total === undefined ? '…' : total === null ? '—' : fcfa(total.total)}
          label={
            total && total.served > 0 ? `Depuis le lancement · ${total.served} remise${total.served > 1 ? 's' : ''}` : 'Depuis le lancement'
          }
          color={colors.amberDark}
          bg={colors.amberSoft}
        />
      </View>
      {weekCost === null || total === null ? (
        <Txt variant="small" color={colors.textMuted}>
          Coût indisponible — vérifie ta connexion, puis tire pour rafraîchir.
        </Txt>
      ) : null}
    </Card>
  );
}
