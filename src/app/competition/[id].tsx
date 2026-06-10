import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { Button, Card, Divider, EmptyState, Tag, Txt } from '@/components/ui';
import { seedCompetitions } from '@/data/competitions';
import { dayKey } from '@/lib/days';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

export default function CompetitionDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { state, registerCompetition, unregisterCompetition, recordOfficialResult } = useApp();

  const key = Array.isArray(id) ? id[0] : id;
  const comp = [...state.myCompetitions, ...seedCompetitions].find((c) => c.id === key);

  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState('');

  if (!comp) {
    return (
      <Screen back>
        <EmptyState icon="alert-circle-outline" title="Tournoi introuvable" />
      </Screen>
    );
  }

  const reg = state.compRegistrations[comp.id];
  const registered = !!reg;
  // Déclaration du résultat : tournoi OFFICIEL, inscrit, date passée (ou aujourd'hui), pas encore déclaré.
  const played = comp.dateKey <= dayKey(new Date());
  const declared = state.officialResults.find((o) => o.compId === comp.id);
  const canDeclare = registered && !!comp.official && played && !declared;
  const teams = comp.registered + (registered ? 1 : 0);
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

  return (
    <Screen back title="Tournoi">
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
        <View style={styles.reward}>
          <Ionicons name="gift" size={22} color={colors.purple} />
          <View style={{ flex: 1 }}>
            <Txt variant="label" color={colors.textFaint}>
              Récompense
            </Txt>
            <Txt variant="h3" color={colors.purple}>
              {comp.reward}
            </Txt>
          </View>
        </View>
        <Divider style={{ marginVertical: spacing.md }} />
        <Info icon="calendar-outline" label="Date" value={comp.date} />
        <Info icon="git-network-outline" label="Format" value={comp.format} />
        <Info icon="podium-outline" label="Niveau" value={comp.level} />
        <Info icon="cash-outline" label="Inscription" value={comp.fee} />
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
      </Card>

      {byClub && comp.clubId ? (
        <Button
          label={`Voir ${comp.clubName}`}
          icon="location-outline"
          variant="secondary"
          onPress={() => router.push(`/club/${comp.clubId}`)}
        />
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
            {declared ? <Tag label={declared.result === 'win' ? 'Gagné' : 'Perdu'} tone={declared.result === 'win' ? 'green' : 'danger'} /> : null}
          </View>
          {canDeclare ? (
            <>
              <Divider style={{ marginVertical: spacing.md }} />
              <Txt variant="label" color={colors.textFaint}>
                Tournoi terminé — quel a été ton résultat ?
              </Txt>
              <Txt variant="small" color={colors.textFaint} style={{ marginTop: 2 }}>
                Tournoi officiel : ton niveau évolue de ±0.25.
              </Txt>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button size="sm" label="Gagné" icon="trophy" onPress={() => recordOfficialResult(comp.title, 'win', comp.id)} full />
                </View>
                <View style={{ flex: 1 }}>
                  <Button size="sm" label="Perdu" icon="close" variant="danger" onPress={() => recordOfficialResult(comp.title, 'loss', comp.id)} full />
                </View>
              </View>
            </>
          ) : null}
          {declared ? (
            <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.md }}>
              Résultat enregistré → Niveau {declared.levelAfter.toFixed(2)}.
            </Txt>
          ) : null}
          {!played ? (
            <View style={{ marginTop: spacing.md }}>
              <Button label="Se désinscrire" icon="close" variant="danger" onPress={() => unregisterCompetition(comp.id)} full />
            </View>
          ) : null}
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
                    disabled={full}
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
            editable={!full}
            style={styles.input}
          />

          <View style={{ marginTop: spacing.lg }}>
            <Button
              label={full ? 'Complet' : "S'inscrire en équipe"}
              icon={full ? 'lock-closed' : 'add'}
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
  barFill: { height: 8, borderRadius: radius.pill, backgroundColor: colors.gold },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
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
});
