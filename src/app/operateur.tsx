import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, IconCircle, SectionHeader, StatTile, Tag, Txt } from '@/components/ui';
import { activeClubs, clubs as baseClubs, findClub } from '@/data/clubs';
import { canAccessOperator } from '@/lib/access';
import { COMMISSION_RATE, isPlayed, useApp, type ServerClubRequest, type ServerSupportMessage } from '@/store/AppContext';
import { addWeeks, dateKeyLabel, weekKeyOf, weekLabel } from '@/lib/days';
import { fcfa } from '@/lib/format';
import { openWhatsApp } from '@/lib/contact';
import { colors, font, radius, shadows, spacing } from '@/theme';

const PAY_PCT = Math.round(COMMISSION_RATE * 100);

export default function Operateur() {
  const {
    state,
    setBoost,
    approveClub,
    rejectClub,
    setPaymentStatus,
    setOperatorNews,
    removeOperatorNews,
    fetchClubRequests,
    setClubRequestStatus,
    approveClubRequest,
    operatorSetClubStatus,
    operatorSetBaseStatus,
    operatorCreateClub,
    fetchSupportMessages,
    setSupportMessageStatus,
  } = useApp();
  const toast = useToast();

  // ── Clubs serveur (Actif / Bientôt) : pré-chargement + bascule de statut ──────
  const serverClubs = state.customClubs.filter((c) => c.fromServer);
  const [ncName, setNcName] = useState('');
  const [ncArea, setNcArea] = useState('');
  const [ncPrice, setNcPrice] = useState('');
  const [creatingClub, setCreatingClub] = useState(false);
  const createComingSoon = async () => {
    if (creatingClub || ncName.trim().length < 2) return;
    setCreatingClub(true);
    const res = await operatorCreateClub({
      name: ncName.trim(),
      area: ncArea.trim(),
      type: 'Mixte',
      courts: 1,
      priceFrom: Number(ncPrice) > 0 ? Number(ncPrice) : 10000,
    });
    setCreatingClub(false);
    if (res.ok) {
      setNcName('');
      setNcArea('');
      setNcPrice('');
      toast.show('Club ajouté en « Bientôt » ✅');
    } else {
      toast.show('Ajout impossible — réessaie', { icon: 'alert-circle' });
    }
  };
  const toggleClubStatus = async (clubId: string, current: boolean) => {
    // current = est « Bientôt » → on bascule vers Actif, et inversement.
    const { ok } = await operatorSetClubStatus(clubId, current ? 'active' : 'coming_soon');
    if (!ok) toast.show('Changement impossible — réessaie', { icon: 'alert-circle' });
  };

  // ── Clubs de base (les 9 embarqués) : statut piloté Actif ⇄ Bientôt côté serveur ──
  const [baseBusy, setBaseBusy] = useState<string | null>(null);
  const toggleBaseStatus = async (clubId: string, comingSoon: boolean) => {
    if (baseBusy) return;
    setBaseBusy(clubId);
    // comingSoon = actuellement « Bientôt » → on active ; sinon on met en « Bientôt ».
    const { ok } = await operatorSetBaseStatus(clubId, comingSoon ? 'active' : 'coming_soon');
    setBaseBusy(null);
    if (!ok) toast.show('Changement impossible — réessaie', { icon: 'alert-circle' });
  };

  // Messages d'aide / signalements (table support_messages, RLS opérateur).
  const [support, setSupport] = useState<ServerSupportMessage[]>([]);
  useEffect(() => {
    let alive = true;
    fetchSupportMessages().then(({ messages }) => {
      if (alive) setSupport(messages);
    });
    return () => {
      alive = false;
    };
  }, [fetchSupportMessages]);
  const markSupport = async (id: string, status: ServerSupportMessage['status']) => {
    setSupport((cur) => cur.map((m) => (m.id === id ? { ...m, status } : m)));
    await setSupportMessageStatus(id, status);
  };
  const newSupport = support.filter((m) => m.status === 'new').length;

  // Demandes d'inscription reçues sur le SERVEUR (table club_requests, lisible par le
  // seul opérateur via RLS). Un joueur les envoie depuis « Inscrire mon club ».
  const [requests, setRequests] = useState<ServerClubRequest[]>([]);
  const [loadingReq, setLoadingReq] = useState(true);
  const [reqError, setReqError] = useState(false);
  const loadRequests = useCallback(async () => {
    setLoadingReq(true);
    const { ok, requests: rows } = await fetchClubRequests();
    setReqError(!ok);
    setRequests(rows);
    setLoadingReq(false);
  }, [fetchClubRequests]);
  // Chargement initial : on n'appelle setState que DANS le callback async (après await),
  // jamais de façon synchrone dans le corps de l'effet (cf. react-hooks/set-state-in-effect).
  useEffect(() => {
    let alive = true;
    fetchClubRequests().then(({ ok, requests: rows }) => {
      if (!alive) return;
      setReqError(!ok);
      setRequests(rows);
      setLoadingReq(false);
    });
    return () => {
      alive = false;
    };
  }, [fetchClubRequests]);

  const markRequest = async (id: string, status: ServerClubRequest['status']) => {
    const prev = requests;
    setRequests((cur) => cur.map((r) => (r.id === id ? { ...r, status } : r)));
    const { ok } = await setClubRequestStatus(id, status);
    if (!ok) setRequests(prev); // échec serveur → on annule l'affichage optimiste
  };
  const pendingRequests = requests.filter((r) => r.status === 'new' || r.status === 'contacted').length;

  // Approbation : demande de confirmation (action forte : crée le club + donne l'accès).
  const [approveTarget, setApproveTarget] = useState<ServerClubRequest | null>(null);
  const [approving, setApproving] = useState(false);
  const confirmApprove = async () => {
    if (!approveTarget || approving) return;
    setApproving(true);
    const { ok } = await approveClubRequest(approveTarget.id);
    setApproving(false);
    if (ok) {
      setRequests((cur) => cur.map((r) => (r.id === approveTarget.id ? { ...r, status: 'approved' } : r)));
      setApproveTarget(null);
      toast.show('Club créé et accès accordé ✅');
    } else {
      toast.show('Approbation impossible — réessaie', { icon: 'alert-circle' });
    }
  };

  // Le décompte est HEBDOMADAIRE (semaine calendaire lundi → dimanche).
  const thisWeek = weekKeyOf(Date.now());
  const [week, setWeek] = useState(thisWeek);

  // La commission se calcule UNIQUEMENT sur les parties JOUÉES de la semaine
  // (une résa à venir peut encore être annulée — le club contesterait).
  // Prix d'une résa — MÊME règle partout (hebdo et cumulé) pour que le chiffre vitrine
  // ne sous-estime jamais la somme des semaines : prix figé, sinon tarif actuel du club.
  const priceOf = (r: (typeof state.reservations)[number]) =>
    r.price ?? findClub(r.clubId, state.customClubs, state.clubInfo)?.priceFrom ?? 0;

  const weekAll = state.reservations.filter((r) => weekKeyOf(r.startsAt) === week);
  const weekPlayed = weekAll.filter((r) => isPlayed(r));
  const weekUpcoming = weekAll.length - weekPlayed.length;
  const groups = new Map<string, { clubName: string; count: number; revenue: number; items: typeof state.reservations }>();
  for (const r of weekPlayed) {
    // Volume = somme des PRIX RÉELS des créneaux réservés (figés à la réservation).
    const g = groups.get(r.clubId) ?? { clubName: r.clubName, count: 0, revenue: 0, items: [] };
    g.count += 1;
    g.revenue += priceOf(r);
    g.items.push(r);
    groups.set(r.clubId, g);
  }
  const rows = [...groups.entries()]
    .map(([clubId, g]) => ({ clubId, ...g, commission: Math.round(g.revenue * COMMISSION_RATE) }))
    .sort((a, b) => b.revenue - a.revenue);

  // Commission cumulée DEPUIS LE LANCEMENT (toutes semaines) — chiffre vitrine.
  const allTimePlayedRes = state.reservations.filter((r) => isPlayed(r));
  const allTimePlayed = allTimePlayedRes.length;
  const allTimeCommission = Math.round(allTimePlayedRes.reduce((s, r) => s + priceOf(r), 0) * COMMISSION_RATE);

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
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={17} color={colors.amberDark} />
        <Txt variant="small" color={colors.amberDark} style={{ flex: 1 }}>
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
        <StatTile value={`${activeClubsCount}`} label="Clubs actifs" color={colors.green} bg={colors.greenSoft} />
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
          <StatTile value={`${totalCount}`} label="Parties jouées" color={colors.green} bg={colors.greenSoft} />
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
                    <Txt variant="h3" style={{ fontSize: 15 }} numberOfLines={1}>
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
                      tone={st === 'paid' ? 'green' : st === 'sent' ? 'amber' : 'neutral'}
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

      {/* Demandes reçues sur le SERVEUR — un gérant a utilisé « Inscrire mon club ». */}
      <View style={{ marginTop: spacing.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <SectionHeader title={`Demandes reçues · ${pendingRequests}`} />
          <Pressable onPress={loadRequests} hitSlop={8} accessibilityLabel="Rafraîchir les demandes">
            <Ionicons name="refresh" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
        {loadingReq ? (
          <Card>
            <Txt variant="muted">Chargement des demandes…</Txt>
          </Card>
        ) : reqError ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Ionicons name="cloud-offline-outline" size={20} color={colors.coral} />
            <Txt variant="muted" style={{ flex: 1 }}>
              Impossible de charger les demandes (réseau ou session). Touche ⟳ pour réessayer.
            </Txt>
          </Card>
        ) : requests.length === 0 ? (
          <Card>
            <Txt variant="muted">
              Aucune demande pour l'instant. Quand un joueur inscrit son club (Profil → « Tu gères un club ? »), elle apparaît ici.
            </Txt>
          </Card>
        ) : (
          requests.map((r) => (
            <Card key={r.id} style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <IconCircle icon="business" color={colors.amber} bg={colors.amberSoft} size={40} />
                <View style={{ flex: 1 }}>
                  <Txt variant="h3" style={{ fontSize: 15 }} numberOfLines={1}>
                    {r.name}
                  </Txt>
                  <Txt variant="muted">
                    {[
                      r.area,
                      r.type,
                      r.courts ? `${r.courts} terrain${r.courts > 1 ? 's' : ''}` : null,
                      r.price_from ? `dès ${fcfa(r.price_from)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Sans détail'}
                  </Txt>
                </View>
                <Tag
                  label={
                    r.status === 'approved'
                      ? 'Approuvé ✓'
                      : r.status === 'rejected'
                        ? 'Refusé'
                        : r.status === 'contacted'
                          ? 'Contacté'
                          : 'Nouveau'
                  }
                  tone={
                    r.status === 'approved' ? 'green' : r.status === 'rejected' ? 'neutral' : r.status === 'contacted' ? 'amber' : 'coral'
                  }
                />
              </View>
              {r.message ? (
                <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm, fontStyle: 'italic' }}>
                  « {r.message} »
                </Txt>
              ) : null}
              <Divider style={{ marginVertical: spacing.md }} />
              <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                {r.contact_phone ? (
                  <View style={{ flex: 1, minWidth: 140 }}>
                    <Button
                      size="sm"
                      label="WhatsApp"
                      icon="logo-whatsapp"
                      variant="secondary"
                      onPress={() => {
                        openWhatsApp(
                          r.contact_phone ?? '',
                          `Bonjour 👋 PadelConnect à propos de l'inscription de « ${r.name} ». Es-tu dispo pour en parler ?`,
                        );
                        if (r.status === 'new') markRequest(r.id, 'contacted');
                      }}
                      full
                    />
                  </View>
                ) : null}
                {r.status === 'approved' ? (
                  <Button size="sm" label="Rouvrir" icon="arrow-undo" variant="ghost" onPress={() => markRequest(r.id, 'contacted')} />
                ) : (
                  <>
                    <Button size="sm" label="Approuver" icon="checkmark" onPress={() => setApproveTarget(r)} />
                    {r.status !== 'rejected' ? (
                      <Button size="sm" label="Écarter" icon="close" variant="ghost" onPress={() => markRequest(r.id, 'rejected')} />
                    ) : null}
                  </>
                )}
              </View>
              {r.contact_phone ? (
                <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
                  {r.contact_phone}
                </Txt>
              ) : null}
            </Card>
          ))
        )}
      </View>

      {/* Clubs serveur : pré-charger un club « Bientôt » et activer quand il est prêt. */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title={`Clubs sur le serveur · ${serverClubs.length}`} />
        <Card>
          <Txt variant="small" color={colors.textMuted}>
            Ajoute un club en « Bientôt » : il apparaît dans la liste des joueurs (non réservable) jusqu'à ce que tu l'actives.
          </Txt>
          <TextInput
            value={ncName}
            onChangeText={setNcName}
            placeholder="Nom du club"
            placeholderTextColor={colors.textFaint}
            style={styles.clubInput}
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TextInput
              value={ncArea}
              onChangeText={setNcArea}
              placeholder="Quartier"
              placeholderTextColor={colors.textFaint}
              style={[styles.clubInput, { flex: 1 }]}
            />
            <TextInput
              value={ncPrice}
              onChangeText={setNcPrice}
              placeholder="Tarif dès (FCFA)"
              placeholderTextColor={colors.textFaint}
              keyboardType="numeric"
              style={[styles.clubInput, { flex: 1 }]}
            />
          </View>
          <Button
            size="sm"
            label={creatingClub ? 'Ajout…' : 'Ajouter en « Bientôt »'}
            icon="add"
            onPress={createComingSoon}
            disabled={creatingClub || ncName.trim().length < 2}
          />
        </Card>
        {serverClubs.map((c) => (
          <Card key={c.id} style={{ marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <IconCircle icon="business" color={colors.signature} bg={colors.signatureSoft} size={40} />
            <View style={{ flex: 1 }}>
              <Txt variant="h3" style={{ fontSize: 15 }} numberOfLines={1}>
                {c.name}
              </Txt>
              <Txt variant="muted" numberOfLines={1}>
                {c.area} · dès {fcfa(c.priceFrom)}
              </Txt>
            </View>
            <Tag label={c.comingSoon ? 'Bientôt' : 'Actif'} tone={c.comingSoon ? 'purple' : 'green'} />
            <Button
              size="sm"
              label={c.comingSoon ? 'Activer' : 'Mettre en attente'}
              icon={c.comingSoon ? 'checkmark' : 'time'}
              variant={c.comingSoon ? 'primary' : 'ghost'}
              onPress={() => toggleClubStatus(c.id, !!c.comingSoon)}
            />
          </Card>
        ))}
      </View>

      {/* Clubs de base embarqués (9) : bascule Actif ⇄ Bientôt, visible par TOUS les joueurs. */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title={`Clubs de base · ${baseClubs.length}`} />
        <Card>
          <Txt variant="small" color={colors.textMuted}>
            Mets un club en « Bientôt » s'il n'est pas encore prêt à recevoir des réservations : il reste visible (badge « Bientôt », non
            réservable) pour tous les joueurs jusqu'à ce que tu le réactives.
          </Txt>
        </Card>
        {baseClubs.map((c) => {
          const comingSoon = state.clubStatus[c.id] === 'coming_soon';
          return (
            <Card key={c.id} style={{ marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <IconCircle icon="business" color={colors.green} bg={colors.greenSoft} size={40} />
              <View style={{ flex: 1 }}>
                <Txt variant="h3" style={{ fontSize: 15 }} numberOfLines={1}>
                  {c.name}
                </Txt>
                <Txt variant="muted" numberOfLines={1}>
                  {c.area}
                </Txt>
              </View>
              <Tag label={comingSoon ? 'Bientôt' : 'Actif'} tone={comingSoon ? 'purple' : 'green'} />
              <Button
                size="sm"
                label={comingSoon ? 'Activer' : 'Mettre en attente'}
                icon={comingSoon ? 'checkmark' : 'time'}
                variant={comingSoon ? 'primary' : 'ghost'}
                disabled={baseBusy === c.id}
                onPress={() => toggleBaseStatus(c.id, comingSoon)}
              />
            </Card>
          );
        })}
      </View>

      {/* Signalements / messages d'aide envoyés par les joueurs (serveur). */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title={`Signalements · ${newSupport}`} />
        {support.length === 0 ? (
          <Card>
            <Txt variant="muted">Aucun message pour l'instant. Les signalements des joueurs (Profil → Aide & support) arrivent ici.</Txt>
          </Card>
        ) : (
          support.map((m) => (
            <Card key={m.id} style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <IconCircle icon="chatbubble-ellipses" color={colors.coral} bg={colors.coralSoft} size={40} />
                <View style={{ flex: 1 }}>
                  <Txt variant="h3" style={{ fontSize: 15 }} numberOfLines={1}>
                    {m.name || 'Joueur'}
                  </Txt>
                  {m.contact_phone ? (
                    <Txt variant="small" color={colors.textFaint}>
                      {m.contact_phone}
                    </Txt>
                  ) : null}
                </View>
                <Tag
                  label={m.status === 'resolved' ? 'Résolu ✓' : m.status === 'read' ? 'Lu' : 'Nouveau'}
                  tone={m.status === 'resolved' ? 'green' : m.status === 'read' ? 'amber' : 'coral'}
                />
              </View>
              <Txt variant="body" style={{ marginTop: spacing.sm }}>
                {m.message}
              </Txt>
              <Divider style={{ marginVertical: spacing.md }} />
              <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                {m.contact_phone ? (
                  <Button
                    size="sm"
                    label="WhatsApp"
                    icon="logo-whatsapp"
                    variant="secondary"
                    onPress={() => {
                      openWhatsApp(m.contact_phone ?? '', `Bonjour 👋 PadelConnect — à propos de ton message.`);
                      if (m.status === 'new') markSupport(m.id, 'read');
                    }}
                  />
                ) : null}
                {m.status !== 'resolved' ? (
                  <Button size="sm" label="Marquer résolu" icon="checkmark" onPress={() => markSupport(m.id, 'resolved')} />
                ) : (
                  <Button size="sm" label="Rouvrir" icon="arrow-undo" variant="ghost" onPress={() => markSupport(m.id, 'read')} />
                )}
              </View>
            </Card>
          ))
        )}
      </View>

      {/* Clubs en démo locale — flux gérant historique (sans serveur). À ne pas confondre
          avec « Demandes reçues » ci-dessus, qui vient du serveur. */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title={`Clubs démo (local) · ${state.customClubs.length}`} />
        {state.customClubs.length === 0 ? (
          <Card>
            <Txt variant="muted">
              Clubs créés en local depuis l'Espace Club (démo). Les vraies demandes d'inscription arrivent dans « Demandes reçues »
              ci-dessus. Ici, « Activer » rend un club démo visible des joueurs.
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
                      <Txt variant="small" color={colors.green} style={{ fontWeight: '600' }}>
                        Sponsorisé · jusqu'au {new Date(exp).toLocaleDateString('fr-FR')}
                      </Txt>
                    ) : (
                      <Txt variant="small" color={colors.textFaint}>
                        Non sponsorisé
                      </Txt>
                    )}
                  </View>
                  {/* 7j / 30j toujours accessibles (on peut prolonger/changer la durée) ;
                      « Arrêter » apparaît quand le boost est actif. */}
                  <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                    <Button size="sm" label="7 j" variant="secondary" onPress={() => setBoost(c.id, 7)} />
                    <Button size="sm" label="14 j" variant="secondary" onPress={() => setBoost(c.id, 14)} />
                    <Button size="sm" label="30 j" onPress={() => setBoost(c.id, 30)} />
                    {on ? <Button size="sm" label="Arrêter" icon="close" variant="ghost" onPress={() => setBoost(c.id, 0)} /> : null}
                  </View>
                </View>
              </View>
            );
          })}
        </Card>
      </View>

      {/* Confirmation d'approbation — action forte : crée le club + donne l'accès gérant. */}
      <BottomSheet
        visible={approveTarget !== null}
        title={approveTarget ? `Approuver « ${approveTarget.name} » ?` : 'Approuver ce club ?'}
        subtitle="Le club sera créé et visible par tous les joueurs."
        onClose={() => (approving ? null : setApproveTarget(null))}
      >
        <View style={styles.approveBox}>
          <Ionicons name="sparkles" size={18} color={colors.signature} />
          <Txt variant="small" color={colors.text} style={{ flex: 1 }}>
            Le demandeur obtiendra l'accès à{' '}
            <Txt variant="small" style={{ fontWeight: '700' }}>
              son Espace Club
            </Txt>{' '}
            dès sa prochaine ouverture de l'app. Aucune manipulation technique de ta part.
          </Txt>
        </View>
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          <Button
            label={approving ? 'Création…' : 'Oui, créer le club'}
            icon="checkmark-circle"
            onPress={confirmApprove}
            disabled={approving}
            full
          />
          <Button label="Annuler" variant="secondary" onPress={() => setApproveTarget(null)} disabled={approving} full />
        </View>
      </BottomSheet>
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
  clubInput: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    padding: spacing.md,
    marginTop: spacing.sm,
    fontSize: font.size.md,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.amberSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  hero: { ...shadows.e2, marginBottom: spacing.md, alignItems: 'flex-start', gap: 2 },
  approveBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.signatureSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  heroValue: {
    fontSize: 36, // chiffre vitrine (gros) — lineHeight explicite pour éviter le débordement
    lineHeight: 44,
    fontFamily: font.family.heavy,
    fontWeight: font.weight.heavy,
    color: colors.amber,
    letterSpacing: -0.5,
    marginVertical: 2,
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
