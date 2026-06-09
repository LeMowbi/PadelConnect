import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card, IconCircle, SectionHeader, Tag, Txt } from '@/components/ui';
import { getClub } from '@/data/clubs';
import { COMMISSION_RATE, useApp } from '@/store/AppContext';
import { fcfa } from '@/lib/format';
import { colors, spacing } from '@/theme';

export default function Operateur() {
  const { state } = useApp();

  // Toutes les réservations sont payées (paiement → validation). On regroupe par club.
  const groups = new Map<string, { clubName: string; count: number; revenue: number }>();
  for (const r of state.reservations) {
    const price = getClub(r.clubId)?.priceFrom ?? 0;
    const g = groups.get(r.clubId) ?? { clubName: r.clubName, count: 0, revenue: 0 };
    g.count += 1;
    g.revenue += price;
    groups.set(r.clubId, g);
  }
  const rows = [...groups.entries()]
    .map(([clubId, g]) => ({ clubId, ...g, commission: Math.round(g.revenue * COMMISSION_RATE) }))
    .sort((a, b) => b.revenue - a.revenue);

  const totalCount = rows.reduce((s, r) => s + r.count, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCommission = rows.reduce((s, r) => s + r.commission, 0);

  return (
    <Screen back title="Espace opérateur" subtitle="PadelCo — commissions">
      <View style={styles.note}>
        <Ionicons name="information-circle-outline" size={15} color={colors.textFaint} />
        <Txt variant="small" color={colors.textFaint} style={{ flex: 1 }}>
          Vue réservée à l'opérateur. Historique des réservations payées et commission par club.
        </Txt>
      </View>

      <Card>
        <Txt variant="label" color={colors.textFaint}>
          Total (démo)
        </Txt>
        <View style={styles.totals}>
          <Total value={`${totalCount}`} label="Réservations" color={colors.text} />
          <Total value={fcfa(totalRevenue)} label="Volume" color={colors.green} />
          <Total value={fcfa(totalCommission)} label={`Commission ${Math.round(COMMISSION_RATE * 100)}%`} color={colors.gold} />
        </View>
      </Card>

      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Par club" />
        {rows.length === 0 ? (
          <Card>
            <Txt variant="muted">Aucune réservation payée pour l'instant.</Txt>
          </Card>
        ) : (
          rows.map((r) => (
            <Card key={r.clubId} style={{ marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <IconCircle icon="wallet" color={colors.gold} bg={colors.goldSoft} />
              <View style={{ flex: 1 }}>
                <Txt variant="h3" style={{ fontSize: 15 }}>
                  {r.clubName}
                </Txt>
                <Txt variant="muted">
                  {r.count} réservation{r.count > 1 ? 's' : ''} · volume ≈ {fcfa(r.revenue)}
                </Txt>
              </View>
              <Tag label={`≈ ${fcfa(r.commission)}`} tone="gold" />
            </Card>
          ))
        )}
      </View>

      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.lg, textAlign: 'center' }}>
        Commission de {Math.round(COMMISSION_RATE * 100)}% à collecter par club sur Wave en fin de mois.
        (Volume = somme des tarifs indicatifs des créneaux réservés.)
      </Txt>
    </Screen>
  );
}

function Total({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={styles.total}>
      <Txt variant="h3" color={color} style={{ fontSize: 16 }}>
        {value}
      </Txt>
      <Txt variant="small" color={colors.textMuted} style={{ textAlign: 'center' }}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  totals: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  total: { flex: 1, alignItems: 'center' },
});
