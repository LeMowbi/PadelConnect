import { Screen } from '@/components/Screen';
import { Card, Txt } from '@/components/ui';
import { SUPPORT_EMAIL } from '@/lib/operator';
import { colors, spacing } from '@/theme';

// Mentions légales & CGU — rédigées pour refléter le fonctionnement RÉEL de l’app
// (inscription par e-mail confirmé, paiement au club, frais de tournoi, modération du contenu,
// données visibles par la communauté, suppression de compte dans l’app).
export default function Legal() {
  return (
    <Screen back title="Mentions légales & CGU">
      <Card style={{ marginTop: spacing.sm }}>
        <Txt variant="h3">Le service</Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          PadelConnect met en relation des joueurs et des clubs de padel à Abidjan : réservation de créneaux, matchs ouverts, recherche de
          partenaires, cours avec des coachs, classement et compétitions. Aucun paiement n’est effectué dans l’application — le règlement de
          la session se fait directement au club (et celui d’un cours, directement au coach). Les tarifs et disponibilités affichés sont
          indicatifs et relèvent de la responsabilité de chaque club.
        </Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          L’utilisation de PadelConnect est réservée aux personnes de <Txt style={{ fontWeight: '700' }}>13 ans ou plus</Txt> ; les mineurs
          doivent avoir l’accord d’un parent ou tuteur.
        </Txt>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Txt variant="h3">Ton compte</Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          La création d’un compte se fait avec une adresse e-mail (confirmée par un lien) et un mot de passe. Ton numéro de téléphone est
          conservé pour permettre aux clubs de te joindre au sujet de tes réservations ; il n’y a pas de vérification par SMS à ce stade.
        </Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Tu es responsable de la confidentialité de ton mot de passe. En cas d’oubli, un lien de réinitialisation peut être envoyé à ton
          e-mail depuis l’écran de connexion.
        </Txt>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Txt variant="h3">Réservations, annulations, scores & classement</Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Une réservation peut être annulée sans frais jusqu’à 5 heures avant le créneau ; passé ce délai, l’annulation n’est plus possible
          dans l’application (contacte le club). Une annulation libère le créneau et reste visible du club concerné, avec ton nom.
        </Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Après un match, chaque joueur peut saisir le score : le match est validé quand un adversaire confirme (ou, pour une saisie restée
          seule, après 48 h), et alimente le classement par points. Le niveau affiché est déclaratif et n’évolue que via les tournois
          officiels. Le parrainage permet d’inviter des amis, sans contrepartie monétaire.
        </Txt>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Txt variant="h3">Tournois & frais d’organisation</Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Un joueur peut proposer un tournoi ; il n’est publié qu’après validation du club hôte, qui peut refuser en indiquant un motif. Des{' '}
          <Txt style={{ fontWeight: '700' }}>frais d’organisation PadelConnect</Txt> (montant affiché AVANT la création) s’appliquent aux
          tournois créés par les joueurs : ils ne sont dus que si le club valide le tournoi et se règlent à PadelConnect par Wave — rien
          n’est dû si le tournoi est refusé. Les éventuels frais d’inscription des participants sont fixés et encaissés par l’organisateur,
          sous sa responsabilité. Les clubs versent à PadelConnect une commission sur les réservations effectuées via l’application, réglée
          hors app.
        </Txt>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Txt variant="h3">Contenu publié & modération</Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Les avis, scores et matchs ouverts que tu publies sont visibles par les autres utilisateurs.{' '}
          <Txt style={{ fontWeight: '700' }}>Tolérance zéro</Txt> pour les contenus injurieux, discriminatoires, diffamatoires ou hors sujet
          : ils peuvent être retirés sans préavis et le compte fautif suspendu. Chaque avis d’un autre joueur porte un bouton{' '}
          <Txt style={{ fontWeight: '700' }}>« Signaler »</Txt> (traité sous 24 h) et un bouton{' '}
          <Txt style={{ fontWeight: '700' }}>« Bloquer »</Txt> — bloquer un joueur masque ses contenus et l’empêche de t’envoyer des
          demandes d’ami ou de rejoindre tes matchs ouverts.
        </Txt>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Txt variant="h3">Tes données</Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Pour faire fonctionner ton compte, tes informations (profil, niveau, réservations, parrainage) sont enregistrées sur un serveur
          sécurisé (hébergé par Supabase) et synchronisées entre tes appareils. Tes <Txt style={{ fontWeight: '700' }}>coordonnées</Txt>{' '}
          (e-mail, téléphone) ne sont jamais montrées aux autres joueurs. En revanche, certaines informations sont{' '}
          <Txt style={{ fontWeight: '700' }}>visibles par la communauté</Txt> : ton nom sur les avis que tu publies, ton prénom (et
          l’initiale de ton nom) au classement avec tes points, ton prénom sur les matchs ouverts que tu crées ou rejoins, et ta fiche coach
          si un club t’a promu. Un club ne voit que les réservations le concernant, et l’opérateur de PadelConnect le strict nécessaire au
          suivi du service.
        </Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Avec ton accord uniquement : ta <Txt style={{ fontWeight: '700' }}>photo</Txt> de profil ou de club est stockée pour l’affichage ;
          l’accès à tes <Txt style={{ fontWeight: '700' }}>contacts</Txt> sert seulement à retrouver un ami par son numéro au moment où tu
          le choisis (on ne copie jamais ton carnet d’adresses) ; les <Txt style={{ fontWeight: '700' }}>notifications</Txt> t’informent de
          tes réservations, invitations et tournois. L’app envoie aussi des{' '}
          <Txt style={{ fontWeight: '700' }}>diagnostics techniques anonymes</Txt> (rapports d’erreur et statistiques d’usage, sans
          identifiant personnel) pour corriger les bugs. PadelConnect ne vend pas tes données et ne les utilise pas pour te pister entre
          applications.
        </Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Tu peux supprimer ton compte et toutes tes données (photo comprise) à tout moment depuis Profil → « Supprimer mon compte » (action
          définitive — tes réservations à venir sont annulées et les clubs prévenus), ou en nous écrivant à l’adresse ci-dessous. Le
          traitement respecte la réglementation ivoirienne (ARTCI) sur les données personnelles.
        </Txt>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Txt variant="h3">Contact</Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          PadelConnect · Abidjan, Côte d’Ivoire
        </Txt>
        <Txt variant="muted">{SUPPORT_EMAIL}</Txt>
      </Card>

      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.lg, textAlign: 'center' }}>
        Dernière mise à jour : juillet 2026. Pour toute question sur tes données, écris-nous à l’adresse ci-dessus.
      </Txt>
    </Screen>
  );
}
