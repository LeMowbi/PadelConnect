import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, SectionHeader, Tag, Txt } from '@/components/ui';
import { durationLabel } from '@/lib/courtSchedule';
import { dateKeyLabel } from '@/lib/days';
import { fetchGroupLessons, joinGroupLesson, type GroupLesson } from '@/lib/groupLessons';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

const PREVIEW = 3; // liste repliée par défaut (la fiche club reste centrée sur la réservation)

// COURS COLLECTIFS (19) : un coach du club ouvre une session à N places ; les élèves rejoignent
// tant qu'il en reste. La désinscription vit dans « Mes réservations » (côté élève).
// DEUX habits pour un seul composant (règle §3, pas de doublon) :
//  • fiche CLUB (coachId absent) — tous les cours du club, SectionHeader + 3 max + « Voir tout » ;
//  • fiche COACH (coachId fourni) — ses cours seulement, en-tête « Ses cours collectifs »,
//    au-dessus du tunnel de demande individuelle (écran « Réserver un cours »).
// Section entièrement MASQUÉE tant qu'aucun cours n'est à venir — jamais d'en-tête suivi de vide.
// Convention §8 : un échec réseau ne vide jamais la liste déjà affichée.
export function ClubGroupLessons({ clubId, coachId, coachName }: { clubId: string; coachId?: string; coachName?: string }) {
  const { state } = useApp();
  const toast = useToast();
  // undefined = chargement ; null = échec réseau (≠ [] = aucun cours).
  const [lessons, setLessons] = useState<GroupLesson[] | null | undefined>(undefined);
  const [showAll, setShowAll] = useState(false);
  const [joining, setJoining] = useState<string | null>(null); // garde anti double-tap

  useEffect(() => {
    let alive = true;
    // setState APRÈS await (règle React Compiler) : jamais de setState synchrone dans l'effet.
    const load = () =>
      void fetchGroupLessons(clubId).then((rows) => {
        if (!alive) return;
        setLessons((cur) => rows ?? (cur === undefined ? null : cur));
      });
    load();
    // Retour au premier plan : les places partent vite (et le coach peut avoir ouvert un cours).
    const sub = AppState.addEventListener('change', (st) => st === 'active' && load());
    return () => {
      alive = false;
      sub.remove();
    };
    // `mine` (déjà inscrit) est calculé côté serveur pour l'utilisateur courant : une session qui
    // arrive après le premier rendu doit relancer le chargement.
  }, [clubId, state.serverUserId]);

  const join = async (l: GroupLesson) => {
    if (joining) return;
    setJoining(l.id);
    const res = await joinGroupLesson(l.id);
    setJoining(null);
    if (res === 'ok') {
      hapticSuccess();
      toast.show('Inscrit au cours 🎾 — retrouve-le dans « Mes réservations »');
    } else {
      hapticWarning();
      toast.show(
        res === 'full'
          ? 'Complet — la dernière place vient d’être prise.'
          : res === 'already'
            ? 'Tu es déjà inscrit à ce cours.'
            : res === 'gone'
              ? 'Ce cours n’est plus disponible.'
              : 'Connexion impossible — réessaie.',
        { icon: 'alert-circle' },
      );
    }
    // Succès comme refus métier ('full'/'already'/'gone') : la liste affichée est périmée.
    if (res !== 'error') void fetchGroupLessons(clubId).then((rows) => rows && setLessons(rows));
  };

  // Chargement, échec réseau ou aucun cours (du club, ou de CE coach) → rien du tout (discret).
  const visible = coachId ? (lessons ?? []).filter((l) => l.coachId === coachId) : (lessons ?? []);
  if (!lessons || visible.length === 0) return null;
  const shown = coachId || showAll ? visible : visible.slice(0, PREVIEW);

  const rows = (
    <Card style={coachId ? { marginTop: spacing.sm } : undefined}>
      <Txt variant="small" color={colors.textMuted}>
        {coachId
          ? `Sessions à plusieurs déjà ouvertes par ${coachName ?? 'ce coach'} — le terrain est réservé, il ne reste qu’à prendre ta place.`
          : 'Des cours à plusieurs, encadrés par les coachs du club. Le tarif se règle au coach, sur place.'}
      </Txt>
      {shown.map((l, i) => {
        const left = Math.max(0, l.capacity - l.joined);
        return (
          <View key={l.id}>
            {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : <View style={{ height: spacing.sm }} />}
            <View style={styles.row}>
              <View style={styles.when}>
                <Txt variant="h3" style={{ textAlign: 'center' }}>
                  {l.time}
                </Txt>
                <Txt variant="small" color={colors.textMuted} style={{ textAlign: 'center' }}>
                  {dateKeyLabel(l.dateKey)}
                </Txt>
              </View>
              <View style={{ flex: 1 }}>
                {/* Sur la fiche du coach, répéter son nom sur chaque ligne serait du bruit. */}
                {!coachId ? (
                  <Txt variant="body" numberOfLines={1} style={{ fontWeight: '600' }}>
                    Coach {l.coachName}
                  </Txt>
                ) : null}
                <View style={styles.tags}>
                  <Tag label={`${l.joined}/${l.capacity} places`} tone={left === 0 ? 'neutral' : 'signature'} icon="people-outline" />
                  <Tag label={durationLabel(l.durationMin)} tone="neutral" />
                  {left === 1 ? <Tag label="Dernière place !" tone="coral" icon="flame" /> : null}
                </View>
                <Txt variant="small" color={colors.textMuted} numberOfLines={1} style={{ marginTop: 2 }}>
                  {l.court}
                </Txt>
                {l.note ? (
                  <Txt variant="small" color={colors.textFaint} numberOfLines={2} style={{ marginTop: 2 }}>
                    {l.note}
                  </Txt>
                ) : null}
              </View>
              {l.coachId === state.serverUserId ? (
                // Le coach qui a ouvert le cours : le serveur lui refuserait de « rejoindre »
                // (join_group_lesson → 'gone'), autant le dire clairement plutôt qu'un bouton
                // qui échoue. Il gère ses inscrits dans l'Espace Coach.
                <Tag label="Ton cours" tone="green" />
              ) : l.mine ? (
                <Tag label="Inscrit ✓" tone="green" />
              ) : left === 0 ? (
                <Tag label="Complet" tone="neutral" />
              ) : (
                <Button
                  size="sm"
                  label={joining === l.id ? '…' : 'Rejoindre'}
                  icon="enter-outline"
                  onPress={() => void join(l)}
                  disabled={!!joining}
                  accessibilityLabel={`Rejoindre le cours du coach ${l.coachName}, ${dateKeyLabel(l.dateKey)} à ${l.time}`}
                />
              )}
            </View>
          </View>
        );
      })}
    </Card>
  );

  if (coachId) {
    return (
      <>
        <Txt variant="label" style={{ marginTop: spacing.lg }}>
          Ses cours collectifs
        </Txt>
        {rows}
      </>
    );
  }
  return (
    <View style={{ marginTop: spacing.lg }}>
      <SectionHeader
        title={`Cours collectifs · ${visible.length}`}
        actionLabel={visible.length > PREVIEW ? (showAll ? 'Réduire' : `Voir tout (${visible.length})`) : undefined}
        onAction={visible.length > PREVIEW ? () => setShowAll((v) => !v) : undefined}
      />
      {rows}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tags: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 },
  when: {
    minWidth: 64,
    backgroundColor: colors.signatureSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
});
