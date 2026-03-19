/**
 * SKINS & BACKGROUNDS DATA
 * All visual assets are drawn procedurally on canvas (no external files needed)
 */

const SKINS = [
  {
    id: 'classic',
    name: 'Canary',
    rarity: 'common',
    price: 0,
    currency: 'free',
    icon: '🐤',
    draw(ctx, x, y, w, h, t) {
      const cx = x + w / 2, cy = y + h / 2;
      const r = Math.min(w, h) * 0.38;
      // Body
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      // Wing
      ctx.fillStyle = '#FFA500';
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.3, cy + r * 0.1, r * 0.5, r * 0.3, -0.4 + Math.sin(t * 8) * 0.3, 0, Math.PI * 2);
      ctx.fill();
      // Eye
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(cx + r * 0.35, cy - r * 0.2, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1a2e';
      ctx.beginPath();
      ctx.arc(cx + r * 0.42, cy - r * 0.2, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
      // Beak
      ctx.fillStyle = '#FF6600';
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.7, cy);
      ctx.lineTo(cx + r * 0.95, cy - r * 0.05);
      ctx.lineTo(cx + r * 0.7, cy + r * 0.18);
      ctx.closePath();
      ctx.fill();
    }
  },
  {
    id: 'phoenix',
    name: 'Phénix',
    rarity: 'rare',
    price: 0.99,
    currency: 'real',
    icon: '🔥',
    draw(ctx, x, y, w, h, t) {
      const cx = x + w / 2, cy = y + h / 2;
      const r = Math.min(w, h) * 0.38;
      // Flame tail
      const flames = [
        {dx: -r*0.6, dy: r*0.3, rx: r*0.15, ry: r*0.45, color: '#FF4500'},
        {dx: -r*0.8, dy: 0, rx: r*0.12, ry: r*0.35, color: '#FF6600'},
        {dx: -r*0.5, dy: -r*0.2, rx: r*0.1, ry: r*0.3, color: '#FFD700'},
      ];
      flames.forEach(f => {
        ctx.fillStyle = f.color;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.ellipse(cx + f.dx, cy + f.dy + Math.sin(t * 6 + f.dx) * 3, f.rx, f.ry, 0.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      // Body
      ctx.fillStyle = '#FF2200';
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      // Glow
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.2);
      grd.addColorStop(0, 'rgba(255,100,0,0.3)');
      grd.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.2, 0, Math.PI * 2);
      ctx.fill();
      // Wing
      ctx.fillStyle = '#FF6600';
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.2, cy, r * 0.55, r * 0.3, -0.3 + Math.sin(t * 8) * 0.4, 0, Math.PI * 2);
      ctx.fill();
      // Eye
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(cx + r * 0.35, cy - r * 0.2, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FF0000';
      ctx.beginPath();
      ctx.arc(cx + r * 0.42, cy - r * 0.2, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
      // Beak
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.7, cy);
      ctx.lineTo(cx + r * 0.95, cy - r * 0.05);
      ctx.lineTo(cx + r * 0.7, cy + r * 0.18);
      ctx.closePath();
      ctx.fill();
    }
  },
  {
    id: 'ice',
    name: 'Cryo',
    rarity: 'rare',
    price: 0.99,
    currency: 'real',
    icon: '❄️',
    draw(ctx, x, y, w, h, t) {
      const cx = x + w / 2, cy = y + h / 2;
      const r = Math.min(w, h) * 0.38;
      // Ice crystals
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + t * 0.5;
        const px = cx + Math.cos(angle) * r * 1.1;
        const py = cy + Math.sin(angle) * r * 1.1;
        ctx.fillStyle = `rgba(100,200,255,${0.3 + Math.sin(t * 3 + i) * 0.15})`;
        ctx.beginPath();
        ctx.arc(px, py, r * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
      // Body
      const grd = ctx.createRadialGradient(cx - r*0.2, cy - r*0.2, 0, cx, cy, r);
      grd.addColorStop(0, '#E0F7FF');
      grd.addColorStop(0.5, '#64C8FF');
      grd.addColorStop(1, '#0080FF');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      // Frost overlay
      ctx.fillStyle = 'rgba(180,240,255,0.25)';
      ctx.beginPath();
      ctx.arc(cx - r * 0.1, cy - r * 0.2, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      // Wing
      ctx.fillStyle = 'rgba(100,200,255,0.7)';
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.2, cy + r * 0.1, r * 0.55, r * 0.28, -0.3 + Math.sin(t * 8) * 0.35, 0, Math.PI * 2);
      ctx.fill();
      // Eye
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(cx + r * 0.35, cy - r * 0.2, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0040FF';
      ctx.beginPath();
      ctx.arc(cx + r * 0.42, cy - r * 0.2, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
      // Beak
      ctx.fillStyle = '#80CFFF';
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.7, cy);
      ctx.lineTo(cx + r * 0.95, cy - r * 0.05);
      ctx.lineTo(cx + r * 0.7, cy + r * 0.18);
      ctx.closePath();
      ctx.fill();
    }
  },
  {
    id: 'golden',
    name: 'Aigle d\'Or',
    rarity: 'epic',
    price: 1.99,
    currency: 'real',
    icon: '🦅',
    draw(ctx, x, y, w, h, t) {
      const cx = x + w / 2, cy = y + h / 2;
      const r = Math.min(w, h) * 0.38;
      // Shimmer aura
      const grd2 = ctx.createRadialGradient(cx, cy, r*0.5, cx, cy, r*1.5);
      grd2.addColorStop(0, `rgba(255,215,0,${0.2 + Math.sin(t * 3) * 0.1})`);
      grd2.addColorStop(1, 'rgba(255,215,0,0)');
      ctx.fillStyle = grd2;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
      ctx.fill();
      // Body
      const grd = ctx.createRadialGradient(cx - r*0.2, cy - r*0.2, 0, cx, cy, r);
      grd.addColorStop(0, '#FFF0A0');
      grd.addColorStop(0.4, '#FFD700');
      grd.addColorStop(1, '#B8860B');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      // Crown
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.3, cy - r * 0.8);
      ctx.lineTo(cx - r * 0.1, cy - r * 0.55);
      ctx.lineTo(cx, cy - r * 0.75);
      ctx.lineTo(cx + r * 0.1, cy - r * 0.55);
      ctx.lineTo(cx + r * 0.3, cy - r * 0.8);
      ctx.lineTo(cx + r * 0.3, cy - r * 0.55);
      ctx.lineTo(cx - r * 0.3, cy - r * 0.55);
      ctx.closePath();
      ctx.fill();
      // Wing
      ctx.fillStyle = '#DAA520';
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.2, cy, r * 0.6, r * 0.32, -0.3 + Math.sin(t * 8) * 0.35, 0, Math.PI * 2);
      ctx.fill();
      // Eye
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(cx + r * 0.35, cy - r * 0.2, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8B4513';
      ctx.beginPath();
      ctx.arc(cx + r * 0.42, cy - r * 0.2, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(cx + r * 0.46, cy - r * 0.24, r * 0.05, 0, Math.PI * 2);
      ctx.fill();
      // Beak
      ctx.fillStyle = '#B8860B';
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.65, cy - r * 0.05);
      ctx.lineTo(cx + r * 0.95, cy);
      ctx.lineTo(cx + r * 0.65, cy + r * 0.2);
      ctx.closePath();
      ctx.fill();
    }
  },
  {
    id: 'neon',
    name: 'Cyber',
    rarity: 'epic',
    price: 1.99,
    currency: 'real',
    icon: '🤖',
    draw(ctx, x, y, w, h, t) {
      const cx = x + w / 2, cy = y + h / 2;
      const r = Math.min(w, h) * 0.38;
      const pulse = 0.7 + Math.sin(t * 5) * 0.3;
      // Neon glow
      ctx.shadowBlur = 20;
      ctx.shadowColor = `rgba(0,255,200,${pulse})`;
      // Body
      ctx.fillStyle = '#0a0a1e';
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      // Circuit lines
      ctx.strokeStyle = `rgba(0,255,200,${pulse})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - r*0.5, cy - r*0.2);
      ctx.lineTo(cx - r*0.1, cy - r*0.2);
      ctx.lineTo(cx - r*0.1, cy + r*0.2);
      ctx.lineTo(cx + r*0.3, cy + r*0.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r*0.3, cy);
      ctx.lineTo(cx + r*0.4, cy);
      ctx.stroke();
      // Outline
      ctx.strokeStyle = `rgba(0,255,200,${pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.9, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      // Wing
      ctx.fillStyle = `rgba(0,200,150,0.6)`;
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.2, cy, r * 0.55, r * 0.28, -0.3 + Math.sin(t * 8) * 0.35, 0, Math.PI * 2);
      ctx.fill();
      // Eye - LED
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#00FFCC';
      ctx.fillStyle = '#00FFCC';
      ctx.fillRect(cx + r*0.2, cy - r*0.32, r*0.38, r*0.22);
      ctx.shadowBlur = 0;
      // Scan line
      ctx.fillStyle = `rgba(0,255,200,${0.8 + Math.sin(t * 10) * 0.2})`;
      ctx.fillRect(cx + r*0.2, cy - r*0.32 + (r * 0.22 * ((t * 2) % 1)), r*0.38, 2);
      // Beak
      ctx.fillStyle = '#00FFCC';
      ctx.fillRect(cx + r*0.7, cy - r*0.05, r*0.3, r*0.12);
    }
  },
  {
    id: 'rainbow',
    name: 'Arc-en-Ciel',
    rarity: 'legendary',
    price: 2.99,
    currency: 'real',
    icon: '🌈',
    draw(ctx, x, y, w, h, t) {
      const cx = x + w / 2, cy = y + h / 2;
      const r = Math.min(w, h) * 0.38;
      // Rainbow trail
      const colors = ['#FF0000','#FF7700','#FFFF00','#00FF00','#0088FF','#8800FF'];
      for (let i = 0; i < colors.length; i++) {
        ctx.globalAlpha = 0.15 + (i / colors.length) * 0.1;
        ctx.fillStyle = colors[(Math.floor(t * 3) + i) % colors.length];
        ctx.beginPath();
        ctx.ellipse(cx - (i+1)*r*0.2, cy, r * (1 - i*0.08), r * (0.9 - i*0.08), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // Body with rainbow gradient
      const hue = (t * 60) % 360;
      const grd = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      grd.addColorStop(0, `hsl(${hue}, 100%, 65%)`);
      grd.addColorStop(0.33, `hsl(${hue+120}, 100%, 65%)`);
      grd.addColorStop(0.66, `hsl(${hue+240}, 100%, 65%)`);
      grd.addColorStop(1, `hsl(${hue+360}, 100%, 65%)`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      // Sparkles
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + t * 2;
        const px = cx + Math.cos(a) * r * 1.2;
        const py = cy + Math.sin(a) * r * 1.2;
        ctx.fillStyle = `hsl(${hue + i*90}, 100%, 80%)`;
        ctx.beginPath();
        ctx.arc(px, py, r * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
      // Wing
      ctx.fillStyle = `hsl(${hue+60}, 100%, 70%)`;
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.2, cy, r * 0.55, r * 0.3, -0.3 + Math.sin(t * 8) * 0.35, 0, Math.PI * 2);
      ctx.fill();
      // Eye
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(cx + r * 0.35, cy - r * 0.2, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `hsl(${hue+180}, 100%, 40%)`;
      ctx.beginPath();
      ctx.arc(cx + r * 0.42, cy - r * 0.2, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
      // Beak
      ctx.fillStyle = `hsl(${hue+30}, 100%, 60%)`;
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.7, cy);
      ctx.lineTo(cx + r * 0.95, cy - r * 0.05);
      ctx.lineTo(cx + r * 0.7, cy + r * 0.18);
      ctx.closePath();
      ctx.fill();
    }
  }
];

const BACKGROUNDS = [
  {
    id: 'classic',
    name: 'Ciel Bleu',
    rarity: 'common',
    price: 0,
    currency: 'free',
    icon: '☀️',
    sky: ['#87CEEB', '#B0E0E6'],
    ground: '#8BC34A',
    pipe: '#4CAF50',
    pipeBorder: '#388E3C',
    drawBg(ctx, w, h, offset) {
      // Sky gradient
      const grd = ctx.createLinearGradient(0, 0, 0, h * 0.75);
      grd.addColorStop(0, '#87CEEB');
      grd.addColorStop(1, '#E0F7FA');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h * 0.75);
      // Clouds
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      const clouds = [{x: 80, y: 60, s: 1}, {x: 240, y: 90, s: 0.7}, {x: 340, y: 50, s: 1.2}];
      clouds.forEach(c => {
        const ox = ((c.x - offset * 0.3) % (w + 200) + w + 200) % (w + 200) - 100;
        drawCloud(ctx, ox, c.y, c.s * 40);
      });
      // Ground
      ctx.fillStyle = '#8BC34A';
      ctx.fillRect(0, h * 0.75, w, h * 0.25);
      ctx.fillStyle = '#689F38';
      ctx.fillRect(0, h * 0.75, w, 12);
    },
    pipeColor: '#4CAF50',
    pipeDark: '#388E3C'
  },
  {
    id: 'night',
    name: 'Nuit Urbaine',
    rarity: 'rare',
    price: 0.99,
    currency: 'real',
    icon: '🌃',
    drawBg(ctx, w, h, offset, t) {
      // Dark sky
      const grd = ctx.createLinearGradient(0, 0, 0, h * 0.75);
      grd.addColorStop(0, '#0a0a1e');
      grd.addColorStop(1, '#1a1a3e');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h * 0.75);
      // Stars
      const stars = [];
      for (let i = 0; i < 50; i++) {
        stars.push({x: (i * 137.5) % w, y: (i * 73.3) % (h * 0.5)});
      }
      stars.forEach((s, i) => {
        const brightness = 0.5 + Math.sin(t * 2 + i) * 0.5;
        ctx.fillStyle = `rgba(255,255,255,${brightness})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      });
      // City silhouette
      ctx.fillStyle = '#0d0d20';
      const buildings = [
        {x: 0, w: 40, h: 80}, {x: 45, w: 30, h: 60}, {x: 80, w: 50, h: 100},
        {x: 135, w: 35, h: 70}, {x: 175, w: 45, h: 120}, {x: 225, w: 30, h: 55},
        {x: 260, w: 55, h: 90}, {x: 320, w: 40, h: 75}, {x: 365, w: 35, h: 65}
      ];
      buildings.forEach(b => {
        const ox = ((b.x - offset * 0.15) % (w + 100) + w + 100) % (w + 100) - 50;
        ctx.fillRect(ox, h * 0.75 - b.h, b.w, b.h);
        // Windows
        ctx.fillStyle = `rgba(255,220,100,0.6)`;
        for (let wx = ox + 5; wx < ox + b.w - 5; wx += 10) {
          for (let wy = h * 0.75 - b.h + 8; wy < h * 0.75 - 8; wy += 14) {
            if (Math.random() > 0.3) {
              ctx.fillRect(wx, wy, 5, 7);
            }
          }
        }
        ctx.fillStyle = '#0d0d20';
      });
      // Ground
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, h * 0.75, w, h * 0.25);
      ctx.fillStyle = '#FFD700';
      for (let i = 0; i < 10; i++) {
        const lx = ((i * 100 - offset * 0.5) % (w + 50) + w + 50) % (w + 50) - 25;
        ctx.fillRect(lx, h * 0.76, 50, 4);
      }
    },
    pipeColor: '#2c3e50',
    pipeDark: '#1a252f'
  },
  {
    id: 'underwater',
    name: 'Sous les Mers',
    rarity: 'rare',
    price: 0.99,
    currency: 'real',
    icon: '🐠',
    drawBg(ctx, w, h, offset, t) {
      // Water gradient
      const grd = ctx.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#0066CC');
      grd.addColorStop(1, '#001133');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h);
      // Bubbles
      for (let i = 0; i < 20; i++) {
        const bx = (i * 97 + offset * 0.1) % w;
        const by = ((i * 73 + t * 30 * (0.5 + (i % 3) * 0.3)) % (h * 0.8));
        ctx.strokeStyle = `rgba(150,200,255,${0.3 + (i % 4) * 0.15})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(bx, by, 3 + (i % 5), 0, Math.PI * 2);
        ctx.stroke();
      }
      // Seaweed
      for (let i = 0; i < 8; i++) {
        const sx = ((i * 80 - offset * 0.2) % (w + 60) + w + 60) % (w + 60) - 30;
        ctx.strokeStyle = '#228B22';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(sx, h);
        for (let j = 0; j < 5; j++) {
          const py = h - j * 30;
          ctx.quadraticCurveTo(sx + Math.sin(t * 2 + i + j) * 15, py + 15, sx, py);
        }
        ctx.stroke();
      }
      // Sandy bottom
      ctx.fillStyle = '#C2A06C';
      ctx.fillRect(0, h * 0.82, w, h * 0.18);
      // Corals
      for (let i = 0; i < 6; i++) {
        const cx = ((i * 120 - offset * 0.2) % (w + 80) + w + 80) % (w + 80) - 40;
        drawCoral(ctx, cx, h * 0.82, 20 + i * 5);
      }
    },
    pipeColor: '#1565C0',
    pipeDark: '#0D47A1'
  },
  {
    id: 'space',
    name: 'Galaxie',
    rarity: 'epic',
    price: 1.99,
    currency: 'real',
    icon: '🚀',
    drawBg(ctx, w, h, offset, t) {
      // Deep space
      ctx.fillStyle = '#000008';
      ctx.fillRect(0, 0, w, h);
      // Nebula
      const grd1 = ctx.createRadialGradient(w*0.3, h*0.3, 0, w*0.3, h*0.3, w*0.5);
      grd1.addColorStop(0, 'rgba(80,0,120,0.3)');
      grd1.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd1;
      ctx.fillRect(0, 0, w, h);
      const grd2 = ctx.createRadialGradient(w*0.8, h*0.6, 0, w*0.8, h*0.6, w*0.4);
      grd2.addColorStop(0, 'rgba(0,60,120,0.3)');
      grd2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd2;
      ctx.fillRect(0, 0, w, h);
      // Stars
      for (let i = 0; i < 100; i++) {
        const sx = (i * 137.5 + offset * (0.1 + (i % 5) * 0.05)) % w;
        const sy = (i * 73.3) % h;
        const brightness = 0.4 + Math.sin(t * 2 + i * 0.7) * 0.4;
        const size = 0.5 + (i % 3) * 0.8;
        ctx.fillStyle = `rgba(255,255,255,${brightness})`;
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, Math.PI * 2);
        ctx.fill();
      }
      // Planets
      const planets = [{x: 80, y: 100, r: 25, c1: '#FF6B6B', c2: '#CC2200'},
                        {x: 280, y: 60, r: 15, c1: '#FFD700', c2: '#FF8C00'}];
      planets.forEach(p => {
        const px = ((p.x - offset * 0.05) % (w + 100) + w + 100) % (w + 100) - 50;
        const grd = ctx.createRadialGradient(px - p.r*0.3, p.y - p.r*0.3, 0, px, p.y, p.r);
        grd.addColorStop(0, p.c1);
        grd.addColorStop(1, p.c2);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(px, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
      // Asteroid belt
      ctx.fillStyle = '#888';
      ctx.fillRect(0, h - 30, w, 30);
      for (let i = 0; i < 20; i++) {
        const ax = ((i * 50 - offset * 0.8) % (w + 40) + w + 40) % (w + 40) - 20;
        ctx.fillStyle = '#666';
        ctx.beginPath();
        ctx.ellipse(ax, h - 15, 10 + (i%4)*5, 6 + (i%3)*3, i*0.5, 0, Math.PI*2);
        ctx.fill();
      }
    },
    pipeColor: '#1a0a3e',
    pipeDark: '#0d0520'
  },
  {
    id: 'jungle',
    name: 'Jungle',
    rarity: 'epic',
    price: 1.99,
    currency: 'real',
    icon: '🌿',
    drawBg(ctx, w, h, offset, t) {
      // Sky
      ctx.fillStyle = '#2d5a27';
      ctx.fillRect(0, 0, w, h * 0.75);
      // Trees background layer
      ctx.fillStyle = 'rgba(20,80,20,0.6)';
      for (let i = 0; i < 8; i++) {
        const tx = ((i * 90 - offset * 0.1) % (w + 80) + w + 80) % (w + 80) - 40;
        ctx.beginPath();
        ctx.arc(tx, h * 0.75 - 60, 50, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(tx - 8, h * 0.75 - 60, 16, 80);
      }
      // Light rays
      for (let i = 0; i < 5; i++) {
        const lx = (i * 100 - offset * 0.05) % w;
        const alpha = 0.05 + Math.sin(t + i) * 0.03;
        ctx.fillStyle = `rgba(200,255,150,${alpha})`;
        ctx.beginPath();
        ctx.moveTo(lx - 20, 0);
        ctx.lineTo(lx + 20, 0);
        ctx.lineTo(lx + 60, h * 0.75);
        ctx.lineTo(lx - 60, h * 0.75);
        ctx.closePath();
        ctx.fill();
      }
      // Leaves overlay
      for (let i = 0; i < 12; i++) {
        const lx = ((i * 70 - offset * 0.4) % (w + 60) + w + 60) % (w + 60) - 30;
        const ly = (i * 43) % (h * 0.5);
        ctx.fillStyle = `rgba(30,120,30,0.8)`;
        ctx.beginPath();
        ctx.ellipse(lx, ly, 30 + (i%3)*10, 15, Math.sin(t + i) * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      // Ground
      ctx.fillStyle = '#5D4037';
      ctx.fillRect(0, h * 0.75, w, h * 0.25);
      ctx.fillStyle = '#3E2723';
      ctx.fillRect(0, h * 0.75, w, 10);
      // Roots
      for (let i = 0; i < 5; i++) {
        const rx = ((i * 120 - offset * 0.3) % (w + 60) + w + 60) % (w + 60) - 30;
        ctx.strokeStyle = '#3E2723';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(rx, h * 0.75);
        ctx.bezierCurveTo(rx - 20, h * 0.75 + 15, rx + 20, h * 0.75 + 20, rx + 10, h * 0.75 + 35);
        ctx.stroke();
      }
    },
    pipeColor: '#1B5E20',
    pipeDark: '#0a3d12'
  },
  {
    id: 'volcano',
    name: 'Volcan',
    rarity: 'legendary',
    price: 2.99,
    currency: 'real',
    icon: '🌋',
    drawBg(ctx, w, h, offset, t) {
      // Lava sky
      const grd = ctx.createLinearGradient(0, 0, 0, h * 0.75);
      grd.addColorStop(0, '#1a0500');
      grd.addColorStop(0.5, '#3d0c00');
      grd.addColorStop(1, '#7a1500');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h * 0.75);
      // Ash particles
      for (let i = 0; i < 30; i++) {
        const ax = ((i * 87 + offset * (0.3 + (i%4)*0.1)) % (w+20) + w+20) % (w+20) - 10;
        const ay = ((i * 53 + t * 20 * (0.5+(i%3)*0.2)) % (h * 0.7));
        ctx.fillStyle = `rgba(60,30,20,${0.3 + (i%5)*0.1})`;
        ctx.beginPath();
        ctx.arc(ax, ay, 2 + (i%4), 0, Math.PI * 2);
        ctx.fill();
      }
      // Volcano silhouettes
      const volcs = [{x: 50, w: 200, h: 150}, {x: 250, w: 160, h: 120}];
      volcs.forEach(v => {
        const vx = ((v.x - offset * 0.08) % (w + v.w + 50) + w + v.w + 50) % (w + v.w + 50) - v.w/2;
        ctx.fillStyle = '#1a0a00';
        ctx.beginPath();
        ctx.moveTo(vx - v.w/2, h * 0.75);
        ctx.lineTo(vx, h * 0.75 - v.h);
        ctx.lineTo(vx + v.w/2, h * 0.75);
        ctx.closePath();
        ctx.fill();
        // Lava glow from crater
        const grd2 = ctx.createRadialGradient(vx, h * 0.75 - v.h, 0, vx, h * 0.75 - v.h, 30);
        grd2.addColorStop(0, `rgba(255,100,0,${0.6 + Math.sin(t * 3 + v.x) * 0.2})`);
        grd2.addColorStop(1, 'rgba(255,0,0,0)');
        ctx.fillStyle = grd2;
        ctx.beginPath();
        ctx.arc(vx, h * 0.75 - v.h, 30, 0, Math.PI * 2);
        ctx.fill();
      });
      // Lava ground
      const grd3 = ctx.createLinearGradient(0, h * 0.75, 0, h);
      grd3.addColorStop(0, '#FF4500');
      grd3.addColorStop(0.2, '#CC2200');
      grd3.addColorStop(1, '#330000');
      ctx.fillStyle = grd3;
      ctx.fillRect(0, h * 0.75, w, h * 0.25);
      // Lava flow animation
      for (let i = 0; i < 6; i++) {
        const lx = (i * w/6 + offset * 0.5) % w;
        const alpha = 0.4 + Math.sin(t * 2 + i) * 0.2;
        ctx.fillStyle = `rgba(255,100,0,${alpha})`;
        ctx.beginPath();
        ctx.ellipse(lx, h * 0.76, 40, 8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    pipeColor: '#4a0a00',
    pipeDark: '#2a0500'
  }
];

// Helper drawing functions
function drawCloud(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
  ctx.arc(x + r * 0.8, y + r * 0.2, r * 0.6, 0, Math.PI * 2);
  ctx.arc(x - r * 0.6, y + r * 0.2, r * 0.5, 0, Math.PI * 2);
  ctx.arc(x + r * 1.5, y + r * 0.5, r * 0.55, 0, Math.PI * 2);
  ctx.arc(x + r * 0.2, y + r * 0.6, r * 0.7, 0, Math.PI * 2);
  ctx.fill();
}

function drawCoral(ctx, x, y, size) {
  const colors = ['#FF6B6B', '#FF8E53', '#FF6BB5'];
  ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x - size*0.5, y - size, x - size*0.8, y - size*0.5, x - size, y - size*1.5);
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(x - size * 0.3 * i, y - size * (0.5 + i * 0.4), size * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
}
