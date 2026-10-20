// Parametric furniture, fixtures, cars and plants. Every item is sized from its plan rect in house.json,
// so moving or resizing a piece of furniture is still a change of numbers in one place.
//
// Local frame of an item: x across its width (−W/2…W/2), z through its depth with the FRONT at +D/2,
// y up from its base. `face` in the data says which way the front points in the plan: +y, -y, +x, -x.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const FACE_ROT = { '+y': 0, '-y': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2 };

export function buildItem(item, baseZ, M, meterUV) {
  const [x0, y0, x1, y1] = norm(item.rect);
  const face = item.face || '+y';
  const side = face === '+x' || face === '-x';
  const W = side ? y1 - y0 : x1 - x0, D = side ? x1 - x0 : y1 - y0;
  const fn = BUILDERS[item.type];
  if (!fn) { console.warn('jenis furnitur tidak dikenal:', item.type); return null; }
  const g = new THREE.Group();
  fn(kit(g, M, meterUV), W, D, item.h ?? 0.75, item);
  g.position.set((x0 + x1) / 2, baseZ + (item.z || 0), (y0 + y1) / 2);
  g.rotation.y = FACE_ROT[face] ?? 0;
  return g;
}

// ---------------------------------------------------------------------------
// building blocks, all in the item's local frame
function kit(g, M, meterUV) {
  const add = (geo, mat, x, y, z) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    if (mat.map && meterUV) meterUV(geo, mesh.position);
    mesh.castShadow = !mat.transparent; mesh.receiveShadow = true;
    g.add(mesh); return mesh;
  };
  const mat = (m) => (typeof m === 'string' ? M(m) : m);
  return {
    M: mat,
    // box from extents [xa,xb] [ya,yb] [za,zb]; r > 0 rounds the edges
    box(m, [xa, xb], [ya, yb], [za, zb], r = 0) {
      const w = Math.max(Math.abs(xb - xa), 0.002), h = Math.max(Math.abs(yb - ya), 0.002), d = Math.max(Math.abs(zb - za), 0.002);
      const rr = Math.min(r, w / 2 - 0.0005, h / 2 - 0.0005, d / 2 - 0.0005);
      const geo = rr > 0.001 ? new RoundedBoxGeometry(w, h, d, 2, rr) : new THREE.BoxGeometry(w, h, d);
      return add(geo, mat(m), (xa + xb) / 2, (ya + yb) / 2, (za + zb) / 2);
    },
    // vertical cylinder at (x, z) from ya to yb; rb = bottom radius
    cyl(m, x, z, ya, yb, r, rb = r, seg = 20) {
      return add(new THREE.CylinderGeometry(r, rb, Math.max(yb - ya, 0.002), seg), mat(m), x, (ya + yb) / 2, z);
    },
    // horizontal rod along x
    rodX(m, xa, xb, y, z, r) {
      const mesh = add(new THREE.CylinderGeometry(r, r, Math.abs(xb - xa), 10), mat(m), (xa + xb) / 2, y, z);
      mesh.rotation.z = Math.PI / 2; return mesh;
    },
    rodZ(m, x, y, za, zb, r) {
      const mesh = add(new THREE.CylinderGeometry(r, r, Math.abs(zb - za), 10), mat(m), x, y, (za + zb) / 2);
      mesh.rotation.x = Math.PI / 2; return mesh;
    },
    ball(m, x, y, z, r, sx = 1, sy = 1, sz = 1, detail = 1) {
      const mesh = add(new THREE.IcosahedronGeometry(r, detail), mat(m), x, y, z);
      mesh.scale.set(sx, sy, sz); return mesh;
    },
    torus(m, x, y, z, r, tube, rotX = Math.PI / 2) {
      const mesh = add(new THREE.TorusGeometry(r, tube, 8, 28), mat(m), x, y, z);
      mesh.rotation.x = rotX; return mesh;
    },
    // extruded 2D shape (drawn in the x/y plane), extruded toward +z from z0
    extrude(m, shape, depth, z0, bevel = 0) {
      const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 18 });
      return add(geo, mat(m), 0, 0, z0);
    },
    group: g,
  };
}

// a run of cabinet doors (or drawers) on the front face
function fronts(k, m, W, D, ya, yb, n, { handle = 'v', gap = 0.004, inset = 0.003, proud = 0.018, handles = true } = {}) {
  const dw = (W - inset * 2) / n;
  for (let i = 0; i < n; i++) {
    const xa = -W / 2 + inset + i * dw + gap, xb = xa + dw - gap * 2;
    k.box(m, [xa, xb], [ya + gap, yb - gap], [D / 2, D / 2 + proud], 0.003);
    if (!handles) continue;
    if (handle === 'v') {
      const hx = i % 2 === 0 ? xb - 0.035 : xa + 0.035;
      const hy = Math.min(yb - 0.25, ya + 1.05);
      k.box('black', [hx - 0.006, hx + 0.006], [hy - 0.16, hy + 0.16], [D / 2 + proud, D / 2 + proud + 0.022], 0.003);
    } else if (handle === 'h') {
      k.box('black', [xa + dw * 0.3, xb - dw * 0.3], [yb - 0.045, yb - 0.033], [D / 2 + proud, D / 2 + proud + 0.022], 0.003);
    } else if (handle === 'hb') {                                     // wall cabinets: pull at the bottom edge
      k.box('black', [xa + dw * 0.3, xb - dw * 0.3], [ya + 0.033, ya + 0.045], [D / 2 + proud, D / 2 + proud + 0.022], 0.003);
    }
  }
}

function legs4(k, m, W, D, ya, yb, inset, r, rb = r, round = true) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (W / 2 - inset), z = sz * (D / 2 - inset);
    if (round) k.cyl(m, x, z, ya, yb, r, rb, 12);
    else k.box(m, [x - r, x + r], [ya, yb], [z - r, z + r]);
  }
}

// ---------------------------------------------------------------------------
const BUILDERS = {
  bed(k, W, D, h, it) {
    const frame = it.mat || 'oak';
    legs4(k, frame, W - 0.04, D - 0.04, 0, 0.12, 0.05, 0.025, 0.02);
    k.box(frame, [-W / 2, W / 2], [0.12, 0.3], [-D / 2 + 0.05, D / 2], 0.012);                 // platform
    k.box(it.headboard || frame, [-W / 2, W / 2], [0.12, it.headH || 1.0], [-D / 2, -D / 2 + 0.06], 0.015);
    k.box('white', [-W / 2 + 0.03, W / 2 - 0.03], [0.3, 0.52], [-D / 2 + 0.08, D / 2 - 0.03], 0.05);  // mattress
    k.box(it.duvet || 'duvet', [-W / 2 + 0.01, W / 2 - 0.01], [0.48, 0.56], [-D / 2 + 0.62, D / 2 - 0.01], 0.035);
    k.box(it.duvet || 'duvet', [-W / 2 + 0.01, W / 2 - 0.01], [0.5, 0.6], [-D / 2 + 0.55, -D / 2 + 0.78], 0.04); // turn-down
    const n = W > 1.3 ? 2 : 1, pw = (W - 0.16) / n;
    for (let i = 0; i < n; i++) {
      const xa = -W / 2 + 0.08 + i * pw + 0.03;
      k.box('pillow', [xa, xa + pw - 0.06], [0.5, 0.65], [-D / 2 + 0.1, -D / 2 + 0.47], 0.06);
    }
    if (it.throw !== false) k.box(it.throw || 'sage', [-W / 2 + 0.005, W / 2 - 0.005], [0.555, 0.575], [D / 2 - 0.5, D / 2 - 0.18], 0.008);
  },

  wardrobe(k, W, D, h, it) {
    const m = it.mat || 'oak';
    k.box('charcoal', [-W / 2 + 0.03, W / 2 - 0.03], [0, 0.08], [-D / 2, D / 2 - 0.05]);         // recessed plinth
    k.box(m, [-W / 2, W / 2], [0.08, h], [-D / 2, D / 2 - 0.02]);
    fronts(k, m, W, D - 0.04, 0.08, h, it.doors || Math.max(1, Math.round(W / 0.5)), { handle: 'v' });
  },

  // walk-in hanging rail: open frame, rail with clothes, a shelf above, shoes below
  openWardrobe(k, W, D, h, it) {
    const m = it.mat || 'oak';
    for (const x of [-W / 2 + 0.01, W / 2 - 0.01]) k.box(m, [x - 0.01, x + 0.01], [0, h], [-D / 2, D / 2]);
    k.box(m, [-W / 2, W / 2], [h - 0.02, h], [-D / 2, D / 2]);
    k.box(m, [-W / 2, W / 2], [1.75, 1.77], [-D / 2, D / 2]);
    k.box(m, [-W / 2, W / 2], [0.2, 0.22], [-D / 2, D / 2]);
    k.box(m, [-W / 2, W / 2], [0, 0.04], [-D / 2, D / 2]);
    k.rodX('steel', -W / 2 + 0.02, W / 2 - 0.02, 1.68, 0, 0.012);
    const cols = ['cloth1', 'cloth2', 'cloth3', 'linen', 'cloth1', 'cloth3'];
    let x = -W / 2 + 0.06, i = 0;
    while (x < W / 2 - 0.06) {
      const long = i % 3 === 1, t = 0.04 + ((i * 7) % 3) * 0.015;
      k.box(cols[i % cols.length], [x, x + t], [long ? 0.6 : 0.95, 1.64], [-D / 2 + 0.08, D / 2 - 0.08], 0.01);
      x += t + 0.025; i++;
    }
    for (let s = 0; s < Math.floor((W - 0.1) / 0.3); s++) {           // shoes on the bottom shelf
      const sx = -W / 2 + 0.08 + s * 0.3;
      k.box(s % 2 ? 'charcoal' : 'white', [sx, sx + 0.1], [0.22, 0.3], [-0.12, 0.15], 0.03);
      k.box(s % 2 ? 'charcoal' : 'white', [sx + 0.12, sx + 0.22], [0.22, 0.3], [-0.12, 0.15], 0.03);
    }
    for (let b = 0; b < 3; b++) k.box(['cloth2', 'linen', 'sage'][b], [-W / 2 + 0.06 + b * 0.16, -W / 2 + 0.2 + b * 0.16], [1.77, 1.9], [-D / 2 + 0.06, D / 2 - 0.1], 0.02);
  },

  // base cabinets with worktop; doors sized ~60 cm; optional `sinkAt` / `cookAt` (m from the left end)
  kitchen(k, W, D, h, it) {
    const m = it.mat || 'oak', top = it.top || 'white';
    k.box('charcoal', [-W / 2, W / 2], [0, 0.1], [-D / 2, D / 2 - 0.06]);
    k.box(m, [-W / 2, W / 2], [0.1, h - 0.04], [-D / 2, D / 2 - 0.02]);
    const n = it.doors || Math.max(1, Math.round(W / 0.6));
    fronts(k, m, W, D - 0.04, 0.1, h - 0.04, n, { handle: 'h' });
    k.box(top, [-W / 2, W / 2], [h - 0.04, h], [-D / 2, D / 2 + 0.02], 0.004);
    if (it.backsplash) k.box(it.backsplash, [-W / 2, W / 2], [h, h + 0.55], [-D / 2, -D / 2 + 0.012]);
  },

  // wall-hung upper cabinet
  wallCabinet(k, W, D, h, it) {
    const m = it.mat || 'oak';
    k.box(m, [-W / 2, W / 2], [0, h], [-D / 2, D / 2 - 0.02]);
    fronts(k, m, W, D - 0.04, 0, h, it.doors || Math.max(1, Math.round(W / 0.45)), { handle: 'hb' });
  },

  lowCabinet(k, W, D, h, it) {
    const m = it.mat || 'oak';
    legs4(k, 'black', W, D, 0, 0.12, 0.05, 0.012, 0.012);
    k.box(m, [-W / 2, W / 2], [0.12, h], [-D / 2, D / 2 - 0.02], 0.006);
    fronts(k, m, W, D - 0.04, 0.12, h, it.doors || Math.max(1, Math.round(W / 0.45)), { handle: 'h' });
  },

  // floating TV console with slatted fronts
  tvConsole(k, W, D, h, it) {
    const m = it.mat || 'oak', y0 = it.lift ?? 0.18;
    k.box(m, [-W / 2, W / 2], [y0, h], [-D / 2, D / 2 - 0.02], 0.006);
    const n = it.doors || 3, dw = W / n;
    for (let i = 0; i < n; i++) {
      for (let x = -W / 2 + i * dw + 0.02; x < -W / 2 + (i + 1) * dw - 0.03; x += 0.035) {
        k.box(m, [x, x + 0.022], [y0 + 0.02, h - 0.02], [D / 2 - 0.02, D / 2 + 0.006]);
      }
    }
    k.box('plant', [W / 2 - 0.3, W / 2 - 0.14], [h, h + 0.02], [-0.08, 0.08]);                 // a small plant on top
    k.cyl('clay', W / 2 - 0.22, 0, h, h + 0.14, 0.06, 0.05);
    k.ball('leaf', W / 2 - 0.22, h + 0.24, 0, 0.11, 1, 1.1, 1);
    k.box('books', [-W / 2 + 0.2, -W / 2 + 0.45], [h, h + 0.05], [-0.1, 0.12], 0.004);
  },

  tv(k, W, D, h) {
    k.box('screen', [-W / 2, W / 2], [0, h], [-D / 2, D / 2], 0.006);
    k.box('black', [-W / 2 + 0.3, W / 2 - 0.3], [0.2, h - 0.2], [-D / 2 - 0.02, -D / 2], 0);    // wall bracket
  },

  sofa(k, W, D, h, it) {
    const m = it.mat || 'linen', arm = 0.16, seatTop = 0.45;
    for (const x of [-W / 2 + 0.08, W / 2 - 0.08]) for (const z of [-D / 2 + 0.08, D / 2 - 0.08]) k.cyl('teak', x, z, 0, 0.1, 0.025, 0.018, 10);
    k.box(m, [-W / 2, W / 2], [0.1, 0.32], [-D / 2, D / 2], 0.04);                              // base
    for (const s of [-1, 1]) k.box(m, [s * W / 2 - (s > 0 ? arm : 0), s * W / 2 + (s < 0 ? arm : 0)], [0.1, 0.62], [-D / 2, D / 2], 0.06);
    k.box(m, [-W / 2 + arm - 0.02, W / 2 - arm + 0.02], [0.1, 0.78], [-D / 2, -D / 2 + 0.16], 0.06); // back frame
    const n = it.seats || 3, sw = (W - 2 * arm) / n;
    for (let i = 0; i < n; i++) {
      const xa = -W / 2 + arm + i * sw;
      k.box(m, [xa + 0.008, xa + sw - 0.008], [0.32, seatTop + 0.02], [-D / 2 + 0.16, D / 2 - 0.01], 0.06);     // seat cushion
      const back = k.box(m, [xa + 0.01, xa + sw - 0.01], [seatTop, 0.84], [-D / 2 + 0.12, -D / 2 + 0.3], 0.08); // back cushion
      back.rotation.x = -0.12;
    }
    k.box('sage', [-W / 2 + arm + 0.06, -W / 2 + arm + 0.46], [seatTop, seatTop + 0.36], [-D / 2 + 0.3, -D / 2 + 0.42], 0.07).rotation.z = 0.12;
    k.box('clay', [W / 2 - arm - 0.46, W / 2 - arm - 0.06], [seatTop, seatTop + 0.34], [-D / 2 + 0.3, -D / 2 + 0.42], 0.07).rotation.z = -0.12;
  },

  coffeeTable(k, W, D, h, it) {
    const m = it.mat || 'teak';
    k.box(m, [-W / 2, W / 2], [h - 0.035, h], [-D / 2, D / 2], 0.015);
    k.box(m, [-W / 2 + 0.06, W / 2 - 0.06], [0.1, 0.12], [-D / 2 + 0.06, D / 2 - 0.06], 0.006);
    legs4(k, m, W, D, 0, h - 0.035, 0.05, 0.022, 0.022, false);
    k.box('books', [-0.15, 0.1], [h, h + 0.04], [-0.12, 0.08], 0.004);
    k.cyl('ceramic', 0.18, 0.12, h, h + 0.08, 0.05, 0.04);
  },

  diningTable(k, W, D, h, it) {
    const m = it.mat || 'teak';
    k.box(m, [-W / 2, W / 2], [h - 0.035, h], [-D / 2, D / 2], 0.01);
    k.box(m, [-W / 2 + 0.07, W / 2 - 0.07], [h - 0.11, h - 0.035], [-D / 2 + 0.07, -D / 2 + 0.09]);
    k.box(m, [-W / 2 + 0.07, W / 2 - 0.07], [h - 0.11, h - 0.035], [D / 2 - 0.09, D / 2 - 0.07]);
    k.box(m, [-W / 2 + 0.07, -W / 2 + 0.09], [h - 0.11, h - 0.035], [-D / 2 + 0.07, D / 2 - 0.07]);
    k.box(m, [W / 2 - 0.09, W / 2 - 0.07], [h - 0.11, h - 0.035], [-D / 2 + 0.07, D / 2 - 0.07]);
    legs4(k, m, W, D, 0, h - 0.035, 0.07, 0.026, 0.018);
    k.cyl('ceramic', 0, 0, h, h + 0.12, 0.055, 0.04);                                             // vase with a sprig
    k.ball('leafLight', 0, h + 0.2, 0, 0.07, 1, 1.4, 1, 0);
  },

  diningChair(k, W, D, h, it) {
    const frame = it.frame || 'teak', seat = 0.45;
    legs4(k, frame, W, D, 0, seat - 0.02, 0.025, 0.016, 0.013);
    k.box(frame, [-W / 2 + 0.01, W / 2 - 0.01], [seat - 0.04, seat], [-D / 2 + 0.01, D / 2 - 0.01], 0.008);
    k.box(it.mat || 'rattan', [-W / 2 + 0.03, W / 2 - 0.03], [seat, seat + 0.012], [-D / 2 + 0.03, D / 2 - 0.03]);
    for (const x of [-W / 2 + 0.025, W / 2 - 0.025]) k.cyl(frame, x, -D / 2 + 0.025, seat, 0.84, 0.015, 0.016, 10);
    k.box(frame, [-W / 2 + 0.01, W / 2 - 0.01], [0.8, 0.84], [-D / 2 + 0.01, -D / 2 + 0.045], 0.008);
    k.box(it.mat || 'rattan', [-W / 2 + 0.04, W / 2 - 0.04], [0.56, 0.79], [-D / 2 + 0.018, -D / 2 + 0.03]);
  },

  desk(k, W, D, h, it) {
    const m = it.mat || 'oak';
    k.box(m, [-W / 2, W / 2], [h - 0.03, h], [-D / 2, D / 2], 0.006);
    legs4(k, it.legs || 'black', W, D, 0, h - 0.03, 0.04, 0.015, 0.015, false);
    k.box(m, [-W / 2 + 0.05, W / 2 - 0.05], [h - 0.3, h - 0.03], [-D / 2 + 0.02, -D / 2 + 0.04]);
    if (W > 1.1) {                                                     // drawer pedestal
      k.box(m, [W / 2 - 0.45, W / 2 - 0.05], [h - 0.17, h - 0.03], [-D / 2 + 0.05, D / 2 - 0.04]);
      k.box('black', [W / 2 - 0.3, W / 2 - 0.2], [h - 0.1, h - 0.09], [D / 2 - 0.04, D / 2 - 0.025]);
    }
    if (it.lamp !== false) {
      k.cyl('black', -W / 2 + 0.15, -D / 2 + 0.12, h, h + 0.02, 0.06);
      k.cyl('black', -W / 2 + 0.15, -D / 2 + 0.12, h + 0.02, h + 0.38, 0.008);
      k.cyl('linen', -W / 2 + 0.15, -D / 2 + 0.12, h + 0.32, h + 0.45, 0.06, 0.1);
    }
    k.box('books', [0, 0.22], [h, h + 0.03], [-0.05, 0.15], 0.004);
  },

  monitor(k, W, D, h) {
    k.box('black', [-0.12, 0.12], [0, 0.012], [-0.09, 0.09], 0.004);
    k.box('black', [-0.02, 0.02], [0, 0.14], [-0.03, 0.0]);
    k.box('screen', [-W / 2, W / 2], [0.1, h], [-D / 2 + 0.02, D / 2], 0.006);
    k.box('black', [-0.25, 0.25], [h - 0.65, h - 0.64], [D / 2 + 0.06, D / 2 + 0.2], 0.004);      // keyboard
  },

  officeChair(k, W, D, h, it) {
    const m = it.mat || 'charcoal';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2, r = Math.min(W, D) / 2 - 0.03;
      const spoke = k.box('black', [-0.015, 0.015], [0.04, 0.07], [0, r]);
      spoke.position.set(Math.sin(a) * r / 2, 0.055, Math.cos(a) * r / 2); spoke.rotation.y = a;
      k.ball('black', Math.sin(a) * r, 0.025, Math.cos(a) * r, 0.025);
    }
    k.cyl('steel', 0, 0, 0.07, 0.42, 0.022);
    k.box(m, [-0.24, 0.24], [0.42, 0.5], [-0.22, 0.24], 0.04);
    k.box('black', [-0.02, 0.02], [0.45, 0.62], [-0.27, -0.24]);
    const back = k.box(m, [-0.22, 0.22], [0.58, 1.0], [-0.3, -0.24], 0.04); back.rotation.x = -0.1;
  },

  shelf(k, W, D, h, it) {
    const m = it.mat || 'oak';
    for (const x of [-W / 2 + 0.01, W / 2 - 0.01]) k.box(m, [x - 0.01, x + 0.01], [0, h], [-D / 2, D / 2]);
    const n = Math.max(2, Math.round(h / 0.36));
    const books = ['cloth1', 'cloth2', 'cloth3', 'linen', 'sage', 'clay'];
    for (let i = 0; i <= n; i++) {
      const y = i * (h - 0.02) / n;
      k.box(m, [-W / 2, W / 2], [y, y + 0.02], [-D / 2, D / 2]);
      if (i === n) break;
      let x = -W / 2 + 0.03, j = i * 3;
      const fill = (i % 2 ? 0.55 : 0.8) * (W - 0.06);
      while (x < -W / 2 + 0.03 + fill) {
        const t = 0.025 + ((j * 5) % 4) * 0.008, bh = 0.2 + ((j * 3) % 4) * 0.025;
        k.box(books[j % books.length], [x, x + t], [y + 0.02, y + 0.02 + bh], [-D / 2 + 0.03, D / 2 - 0.04]);
        x += t + 0.003; j++;
      }
      if (i % 2) k.cyl('ceramic', W / 2 - 0.1, 0, y + 0.02, y + 0.16, 0.05, 0.04);
    }
  },

  bench(k, W, D, h, it) {
    const m = it.mat || 'oak', n = Math.max(3, Math.round(D / 0.07));
    for (let i = 0; i < n; i++) {
      const za = -D / 2 + i * D / n + 0.006;
      k.box(m, [-W / 2, W / 2], [h - 0.03, h], [za, za + D / n - 0.012], 0.004);
    }
    for (const x of [-W / 2 + 0.06, W / 2 - 0.06]) {
      k.box(it.frame || 'black', [x - 0.015, x + 0.015], [0, h - 0.03], [-D / 2 + 0.03, -D / 2 + 0.06]);
      k.box(it.frame || 'black', [x - 0.015, x + 0.015], [0, h - 0.03], [D / 2 - 0.06, D / 2 - 0.03]);
      k.box(it.frame || 'black', [x - 0.015, x + 0.015], [0.08, 0.11], [-D / 2 + 0.03, D / 2 - 0.03]);
    }
  },

  toilet(k, W, D, h) {
    const c = 'ceramic', cz = 0.03;
    const bowl = k.cyl(c, 0, cz + 0.02, 0, 0.36, 0.19, 0.13, 28); bowl.scale.z = 1.25;
    const seat = k.cyl('white', 0, cz + 0.02, 0.36, 0.4, 0.2, 0.2, 28); seat.scale.z = 1.25;
    k.box(c, [-0.19, 0.19], [0.36, 0.76], [-D / 2, -D / 2 + 0.17], 0.04);                         // cistern
    k.box('steel', [-0.06, 0.06], [0.76, 0.775], [-D / 2 + 0.05, -D / 2 + 0.12], 0.004);
  },

  vanity(k, W, D, h, it) {
    const cab = it.mat || 'teak', top = it.top || 'terrazzo';
    k.box(cab, [-W / 2, W / 2], [h - 0.4, h - 0.04], [-D / 2, D / 2 - 0.02], 0.006);
    if (W > 0.55) fronts(k, cab, W, D - 0.04, h - 0.4, h - 0.04, Math.round(W / 0.45), { handle: 'h' });
    k.box(top, [-W / 2, W / 2], [h - 0.04, h], [-D / 2, D / 2], 0.004);
    const r = Math.min(0.17, W * 0.38, D * 0.4);
    k.cyl('ceramic', 0, 0.02, h, h + 0.12, r, r * 0.75, 28);
    k.cyl('black', 0, -D / 2 + 0.06, h, h + 0.26, 0.012);
    k.box('black', [-0.012, 0.012], [h + 0.24, h + 0.26], [-D / 2 + 0.06, -D / 2 + 0.16]);
    const mw = Math.min(W - 0.08, 0.6);
    k.box('mirror', [-mw / 2, mw / 2], [h + 0.25, h + 0.95], [-D / 2 - 0.005, -D / 2 + 0.012], 0.01);
  },

  fridge(k, W, D, h, it) {
    const m = it.mat || 'white';
    k.box(m, [-W / 2, W / 2], [0.02, h], [-D / 2, D / 2 - 0.03], 0.02);
    const split = h * 0.68;
    k.box(m, [-W / 2 + 0.005, W / 2 - 0.005], [0.04, split - 0.006], [D / 2 - 0.03, D / 2], 0.012);
    k.box(m, [-W / 2 + 0.005, W / 2 - 0.005], [split + 0.006, h - 0.01], [D / 2 - 0.03, D / 2], 0.012);
    k.box('steel', [W / 2 - 0.07, W / 2 - 0.05], [split - 0.45, split - 0.08], [D / 2, D / 2 + 0.03], 0.006);
    k.box('steel', [W / 2 - 0.07, W / 2 - 0.05], [split + 0.08, split + 0.3], [D / 2, D / 2 + 0.03], 0.006);
  },

  cooktop(k, W, D) {
    k.box('screen', [-W / 2, W / 2], [0, 0.012], [-D / 2, D / 2], 0.004);
    for (const x of [-W / 4, W / 4]) {
      k.torus('steel', x, 0.016, 0, 0.09, 0.008);
      k.torus('steel', x, 0.016, 0, 0.045, 0.006);
    }
  },

  sink(k, W, D) {
    k.box('steel', [-W / 2, W / 2], [-0.002, 0.008], [-D / 2, D / 2], 0.004);
    k.box('steelDark', [-W / 2 + 0.03, W / 2 - 0.03], [-0.001, 0.009], [-D / 2 + 0.03, D / 2 - 0.03]);
    k.cyl('black', 0, -D / 2 - 0.02, 0.0, 0.3, 0.014);
    const spout = k.torus('black', 0, 0.3, -D / 2 + 0.08, 0.1, 0.012, 0); spout.rotation.y = Math.PI / 2;
  },

  hood(k, W, D, h, it) {
    const m = it.mat || 'steel';
    k.box(m, [-W / 2, W / 2], [0, 0.06], [-D / 2, D / 2], 0.006);
    k.box(m, [-W / 2 + 0.08, W / 2 - 0.08], [0.06, 0.22], [-D / 2, D / 2 - 0.12], 0.006);
    k.box(m, [-0.14, 0.14], [0.22, h], [-D / 2, -D / 2 + 0.26], 0.004);
  },

  microwave(k, W, D, h) {
    k.box('charcoal', [-W / 2, W / 2], [0, h], [-D / 2, D / 2], 0.01);
    k.box('screen', [-W / 2 + 0.03, W / 2 - 0.12], [0.04, h - 0.04], [D / 2, D / 2 + 0.005]);
    k.box('steel', [W / 2 - 0.09, W / 2 - 0.03], [0.05, h - 0.05], [D / 2, D / 2 + 0.005]);
  },

  riceCooker(k, W, D, h) {
    k.cyl('white', 0, 0, 0, h * 0.8, Math.min(W, D) / 2, Math.min(W, D) / 2 * 0.9, 24);
    k.cyl('white', 0, 0, h * 0.8, h, Math.min(W, D) / 2 * 0.85, Math.min(W, D) / 2, 24);
    k.box('black', [-0.04, 0.04], [h * 0.3, h * 0.45], [D / 2 - 0.01, D / 2 + 0.005]);
  },

  nightstand(k, W, D, h, it) {
    const m = it.mat || 'oak';
    legs4(k, 'black', W, D, 0, 0.14, 0.03, 0.01, 0.01);
    k.box(m, [-W / 2, W / 2], [0.14, h], [-D / 2, D / 2 - 0.02], 0.008);
    fronts(k, m, W, D - 0.04, h - 0.18, h, 1, { handle: 'h' });
    k.cyl('ceramic', 0, -0.03, h, h + 0.22, 0.05, 0.07, 16);
    k.cyl('linen', 0, -0.03, h + 0.2, h + 0.36, 0.08, 0.12, 20);
  },

  // dressing table: slim top with two drawers, tapered legs, arched mirror on the wall behind
  dressingTable(k, W, D, h, it) {
    const m = it.mat || 'oak';
    legs4(k, m, W, D, 0, h - 0.03, 0.04, 0.018, 0.013);
    k.box(m, [-W / 2, W / 2], [h - 0.03, h], [-D / 2, D / 2], 0.006);
    k.box(m, [-W / 2 + 0.03, W / 2 - 0.03], [h - 0.15, h - 0.03], [-D / 2 + 0.02, D / 2 - 0.03]);
    fronts(k, m, W - 0.06, D - 0.05, h - 0.15, h - 0.03, 2, { handle: 'h' });
    const mw = Math.min(W * 0.7, 0.6), mh = it.mirrorH || 0.9, my = h + 0.12;
    const arch = new THREE.Shape();
    arch.moveTo(-mw / 2, my); arch.lineTo(mw / 2, my); arch.lineTo(mw / 2, my + mh - mw / 2);
    arch.absarc(0, my + mh - mw / 2, mw / 2, 0, Math.PI, false); arch.lineTo(-mw / 2, my);
    k.extrude(it.frame || 'oak', arch, 0.02, -D / 2);
    const glass = new THREE.Shape(), gw = mw - 0.05;
    glass.moveTo(-gw / 2, my + 0.025); glass.lineTo(gw / 2, my + 0.025); glass.lineTo(gw / 2, my + mh - mw / 2);
    glass.absarc(0, my + mh - mw / 2, gw / 2, 0, Math.PI, false); glass.lineTo(-gw / 2, my + 0.025);
    k.extrude('mirror', glass, 0.005, -D / 2 + 0.021);
    k.cyl('ceramic', W / 2 - 0.12, -0.05, h, h + 0.1, 0.04, 0.035);                          // a few bottles and a tray
    k.cyl('clay', W / 2 - 0.2, -0.02, h, h + 0.14, 0.022, 0.022);
    k.box('white', [-W / 2 + 0.08, -W / 2 + 0.3], [h, h + 0.015], [-0.12, 0.06], 0.004);
  },

  // upholstered stool / pouf
  stool(k, W, D, h, it) {
    const r = Math.min(W, D) / 2;
    k.cyl(it.legs || 'oak', 0, 0, 0, 0.04, r * 0.85, r * 0.85, 24);
    k.cyl(it.mat || 'linen', 0, 0, 0.04, h, r, r * 0.9, 28);
  },

  sideTable(k, W, D, h, it) {
    const m = it.mat || 'teak', r = Math.min(W, D) / 2;
    k.cyl(m, 0, 0, h - 0.03, h, r, r, 28);
    k.cyl(m, 0, 0, 0.02, h - 0.03, 0.035, 0.05, 12);
    k.cyl(m, 0, 0, 0, 0.02, r * 0.6, r * 0.6, 24);
    k.cyl('ceramic', 0.05, 0, h, h + 0.09, 0.04, 0.035);
  },

  loungeChair(k, W, D, h, it) {
    const frame = it.frame || 'teak';
    legs4(k, frame, W, D, 0, 0.3, 0.03, 0.016, 0.014);
    k.box(frame, [-W / 2, W / 2], [0.28, 0.32], [-D / 2, D / 2], 0.008);
    k.box(it.mat || 'rattan', [-W / 2 + 0.03, W / 2 - 0.03], [0.32, 0.34], [-D / 2 + 0.03, D / 2 - 0.03]);
    k.box('linen', [-W / 2 + 0.04, W / 2 - 0.04], [0.34, 0.42], [-D / 2 + 0.08, D / 2 - 0.03], 0.04);
    const back = k.box(it.mat || 'rattan', [-W / 2 + 0.02, W / 2 - 0.02], [0.32, 0.78], [-D / 2, -D / 2 + 0.04], 0.01);
    back.rotation.x = -0.2;
    k.box('sage', [-0.14, 0.14], [0.42, 0.68], [-D / 2 + 0.08, -D / 2 + 0.2], 0.06).rotation.x = -0.2;
  },

  washer(k, W, D, h) {
    k.box('white', [-W / 2, W / 2], [0.02, h], [-D / 2, D / 2], 0.02);
    k.box('steel', [-W / 2 + 0.03, W / 2 - 0.03], [h - 0.1, h - 0.03], [D / 2, D / 2 + 0.006], 0.004);
    k.torus('charcoal', 0, h * 0.45, D / 2 + 0.01, Math.min(W, h) * 0.27, 0.025, 0);
    const glass = k.cyl('screen', 0, 0, 0, 0.012, Math.min(W, h) * 0.25, Math.min(W, h) * 0.25, 28);
    glass.rotation.x = Math.PI / 2; glass.position.set(0, h * 0.45, D / 2 + 0.004);
  },

  laundrySink(k, W, D, h, it) {
    const m = it.mat || 'terrazzo';
    for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) k.box(m, [x - 0.04, x + 0.04], [0, h - 0.25], [-D / 2 + 0.05, D / 2 - 0.05]);
    k.box(m, [-W / 2, W / 2], [h - 0.25, h], [-D / 2, D / 2], 0.02);
    k.box('steelDark', [-W / 2 + 0.05, W / 2 - 0.05], [h - 0.005, h + 0.001], [-D / 2 + 0.05, D / 2 - 0.05]);
    k.cyl('black', 0, -D / 2 + 0.03, h, h + 0.3, 0.012);
    k.box('black', [-0.012, 0.012], [h + 0.28, h + 0.3], [-D / 2 + 0.03, -D / 2 + 0.16]);
  },

  dryingRack(k, W, D, h) {
    for (const x of [-W / 2 + 0.02, W / 2 - 0.02]) {
      const a = k.box('steel', [x - 0.012, x + 0.012], [0, h * 1.05], [-0.012, 0.012]); a.position.z = -D / 4; a.rotation.x = 0.25;
      const b = k.box('steel', [x - 0.012, x + 0.012], [0, h * 1.05], [-0.012, 0.012]); b.position.z = D / 4; b.rotation.x = -0.25;
    }
    for (const z of [-D / 4, 0, D / 4]) k.rodX('steel', -W / 2, W / 2, h - Math.abs(z) * 0.5, z * 0.4, 0.008);
    const cols = ['cloth1', 'white', 'cloth3', 'sage', 'cloth2'];
    for (let i = 0; i < 5; i++) {
      const x = -W / 2 + 0.12 + i * (W - 0.24) / 4;
      k.box(cols[i], [x - 0.09, x + 0.09], [h - 0.45, h], [-0.005, 0.005]).position.z = (i % 2 ? -1 : 1) * D * 0.1;
    }
  },

  // mihrab: green fabric panel inside an oak frame with an arched opening
  mihrab(k, W, D, h, it) {
    k.box(it.mat || 'mihrab', [-W / 2 + 0.02, W / 2 - 0.02], [0.02, h - 0.02], [-D / 2, D / 2 - 0.05]);
    const outer = new THREE.Shape();
    outer.moveTo(-W / 2, 0); outer.lineTo(W / 2, 0); outer.lineTo(W / 2, h); outer.lineTo(-W / 2, h); outer.closePath();
    const r = W / 2 - 0.07, spring = h - 0.12 - r;
    const hole = new THREE.Path();
    hole.moveTo(-r, 0.06); hole.lineTo(r, 0.06); hole.lineTo(r, spring);
    hole.absarc(0, spring, r, 0, Math.PI, false); hole.lineTo(-r, 0.06);
    outer.holes.push(hole);
    k.extrude(it.frame || 'oak', outer, 0.04, D / 2 - 0.05);
  },

  faucet(k, W, D, h) {
    k.box('black', [-0.04, 0.04], [0, h], [-D / 2, -D / 2 + 0.01], 0.004);
    k.rodZ('black', 0, h * 0.6, -D / 2, D / 2 + 0.12, 0.012);
    k.cyl('black', 0, D / 2 + 0.12, h * 0.6 - 0.05, h * 0.6, 0.014);
  },

  steppingStone(k, W, D, h, it) {
    const s = k.cyl(it.mat || 'stone', 0, 0, 0, h, 0.5, 0.5, 9);
    s.scale.set(W, 1, D); s.rotation.y = (it.rect[0] * 7.3) % 3;
  },

  // glass balustrade with a slim top rail
  railing(k, W, D, h, it) {
    k.box('glass', [-W / 2, W / 2], [0.02, h - 0.03], [-0.006, 0.006]);
    k.box(it.mat || 'black', [-W / 2, W / 2], [h - 0.03, h], [-0.02, 0.02], 0.006);
    for (const x of [-W / 2 + 0.02, W / 2 - 0.02]) k.box(it.mat || 'black', [x - 0.015, x + 0.015], [0, h], [-0.015, 0.015]);
  },
};

// ---------------------------------------------------------------------------
// cars: an extruded side profile, so MPV and hatchback read as cars, not boxes
export function buildCar(c, M) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: c.color, roughness: 0.3, metalness: 0.55, envMapIntensity: 0.9 });
  const glassM = M('carGlass'), tyre = M('tyre'), rim = M('steel'), dark = M('black');
  const L = c.length || 4.75, Wd = c.width || 1.85, H = c.height || 1.8;
  // profile in (z along length, y up); front of the car points to −z (toward the house in the carport)
  const s = new THREE.Shape();
  const p = [[-L / 2, 0.32], [-L / 2, 0.78], [-L / 2 + 0.12, 0.92], [-L / 2 + 1.05, 1.02], [-L / 2 + 1.9, H - 0.05],
             [L / 2 - 0.3, H - 0.02], [L / 2 - 0.05, H - 0.3], [L / 2, 0.9], [L / 2, 0.32]];
  s.moveTo(p[0][0], p[0][1]); for (const q of p.slice(1)) s.lineTo(q[0], q[1]); s.closePath();
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: Wd - 0.12, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 3 }), paint);
  body.rotation.y = -Math.PI / 2; body.position.x = (Wd - 0.12) / 2; g.add(body);   // shape x (length) → world z, front at −z
  // side windows (one long glass band each side) and windscreens
  const w = new THREE.Shape();
  const wp = [[-L / 2 + 1.2, 1.1], [-L / 2 + 1.92, H - 0.13], [L / 2 - 0.35, H - 0.13], [L / 2 - 0.14, 1.1]];
  w.moveTo(wp[0][0], wp[0][1]); for (const q of wp.slice(1)) w.lineTo(q[0], q[1]); w.closePath();
  for (const sx of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.ExtrudeGeometry(w, { depth: 0.01, bevelEnabled: false }), glassM);
    win.rotation.y = -Math.PI / 2; win.position.x = sx > 0 ? Wd / 2 + 0.012 : -Wd / 2 - 0.002; g.add(win);
  }
  for (const sx of [-1, 1]) for (const zc of [-L / 2 + 2.25, L / 2 - 1.05]) {         // B and C pillars split the glass band
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.02, H - 1.12, 0.1), paint);
    pil.position.set(sx * (Wd / 2 + 0.014), (1.1 + H - 0.13) / 2, zc); g.add(pil);
  }
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(Wd + 0.01, 0.12, L - 0.2), dark);  // dark lower trim
  skirt.position.set(0, 0.36, 0); g.add(skirt);
  const ws = new THREE.Mesh(new THREE.BoxGeometry(Wd - 0.22, 0.98, 0.02), glassM);         // windscreen on the sloped front
  ws.position.set(0, (1.02 + H) / 2 + 0.04, -L / 2 + 1.47 - 0.04); ws.rotation.x = 0.82; g.add(ws);
  const rw = new THREE.Mesh(new THREE.BoxGeometry(Wd - 0.25, 0.5, 0.02), glassM);          // rear window
  rw.position.set(0, H - 0.42, L / 2 + 0.03); rw.rotation.x = -0.07; g.add(rw);
  for (const sx of [-1, 1]) {                                                        // lights
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.04), M('white')); hl.position.set(sx * (Wd / 2 - 0.3), 0.82, -L / 2 - 0.07); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.04), M('tailLight')); tl.position.set(sx * (Wd / 2 - 0.08), 1.1, L / 2 + 0.07); g.add(tl);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(Wd - 0.6, 0.2, 0.04), dark); grille.position.set(0, 0.6, -L / 2 - 0.07); g.add(grille);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const wz = z * (L / 2 - 0.85), wx = x * (Wd / 2 - 0.12);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.23, 24), tyre); t.rotation.z = Math.PI / 2; t.position.set(wx, 0.34, wz); g.add(t);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.24, 16), rim); r.rotation.z = Math.PI / 2; r.position.set(wx + x * 0.005, 0.34, wz); g.add(r);
  }
  g.position.set(c.c[0], 0, c.c[1]);
  g.rotation.y = c.rot || 0;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------------------------------------------------------------------------
// plants: layered foliage clusters instead of a single blob
export function buildPlant(p, M) {
  const g = new THREE.Group();
  const rnd = seeded(Math.round((p.c[0] * 31 + p.c[1] * 17) * 100));
  const leafMats = [M('leaf'), M('leafLight'), M('leafDark')];
  if (p.type === 'tree') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.11, p.h * 0.6, 8), M('trunk'));
    trunk.position.y = p.h * 0.3; g.add(trunk);
    for (let b = 0; b < 3; b++) {                                                     // branches
      const a = b * 2.1 + rnd();
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.045, p.h * 0.32, 6), M('trunk'));
      br.position.set(Math.cos(a) * 0.12, p.h * 0.62, Math.sin(a) * 0.12); br.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); g.add(br);
    }
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, rr = p.r * (0.2 + rnd() * 0.65);
      const y = p.h * (0.7 + rnd() * 0.25);
      const s = p.r * (0.35 + rnd() * 0.3);
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), leafMats[i % 3]);
      m.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr); m.scale.set(1, 0.7, 1); m.rotation.set(rnd(), rnd(), rnd()); g.add(m);
    }
  } else if (p.type === 'bamboo') {
    for (let i = 0; i < 6; i++) {
      const hh = 2.3 + rnd() * 0.9, dx = (rnd() - 0.5) * 0.18, dz = (rnd() - 0.5) * 0.14;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, hh, 6), M('bambooCulm'));
      s.position.set(dx, hh / 2, dz); s.rotation.z = (rnd() - 0.5) * 0.08; g.add(s);
      for (let k = 0; k < 3; k++) {
        const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13 + rnd() * 0.08, 0), leafMats[(i + k) % 3]);
        lf.position.set(dx + (rnd() - 0.5) * 0.25, hh - 0.15 - k * 0.45, dz + (rnd() - 0.5) * 0.25); lf.scale.set(1, 1.7, 0.6); lf.rotation.y = rnd() * 3; g.add(lf);
      }
    }
  } else {
    const r = p.r || 0.3;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + rnd(), rr = i === 0 ? 0 : r * 0.45;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r * (i === 0 ? 0.75 : 0.55), 1), leafMats[i % 3]);
      m.position.set(Math.cos(a) * rr, r * (i === 0 ? 0.75 : 0.5), Math.sin(a) * rr); m.scale.y = 0.8; g.add(m);
    }
  }
  g.position.set(p.c[0], 0, p.c[1]);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function norm([a, b, c, d]) { return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)]; }
function seeded(seed) { let a = seed >>> 0 || 1; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }
