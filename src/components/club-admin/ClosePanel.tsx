import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Tag, Txt } from '@/components/ui';
import { teamsToShow, type Competition } from '@/data/competitions';
import { colors, radius, spacing } from '@/theme';

// Panneau de clôture (organisateur) : équipes inscrites → vainqueur → fin de parcours.
// Tournoi à élimination : vainqueur (+0.50) puis (option) dernière place (−0.25).
// Americano (par rotation) : on clôture par un PODIUM 1ᵉ/2ᵉ/3ᵉ (seul le 1ᵉ gagne du niveau).
export function ClosePanel({
  comp,
  myTeam,
  onClose,
  onCancel,
  onDelete,
}: {
  comp: Competition;
  myTeam?: string;
  onClose: (winner: string, winnerIsMe: boolean, loser?: string, loserIsMe?: boolean, podium?: { second?: string; third?: string }) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const teams = teamsToShow(comp, myTeam);
  const [selected, setSelected] = useState<string | null>(null);
  const [loser, setLoser] = useState<string | null>(null);
  const [second, setSecond] = useState<string | null>(null);
  const [third, setThird] = useState<string | null>(null);
  const [step, setStep] = useState<'winner' | 'final'>('winner');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Americano : tournoi par rotation → clôture par un podium (2ᵉ/3ᵉ place), pas une fin de tableau.
  const isAmericano = comp.format.toLowerCase().includes('americano');

  // Aucun inscrit : rien à clôturer — on propose d'annuler le tournoi (avec confirmation).
  if (teams.length === 0) {
    return (
      <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
        <Txt variant="body" color={colors.textMuted}>
          Aucune équipe ne s'est inscrite : il n'y a pas de vainqueur à désigner.
        </Txt>
        {onDelete ? (
          confirmDelete ? (
            <>
              <Txt variant="small" color={colors.textMuted}>
                Annuler définitivement ce tournoi ? Il disparaîtra des listes.
              </Txt>
              <Button size="sm" label="Oui, annuler le tournoi" icon="trash-outline" variant="danger" onPress={onDelete} full />
              <Button size="sm" label="Le garder" variant="secondary" onPress={() => setConfirmDelete(false)} full />
            </>
          ) : (
            <Button
              size="sm"
              label="Annuler ce tournoi"
              icon="trash-outline"
              variant="danger"
              onPress={() => setConfirmDelete(true)}
              full
            />
          )
        ) : (
          <Button size="sm" label="Fermer" variant="secondary" onPress={onCancel} full />
        )}
      </View>
    );
  }

  return (
    <View style={{ marginTop: spacing.sm }}>
      {comp.official ? (
        <Txt variant="small" color={colors.amber} style={{ fontWeight: '600' }}>
          {isAmericano
            ? 'Tournoi officiel — l’équipe vainqueure gagne +0.50 de niveau.'
            : 'Tournoi officiel — vainqueur +0.50, fin de tableau −0.25 de niveau.'}
        </Txt>
      ) : null}

      {step === 'winner' ? (
        <>
          <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
            Équipe vainqueure · {teams.length} inscrite{teams.length > 1 ? 's' : ''}
          </Txt>
          <View style={{ marginTop: spacing.sm, gap: 6 }}>
            {teams.map((t) => {
              const sel = selected === t;
              return (
                <Pressable key={t} onPress={() => setSelected(t)} style={[styles.teamRow, sel && styles.teamRowSel]}>
                  <Ionicons
                    name={sel ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={sel ? colors.signature : colors.textMuted}
                  />
                  <Txt variant="body" style={{ flex: 1, fontWeight: sel ? '700' : '400' }}>
                    {t}
                  </Txt>
                  {myTeam === t ? <Tag label="Ton équipe" tone="blue" /> : null}
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Button
                size="sm"
                label={isAmericano ? 'Suite : podium →' : 'Valider le vainqueur'}
                icon="flag"
                onPress={() => setStep('final')}
                disabled={!selected}
                full
              />
            </View>
            <Button size="sm" label="Annuler" variant="ghost" onPress={onCancel} />
          </View>
        </>
      ) : isAmericano ? (
        <>
          <Txt variant="body" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
            1ʳᵉ place : <Txt style={{ fontWeight: '700' }}>{selected}</Txt>. Ajoute la 2ᵉ et la 3ᵉ place (facultatif).
          </Txt>
          <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.md }}>
            🥈 2ᵉ place
          </Txt>
          <View style={{ marginTop: 6, gap: 6 }}>
            {teams
              .filter((t) => t !== selected)
              .map((t) => {
                const sel = second === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => {
                      setSecond((cur) => (cur === t ? null : t));
                      if (third === t) setThird(null);
                    }}
                    style={[styles.teamRow, sel && styles.teamRowSel]}
                  >
                    <Ionicons name={sel ? 'radio-button-on' : 'radio-button-off'} size={18} color={sel ? colors.amber : colors.textMuted} />
                    <Txt variant="body" style={{ flex: 1, fontWeight: sel ? '700' : '400' }}>
                      {t}
                    </Txt>
                    {myTeam === t ? <Tag label="Ton équipe" tone="blue" /> : null}
                  </Pressable>
                );
              })}
          </View>
          <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.md }}>
            🥉 3ᵉ place
          </Txt>
          <View style={{ marginTop: 6, gap: 6 }}>
            {teams
              .filter((t) => t !== selected && t !== second)
              .map((t) => {
                const sel = third === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => setThird((cur) => (cur === t ? null : t))}
                    style={[styles.teamRow, sel && styles.teamRowSel]}
                  >
                    <Ionicons name={sel ? 'radio-button-on' : 'radio-button-off'} size={18} color={sel ? colors.coral : colors.textMuted} />
                    <Txt variant="body" style={{ flex: 1, fontWeight: sel ? '700' : '400' }}>
                      {t}
                    </Txt>
                    {myTeam === t ? <Tag label="Ton équipe" tone="blue" /> : null}
                  </Pressable>
                );
              })}
          </View>
          <View style={{ marginTop: spacing.md }}>
            <Button
              size="sm"
              label="Clôturer le tournoi"
              icon="trophy"
              onPress={() =>
                onClose(selected!, selected === myTeam, undefined, false, {
                  second: second ?? undefined,
                  third: third ?? undefined,
                })
              }
              full
            />
          </View>
        </>
      ) : (
        <>
          <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
            Fin de tableau ? (facultatif)
          </Txt>
          <View style={{ marginTop: spacing.sm, gap: 6 }}>
            {teams
              .filter((t) => t !== selected)
              .map((t) => {
                const sel = loser === t;
                return (
                  <Pressable key={t} onPress={() => setLoser(t)} style={[styles.teamRow, sel && styles.teamRowSel]}>
                    <Ionicons name={sel ? 'radio-button-on' : 'radio-button-off'} size={18} color={sel ? colors.coral : colors.textMuted} />
                    <Txt variant="body" style={{ flex: 1, fontWeight: sel ? '700' : '400' }}>
                      {t}
                    </Txt>
                    {myTeam === t ? <Tag label="Ton équipe" tone="blue" /> : null}
                  </Pressable>
                );
              })}
          </View>
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            <Button
              size="sm"
              label={loser ? `Clôturer (fin de tableau : ${loser})` : 'Clôturer'}
              icon="trophy"
              onPress={() => onClose(selected!, selected === myTeam, loser ?? undefined, !!loser && loser === myTeam)}
              disabled={!loser}
              full
            />
            <Button
              size="sm"
              label="Passer (pas de fin de tableau)"
              variant="ghost"
              onPress={() => onClose(selected!, selected === myTeam)}
              full
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  teamRowSel: { backgroundColor: colors.signatureSoft, borderWidth: 1, borderColor: colors.signature },
});
