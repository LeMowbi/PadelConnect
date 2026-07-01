import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { Confetti } from '@/components/Confetti';
import { PlayerSheet, type PlayerLike } from '@/components/PlayerSheet';
import { Screen } from '@/components/Screen';
import { Button, Card, Divider, EmptyState, SectionHeader, Tag, Txt } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { findPlayerByPhone } from '@/lib/friends';
import { openWhatsApp } from '@/lib/contact';
import { contactsSupported, pickContact } from '@/lib/contactsPicker';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

// Indicatif Côte d'Ivoire pré-rempli (modifiable) : la plupart des joueurs sont locaux.
const DEFAULT_DIAL = '+225 ';

export default function AmisScreen() {
  const router = useRouter();
  const { state, sendFriendRequest, respondFriendRequest, removeFriend } = useApp();
  const { refreshControl } = usePullToRefresh();
  const toast = useToast();
  const [phone, setPhone] = useState(DEFAULT_DIAL);
  const [removeId, setRemoveId] = useState<string | null>(null); // ami en cours de retrait (confirmation)
  const [openPlayer, setOpenPlayer] = useState<PlayerLike | null>(null);
  // Recherche serveur par numéro : on n'invite QUE de vrais joueurs PadelConnect (pas de nom fictif).
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [found, setFound] = useState<{ name: string; level?: number } | null>(null);
  const [search, setSearch] = useState<'idle' | 'found' | 'notfound'>('idle');
  const [busyReq, setBusyReq] = useState<string | null>(null); // demande reçue en cours de réponse
  const [celebrate, setCelebrate] = useState(false); // confettis à l'acceptation d'une demande

  const openFriend = (f: { id: string; name: string; level?: number }) => setOpenPlayer({ id: f.id, name: f.name, level: f.level });

  const phoneReady = phone.replace(/\D/g, '').length >= 8;
  const requests = state.friendRequests;

  // Cherche le joueur par son numéro côté serveur. On n'invite que s'il a un VRAI compte.
  const doSearch = async () => {
    if (!phoneReady || searching) return;
    setSearching(true);
    setSearch('idle');
    const res = await findPlayerByPhone(phone);
    setSearching(false);
    if (res) {
      setFound(res);
      setSearch('found');
    } else {
      setFound(null);
      setSearch('notfound');
    }
  };

  // Envoie une DEMANDE d'ami : la personne doit l'accepter (elle n'est pas ajoutée d'office).
  const sendRequest = async () => {
    if (!found || sending) return;
    setSending(true);
    const res = await sendFriendRequest(phone);
    setSending(false);
    const name = res.friend?.name ?? found.name;
    if (res.status === 'sent') {
      toast.show(`Demande envoyée à ${name} — il doit l'accepter ✓`);
    } else if (res.status === 'accepted') {
      toast.show(`${name} est maintenant ton ami 🎾`);
    } else if (res.status === 'already_friends') {
      toast.show(`Tu es déjà ami avec ${name}.`);
    } else if (res.status === 'pending') {
      toast.show('Demande déjà envoyée — en attente de sa réponse.');
    } else {
      toast.show('Envoi impossible — réessaie dans un instant', { icon: 'alert-circle' });
      return;
    }
    setPhone(DEFAULT_DIAL);
    setFound(null);
    setSearch('idle');
  };

  // Répondre à une demande REÇUE (Accepter / Refuser).
  const respond = async (requestId: string, accept: boolean, name: string) => {
    if (busyReq) return;
    setBusyReq(requestId);
    const ok = await respondFriendRequest(requestId, accept);
    setBusyReq(null);
    if (!ok) {
      toast.show('Action impossible — réessaie', { icon: 'alert-circle' });
      return;
    }
    if (accept) setCelebrate(true); // 🎉 nouveau lien d'amitié
    toast.show(accept ? `${name} et toi êtes maintenant amis 🎾` : 'Demande refusée.');
  };

  // Choisir un contact du téléphone (plus rapide que taper le numéro).
  const chooseContact = async () => {
    const c = await pickContact();
    if (!c) return;
    setPhone(c.phone);
    setSearch('idle');
    setFound(null);
  };

  const invite = () =>
    openWhatsApp(
      phone,
      'Rejoins-moi sur PadelConnect 🎾 — on réserve un terrain de padel à Abidjan en 2 minutes. https://apps.apple.com/app/id6785261310',
    );

  // Le numéro change → la recherche précédente n'est plus valable.
  const onPhone = (t: string) => {
    setPhone(t);
    if (search !== 'idle') setSearch('idle');
  };

  return (
    <Screen back title="Amis" subtitle="Tes partenaires de jeu — invite-les sur tes réservations" refreshControl={refreshControl}>
      <View style={{ marginTop: spacing.sm }}>
        {/* Demandes REÇUES en attente : à accepter ou refuser (l'ami a le choix, dans les deux sens). */}
        {requests.length > 0 ? (
          <View style={{ marginBottom: spacing.lg }}>
            <SectionHeader title={`Demandes d'ami · ${requests.length}`} />
            <Card>
              {requests.map((r, i) => (
                <View key={r.requestId}>
                  {i > 0 ? <Divider style={{ marginVertical: spacing.md }} /> : null}
                  <View style={styles.row}>
                    <Avatar name={r.name} size={44} />
                    <View style={styles.rowInfo}>
                      <Txt variant="body" style={styles.rowName}>
                        {r.name}
                      </Txt>
                      <Txt variant="small" color={colors.textMuted}>
                        {r.level !== undefined ? `Niveau ${r.level.toFixed(1)} · ` : ''}veut t'ajouter
                      </Txt>
                    </View>
                  </View>
                  <View style={styles.reqActions}>
                    <Button
                      size="sm"
                      label={busyReq === r.requestId ? '…' : 'Accepter'}
                      icon="checkmark"
                      onPress={() => respond(r.requestId, true, r.name)}
                      disabled={busyReq === r.requestId}
                    />
                    <Button
                      size="sm"
                      label="Refuser"
                      variant="ghost"
                      onPress={() => respond(r.requestId, false, r.name)}
                      disabled={busyReq === r.requestId}
                    />
                  </View>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        {state.friends.length === 0 ? (
          <>
            <EmptyState
              icon="people-outline"
              title="Aucun ami pour l'instant"
              text="Ajoute tes partenaires ci-dessous : tu pourras les inviter en réservant."
            />
            <View style={{ alignItems: 'center', marginTop: spacing.md }}>
              <Button label="Inviter des amis" icon="gift-outline" variant="secondary" onPress={() => router.push('/parrainage')} pill />
            </View>
          </>
        ) : (
          <Card>
            {state.friends.map((f, i) => (
              <View key={f.id}>
                {i > 0 ? <Divider style={{ marginVertical: spacing.md }} /> : null}
                <View style={styles.row}>
                  <Pressable
                    onPress={() => openFriend(f)}
                    style={styles.rowTap}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`Voir le profil de ${f.name}`}
                  >
                    <Avatar name={f.name} size={44} />
                    <View style={styles.rowInfo}>
                      <Txt variant="body" style={styles.rowName}>
                        {f.name}
                      </Txt>
                      <Txt variant="small" color={colors.textMuted}>
                        {subtitleFor(f.level, f.phone)}
                      </Txt>
                    </View>
                  </Pressable>
                  <Button size="sm" label="Retirer" variant="ghost" onPress={() => setRemoveId(removeId === f.id ? null : f.id)} />
                </View>
                {removeId === f.id ? (
                  // Confirmation légère, en place — pas de suppression au premier tap.
                  <View style={styles.removeConfirm}>
                    <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
                      Retirer {f.name} de tes amis ?
                    </Txt>
                    <Button
                      size="sm"
                      label="Oui, retirer"
                      variant="danger"
                      onPress={() => {
                        removeFriend(f.id);
                        setRemoveId(null);
                      }}
                    />
                    <Button size="sm" label="Non" variant="secondary" onPress={() => setRemoveId(null)} />
                  </View>
                ) : null}
              </View>
            ))}
          </Card>
        )}

        <View style={styles.section}>
          <Card>
            <Txt variant="h3">Ajouter un ami</Txt>
            <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.xs }}>
              Entre son numéro (ou choisis un contact) : s'il est sur PadelConnect, tu lui envoies une demande. Il devient ton ami dès qu'il
              l'accepte.
            </Txt>
            {contactsSupported ? (
              <View style={{ marginTop: spacing.sm }}>
                <Button
                  size="sm"
                  label="Choisir dans mes contacts"
                  icon="person-circle-outline"
                  variant="secondary"
                  onPress={chooseContact}
                  pill
                />
              </View>
            ) : null}
            <TextInput
              value={phone}
              onChangeText={onPhone}
              placeholder="Numéro (+225…)"
              placeholderTextColor={colors.textFaint}
              keyboardType="phone-pad"
              style={styles.input}
            />
            <View style={{ marginTop: spacing.sm, opacity: phoneReady ? 1 : 0.5 }}>
              <Button size="sm" label={searching ? 'Recherche…' : 'Rechercher'} icon="search" variant="secondary" onPress={doSearch} pill />
            </View>

            {search === 'found' && found ? (
              <>
                <View style={styles.foundBox}>
                  <Avatar name={found.name} size={40} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="body" style={{ fontWeight: '600' }}>
                      {found.name}
                    </Txt>
                    <Txt variant="small" color={colors.textMuted}>
                      {found.level !== undefined ? `Niveau ${found.level.toFixed(1)} · ` : ''}sur PadelConnect
                    </Txt>
                  </View>
                  <Tag label="Vérifié" tone="green" icon="checkmark" />
                </View>
                <View style={{ marginTop: spacing.md }}>
                  <Button
                    size="sm"
                    label={sending ? 'Envoi…' : `Envoyer une demande à ${found.name}`}
                    icon="person-add"
                    onPress={sendRequest}
                    disabled={sending}
                    pill
                  />
                </View>
              </>
            ) : search === 'notfound' ? (
              <View style={styles.foundBox}>
                <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
                  Personne avec ce numéro sur PadelConnect. Invite-le à s'inscrire.
                </Txt>
                <Button size="sm" label="Inviter" icon="logo-whatsapp" variant="secondary" onPress={invite} />
              </View>
            ) : null}
          </Card>
        </View>
      </View>

      <PlayerSheet player={openPlayer} onClose={() => setOpenPlayer(null)} />
      {celebrate ? <Confetti onDone={() => setCelebrate(false)} /> : null}
    </Screen>
  );
}

// Sous-titre « Niveau X · {ville/zone si dispo} » — le second segment n'apparaît
// que s'il est renseigné (numéro de l'ami ou club favori du joueur suivi).
function subtitleFor(level: number | undefined, extra?: string): string {
  const parts: string[] = [];
  if (level !== undefined) parts.push(`Niveau ${level.toFixed(1)}`);
  if (extra) parts.push(extra);
  return parts.length > 0 ? parts.join(' · ') : 'Joueur PadelConnect';
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowInfo: { flex: 1, gap: 2 },
  rowName: { fontWeight: '600' },
  reqActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, justifyContent: 'flex-end' },
  removeConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  foundBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    padding: spacing.md,
    marginTop: spacing.sm,
    fontSize: 15,
  },
});
