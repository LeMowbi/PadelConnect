import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { PlayerSheet, type PlayerLike } from '@/components/PlayerSheet';
import { Screen } from '@/components/Screen';
import { Button, Card, Divider, EmptyState, Tag, Txt } from '@/components/ui';
import { demoTeams, formatFee, seedCompetitions, teamCount } from '@/data/competitions';
import { dayKey } from '@/lib/days';
import { shareCompetition } from '@/lib/share';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

export default function CompetitionDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { state, registerCompetition, unregisterCompetition, closeCompetition, deleteCompetition } = useApp();

  const key = Array.isArray(id) ? id[0] : id;
  const comp = [...state.myCompetitions, ...seedCompetitions].find((c) => c.id === key);

  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState('');
  const [winnerName, setWinnerName] = useState('');
  const [loserName, setLoserName] = useState(''); // équipe classée dernière (facultatif)
  const [pickingLoser, setPickingLoser] = useState(false); // 2ᵉ étape de clôture
  const [confirmCancel, setConfirmCancel] = useState(false); // annulation d'un tournoi sans inscrit
  const [toast, setToast] = useState<string | null>(null);
  const [openPlayer, setOpenPlayer] = useState<PlayerLike | null>(null);

  if (!comp) {
    return (
      <Screen back>
        <EmptyState icon="alert-circle-outline" title="Tournoi introuvable" />
      </Screen>
    );
  }

  const reg = state.compRegistrations[comp.id];
  const registered = !!reg;
  // Cycle de vie : à venir → terminé (date passée) → clôturé (vainqueur désigné par l'ORGANISATEUR).
  const played = comp.dateKey <= dayKey(new Date());
  const result = state.compResults[comp.id];
  const mine = state.officialResults.find((o) => o.compId === comp.id);
  const myTeam = registered ? `${state.account?.firstName ?? 'Toi'} & ${reg.partner}` : '';
  // Un défi créé par un joueur se clôture ici, par son créateur. (Les tournois de
  // club se clôturent dans l'Espace Club.)
  const canClose = !!comp.createdByMe && played && !result;
  const teams = teamCount(comp, registered);
  const teamList = demoTeams(comp, registered ? myTeam : undefined);
  const left = Math.max(0, comp.slots - teams);
  const full = left === 0 && !registered;
  const pct = Math.min(100, Math.round((teams / comp.slots) * 100));

  const byClub = comp.organizerType === 'club';
  const partner = (partnerId ? state.friends.find((f) => f.id === partnerId)?.name : partnerName.trim()) ?? '';
  const canRegister = !full && partner.length > 0;

  const pickFriend = (fid: string) => {
    setPartnerId((cur) => (cur === fid ? null : fid));
    setPartnerName('');
  };

  // Clôture effective : vainqueur + (option) dernière équipe.
  const doClose = (loser?: string) =>
    closeCompetition(comp, winnerName, winnerName === myTeam && registered, loser, !!loser && loser === myTeam && registered);

  return (
    <Screen
      back
      title="Tournoi"
      overlay={
        toast ? (
          // Toast léger (« Lien copié ! » après partage sur ordinateur)
          <View style={styles.toast} pointerEvents="none">
            <Ionicons name="checkmark-circle" size={16} color={colors.white} />
            <Txt variant="small" color={colors.white}>
              {toast}
            </Txt>
          </View>
        ) : null
      }
    >
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        <Tag
          label={byClub ? `Organisé par ${comp.organizer}` : `Créé par ${comp.organizer} (joueur)`}
          tone={byClub ? 'blue' : 'green'}
          icon={byClub ? 'business' : 'person'}
        />
        {comp.official ? <Tag label="Officiel" tone="amber" icon="shield-checkmark" /> : null}
      </View>
      <Txt variant="display" style={{ fontSize: 26, marginTop: spacing.md }}>
        {comp.title}
      </Txt>

      <Card style={{ marginTop: spacing.lg }}>
        {comp.reward.trim() ? (
          <>
            <View style={styles.reward}>
              <Ionicons name="gift" size={22} color={colors.purple} />
              <View style={{ flex: 1 }}>
                <Txt variant="label" color={colors.textFaint}>
                  Récompense
                </Txt>
                <Txt variant="h3" color={colors.purple}>
                  {formatFee(comp.reward)}
                </Txt>
              </View>
            </View>
            <Divider style={{ marginVertical: spacing.md }} />
          </>
        ) : null}
        <Info icon="calendar-outline" label="Date" value={comp.date} />
        <Info icon="git-network-outline" label="Format" value={comp.format} />
        <Info icon="podium-outline" label="Niveau" value={comp.level} />
        <Info icon="cash-outline" label="Inscription" value={formatFee(comp.fee)} />
      </Card>

      {/* Places — limitées, en équipes */}
      <Card style={{ marginTop: spacing.md }}>
        <View style={styles.placesHead}>
          <Txt variant="label" color={colors.textFaint}>
            ÉQUIPES INSCRITES
          </Txt>
          <Txt variant="h3">
            {teams}/{comp.slots}
          </Txt>
        </View>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: (`${pct}%` as `${number}%`) }]} />
        </View>
        <Txt variant="small" color={full ? colors.danger : colors.textMuted} style={{ marginTop: spacing.sm }}>
          {registered
            ? 'Ton équipe est inscrite.'
            : full
              ? 'Complet — toutes les places sont prises.'
              : `Il reste ${left} place${left > 1 ? 's' : ''}.`}
        </Txt>
        {teamList.length > 0 ? (
          <>
            <Divider style={{ marginVertical: spacing.md }} />
            <View style={styles.teamsWrap}>
              {teamList.map((t) => (
                <Pressable key={t} onPress={() => setOpenPlayer({ id: `team:${comp.id}:${t}`, name: t, isTeam: true })}>
                  <Tag label={t} tone={t === myTeam && registered ? 'blue' : 'neutral'} icon="people" />
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </Card>

      <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
        {byClub && comp.clubId ? (
          <Button
            label={`Voir ${comp.clubName}`}
            icon="location-outline"
            variant="secondary"
            onPress={() => router.push(`/club/${comp.clubId}`)}
          />
        ) : null}
        <Button
          label="Partager le tournoi"
          icon="share-social-outline"
          variant="ghost"
          onPress={async () => {
            const r = await shareCompetition(comp);
            if (r === 'copied') {
              setToast('Lien copié !');
              setTimeout(() => setToast(null), 2200);
            }
          }}
        />
      </View>

      {/* Résultats (tournoi clôturé) */}
      {result ? (
        <Card style={{ marginTop: spacing.lg, borderColor: colors.amber }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Ionicons name="trophy" size={24} color={colors.amber} />
            <View style={{ flex: 1 }}>
              <Txt variant="label" color={colors.textFaint}>
                Vainqueur
              </Txt>
              <Txt variant="h3" color={colors.amber}>
                {result.winner}
              </Txt>
            </View>
            {mine ? (
              <Tag
                label={mine.result === 'win' ? 'Vainqueur !' : mine.result === 'last' ? 'Dernière place' : 'Participé'}
                tone={mine.result === 'win' ? 'amber' : mine.result === 'last' ? 'coral' : 'blue'}
                icon={mine.result === 'win' ? 'trophy' : mine.result === 'last' ? 'arrow-down' : 'checkmark'}
              />
            ) : null}
          </View>
          {result.loser ? (
            <Txt variant="small" color={colors.textFaint} style={{ marginTop: 4 }}>
              Dernière place : {result.loser}
            </Txt>
          ) : null}
          {mine?.result === 'win' && comp.official ? (
            <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
              Tournoi officiel gagné : ton niveau passe à {mine.levelAfter.toFixed(2)} (+0.50).
            </Txt>
          ) : null}
          {mine?.result === 'last' && comp.official ? (
            <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
              Dernière place : ton niveau passe à {mine.levelAfter.toFixed(2)} (−0.25).
            </Txt>
          ) : null}
        </Card>
      ) : null}

      {/* Tournoi terminé SANS inscrit : rien à clôturer — le créateur peut l'annuler. */}
      {canClose && teamList.length === 0 ? (
        <Card style={{ marginTop: spacing.lg, borderColor: colors.danger }}>
          <Txt variant="h3">Tournoi terminé sans inscrit</Txt>
          <Txt variant="small" color={colors.textMuted} style={{ marginTop: 2 }}>
            Aucune équipe ne s'est inscrite : il n'y a pas de vainqueur à désigner.
          </Txt>
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {confirmCancel ? (
              <>
                <Txt variant="small" color={colors.textMuted}>
                  Annuler définitivement ce tournoi ? Il disparaîtra des listes.
                </Txt>
                <Button
                  label="Oui, annuler le tournoi"
                  icon="trash-outline"
                  variant="danger"
                  onPress={() => {
                    deleteCompetition(comp.id);
                    router.back();
                  }}
                  full
                />
                <Button label="Le garder" variant="secondary" onPress={() => setConfirmCancel(false)} full />
              </>
            ) : (
              <Button label="Annuler ce tournoi" icon="trash-outline" variant="danger" onPress={() => setConfirmCancel(true)} full />
            )}
          </View>
        </Card>
      ) : null}

      {/* Clôture — réservée au créateur du défi : vainqueur (puis, en option, dernière place) */}
      {canClose && teamList.length > 0 ? (
        <Card style={{ marginTop: spacing.lg, borderColor: colors.purple }}>
          {!pickingLoser ? (
            <>
              <Txt variant="h3">Clôturer & désigner le vainqueur</Txt>
              <Txt variant="small" color={colors.textMuted} style={{ marginTop: 2 }}>
                Le tournoi est terminé : sélectionne l'équipe qui a gagné. C'est toi (l'organisateur) qui décides.
              </Txt>
              <View style={{ marginTop: spacing.sm, gap: 6 }}>
                {teamList.map((t) => {
                  const sel = winnerName === t;
                  return (
                    <Pressable key={t} onPress={() => setWinnerName(t)} style={[styles.teamRow, sel && styles.teamRowSel]}>
                      <Ionicons name={sel ? 'radio-button-on' : 'radio-button-off'} size={18} color={sel ? colors.signature : colors.textMuted} />
                      <Txt variant="body" style={{ flex: 1, fontWeight: sel ? '700' : '400' }}>
                        {t}
                      </Txt>
                      {registered && t === myTeam ? <Tag label="Ton équipe" tone="blue" /> : null}
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ marginTop: spacing.md }}>
                <Button
                  label={winnerName ? `Vainqueur : ${winnerName}` : 'Valider le vainqueur'}
                  icon="flag"
                  onPress={() => setPickingLoser(true)}
                  disabled={!winnerName}
                  full
                />
              </View>
              {comp.official ? (
                <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
                  Tournoi officiel : l'équipe vainqueure gagne +0.50 de niveau.
                </Txt>
              ) : null}
            </>
          ) : (
            <>
              <Txt variant="h3">Équipe classée dernière ?</Txt>
              <Txt variant="small" color={colors.textMuted} style={{ marginTop: 2 }}>
                Facultatif. {comp.official ? 'L’équipe désignée perd −0.25 de niveau. ' : ''}Tu peux passer.
              </Txt>
              <View style={{ marginTop: spacing.sm, gap: 6 }}>
                {teamList.filter((t) => t !== winnerName).map((t) => {
                  const sel = loserName === t;
                  return (
                    <Pressable key={t} onPress={() => setLoserName(t)} style={[styles.teamRow, sel && styles.teamRowSel]}>
                      <Ionicons name={sel ? 'radio-button-on' : 'radio-button-off'} size={18} color={sel ? colors.coral : colors.textMuted} />
                      <Txt variant="body" style={{ flex: 1, fontWeight: sel ? '700' : '400' }}>
                        {t}
                      </Txt>
                      {registered && t === myTeam ? <Tag label="Ton équipe" tone="blue" /> : null}
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                <Button label={loserName ? `Clôturer (dernière : ${loserName})` : 'Clôturer'} icon="flag" onPress={() => doClose(loserName || undefined)} disabled={!loserName} full />
                <Button label="Passer (pas de dernière place)" variant="ghost" onPress={() => doClose(undefined)} full />
              </View>
            </>
          )}
        </Card>
      ) : null}

      {/* Inscription en équipe */}
      {registered ? (
        <Card style={{ marginTop: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Ionicons name="checkmark-circle" size={24} color={colors.green} />
            <View style={{ flex: 1 }}>
              <Txt variant="h3">Inscrit en équipe</Txt>
              <Txt variant="muted">Avec {reg.partner}</Txt>
            </View>
            {played && !result ? <Tag label="Résultats à venir" tone="neutral" icon="hourglass-outline" /> : null}
          </View>
          {played && !result && !comp.createdByMe ? (
            <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
              L'organisateur désignera l'équipe vainqueure — tes stats se mettront à jour automatiquement.
            </Txt>
          ) : null}
          {!played ? (
            <View style={{ marginTop: spacing.md }}>
              <Button label="Se désinscrire" icon="close" variant="danger" onPress={() => unregisterCompetition(comp.id)} full />
            </View>
          ) : null}
        </Card>
      ) : played ? null : full ? (
        // Tournoi complet : badge inactif — plus de formulaire ni de bouton estompé.
        <Card style={{ marginTop: spacing.lg, alignItems: 'center' }}>
          <Tag label="Complet" tone="coral" icon="lock-closed" />
          <Txt variant="muted" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
            Toutes les places sont prises — les inscriptions sont fermées.
          </Txt>
        </Card>
      ) : (
        <View style={{ marginTop: spacing.lg }}>
          <Txt variant="h3">S'inscrire en équipe</Txt>
          <Txt variant="muted" style={{ marginTop: 2 }}>
            Le padel se joue à 2 : choisis ton coéquipier.
          </Txt>

          {state.friends.length > 0 ? (
            <>
              <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.md }}>
                PARMI TES AMIS
              </Txt>
              <View style={styles.wrap}>
                {state.friends.map((f) => (
                  <Chip
                    key={f.id}
                    label={f.name}
                    icon={partnerId === f.id ? 'checkmark' : 'person-add'}
                    active={partnerId === f.id}
                    onPress={() => pickFriend(f.id)}
                  />
                ))}
              </View>
            </>
          ) : null}

          <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.md }}>
            OU UN AUTRE NOM
          </Txt>
          <TextInput
            value={partnerName}
            onChangeText={(t) => {
              setPartnerName(t);
              setPartnerId(null);
            }}
            placeholder="Nom du coéquipier"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
          />

          <View style={{ marginTop: spacing.lg }}>
            <Button
              label="S'inscrire en équipe"
              icon="add"
              onPress={() => {
                if (!canRegister) return;
                registerCompetition(comp.id, partner);
              }}
              disabled={!canRegister}
              full
            />
          </View>
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm, textAlign: 'center' }}>
            Prototype : inscription enregistrée sur l'appareil. Le règlement se fait au club.
          </Txt>
        </View>
      )}

      <PlayerSheet player={openPlayer} onClose={() => setOpenPlayer(null)} />
    </Screen>
  );
}

function Info({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.info}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <Txt variant="muted" style={{ width: 90 }}>
        {label}
      </Txt>
      <Txt variant="body" style={{ flex: 1, fontWeight: '600' }}>
        {value}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  reward: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  info: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  placesHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barTrack: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginTop: spacing.sm, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: radius.pill, backgroundColor: colors.signature },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  teamsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  teamRowSel: { backgroundColor: colors.signatureSoft, borderWidth: 1, borderColor: colors.signature },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    padding: spacing.md,
    marginTop: spacing.sm,
    fontSize: 15,
  },
  toast: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.signature,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
});
