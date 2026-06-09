# Construire la vraie version de PadelConnect (ensemble)

> Comment on passe de la **maquette** (données sur le téléphone) à une **vraie application reliée
> et sécurisée**. Modèle de travail : **Claude écrit le code, toi tu es le propriétaire-opérateur**
> (tu crées les comptes, tu détiens les clés, je te guide clic par clic).
> Tu n'as **pas besoin de savoir coder**. Tu as besoin de créer quelques comptes et de suivre mes étapes.

---

## 1. L'architecture cible, en clair

```
   App joueur (iPhone/Android)  ─┐
                                 ├─►  CERVEAU CENTRAL              ─►  Paiement (plus tard)
   Espace Club (gérants)        ─┘   (serveur + base de données)     CinetPay / PayDunya
                                          │                          (Wave, Orange, MTN, Moov, carte)
                                          └─►  Comptes (SMS), créneaux en temps réel, notifications
```

- **Application** : on garde la base actuelle (Expo / React Native — un seul code pour iPhone, Android
  et le web).
- **Cerveau central** : **Supabase** (recommandé) — base de données + comptes + temps réel, simple et
  gratuit pour démarrer. *(Firebase est une alternative équivalente.)*
- **Connexion** : par **numéro de téléphone + code SMS**.
- **Paiement (optionnel, plus tard)** : **CinetPay** ou **PayDunya** (un seul branchement pour tous les
  moyens de paiement ivoiriens).
- **Notifications** : via Expo (rappels de match, confirmations).

---

## 2. Les comptes que TOI tu dois créer (et pourquoi)

Ces comptes exigent **ton identité, ta carte bancaire et parfois ton entreprise** : je ne peux pas les
créer à ta place, mais je te guide pas à pas. **Les mots de passe et clés restent chez toi.**

| Compte | À quoi ça sert | Coût | Pourquoi c'est toi |
|---|---|---|---|
| **Supabase** | Le cerveau central (base + comptes + temps réel) | Gratuit pour démarrer, puis quelques $/mois | Lié à ton e-mail ; tu détiens les clés du projet |
| **Fournisseur SMS** (ex. via Supabase / Twilio) | Envoyer les codes de connexion | Quelques centimes par SMS | Facturé sur ta carte |
| **Google Play Console** | Publier sur Android | **25 $** une fois | Vérification d'identité Google |
| **Apple Developer** | Publier sur iPhone | **~99 $/an** | Vérification d'identité Apple |
| **Agrégateur de paiement** (CinetPay/PayDunya) — *si paiement* | Encaisser en ligne | Commission par transaction | Nécessite **ton entreprise** + vérification (KYC) + compte de versement |
| **Nom de domaine** (optionnel) | Adresse web pro | Quelques $/an | À ton nom |

> Conseil : commence par **Supabase + SMS** (gratuit / quasi-gratuit). Les comptes stores et le
> paiement viennent **plus tard**, quand l'app est prête à être publiée / à encaisser.

---

## 3. Le découpage en lots (on avance étape par étape)

Chaque lot est une session (ou quelques-unes). On ne passe au suivant que quand le précédent marche.

| Lot | Résultat concret | Toi | Claude |
|---|---|---|---|
| **1. Comptes & connexion SMS** | Se connecter avec son numéro + code reçu | Créer Supabase + activer SMS, me donner accès guidé | Brancher l'écran de connexion au vrai compte |
| **2. Base de données partagée** | Clubs, créneaux, réservations vus par **tout le monde** | Vérifier sur 2 téléphones | Créer la base + relier les écrans |
| **3. Dispo en temps réel** | Un terrain réservé devient **indisponible** pour les autres | Tester à deux | Régler la logique anti-double-réservation côté serveur |
| **4. Espace Club multi-utilisateurs** | Le club gère **ses vraies** réservations reçues | Donner les accès au club | Sécuriser l'accès club |
| **5. Notifications** | Rappels de match / confirmations | Autoriser les notifs sur ton tél. | Brancher les notifications |
| **6. Paiement (optionnel)** | Régler en ligne (Wave, Orange…) | Ouvrir le compte agrégateur (KYC) | Brancher le paiement + **relecture de sécurité** |
| **7. Publication stores** | App téléchargeable sur Play Store / App Store | Créer les comptes stores, suivre mes étapes | Préparer et soumettre les versions |

> Important : c'est **itératif**. Entre chaque lot, on teste sur de vrais téléphones et on corrige.

---

## 4. Sécurité — ce qu'on met en place

- **Connexion vérifiée** (code SMS) : pas de faux comptes au nom de quelqu'un d'autre.
- **Règles d'accès** : chaque personne ne voit/modifie que ce qu'elle a le droit (un club ne voit
  que ses réservations, un joueur que les siennes).
- **Clés secrètes chez toi** : les mots de passe et clés ne sont jamais publiés dans le code.
- **Paiement** : avant d'encaisser de l'argent réel, **relecture de sécurité dédiée** (idéalement
  confirmée par un humain spécialisé pour les flux d'argent).

---

## 5. Si tu préfères déléguer à un prestataire

Tu peux aussi confier la construction à un freelance/une agence. Dans ce cas, voici quoi lui donner
et quoi lui demander.

**À fournir :**
- Le lien de la démo + l'accès au code (ce dépôt) : tout le design et les écrans existent déjà.
- Ce document (architecture + lots) comme cahier des charges de départ.

**Périmètre demandé :** back-end Supabase/Firebase, connexion SMS, base partagée, dispo temps réel,
Espace Club multi-utilisateurs, notifications, (option paiement CinetPay/PayDunya), publication stores.

**Les questions à poser pour comparer les devis :**
- Quel **prix total** et quel **échéancier** (par lot) ?
- Quel **délai** jusqu'à une version testable, puis publiée ?
- Qui **détient le code et les comptes** à la fin ? *(Réponse attendue : toi.)*
- Quelle **maintenance** après livraison, et à quel prix ?
- Peut-on **commencer petit** (lots 1-3) avant de s'engager sur la suite ?

---

## 6. Par où commencer, concrètement

1. Avoir **au moins 1 club pilote** d'accord (sinon, reste sur la démo — voir `GUIDE-LANCEMENT.md`).
2. Me dire : « on lance la vraie version ».
3. On démarre par le **Lot 1** : je te guide pour créer **Supabase**, activer le **SMS**, et je
   branche la connexion. On teste sur ton téléphone. Puis on enchaîne les lots.
