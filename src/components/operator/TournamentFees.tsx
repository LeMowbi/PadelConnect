import { View } from 'react-native';
import { Button, Card, Divider, Tag, Txt } from '@/components/ui';
import { type Competition } from '@/data/competitions';
import { openWhatsApp } from '@/lib/contact';
import { fcfa } from '@/lib/format';
import { colors, spacing } from '@/theme';

// Frais à encaisser sur les tournois JOUEURS : l’opérateur voit chaque tournoi publié, son
// montant et le contact de l’organisateur → il le relance par WhatsApp (règlement Wave via le
// lien), puis confirme la réception. Le paiement est SERVEUR (payment_status, v2) : dès que
// l’opérateur confirme, l’organisateur voit « frais réglés ✓ » dans sa fiche tournoi.
export function TournamentFees({ comps, onConfirm }: { comps: Competition[]; onConfirm: (compId: string) => Promise<void> }) {
  if (comps.length === 0) {
    return (
      <Card>
        <Txt variant="small" color={colors.textMuted}>
          Aucun tournoi joueur à encaisser. Dès qu’un joueur organise un tournoi validé par son club, il apparaît ici avec son montant et le
          contact de l’organisateur pour le règlement par Wave.
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
              {paid ? <Tag label="Réglé" tone="green" icon="checkmark" /> : null}
            </View>
            {!paid ? (
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                {c.organizerPhone ? (
                  <Button size="sm" label="Relancer (Wave)" icon="logo-whatsapp" variant="secondary" onPress={contact} />
                ) : null}
                <View style={{ flex: 1 }}>
                  <Button size="sm" label="Paiement reçu" icon="checkmark" onPress={() => void onConfirm(c.id)} full />
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}
