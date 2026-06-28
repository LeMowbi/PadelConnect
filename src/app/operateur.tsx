import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Button, Card, Divider, IconCircle, SectionHeader, StatTile, Tag, Txt } from '@/components/ui';
import { activeClubs, findClub } from '@/data/clubs';
import { canAccessOperator } from '@/lib/access';
import { COMMISSION_RATE, isPlayed, useApp } from '@/store/AppContext';
import { addWeeks, dateKeyLabel, weekKeyOf, weekLabel } from '@/lib/days';
import { fcfa } from '@/lib/format';
import { openWhatsApp } from '@/lib/contact';
import { colors, font, radius, shadows, spacing } from '@/theme';

const PAY_PCT = Math.round(COMMISSION_RATE * 100);

export default function Operateur() {
  const { state, setBoost, approveClub, rejectClub, setPaymentStatus, setOperatorNews, removeOperatorNews } = useApp();

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
    // Volume = somme des PRIX RÉELS des créneaux réservés (figés à la réservation).
    const price = r.price ?? findClub(r.clubId, state.customClubs, state.clubInfo)?.priceFrom ?? 0;
    const g = groups.get(r.clubId) ?? { clubName: r.clubName, count: 0, revenue: 0, items: [] };
    g.count += 1;
    g.revenue += price;
    g.items.push(r);
    groups.set(r.clubId, g);
  }
  const rows = [...groups.entries()]
    .map(([clubId, g]) => ({ clubId, ...g, commission: Math.round(g.revenue * COMMISSION_RATE) }))
    .sort((a, b) => b.revenue - a.revenue);

  // Commission cumulée DEPUIS LE LANCEMENT (toutes semaines) — chiffre vitrine.
  const allTimePlayedRes = state.reservations.filter((r) => isPlayed(r));
  const allTimePlayed = allTimePlayedRes.length;
  const allTimeCommission = Math.round(allTimePlayedRes.reduce((s, r) => s + (r.price ?? 0), 0) * COMMISSION_RATE);

  const totalCount = rows.reduce((s, r) => s + r.count, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCommission = rows.reduce((s, r) => s + r.commission, 0);
  const totalDue = rows.filter((r) => state.operatorPayments[`${r.clubId}:${week}`] !== 'paid').reduce((s, r) => s + r.commission, 0);

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

  const statusOf = (clubId: string): 'tofacture' | 'sent' | 'paid' => state.operatorPayments[`${clubId}:${week}`] ?? 'tofacture';

  // Message Wave formaté, prêt à envoyer au club.
  const sendHistory = (row: (typeof rows)[number]) => {
    const lines = row.items
      .sort((a, b) => a.startsAt - b.startsAt)
      // Date ABSOLUE dérivée de dateKey (jamais le libellé relatif « Sem. dernière »).
      .map(
        (r) => `• ${dateKeyLabel(r.dateKey)} · ${r.time} · ${r.court}${r.bookedBy ? ` · ${r.bookedBy.name}` : ''} · ${fcfa(r.price ?? 0)}`,
      )
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

  // Garde d'accès : l'Espace opérateur n'est rendu que si le RÔLE serveur === 'operator'.
  // (La vraie barrière reste la Row Level Security côté Supabase.)
  if (!canAccessOperator(state.role)) return null;

  return (
    <Screen back title="Espace opérateur" subtitle="PadelConnect — suivi & commissions">
      <View style={styles.note}>
        <Ionicons name="information-circle-outline" size={15} color={colors.textFaint} />
        <Txt variant="small" color={colors.textFaint} style={{ flex: 1 }}>
          Chaque fin de semaine : envoie le décompte à chaque club par WhatsApp, il te règle par Wave, tu marques « Payé ».
        </Txt>
      </View>

      {/* Actualité de l'accueil — éditorialisée par l'opérateur, visible par tous les joueurs */}
      <View style={{ marginBottom: spacing.md }}>
        <SectionHeader title="Actualité de l'accueil" />
        <NewsEditor news={state.operatorNews} onPublish={setOperatorNews} onRemove={removeOperatorNews} />
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

      {/* Hero — commission cumulée depuis le lancement (chiffre vitrine) */}
      <Card style={styles.hero}>
        <Txt variant="label" color={colors.textFaint}>
          Commission PadelConnect — cumulée
        </Txt>
        <Txt style={styles.heroValue}>{fcfa(allTimeCommission)}</Txt>
        <Txt variant="small" color={colors.textMuted}>
          {allTimePlayed} partie{allTimePlayed > 1 ? 's' : ''} jouée{allTimePlayed > 1 ? 's' : ''} · 10 % réglés par Wave (hors app)
        </Txt>
      </Card>

      {/* Santé plateforme */}
      <View style={styles.health}>
        <StatTile value={`${activeClubsCount}`} label="Clubs actifs" color={colors.blue} bg={colors.blueSoft} />
        <StatTile
          value={`${resThisWeek} ${resThisWeek >= resPrevWeek ? '▲' : '▼'}`}
          label="Résas / 7 j"
          color={colors.green}
          bg={colors.greenSoft}
        />
        <StatTile value={fcfa(totalCommission)} label="Commission semaine" color={colors.amber} bg={colors.amberSoft} />
      </View>

      {/* Sélecteur de semaine ‹ › */}
      <View style={styles.weekNav}>
        <Pressable
          onPress={() => setWeek(addWeeks(week, -1))}
          hitSlop={8}
          style={styles.weekArrow}
          accessibilityRole="button"
          accessibilityLabel="Semaine précédente"
        >
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
          accessibilityRole="button"
          accessibilityLabel="Semaine suivante"
        >
          <Ionicons name="chevron-forward" size={18} color={colors.text} />
        </Pressable>
      </View>

      <Card>
        <Txt variant="label" color={colors.textFaint}>
          Semaine {weekLabel(week)}
        </Txt>
        <View style={styles.totals}>
          <StatTile value={`${totalCount}`} label="Parties jouées" color={colors.blue} bg={colors.blueSoft} />
          <StatTile value={fcfa(totalRevenue)} label="Volume" color={colors.green} bg={colors.greenSoft} />
          <StatTile value={fcfa(totalDue)} label="Reste à encaisser" color={colors.amber} bg={colors.amberSoft} />
        </View>
        {weekUpcoming > 0 ? (
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
            + {weekUpcoming} réservation{weekUpcoming > 1 ? 's' : ''} à venir cette semaine (à titre indicatif — facturée
            {weekUpcoming > 1 ? 's' : ''} une fois jouée{weekUpcoming > 1 ? 's' : ''}).
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
                    <Txt variant="price" style={{ fontSize: 15 }}>
                      {fcfa(r.commission)}
                    </Txt>
                    <Tag
                      label={st === 'paid' ? 'Payé ✓' : st === 'sent' ? 'Décompte envoyé' : 'À facturer'}
                      tone={st === 'paid' ? 'green' : st === 'sent' ? 'blue' : 'coral'}
                    />
                  </View>
                </View>
                <Divider style={{ marginVertical: spacing.md }} />
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      size="sm"
                      label="Envoyer le décompte"
                      icon="logo-whatsapp"
                      variant="secondary"
                      onPress={() => sendHistory(r)}
                      full
                    />
                  </View>
                  {st === 'paid' ? (
                    <Button
                      size="sm"
                      label="Annuler"
                      icon="arrow-undo"
                      variant="ghost"
                      onPress={() => setPaymentStatus(r.clubId, week, 'sent')}
                    />
                  ) : (
                    <Button
                      size="sm"
                      label="Marquer payé"
                      icon="checkmark-circle"
                      onPress={() => setPaymentStatus(r.clubId, week, 'paid')}
                    />
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
                    <Txt variant="body" style={{ fontWeight: '600' }}>
                      {c.name}
                    </Txt>
                    {on && exp ? (
                      <Txt variant="small" color={colors.amber}>
                        Actif jusqu'au {new Date(exp).toLocaleDateString('fr-FR')}
                      </Txt>
                    ) : (
                      <Txt variant="small" color={colors.textFaint}>
                        Non sponsorisé
                      </Txt>
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
            Chaque club entre son code à 4 chiffres pour accéder à son Espace Club. (Visibles ici en mode démo ; les vrais comptes gérants
            arriveront avec la version serveur.)
          </Txt>
          {activeClubs(state.customClubs, state.clubInfo).map((c, i) => (
            <View key={c.id}>
              {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Txt variant="body" style={{ fontWeight: '600' }}>
                  {c.name}
                </Txt>
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

// Petit éditeur d'actu d'accueil : titre (obligatoire), sous-titre + lien (optionnels).
function NewsEditor({
  news,
  onPublish,
  onRemove,
}: {
  news: { title: string; subtitle?: string; link?: string } | null;
  onPublish: (n: { title: string; subtitle?: string; link?: string }) => void;
  onRemove: () => void;
}) {
  const [title, setTitle] = useState(news?.title ?? '');
  const [subtitle, setSubtitle] = useState(news?.subtitle ?? '');
  const [link, setLink] = useState(news?.link ?? '');
  const [saved, setSaved] = useState(false);

  const publish = () => {
    if (title.trim().length < 3) return;
    onPublish({ title, subtitle, link });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <Card>
      <Txt variant="muted" style={{ marginBottom: spacing.sm }}>
        S'affiche en bandeau en haut de l'accueil joueur. Publier une nouvelle actu la fait réapparaître même chez ceux qui l'avaient
        fermée.
      </Txt>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Titre (obligatoire)"
        placeholderTextColor={colors.textFaint}
        style={styles.newsInput}
      />
      <TextInput
        value={subtitle}
        onChangeText={setSubtitle}
        placeholder="Sous-titre (optionnel)"
        placeholderTextColor={colors.textFaint}
        style={styles.newsInput}
      />
      <TextInput
        value={link}
        onChangeText={setLink}
        placeholder="Lien (optionnel — https://…)"
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        keyboardType="url"
        style={styles.newsInput}
      />
      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
        <Button
          size="sm"
          label={saved ? 'Publiée ✓' : 'Publier l’actu'}
          icon={saved ? 'checkmark' : 'megaphone'}
          onPress={publish}
          disabled={title.trim().length < 3}
          full
        />
        {news ? (
          <Button
            size="sm"
            variant="ghost"
            label="Retirer l’actu de l’accueil"
            icon="trash-outline"
            onPress={() => {
              onRemove();
              setTitle('');
              setSubtitle('');
              setLink('');
            }}
            full
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  hero: { ...shadows.e2, marginBottom: spacing.md, alignItems: 'flex-start', gap: 2 },
  heroValue: {
    fontSize: font.size.display,
    fontFamily: font.family.heavy,
    fontWeight: font.weight.heavy,
    color: colors.amber,
    letterSpacing: -0.5,
  },
  health: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
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
  newsInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    padding: spacing.md,
    marginTop: spacing.sm,
    fontSize: 15,
  },
});
