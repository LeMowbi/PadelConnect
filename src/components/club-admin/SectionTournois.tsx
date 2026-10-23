import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useToast } from '@/components/Toast';
import { Button, Card, EmptyState, IconCircle, SectionHeader, Tag, Txt } from '@/components/ui';
import { type Club } from '@/data/clubs';
import {
  compDateLabel,
  entryFeeLabel,
  formatFee,
  isCompFinished,
  isTournamentPublic,
  teamCount,
  type Competition,
} from '@/data/competitions';
import { openWhatsApp } from '@/lib/contact';
import { durationLabel } from '@/lib/courtSchedule';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useTodayKey } from '@/lib/useTodayKey';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

// Ligne d'information compacte d'une demande de tournoi (icône + libellé + valeur).
function ReqInfo({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string }) {
  return (
    <View style={styles.reqInfoRow}>
      <Ionicons name={icon} size={14} color={colors.textFaint} />
      <Txt variant="small" color={colors.textFaint}>
        {label}
      </Txt>
      <Txt variant="small" style={{ flex: 1, textAlign: 'right', fontWeight: '600' }} numberOfLines={2}>
        {value}
      </Txt>
    </View>
  );
}

export function SectionTournois({ club, comps, onCloseComp }: { club: Club; comps: Competition[]; onCloseComp: (id: string) => void }) {
  const router = useRouter();
  const { state, approveCompetition, rejectCompetition, cancelCompetition } = useApp();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null); // demande/tournoi en cours de traitement (anti double-tap)
  // Refus COMMENTÉ : « Refuser » ouvre d'abord un champ motif (ex. « ces créneaux sont pris —
  // possible du 12 au 14 après 18h ») pour que l'organisateur sache quoi changer.
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  // Annulation d'un tournoi PUBLIÉ : même patron (champ motif ouvert d'abord, puis confirmation).
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Valider/refuser une demande : on ATTEND le serveur et on confirme (ou signale l’échec) —
  // avant, un échec réseau était totalement silencieux et le gérant croyait avoir publié.
  const decide = async (id: string, approve: boolean, reason = '') => {
    if (busyId) return;
    setBusyId(id);
    // approve : 'ok' | 'refused' (plage occupée — 37/53/54) | 'error' (réseau) ; reject reste booléen.
    const res = approve ? await approveCompetition(id) : (await rejectCompetition(id, reason)) ? 'ok' : 'error';
    setBusyId(null);
    if (res === 'ok') {
      hapticSuccess();
      toast.show(approve ? 'Tournoi validé — il est maintenant visible ✓' : 'Demande refusée — l’organisateur est prévenu.');
      setRejectingId(null);
      setRejectReason('');
    } else {
      hapticWarning();
      toast.show(
        res === 'refused'
          ? 'Publication impossible — le tournoi commence aujourd’hui ou est passé, ou des réservations, un autre tournoi ou une période/créneau fermé occupent déjà cette plage.'
          : approve
            ? 'Publication impossible — vérifie ta connexion puis réessaie.'
            : 'Action impossible — réessaie.',
        { icon: 'alert-circle' },
      );
    }
  };

  // Demandes de tournoi : créés par un joueur, en attente de validation de CE club.
  const tournamentRequests = state.myCompetitions.filter(
    (c) => c.clubId === club.id && c.status === 'pending' && c.organizerType !== 'club',
  );
  // Tournois publiés du club (hors demandes en attente) — pour la liste « Tournois du club ».
  const publishedComps = comps.filter(isTournamentPublic);
  // Recalé au passage de minuit (retour au premier plan) : « Date passée », « À clôturer » et le
  // bouton d'annulation ne restent pas figés sur la veille.
  const todayKey = useTodayKey();

  // ANNULATION d'un tournoi publié (97 — pluie, club indisponible…) : motif OBLIGATOIRE, montré aux
  // inscrits et à l'organisateur (push). Écriture honnête, un message PAR CODE serveur.
  const cancelComp = async (c: Competition) => {
    if (busyId) return;
    const reason = cancelReason.trim();
    if (!reason) {
      toast.show('Indique un motif : il est montré aux inscrits.', { icon: 'alert-circle' });
      return;
    }
    setBusyId(c.id);
    const res = await cancelCompetition(c.id, reason);
    setBusyId(null);
    if (res === 'ok') {
      hapticSuccess();
      toast.show('Tournoi annulé — les inscrits et l’organisateur sont prévenus.');
      setCancellingId(null);
      setCancelReason('');
      return;
    }
    hapticWarning();
    toast.show(
      res === 'gone'
        ? 'Ce tournoi n’est plus publié (déjà annulé ou supprimé) — liste actualisée.'
        : res === 'played'
          ? 'Ce tournoi est terminé ou clôturé : il ne peut plus être annulé.'
          : res === 'forbidden'
            ? 'Tu n’as pas les droits pour annuler ce tournoi.'
            : res === 'reason'
              ? 'Indique un motif : il est montré aux inscrits.'
              : 'Annulation impossible — vérifie ta connexion puis réessaie.',
      { icon: 'alert-circle' },
    );
  };

  return (
    <>
      {/* Demandes de tournoi — créés par des joueurs, à valider avant publication */}
      {tournamentRequests.length > 0 ? (
        <View style={{ marginBottom: spacing.xl }}>
          <SectionHeader title={`Demandes de tournoi · ${tournamentRequests.length}`} />
          <Txt variant="small" color={colors.textFaint} style={{ marginBottom: spacing.sm }}>
            Un tournoi créé par un joueur n’est visible qu’après ta validation.
          </Txt>
          {tournamentRequests.map((c) => {
            // Demande dont le 1ᵉʳ jour est AUJOURD'HUI ou passé : un tournoi se valide au plus tard
            // la veille (le serveur refuse — 97). Seul « Refuser » reste, motif pré-rempli.
            const late = c.dateKey <= todayKey;
            return (
              <Card key={c.id} style={{ marginBottom: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <IconCircle icon="trophy" color={colors.purple} bg={colors.purpleSoft} size={40} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="h3" style={{ fontSize: 15 }} numberOfLines={1}>
                      {c.title}
                    </Txt>
                    <Txt variant="muted">par {c.organizer}</Txt>
                  </View>
                  {late ? <Tag label={c.dateKey < todayKey ? 'Date passée' : 'Le jour même'} tone="coral" icon="alert-circle" /> : null}
                </View>

                {/* TOUTES les infos AVANT de décider : dates, terrains, créneaux bloqués, format,
                  frais d'inscription… — le gérant sait exactement ce qu'il accepte. */}
                <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
                  <ReqInfo icon="calendar-outline" label="Dates" value={compDateLabel(c)} />
                  <ReqInfo
                    icon="tennisball-outline"
                    label="Terrains bloqués"
                    value={c.courtNames?.length ? c.courtNames.join(', ') : 'Tout le club'}
                  />
                  <ReqInfo
                    icon="time-outline"
                    label="Créneaux bloqués"
                    value={
                      c.timeSlots?.length
                        ? // Créneaux MODULABLES (68) : on montre la durée de chaque créneau (1h/1h30)
                          // → le gérant sait EXACTEMENT ce qu'il bloque avant de valider (ex. « 08:00 (1h) »).
                          c.timeSlots.map((t, i) => (c.slotDurations?.[i] ? `${t} (${durationLabel(c.slotDurations[i])})` : t)).join(' · ')
                        : 'Toute la journée'
                    }
                  />
                  <ReqInfo icon="people-outline" label="Capacité" value={`${c.slots} équipes`} />
                  <ReqInfo icon="git-network-outline" label="Format" value={c.format} />
                  <ReqInfo icon="podium-outline" label="Niveau" value={c.level} />
                  <ReqInfo icon="cash-outline" label="Inscription" value={entryFeeLabel(c.fee)} />
                  {c.reward.trim() ? <ReqInfo icon="gift-outline" label="Récompense" value={formatFee(c.reward)} /> : null}
                </View>

                {/* Contacter l'organisateur AVANT de valider (négocier une autre date, préciser…). */}
                {c.organizerPhone ? (
                  <View style={{ marginTop: spacing.md }}>
                    <Button
                      size="sm"
                      label={`Contacter ${c.organizer}`}
                      icon="logo-whatsapp"
                      variant="secondary"
                      onPress={() =>
                        openWhatsApp(
                          c.organizerPhone ?? '',
                          `Bonjour, c’est ${club.name} (PadelConnect) au sujet de votre demande de tournoi « ${c.title} ».`,
                        )
                      }
                      full
                    />
                  </View>
                ) : null}

                {rejectingId === c.id ? (
                  <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                    <TextInput
                      value={rejectReason}
                      onChangeText={setRejectReason}
                      placeholder="Motif (ex. ces créneaux sont pris — possible du 12 au 14 après 18h)"
                      placeholderTextColor={colors.textMuted}
                      multiline
                      maxLength={300}
                      style={styles.reasonInput}
                      accessibilityLabel="Motif du refus, montré à l’organisateur"
                    />
                    <Txt variant="small" color={colors.textFaint}>
                      Le motif est montré à l’organisateur : dis-lui quand c’est possible, il pourra recréer son tournoi.
                    </Txt>
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <Button
                        size="sm"
                        label="Annuler"
                        variant="ghost"
                        onPress={() => {
                          setRejectingId(null);
                          setRejectReason('');
                        }}
                      />
                      <View style={{ flex: 1 }}>
                        <Button
                          size="sm"
                          label={busyId === c.id ? 'Refus…' : 'Confirmer le refus'}
                          icon="close"
                          variant="danger"
                          disabled={busyId === c.id}
                          onPress={() => decide(c.id, false, rejectReason.trim())}
                          full
                        />
                      </View>
                    </View>
                  </View>
                ) : late ? (
                  <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                    <Txt variant="small" color={colors.coralDark}>
                      Un tournoi se valide au plus tard la veille de son début : refuse-le, l’organisateur pourra le recréer à une date à
                      venir.
                    </Txt>
                    <Button
                      size="sm"
                      label="Refuser"
                      icon="close"
                      variant="danger"
                      disabled={busyId === c.id}
                      onPress={() => {
                        setRejectingId(c.id);
                        setRejectReason('La date de ce tournoi est arrivée avant sa validation — recrée-le à une date à venir.');
                      }}
                      full
                    />
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                    <Button
                      size="sm"
                      label="Refuser"
                      icon="close"
                      variant="danger"
                      disabled={busyId === c.id}
                      onPress={() => {
                        setRejectingId(c.id);
                        setRejectReason('');
                      }}
                    />
                    <View style={{ flex: 1 }}>
                      <Button
                        size="sm"
                        label={busyId === c.id ? 'Publication…' : 'Valider & publier'}
                        icon="checkmark"
                        disabled={busyId === c.id}
                        onPress={() => decide(c.id, true)}
                        full
                      />
                    </View>
                  </View>
                )}
              </Card>
            );
          })}
        </View>
      ) : null}

      <SectionHeader title="Tournois du club" />
      <Button
        label="Créer un tournoi (club)"
        icon="trophy"
        variant="tournament"
        onPress={() => router.push(`/competition/nouvelle?as=club&clubId=${club.id}`)}
        full
      />
      <View style={{ marginTop: spacing.md }}>
        {publishedComps.length === 0 ? (
          <EmptyState icon="trophy-outline" title="Aucun tournoi" text="Crée le premier tournoi de ton club." tone="purple" />
        ) : (
          publishedComps.map((c) => {
            const finished = isCompFinished(c, todayKey);
            const result = state.compResults[c.id];
            return (
              <Card key={c.id} style={{ marginBottom: spacing.sm }}>
                {/* Zone titre NON cliquable : le gérant ne quitte plus l’Espace Club par erreur.
                    La fiche joueur s’ouvre uniquement via « Voir la fiche ». */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="h3" style={{ fontSize: 15 }}>
                      {c.title}
                    </Txt>
                    <Txt variant="muted">
                      {c.date} · {teamCount(c, false)}/{c.slots} équipes
                    </Txt>
                  </View>
                  {result ? (
                    <Tag label={`Vainqueur : ${result.winner}`} tone="amber" icon="trophy" />
                  ) : finished ? (
                    <Tag label="À clôturer" tone="coral" icon="flag" />
                  ) : (
                    <Tag label="À venir" tone="purple" />
                  )}
                </View>
                {finished && !result ? (
                  <View style={{ marginTop: spacing.sm }}>
                    <Button size="sm" label="Clôturer & désigner le vainqueur" icon="flag" onPress={() => onCloseComp(c.id)} full />
                  </View>
                ) : null}
                {/* Pluie, club indisponible… : un tournoi publié À VENIR (ou en cours) s'annule ici —
                    les inscrits et l'organisateur sont prévenus, les terrains libérés. */}
                {!finished && !result && !c.closed && c.server ? (
                  cancellingId === c.id ? (
                    <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
                      <TextInput
                        value={cancelReason}
                        onChangeText={setCancelReason}
                        placeholder="Motif (ex. terrains inondés — tournoi reporté, on vous recontacte)"
                        placeholderTextColor={colors.textMuted}
                        multiline
                        maxLength={300}
                        style={styles.reasonInput}
                        accessibilityLabel="Motif de l’annulation, montré aux inscrits"
                      />
                      <Txt variant="small" color={colors.textFaint}>
                        Le motif est envoyé aux équipes inscrites et à l’organisateur. Le tournoi disparaît des listes et ses terrains
                        redeviennent réservables.
                      </Txt>
                      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                        <Button
                          size="sm"
                          label="Garder"
                          variant="ghost"
                          disabled={busyId === c.id}
                          onPress={() => {
                            setCancellingId(null);
                            setCancelReason('');
                          }}
                        />
                        <View style={{ flex: 1 }}>
                          <Button
                            size="sm"
                            label={busyId === c.id ? 'Annulation…' : 'Confirmer l’annulation'}
                            icon="close-circle-outline"
                            variant="danger"
                            disabled={busyId === c.id || !cancelReason.trim()}
                            onPress={() => void cancelComp(c)}
                            full
                          />
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={{ marginTop: spacing.sm }}>
                      <Button
                        size="sm"
                        label="Annuler le tournoi"
                        icon="close-circle-outline"
                        variant="ghost"
                        disabled={!!busyId}
                        onPress={() => {
                          setCancellingId(c.id);
                          setCancelReason('');
                        }}
                        full
                      />
                    </View>
                  )
                ) : null}
                <View style={{ marginTop: spacing.sm }}>
                  <Button
                    size="sm"
                    label="Voir la fiche (vue joueur)"
                    icon="open-outline"
                    variant="ghost"
                    onPress={() => router.push(`/competition/${c.id}`)}
                    full
                  />
                </View>
              </Card>
            );
          })
        )}
      </View>
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
        Un tournoi bloque les terrains et créneaux que tu as choisis (ou tout le club si tu n’en précises aucun). Une fois la date passée,
        clôture-le en désignant l’équipe vainqueure : les joueurs inscrits sont mis à jour.
      </Txt>
    </>
  );
}

const styles = StyleSheet.create({
  reqInfoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  reasonInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    minHeight: 64,
    textAlignVertical: 'top',
  },
});
