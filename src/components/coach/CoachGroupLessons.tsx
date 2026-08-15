import { useEffect, useState } from 'react';
import { AppState as RNAppState, StyleSheet, View } from 'react-native';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, Tag, Txt } from '@/components/ui';
import { durationLabel } from '@/lib/courtSchedule';
import { dateKeyLabel } from '@/lib/days';
import { fetchGroupLessons, joinGroupLesson, type GroupLesson } from '@/lib/groupLessons';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

// COURS COLLECTIFS (19) — variante CENTRÉE SUR UN COACH (écran « Réserver un cours ») de la
// section de la fiche club : mêmes données serveur (`fetch_group_lessons`, filtré ici sur ce
// coach), présentation resserrée « une autre façon de jouer avec lui » au-dessus du tunnel de
// demande individuelle. Masquée tant qu'aucun cours n'est à venir (jamais d'en-tête vide).
// Convention §8 : un échec réseau ne vide jamais la liste déjà affichée.
export function CoachGroupLessons({ clubId, coachId, coachName }: { clubId: string; coachId: string; coachName: string }) {
  // undefined = chargement ; null = échec du tout premier chargement (≠ [] = aucun cours).
  const [lessons, setLessons] = useState<GroupLesson[] | null | undefined>(undefined);
  const [joining, setJoining] = useState<string | null>(null); // garde anti double-tap
  const toast = useToast();
  const { state } = useApp();
  // Le coach qui consulte SA propre fiche : le serveur lui refuserait de rejoindre
  // (join_group_lesson → 'gone') — on affiche « Ton cours » plutôt qu'un bouton qui échoue.
  const iAmTheCoach = state.serverUserId === coachId;

  useEffect(() => {
    let alive = true;
    // setState APRÈS await (règle React Compiler) : jamais de setState synchrone dans l'effet.
    const load = () =>
      void fetchGroupLessons(clubId).then((rows) => {
        if (!alive) return;
        setLessons((cur) => rows ?? (cur === undefined ? null : cur));
      });
    load();
    // Retour au premier plan : les places partent vite (et le coach peut en avoir ouvert un).
    const sub = RNAppState.addEventListener('change', (st) => {
      if (st === 'active') load();
    });
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

  const mineCoach = (lessons ?? []).filter((l) => l.coachId === coachId);
  if (mineCoach.length === 0) return null;

  return (
    <>
      <Txt variant="label" style={{ marginTop: spacing.lg }}>
        Ses cours collectifs
      </Txt>
      <Card style={{ marginTop: spacing.sm }}>
        <Txt variant="small" color={colors.textMuted}>
          Sessions à plusieurs déjà ouvertes par {coachName} — le terrain est réservé, il ne reste qu’à prendre ta place.
        </Txt>
        {mineCoach.map((l, i) => {
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
                {iAmTheCoach ? (
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
                    accessibilityLabel={`Rejoindre le cours collectif du ${dateKeyLabel(l.dateKey)} à ${l.time}`}
                  />
                )}
              </View>
            </View>
          );
        })}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tags: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  when: {
    minWidth: 64,
    backgroundColor: colors.signatureSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
});
