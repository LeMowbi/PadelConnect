# PadelConnect — Guide de lancement (pour Moustapha)

> Ce document répond, sans jargon, à tes questions : **comment présenter l'app à un club**,
> **faut-il d'abord la rendre « réelle »**, **comment les gens l'installent**, **ce qui manque
> pour que ce soit réel**, et **est-ce que Claude peut construire la vraie version sans que tu
> passes par un développeur**.

---

## 0. Où tu en es, en 3 phrases

1. Tu as une **maquette qui marche** (un « prototype ») : on peut cliquer partout, réserver,
   créer un match, voir les clubs, les compétitions, etc.
2. Mais les données restent **sur le téléphone qui l'utilise** : il n'y a pas encore de
   « cerveau central » (serveur) qui relie tous les joueurs entre eux. **C'est normal à ce stade.**
3. Cette maquette est **exactement ce qu'il faut pour convaincre les clubs**. La « vraie » app
   (reliée, sécurisée) se construit **après** avoir convaincu 1 ou 2 clubs.

👉 Démo en ligne, déjà prête à montrer : **https://lemowbi.github.io/PadelConnect/**

---

## 1. Comment présenter l'app à un club (pas à pas)

**L'idée maîtresse :** tu ne vends pas une techno, tu vends **plus de joueurs + un outil gratuit**,
sans risque pour eux.

### Le déroulé en 5 minutes
1. **Accroche (15 s).** « J'ai créé l'appli unique du padel à Abidjan : réserver un terrain,
   trouver un partenaire, prendre un coach, faire des compétitions — tous les clubs réunis, à égalité. »
2. **Tu montres l'app en vrai (3 min)** sur ton téléphone (le lien de démo). Montre : la page
   **Réserver** (jour → créneau → club → terrain), une fiche club avec ses photos et la carte,
   l'**Espace Club**, et une **compétition**.
3. **Ce qu'ils gagnent (1 min)** — voir ci-dessous.
4. **La demande (30 s)** : « On vous met dans l'appli **gratuitement** pendant 1 mois, on regarde
   ensemble les réservations. »
5. **Tu laisses un QR code** vers la démo (voir le kit).

### Ce que le CLUB y gagne (à dire)
- **Plus de réservations** : tu leur amènes des joueurs, surtout ceux sans partenaire.
- **Visibilité gratuite et à égalité** : aucun classement, aucun « meilleur club ». Personne n'est
  défavorisé — c'est un argument fort.
- **Un outil de gestion offert** (Espace Club) : créneaux, terrains, réservations reçues, compétitions.
- **Des compétitions clés en main** pour animer leur communauté.
- **Zéro risque** : gratuit au lancement, ils gardent leurs prix et leurs règles.

### Ce que TOI tu y gagnes
Un **actif** à toi : à terme une **commission** sur les réservations, un **abonnement** Espace Club,
les **compétitions**, le **premium** joueurs, les **coachs**, la **pub locale**. Et la **position de
premier arrivé** (plus il y a de clubs et de joueurs, plus c'est dur à copier).

### Les 4 objections fréquentes (et tes réponses)
| Ils disent | Tu réponds |
|---|---|
| « On a déjà notre appli/système. » | « PadelConnect ne le remplace pas : il vous amène **en plus** les joueurs qui ne vous connaissent pas, dans la seule appli pour tout Abidjan. » |
| « C'est payant ? » | « Gratuit pour démarrer. Une commission **seulement** quand l'app vous apporte vraiment des réservations. » |
| « Pourquoi pas WhatsApp ? » | « WhatsApp ne montre pas vos créneaux libres, ne gère ni les réservations, ni les niveaux, ni les compétitions, et ne vous fait pas découvrir aux nouveaux. » |
| « Et mes photos / mon image ? » | « On n'utilise vos photos **qu'avec votre accord écrit**, et vous êtes présentés à égalité. » |

> Détail complet : `kit/ARGUMENTAIRE.md`. Accord à signer : `kit/ACCORD-PILOTE.md`.

---

## 2. Faut-il d'abord rendre l'app « réelle » ? → **NON**

C'est la question la plus importante, et la réponse est claire : **présente d'abord, construis ensuite.**

**Le bon ordre (le moins risqué, le moins cher) :**
1. **Valider** : montre la démo à 2-3 clubs, écoute leurs retours.
2. **Signer** 1 ou 2 clubs pilotes (accord gratuit, voir le modèle).
3. **Construire** la vraie version (back-end, comptes, etc.) — seulement maintenant.
4. **Lancer** publiquement (stores, communication).

Pourquoi ? Construire la vraie version coûte du **temps et de l'argent**. Le faire **avant** d'avoir
le moindre club intéressé, c'est dépenser à l'aveugle. Avec un ou deux clubs partants, tu construis
en sachant que ça répond à un vrai besoin — et tu peux même t'appuyer sur eux pour les vrais essais.

---

## 3. Comment les gens « installent » l'app

### Maintenant (pour la démo) — **rien à installer**
- Tu partages simplement le **lien web** : **https://lemowbi.github.io/PadelConnect/**
  (ou tu héberges le fichier `PadelConnect-web.zip` sur Netlify — voir `INSTALL.md`).
- Le club/joueur **ouvre le lien**. Sur téléphone, il peut même faire
  **« Ajouter à l'écran d'accueil »** : une icône apparaît, ça s'ouvre comme une appli.
- Tu peux imprimer un **QR code** qui pointe vers ce lien (voir le kit).
- Pour tester sur ton propre téléphone façon « vraie appli » : **Expo Go** ou un **APK Android**
  (étapes dans `INSTALL.md`).

### Plus tard (la vraie appli) — sur les stores
Quand la version reliée sera prête, on la **publie** :
- **Google Play** (Android) : **25 $ une seule fois**, validation souvent rapide.
- **App Store** (iPhone) : **~99 $ par an**, validation par Apple en quelques jours.
- Les gens la téléchargent alors normalement depuis le store, comme n'importe quelle appli.

> En résumé : **aujourd'hui = un lien à ouvrir** ; **demain = un téléchargement sur les stores.**

---

## 4. Ce qui manque pour que ce soit « réel »

Deux familles de choses manquent — l'une **technique**, l'autre **business/juridique**.

### A) Côté technique : le « cerveau central » (back-end)
Aujourd'hui chaque téléphone est isolé. Pour relier tout le monde, il faut :
- **Un serveur + une base de données partagée** : tous les joueurs et clubs voient les **mêmes**
  créneaux, réservations, matchs, compétitions.
- **Des comptes vérifiés par SMS** (code reçu par téléphone) au lieu d'un simple nom saisi.
- **La disponibilité en temps réel** : si quelqu'un réserve un terrain, il devient **indisponible
  pour les autres** (impossible aujourd'hui car les téléphones ne se parlent pas).
- **Les notifications** (rappel de match, confirmation de réservation).

> **Pas de paiement dans l'app — choix assumé.** L'argent ne passe **jamais** par l'application :
> elle sert uniquement à **réserver**. Ta **commission se règle hors app** : tu envoies au club
> l'**historique** de ses réservations (l'« Espace opérateur » le fait déjà) et le club te paie par
> **Wave**. → Tu évites ainsi tout ce qui est lourd et risqué (données bancaires, vérification
> d'entreprise, sécurité financière).

> Bonne nouvelle : tous ces écrans **existent déjà** dans la maquette. Il s'agit de les **brancher**
> à un vrai serveur, pas de tout refaire.

### B) Côté business / juridique
- **Une structure légale** (entreprise) pour signer, encaisser, contracter.
- **L'accord écrit des clubs** pour utiliser leur nom, logo et photos (modèle fourni).
- **Une politique de confidentialité + des CGU** validées (obligatoire pour les stores ;
  respect de la réglementation ivoirienne **ARTCI** sur les données).
- **Un budget** (voir §7) et **un propriétaire des comptes** (toi).

---

## 5. La feuille de route, phase par phase

| Phase | Ce que TOI tu fais | Ce que Claude (ou un dev) fait | Coût indicatif |
|---|---|---|---|
| **1. Prototype** ✅ | Montrer la démo, recueillir des avis | (Fait) | ~0 |
| **2. Clubs pilotes** | Démarcher 2-3 clubs, faire signer l'accord, récupérer **vraies photos/créneaux/tarifs** | Mettre les vrais clubs dans la démo | ~0 |
| **3. Vraie version** | Créer les **comptes** (voir §6), détenir les clés, tester sur ton téléphone | Coder le back-end : comptes SMS, base partagée, dispo temps réel, notifications | Stores 25 $ + ~99 $/an ; serveur **gratuit au début** puis quelques $/mois ; SMS à l'usage |
| **4. Lancement & croissance** | Communication, QR en club, animer | Publier sur les stores, ajouter compétitions/coachs/premium | Marketing selon tes moyens |

---

## 6. « Claude peut-il construire la vraie version sécurisée, sans développeur ? » — la vérité

**Réponse honnête : oui pour le code, mais pas pour les étapes humaines.** Concrètement :

| Ce que **Claude** peut faire (le code) | Ce que **TOI** dois faire (humain, pas du code) |
|---|---|
| Écrire **tout le code** de la vraie version : comptes SMS, base de données partagée, dispo temps réel, notifications | **Créer les comptes** (Supabase, Apple, Google, SMS) — ils exigent **ton identité, ta carte bancaire, souvent ton entreprise + une vérification** |
| Configurer le projet, écrire des règles de sécurité correctes | **Détenir les clés secrètes** (mots de passe / clés d'API) — pour ta sécurité, elles restent **chez toi**, pas chez moi |
| Te guider **clic par clic** pour chaque réglage | **Publier sur les stores** (soumettre, répondre à Apple/Google) |
| Corriger, améliorer, tester le code à chaque session | Gérer le **juridique** (société, CGU, confidentialité) et **payer** les frais |

**Donc :** tu peux très probablement **éviter d'embaucher un codeur** — je joue ce rôle. Le modèle est
**« moi le code, toi le propriétaire-opérateur »** : tu crées les comptes et tu détiens les clés, je
construis et je te guide.

**Trois choses à savoir, en toute transparence :**
- C'est un **projet itératif** : une vraie appli multi-utilisateurs se construit en **plusieurs
  sessions**, avec des essais sur de vrais téléphones — pas en un clic.
- **Je ne peux pas déployer en ligne depuis ici** (mon environnement est une bulle temporaire au réseau
  limité) : j'écris/teste le code, **toi tu le mets en ligne avec tes comptes**, guidé par moi.
- Avant d'ouvrir au public, prévois une **relecture de sécurité** (pour protéger les données perso
  des joueurs). *(Rappel : pas de paiement dans l'app → pas de sécurité « bancaire » à gérer.)*

> Si un jour tu **préfères déléguer** à un prestataire, le document `kit/CONSTRUIRE-LA-VRAIE-VERSION.md`
> contient un mini cahier des charges et les questions à lui poser pour un devis.

---

## 7. Maintenance, sécurité & « à quoi sert un développeur »

Tu as retiré le paiement → tu enlèves **la partie la plus lourde** (pas de données bancaires, pas de
vérification d'entreprise, pas de risque financier). Mais quelques besoins réels demeurent, **même
sans paiement**. Les voici, sans rien te cacher :

- **Maintenance régulière (~1-2 fois/an).** iPhone et Android évoluent chaque année ; les outils
  aussi. Sans mises à jour, l'app finit par buguer ou être retirée des stores. → **Je m'en occupe**
  quand tu ouvres une session ; il faut juste y penser périodiquement.
- **Sécurité des données (oui, même sans paiement).** Tu stockes des noms, numéros, réservations. Il
  faut une connexion **vérifiée par SMS**, des **règles d'accès** (chacun ne voit que ses données) et
  une protection anti-abus. → **Je code ça correctement** ; prévois **une relecture de sécurité par un
  expert, UNE fois**, avant l'ouverture au public.
- **Disponibilité / incidents.** Avec un service géré (Supabase/Firebase), les pannes sont rares et
  quasi auto-réparées. Mais **je ne suis pas « de garde » 24/7** : je travaille quand TU ouvres une
  session. Pour de vrais utilisateurs, mieux vaut **quelqu'un de joignable** en cas de pépin.
- **Comptes, stores, juridique, support, sauvegardes** : voir le tableau ci-dessous.

### Qui fait quoi (sans embaucher un codeur à plein temps)
| Rôle | Ce qu'il couvre |
|---|---|
| **Claude (moi)** | Écrire le code, faire les **mises à jour** régulières, corriger les bugs, te guider |
| **Toi** | Comptes (Supabase/Apple/Google/SMS), clés, publication, **support** au début, démarches |
| **Prestations ponctuelles** | **Relecture de sécurité** (1×, avant lancement) · **juriste** (1×, CGU + confidentialité + ARTCI) |
| **Filet humain (conseillé)** | Un **contact technique joignable** pour les urgences quand tu n'as pas de session ouverte |

**Donc, à quoi sert un développeur ?** À écrire/maintenir le code — **c'est ce que je fais**. Tu n'as
**pas besoin d'un développeur à plein temps.** Un humain compétent reste surtout utile pour la
**relecture de sécurité ponctuelle**, le **dépannage d'urgence** et la **continuité** du projet.

---

## 8. Ordre de grandeur des coûts (pour démarrer pour de vrai)

- **Comptes stores** : Google Play **25 $** (une fois) + Apple **~99 $/an**.
- **Serveur + base de données** (Supabase ou Firebase) : **gratuit** au début, puis **quelques dizaines
  de $/mois** quand ça grandit.
- **SMS de vérification** : quelques centimes par SMS (tu paies à l'usage).
- **Pas de frais de paiement** : l'app n'encaisse rien (ta commission se règle par Wave, hors app).
- **Nom de domaine + page web** : faible (quelques $/an).
- Le plus gros « investissement » reste ton **temps** (démarchage clubs + sessions de construction).

---

## 9. Ta checklist des 30 prochains jours

- [ ] Mettre la démo en ligne sur un lien stable (déjà fait : https://lemowbi.github.io/PadelConnect/) et
      générer un **QR code**.
- [ ] Lister **5 clubs** à contacter en premier (les plus actifs/ouverts).
- [ ] Préparer ton téléphone avec la démo + imprimer la **page de présentation** du kit.
- [ ] Rencontrer **2-3 clubs**, montrer l'app en 5 min, proposer le **pilote gratuit**.
- [ ] Faire signer l'**accord pilote** (`kit/ACCORD-PILOTE.md`) à au moins **1 club**.
- [ ] Récupérer ses **vraies photos, créneaux et tarifs** (me les transmettre pour les mettre dans la démo).
- [ ] Décider : on lance la **construction de la vraie version** ? (alors → `kit/CONSTRUIRE-LA-VRAIE-VERSION.md`)
- [ ] (Si oui) Créer les **comptes** nécessaires (je te guide) et démarrer par les **comptes + connexion SMS**.
- [ ] Prévoir une **relecture de sécurité** (par un expert, une fois) **avant l'ouverture au public**.
- [ ] Caler un **rythme de maintenance** (mises à jour 1-2 fois/an) pour rester compatible avec les stores.

---

### Documents liés
- **`kit/PadelConnect-presentation.html`** — page imprimable à montrer/laisser au club.
- **`kit/ARGUMENTAIRE.md`** — argumentaire détaillé + objections.
- **`kit/ACCORD-PILOTE.md`** — accord simple à faire signer.
- **`kit/CONSTRUIRE-LA-VRAIE-VERSION.md`** — comment on passe au réel (comptes à créer, étapes).
- **`STRATEGIE.md`** — la stratégie complète (modèle économique, juridique, technique).
- **`INSTALL.md`** — comment partager/installer la démo.
