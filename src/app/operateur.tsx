import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { Button, Card, Divider, IconCircle, SectionHeader, Tag, Txt } from '@/components/ui';
import { activeClubs, findClub } from '@/data/clubs';
import { COMMISSION_RATE, isPlayed, useApp } from '@/store/AppContext';
import { addWeeks, weekKeyOf, weekLabel } from '@/lib/days';
import { fcfa } from '@/lib/format';
import { openWhatsApp } from '@/lib/contact';
import { colors, radius, spacing } from '@/theme';

const PAY_PCT = Math.round(COMMISSION_RATE * 100);

export default function Operateur() {
  const { state, setBoost, approveClub, rejectClub, setPaymentStatus } = useApp();

  // Le décompte est HEBDOMADAIRE (semaine calendaire lundi → dimanche).
  const thisWeek = weekKeyOf(Date.now());
  const [week, setWeek] = useState(thisWeek);

  // La commission se calcule UNIQUEMENT sur les parties JOUÉES de la semaine
  // (une résa à venir peut encore être annulée — le club contesterait).
  const weekAll = state.reservations.filter((r) => weekKeyOf(r.startsAt) === week);
  const weekPlayed = weekAll.filter((r) => isPlayed(r));
  const weekUpcoming = weekAll.length - weekPlayed.length;
  const groups = new Map<string, { clubName: string; count: number; revenue: number; items: typeof state.reservations }>();
  for (const r of weekPlayed) {
    const price = findClub(r.clubId, state.customClubs, state.clubInfo)?.priceFrom ?? 0;
    const g = groups.get(r.clubId) ?? { clubName: r.clubName, count: 0, revenue: 0, items: [] };
    g.count += 1;
    g.revenue += price;
    g.items.push(r);
    groups.set(r.clubId, g);
  }
  const rows = [...groups.entries()]
    .map(([clubId, g]) => ({ clubId, ...g, commission: Math.round(g.revenue * COMMISSION_RATE) }))
    .sort((a, b) => b.revenue - a.revenue);

  const totalCount = rows.reduce((s, r) => s + r.count, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCommission = rows.reduce((s, r) => s + r.commission, 0);
  const totalDue = rows
    .filter((r) => state.operatorPayments[`${r.clubId}:${week}`] !== 'paid')
    .reduce((s, r) => s + r.commission, 0);

  // Relance : la SEMAINE PRÉCÉDENTE contient-elle des parties jouées non payées ?
  const prevWeek = addWeeks(thisWeek, -1);
  const prevUnpaidClubs = useMemo(() => {
    const ids = new Set<string>();
    for (const r of state.reservations) {
      if (weekKeyOf(r.startsAt) === prevWeek && isPlayed(r) && state.operatorPayments[`${r.clubId}:${prevWeek}`] !== 'paid') {
        ids.add(r.clubId);
      }
    }
    return ids.size;
  }, [state.reservations, state.operatorPayments, prevWeek]);

  // Santé plateforme (3 chiffres).
  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const twoWeeksAgo = now - 14 * 86400000;
  const resThisWeek = state.reservations.filter((r) => r.createdAt >= weekAgo).length;
  const resPrevWeek = state.reservations.filter((r) => r.createdAt >= twoWeeksAgo && r.createdAt < weekAgo).length;
  const activeClubsCount = activeClubs(state.customClubs, state.clubInfo).length;

  const statusOf = (clubId: string): 'tofacture' | 'sent' | 'paid' =>
    state.operatorPayments[`${clubId}:${week}`] ?? 'tofacture';

  // Message Wave formaté, prêt à envoyer au club.
  const sendHistory = (row: (typeof rows)[number]) => {
    const lines = row.items
      .sort((a, b) => a.startsAt - b.startsAt)
      .map((r) => `• ${r.date} ${r.time} · ${r.court}${r.bookedBy ? ` · ${r.bookedBy.name}` : ''}`)
      .join('\n');
    const message =
      `*PadelConnect — Décompte semaine ${weekLabel(week)}*\n${row.clubName}\n\n` +
      `Parties jouées : ${row.count}\n` +
      `Volume estimé : ${fcfa(row.revenue)}\n` +
      `Commission PadelConnect (${PAY_PCT}%) : *${fcfa(row.commission)}*\n` +
      `À régler par Wave 🙏\n\n` +
      `Détail :\n${lines}`;
    const phone = (findClub(row.clubId, state.customClubs, state.clubInfo) as { contactPhone?: string } | undefined)?.contactPhone ?? '';
    openWhatsApp(phone, message);
    setPaymentStatus(row.clubId, week, 'sent');
  };

  return (
    <Screen back title="Espace opérateur" subtitle="PadelConnect — suivi & commissions">
      <View style={styles.note}>
        <Ionicons name="information-circle-outline" size={15} color={colors.textFaint} />
        <Txt variant="small" color={colors.textFaint} style={{ flex: 1 }}>
          Chaque fin de semaine : envoie le décompte à chaque club par WhatsApp, il te règle par Wave, tu marques « Payé ».
        </Txt>
      </View>

      {/* Relance : semaine précédente prête à facturer */}
      {prevUnpaidClubs > 0 ? (
        <Pressable onPress={() => setWeek(prevWeek)} style={styles.reminder}>
          <Ionicons name="alarm-outline" size={16} color={colors.coral} />
          <Txt variant="small" color={colors.text} style={{ flex: 1, fontWeight: '600' }}>
            La semaine {weekLabel(prevWeek)} est prête à facturer — {prevUnpaidClubs} club{prevUnpaidClubs > 1 ? 's' : ''}.
          </Txt>
          <Ionicons name="chevron-forward" size={15} color={colors.coral} />
        </Pressable>
      ) : null}

      {/* Santé plateforme */}
      <View style={styles.health}>
        <Mini value={`${activeClubsCount}`} label="Clubs actifs" color={colors.blue} />
        <Mini value={`${resThisWeek}`} label="Résas / 7 j" color={colors.green} sub={resThisWeek >= resPrevWeek ? '▲' : '▼'} />
        <Mini value={fcfa(totalCommission)} label="Commission semaine" color={colors.amber} />
      </View>

      {/* Sélecteur de semaine ‹ › */}
      <View style={styles.weekNav}>
        <Pressable onPress={() => setWeek(addWeeks(week, -1))} hitSlop={8} style={styles.weekArrow}>
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Txt variant="h3" style={{ fontSize: 15 }}>
            Semaine {weekLabel(week)}
          </Txt>
          {week === thisWeek ? (
            <Txt variant="small" color={colors.textFaint}>
              cette semaine
            </Txt>
          ) : null}
        </View>
        <Pressable
          onPress={() => setWeek(addWeeks(week, 1))}
          hitSlop={8}
          style={[styles.weekArrow, week === thisWeek && { opacity: 0.3 }]}
          disabled={week === thisWeek}
        >
          <Ionicons name="chevron-forward" size={18} color={colors.text} />
        </Pressable>
      </View>

      <Card>
        <Txt variant="label" color={colors.textFaint}>
          Semaine {weekLabel(week)}
        </Txt>
        <View style={styles.totals}>
          <Total value={`${totalCount}`} label="Parties jouées" color={colors.blue} bg={colors.blueSoft} />
          <Total value={fcfa(totalRevenue)} label="Volume" color={colors.green} bg={colors.greenSoft} />
          <Total value={fcfa(totalDue)} label="Reste à encaisser" color={colors.amber} bg={colors.amberSoft} />
        </View>
        {weekUpcoming > 0 ? (
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
            + {weekUpcoming} réservation{weekUpcoming > 1 ? 's' : ''} à venir cette semaine (à titre indicatif — facturée{weekUpcoming > 1 ? 's' : ''} une fois jouée{weekUpcoming > 1 ? 's' : ''}).
          </Txt>
        ) : null}
      </Card>

      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Par club" />
        {rows.length === 0 ? (
          <Card>
            <Txt variant="muted">Aucune partie jouée sur la semaine {weekLabel(week)}.</Txt>
          </Card>
        ) : (
          rows.map((r) => {
            const st = statusOf(r.clubId);
            return (
              <Card key={r.clubId} style={{ marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <IconCircle icon="wallet" color={colors.amber} bg={colors.amberSoft} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="h3" style={{ fontSize: 15 }}>
                      {r.clubName}
                    </Txt>
                    <Txt variant="muted">
                      {r.count} résa{r.count > 1 ? 's' : ''} · volume ≈ {fcfa(r.revenue)}
                    </Txt>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Txt variant="price" style={{ fontSize: 15 }}>{fcfa(r.commission)}</Txt>
                    <Tag
                      label={st === 'paid' ? 'Payé ✓' : st === 'sent' ? 'Décompte envoyé' : 'À facturer'}
                      tone={st === 'paid' ? 'green' : st === 'sent' ? 'blue' : 'coral'}
                    />
                  </View>
                </View>
                <Divider style={{ marginVertical: spacing.md }} />
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Button size="sm" label="Envoyer le décompte" icon="logo-whatsapp" variant="secondary" onPress={() => sendHistory(r)} full />
                  </View>
                  {st === 'paid' ? (
                    <Button size="sm" label="Annuler" icon="arrow-undo" variant="ghost" onPress={() => setPaymentStatus(r.clubId, week, 'sent')} />
                  ) : (
                    <Button size="sm" label="Marquer payé" icon="checkmark-circle" onPress={() => setPaymentStatus(r.clubId, week, 'paid')} />
                  )}
                </View>
              </Card>
            );
          })
        )}
      </View>

      {/* Demandes d'inscription de clubs — TU valides chaque nouveau club. */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title={`Nouveaux clubs · ${state.customClubs.length}`} />
        {state.customClubs.length === 0 ? (
          <Card>
            <Txt variant="muted">
              Quand un gérant inscrit son club depuis l'Espace Club, sa demande arrive ici : c'est toi qui actives sa visibilité.
            </Txt>
          </Card>
        ) : (
          state.customClubs.map((c) => (
            <Card key={c.id} style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <IconCircle icon="business" color={colors.blue} bg={colors.blueSoft} size={40} />
                <View style={{ flex: 1 }}>
                  <Txt variant="h3" style={{ fontSize: 15 }}>
                    {c.name}
                  </Txt>
                  <Txt variant="muted">
                    {c.area} · {c.courts} terrain{c.courts > 1 ? 's' : ''} · dès {fcfa(c.priceFrom)}/session
                  </Txt>
                  {c.contactPhone ? (
                    <Txt variant="small" color={colors.textFaint}>
                      Contact : {c.contactPhone}
                    </Txt>
                  ) : null}
                </View>
                <Tag label={c.status === 'active' ? 'Actif' : 'En attente'} tone={c.status === 'active' ? 'green' : 'coral'} />
              </View>
              {c.status === 'pending' ? (
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <Button size="sm" label="Activer le club" icon="checkmark" onPress={() => approveClub(c.id)} full />
                  </View>
                  <Button size="sm" label="Refuser" icon="close" variant="danger" onPress={() => rejectClub(c.id)} />
                </View>
              ) : null}
            </Card>
          ))
        )}
      </View>

      {/* Boosts « Sponsorisé » — durée 7 ou 30 jours, activés une fois le paiement Wave reçu. */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Boosts « Sponsorisé »" />
        <Card>
          <Txt variant="muted" style={{ marginBottom: spacing.sm }}>
            Un club t'a réglé son boost par Wave ? Active-le ici : il passe en tête de liste avec un badge doré.
          </Txt>
          {activeClubs(state.customClubs, state.clubInfo).map((c, i) => {
            const on = state.boostedClubIds.includes(c.id);
            const exp = state.boostExpiry[c.id];
            return (
              <View key={c.id}>
                {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="body" style={{ fontWeight: '600' }}>{c.name}</Txt>
                    {on && exp ? (
                      <Txt variant="small" color={colors.amber}>
                        Actif jusqu'au {new Date(exp).toLocaleDateString('fr-FR')}
                      </Txt>
                    ) : (
                      <Txt variant="small" color={colors.textFaint}>Non sponsorisé</Txt>
                    )}
                  </View>
                  {on ? (
                    <Button size="sm" label="Arrêter" icon="close" variant="ghost" onPress={() => setBoost(c.id, 0)} />
                  ) : (
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <Button size="sm" label="7 j" variant="secondary" onPress={() => setBoost(c.id, 7)} />
                      <Button size="sm" label="30 j" onPress={() => setBoost(c.id, 30)} />
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </Card>
      </View>

      {/* Codes d'accès Espace Club (mode démo) */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Codes d'accès Espace Club" />
        <Card>
          <Txt variant="muted" style={{ marginBottom: spacing.sm }}>
            Chaque club entre son code à 4 chiffres pour accéder à son Espace Club. (Visibles ici en
            mode démo ; les vrais comptes gérants arriveront avec la version serveur.)
          </Txt>
          {activeClubs(state.customClubs, state.clubInfo).map((c, i) => (
            <View key={c.id}>
              {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Txt variant="body" style={{ fontWeight: '600' }}>{c.name}</Txt>
                <Txt variant="price" style={{ fontSize: 16, letterSpacing: 4 }}>
                  {state.clubCodes[c.id] ?? '—'}
                </Txt>
              </View>
            </View>
          ))}
        </Card>
      </View>
    </Screen>
  );
}

function Total({ value, label, color, bg }: { value: string; label: string; color: string; bg: string }) {
  return (
    <View style={[styles.total, { backgroundColor: bg }]}>
      <Txt variant="h3" color={color} style={{ fontSize: 16 }}>
        {value}
      </Txt>
      <Txt variant="small" color={colors.textMuted} style={{ textAlign: 'center' }}>
        {label}
      </Txt>
    </View>
  );
}

function Mini({ value, label, color, sub }: { value: string; label: string; color: string; sub?: string }) {
  return (
    <View style={styles.mini}>
      <Txt variant="h3" color={color} style={{ fontSize: 15 }}>
        {value} {sub ? <Txt variant="small" color={color}>{sub}</Txt> : null}
      </Txt>
      <Txt variant="small" color={colors.textMuted} numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  health: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  mini: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  weekArrow: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.coralSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  totals: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  total: { flex: 1, alignItems: 'center', borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xs },
});
