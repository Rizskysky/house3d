// Procedural material textures, drawn once on a canvas and cached.
// Every texture is a light grey pattern that multiplies the material color, so house.json
// keeps control of the color and only names the pattern: "tex": "woodFloor", "scale": 1.2 (m per tile).
import * as THREE from 'three';

const SIZE = 512;
const cache = new Map();

export function patternTexture(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const draw = PATTERNS[kind];
  if (!draw) return null;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d');
  const rnd = rng(hash(kind));
  draw(ctx, rnd);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  const bump = new THREE.CanvasTexture(c);          // same picture as a height map: seams and grout read as grooves
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  // average brightness in linear light, so materials can compensate and keep their listed color
  const px = ctx.getImageData(0, 0, SIZE, SIZE).data;
  let sum = 0, n = 0;
  for (let i = 0; i < px.length; i += 4 * 37) { sum += Math.pow(px[i] / 255, 2.2); n++; }
  const out = { map, bump, mean: Math.max(sum / n, 0.3) };
  cache.set(kind, out);
  return out;
}

// ---------------------------------------------------------------------------
const PATTERNS = {
  // floor boards 15 cm wide, staggered end joints
  woodFloor(ctx, r) {
    base(ctx, 236);
    const rows = 8, h = SIZE / rows;
    for (let i = 0; i < rows; i++) {
      let x = -r() * SIZE;
      while (x < SIZE) {
        const len = SIZE * (0.45 + r() * 0.5);
        const tone = 214 + r() * 34;
        grainBlock(ctx, r, x, i * h, len, h, tone);
        x += len;
        line(ctx, x, i * h, x, (i + 1) * h, 'rgba(70,50,30,0.35)', 2);
      }
      line(ctx, 0, i * h, SIZE, i * h, 'rgba(70,50,30,0.45)', 2);
    }
  },
  // furniture / joinery: continuous grain, no seams
  wood(ctx, r) {
    base(ctx, 240);
    grainBlock(ctx, r, 0, 0, SIZE, SIZE, 236, 90);
    grainBlock(ctx, r, SIZE, 0, -SIZE, SIZE, 236, 0);
  },
  plaster(ctx, r) {
    base(ctx, 246);
    blotches(ctx, r, 120, 30, 90, 8, 0.025);
    speckle(ctx, r, 9000, 1, 0.05);
  },
  concrete(ctx, r) {
    base(ctx, 238);
    blotches(ctx, r, 120, 30, 100, 30, 0.05);
    speckle(ctx, r, 2600, 1.6, 0.18);
    for (let i = 0; i < 220; i++) dot(ctx, r() * SIZE, r() * SIZE, 1 + r() * 1.6, 'rgba(60,60,60,0.35)');
  },
  // floor tile 60 × 60 cm with thin grout
  tile(ctx, r) {
    base(ctx, 244);
    const n = 2, s = SIZE / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      ctx.fillStyle = grey(236 + r() * 14); ctx.fillRect(i * s, j * s, s, s);
      blotchesIn(ctx, r, i * s, j * s, s, 14, 0.05);
    }
    grid(ctx, n, n, 'rgba(120,110,95,0.55)', 3);
  },
  terrazzo(ctx, r) {
    base(ctx, 242);
    for (let i = 0; i < 2600; i++) {
      const g = 120 + r() * 120;
      dot(ctx, r() * SIZE, r() * SIZE, 1 + r() * r() * 6, `rgba(${g},${g - 4},${g - 10},${0.5 + r() * 0.4})`);
    }
    grid(ctx, 2, 2, 'rgba(150,150,145,0.4)', 2);
  },
  // natural stone slabs 60 × 30 cm, running bond
  stone(ctx, r) {
    base(ctx, 236);
    const rows = 4, h = SIZE / rows, w = SIZE / 2;
    for (let i = 0; i < rows; i++) {
      const off = i % 2 ? w / 2 : 0;
      for (let x = -off; x < SIZE; x += w) {
        ctx.fillStyle = grey(212 + r() * 40); ctx.fillRect(x, i * h, w, h);
        blotchesIn(ctx, r, x, i * h, w, 18, 0.1);
        line(ctx, x, i * h, x, (i + 1) * h, 'rgba(60,60,55,0.55)', 3);
      }
      line(ctx, 0, i * h, SIZE, i * h, 'rgba(60,60,55,0.55)', 3);
    }
    speckle(ctx, r, 6000, 1, 0.12);
  },
  // andesite wall cladding: horizontal strips of split stone
  andesite(ctx, r) {
    base(ctx, 228);
    let y = 0;
    while (y < SIZE) {
      const h = 18 + r() * 34;
      let x = 0;
      while (x < SIZE) {
        const w = 60 + r() * 120;
        ctx.fillStyle = grey(190 + r() * 60); ctx.fillRect(x, y, w, h);
        line(ctx, x, y, x, y + h, 'rgba(30,30,30,0.6)', 2);
        x += w;
      }
      line(ctx, 0, y, SIZE, y, 'rgba(30,30,30,0.6)', 2);
      y += h;
    }
    speckle(ctx, r, 7000, 1.2, 0.2);
  },
  grass(ctx, r) {
    base(ctx, 226);
    blotches(ctx, r, 90, 40, 120, 40, 0.12);
    for (let i = 0; i < 16000; i++) {
      const x = r() * SIZE, y = r() * SIZE, l = 3 + r() * 7, a = -Math.PI / 2 + (r() - 0.5) * 0.9;
      const g = 170 + r() * 85;
      line(ctx, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, `rgba(${g},${g},${g},0.28)`, 1.2);
    }
  },
  gravel(ctx, r) {
    base(ctx, 220);
    for (let i = 0; i < 5200; i++) {
      const g = 190 + r() * 65;
      ellipse(ctx, r() * SIZE, r() * SIZE, 2 + r() * 4, 1.5 + r() * 3, r() * Math.PI, grey(g));
    }
  },
  asphalt(ctx, r) {
    base(ctx, 232);
    blotches(ctx, r, 60, 40, 110, 25, 0.035);
    speckle(ctx, r, 22000, 1.2, 0.22);
  },
  fabric(ctx, r) {
    base(ctx, 240);
    for (let y = 0; y < SIZE; y += 3) line(ctx, 0, y, SIZE, y, `rgba(120,110,95,${0.08 + r() * 0.1})`, 1);
    for (let x = 0; x < SIZE; x += 3) line(ctx, x, 0, x, SIZE, `rgba(120,110,95,${0.06 + r() * 0.08})`, 1);
    blotches(ctx, r, 40, 40, 120, 10, 0.04);
  },
  jute(ctx, r) {
    base(ctx, 236);
    const s = 16;
    for (let y = 0; y < SIZE; y += s) for (let x = 0; x < SIZE; x += s) {
      const odd = ((x + y) / s) % 2;
      ctx.fillStyle = grey(odd ? 210 + r() * 20 : 240 + r() * 12);
      ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
    }
  },
  rattan(ctx, r) {
    base(ctx, 238);
    const s = 24;
    for (let i = -SIZE; i < SIZE * 2; i += s) {
      line(ctx, i, 0, i + SIZE, SIZE, 'rgba(90,60,30,0.45)', 6);
      line(ctx, i, SIZE, i + SIZE, 0, 'rgba(90,60,30,0.3)', 5);
    }
    for (let k = 0; k < 2000; k++) dot(ctx, r() * SIZE, r() * SIZE, 2.5, 'rgba(60,40,20,0.35)');
  },
  // standing-seam metal roof, seams every 40 cm (tile = 1.6 m → 4 seams)
  seam(ctx, r) {
    base(ctx, 236);
    blotches(ctx, r, 30, 80, 200, 8, 0.05);
    for (let i = 0; i < 4; i++) {
      const y = (i + 0.5) * SIZE / 4;
      line(ctx, 0, y - 3, SIZE, y - 3, 'rgba(255,255,255,0.35)', 2);
      line(ctx, 0, y, SIZE, y, 'rgba(0,0,0,0.5)', 3);
    }
  },
  // breeze-block face texture (cement)
  roster(ctx, r) {
    base(ctx, 242);
    speckle(ctx, r, 9000, 1.2, 0.1);
  },
};

// ---------------------------------------------------------------------------
function grainBlock(ctx, r, x, y, w, h, tone, angle = 0) {
  ctx.save();
  ctx.beginPath(); ctx.rect(Math.min(x, x + w), y, Math.abs(w), h); ctx.clip();
  ctx.fillStyle = grey(tone); ctx.fillRect(Math.min(x, x + w), y, Math.abs(w), h);
  for (let b = 0; b < 3; b++) {
    const by = y + r() * h, bh = h * (0.15 + r() * 0.35);
    ctx.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + r() * 0.05})`;
    ctx.fillRect(Math.min(x, x + w), by, Math.abs(w), bh);
  }
  const lines = Math.max(4, Math.round(h / 7));
  const phase = r() * 100, wav = 0.004 + r() * 0.01;
  for (let k = 0; k < lines; k++) {
    const yy = y + (k + r()) * h / lines;
    const a = 0.03 + r() * 0.09;
    ctx.strokeStyle = `rgba(80,55,30,${a})`;
    ctx.lineWidth = 0.6 + r() * 1.4;
    ctx.beginPath();
    for (let xx = Math.min(x, x + w); xx <= Math.max(x, x + w); xx += 8) {
      const yo = Math.sin(xx * wav + phase + k * 0.7) * (1.5 + r() * 0.5) + Math.sin(xx * 0.05 + k) * 0.6;
      xx === Math.min(x, x + w) ? ctx.moveTo(xx, yy + yo) : ctx.lineTo(xx, yy + yo);
    }
    ctx.stroke();
  }
  if (r() < 0.35) {                                    // an occasional knot
    const kx = Math.min(x, x + w) + r() * Math.abs(w), ky = y + r() * h;
    ellipse(ctx, kx, ky, 6 + r() * 6, 2 + r() * 2, 0, 'rgba(90,60,30,0.35)');
  }
  ctx.restore();
}
function base(ctx, g) { ctx.fillStyle = grey(g); ctx.fillRect(0, 0, SIZE, SIZE); }
function grey(g) { g = Math.max(0, Math.min(255, Math.round(g))); return `rgb(${g},${g},${g})`; }
function line(ctx, x0, y0, x1, y1, color, w) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}
function dot(ctx, x, y, rad, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill(); }
function ellipse(ctx, x, y, rx, ry, rot, color) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fill();
}
function grid(ctx, nx, ny, color, w) {
  for (let i = 0; i <= nx; i++) line(ctx, i * SIZE / nx, 0, i * SIZE / nx, SIZE, color, w);
  for (let j = 0; j <= ny; j++) line(ctx, 0, j * SIZE / ny, SIZE, j * SIZE / ny, color, w);
}
function speckle(ctx, r, n, size, alpha) {
  for (let i = 0; i < n; i++) {
    const g = r() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${g},${g},${g},${alpha * r()})`;
    ctx.fillRect(r() * SIZE, r() * SIZE, size, size);
  }
}
// soft cloudy variation, wrapped so the texture tiles seamlessly
function blotches(ctx, r, n, rMin, rMax, spread, alpha) {
  for (let i = 0; i < n; i++) {
    const x = r() * SIZE, y = r() * SIZE, rad = rMin + r() * (rMax - rMin);
    const g = r() < 0.5 ? 255 - spread : 255;
    const dark = r() < 0.5;
    for (const dx of [-SIZE, 0, SIZE]) for (const dy of [-SIZE, 0, SIZE]) {
      const grd = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
      const c = dark ? `rgba(0,0,0,${alpha * r()})` : `rgba(${g},${g},${g},${alpha * r()})`;
      grd.addColorStop(0, c); grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd; ctx.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
    }
  }
}
function blotchesIn(ctx, r, x, y, s, n, alpha) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, s, s); ctx.clip();
  for (let i = 0; i < n; i++) {
    const cx = x + r() * s, cy = y + r() * s, rad = 20 + r() * 60;
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    grd.addColorStop(0, `rgba(0,0,0,${alpha * r()})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd; ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
  ctx.restore();
}
function hash(s) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
function rng(seed) {
  let a = seed || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
