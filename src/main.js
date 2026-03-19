/**
 * MAIN - App controller, UI orchestration, event binding
 */

// ─── UI HELPERS ─────────────────────────────────────────────────────────────

const UI = {
  _toastTimer: null,
  _modalConfirmCb: null,

  showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const hud = document.getElementById('hud');
    hud.classList.add('hidden');

    if (name === 'game') {
      hud.classList.remove('hidden');
      return;
    }

    const el = document.getElementById(`${name}-screen`);
    if (el) el.classList.remove('hidden');
  },

  updateCoinDisplays() {
    const coins = Store.getCoins();
    document.getElementById('menu-coin-count').textContent = coins;
    document.getElementById('shop-coin-count').textContent = coins;
    document.getElementById('coin-count').textContent = coins;
  },

  showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast ${type}`;
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { toast.classList.add('hidden'); }, 2500);
  },

  showModal({ icon, title, desc, price, onConfirm }) {
    document.getElementById('modal-icon').textContent = icon;
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-desc').textContent = desc;
    document.getElementById('modal-price').textContent = price;
    this._modalConfirmCb = onConfirm;
    document.getElementById('iap-modal').classList.remove('hidden');
  },

  hideModal() {
    document.getElementById('iap-modal').classList.add('hidden');
    this._modalConfirmCb = null;
  },

  fireModalConfirm() {
    if (this._modalConfirmCb) this._modalConfirmCb();
  },

  showCountdown(n, cb) {
    const el = document.getElementById('countdown');
    el.textContent = n;
    el.classList.remove('hidden');
    // Trigger reflow for re-animation
    void el.offsetWidth;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';

    if (n > 0) {
      setTimeout(() => this.showCountdown(n - 1, cb), 700);
    } else {
      el.classList.add('hidden');
      cb();
    }
  }
};

// ─── APP CONTROLLER ─────────────────────────────────────────────────────────

const App = {
  menuBirdCanvas: null,
  menuAnimId: null,
  menuT: 0,

  init() {
    // Init IAP and shop
    IAP.init();
    Shop.init();
    this.updateCoinDisplays();

    // Canvas
    const canvas = document.getElementById('gameCanvas');
    Game.init(canvas);

    // Menu bird canvas
    this.menuBirdCanvas = document.getElementById('menu-bird-preview');
    this.menuBirdCanvas.width = 80;
    this.menuBirdCanvas.height = 80;

    // Bind events
    this._bindMenuEvents();
    this._bindGameEvents();
    this._bindShopEvents();
    this._bindLeaderboardEvents();
    this._bindModalEvent();

    // Show menu
    UI.showScreen('menu');
    this._startMenuAnim();

    // Update coins
    UI.updateCoinDisplays();
  },

  updateCoinDisplays() {
    UI.updateCoinDisplays();
  },

  // ─── MENU ─────────────────────────────────────────────────────────────────

  _startMenuAnim() {
    const loop = (t) => {
      this.menuT = t / 1000;
      Game.drawMenuBird(this.menuBirdCanvas, this.menuT);
      this.menuAnimId = requestAnimationFrame(loop);
    };
    this.menuAnimId = requestAnimationFrame(loop);
  },

  _stopMenuAnim() {
    if (this.menuAnimId) {
      cancelAnimationFrame(this.menuAnimId);
      this.menuAnimId = null;
    }
  },

  _bindMenuEvents() {
    document.getElementById('btn-play').addEventListener('click', () => this.startGame());
    document.getElementById('btn-play').addEventListener('touchend', (e) => { e.preventDefault(); this.startGame(); });

    document.getElementById('btn-shop').addEventListener('click', () => this.openShop('menu'));
    document.getElementById('btn-shop').addEventListener('touchend', (e) => { e.preventDefault(); this.openShop('menu'); });

    document.getElementById('btn-leaderboard').addEventListener('click', () => this.openLeaderboard());
    document.getElementById('btn-leaderboard').addEventListener('touchend', (e) => { e.preventDefault(); this.openLeaderboard(); });
  },

  startGame() {
    this._stopMenuAnim();
    UI.showScreen('game');
    // Brief countdown then start
    UI.showCountdown(3, () => {
      Game.start();
    });
  },

  // ─── GAME EVENTS ──────────────────────────────────────────────────────────

  _bindGameEvents() {
    const canvas = document.getElementById('gameCanvas');

    // Touch flap
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      Game.flap();
    }, { passive: false });

    // Click flap (desktop)
    canvas.addEventListener('mousedown', () => Game.flap());

    // Keyboard flap
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        Game.flap();
      }
    });
  },

  showGameOver(score, coinsEarned) {
    document.getElementById('final-score').textContent = score;
    document.getElementById('best-score').textContent = Store.getBestScore();
    document.getElementById('coins-earned').textContent = `+${coinsEarned} 🪙`;

    this._startMenuAnim();
    UI.showScreen('gameover');
    UI.updateCoinDisplays();
  },

  _bindGameOverEvents() {
    // Bind once
    document.getElementById('btn-retry').addEventListener('click', () => this.startGame());
    document.getElementById('btn-retry').addEventListener('touchend', (e) => { e.preventDefault(); this.startGame(); });

    document.getElementById('btn-menu').addEventListener('click', () => {
      UI.showScreen('menu');
    });
    document.getElementById('btn-menu').addEventListener('touchend', (e) => {
      e.preventDefault();
      UI.showScreen('menu');
    });

    document.getElementById('btn-goto-shop').addEventListener('click', () => this.openShop('gameover'));
    document.getElementById('btn-goto-shop').addEventListener('touchend', (e) => {
      e.preventDefault();
      this.openShop('gameover');
    });

    document.getElementById('btn-buy-coins-go').addEventListener('click', () => {
      this.openShop('gameover');
      // Switch to coins tab
      setTimeout(() => {
        document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector('[data-tab="coins"]').classList.add('active');
        document.getElementById('tab-coins').classList.add('active');
      }, 100);
    });
    document.getElementById('btn-buy-coins-go').addEventListener('touchend', (e) => { e.preventDefault(); e.target.click(); });
  },

  // ─── SHOP ─────────────────────────────────────────────────────────────────

  openShop(from) {
    Shop.open(from);
  },

  _bindShopEvents() {
    document.getElementById('btn-shop-back').addEventListener('click', () => Shop.close());
    document.getElementById('btn-shop-back').addEventListener('touchend', (e) => { e.preventDefault(); Shop.close(); });
  },

  // ─── LEADERBOARD ──────────────────────────────────────────────────────────

  openLeaderboard() {
    this._renderLeaderboard();
    UI.showScreen('leaderboard');
  },

  _renderLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '';
    const entries = Store.getLeaderboard();

    entries.forEach((entry, i) => {
      const div = document.createElement('div');
      div.className = `lb-entry ${entry.isPlayer ? 'player' : ''}`;

      const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      const rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;

      div.innerHTML = `
        <div class="lb-rank ${rankClass}">${rankIcon}</div>
        <div class="lb-name">${entry.name}${entry.isPlayer ? ' (Toi)' : ''}</div>
        <div class="lb-score">${entry.score}</div>
      `;

      if (entry.isPlayer) {
        div.style.background = 'rgba(255,215,0,0.12)';
        div.style.border = '1px solid rgba(255,215,0,0.3)';
        div.style.borderRadius = '12px';
      }

      list.appendChild(div);
    });
  },

  _bindLeaderboardEvents() {
    document.getElementById('btn-lb-back').addEventListener('click', () => UI.showScreen('menu'));
    document.getElementById('btn-lb-back').addEventListener('touchend', (e) => { e.preventDefault(); UI.showScreen('menu'); });
  },

  // ─── MODAL ────────────────────────────────────────────────────────────────

  _bindModalEvent() {
    document.getElementById('btn-confirm-purchase').addEventListener('click', () => UI.fireModalConfirm());
    document.getElementById('btn-confirm-purchase').addEventListener('touchend', (e) => { e.preventDefault(); UI.fireModalConfirm(); });
  }
};

// ─── BOOT ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  App.init();
  // Bind gameover buttons
  App._bindGameOverEvents();
});

// Prevent default touch behaviors (scroll, zoom) on game
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
