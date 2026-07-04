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

  window.renderClubs = function renderClubs(lang) {
    var conteneur = document.getElementById('grille-clubs');
    if (!conteneur) return;
    var l = lang === 'en' ? 'en' : 'fr';
    var texteTerrains = l === 'fr' ? 'terrains' : 'courts';
    var texteTerrain = l === 'fr' ? 'terrain' : 'court';
    var texteDes = l === 'fr' ? 'dès' : 'from';
    var texteVoir = l === 'fr' ? 'Voir sur la carte ↗' : 'View on map ↗';
    var texteVedette = l === 'fr' ? 'Club mis en avant' : 'Featured club';

    var triees = CLUBS.slice().sort(compareClubs);
    conteneur.innerHTML = triees
      .map(function (c) {
        var mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.mapsQuery);
        var estVedette = c.id === FEATURED_CLUB_ID;
        var nbTerrains = c.courts + ' ' + (c.courts > 1 ? texteTerrains : texteTerrain);
        return (
          '<article class="carte-club reveal">' +
          '<div class="club-visuel" style="background:linear-gradient(155deg,' +
          couleurAccent(c.id) +
          ')">' +
          '<span class="badge-partenaire">' +
          (l === 'fr' ? 'Partenaire' : 'Partner') +
          '</span>' +
          (estVedette ? '<span class="badge-featured">' + texteVedette + '</span>' : '') +
          c.icon +
          '</div>' +
          '<div class="club-corps">' +
          '<h3>' +
          c.name +
          '</h3>' +
          '<div class="club-meta">' +
          '<span class="club-puce">' +
          c.area +
          '</span>' +
          '<span class="club-puce">' +
          TYPE_LABEL[c.type][l] +
          '</span>' +
          '<span class="club-puce">' +
          nbTerrains +
          '</span>' +
          '</div>' +
          '<p class="club-blurb">' +
          c.blurb[l] +
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
  // Initialisation
  // ------------------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', function () {
    initMenuMobile();
    initLangToggle(); // applique aussi renderClubs() si la grille est présente
    initReveal();
  });
})();
