/**
 * SHOP SYSTEM
 * Manages the shop UI, item display, and purchase flows
 */

const Shop = {
  currentTab: 'skins',
  pendingPurchase: null,
  previewAnimFrames: {},

  init() {
    this._buildSkinsGrid();
    this._buildBackgroundsGrid();
    this._buildCoinsPackages();
    this._bindTabEvents();
    this._bindModalEvents();
  },

  open(fromScreen) {
    this._fromScreen = fromScreen || 'menu';
    this.refresh();
    UI.showScreen('shop');
  },

  close() {
    // Stop preview animations
    Object.values(this.previewAnimFrames).forEach(id => cancelAnimationFrame(id));
    this.previewAnimFrames = {};

    if (this._fromScreen === 'gameover') {
      UI.showScreen('gameover');
    } else {
      UI.showScreen('menu');
    }
    UI.updateCoinDisplays();
  },

  refresh() {
    this._updateSkinsGrid();
    this._updateBackgroundsGrid();
    UI.updateCoinDisplays();
  },

  // ─── SKINS GRID ───────────────────────────────────────────────────────────

  _buildSkinsGrid() {
    const grid = document.getElementById('skins-grid');
    grid.innerHTML = '';
    SKINS.forEach(skin => {
      const card = this._createItemCard(skin, 'skin');
      grid.appendChild(card);
    });
  },

  _updateSkinsGrid() {
    const grid = document.getElementById('skins-grid');
    const cards = grid.querySelectorAll('.shop-item');
    cards.forEach((card, i) => {
      const skin = SKINS[i];
      this._updateCardState(card, skin, 'skin');
    });
  },

  // ─── BACKGROUNDS GRID ─────────────────────────────────────────────────────

  _buildBackgroundsGrid() {
    const grid = document.getElementById('backgrounds-grid');
    grid.innerHTML = '';
    BACKGROUNDS.forEach(bg => {
      const card = this._createItemCard(bg, 'bg');
      grid.appendChild(card);
    });
  },

  _updateBackgroundsGrid() {
    const grid = document.getElementById('backgrounds-grid');
    const cards = grid.querySelectorAll('.shop-item');
    cards.forEach((card, i) => {
      const bg = BACKGROUNDS[i];
      this._updateCardState(card, bg, 'bg');
    });
  },

  // ─── CARD CREATION ────────────────────────────────────────────────────────

  _createItemCard(item, type) {
    const div = document.createElement('div');
    div.className = 'shop-item';
    div.dataset.id = item.id;
    div.dataset.type = type;

    // Preview canvas
    const previewDiv = document.createElement('div');
    previewDiv.className = 'item-preview';
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 80;
    previewDiv.appendChild(canvas);

    // Item info
    const nameEl = document.createElement('div');
    nameEl.className = 'item-name';
    nameEl.textContent = item.name;

    const rarityEl = document.createElement('div');
    rarityEl.className = `item-rarity rarity-${item.rarity}`;
    rarityEl.textContent = this._rarityLabel(item.rarity).toUpperCase();

    const badgeEl = document.createElement('div');
    badgeEl.className = 'item-badge-wrap';

    div.appendChild(previewDiv);
    div.appendChild(nameEl);
    div.appendChild(rarityEl);
    div.appendChild(badgeEl);

    // Start preview animation
    this._startPreviewAnim(canvas, item, type);

    // Click handler
    div.addEventListener('click', () => this._onItemClick(item, type));
    div.addEventListener('touchend', (e) => {
      e.preventDefault();
      this._onItemClick(item, type);
    });

    this._updateCardState(div, item, type);
    return div;
  },

  _startPreviewAnim(canvas, item, type) {
    const ctx = canvas.getContext('2d');
    let t = 0;
    const key = `${type}_${item.id}`;

    const loop = () => {
      ctx.clearRect(0, 0, 80, 80);
      t += 0.016;

      if (type === 'skin') {
        // Draw background preview
        const bg = BACKGROUNDS.find(b => b.id === Store.getEquippedBg()) || BACKGROUNDS[0];
        if (bg.drawBg) {
          ctx.save();
          ctx.scale(80/375, 80/667);
          bg.drawBg(ctx, 375, 667, t * 60, t);
          ctx.restore();
        } else {
          ctx.fillStyle = '#87CEEB';
          ctx.fillRect(0, 0, 80, 80);
        }
        item.draw(ctx, 4, 10, 72, 60, t);
      } else {
        // Background preview
        ctx.save();
        ctx.scale(80/375, 80/667);
        item.drawBg(ctx, 375, 667, t * 60, t);
        ctx.restore();
      }

      this.previewAnimFrames[key] = requestAnimationFrame(loop);
    };
    loop();
  },

  _updateCardState(card, item, type) {
    const isOwned = type === 'skin' ? Store.ownsSkin(item.id) : Store.ownsBg(item.id);
    const isEquipped = type === 'skin'
      ? Store.getEquippedSkin() === item.id
      : Store.getEquippedBg() === item.id;

    card.classList.remove('owned', 'equipped', 'locked');

    let badgeHTML = '';
    if (isEquipped) {
      card.classList.add('equipped');
      badgeHTML = '<span class="item-badge badge-equipped">ÉQUIPÉ</span>';
    } else if (isOwned) {
      card.classList.add('owned');
      badgeHTML = '<span class="item-badge badge-owned">POSSÉDÉ</span>';
    } else if (item.currency === 'free') {
      badgeHTML = '<span class="item-badge badge-free">GRATUIT</span>';
    } else if (item.currency === 'coins') {
      badgeHTML = `<span class="item-price">🪙 ${item.price}</span>`;
    } else {
      card.classList.add('locked');
      badgeHTML = `<span class="item-price real-money">${this._getPriceDisplay(item)}</span>`;
    }

    const badgeWrap = card.querySelector('.item-badge-wrap');
    if (badgeWrap) badgeWrap.innerHTML = badgeHTML;
  },

  // ─── COINS PACKAGES ───────────────────────────────────────────────────────

  _buildCoinsPackages() {
    const container = document.getElementById('coins-packages');
    const packages = [
      { key: 'coins_100', icon: '🪙', coins: 100, bonus: 0, price: '0,99€', label: null },
      { key: 'coins_300', icon: '💰', coins: 300, bonus: 50, price: '2,99€', label: 'POPULAIRE', labelClass: 'label-popular' },
      { key: 'coins_600', icon: '💎', coins: 600, bonus: 150, price: '4,99€', label: 'MEILLEURE VALEUR', labelClass: 'label-value' },
      { key: 'coins_1500', icon: '👑', coins: 1500, bonus: 500, price: '9,99€', label: null },
    ];

    packages.forEach(pkg => {
      const div = document.createElement('div');
      div.className = 'coin-package';
      if (pkg.label === 'POPULAIRE') div.classList.add('popular');
      if (pkg.label === 'MEILLEURE VALEUR') div.classList.add('best-value');

      div.innerHTML = `
        <div class="package-left">
          <div class="package-icon">${pkg.icon}</div>
          <div class="package-info">
            ${pkg.label ? `<div class="package-label ${pkg.labelClass}">${pkg.label}</div>` : ''}
            <div class="package-amount">${pkg.coins.toLocaleString()} 🪙</div>
            ${pkg.bonus > 0 ? `<div class="package-bonus">+${pkg.bonus} bonus !</div>` : ''}
          </div>
        </div>
        <div class="package-price">${pkg.price}</div>
      `;

      div.addEventListener('click', () => this._purchaseCoinPackage(pkg));
      div.addEventListener('touchend', (e) => {
        e.preventDefault();
        this._purchaseCoinPackage(pkg);
      });

      container.appendChild(div);
    });
  },

  _purchaseCoinPackage(pkg) {
    const total = (pkg.coins || 0) + (pkg.bonus || 0);
    this.pendingPurchase = { type: 'coins', pkg };

    UI.showModal({
      icon: pkg.icon,
      title: `${pkg.coins.toLocaleString()} Pièces`,
      desc: pkg.bonus > 0
        ? `Obtenez ${pkg.coins.toLocaleString()} pièces + ${pkg.bonus} pièces bonus !`
        : `Obtenez ${pkg.coins.toLocaleString()} pièces d'or pour acheter des skins.`,
      price: pkg.price,
      onConfirm: () => {
        UI.hideModal();
        UI.showToast('Traitement en cours...', 'info');
        IAP.purchase(pkg.key,
          (result) => {
            const total = (IAP.PRODUCTS[pkg.key].coins || 0) + (IAP.PRODUCTS[pkg.key].bonus || 0);
            Store.addCoins(total);
            Store.recordTransaction(pkg.key, pkg.price, 'real');
            UI.updateCoinDisplays();
            UI.showToast(`+${total} 🪙 Pièces ajoutées !`, 'success');
            this.refresh();
          },
          (err) => UI.showToast('Achat annulé', 'error')
        );
      }
    });
  },

  // ─── ITEM CLICK ───────────────────────────────────────────────────────────

  _onItemClick(item, type) {
    const isOwned = type === 'skin' ? Store.ownsSkin(item.id) : Store.ownsBg(item.id);
    const isEquipped = type === 'skin'
      ? Store.getEquippedSkin() === item.id
      : Store.getEquippedBg() === item.id;

    // Already equipped → do nothing
    if (isEquipped) return;

    // Owned → equip
    if (isOwned || item.currency === 'free') {
      if (item.currency === 'free') {
        if (type === 'skin') Store.unlockSkin(item.id);
        else Store.unlockBg(item.id);
      }
      if (type === 'skin') Store.equipSkin(item.id);
      else Store.equipBg(item.id);
      this.refresh();
      UI.showToast(`${item.name} équipé !`, 'success');
      return;
    }

    // Not owned → purchase flow
    if (item.currency === 'coins') {
      // Buy with in-game coins
      UI.showModal({
        icon: item.icon,
        title: item.name,
        desc: `Acheter "${item.name}" avec des pièces d'or ?`,
        price: `🪙 ${item.price}`,
        onConfirm: () => {
          UI.hideModal();
          if (Store.spendCoins(item.price)) {
            if (type === 'skin') { Store.unlockSkin(item.id); Store.equipSkin(item.id); }
            else { Store.unlockBg(item.id); Store.equipBg(item.id); }
            Store.recordTransaction(item.id, item.price, 'coins');
            UI.updateCoinDisplays();
            this.refresh();
            UI.showToast(`${item.name} débloqué !`, 'success');
          } else {
            UI.showToast('Pas assez de pièces !', 'error');
          }
        }
      });
    } else {
      // Real money purchase
      const productKey = type === 'skin' ? `skin_${item.id}` : `bg_${item.id}`;
      UI.showModal({
        icon: item.icon,
        title: item.name,
        desc: `Débloquer "${item.name}" définitivement ?`,
        price: this._getPriceDisplay(item),
        onConfirm: () => {
          UI.hideModal();
          UI.showToast('Traitement en cours...', 'info');
          IAP.purchase(productKey,
            (result) => {
              if (type === 'skin') { Store.unlockSkin(item.id); Store.equipSkin(item.id); }
              else { Store.unlockBg(item.id); Store.equipBg(item.id); }
              Store.recordTransaction(item.id, item.price, 'real');
              this.refresh();
              UI.showToast(`${item.name} débloqué !`, 'success');
            },
            (err) => UI.showToast('Achat annulé', 'error')
          );
        }
      });
    }
  },

  // ─── TAB NAVIGATION ───────────────────────────────────────────────────────

  _bindTabEvents() {
    document.querySelectorAll('.shop-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`tab-${tabName}`).classList.add('active');
        this.currentTab = tabName;
      });
    });
  },

  _bindModalEvents() {
    document.getElementById('btn-cancel-purchase').addEventListener('click', () => UI.hideModal());
    document.getElementById('modal-overlay').addEventListener('click', () => UI.hideModal());
  },

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  _rarityLabel(rarity) {
    const labels = { common: 'Commun', rare: 'Rare', epic: 'Épique', legendary: 'Légendaire' };
    return labels[rarity] || rarity;
  },

  _getPriceDisplay(item) {
    const productKey = `skin_${item.id}` in IAP.PRODUCTS ? `skin_${item.id}` : `bg_${item.id}`;
    const product = IAP.PRODUCTS[productKey];
    return product ? product.display : `${item.price}€`;
  }
};
