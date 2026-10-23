import { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Divider, Tag, Txt } from '@/components/ui';
import { type Competition } from '@/data/competitions';
import { confirmAsync } from '@/lib/confirm';
import { openWhatsApp } from '@/lib/contact';
import { fcfa } from '@/lib/format';
import { colors, spacing } from '@/theme';

// Frais à encaisser sur les tournois JOUEURS : l’opérateur voit chaque tournoi publié, son
// montant et le contact de l’organisateur → il le relance par WhatsApp (règlement Wave via le
// lien), puis confirme la réception. Le paiement est SERVEUR (payment_status, v2) : dès que
// l’opérateur confirme, l’organisateur voit « frais réglés ✓ » dans sa fiche tournoi.
// « Paiement reçu » efface une créance : on le fait CONFIRMER, et un tap erroné s’annule
// (« Annuler » → le tournoi repasse « à régler », 97 / R-68).
// Tournoi ANNULÉ par son club hôte ou par l’opérateur (T-12, 98) : frais annulés, et le tournoi
// n’est plus jamais renvoyé par fetch_competitions — il quitte donc cette liste. Des frais déjà
// encaissés passent « à rembourser » : notify-club prévient l’opérateur. La carte le DIT
// (CANCELLED_NOTE), sans quoi une créance qui disparaît ressemblerait à une perte de donnée.
const CANCELLED_NOTE =
  'Tournoi annulé par son club (ou par toi) : il quitte cette liste, ses frais sont annulés. S’ils étaient déjà réglés, tu reçois la notification « Frais de tournoi à rembourser » : rembourse l’organisateur par Wave.';

export function TournamentFees({
  comps,
  onConfirm,
  onUnconfirm,
}: {
  comps: Competition[];
  onConfirm: (compId: string) => Promise<void>;
  onUnconfirm: (compId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null); // anti double-tap (déclaré avant le return anticipé)
  const run = async (id: string, action: (compId: string) => Promise<void>) => {
    if (busy) return;
    setBusy(id);
    try {
      await action(id);
    } finally {
      setBusy(null);
    }
  };
  const confirm = async (c: Competition) => {
    if (busy) return;
    const yes = await confirmAsync(
      'Paiement reçu ?',
      `Confirme que tu as bien reçu ${fcfa(c.commission ?? 0)} de ${c.organizer} pour « ${c.title} ». L’organisateur verra « frais réglés ✓ » dans sa fiche.`,
      { confirmLabel: 'Oui, reçu' },
    );
    if (yes) await run(c.id, onConfirm);
  };
  if (comps.length === 0) {
    return (
      <Card>
        <Txt variant="small" color={colors.textMuted}>
          Aucun tournoi joueur à encaisser. Dès qu’un joueur organise un tournoi validé par son club, il apparaît ici avec son montant et le
          contact de l’organisateur pour le règlement par Wave.
        </Txt>
        <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
          {CANCELLED_NOTE}
        </Txt>
      </Card>
    );
  }
  return (
    <Card>
      {comps.map((c, i) => {
        const paid = c.paymentStatus === 'paid';
        const contact = () =>
          c.organizerPhone
            ? openWhatsApp(
                c.organizerPhone,
                `Bonjour ${c.organizer}, pour ton tournoi « ${c.title} » sur PadelConnect, les frais d’organisation sont de ${fcfa(c.commission ?? 0)} à régler par Wave. Merci !`,
              )
            : undefined;
        return (
          <View key={c.id}>
            {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Txt variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>
                  {c.title}
                </Txt>
                <Txt variant="muted">
                  {c.organizer} · {fcfa(c.commission ?? 0)}
                  {c.organizerPhone ? ` · ${c.organizerPhone}` : ''}
                </Txt>
              </View>
              {paid ? (
                <>
                  <Tag label="Réglé" tone="green" icon="checkmark" />
                  <Button
                    size="sm"
                    label={busy === c.id ? '…' : 'Annuler'}
                    icon="arrow-undo"
                    variant="ghost"
                    onPress={() => void run(c.id, onUnconfirm)}
                    disabled={busy !== null}
                    accessibilityLabel={`Annuler le paiement reçu — ${c.title}`}
                  />
                </>
              ) : null}
            </View>
            {!paid ? (
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                {c.organizerPhone ? (
                  <Button size="sm" label="Relancer (Wave)" icon="logo-whatsapp" variant="secondary" onPress={contact} />
                ) : null}
                <View style={{ flex: 1 }}>
                  <Button
                    size="sm"
                    label={busy === c.id ? '…' : 'Paiement reçu'}
                    icon="checkmark"
                    onPress={() => void confirm(c)}
                    disabled={busy !== null}
                    accessibilityLabel={`Paiement reçu — ${c.title}`}
                    full
                  />
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
      <Divider style={{ marginVertical: spacing.sm }} />
      <Txt variant="small" color={colors.textFaint}>
        {CANCELLED_NOTE}
      </Txt>
    </Card>
  );
}
