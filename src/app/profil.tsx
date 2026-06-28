import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { BottomSheet } from '@/components/BottomSheet';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { Button, Card, Divider, IconCircle, SectionHeader, StatTile, Tag, Txt } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { levelLabel } from '@/lib/format';
import { pickImage } from '@/lib/pickImage';
import { GENDERS, ageFrom, genderLabel, maskBirthDate, parseBirthDate, zodiacFor, type Gender } from '@/lib/zodiac';
import { colors, gradients, radius, spacing } from '@/theme';

export default function ProfilScreen() {
  const router = useRouter();
  const { state, stats, setRemindersOn, signOut, resetAll, loadDemo, updateAccount } = useApp();
  const { account, level, friends, officialResults } = state;

  const [editing, setEditing] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);
  // Espaces pro : masqués par défaut (geste discret pour les révéler). Un gérant déjà
  // déverrouillé garde l'accès à l'Espace Club sans le geste. L'opérateur (PadelConnect)
  // n'apparaît JAMAIS sans le geste — il n'a pas sa place dans la navigation normale.
  const [proRevealed, setProRevealed] = useState(false);

  if (!account) return null;

  const showClub = proRevealed || state.unlockedClubIds.length > 0 || state.clubMode;
  const showOperator = proRevealed;

  const changePhoto = async () => {
    const uri = await pickImage({ square: true });
    if (uri) updateAccount({ photoUri: uri });
    setPhotoSheet(false);
  };

  // Trophées basés sur du réel : parties jouées (auto), tournois, niveau, amis.
  const badges = [
    { label: 'Première partie', ok: stats.played >= 1, need: 'Joue ta 1ʳᵉ partie' },
    { label: '5 parties', ok: stats.played >= 5, need: `${stats.played}/5 parties` },
    { label: '20 parties', ok: stats.played >= 20, need: `${stats.played}/20 parties` },
    { label: 'Premier tournoi', ok: stats.tournamentsPlayed >= 1, need: 'Joue un tournoi' },
    { label: 'Vainqueur de tournoi', ok: stats.tournamentsWon >= 1, need: 'Gagne un tournoi' },
    { label: 'Niveau 4+', ok: level >= 4, need: `Niveau ${level.toFixed(2)}/4` },
    { label: '5 amis', ok: friends.length >= 5, need: `${friends.length}/5 amis` },
  ];

  // B-R6 : prochain trophée le plus proche (excluant Vainqueur de tournoi et Niveau 4+).
  type NextTrophy = { label: string; current: number; target: number };
  const nextTrophy: NextTrophy | null = (() => {
    const candidates: NextTrophy[] = [
      { label: 'Première partie', current: stats.played, target: 1 },
      { label: '5 parties', current: stats.played, target: 5 },
      { label: '20 parties', current: stats.played, target: 20 },
      { label: 'Premier tournoi', current: stats.tournamentsPlayed, target: 1 },
      { label: '5 amis', current: friends.length, target: 5 },
    ];
    const pending = candidates.filter((t) => t.current < t.target);
    if (pending.length === 0) return null;
    return pending.sort((a, b) => a.target - a.current - (b.target - b.current))[0];
  })();

  const bd = account.birthDate ? parseBirthDate(account.birthDate) : null;
  const zod = bd ? zodiacFor(bd) : null;
  // « Non défini » ne s'affiche pas — on ne montre le sexe que s'il est renseigné.
  const g = account.gender && account.gender !== 'nd' ? genderLabel(account.gender) : null;

  // Jauge de niveau : progression dans la tranche entière en cours (bornes basse/haute).
  const lvlLow = Math.floor(level);
  const lvlHigh = Math.min(7, lvlLow + 1);
  const lvlPct = `${Math.round(Math.max(0, Math.min(1, level - lvlLow)) * 100)}%` as `${number}%`;

  return (
    <Screen back>
      {editing ? (
        <EditAccount onDone={() => setEditing(false)} />
      ) : (
        <>
          {/* Bandeau signature — avatar (anneau dégradé) + identité (maquette Profil) */}
          <LinearGradient colors={gradients.deepGreen} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.band}>
            <View style={styles.head}>
              <Pressable
                onPress={() => setPhotoSheet(true)}
                onLongPress={() => setProRevealed(true)}
                delayLongPress={1200}
                hitSlop={6}
                accessibilityLabel="Photo de profil"
              >
                <Avatar uri={account.photoUri} name={`${account.firstName} ${account.lastName}`} size={76} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Txt variant="h2" color={colors.white}>
                  {account.firstName} {account.lastName}
                </Txt>
                {bd && zod ? (
                  <Txt variant="small" color={colors.onPhoto} style={{ marginTop: 2, fontWeight: '600' }}>
                    {zod.emoji} {zod.name} · {ageFrom(bd)} ans{g ? ` · ${g}` : ''}
                  </Txt>
                ) : (
                  <Txt variant="small" color={colors.onPhoto} style={{ marginTop: 2 }}>
                    {g ? `${g} · ` : ''}
                    {account.phone}
                  </Txt>
                )}
              </View>
              <Pressable onPress={() => setEditing(true)} hitSlop={8} style={styles.editBtn} accessibilityLabel="Modifier le profil">
                <Ionicons name="create-outline" size={18} color={colors.white} />
              </Pressable>
            </View>
          </LinearGradient>
        </>
      )}

      {/* Mon niveau — n'évolue que par les tournois officiels */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Mon niveau" />
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
            <Txt variant="label" color={colors.textFaint}>
              Niveau de jeu
            </Txt>
            <Txt variant="display" color={colors.signature} style={{ fontSize: 28 }}>
              {level.toFixed(2)}
            </Txt>
          </View>
          <View style={styles.gaugeTrack}>
            <View style={[styles.gaugeFill, { width: lvlPct }]} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            <Txt variant="small" color={colors.textFaint}>
              {lvlLow.toFixed(1)}
            </Txt>
            <Txt variant="small" color={colors.textFaint}>
              {lvlHigh.toFixed(1)}
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm }}>
            <Ionicons name="swap-vertical" size={14} color={colors.textMuted} />
            <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
              {levelLabel(level)} · monte ou descend selon tes résultats en tournoi officiel (+0.50 / −0.25).
            </Txt>
          </View>
          {/* B-R6 : prochain trophée le plus proche (hors Vainqueur / Niveau 4+) */}
          {nextTrophy ? (
            <>
              <Divider style={{ marginVertical: spacing.md }} />
              <View style={{ gap: spacing.xs }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Txt variant="small" color={colors.textMuted}>
                    Prochain trophée : « {nextTrophy.label} »
                  </Txt>
                  <Txt variant="small" color={colors.amber} style={{ fontWeight: '700' }}>
                    {nextTrophy.current}/{nextTrophy.target}
                  </Txt>
                </View>
                <View style={styles.nextTrophyTrack}>
                  <View
                    style={[
                      styles.nextTrophyFill,
                      { width: `${Math.round((nextTrophy.current / nextTrophy.target) * 100)}%` as `${number}%` },
                    ]}
                  />
                </View>
              </View>
            </>
          ) : null}
          {officialResults.length > 0 ? (
            <>
              <Divider style={{ marginVertical: spacing.md }} />
              <View style={{ gap: 6 }}>
                {officialResults.slice(0, 3).map((o) => (
                  <View key={o.id} style={styles.row}>
                    <Tag
                      label={o.result === 'win' ? 'Vainqueur' : o.result === 'last' ? 'Fin de tableau' : 'Participant'}
                      tone={o.result === 'win' ? 'amber' : o.result === 'last' ? 'coral' : 'blue'}
                    />
                    <Txt variant="muted" style={{ flex: 1 }}>
                      {o.title} → Niveau {o.levelAfter.toFixed(2)}
                    </Txt>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
              Inscris-toi à un tournoi officiel : une victoire fait gagner +0.50.
            </Txt>
          )}
        </Card>
      </View>

      {/* 3 stats, pas plus — comptées automatiquement */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Mes statistiques" />
        <View style={styles.stats}>
          <StatTile value={stats.played} label="Parties jouées" color={colors.green} bg={colors.greenSoft} />
          <StatTile value={stats.tournamentsPlayed} label="Tournois joués" color={colors.purple} bg={colors.purpleSoft} />
          <StatTile value={stats.tournamentsWon} label="Tournois gagnés" color={colors.amber} bg={colors.amberSoft} />
        </View>
        <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
          Les parties jouées se comptent toutes seules : une réservation passée = une partie.
        </Txt>
      </View>

      {/* Trophées */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Trophées" />
        <Card>
          <View style={styles.badges}>
            {badges.map((b) => (
              <View key={b.label} style={{ alignItems: 'flex-start' }}>
                <Tag label={b.label} tone={b.ok ? 'amber' : 'neutral'} icon={b.ok ? 'trophy' : 'lock-closed'} />
                {!b.ok ? (
                  <Txt variant="small" color={colors.textFaint} style={{ fontSize: 10, marginTop: 2 }}>
                    {b.need}
                  </Txt>
                ) : null}
              </View>
            ))}
          </View>
        </Card>
      </View>

      {/* Raccourcis */}
      <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
        <Card onPress={() => router.push('/reservations')} style={styles.cta}>
          <IconCircle icon="calendar" color={colors.green} bg={colors.greenSoft} />
          <View style={{ flex: 1 }}>
            <Txt variant="h3">Mes réservations</Txt>
            <Txt variant="muted">À venir, statut du club, passées.</Txt>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Card>
        <Card onPress={() => router.push('/amis')} style={styles.cta}>
          <IconCircle icon="people" color={colors.blue} bg={colors.blueSoft} />
          <View style={{ flex: 1 }}>
            <Txt variant="h3">Mes amis · {friends.length}</Txt>
            <Txt variant="muted">Tes partenaires de jeu.</Txt>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Card>
      </View>

      {/* Rappels */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Rappels" />
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconCircle icon="notifications" color={colors.coral} bg={colors.coralSoft} />
          <View style={{ flex: 1 }}>
            <Txt variant="body" style={{ fontWeight: '600' }}>
              Rappels de match
            </Txt>
            <Txt variant="small" color={colors.textMuted}>
              Carte de rappel avant chaque partie. (Les notifications téléphone arrivent avec l'app installée.)
            </Txt>
          </View>
          <Switch
            value={state.remindersOn}
            onValueChange={setRemindersOn}
            trackColor={{ true: colors.signature, false: colors.border }}
            thumbColor={colors.white}
          />
        </Card>
      </View>

      {/* Espaces pro — non affichés dans la navigation normale (cf. handoff sécurité).
          Révélés par appui long sur l'avatar ; l'Espace Club reste visible pour un gérant
          déjà déverrouillé. Les vrais accès restent protégés (code club, gating serveur §B). */}
      {showClub || showOperator ? (
        <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
          {showClub ? (
            <Card onPress={() => router.push('/club-admin')} style={styles.cta}>
              <IconCircle icon="business" />
              <View style={{ flex: 1 }}>
                <Txt variant="h3">Tu gères un club ?</Txt>
                <Txt variant="muted">Espace Club : réservations, page, créneaux, tournois.</Txt>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Card>
          ) : null}
          {showOperator ? (
            <Card onPress={() => router.push('/operateur')} style={styles.cta}>
              <IconCircle icon="stats-chart" color={colors.green} bg={colors.greenSoft} />
              <View style={{ flex: 1 }}>
                <Txt variant="h3">Espace opérateur (PadelConnect)</Txt>
                <Txt variant="muted">Décomptes, commissions, nouveaux clubs.</Txt>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Card>
          ) : null}
        </View>
      ) : null}

      {/* La suite — fonctions qui arrivent avec la version connectée (serveur) */}
      <View style={{ marginTop: spacing.xl }}>
        <Card onPress={() => router.push('/a-venir')} style={styles.cta}>
          <IconCircle icon="rocket-outline" color={colors.signature} bg={colors.signatureSoft} />
          <View style={{ flex: 1 }}>
            <Txt variant="h3">La suite</Txt>
            <Txt variant="muted">Ce qui arrive avec la version connectée.</Txt>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Card>
      </View>

      <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
        <Button label="Mentions légales & CGU" icon="document-text-outline" variant="ghost" onPress={() => router.push('/legal')} />
        <Button label="Se déconnecter" icon="log-out-outline" variant="secondary" onPress={signOut} />
        <Button
          label={confirmReset ? 'Réinitialiser et relancer la démo' : 'Réinitialiser la démo'}
          icon="refresh"
          variant={confirmReset ? 'danger' : 'ghost'}
          onPress={() => {
            if (confirmReset) {
              // Tout effacer (y compris la clé persistée) PUIS relancer une démo propre
              // et revenir à l'accueil — sans repasser par l'écran d'inscription.
              resetAll();
              loadDemo();
              router.replace('/');
            } else {
              setConfirmReset(true);
              setTimeout(() => setConfirmReset(false), 4000);
            }
          }}
        />
      </View>

      {/* Photo de profil : changer (recadrée + compressée) ou revenir aux initiales */}
      <BottomSheet visible={photoSheet} title="Photo de profil" onClose={() => setPhotoSheet(false)}>
        <View style={{ gap: spacing.sm }}>
          <Button label="Changer la photo" icon="image-outline" onPress={changePhoto} full />
          {account.photoUri ? (
            <Button
              label="Retirer la photo"
              icon="trash-outline"
              variant="danger"
              onPress={() => {
                updateAccount({ photoUri: undefined });
                setPhotoSheet(false);
              }}
              full
            />
          ) : null}
          <Button label="Annuler" variant="ghost" onPress={() => setPhotoSheet(false)} full />
        </View>
      </BottomSheet>
    </Screen>
  );
}

function EditAccount({ onDone }: { onDone: () => void }) {
  const { state, updateAccount } = useApp();
  const a = state.account!;
  const [firstName, setFirstName] = useState(a.firstName);
  const [lastName, setLastName] = useState(a.lastName);
  const [phone, setPhone] = useState(a.phone);
  const [birth, setBirth] = useState(a.birthDate ?? '');
  const [gender, setGender] = useState<Gender | undefined>(a.gender);
  const [photoUri, setPhotoUri] = useState<string | undefined>(a.photoUri);

  const choose = async () => {
    const uri = await pickImage({ square: true });
    if (uri) setPhotoUri(uri);
  };
  const save = () => {
    updateAccount({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      photoUri,
      birthDate: parseBirthDate(birth) ? birth.trim() : a.birthDate,
      gender,
    });
    onDone();
  };

  return (
    <Card style={{ marginTop: spacing.sm }}>
      <View style={{ alignItems: 'center' }}>
        <Pressable onPress={choose} style={styles.avatar}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.avatarImg} contentFit="cover" />
          ) : (
            <Ionicons name="camera-outline" size={26} color={colors.textMuted} />
          )}
        </Pressable>
      </View>
      <TextInput
        value={firstName}
        onChangeText={setFirstName}
        placeholder="Prénom"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
      />
      <TextInput
        value={lastName}
        onChangeText={setLastName}
        placeholder="Nom"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
      />
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="Téléphone"
        placeholderTextColor={colors.textFaint}
        keyboardType="phone-pad"
        style={styles.input}
      />
      <TextInput
        value={birth}
        onChangeText={(t) => setBirth(maskBirthDate(t, birth))}
        placeholder="Date de naissance (JJ/MM/AAAA)"
        placeholderTextColor={colors.textFaint}
        keyboardType="phone-pad"
        maxLength={10}
        style={styles.input}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
        {GENDERS.map((gd) => (
          <Chip key={gd.id} label={gd.label} active={gender === gd.id} onPress={() => setGender(gd.id)} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Button label="Enregistrer" icon="checkmark" onPress={save} full />
        </View>
        <Button label="Annuler" variant="ghost" onPress={onDone} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  band: { borderRadius: radius.xl, padding: spacing.lg, marginTop: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  editBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.onPhotoSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeTrack: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  gaugeFill: { height: 8, borderRadius: radius.pill, backgroundColor: colors.signature },
  nextTrophyTrack: { height: 5, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  nextTrophyFill: { height: 5, borderRadius: radius.pill, backgroundColor: colors.amber },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.signatureSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  stats: { flexDirection: 'row', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  cta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
