import { Screen } from '@/components/Screen';
import { Card, Txt } from '@/components/ui';
import { SUPPORT_EMAIL } from '@/lib/operator';
import { colors, spacing } from '@/theme';

// Mentions légales & CGU — rédigées pour refléter le fonctionnement RÉEL de l’app
// (inscription par e-mail confirmé, paiement au club, frais de tournoi, fidélité, modération du
// contenu, données visibles par la communauté, prestataires et durées de conservation, suppression de
// compte dans l’app). Miroir de site/cgu.html et site/privacy.html : toute règle changée ici se
// change aussi là-bas (le site fait foi publiquement, ce texte ne part qu’avec le build suivant).
export default function Legal() {
  return (
    <Screen back title="Mentions légales & CGU">
      <Card style={{ marginTop: spacing.sm }}>
        <Txt variant="h3">Le service</Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          PadelConnect met en relation des joueurs et des clubs de padel à Abidjan : réservation de créneaux, matchs ouverts, recherche de
          partenaires, cours avec des coachs, classement et compétitions. Aucun paiement n’est effectué dans l’application — le règlement de
          la session se fait directement au club (et celui d’un cours, directement au coach). Pour un match partagé, le partage de la note
          passe par un lien Wave (application tierce) : PadelConnect n’encaisse ni ne traite aucun paiement. Les tarifs et disponibilités
          affichés sont indicatifs et relèvent de la responsabilité de chaque club.
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
          Un club peut exceptionnellement annuler ton créneau s’il a déjà été pris hors application (téléphone, sur place) : tu es prévenu
          avec le motif et, si possible, une proposition de report — sans aucun impact sur ta fiabilité.
        </Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Après un match, chaque joueur peut saisir le score de son point de vue : le match est validé quand un joueur du camp perdant le
          reconnaît ou, pour une saisie gagnante restée seule sans réponse, au bout de 48 h ; des saisies contradictoires bloquent la
          validation. Un match validé alimente le classement par points. Le niveau est initialisé par le quiz d’inscription puis ajusté
          automatiquement côté serveur, par les matchs dont le score est reconnu par le camp perdant (pour les joueurs qui l’ont saisi) et
          par les tournois officiels : un match validé au bout de 48 h compte pour les points, pas pour le niveau. Un cours avec un coach
          n’est pas une partie : il ne rapporte pas de points et ne compte pas pour la fidélité (un cours individuel reste compté dans ta
          présence ; un cours collectif où tu es élève n’y compte pas). Le parrainage sert à inviter des amis : chaque inscription avec ton
          code apparaît dans ton compteur « Amis rejoints », sans contrepartie monétaire.
        </Txt>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Txt variant="h3">Fidélité</Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Chaque réservation que tu as créée et qui a été jouée compte pour ta carte de fidélité (Profil → Fidélité) ; les invitations, les
          cours avec un coach, les réservations annulées et les absences ne comptent pas. Toutes les 10 réservations, tu obtiens −50 % sur
          ton prochain match, plafonné à 5 000 FCFA à ce jour (le plafond en vigueur est affiché sur ta carte), offert par PadelConnect : tu
          réclames ta remise dans l’app, tu montres ton code au club, qui l’applique sur le prix du match ; PadelConnect rembourse ensuite
          cette remise au club. Une remise ne s’échange pas contre de l’argent.
        </Txt>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Txt variant="h3">Tournois & frais d’organisation</Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Un joueur peut proposer un tournoi ; il n’est publié qu’après validation du club hôte, qui peut refuser en indiquant un motif. Des{' '}
          <Txt style={{ fontWeight: '700' }}>frais d’organisation PadelConnect</Txt> (montant affiché AVANT la création) peuvent s’appliquer
          aux tournois créés par les joueurs : ils ne sont dus que si le club valide le tournoi — rien n’est dû si le tournoi est refusé, ni
          s’il est ensuite annulé par le club hôte. Les éventuels frais d’inscription des participants sont fixés et encaissés par
          l’organisateur, sous sa responsabilité.
        </Txt>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Txt variant="h3">Contenu publié & modération</Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Les avis, scores et matchs ouverts que tu publies sont visibles par les autres utilisateurs.{' '}
          <Txt style={{ fontWeight: '700' }}>Tolérance zéro</Txt> pour les contenus injurieux, discriminatoires, diffamatoires ou hors sujet
          : ils peuvent être retirés sans préavis ; en cas de récidive, le compte peut être supprimé par PadelConnect. Chaque avis d’un
          autre joueur porte un bouton <Txt style={{ fontWeight: '700' }}>« Signaler »</Txt> (traité sous 24 h) et un bouton{' '}
          <Txt style={{ fontWeight: '700' }}>« Bloquer »</Txt> — bloquer un joueur masque ses contenus, le retire de tes amis et de tes
          joueurs favoris (dans les deux sens) et l’empêche de t’envoyer des demandes d’ami ou de rejoindre tes matchs ouverts.
        </Txt>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Txt variant="h3">Tes données</Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Pour faire fonctionner ton compte, tes informations (profil, niveau, réservations, parrainage) sont enregistrées sur un serveur
          sécurisé (hébergé par Supabase) et synchronisées entre tes appareils. Ton <Txt style={{ fontWeight: '700' }}>e-mail</Txt> n’est
          jamais montré ; ton <Txt style={{ fontWeight: '700' }}>téléphone</Txt> n’est pas affiché publiquement. Exception : si tu organises
          un tournoi, il est communiqué au club hôte et aux équipes inscrites pour le règlement des frais. En revanche, certaines
          informations sont <Txt style={{ fontWeight: '700' }}>visibles par la communauté</Txt> : ton nom sur les avis que tu publies, ton
          prénom (et l’initiale de ton nom) au classement avec tes points, ton prénom et l’initiale de ton nom dans la liste publique des
          matchs ouverts (ton nom complet est visible des joueurs du même match), ton niveau, ton club favori, ta fiche coach si un club t’a
          promu et, à partir de 5 matchs ou cours individuels joués, ton taux de présence (badge « Fiable · N % », jamais le détail de tes
          absences). Un club ne voit que les réservations le concernant (et les remises fidélité qu’il t’a servies), et l’opérateur de
          PadelConnect le strict nécessaire au suivi du service.
        </Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Avec ton accord uniquement : ta <Txt style={{ fontWeight: '700' }}>photo</Txt> de profil ou de club est stockée pour l’affichage ;
          l’accès à tes <Txt style={{ fontWeight: '700' }}>contacts</Txt> sert seulement à retrouver un ami par son numéro au moment où tu
          le choisis (on ne copie jamais ton carnet d’adresses) ; les <Txt style={{ fontWeight: '700' }}>notifications</Txt> t’informent de
          tes réservations, invitations, scores, cours et tournois, des annonces des clubs que tu suis, des matchs ouverts à ton niveau et
          des actus et de l’agenda PadelConnect (activés par défaut, désactivables dans Profil → Notifications). L’app envoie aussi des{' '}
          <Txt style={{ fontWeight: '700' }}>diagnostics techniques anonymes</Txt> (rapports d’erreur et statistiques d’usage, sans
          identifiant personnel) pour corriger les bugs. PadelConnect ne vend pas tes données et ne les utilise pas pour te pister entre
          applications.
        </Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Nos <Txt style={{ fontWeight: '700' }}>prestataires</Txt> traitent tes données pour notre compte, hors de Côte d’Ivoire : Supabase
          (hébergement des données et des photos), Expo puis Apple et Google (acheminement des notifications, dont le texte contient par
          exemple le nom du club et la date), Brevo (e-mails de compte), Cloudflare (site, version web et réception des e-mails de contact)
          et Google (boîte de contact).
        </Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          <Txt style={{ fontWeight: '700' }}>Durées de conservation</Txt> : ton compte et ton activité, tant que ton compte existe ; tes
          messages au support, jusqu’à 7 jours après leur résolution ; les diagnostics anonymes, 30 jours ; les compteurs techniques
          anti-abus, 2 jours ; les journaux d’envoi des e-mails, selon la politique de Brevo.
        </Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Tu peux supprimer ton compte et tes données (photo comprise) à tout moment depuis Profil → « Supprimer mon compte » (action
          définitive — tes réservations à venir sont annulées et les clubs prévenus), ou en nous écrivant à l’adresse ci-dessous. Subsistent
          seulement : les tournois publiés ou clôturés que tu as organisés (organisateur affiché « Compte supprimé », sans téléphone) et les
          noms d’équipes du palmarès, les matchs passés joués avec tes partenaires, qui restent dans leur historique (ta place y apparaît «
          Ancien joueur », sans ton nom), les remises fidélité déjà servies par un club (montant, prix du match et date, sans ton nom), qui
          servent à son décompte, tes messages au support (sans ton nom ni ton numéro), tes demandes de club déjà traitées (sans ton numéro)
          et, si tu gérais un club, la fiche du club, ses photos et ses annonces, qui restent en ligne (écris-nous pour la retirer).
        </Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Tu peux aussi nous écrire pour exercer tes droits d’accès, de rectification, d’opposition ou de suppression. Tes données sont
          traitées dans le cadre de la loi ivoirienne n° 2013-450 du 19 juin 2013 relative à la protection des données à caractère personnel
          ; tu peux saisir l’ARTCI (artci.ci).
        </Txt>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Txt variant="h3">Licences</Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          PadelConnect est construit avec des logiciels libres, notamment React, React Native, Expo, Supabase et les icônes Ionicons
          (licence MIT).
        </Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Polices Bricolage Grotesque (© 2022 The Bricolage Grotesque Project Authors) et Schibsted Grotesk (© 2023 The Schibsted-Grotesk
          Project Authors), sous licence SIL Open Font License 1.1 (openfontlicense.org).
        </Txt>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Txt variant="h3">Contact</Txt>
        {/* À COMPLÉTER (porteur, décision n° 22 du docs/AUDIT-REGLES-METIER-2026-10.md §7) : identité
            juridique de l’éditeur (nom ou raison sociale, forme, n° RCCM, adresse) et n° de récépissé
            ARTCI — à ajouter ici le jour où le porteur les fournit, comme dans site/privacy.html et
            site/cgu.html. Ne rien inventer. */}
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          Responsable du traitement : PadelConnect · Abidjan, Côte d’Ivoire. Hébergement : Cloudflare (site et version web) et Supabase
          (données de l’application).
        </Txt>
        <Txt variant="muted">{SUPPORT_EMAIL}</Txt>
      </Card>

      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.lg, textAlign: 'center' }}>
        Dernière mise à jour : octobre 2026. Pour toute question sur tes données, écris-nous à l’adresse ci-dessus.
      </Txt>
    </Screen>
  );
}
