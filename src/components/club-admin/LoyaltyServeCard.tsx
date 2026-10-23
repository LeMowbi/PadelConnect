import { useEffect, useState } from 'react';
import { AppState, StyleSheet, TextInput, View } from 'react-native';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, Tag, Txt } from '@/components/ui';
import { confirmAsync } from '@/lib/confirm';
import { dateKeyLabel, dayKey } from '@/lib/days';
import { fcfa } from '@/lib/format';
import { hapticSuccess } from '@/lib/haptics';
import { isLoyaltyCode, loyaltyDiscount, normalizeLoyaltyCode } from '@/lib/loyalty';
import {
  clubServeLoyaltyClaim,
  fetchClubLoyaltyServed,
  fetchLoyaltyCap,
  type ClubLoyaltyServed,
  type ServeLoyaltyStatus,
} from '@/lib/social';
import { colors, radius, spacing } from '@/theme';

// Récompense fidélité PadelConnect (92) : le joueur montre son CODE (6 caractères, carte fidélité
// de son profil), le gérant saisit le code et le PRIX du match → l'app calcule −50 % plafonné,
// le serveur enregistre la remise ET le prix déclaré (remise ≤ moitié du prix, atomique : un code
// ne se sert qu'une fois) et PadelConnect la DÉDUIT du décompte de commission du club sur la
// semaine. Écriture honnête (on attend le serveur), messages PAR CODE, convention §8 (null =
// échec réseau ≠ [] = aucune remise).
// Le serveur plafonne à 30 essais de code / heure / compte (anti-devinette, 'rate_limited').

// Bornes du prix saisi — mêmes que `reservations_price_guard` (SQL 40) : au-delà, c'est une
// faute de frappe, pas un match.
const PRICE_MIN = 1000;
const PRICE_MAX = 1000000;

export function LoyaltyServeCard({ clubId, clubName, connected }: { clubId: string; clubName: string; connected: boolean }) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [price, setPrice] = useState('');
  const [serving, setServing] = useState(false); // garde anti double-tap (deux taps = 'already' au 2ᵉ, mais inutile)
  // Plafond RÉEL (opérateur) : undefined = lecture en cours ; null = échec réseau (§8). Tant qu'il
  // n'est pas lu, AUCUNE remise n'est calculée ni servie — jamais un plafond inventé (un défaut
  // ferait servir moins que ce que la carte du joueur promet si l'opérateur l'a relevé).
  // 'unsupported' = serveur d'avant la 92 : fidélité « bientôt disponible », jamais « connexion ».
  const [cap, setCap] = useState<number | 'unsupported' | null | undefined>(undefined);
  // undefined = chargement ; null = échec réseau (≠ [] = aucune remise servie), convention §8.
  const [served, setServed] = useState<ClubLoyaltyServed[] | null | undefined>(undefined);

  useEffect(() => {
    if (!connected) return;
    let alive = true;
    // Échec réseau → on garde la liste déjà affichée (jamais de liste vidée à tort, §8).
    const load = () => {
      void fetchClubLoyaltyServed(clubId).then((rows) => alive && setServed((cur) => rows ?? (cur === undefined ? null : cur)));
      void fetchLoyaltyCap().then((c) => alive && setCap((cur) => c ?? (cur === undefined ? null : cur)));
    };
    load();
    // Retour au premier plan : l'opérateur a pu changer le plafond, un autre gérant servir un code.
    const sub = AppState.addEventListener('change', (st) => st === 'active' && load());
    return () => {
      alive = false;
      sub.remove();
    };
  }, [clubId, connected]);

  // Relecture du plafond (bouton « Réessayer », ou après 'over_cap' : il a changé côté opérateur).
  const reloadCap = () => {
    setCap(undefined);
    void fetchLoyaltyCap().then((c) => setCap(c));
  };

  const capValue = typeof cap === 'number' ? cap : null;
  const priceValue = Number(price);
  const priceOk = Number.isInteger(priceValue) && priceValue >= PRICE_MIN && priceValue <= PRICE_MAX;
  const amount = priceOk && capValue !== null ? loyaltyDiscount(priceValue, capValue) : 0;
  const canServe = connected && isLoyaltyCode(code) && amount > 0 && !serving;

  const serve = async () => {
    if (!canServe) return;
    const normalized = normalizeLoyaltyCode(code);
    const ok = await confirmAsync(
      'Servir la remise ?',
      `${fcfa(amount)} de remise sur ce match pour le code ${normalized}. PadelConnect te la rembourse : elle sera déduite de ton décompte de la semaine.`,
      { confirmLabel: 'Servir' },
    );
    if (!ok) return;
    setServing(true);
    const res: ServeLoyaltyStatus = await clubServeLoyaltyClaim(clubId, normalized, amount, priceValue);
    setServing(false);
    if (res === 'ok') {
      hapticSuccess();
      toast.show(`Remise de ${fcfa(amount)} servie ✓ — déduite de ton décompte`);
      setCode('');
      setPrice('');
      const rows = await fetchClubLoyaltyServed(clubId);
      setServed((cur) => rows ?? (cur === undefined ? null : cur));
      return;
    }
    // Un message PAR code : « réessaie » réservé à l'échec réseau.
    const messages: Record<Exclude<ServeLoyaltyStatus, 'ok'>, string> = {
      not_found: 'Code inconnu — vérifie-le avec le joueur (6 caractères, sur sa carte fidélité).',
      already: 'Ce code a déjà été servi — une récompense ne se sert qu’une fois.',
      over_cap: 'Le plafond a changé — vérifie la remise recalculée, puis réessaie.',
      invalid: 'Montant invalide — saisis le prix du match.',
      forbidden: `Action réservée au gérant de ${clubName}.`,
      rate_limited: 'Trop de codes essayés en une heure — réessaie plus tard (protection contre les codes devinés).',
      unsupported: 'Fidélité bientôt disponible — tu pourras servir les remises dès la mise à jour du serveur.',
      error: 'Connexion impossible — réessaie',
    };
    toast.show(messages[res], { icon: res === 'error' ? 'cloud-offline-outline' : 'alert-circle' });
    // Le plafond a changé : on le relit (bouton grisé le temps de la lecture) pour un calcul juste.
    if (res === 'over_cap') reloadCap();
  };

  return (
    <Card>
      <Txt variant="muted">
        10 réservations créées et jouées = −50 % sur le prochain match du joueur
        {capValue !== null ? ` (jusqu’à ${fcfa(capValue)})` : ''}, offert par PadelConnect. Il te montre son code : saisis-le avec le prix
        du match, la remise est déduite de ton décompte de la semaine.
      </Txt>

      {!connected ? (
        <Txt variant="small" color={colors.amberDark} style={{ marginTop: spacing.sm }}>
          Connecte-toi pour servir les récompenses de {clubName}.
        </Txt>
      ) : (
        <>
          <TextInput
            value={code}
            onChangeText={(t) => setCode(normalizeLoyaltyCode(t))}
            placeholder="Code du joueur (6 caractères)"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8} // 6 + tolérance d'un séparateur tapé (retiré à la saisie)
            editable={!serving}
            accessibilityLabel="Code fidélité du joueur"
            style={[styles.input, styles.code]}
          />
          <TextInput
            value={price}
            onChangeText={(t) => setPrice(t.replace(/\D/g, ''))}
            placeholder="Prix du match (FCFA)"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            maxLength={7}
            editable={!serving}
            accessibilityLabel="Prix du match en FCFA"
            style={styles.input}
          />
          {price.trim() !== '' && !priceOk ? (
            <Txt variant="small" color={colors.danger} style={{ marginTop: spacing.sm }}>
              Le prix doit être entre {fcfa(PRICE_MIN)} et {fcfa(PRICE_MAX)}.
            </Txt>
          ) : null}
          {cap === undefined ? (
            <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
              Lecture du plafond de la remise…
            </Txt>
          ) : cap === 'unsupported' ? (
            <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
              Fidélité bientôt disponible — tu pourras servir les remises dès la mise à jour du serveur.
            </Txt>
          ) : cap === null ? (
            <View style={[styles.listRow, { marginTop: spacing.sm }]}>
              <Txt variant="small" color={colors.amberDark} style={{ flex: 1 }}>
                Plafond de la remise non lu — vérifie ta connexion.
              </Txt>
              <Button size="sm" variant="ghost" label="Réessayer" icon="refresh" onPress={reloadCap} />
            </View>
          ) : amount > 0 ? (
            <Txt variant="body" style={{ marginTop: spacing.sm, fontWeight: '700' }}>
              Remise à servir : {fcfa(amount)}
              {amount < Math.round(priceValue / 2) ? ` (plafond ${fcfa(cap)})` : ' (−50 %)'}
            </Txt>
          ) : null}
          <View style={{ marginTop: spacing.sm }}>
            <Button
              size="sm"
              label={serving ? 'Enregistrement…' : 'Servir la remise'}
              icon="gift-outline"
              onPress={() => void serve()}
              disabled={!canServe}
            />
          </View>

          {/* Remises servies par ce club (récentes d'abord) — la trace de ce qui est déduit. */}
          <Divider style={{ marginVertical: spacing.md }} />
          <Txt variant="label">Remises servies</Txt>
          <View style={{ marginTop: spacing.sm }}>
            {served === undefined ? (
              <Txt variant="small" color={colors.textMuted}>
                Chargement…
              </Txt>
            ) : served === null ? (
              <Txt variant="small" color={colors.textMuted}>
                Remises indisponibles — vérifie ta connexion.
              </Txt>
            ) : served.length === 0 ? (
              <Txt variant="small" color={colors.textFaint}>
                Aucune remise servie pour l’instant.
              </Txt>
            ) : (
              served.map((s, i) => (
                <View key={s.id}>
                  {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
                  <View style={styles.listRow}>
                    <View style={{ flex: 1 }}>
                      <Txt variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>
                        {s.playerName}
                      </Txt>
                      <Txt variant="small" color={colors.textFaint} numberOfLines={1}>
                        {/* Date en UTC (clé de jour) — même motif que l'historique du club. */}
                        {dateKeyLabel(dayKey(new Date(s.servedAt)))} · code {s.code}
                        {s.matchPrice !== null ? ` · match à ${fcfa(s.matchPrice)}` : ''}
                      </Txt>
                    </View>
                    <Tag label={`−${fcfa(s.amount)}`} tone="amber" icon="gift-outline" />
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
  // Le code se lit lettre à lettre au comptoir : espacé et un peu plus grand.
  code: { letterSpacing: 2, fontSize: 16, fontWeight: '700' },
});
