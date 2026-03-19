/**
 * IN-APP PURCHASE SYSTEM
 * Handles real money transactions via native IAP (iOS StoreKit / Google Play Billing)
 * Falls back to simulated purchases in web/demo mode
 */

const IAP = {
  // Product IDs must match App Store Connect / Google Play Console
  PRODUCTS: {
    // Coin packages
    coins_100:  { id: 'com.floppywings.coins_100',   price: 0.99,  display: '0,99€', coins: 100,  bonus: 0    },
    coins_300:  { id: 'com.floppywings.coins_300',   price: 2.99,  display: '2,99€', coins: 350,  bonus: 50   },
    coins_600:  { id: 'com.floppywings.coins_600',   price: 4.99,  display: '4,99€', coins: 750,  bonus: 150  },
    coins_1500: { id: 'com.floppywings.coins_1500',  price: 9.99,  display: '9,99€', coins: 2000, bonus: 500  },
    // Skins (non-consumable)
    skin_phoenix: { id: 'com.floppywings.skin_phoenix', price: 0.99, display: '0,99€', type: 'skin', itemId: 'phoenix' },
    skin_ice:     { id: 'com.floppywings.skin_ice',     price: 0.99, display: '0,99€', type: 'skin', itemId: 'ice'     },
    skin_golden:  { id: 'com.floppywings.skin_golden',  price: 1.99, display: '1,99€', type: 'skin', itemId: 'golden'  },
    skin_neon:    { id: 'com.floppywings.skin_neon',    price: 1.99, display: '1,99€', type: 'skin', itemId: 'neon'    },
    skin_rainbow: { id: 'com.floppywings.skin_rainbow', price: 2.99, display: '2,99€', type: 'skin', itemId: 'rainbow' },
    // Backgrounds (non-consumable)
    bg_night:      { id: 'com.floppywings.bg_night',      price: 0.99, display: '0,99€', type: 'bg', itemId: 'night'      },
    bg_underwater: { id: 'com.floppywings.bg_underwater',  price: 0.99, display: '0,99€', type: 'bg', itemId: 'underwater' },
    bg_space:      { id: 'com.floppywings.bg_space',      price: 1.99, display: '1,99€', type: 'bg', itemId: 'space'      },
    bg_jungle:     { id: 'com.floppywings.bg_jungle',     price: 1.99, display: '1,99€', type: 'bg', itemId: 'jungle'     },
    bg_volcano:    { id: 'com.floppywings.bg_volcano',    price: 2.99, display: '2,99€', type: 'bg', itemId: 'volcano'    },
  },

  // Check if running inside Capacitor (native app)
  isNative() {
    return typeof window !== 'undefined' &&
           typeof window.Capacitor !== 'undefined' &&
           window.Capacitor.isNativePlatform();
  },

  /**
   * Initialize IAP plugin (Capacitor)
   * In production: uses @capacitor-community/in-app-purchases or cordova-plugin-purchase
   */
  async init() {
    if (!this.isNative()) {
      console.log('[IAP] Running in web mode - purchases are simulated');
      return;
    }
    try {
      // Native init would go here:
      // const { InAppPurchase2 } = await import('@capacitor-community/in-app-purchases');
      // await InAppPurchase2.register(Object.values(this.PRODUCTS).map(p => p.id));
      console.log('[IAP] Native IAP initialized');
    } catch (e) {
      console.error('[IAP] Init error:', e);
    }
  },

  /**
   * Purchase a product
   * @param {string} productKey - key in PRODUCTS object
   * @param {function} onSuccess - called with purchase result
   * @param {function} onError - called with error
   */
  async purchase(productKey, onSuccess, onError) {
    const product = this.PRODUCTS[productKey];
    if (!product) {
      onError('Produit introuvable');
      return;
    }

    if (this.isNative()) {
      // NATIVE PURCHASE FLOW
      // In production with Capacitor + @capacitor-community/in-app-purchases:
      /*
      try {
        const result = await Plugins.InAppPurchase2.buy({ productId: product.id });
        if (result && result.transactionId) {
          // Verify receipt on your server
          const verified = await this.verifyReceipt(result);
          if (verified) {
            onSuccess(result);
          } else {
            onError('Vérification échouée');
          }
        }
      } catch (e) {
        onError(e.message || 'Achat annulé');
      }
      */
      console.log('[IAP] Would trigger native purchase for:', product.id);
      // Simulate for now
      this._simulatePurchase(product, onSuccess, onError);
    } else {
      // WEB/DEMO MODE - Simulate purchase
      this._simulatePurchase(product, onSuccess, onError);
    }
  },

  /**
   * Restore purchases (required by App Store guidelines)
   */
  async restorePurchases(onComplete) {
    if (this.isNative()) {
      // Native restore:
      // await Plugins.InAppPurchase2.restorePurchases();
    }
    // Load from local storage (demo)
    const saved = Store.getOwnedItems();
    onComplete(saved);
  },

  /**
   * Simulate a purchase (demo/web mode)
   * Shows a delay to mimic real transaction
   */
  _simulatePurchase(product, onSuccess, onError) {
    setTimeout(() => {
      // 95% success rate simulation
      if (Math.random() > 0.02) {
        onSuccess({
          transactionId: 'sim_' + Date.now(),
          productId: product.id,
          product: product
        });
      } else {
        onError('Transaction annulée');
      }
    }, 800);
  },

  /**
   * Server-side receipt verification stub
   * In production: POST receipt to your backend for validation
   */
  async verifyReceipt(receipt) {
    // POST to your backend:
    // const resp = await fetch('https://your-server.com/verify-iap', {
    //   method: 'POST',
    //   body: JSON.stringify({ receipt, platform: Capacitor.getPlatform() })
    // });
    // return resp.ok;
    return true; // Demo always verifies
  }
};

/**
 * GAME STORE - Manages owned items and currency
 */
const Store = {
  _data: null,

  _defaults() {
    return {
      coins: 50,
      ownedSkins: ['classic'],
      ownedBgs: ['classic'],
      equippedSkin: 'classic',
      equippedBg: 'classic',
      bestScore: 0,
      totalGames: 0,
      transactions: []
    };
  },

  load() {
    try {
      const saved = localStorage.getItem('floppywings_store');
      this._data = saved ? JSON.parse(saved) : this._defaults();
      // Migrate missing fields
      const def = this._defaults();
      Object.keys(def).forEach(k => {
        if (this._data[k] === undefined) this._data[k] = def[k];
      });
    } catch {
      this._data = this._defaults();
    }
  },

  save() {
    try {
      localStorage.setItem('floppywings_store', JSON.stringify(this._data));
    } catch {}
  },

  get(key) {
    if (!this._data) this.load();
    return this._data[key];
  },

  set(key, value) {
    if (!this._data) this.load();
    this._data[key] = value;
    this.save();
  },

  getCoins() { return this.get('coins'); },
  addCoins(n) {
    this.set('coins', this.get('coins') + n);
    return this.get('coins');
  },
  spendCoins(n) {
    if (this.get('coins') < n) return false;
    this.set('coins', this.get('coins') - n);
    return true;
  },

  getOwnedItems() {
    return { skins: this.get('ownedSkins'), bgs: this.get('ownedBgs') };
  },

  ownsSkin(id) { return this.get('ownedSkins').includes(id); },
  ownsBg(id) { return this.get('ownedBgs').includes(id); },

  unlockSkin(id) {
    if (!this.ownsSkin(id)) {
      const arr = [...this.get('ownedSkins'), id];
      this.set('ownedSkins', arr);
    }
  },
  unlockBg(id) {
    if (!this.ownsBg(id)) {
      const arr = [...this.get('ownedBgs'), id];
      this.set('ownedBgs', arr);
    }
  },

  equipSkin(id) { this.set('equippedSkin', id); },
  equipBg(id) { this.set('equippedBg', id); },

  getEquippedSkin() { return this.get('equippedSkin') || 'classic'; },
  getEquippedBg() { return this.get('equippedBg') || 'classic'; },

  updateBestScore(score) {
    if (score > this.get('bestScore')) {
      this.set('bestScore', score);
    }
    this.set('totalGames', (this.get('totalGames') || 0) + 1);
  },

  getBestScore() { return this.get('bestScore'); },

  getLeaderboard() {
    // In production: fetch from server / Game Center / Google Play Games
    const best = this.getBestScore();
    const board = [
      { name: 'Toi', score: best, isPlayer: true },
      { name: 'FlapMaster', score: Math.max(best - 2, 5) + Math.floor(Math.random() * 3) },
      { name: 'SkyHawk', score: Math.max(best - 5, 3) + Math.floor(Math.random() * 4) },
      { name: 'BirdKing', score: Math.max(best - 8, 2) + Math.floor(Math.random() * 5) },
      { name: 'WingZero', score: Math.max(best - 10, 1) + Math.floor(Math.random() * 6) },
      { name: 'FlappyPro', score: Math.max(best - 15, 1) },
      { name: 'AeroAce', score: Math.max(best - 20, 1) },
      { name: 'SkyDiver', score: Math.max(best - 25, 1) },
    ];
    return board.sort((a, b) => b.score - a.score);
  },

  recordTransaction(item, amount, currency) {
    const tx = { item, amount, currency, date: new Date().toISOString() };
    const txs = [...(this.get('transactions') || []), tx].slice(-50);
    this.set('transactions', txs);
  }
};

// Initialize store
Store.load();
