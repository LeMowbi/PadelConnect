import { View } from 'react-native';
import { Button, Card, Divider, Tag, Txt } from '@/components/ui';
import { type Competition } from '@/data/competitions';
import { openWhatsApp } from '@/lib/contact';
import { fcfa } from '@/lib/format';
import { colors, spacing } from '@/theme';

// Frais à encaisser sur les tournois JOUEURS : l’opérateur voit chaque tournoi publié, son
// montant et le contact de l’organisateur → il le relance par WhatsApp (règlement Wave) puis
// marque « réglé ». Suivi local à l’opérateur (comme les règlements de commission des clubs).
export function TournamentFees({
  comps,
  payments,
  onSetPaid,
}: {
  comps: Competition[];
  payments: Record<string, 'sent' | 'paid'>;
  onSetPaid: (compId: string, paid: boolean) => Promise<void>;
}) {
  if (comps.length === 0) {
    return (
      <Card>
        <Txt variant="small" color={colors.textMuted}>
          Aucun tournoi joueur à encaisser. Dès qu’un joueur organise un tournoi, il apparaît ici avec son montant et le contact de
          l’organisateur pour le règlement par Wave.
        </Txt>
      </Card>
    );
  }
  return (
    <Card>
      {comps.map((c, i) => {
        const paid = payments[`tourn:${c.id}`] === 'paid';
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
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              {c.organizerPhone && !paid ? (
                <Button size="sm" label="Contacter (Wave)" icon="logo-whatsapp" variant="secondary" onPress={contact} />
              ) : null}
              <View style={{ flex: 1 }}>
                <Button
                  size="sm"
                  label={paid ? 'Marquer non réglé' : 'Marquer réglé'}
                  variant={paid ? 'ghost' : 'primary'}
                  onPress={() => void onSetPaid(c.id, !paid)}
                  full
                />
              </View>
            </View>
          </View>
        );
      })}
    </Card>
  );
}
