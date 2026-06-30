import { Screen } from '@/components/Screen';
import { Card, Txt } from '@/components/ui';
import { colors, spacing } from '@/theme';

// Mentions légales & CGU — rédigées pour refléter le fonctionnement RÉEL de l'app
// (inscription par e-mail confirmé, paiement au club, suppression de compte dans l'app).
export default function Legal() {
  return (
    <Screen back title="Mentions légales & CGU">
      <Card style={{ marginTop: spacing.sm }}>
        <Txt variant="h3">Le service</Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          PadelConnect met en relation des joueurs et des clubs de padel à Abidjan : réservation de créneaux, recherche de partenaires,
          coachs et compétitions. Aucun paiement n'est effectué dans l'application — le règlement de la session se fait directement au club.
          Les tarifs et disponibilités affichés sont indicatifs et relèvent de la responsabilité de chaque club.
        </Txt>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Txt variant="h3">Ton compte</Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          La création d'un compte se fait avec une adresse e-mail (confirmée par un lien) et un mot de passe. Ton numéro de téléphone est
          conservé pour permettre aux clubs de te joindre au sujet de tes réservations ; il n'y a pas de vérification par SMS à ce stade.
        </Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Tu es responsable de la confidentialité de ton mot de passe. En cas d'oubli, un lien de réinitialisation peut être envoyé à ton
          e-mail depuis l'écran de connexion.
        </Txt>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Txt variant="h3">Réservations, annulations & niveau</Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Une réservation peut être annulée gratuitement jusqu'à 5 heures avant le créneau ; passé ce délai, l'annulation n'est plus possible
          dans l'application. Une annulation libère le créneau et reste visible du club concerné.
        </Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Le niveau de jeu évolue uniquement via les tournois officiels : c'est l'organisateur qui désigne l'équipe gagnante à la fin (pas
          d'auto-déclaration). Le parrainage est un programme de reconnaissance (badges, classement) sans contrepartie monétaire.
        </Txt>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Txt variant="h3">Tes données</Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Pour faire fonctionner ton compte, tes informations (profil, niveau, réservations, parrainage) sont enregistrées sur un serveur
          sécurisé (hébergé par Supabase) et synchronisées entre tes appareils. Tes données ne sont visibles que par toi ; un club ne voit
          que les réservations le concernant, et l'opérateur de PadelConnect le strict nécessaire au suivi du service.
        </Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Tu peux supprimer ton compte et toutes tes données à tout moment depuis Profil → « Supprimer mon compte » (action définitive), ou
          en nous écrivant à l'adresse ci-dessous. Le traitement respecte la réglementation ivoirienne (ARTCI) sur les données personnelles.
        </Txt>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Txt variant="h3">Contact</Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          PadelConnect · Abidjan, Côte d'Ivoire
        </Txt>
        <Txt variant="muted">moustaphabitar01@gmail.com</Txt>
      </Card>

      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.lg, textAlign: 'center' }}>
        Dernière mise à jour : 2026. Pour toute question sur tes données, écris-nous à l'adresse ci-dessus.
      </Txt>
    </Screen>
  );
}
