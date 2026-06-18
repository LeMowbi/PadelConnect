import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { Reveal } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { Card, IconCircle, SectionHeader, Tag, Txt } from '@/components/ui';
import { colors, spacing } from '@/theme';

type Item = { icon: keyof typeof Ionicons.glyphMap; title: string; text: string; tint: string; bg: string };
type Group = { title: string; items: Item[] };

// Fonctionnalités qui n'ont de sens qu'avec le serveur (handoff §B) — présentées
// honnêtement comme « à venir avec la version connectée », sans faux boutons ailleurs.
const GROUPS: Group[] = [
  {
    title: 'Confiance & qualité',
    items: [
      { icon: 'shield-checkmark-outline', title: 'Avis vérifiés', text: 'Noter un club seulement après une partie réellement jouée.', tint: colors.green, bg: colors.greenSoft },
      { icon: 'ribbon-outline', title: 'Score de fiabilité', text: 'Présences/annulations, visible par le club uniquement — jamais public.', tint: colors.blue, bg: colors.blueSoft },
      { icon: 'flag-outline', title: 'Signalement & litiges', text: 'Remontée discrète à l’opérateur en cas de souci.', tint: colors.coral, bg: colors.coralSoft },
    ],
  },
  {
    title: 'Rester connecté',
    items: [
      { icon: 'notifications-outline', title: 'Notifications', text: 'Réservation confirmée, place libérée, rappel de match, résultat de tournoi.', tint: colors.purple, bg: colors.purpleSoft },
      { icon: 'time-outline', title: 'Rappel + itinéraire', text: 'Rappel la veille et 2 h avant, avec l’itinéraire vers le club.', tint: colors.blue, bg: colors.blueSoft },
      { icon: 'logo-whatsapp', title: 'Parrainage', text: 'Invite tes amis par WhatsApp et suis combien t’ont rejoint.', tint: colors.green, bg: colors.greenSoft },
      { icon: 'hand-left-outline', title: 'Anti no-show (doux)', text: 'Après 2 absences, une simple confirmation de présence — sans blâme.', tint: colors.coral, bg: colors.coralSoft },
    ],
  },
  {
    title: 'Pour les clubs',
    items: [
      { icon: 'pricetags-outline', title: 'Heures creuses dynamiques', text: 'Remise automatique sur un créneau vide à l’approche de l’heure.', tint: colors.amber, bg: colors.amberSoft },
      { icon: 'bar-chart-outline', title: 'Statistiques avancées', text: 'Taux de remplissage par plage, créneau le plus demandé, KPI de la semaine.', tint: colors.purple, bg: colors.purpleSoft },
      { icon: 'document-text-outline', title: 'Décompte exportable', text: 'Décompte hebdomadaire en PDF / partage WhatsApp pour le règlement.', tint: colors.blue, bg: colors.blueSoft },
    ],
  },
  {
    title: 'Compte & sécurité',
    items: [
      { icon: 'phone-portrait-outline', title: 'Connexion par SMS', text: 'Inscription au numéro (+225), code reçu par SMS — sans e-mail.', tint: colors.green, bg: colors.greenSoft },
      { icon: 'lock-closed-outline', title: 'Comptes pro sécurisés', text: 'Un compte par club et l’espace opérateur, droits vérifiés côté serveur.', tint: colors.signature, bg: colors.signatureSoft },
      { icon: 'cloud-offline-outline', title: 'Mode hors-ligne', text: 'Consulter les clubs et créneaux même sans réseau, synchro au retour.', tint: colors.coral, bg: colors.coralSoft },
    ],
  },
];

export default function AVenirScreen() {
  return (
    <Screen back title="La suite" subtitle="Ce qui arrive avec la version connectée">
      <Reveal>
        <Card style={{ marginTop: spacing.sm, flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
          <IconCircle icon="rocket-outline" color={colors.signature} bg={colors.signatureSoft} />
          <Txt variant="muted" style={{ flex: 1 }}>
            Le prototype actuel montre déjà tout le parcours (réserver, tournois, Espace Club,
            opérateur). Ces fonctions-ci demandent un serveur : elles arriveront avec la version
            connectée (comptes + temps réel).
          </Txt>
        </Card>

        {GROUPS.map((g) => (
          <View_section key={g.title} group={g} />
        ))}

        <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.lg, textAlign: 'center' }}>
          Aucune de ces fonctions n’est facturée au joueur — PadelConnect reste gratuit pour réserver.
        </Txt>
      </Reveal>
    </Screen>
  );
}

function View_section({ group }: { group: Group }) {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <SectionHeader title={group.title} />
      <Card style={{ gap: spacing.lg }}>
        {group.items.map((it) => (
          <View key={it.title} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
            <IconCircle icon={it.icon} color={it.tint} bg={it.bg} size={40} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                <Txt variant="h3" style={{ fontSize: 15 }}>{it.title}</Txt>
                <Tag label="Bientôt" tone="neutral" icon="hourglass-outline" />
              </View>
              <Txt variant="muted" style={{ marginTop: 2 }}>{it.text}</Txt>
            </View>
          </View>
        ))}
      </Card>
    </View>
  );
}

