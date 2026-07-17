import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Chip } from '@/components/Chip';
import { Button, Card, Txt } from '@/components/ui';
import { durationLabel, openCourtSlots, type CourtSlot } from '@/lib/courtSchedule';
import { slotTimestamp } from '@/lib/days';
import { colors, radius, spacing } from '@/theme';

// Motifs d'annulation par le club (chevauchement avec une réservation prise HORS APP).
const CANCEL_REASONS = ['Déjà pris au téléphone', 'Réservé sur place', 'Terrain indisponible', 'Autre'];

// Mini-formulaire « Annuler ce créneau (chevauchement) » : le club annule une résa joueur qui
// chevauche une réservation hors app. Motif OBLIGATOIRE (le joueur le lit), PROPOSITION d'un autre
// terrain/créneau OPTIONNELLE (le joueur l'accepte en un tap). Patron calqué sur QuickBlock (68).
export function ClubCancelForm({
  days,
  courts,
  grid,
  courtStatus,
  onCancel,
  onClose,
}: {
  days: { key: string; label: string; value: number }[];
  courts: string[];
  grid: Record<string, CourtSlot[]>; // grille EFFECTIVE de chaque terrain (resolvedGridFor)
  // Statut d'un créneau (réservé / bloqué / tournoi / libre) — on ne PROPOSE que du 'free' :
  // proposer un créneau déjà pris mènerait le joueur dans un cul-de-sac à la réservation.
  courtStatus: (
    dateKey: string,
    time: string,
    court: string,
    durationMin: number,
  ) => { state: 'free' | 'reserved' | 'blocked' | 'tournoi'; label?: string };
  onCancel: (reason: string, proposal?: { court: string; dateKey: string; time: string; durationMin: 60 | 90 }) => Promise<boolean>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);
  // Jour retrouvé par CLÉ (pas l'objet capturé) : après minuit days[0] change de valeur.
  const [selDayKey, setSelDayKey] = useState<string | null>(null);
  const day = days.find((d) => d.key === selDayKey) ?? days[0];
  const [court, setCourt] = useState<string | null>(null);
  const [slot, setSlot] = useState<CourtSlot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Créneaux OUVERTS du terrain proposé (les fermés `x:true` sont déjà indisponibles).
  const courtSlots = court ? openCourtSlots(grid, court) : [];
  // Proposition VALIDE = les trois champs choisis (sinon on annule sans alternative).
  const proposal = proposing && court && slot ? { court, dateKey: day.key, time: slot.t, durationMin: slot.d } : undefined;

  const submit = () => {
    if (!reason || busy) return;
    setBusy(true);
    setError(null);
    void onCancel(reason, proposal).then((ok) => {
      if (!ok) {
        setBusy(false);
        setError('Annulation impossible — réessaie.');
      }
      // Succès : le parent ferme le formulaire (la résa disparaît de la liste).
    });
  };

  return (
    <Card style={{ marginTop: spacing.sm, borderColor: colors.coral }}>
      <View style={styles.banner}>
        <Ionicons name="alert-circle" size={16} color={colors.coral} />
        <Txt variant="small" color={colors.text} style={{ flex: 1 }}>
          Le joueur sera prévenu que son créneau chevauche une réservation hors application. Sa fiabilité n’est pas touchée (ce n’est pas de
          sa faute).
        </Txt>
      </View>

      <Txt variant="label" style={{ marginTop: spacing.md }}>
        Motif (le joueur le verra)
      </Txt>
      <View style={styles.wrap}>
        {CANCEL_REASONS.map((r) => (
          <Chip key={r} label={r} active={r === reason} onPress={() => setReason(r)} />
        ))}
      </View>

      {/* Proposition d'une alternative — optionnelle. */}
      <Txt variant="label" style={{ marginTop: spacing.md }}>
        Proposer un autre créneau ?
      </Txt>
      <View style={styles.wrap}>
        <Chip
          label={proposing ? 'Oui, je propose une alternative' : 'Non'}
          active={proposing}
          onPress={() => {
            setProposing((p) => !p);
            setCourt(null);
            setSlot(null);
          }}
        />
      </View>

      {proposing ? (
        <>
          <Txt variant="label" style={{ marginTop: spacing.md }}>
            Jour
          </Txt>
          <View style={styles.wrap}>
            {days.map((d) => (
              <Chip
                key={d.key}
                label={d.label}
                active={d.key === day.key}
                onPress={() => {
                  setSelDayKey(d.key);
                  setCourt(null);
                  setSlot(null);
                }}
              />
            ))}
          </View>

          <Txt variant="label" style={{ marginTop: spacing.md }}>
            Terrain
          </Txt>
          <View style={styles.wrap}>
            {courts.map((c) => (
              <Chip
                key={c}
                label={c}
                active={c === court}
                onPress={() => {
                  setCourt(c);
                  setSlot(null);
                }}
              />
            ))}
          </View>

          {court ? (
            <>
              <Txt variant="label" style={{ marginTop: spacing.md }}>
                Créneau
              </Txt>
              <View style={styles.wrap}>
                {courtSlots.map((s) => {
                  const past = slotTimestamp(day.key, s.t) <= Date.now();
                  // On n'offre en alternative qu'un créneau LIBRE : proposer un créneau déjà
                  // réservé / bloqué / retenu par un tournoi mènerait le joueur à un cul-de-sac.
                  const st = court ? courtStatus(day.key, s.t, court, s.d).state : 'free';
                  const suffix = past
                    ? ' · passé'
                    : st === 'reserved'
                      ? ' · pris'
                      : st === 'blocked'
                        ? ' · bloqué'
                        : st === 'tournoi'
                          ? ' · tournoi'
                          : '';
                  return (
                    <Chip
                      key={s.t}
                      label={`${s.t} · ${durationLabel(s.d)}${suffix}`}
                      active={slot?.t === s.t}
                      disabled={past || st !== 'free'}
                      onPress={() => setSlot(s)}
                    />
                  );
                })}
              </View>
            </>
          ) : null}
        </>
      ) : null}

      {error ? (
        <Txt variant="small" color={colors.danger} style={{ marginTop: spacing.sm }}>
          {error}
        </Txt>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Button
            size="sm"
            label={proposal ? 'Annuler et proposer' : 'Annuler le créneau'}
            icon="close-circle-outline"
            variant="danger"
            disabled={!reason || busy}
            onPress={submit}
            full
          />
        </View>
        <Button size="sm" label="Fermer" variant="ghost" onPress={onClose} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.coralSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
});
