import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Tag, Txt } from '@/components/ui';
import { demoTeams, type Competition } from '@/data/competitions';
import { colors, radius, spacing } from '@/theme';

// Panneau de clôture (organisateur) : équipes inscrites → vainqueur → (option) équipe
// classée dernière. Tournoi officiel : vainqueur +0.50, dernière place −0.25.
export function ClosePanel({
  comp,
  myTeam,
  onClose,
  onCancel,
  onDelete,
}: {
  comp: Competition;
  myTeam?: string;
  onClose: (winner: string, winnerIsMe: boolean, loser?: string, loserIsMe?: boolean) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const teams = demoTeams(comp, myTeam);
  const [selected, setSelected] = useState<string | null>(null);
  const [loser, setLoser] = useState<string | null>(null);
  const [step, setStep] = useState<'winner' | 'loser'>('winner');
  const [confirmDelete, setConfirmDelete] = useState(false);

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
            <Button size="sm" label="Annuler ce tournoi" icon="trash-outline" variant="danger" onPress={() => setConfirmDelete(true)} full />
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
          Tournoi officiel — vainqueur +0.50, fin de tableau −0.25 de niveau.
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
                  <Ionicons name={sel ? 'radio-button-on' : 'radio-button-off'} size={18} color={sel ? colors.signature : colors.textMuted} />
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
              <Button size="sm" label="Valider le vainqueur" icon="flag" onPress={() => setStep('loser')} disabled={!selected} full />
            </View>
            <Button size="sm" label="Annuler" variant="ghost" onPress={onCancel} />
          </View>
        </>
      ) : (
        <>
          <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
            Fin de tableau ? (facultatif)
          </Txt>
          <View style={{ marginTop: spacing.sm, gap: 6 }}>
            {teams.filter((t) => t !== selected).map((t) => {
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
            <Button size="sm" label="Passer (pas de fin de tableau)" variant="ghost" onPress={() => onClose(selected!, selected === myTeam)} full />
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
