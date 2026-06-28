import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { Button, Card, IconCircle, Txt } from '@/components/ui';
import { type Club } from '@/data/clubs';
import { openWhatsApp } from '@/lib/contact';
import { hasOperatorContact, OPERATOR_WHATSAPP } from '@/lib/operator';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

const CLUB_TYPES: Club['type'][] = ['Couvert', 'Extérieur', 'Mixte'];

// Écran ouvert à TOUT joueur (depuis le profil) : « Tu gères un club ? Inscris-le ».
// La demande part sur le SERVEUR (table club_requests) → elle apparaît dans l'espace
// opérateur, qui peut alors rappeler le gérant. Réponse à la 3ᵉ demande de sécurité :
// un canal clair pour qu'un club rejoigne PadelConnect, sans donner d'accès « club ».
export default function InscrireClub() {
  const router = useRouter();
  const { state, submitClubRequest } = useApp();
  const toast = useToast();

  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [type, setType] = useState<Club['type']>('Extérieur');
  const [courts, setCourts] = useState(2);
  const [price, setPrice] = useState('');
  const [phone, setPhone] = useState(state.account?.phone ?? '');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const ready = name.trim().length >= 2 && area.trim().length >= 2;

  const submit = async () => {
    if (!ready || sending) return;
    setSending(true);
    const res = await submitClubRequest({
      name,
      area,
      type,
      courts,
      priceFrom: Number(price) > 0 ? Number(price) : undefined,
      contactPhone: phone,
      message,
    });
    setSending(false);
    if (res.ok) {
      setSent(true);
      toast.show('Demande envoyée à PadelConnect ✅');
    } else {
      toast.show(res.error ?? 'Envoi impossible', { icon: 'alert-circle' });
    }
  };

  // Message pré-rempli pour le contact direct WhatsApp (canal n°1 en Côte d'Ivoire).
  const waMessage =
    `Bonjour PadelConnect 👋\n` +
    `Je gère un club de padel et j'aimerais le référencer.\n` +
    (name ? `Club : ${name}\n` : '') +
    (area ? `Quartier : ${area}\n` : '');

  if (sent) {
    return (
      <Screen back title="Inscrire mon club">
        <Card style={{ marginTop: spacing.md, alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm }}>
          <IconCircle icon="checkmark-circle" color={colors.green} bg={colors.greenSoft} size={56} />
          <Txt variant="h2" style={{ textAlign: 'center' }}>
            Demande reçue !
          </Txt>
          <Txt variant="muted" style={{ textAlign: 'center' }}>
            PadelConnect a bien reçu ta demande pour <Txt style={{ fontWeight: '700' }}>{name.trim()}</Txt>. Nous te recontactons rapidement
            pour activer ta page club.
          </Txt>
          {hasOperatorContact ? (
            <Button
              label="Nous écrire sur WhatsApp"
              icon="logo-whatsapp"
              variant="secondary"
              onPress={() => openWhatsApp(OPERATOR_WHATSAPP, waMessage)}
              full
            />
          ) : null}
          <Button label="Revenir à mon profil" icon="arrow-back" variant="ghost" onPress={() => router.back()} full />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen back title="Inscrire mon club" subtitle="Référence ton club sur PadelConnect">
      <Card style={{ marginTop: spacing.md, flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
        <IconCircle icon="business" color={colors.signature} bg={colors.signatureSoft} />
        <Txt variant="muted" style={{ flex: 1 }}>
          Tu gères un club de padel à Abidjan ? Envoie-nous les infos : on te recontacte pour créer ta page et ton accès gérant.
        </Txt>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Txt variant="label" color={colors.textFaint}>
          INFOS DU CLUB
        </Txt>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Nom du club"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
        />
        <TextInput
          value={area}
          onChangeText={setArea}
          placeholder="Quartier / commune (ex. Cocody)"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
        />
        <View style={styles.wrap}>
          {CLUB_TYPES.map((t) => (
            <Chip key={t} label={t} active={type === t} onPress={() => setType(t)} />
          ))}
        </View>
        <View style={styles.wrap}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Chip key={n} label={`${n} terrain${n > 1 ? 's' : ''}`} active={courts === n} onPress={() => setCourts(n)} />
          ))}
        </View>
        <TextInput
          value={price}
          onChangeText={setPrice}
          placeholder="Tarif indicatif d'une session 1h30 (FCFA — optionnel)"
          placeholderTextColor={colors.textFaint}
          keyboardType="numeric"
          style={styles.input}
        />
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Txt variant="label" color={colors.textFaint}>
          POUR TE RECONTACTER
        </Txt>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="Ton numéro (WhatsApp de préférence)"
          placeholderTextColor={colors.textFaint}
          keyboardType="phone-pad"
          style={styles.input}
        />
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Un mot pour nous (optionnel)"
          placeholderTextColor={colors.textFaint}
          multiline
          style={[styles.input, { height: 88, textAlignVertical: 'top' }]}
        />
      </Card>

      <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
        <Button label={sending ? 'Envoi…' : 'Envoyer ma demande'} icon="paper-plane" onPress={submit} disabled={!ready || sending} full />
        {hasOperatorContact ? (
          <>
            <View style={styles.or}>
              <View style={styles.orLine} />
              <Txt variant="small" color={colors.textFaint}>
                ou
              </Txt>
              <View style={styles.orLine} />
            </View>
            <Button
              label="Nous contacter directement sur WhatsApp"
              icon="logo-whatsapp"
              variant="secondary"
              onPress={() => openWhatsApp(OPERATOR_WHATSAPP, waMessage)}
              full
            />
          </>
        ) : null}
        <View style={styles.privacy}>
          <Ionicons name="lock-closed-outline" size={13} color={colors.textFaint} />
          <Txt variant="small" color={colors.textFaint} style={{ flex: 1 }}>
            Tes infos servent uniquement à te recontacter. Inscrire un club ne donne pas accès à l'espace gérant tant que PadelConnect ne
            l'a pas activé.
          </Txt>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    marginTop: spacing.sm,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  or: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.xs },
  orLine: { flex: 1, height: 1, backgroundColor: colors.border },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.sm },
});
