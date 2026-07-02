import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { Reveal, staggerDelay } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { Button, Card, Divider, EmptyState, SectionHeader, Tag, Txt } from '@/components/ui';
import { findClub } from '@/data/clubs';
import { seedCompetitions } from '@/data/competitions';
import { useToast } from '@/components/Toast';
import { isPlayed, useApp, type Reservation } from '@/store/AppContext';
import { addReservationToCalendar } from '@/lib/calendar';
import { openWhatsApp } from '@/lib/contact';
import { hapticSuccess } from '@/lib/haptics';
import { dateKeyLabel, dayKey } from '@/lib/days';
import { fcfa, perPlayer } from '@/lib/format';
import { APP_DOMAIN } from '@/lib/referrals';
import { openMaps } from '@/lib/maps';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { colors, radius, spacing } from '@/theme';

const FIVE_H = 5 * 3600000;
const PAST_PREVIEW = 5; // passées : 5 dernières + « Voir tout »
const MONTHS = ['JANV.', 'FÉVR.', 'MARS', 'AVR.', 'MAI', 'JUIN', 'JUIL.', 'AOÛT', 'SEPT.', 'OCT.', 'NOV.', 'DÉC.'];

export default function ReservationsScreen() {
  const router = useRouter();
  const { state, myReservations, cancelReservation, respondInvitation, cancelMyLesson, refreshLessons } = useApp();
  const toast = useToast();
  // Passées : pagination INCRÉMENTALE (+20) — « tout » d'un coup monterait des centaines de
  // lignes animées dans un ScrollView non virtualisé chez un joueur assidu.
  const [pastShownCount, setPastShownCount] = useState(PAST_PREVIEW);
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null); // confirmation avant annulation
  const [cancellingLesson, setCancellingLesson] = useState<string | null>(null); // garde anti double-tap
  // Tirer pour rafraîchir : resynchronise mes réservations (et mes demandes de cours).
  const { refreshControl } = usePullToRefresh(refreshLessons);

  const now = Date.now();
  // « Mes réservations » = celles que j’ai créées + celles où un ami m’a invité (résa
  // PARTAGÉE). La source unique est `myReservations` (cf. AppContext) : un compte
  // club/opérateur ne voit donc pas le périmètre RLS de son club sur cet écran joueur.
  const mine = myReservations;
  // Suis-je l’AUTEUR de la résa ? (sinon je suis invité → pas d’annulation, RLS = auteur).
  // Une résa avec un bookedBy mais sans mon user_id = je suis invité, même hors session :
  // on ne propose donc PAS « Annuler » à un invité.
  const isOwner = (r: Reservation) => (state.serverUserId ? !r.userId || r.userId === state.serverUserId : !r.bookedBy);
  // Invitations à confirmer (résa partagée) : on les sort de « À venir » tant qu’elles sont
  // en attente, pour les présenter à part avec Accepter / Refuser.
  const isPending = (r: Reservation) => state.pendingInvitationIds.includes(r.id);
  const upcomingAll = mine.filter((r) => !isPlayed(r, now)).sort((a, b) => a.startsAt - b.startsAt);
  const pendingInvites = upcomingAll.filter(isPending);
  const upcoming = upcomingAll.filter((r) => !isPending(r));
  const past = mine.filter((r) => isPlayed(r, now)).sort((a, b) => b.startsAt - a.startsAt);
  const pastShown = past.slice(0, pastShownCount);

  // Mes demandes de COURS (coach) encore vivantes : en attente de réponse du coach, ou refusées
  // à venir (pour que le refus laisse une trace ici, pas seulement une notification). Un cours
  // ACCEPTÉ devient une réservation normale — il apparaît déjà dans « À venir » (badge coach).
  const lessonRequests = state.myLessons
    .filter((l) => (l.status === 'pending' || l.status === 'declined') && l.startsAt > now)
    .sort((a, b) => a.startsAt - b.startsAt);

  const cancelLesson = async (id: string) => {
    if (cancellingLesson) return;
    setCancellingLesson(id);
    const ok = await cancelMyLesson(id);
    setCancellingLesson(null);
    toast.show(ok ? 'Demande de cours annulée' : 'Annulation impossible — réessaie', ok ? undefined : { icon: 'alert-circle' });
  };

  // Mes tournois : ceux où mon équipe est inscrite ET ceux que J’AI créés (dédupliqués),
  // pour qu’un défi créé sans s’y inscrire reste retrouvable ici (et clôturable).
  const today = dayKey(new Date());
  const myCompIds = new Set([
    ...Object.keys(state.compRegistrations),
    ...state.myCompetitions.filter((c) => c.createdByMe).map((c) => c.id),
  ]);
  const myComps = [...myCompIds]
    .map((id) => [...state.myCompetitions, ...seedCompetitions].find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));

  // Récap envoyé aux partenaires (WhatsApp s’ouvre avec le message, tu choisis le destinataire).
  // La part par joueur se calcule sur le PRIX RÉEL du créneau (terrain à 4).
  const notifyPartners = (r: Reservation) => {
    const who = r.invited.length ? `\nÉquipe : ${r.invited.map((i) => i.name).join(', ')}` : '';
    const share = r.price ? `\nPrévois ${perPlayer(r.price)} chacun.` : '';
    openWhatsApp(
      '',
      `On joue au padel ! 🎾\n${r.clubName} — ${dateKeyLabel(r.dateKey)} à ${r.time} (session 1h30)\n${r.court}${who}${share}\nRéservé via PadelConnect.`,
    );
  };

  // Il manque des joueurs : appel à recrues sur WhatsApp (groupe/contact au choix), avec le
  // lien Universal du club — un padel se joue à 4 et l'app démarre sans réseau d'amis (le
  // message circule là où les joueurs d'Abidjan sont déjà : leurs groupes WhatsApp).
  const findPlayers = (r: Reservation) => {
    const missing = Math.max(1, 3 - r.invited.length);
    openWhatsApp(
      '',
      `Il me manque ${missing} joueur${missing > 1 ? 's' : ''} au padel ! 🎾\n` +
        `${r.clubName} — ${dateKeyLabel(r.dateKey)} à ${r.time} (session 1h30)${r.price ? ` · ~${perPlayer(r.price)}/joueur` : ''}\n` +
        `Qui vient ? ${APP_DOMAIN}/club/${r.clubId}`,
    );
  };

  const respond = async (r: Reservation, accept: boolean) => {
    const ok = await respondInvitation(r.id, accept);
    if (ok) {
      if (accept) hapticSuccess();
      toast.show(accept ? 'Invitation acceptée ✓' : 'Invitation refusée');
    } else toast.show('Action impossible — réessaie', { icon: 'alert-circle' });
  };

  // Synchronise une résa À VENIR dans le calendrier du téléphone (même helper que l’écran de
  // succès — l’habitué réserve plusieurs jours à l’avance et veut la retrouver dans son agenda).
  const addToCalendar = async (r: Reservation) => {
    const club = findClub(r.clubId, state.customClubs, state.clubInfo);
    const res = await addReservationToCalendar({ clubName: r.clubName, startsAt: r.startsAt, court: r.court, area: club?.area ?? '' });
    // « canceled » = l'utilisateur a refermé la fiche système lui-même : pas de toast d'erreur.
    if (res === 'canceled') return;
    toast.show(
      res === 'added' ? 'Ajouté à ton calendrier ✓' : 'Calendrier indisponible sur cet appareil.',
      res === 'added' ? undefined : { icon: 'alert-circle' },
    );
  };

  return (
    <Screen
      back
      title="Mes réservations"
      subtitle="À venir, statut du club, passées"
      refreshControl={state.serverUserId ? refreshControl : undefined}
    >
      {/* Invitations à confirmer — un ami t’a ajouté à sa réservation partagée. */}
      {pendingInvites.length > 0 ? (
        <View style={{ marginTop: spacing.sm }}>
          <SectionHeader title={`Invitations · ${pendingInvites.length}`} />
          {pendingInvites.map((r) => (
            <Card key={r.id} style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Txt variant="h3" style={{ fontSize: 15 }} numberOfLines={1}>
                    {r.clubName}
                  </Txt>
                  <Txt variant="muted">
                    {dateKeyLabel(r.dateKey)} · {r.time} · {r.court}
                  </Txt>
                  {r.bookedBy ? (
                    <Txt variant="small" color={colors.textFaint} style={{ marginTop: 2 }}>
                      Invité par {r.bookedBy.name}
                    </Txt>
                  ) : null}
                </View>
                <Tag label="À confirmer" tone="purple" icon="mail-unread" />
              </View>
              <Divider style={{ marginVertical: spacing.md }} />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button size="sm" label="J’accepte" icon="checkmark" onPress={() => respond(r, true)} full />
                </View>
                <Button size="sm" label="Refuser" icon="close" variant="ghost" onPress={() => respond(r, false)} />
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      {/* Mes cours — demandes envoyées aux coachs (le terrain n’est réservé qu’à l’acceptation) */}
      {lessonRequests.length > 0 ? (
        <View style={{ marginTop: spacing.sm }}>
          <SectionHeader title={`Mes cours · ${lessonRequests.length}`} />
          {lessonRequests.map((l, i) => (
            <Reveal key={l.id} delay={staggerDelay(i)}>
              <Card style={{ marginBottom: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="h3" style={{ fontSize: 15 }} numberOfLines={1}>
                      Cours avec {l.coachName}
                    </Txt>
                    <Txt variant="muted">
                      {l.clubName} · {l.dateLabel} à {l.time} · {l.court}
                    </Txt>
                  </View>
                  {l.status === 'pending' ? (
                    <Tag label="Attente coach" tone="purple" icon="hourglass-outline" />
                  ) : (
                    <Tag label="Refusé" tone="coral" icon="close-circle" />
                  )}
                </View>
                {l.status === 'pending' ? (
                  <>
                    <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
                      Le terrain sera réservé dès que {l.coachName} accepte — tu recevras une notification.
                    </Txt>
                    <View style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}>
                      <Button
                        size="sm"
                        label={cancellingLesson === l.id ? 'Annulation…' : 'Annuler ma demande'}
                        icon="close"
                        variant="ghost"
                        onPress={() => void cancelLesson(l.id)}
                        disabled={cancellingLesson !== null}
                      />
                    </View>
                  </>
                ) : (
                  <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
                    {l.coachName} n’était pas disponible sur ce créneau — tu peux redemander un autre horaire.
                  </Txt>
                )}
              </Card>
            </Reveal>
          ))}
        </View>
      ) : null}

      {/* À venir */}
      <View style={{ marginTop: spacing.sm }}>
        <SectionHeader title={`À venir · ${upcoming.length}`} />
        {upcoming.length === 0 ? (
          <Card>
            <EmptyState
              icon="calendar-outline"
              title="Aucune réservation à venir"
              text="Réserve un terrain : il apparaîtra ici avec son statut."
              actionLabel="Réserver un terrain"
              onAction={() => router.push('/reserver')}
            />
          </Card>
        ) : (
          upcoming.map((r, idx) => {
            const owner = isOwner(r);
            const canCancel = owner && r.startsAt - now > FIVE_H;
            const [, mm, dd] = r.dateKey.split('-');
            // Sans zéro initial pour rester cohérent avec dateKeyLabel (« 1 juil. », pas « 01 »).
            const day = dd ? String(Number(dd)) : '';
            const month = MONTHS[Number(mm) - 1] ?? '';
            return (
              <Reveal key={r.id} delay={staggerDelay(idx)}>
                <Card style={{ marginBottom: spacing.md }}>
                  <View style={styles.row}>
                    <View style={styles.dateChip}>
                      <Txt variant="h2" color={colors.onSignature} style={styles.dateDay}>
                        {day}
                      </Txt>
                      <Txt variant="small" color={colors.onSignature} style={styles.dateMonth}>
                        {month}
                      </Txt>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Txt variant="h3" style={{ fontSize: 15 }} numberOfLines={1}>
                        {r.clubName}
                      </Txt>
                      <Txt variant="muted">
                        {r.time} · {r.court} · 1h30
                      </Txt>
                      {r.price ? (
                        <Txt variant="small" color={colors.signature} style={{ fontWeight: '700' }}>
                          {fcfa(r.price)} · ~{perPlayer(r.price)}/joueur à 4
                        </Txt>
                      ) : null}
                    </View>
                    {r.clubConfirmed ? (
                      <Tag label="Confirmé" tone="green" icon="checkmark-circle" />
                    ) : (
                      // « En attente » faisait douter (« mon terrain est-il tenu ? ») — le
                      // terrain EST bloqué dès la réservation, seul l'accusé du club manque.
                      <Tag label="Le club confirme…" tone="amber" icon="hourglass-outline" />
                    )}
                  </View>
                  {!r.clubConfirmed ? (
                    <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
                      Ton terrain est bien bloqué — le club valide simplement de son côté.
                    </Txt>
                  ) : null}

                  {r.coachName ? (
                    // Réservation née d’un COURS accepté par le coach (respond_lesson).
                    <View style={styles.participants}>
                      <Ionicons name="school-outline" size={14} color={colors.purple} />
                      <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
                        Cours avec {r.coachName}
                      </Txt>
                    </View>
                  ) : null}
                  {!owner && r.bookedBy?.name ? (
                    <View style={styles.participants}>
                      <Ionicons name="person-circle-outline" size={14} color={colors.signature} />
                      <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
                        Réservé par {r.bookedBy.name} — tu es invité
                      </Txt>
                    </View>
                  ) : r.invited.length > 0 ? (
                    <View style={styles.participants}>
                      <Ionicons name="people-outline" size={14} color={colors.textMuted} />
                      <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
                        Avec {r.invited.map((i) => i.name).join(', ')}
                      </Txt>
                    </View>
                  ) : null}

                  <Divider style={{ marginVertical: spacing.md }} />
                  {/* Raccourcis contextuels : club + itinéraire + calendrier — chacun dans un
                      flex:1 pour que la rangée tienne toujours dans la largeur (petits écrans). */}
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <Button
                        size="sm"
                        label="Voir le club"
                        icon="business-outline"
                        variant="secondary"
                        onPress={() => router.push(`/club/${r.clubId}`)}
                        pill
                        full
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        size="sm"
                        label="Itinéraire"
                        icon="navigate-outline"
                        variant="secondary"
                        onPress={() => {
                          const club = findClub(r.clubId, state.customClubs, state.clubInfo);
                          if (club) openMaps(club);
                        }}
                        pill
                        full
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        size="sm"
                        label="Calendrier"
                        icon="calendar-outline"
                        variant="secondary"
                        onPress={() => void addToCalendar(r)}
                        pill
                        full
                      />
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <Button
                        size="sm"
                        label={r.invited.length < 3 && owner ? 'Chercher des joueurs' : 'Prévenir mes partenaires'}
                        icon="logo-whatsapp"
                        variant="secondary"
                        onPress={() => (r.invited.length < 3 && owner ? findPlayers(r) : notifyPartners(r))}
                        pill
                        full
                      />
                    </View>
                    {canCancel ? (
                      <Button size="sm" label="Annuler" icon="close" variant="danger" onPress={() => setCancelTarget(r)} pill />
                    ) : null}
                  </View>
                  {owner && !canCancel
                    ? (() => {
                        // À moins de 5 h, l'annulation passe par le club (décision porteur) :
                        // message ACTIONNABLE — un tap ouvre WhatsApp si le club a un numéro.
                        const clubPhone = findClub(r.clubId, state.customClubs, state.clubInfo)?.contactPhone;
                        const note = (
                          <Txt variant="small" color={colors.textFaint} style={{ flexShrink: 1, textAlign: 'center' }}>
                            Annulation impossible (moins de 5h avant) — à voir directement avec le club.
                          </Txt>
                        );
                        return clubPhone ? (
                          <Pressable
                            onPress={() =>
                              openWhatsApp(
                                clubPhone,
                                `Bonjour, je dois annuler ma réservation du ${dateKeyLabel(r.dateKey)} à ${r.time} (${r.court}) — désolé pour le contretemps.`,
                              )
                            }
                            style={{ marginTop: spacing.sm, alignItems: 'center', gap: 2 }}
                            accessibilityRole="button"
                            accessibilityLabel="Contacter le club sur WhatsApp pour annuler"
                          >
                            {note}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Ionicons name="logo-whatsapp" size={13} color={colors.signature} />
                              <Txt variant="small" color={colors.signature} style={{ fontWeight: '600' }}>
                                Contacter le club
                              </Txt>
                            </View>
                          </Pressable>
                        ) : (
                          <View style={{ marginTop: spacing.sm, alignItems: 'center' }}>{note}</View>
                        );
                      })()
                    : null}
                </Card>
              </Reveal>
            );
          })
        )}
      </View>

      {/* Mes tournois */}
      {myComps.length > 0 ? (
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title={`Mes tournois · ${myComps.length}`} />
          <Card>
            {myComps.map((c, i) => {
              const result = state.compResults[c.id];
              const myResult = state.officialResults.find((o) => o.compId === c.id);
              // Fin de plage incluse : un tournoi multi-jours EN COURS reste « À venir ».
              const finished = (c.endDateKey ?? c.dateKey) < today;
              // Inscrit → « avec {partenaire} » ; créé sans s’y inscrire → « organisé par toi ».
              const reg = state.compRegistrations[c.id];
              const subtitle = reg ? `${c.date} · avec ${reg.partner}` : `${c.date} · organisé par toi`;
              return (
                <Reveal key={c.id} delay={staggerDelay(i)}>
                  <View>
                    {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
                    <Card onPress={() => router.push(`/competition/${c.id}`)} style={styles.compRow}>
                      <View style={{ flex: 1 }}>
                        <Txt variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>
                          {c.title}
                        </Txt>
                        <Txt variant="small" color={colors.textMuted}>
                          {subtitle}
                        </Txt>
                      </View>
                      {result ? (
                        myResult?.result === 'win' ? (
                          <Tag label="Vainqueur !" tone="amber" icon="trophy" />
                        ) : myResult?.result === 'last' ? (
                          <Tag label="Fin de tableau" tone="coral" icon="arrow-down" />
                        ) : !reg ? (
                          // Organisateur non inscrit à son propre tournoi : « Participé » serait faux.
                          <Tag label="Terminé" tone="neutral" />
                        ) : (
                          <Tag label="Participé" tone="blue" />
                        )
                      ) : finished ? (
                        <Tag label="Résultats à venir" tone="neutral" />
                      ) : (
                        <Tag label="À venir" tone="purple" />
                      )}
                    </Card>
                  </View>
                </Reveal>
              );
            })}
          </Card>
        </View>
      ) : null}

      {/* Passées */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title={`Passées · ${past.length}`} />
        {past.length === 0 ? (
          <Card>
            <EmptyState
              icon="time-outline"
              title="Aucune partie jouée pour l’instant"
              text="Tes parties jouées s’afficheront ici, comptées automatiquement."
            />
          </Card>
        ) : (
          <Card>
            {pastShown.map((r, i) => (
              // L'entrée n'est animée QUE pour l'aperçu initial : les lignes dépliées via
              // « Voir plus » arrivent sans Reveal (pas de rafale d'animations au tap).
              <Reveal key={r.id} delay={i < PAST_PREVIEW ? staggerDelay(i) : 0} disabled={i >= PAST_PREVIEW}>
                <View>
                  {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Txt variant="body" style={{ fontWeight: '600' }}>
                        {r.clubName}
                      </Txt>
                      <Txt variant="muted">
                        {dateKeyLabel(r.dateKey)} · {r.time} · {r.court}
                      </Txt>
                    </View>
                    <Tag label="Jouée" tone="blue" />
                  </View>
                  {/* A-R7 : « Rejouer ici » → réservation du club, avec l’HEURE habituelle
                      pré-remplie (l’habitué rejoue souvent au même créneau — il ne reste que
                      le jour et le terrain à choisir). */}
                  <Pressable
                    onPress={() => router.push(`/reserver/${r.clubId}?time=${encodeURIComponent(r.time)}`)}
                    style={styles.replayBtn}
                  >
                    <Ionicons name="refresh-outline" size={13} color={colors.signature} />
                    <Txt variant="small" color={colors.signature} style={{ fontWeight: '600' }}>
                      Rejouer ici
                    </Txt>
                  </Pressable>
                </View>
              </Reveal>
            ))}
            {past.length > PAST_PREVIEW ? (
              <Button
                size="sm"
                label={pastShownCount < past.length ? `Voir plus (${past.length - pastShownCount} restantes)` : 'Réduire'}
                variant="ghost"
                onPress={() => setPastShownCount((n) => (n < past.length ? n + 20 : PAST_PREVIEW))}
              />
            ) : null}
          </Card>
        )}
      </View>

      {/* Confirmation avant annulation — plus de suppression en un seul tap */}
      <BottomSheet
        visible={cancelTarget !== null}
        title="Annuler cette réservation ?"
        subtitle={
          cancelTarget
            ? `${cancelTarget.clubName} — ${dateKeyLabel(cancelTarget.dateKey)} à ${cancelTarget.time} · ${cancelTarget.court}`
            : undefined
        }
        onClose={() => setCancelTarget(null)}
      >
        <Txt variant="body" color={colors.textMuted}>
          Le créneau sera libéré et le club ne la verra plus.
        </Txt>
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          <Button
            label="Oui, annuler"
            icon="close-circle"
            variant="danger"
            onPress={() => {
              const target = cancelTarget;
              setCancelTarget(null);
              if (target) {
                void cancelReservation(target.id).then((ok) =>
                  toast.show(ok ? 'Réservation annulée' : 'Annulation impossible — réessaie', ok ? undefined : { icon: 'alert-circle' }),
                );
              }
            }}
            full
          />
          <Button label="Garder ma réservation" variant="secondary" onPress={() => setCancelTarget(null)} full />
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dateChip: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.signature,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: { lineHeight: 24 },
  dateMonth: { fontSize: 9, letterSpacing: 0.5, opacity: 0.85 },
  compRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: 0,
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
    backgroundColor: 'transparent',
  },
  participants: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  replayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
});
