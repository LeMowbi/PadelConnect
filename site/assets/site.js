// ==========================================================================
// PadelConnect — script commun du site vitrine (vanilla JS, aucune dépendance
// de build). Gère : bascule de langue FR/EN, menu mobile, animation « reveal »
// au défilement, et le rendu de la grille des 9 clubs fondateurs.
// ==========================================================================

(function () {
  'use strict';

  // ------------------------------------------------------------------------
  // 1) Langue — persistée dans localStorage, FR par défaut. Chaque page peut
  //    définir `window.I18N = { 'cle': { fr: '...', en: '...' } }` AVANT ce
  //    script ; les éléments portent `data-i18n="cle"` (texte) ou
  //    `data-i18n-html="cle"` (HTML, pour les passages avec balises <strong>).
  // ------------------------------------------------------------------------

  var LANG_KEY = 'pc_lang';

  function getLang() {
    var saved = null;
    try {
      saved = window.localStorage.getItem(LANG_KEY);
    } catch (e) {
      // Stockage indisponible (navigation privée…) → repli sur le français.
    }
    return saved === 'en' ? 'en' : 'fr';
  }

  function applyLang(lang) {
    document.documentElement.setAttribute('lang', lang);
    var dict = window.I18N || {};

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var entry = dict[el.getAttribute('data-i18n')];
      if (entry && entry[lang] != null) el.textContent = entry[lang];
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var entry = dict[el.getAttribute('data-i18n-html')];
      if (entry && entry[lang] != null) el.innerHTML = entry[lang];
    });

    // Boutons de bascule : affichent la langue VERS laquelle on bascule.
    document.querySelectorAll('.btn-lang').forEach(function (btn) {
      btn.textContent = lang === 'fr' ? 'EN' : 'FR';
      btn.setAttribute('aria-label', lang === 'fr' ? 'Switch to English' : 'Passer en français');
    });

    // Re-rend la grille des clubs si elle est présente sur la page (labels traduits).
    if (typeof window.renderClubs === 'function') window.renderClubs(lang);
  }

  function setLang(lang) {
    try {
      window.localStorage.setItem(LANG_KEY, lang);
    } catch (e) {
      /* ignoré */
    }
    applyLang(lang);
  }

  function initLangToggle() {
    var lang = getLang();
    applyLang(lang);
    document.querySelectorAll('.btn-lang').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setLang(getLang() === 'fr' ? 'en' : 'fr');
      });
    });
  }

  // ------------------------------------------------------------------------
  // 2) Menu mobile (hamburger) — affiche/masque la liste de liens empilée.
  // ------------------------------------------------------------------------

  function initMenuMobile() {
    var bouton = document.querySelector('.btn-menu');
    var barre = document.querySelector('.entete-barre');
    if (!bouton || !barre) return;
    bouton.addEventListener('click', function () {
      var ouvert = barre.classList.toggle('menu-ouvert');
      bouton.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
    });
    // Referme le menu au clic sur un lien (ancre de la même page).
    document.querySelectorAll('.menu-mobile a').forEach(function (a) {
      a.addEventListener('click', function () {
        barre.classList.remove('menu-ouvert');
      });
    });
  }

  // ------------------------------------------------------------------------
  // 3) Animation « reveal » — simple fondu + translation au premier défilement
  //    dans le viewport (micro-interaction, cohérent avec Reveal.tsx côté app).
  // ------------------------------------------------------------------------

  function initReveal() {
    var elements = document.querySelectorAll('.reveal');
    if (!elements.length) return;
    if (!('IntersectionObserver' in window)) {
      // Repli : tout afficher directement (anciens navigateurs).
      elements.forEach(function (el) {
        el.classList.add('visible');
      });
      return;
    }
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    elements.forEach(function (el) {
      observer.observe(el);
    });
  }

  // ------------------------------------------------------------------------
  // 4) Les 9 clubs fondateurs (données réelles — cf. src/data/clubs.ts).
  //    Padelta est le club mis en avant : toujours affiché en premier
  //    (décision du porteur, cf. isFeaturedClub / compareClubs dans le code).
  // ------------------------------------------------------------------------

  var FEATURED_CLUB_ID = 'padelta';

  var CLUBS = [
    {
      id: 'abidjan-padel',
      name: 'Abidjan Padel',
      area: 'Cocody Danga / Riviera',
      type: 'mixte',
      courts: 4,
      priceFrom: 15000,
      mapsQuery: 'Abidjan Padel Cocody',
      icon: '🎾',
      blurb: {
        fr: 'Réservation de créneaux et création de matchs entre joueurs, du côté de Cocody Danga / Riviera Golf.',
        en: 'Slot booking and player matchmaking, near Cocody Danga / Riviera Golf.',
      },
    },
    {
      id: 'district-club',
      name: 'District Club',
      area: 'Abidjan',
      type: 'exterieur',
      courts: 4,
      priceFrom: 14000,
      mapsQuery: 'District Club Padel Abidjan',
      icon: '☀️',
      blurb: {
        fr: 'Destination sport & lifestyle avec terrains extérieurs, café et restaurant.',
        en: 'Sport & lifestyle destination with outdoor courts, café and restaurant.',
      },
    },
    {
      id: 'elite-club',
      name: 'Elite Club',
      area: 'Marcory',
      type: 'mixte',
      courts: 3,
      priceFrom: 12000,
      mapsQuery: 'Elite Club Marcory Abidjan',
      icon: '🏆',
      blurb: {
        fr: 'Au carrefour de Marcory (derrière CAP SUD). Ambiance conviviale pour tous niveaux.',
        en: 'At the Marcory crossroads (behind CAP SUD). Friendly vibe for all levels.',
      },
    },
    {
      id: 'ivoire-padel',
      name: 'Ivoire Padel Club',
      area: 'Marcory Résidentiel',
      type: 'mixte',
      courts: 4,
      priceFrom: 13000,
      mapsQuery: 'Ivoire Padel Club Marcory Abidjan',
      icon: '🎾',
      blurb: {
        fr: 'Quatre terrains à Marcory Résidentiel (Rue Zéphirs). Idéal entre amis.',
        en: 'Four courts in Marcory Résidentiel (Rue Zéphirs). Great with friends.',
      },
    },
    {
      id: 'padel-magic',
      name: 'Padel Magic',
      area: 'Cocody (Hôtel Ivoire)',
      type: 'exterieur',
      courts: 4,
      priceFrom: 16000,
      mapsQuery: 'Padel Magic Hotel Ivoire Cocody Abidjan',
      icon: '✨',
      blurb: {
        fr: "Parmi les premiers terrains du pays, du côté de l'Hôtel Ivoire à Cocody.",
        en: "Among the country's very first padel courts, near Hôtel Ivoire in Cocody.",
      },
    },
    {
      id: 'padel-palmeraie',
      name: 'Padel Palmeraie',
      area: 'Faya / Bingerville',
      type: 'exterieur',
      courts: 2,
      priceFrom: 10000,
      mapsQuery: 'Padel Palmeraie Faya Bingerville',
      icon: '🌴',
      blurb: {
        fr: 'Dessert Faya et ses environs, vers Bingerville. Accueil familial.',
        en: 'Serving Faya and surroundings, towards Bingerville. Family-friendly.',
      },
    },
    {
      id: 'padel-zone-4',
      name: 'Padel Zone 4',
      area: 'Marcory, Zone 4',
      type: 'mixte',
      courts: 4,
      priceFrom: 15000,
      mapsQuery: 'Padel Zone 4 Rue du Docteur Blanchard Marcory Abidjan',
      icon: '🎾',
      blurb: {
        fr: 'Quatre terrains au cœur de la Zone 4, très accessible depuis le Plateau.',
        en: 'Four courts in the heart of Zone 4, easy to reach from Le Plateau.',
      },
    },
    {
      id: 'padelta',
      name: 'Padelta',
      area: 'Cocody Danga',
      type: 'couvert',
      courts: 5,
      priceFrom: 10000,
      mapsQuery: 'Padelta Cocody Danga Abidjan',
      icon: '🏟️',
      blurb: {
        fr: 'Club indoor avec terrains couverts homologués, salle de sport et café. À 5 min du Plateau.',
        en: 'Indoor club with certified covered courts, gym and café. 5 min from Le Plateau.',
      },
    },
    {
      id: 'padelhouse',
      name: 'PadelHouse',
      area: 'Zone 3',
      type: 'exterieur',
      courts: 3,
      priceFrom: 12000,
      mapsQuery: 'PadelHouse Zone 3 Abidjan',
      icon: '🏠',
      blurb: {
        fr: "Club outdoor en Zone 3, bonne ambiance pour une partie après le travail.",
        en: 'Outdoor club in Zone 3, great vibe for an after-work match.',
      },
    },
  ];

  // Les 9 fondateurs portent le badge « Partenaire ». Les clubs qui rejoignent
  // ensuite (via l'app, validés par l'opérateur) n'en ont pas.
  CLUBS.forEach(function (c) {
    c.partner = true;
  });

  // Liste RÉELLEMENT affichée : d'abord les fondateurs (statiques), puis complétée
  // EN DIRECT depuis la base par loadServerClubs(). Un échec réseau garde les fondateurs.
  var liveClubs = CLUBS.slice();
  var currentLang = getLang();

  // Même comparateur que compareClubs (data/clubs.ts) : le club mis en avant
  // d'abord, puis ordre alphabétique — jamais de « classement » des clubs.
  function compareClubs(a, b) {
    if (a.id !== b.id) {
      if (a.id === FEATURED_CLUB_ID) return -1;
      if (b.id === FEATURED_CLUB_ID) return 1;
    }
    return a.name.localeCompare(b.name);
  }

  var TYPE_LABEL = {
    couvert: { fr: 'Couvert', en: 'Indoor' },
    exterieur: { fr: 'Extérieur', en: 'Outdoor' },
    mixte: { fr: 'Mixte', en: 'Mixed' },
  };

  function formatFcfa(n) {
    // Espace insécable comme séparateur de milliers, à la façon FCFA locale.
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA';
  }

  // Échappe le HTML : les clubs venant de la base portent des noms/quartiers SAISIS
  // par les gérants → on ne les injecte JAMAIS bruts dans le DOM (anti-injection).
  function esc(s) {
    return (s == null ? '' : String(s))
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Type serveur ('Couvert'/'Extérieur'/'Mixte') → clé locale ('couvert'/'exterieur'/'mixte').
  function normType(t) {
    var s = (t || '').toString().toLowerCase();
    if (s.indexOf('couv') === 0) return 'couvert';
    if (s.indexOf('ext') === 0) return 'exterieur';
    return 'mixte';
  }

  window.renderClubs = function renderClubs(lang) {
    var conteneur = document.getElementById('grille-clubs');
    if (!conteneur) return;
    var l = lang === 'en' ? 'en' : 'fr';
    currentLang = l;
    var texteTerrains = l === 'fr' ? 'terrains' : 'courts';
    var texteTerrain = l === 'fr' ? 'terrain' : 'court';
    var texteDes = l === 'fr' ? 'dès' : 'from';
    var texteVoir = l === 'fr' ? 'Voir sur la carte ↗' : 'View on map ↗';

    // Padelta reste en tête (compareClubs) mais SANS badge « mis en avant » : discret (demande porteur).
    var triees = liveClubs.slice().sort(compareClubs);
    conteneur.innerHTML = triees
      .map(function (c) {
        var mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.mapsQuery);
        var nbTerrains = c.courts + ' ' + (c.courts > 1 ? texteTerrains : texteTerrain);
        return (
          '<article class="carte-club reveal">' +
          '<div class="club-visuel" style="background:linear-gradient(155deg,' +
          couleurAccent(c.id) +
          ')">' +
          (c.partner ? '<span class="badge-partenaire">' + (l === 'fr' ? 'Partenaire' : 'Partner') + '</span>' : '') +
          c.icon +
          '</div>' +
          '<div class="club-corps">' +
          '<h3>' +
          esc(c.name) +
          '</h3>' +
          '<div class="club-meta">' +
          (c.comingSoon ? '<span class="club-puce">' + (l === 'fr' ? '🔜 Bientôt' : '🔜 Soon') + '</span>' : '') +
          '<span class="club-puce">' +
          esc(c.area) +
          '</span>' +
          '<span class="club-puce">' +
          TYPE_LABEL[c.type][l] +
          '</span>' +
          '<span class="club-puce">' +
          nbTerrains +
          '</span>' +
          '</div>' +
          '<p class="club-blurb">' +
          esc(c.blurb[l]) +
          '</p>' +
          '<div class="club-pied">' +
          '<span class="club-prix">' +
          texteDes +
          ' ' +
          formatFcfa(c.priceFrom) +
          '</span>' +
          '<a class="lien-carte" href="' +
          mapsUrl +
          '" target="_blank" rel="noopener">' +
          texteVoir +
          '</a>' +
          '</div>' +
          '</div>' +
          '</article>'
        );
      })
      .join('');

    // Les cartes injectées après coup doivent aussi profiter de l'animation.
    initReveal();
  };

  // Couleur d'accent stable par club (mêmes teintes que ACCENTS côté app).
  var ACCENTS = ['#0e7a64,#0c6a57', '#d9b768,#c29a3a', '#9b8ff0,#7b6ce8', '#d9694b,#c0492f', '#0e7a64,#084c3f'];
  function couleurAccent(id) {
    var h = 7;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return ACCENTS[Math.abs(h) % ACCENTS.length];
  }

  // ------------------------------------------------------------------------
  // 5) Clubs EN DIRECT depuis la base (Supabase). Le site affiche les 9 fondateurs
  //    + tout club ajouté/validé dans l'app, et applique les modifications faites
  //    dans l'Espace opérateur (renommage, quartier, tarif). Lecture publique
  //    (RLS), clé « publishable » PUBLIQUE par conception. Un échec réseau garde
  //    simplement les 9 fondateurs — la page ne casse jamais.
  // ------------------------------------------------------------------------

  var SUPA_URL = 'https://bqeoqcqvqrqcrvkccxij.supabase.co';
  var SUPA_KEY = 'sb_publishable_n2_mCCNviA-fbtpSZiz2ew_mnEqGeG_';

  function supaGet(path) {
    return fetch(SUPA_URL + '/rest/v1/' + path, {
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY },
    })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .catch(function () {
        return null;
      });
  }

  function loadServerClubs() {
    Promise.all([
      // Clubs AJOUTÉS via l'app (actifs). Les 9 fondateurs, eux, sont embarqués ci-dessus.
      supaGet('clubs?select=id,name,area,type,courts,price_from&status=eq.active'),
      // Surcharges de fiche (renommage, quartier, tarif) — vaut pour fondateurs ET nouveaux.
      supaGet('club_overrides?select=club_id,name,area,type,price_from'),
      // Statut piloté par l'opérateur (masqué / bientôt / actif) — vaut aussi pour les fondateurs.
      supaGet('club_status?select=club_id,status'),
    ]).then(function (res) {
      var serverClubs = res[0];
      var overrides = res[1];
      var statuses = res[2];
      if (!serverClubs && !overrides && !statuses) return; // échec total → on garde les fondateurs
      var ovById = {};
      (overrides || []).forEach(function (o) {
        ovById[o.club_id] = o;
      });
      var statusById = {};
      (statuses || []).forEach(function (s) {
        statusById[s.club_id] = s.status;
      });

      // 1) Fondateurs : on RETIRE ceux masqués par l'opérateur (statut 'hidden'), on marque
      //    « Bientôt » ceux en 'coming_soon', et on applique les modifications de fiche.
      var founders = CLUBS.filter(function (c) {
        return statusById[c.id] !== 'hidden';
      }).map(function (c) {
        var o = ovById[c.id];
        return {
          id: c.id,
          name: (o && o.name) || c.name,
          area: (o && o.area) || c.area,
          type: o && o.type ? normType(o.type) : c.type,
          courts: c.courts,
          priceFrom: (o && o.price_from) || c.priceFrom,
          mapsQuery: c.mapsQuery,
          icon: c.icon,
          blurb: c.blurb,
          partner: true,
          comingSoon: statusById[c.id] === 'coming_soon',
        };
      });

      // 2) Nouveaux clubs (rejoints via l'app), surcharges appliquées, sans badge Partenaire.
      //    Déjà filtrés « actifs » par la requête ; on retire aussi tout 'hidden' par sécurité.
      var extra = (serverClubs || [])
        .filter(function (r) {
          return statusById[r.id] !== 'hidden';
        })
        .map(function (r) {
          var o = ovById[r.id] || {};
          var name = o.name || r.name || 'Club';
          var area = o.area || r.area || 'Abidjan';
          return {
            id: r.id,
            name: name,
            area: area,
            type: normType(o.type || r.type),
            courts: r.courts || 1,
            priceFrom: o.price_from || r.price_from || 10000,
            mapsQuery: name + ' ' + area + ' Abidjan',
            icon: '🎾',
            blurb: {
              fr: 'Club de padel à ' + area + ', réservable sur PadelConnect.',
              en: 'Padel club in ' + area + ', bookable on PadelConnect.',
            },
            partner: false,
            comingSoon: statusById[r.id] === 'coming_soon',
          };
        });

      liveClubs = founders.concat(extra);
      renderClubs(currentLang);
    });
  }

  // ------------------------------------------------------------------------
  // Initialisation
  // ------------------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', function () {
    initMenuMobile();
    initLangToggle(); // applique aussi renderClubs() si la grille est présente
    initReveal();
    loadServerClubs(); // complète la grille avec les vrais clubs de la base
  });
})();
