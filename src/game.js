/**
 * GAME ENGINE - Flappy Bird core mechanics
 */

const Game = {
  canvas: null,
  ctx: null,

  // Game state
  state: 'idle', // idle | playing | dead | paused

  // Physics
  bird: { x: 0, y: 0, vy: 0, rotation: 0, width: 44, height: 44 },
  pipes: [],
  particles: [],
  coins: [],

  // Scroll
  groundY: 0,
  scrollX: 0,

  // Score
  score: 0,
  coinsCollectedThisRound: 0,

  // Timing
  lastTime: 0,
  dt: 0,
  pipeTimer: 0,
  coinTimer: 0,

  // Config (scales with difficulty)
  GRAVITY: 1400,
  FLAP_FORCE: -480,
  PIPE_SPEED: 180,
  PIPE_GAP: 160,
  PIPE_WIDTH: 60,
  PIPE_SPAWN_INTERVAL: 2.0,
  COIN_SPAWN_INTERVAL: 3.5,
  MAX_PIPE_SPEED: 340,

  // Animation
  animTime: 0,
  frameId: null,
  deathTime: 0,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.ctx.scale(dpr, dpr);

    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.groundY = this.H * 0.82;

    // Re-position bird
    this.bird.x = this.W * 0.25;
    if (this.state === 'idle') {
      this.bird.y = this.H * 0.45;
    }
  },

  // ─── GAME LOOP ────────────────────────────────────────────────────────────

  start() {
    this.state = 'playing';
    this.score = 0;
    this.coinsCollectedThisRound = 0;
    this.pipes = [];
    this.particles = [];
    this.coins = [];
    this.scrollX = 0;
    this.pipeTimer = 1.2;
    this.coinTimer = this.COIN_SPAWN_INTERVAL;
    this.animTime = 0;

    this.bird.x = this.W * 0.25;
    this.bird.y = this.H * 0.45;
    this.bird.vy = 0;
    this.bird.rotation = 0;

    // Reset speed
    this.PIPE_SPEED = 180;
    this.PIPE_GAP = 160;
    this.PIPE_SPAWN_INTERVAL = 2.0;

    document.getElementById('current-score').textContent = '0';
    document.getElementById('coin-count').textContent = Store.getCoins();

    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.lastTime = performance.now();
    this.frameId = requestAnimationFrame(ts => this._loop(ts));
  },

  stop() {
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    this.state = 'idle';
  },

  _loop(timestamp) {
    this.dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;
    this.animTime += this.dt;

    if (this.state === 'playing') {
      this._update();
    } else if (this.state === 'dead') {
      this._updateDead();
    }

    this._render();
    this.frameId = requestAnimationFrame(ts => this._loop(ts));
  },

  // ─── UPDATE ───────────────────────────────────────────────────────────────

  _update() {
    const dt = this.dt;

    // Scroll
    this.scrollX += this.PIPE_SPEED * dt;

    // Bird physics
    this.bird.vy += this.GRAVITY * dt;
    this.bird.y += this.bird.vy * dt;
    this.bird.rotation = Math.max(-30, Math.min(90, this.bird.vy * 0.08));

    // Spawn pipes
    this.pipeTimer -= dt;
    if (this.pipeTimer <= 0) {
      this._spawnPipe();
      this.pipeTimer = this.PIPE_SPAWN_INTERVAL;
    }

    // Spawn coins
    this.coinTimer -= dt;
    if (this.coinTimer <= 0) {
      this._spawnCoin();
      this.coinTimer = this.COIN_SPAWN_INTERVAL + Math.random() * 1.5;
    }

    // Update pipes
    this.pipes.forEach(p => { p.x -= this.PIPE_SPEED * dt; });
    this.pipes = this.pipes.filter(p => p.x + this.PIPE_WIDTH + 10 > 0);

    // Update coins
    this.coins.forEach(c => {
      c.x -= this.PIPE_SPEED * dt;
      c.bob += dt * 3;
    });
    this.coins = this.coins.filter(c => c.x + 20 > 0);

    // Score check
    this.pipes.forEach(p => {
      if (!p.scored && p.x + this.PIPE_WIDTH < this.bird.x) {
        p.scored = true;
        this.score++;
        document.getElementById('current-score').textContent = this.score;
        this._onScoreIncrease();
      }
    });

    // Coin collection
    this.coins.forEach(c => {
      if (!c.collected && this._circleRectCollide(
        c.x, c.y + Math.sin(c.bob) * 5, 12,
        this.bird.x - 18, this.bird.y - 18, 36, 36
      )) {
        c.collected = true;
        this.coinsCollectedThisRound++;
        Store.addCoins(1);
        document.getElementById('coin-count').textContent = Store.getCoins();
        this._spawnCoinPopup(c.x, c.y);
      }
    });
    this.coins = this.coins.filter(c => !c.collected);

    // Update particles
    this.particles.forEach(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 400 * dt;
      p.life -= dt;
    });
    this.particles = this.particles.filter(p => p.life > 0);

    // Collision detection
    if (this._checkCollision()) {
      this._die();
    }
  },

  _updateDead() {
    const dt = this.dt;
    this.deathTime += dt;

    // Bird falls
    this.bird.vy += this.GRAVITY * dt;
    this.bird.y += this.bird.vy * dt;
    this.bird.rotation = Math.min(90, this.bird.rotation + 300 * dt);

    // Particles
    this.particles.forEach(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 400 * dt;
      p.life -= dt;
    });
    this.particles = this.particles.filter(p => p.life > 0);

    // Show game over after delay
    if (this.deathTime > 1.2) {
      this.state = 'idle';
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
      App.showGameOver(this.score, this.coinsCollectedThisRound);
    }
  },

  _onScoreIncrease() {
    // Gradually increase difficulty
    if (this.score % 5 === 0) {
      this.PIPE_SPEED = Math.min(this.PIPE_SPEED + 8, this.MAX_PIPE_SPEED);
      this.PIPE_GAP = Math.max(this.PIPE_GAP - 4, 115);
      this.PIPE_SPAWN_INTERVAL = Math.max(this.PIPE_SPAWN_INTERVAL - 0.05, 1.3);
    }
    // Score pulse animation (flash score)
    const scoreEl = document.getElementById('current-score');
    scoreEl.style.transform = 'scale(1.4)';
    scoreEl.style.color = '#FFD700';
    setTimeout(() => {
      scoreEl.style.transform = '';
      scoreEl.style.color = '';
    }, 200);
  },

  // ─── FLAP ─────────────────────────────────────────────────────────────────

  flap() {
    if (this.state !== 'playing') return;
    this.bird.vy = this.FLAP_FORCE;
    // Wing particles
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        x: this.bird.x - 10 + Math.random() * 20,
        y: this.bird.y + 10,
        vx: (Math.random() - 0.5) * 80,
        vy: Math.random() * 60 + 40,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.7,
        color: '#FFD700',
        size: 3 + Math.random() * 3
      });
    }
  },

  // ─── SPAWN ────────────────────────────────────────────────────────────────

  _spawnPipe() {
    const minY = this.H * 0.15;
    const maxY = this.groundY - this.PIPE_GAP - this.H * 0.1;
    const gapCenter = minY + Math.random() * (maxY - minY);

    this.pipes.push({
      x: this.W + 10,
      topH: gapCenter - this.PIPE_GAP / 2,
      botY: gapCenter + this.PIPE_GAP / 2,
      botH: this.groundY - (gapCenter + this.PIPE_GAP / 2),
      scored: false
    });
  },

  _spawnCoin() {
    // Don't spawn near pipes
    const safeZone = this.W + 100;
    const pipeNear = this.pipes.some(p => Math.abs(p.x - safeZone) < 80);
    if (pipeNear) return;

    const y = this.H * 0.2 + Math.random() * (this.groundY - this.H * 0.3);
    this.coins.push({ x: this.W + 30, y, bob: 0, collected: false });
  },

  _spawnCoinPopup(x, y) {
    const el = document.createElement('div');
    el.className = 'coin-popup';
    el.textContent = '+1 🪙';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.getElementById('app').appendChild(el);
    setTimeout(() => el.remove(), 1200);
  },

  // ─── COLLISION ────────────────────────────────────────────────────────────

  _checkCollision() {
    const b = this.bird;
    const margin = 8; // forgiveness margin
    const bx1 = b.x - b.width / 2 + margin;
    const bx2 = b.x + b.width / 2 - margin;
    const by1 = b.y - b.height / 2 + margin;
    const by2 = b.y + b.height / 2 - margin;

    // Ground and ceiling
    if (by2 >= this.groundY) return true;
    if (by1 <= 0) return true;

    // Pipes
    for (const p of this.pipes) {
      if (bx2 > p.x + margin && bx1 < p.x + this.PIPE_WIDTH - margin) {
        if (by1 < p.topH || by2 > p.botY) return true;
      }
    }
    return false;
  },

  _circleRectCollide(cx, cy, cr, rx, ry, rw, rh) {
    const nearX = Math.max(rx, Math.min(cx, rx + rw));
    const nearY = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nearX, dy = cy - nearY;
    return dx * dx + dy * dy < cr * cr;
  },

  _die() {
    this.state = 'dead';
    this.deathTime = 0;
    this.bird.vy = this.FLAP_FORCE * 0.6;

    // Death particles
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const speed = 100 + Math.random() * 200;
      this.particles.push({
        x: this.bird.x, y: this.bird.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 100,
        life: 0.6 + Math.random() * 0.6,
        maxLife: 1.2,
        color: ['#FFD700', '#FF6B6B', '#FFFFFF', '#FF8E53'][i % 4],
        size: 4 + Math.random() * 6
      });
    }

    // Screen shake
    this._shakeScreen();

    Store.updateBestScore(this.score);
  },

  _shakeScreen() {
    const app = document.getElementById('app');
    app.style.transform = 'translate(-4px, 3px)';
    setTimeout(() => { app.style.transform = 'translate(3px, -4px)'; }, 50);
    setTimeout(() => { app.style.transform = 'translate(-2px, 2px)'; }, 100);
    setTimeout(() => { app.style.transform = ''; }, 150);
  },

  // ─── RENDER ───────────────────────────────────────────────────────────────

  _render() {
    const ctx = this.ctx;
    const W = this.W, H = this.H;
    ctx.clearRect(0, 0, W, H);

    // Background
    const bgData = BACKGROUNDS.find(b => b.id === Store.getEquippedBg()) || BACKGROUNDS[0];
    bgData.drawBg(ctx, W, H, this.scrollX, this.animTime);

    // Coins
    this.coins.forEach(c => this._drawCoin(c));

    // Pipes
    const pipeColor = bgData.pipeColor || '#4CAF50';
    const pipeDark = bgData.pipeDark || '#388E3C';
    this.pipes.forEach(p => this._drawPipe(p, pipeColor, pipeDark));

    // Bird
    this._drawBird();

    // Particles
    this._renderParticles();

    // Ground line
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, this.groundY, W, 3);

    // Idle animation
    if (this.state === 'idle' && !document.getElementById('menu-screen').classList.contains('hidden')) {
      this._drawIdleBird();
    }
  },

  _drawBird() {
    const ctx = this.ctx;
    const b = this.bird;
    const skin = SKINS.find(s => s.id === Store.getEquippedSkin()) || SKINS[0];

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate((b.rotation * Math.PI) / 180);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(4, 4, b.width / 2 - 2, b.height / 2 - 4, 0, 0, Math.PI * 2);
    ctx.fill();

    skin.draw(ctx, -b.width / 2, -b.height / 2, b.width, b.height, this.animTime);
    ctx.restore();
  },

  _drawIdleBird() {
    // Hovering animation in menu (handled by menuBird canvas in main.js)
  },

  _drawPipe(p, color, dark) {
    const ctx = this.ctx;
    const pw = this.PIPE_WIDTH;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(p.x + 4, 0, pw, p.topH + 4);
    ctx.fillRect(p.x + 4, p.botY + 4, pw, this.groundY - p.botY);

    // Top pipe
    this._drawPipeSegment(p.x, 0, pw, p.topH, color, dark, 'top');
    // Bottom pipe
    this._drawPipeSegment(p.x, p.botY, pw, this.groundY - p.botY, color, dark, 'bottom');
  },

  _drawPipeSegment(x, y, w, h, color, dark, direction) {
    const ctx = this.ctx;

    // Main body
    const grd = ctx.createLinearGradient(x, 0, x + w, 0);
    grd.addColorStop(0, dark);
    grd.addColorStop(0.3, color);
    grd.addColorStop(0.7, color);
    grd.addColorStop(1, dark);
    ctx.fillStyle = grd;
    ctx.fillRect(x, y, w, h);

    // Cap
    const capH = 18;
    const capX = x - 5;
    const capW = w + 10;
    const capY = direction === 'top' ? y + h - capH : y;

    const capGrd = ctx.createLinearGradient(capX, 0, capX + capW, 0);
    capGrd.addColorStop(0, dark);
    capGrd.addColorStop(0.2, color);
    capGrd.addColorStop(0.8, color);
    capGrd.addColorStop(1, dark);
    ctx.fillStyle = capGrd;
    ctx.beginPath();
    ctx.roundRect(capX, capY, capW, capH, 4);
    ctx.fill();

    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x + 4, y, 6, h);
  },

  _drawCoin(c) {
    const ctx = this.ctx;
    const cy = c.y + Math.sin(c.bob) * 5;
    const r = 12;

    // Glow
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(255,215,0,0.6)';

    // Coin body
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(c.x, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Inner
    ctx.fillStyle = '#FFA500';
    ctx.beginPath();
    ctx.arc(c.x, cy, r * 0.65, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFD700';
    ctx.font = `bold ${r}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', c.x, cy + 1);

    ctx.shadowBlur = 0;
    ctx.textBaseline = 'alphabetic';
  },

  _renderParticles() {
    const ctx = this.ctx;
    this.particles.forEach(p => {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  },

  // ─── MENU BIRD PREVIEW ────────────────────────────────────────────────────

  drawMenuBird(canvas, t) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const hoverY = Math.sin(t * 2) * 4;
    const skin = SKINS.find(s => s.id === Store.getEquippedSkin()) || SKINS[0];
    skin.draw(ctx, 0, hoverY, w, h, t);
  }
};
