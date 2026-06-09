import { Screen } from '@/components/Screen';
import { Card, Txt } from '@/components/ui';
import { colors, spacing } from '@/theme';

export default function Legal() {
  return (
    <Screen back title="Mentions légales & CGU">
      <Card style={{ marginTop: spacing.sm }}>
        <Txt variant="h3">Conditions d'utilisation</Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          PadelConnect met en relation des joueurs et des clubs de padel à Abidjan (réservation de
          créneaux, recherche de partenaires, coachs et compétitions). L'application est fournie
          « en l'état » pendant sa phase de prototype.
        </Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Les résultats de matchs sont déclarés par les joueurs eux-mêmes : PadelConnect n'en garantit
          pas l'exactitude. Les tarifs et disponibilités affichés sont indicatifs et relèvent de la
          responsabilité de chaque club.
        </Txt>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Txt variant="h3">Confidentialité</Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Dans cette version prototype, tes informations (profil, niveau, réservations) sont
          enregistrées uniquement sur ton appareil. Aucune donnée n'est envoyée à un serveur et
          aucun paiement réel n'est effectué.
        </Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Le numéro de téléphone sert à identifier ton profil ; il n'est pas vérifié à ce stade
          (la vérification par SMS et l'hébergement sécurisé des données arriveront avec la version
          finale, dans le respect de la réglementation ivoirienne sur les données personnelles).
        </Txt>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Txt variant="h3">Contact</Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          PadelConnect · Abidjan
        </Txt>
        <Txt variant="muted">moustaphabitar01@gmail.com</Txt>
      </Card>

      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.lg, textAlign: 'center' }}>
        Document simplifié de démonstration — à faire valider par un juriste avant la mise en ligne.
      </Txt>
    </Screen>
  );
}
