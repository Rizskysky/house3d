// Builds the whole house as a THREE.Group from data/house.json.
// Plan coordinates: x = west→east, y = back→front street, z = height (meters).
// Three.js mapping: X = x, Y = z (up), Z = y.

import * as THREE from 'three';

const CUT_HEIGHT = 1.3;          // wall height when "Potong dinding" is on
const THICK = { ext: 0.15, int: 0.1, boundary: 0.15, low: 0.12, roster: 0.12 };

export function buildHouse(data, state) {
  const root = new THREE.Group();
  const mats = makeMaterials(data.materials);
  const L = data.levels;
  const show = visibility(state);

  const add = (mesh, { shadow = true } = {}) => {
    mesh.castShadow = shadow; mesh.receiveShadow = true; root.add(mesh); return mesh;
  };

  // box from a plan rect [x0,y0,x1,y1], bottom z0, height h
  const box = (rect, z0, h, mat, opts) => {
    const [x0, y0, x1, y1] = norm(rect);
    const w = Math.max(x1 - x0, 0.001), d = Math.max(y1 - y0, 0.001), hh = Math.max(h, 0.001);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat);
    m.position.set((x0 + x1) / 2, z0 + hh / 2, (y0 + y1) / 2);
    return add(m, { shadow: mat.userData.castShadow !== false && !(opts && opts.noShadow) });
  };
  const M = (key, override) => {
    if (override != null) return opacityMat(mats, key, override);
    if (!mats[key]) console.warn('material tidak dikenal:', key);
    return mats[key] || mats.plaster;
  };
  const lz = (level) => (L[level] ? L[level].z : 0);

  // ---------- ground & floors ----------
  for (const g of data.ground || []) box(g.rect, g.z, g.h, M(g.mat), { noShadow: true });
  for (const f of data.floors || []) {
    if (!show.level(f.level)) continue;
    box(f.rect, lz(f.level) + (f.z || 0), 0.02, M(f.mat), { noShadow: true });
  }
  if (show.slabs) for (const s of data.slabs || []) box(s.rect, s.z, s.t, M('plaster'));

  // ---------- walls ----------
  for (const w of data.walls || []) {
    if (!show.level(w.level)) continue;
    const full = w.h || (L[w.level] && L[w.level].h) || 2.4;
    const cut = show.cutLevel === w.level && w.kind !== 'boundary' && w.kind !== 'low' && w.kind !== 'roster';
    const h = cut ? Math.min(full, CUT_HEIGHT) : full;
    if (w.kind === 'roster') { rosterWall(w, lz(w.level), h, M, box); continue; }
    buildWall(w, lz(w.level), h, THICK[w.kind] || 0.15, wallMat(w.kind), M, box);
  }
  function wallMat(kind) {
    return M(kind === 'boundary' ? 'boundary' : kind === 'low' ? 'plasterExt' : kind === 'ext' ? 'plasterExt' : 'plaster');
  }
  if (show.level('lt1')) for (const b of data.facadeBands || []) box(b.rect, b.z, b.h, M(b.mat));

  // ---------- stairs ----------
  for (const st of data.stairs || []) {
    if (!show.level(st.level)) continue;
    const z = lz(st.level), m = M(st.mat || 'oak');
    for (const f of st.flights) {
      const [x0, y0, x1, y1] = norm(f.rect);
      const n = f.steps, rise = (f.z1 - f.z0) / n;
      for (let i = 0; i < n; i++) {
        const top = z + f.z0 + rise * (i + 1);
        if (f.dir === '-y') { const d = (y1 - y0) / n; box([x0, y1 - d * (i + 1), x1, y1 - d * i], top - 0.05, 0.05, m); }
        else if (f.dir === '+y') { const d = (y1 - y0) / n; box([x0, y0 + d * i, x1, y0 + d * (i + 1)], top - 0.05, 0.05, m); }
        else if (f.dir === '+x') { const d = (x1 - x0) / n; box([x0 + d * i, y0, x0 + d * (i + 1), y1], top - 0.05, 0.05, m); }
        else if (f.dir === '-x') { const d = (x1 - x0) / n; box([x1 - d * (i + 1), y0, x1 - d * i, y1], top - 0.05, 0.05, m); }
      }
    }
    for (const l of st.landings || []) box(l.rect, z + l.z - 0.08, 0.08, m);
    for (const r of st.rails || []) box(r.rect, z + r.z0, r.h, M('black'));
  }

  // ---------- furniture & small objects ----------
  for (const b of data.boxes || []) {
    if (!show.level(b.level)) continue;
    const z = lz(b.level) + (b.z || 0);
    const mat = M(b.mat, b.opacity);
    if (b.legs) { tableLegs(b.rect, z, b.h, mat, box); continue; }
    if (b.slats) { slatWall(b.rect, z, b.h, mat, box); continue; }
    box(b.rect, z, b.h, mat);
    if (b.chair) chairBack(b, z, mat, box);
    if (b.slatsTop) deckLines(b.rect, z + b.h, M('teak'), box);
  }
  if (show.level('lt1')) for (const p of data.prayerMats || []) {
    const [w, d] = p.size;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), M('prayerMat'));
    m.position.set(p.c[0], lz('lt1') + 0.03, p.c[1]);
    m.rotation.y = -THREE.MathUtils.degToRad(p.rot || 0);
    add(m, { shadow: false });
  }

  // ---------- roofs ----------
  for (const r of data.roofs || []) {
    if (!show.roof(r)) continue;
    if (r.type === 'gable') gable(r, M(r.mat), M('teak'), M('charcoal'), root, add, box);
    else if (r.type === 'flat') {
      const sky = r.skylight;                                   // one strip [x0,y0,x1,y1] cut out of the slab
      if (!sky) box(r.rect, r.z, r.t, M(r.mat));
      else {
        const [x0, y0, x1, y1] = norm(r.rect), [s0, t0, s1, t1] = norm(sky);
        for (const piece of [[x0, y0, s0, y1], [s1, y0, x1, y1], [s0, y0, s1, t0], [s0, t1, s1, y1]])
          if (piece[2] - piece[0] > 0.001 && piece[3] - piece[1] > 0.001) box(piece, r.z, r.t, M(r.mat));
        const c = 0.06;                                         // upstand around the opening
        for (const e of [[s0 - c, t0 - c, s1 + c, t0], [s0 - c, t1, s1 + c, t1 + c], [s0 - c, t0, s0, t1], [s1, t0, s1 + c, t1]])
          box(e, r.z + r.t, 0.12, M('charcoal'));
        box([s0, t0, s1, t1], r.z + r.t + 0.1, 0.02, M('glass'));
      }
      for (const p of r.posts || []) box([p[0] - 0.05, p[1] - 0.05, p[0] + 0.05, p[1] + 0.05], 0, r.z, M('charcoal'));
    } else if (r.type === 'glass') glassCanopy(r, M, box);
  }

  // ---------- cars, plants, context ----------
  for (const c of data.cars || []) car(c, add);
  for (const p of data.plants || []) plant(p, M, add);
  if (state.context) for (const h of (data.context && data.context.houses) || []) {
    box(h.rect, 0, h.eave, M('neighbor'));
    gable({ rect: h.rect, eave: h.eave, rise: h.rise, over: { side: 0.4, end: 0.5 } }, M('neighborRoof'), null, M('neighbor'), root, add, box);
  }

  // ---------- labels ----------
  root.userData.labels = [];
  if (state.labels) for (const f of data.floors || []) {
    if (!f.name || !show.labelLevel(f.level)) continue;
    const [x0, y0, x1, y1] = norm(f.rect);
    const s = label(f.name);
    s.position.set((x0 + x1) / 2, lz(f.level) + 0.35, (y0 + y1) / 2);
    root.add(s); root.userData.labels.push(s);
  }
  return root;
}

// ---------------------------------------------------------------------------
function visibility(state) {
  const v = state.view; // 'all' | 'lt1' | 'lt2'
  return {
    level: (lv) => lv === 'site' || lv === 'lt1' || (lv === 'lt2' && v !== 'lt1'),
    labelLevel: (lv) => (v === 'lt1' && (lv === 'lt1' || lv === 'site')) || (v === 'lt2' && lv === 'lt2'),
    slabs: v !== 'lt1',
    cutLevel: state.cut ? (v === 'lt1' ? 'lt1' : v === 'lt2' ? 'lt2' : null) : null,
    roof: (r) => {
      if (r.type === 'gable') return v === 'all' && state.roof;
      if (v === 'lt1') return false;           // cutaway: see inside musholla, carport, deck
      return true;
    },
  };
}

function norm([a, b, c, d]) { return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)]; }

function makeMaterials(defs) {
  const out = {};
  for (const [k, d] of Object.entries(defs)) {
    const op = d.opacity ?? 1;
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(d.color), roughness: d.rough ?? 0.8, metalness: d.metal ?? 0,
      transparent: op < 1, opacity: op, depthWrite: op >= 1,
    });
    if (op < 1) m.userData.castShadow = false;
    out[k] = m;
  }
  return out;
}
function opacityMat(mats, key, op) {
  const id = `${key}@${op}`;
  if (!mats[id]) {
    const m = mats[key].clone(); m.transparent = true; m.opacity = op; m.depthWrite = false; m.userData.castShadow = false; mats[id] = m;
  }
  return mats[id];
}

// Wall along an axis-aligned centerline with openings (doors, windows, bifold, gates).
function buildWall(w, z, h, t, mat, M, box) {
  const horiz = Math.abs(w.a[1] - w.b[1]) < 1e-6;
  const s0 = horiz ? Math.min(w.a[0], w.b[0]) : Math.min(w.a[1], w.b[1]);
  const len = horiz ? Math.abs(w.b[0] - w.a[0]) : Math.abs(w.b[1] - w.a[1]);
  const c = horiz ? w.a[1] : w.a[0];
  // rect for a piece along the wall from p0..p1 (meters along the wall), thickness tt, offset off
  const rect = (p0, p1, tt = t, off = 0) => horiz
    ? [s0 + p0, c - tt / 2 + off, s0 + p1, c + tt / 2 + off]
    : [c - tt / 2 + off, s0 + p0, c + tt / 2 + off, s0 + p1];
  const seg = (p0, p1, zb, zt) => { if (p1 - p0 > 0.001 && zt - zb > 0.001) box(rect(p0, p1), z + zb, zt - zb, mat); };

  const ops = [...(w.open || [])].sort((a, b) => a.at - b.at);
  let cur = 0;
  for (const o of ops) {
    const p0 = o.at, p1 = o.at + o.w;
    seg(cur, p0, 0, h);
    const sill = o.type === 'window' ? (o.sill ?? 0.9) : 0;
    const head = Math.min(o.head ?? 2.1, h);
    if (sill >= h) { seg(p0, p1, 0, h); cur = p1; continue; }
    seg(p0, p1, 0, sill);
    seg(p0, p1, head, h);
    const top = head;
    if (o.type === 'window') {
      box(rect(p0, p1, 0.03), z + sill, top - sill, M('glass'));
      box(rect(p0, p1, 0.06), z + sill, 0.04, M('black'));
      if (top - sill > 0.1) box(rect(p0, p1, 0.06), z + top - 0.04, 0.04, M('black'));
      if ((o.note || '').includes('kisi')) {
        const out = c < 0.5 || c > 6.5 ? (c < 0.5 ? -1 : 1) : -1;
        for (let zz = sill + 0.06; zz < top - 0.04; zz += 0.12) box(rect(p0 - 0.05, p1 + 0.05, 0.03, out * (t / 2 + 0.06)), z + zz, 0.05, M('teak'));
      }
    } else if (o.type === 'slide') {
      const mm = o.panel === 'glass' ? M('glass') : M(o.panel || 'oak');
      if (o.panel === 'glass') {
        box(rect(p0, p1, 0.03), z, top, mm);
        box(rect(p0, p1, 0.06), z + top - 0.05, 0.05, M('black'));
        box(rect(p0 + o.w / 2 - 0.02, p0 + o.w / 2 + 0.02, 0.06), z, top, M('black'));
      } else box(rect(p0, p0 + o.w * 0.5, 0.04, t / 2 - 0.03), z, top, mm);   // half-open panel
    } else if (o.type === 'gate') {
      for (let p = p0 + 0.04; p < p1 - 0.02; p += 0.13) box(rect(p, p + 0.07, 0.05), z, top, M('teak'));
      box(rect(p0, p1, 0.06), z + top - 0.05, 0.05, M('black'));
    } else if (o.type === 'sliding') {
      // aluminium sliding: 'fixed' panes on the outer track, 'slide' panes on the inner track,
      // drawn open, i.e. parked behind the neighbouring fixed pane.
      const kinds = o.leaves || ['fixed', 'slide'], n = kinds.length, pw = o.w / n, out = o.out || 1;
      const frame = M('black'), glass = M('glass'), outer = out * 0.03, inner = -out * 0.03;
      box(rect(p0, p1, 0.1), z + top - 0.05, 0.05, frame);
      box(rect(p0, p1, 0.1), z, 0.03, frame);
      const pane = (r0, r1, off) => {
        box(rect(r0, r1, 0.02, off), z + 0.03, top - 0.08, glass);
        for (const e of [r0, r1 - 0.04]) box(rect(e, e + 0.04, 0.04, off), z + 0.03, top - 0.08, frame);
        box(rect(r0, r1, 0.04, off), z + 0.03, 0.05, frame);
        box(rect(r0, r1, 0.04, off), z + top - 0.1, 0.05, frame);
      };
      kinds.forEach((k, i) => {
        const q0 = p0 + i * pw;
        if (k === 'fixed') { pane(q0, q0 + pw, outer); return; }
        const j = kinds[i - 1] === 'fixed' ? i - 1 : i + 1;
        const lap = (i > j ? 1 : -1) * 0.04;                    // overlaps the fixed pane's edge (interlock)
        pane(p0 + j * pw + lap, p0 + (j + 1) * pw + lap, inner);
      });
    } else if (o.type === 'swing') {
      // aluminium glass doors: 'fixed' panes stay in the wall plane; 'swing' leaves are drawn
      // opened 180° outward, lying flat in front of the neighbouring fixed pane (hooked open).
      const kinds = o.leaves || ['swing', 'swing'], n = kinds.length, pw = o.w / n, out = o.out || 1;
      const frame = M('black'), glass = M('glass');
      box(rect(p0, p1, 0.07), z + top - 0.05, 0.05, frame);
      box(rect(p0, p1, 0.07), z, 0.03, frame);
      for (let i = 0; i <= n; i++) { const q = Math.min(p0 + i * pw, p1 - 0.04); box(rect(q, q + 0.04, 0.07), z, top, frame); }
      kinds.forEach((k, i) => {
        const q0 = p0 + i * pw, q1 = q0 + pw;
        if (k === 'fixed') { box(rect(q0, q1, 0.03), z, top, glass); return; }
        const j = kinds[i - 1] === 'fixed' ? i - 1 : i + 1;      // hinge on the side of the fixed pane
        const r0 = p0 + j * pw, r1 = r0 + pw, off = out * (t / 2 + 0.05);
        box(rect(r0, r1, 0.03, off), z + 0.03, top - 0.06, glass);
        box(rect(r0, r1, 0.05, off), z + top - 0.07, 0.04, frame);
        box(rect(r0, r1, 0.05, off), z + 0.03, 0.04, frame);
        for (const e of [r0, r1 - 0.04]) box(rect(e, e + 0.04, 0.05, off), z + 0.03, top - 0.06, frame);
      });
    } else if (o.type === 'bifold') {
      const n = o.panels || 4, pw = o.w / n, out = o.out || 1;
      box(rect(p0, p1, 0.08), z + top - 0.06, 0.06, M('black'));          // top track
      for (let i = 0; i < n; i++) {                                     // folded stack at the end, swung outward
        const pp = p1 - 0.05 - i * 0.075;
        const r = horiz
          ? [s0 + pp - 0.035, c, s0 + pp, c + out * pw]
          : [c, s0 + pp - 0.035, c + out * pw, s0 + pp];
        box(r, z + 0.02, top - 0.08, M('glass'));
        const fr = horiz ? [r[0], r[1], r[2], r[3]] : [r[0], r[1], r[2], r[3]];
        box(fr, z + top - 0.1, 0.04, M('black'));
        box(fr, z + 0.02, 0.04, M('black'));
      }
    }
    cur = p1;
  }
  seg(cur, len, 0, h);
}

// Breeze-block (roster) screen: solid plinth, a grid of open blocks above, a top beam.
function rosterWall(w, z, h, M, box) {
  const horiz = Math.abs(w.a[1] - w.b[1]) < 1e-6;
  const s0 = horiz ? Math.min(w.a[0], w.b[0]) : Math.min(w.a[1], w.b[1]);
  const len = horiz ? Math.abs(w.b[0] - w.a[0]) : Math.abs(w.b[1] - w.a[1]);
  const c = horiz ? w.a[1] : w.a[0], t = THICK.roster;
  const rect = (p0, p1) => horiz ? [s0 + p0, c - t / 2, s0 + p1, c + t / 2] : [c - t / 2, s0 + p0, c + t / 2, s0 + p1];
  const plinth = w.plinth ?? 0.6, beam = 0.15, cell = w.cell ?? 0.2, bar = 0.07;
  const mat = M(w.mat || 'plasterExt'), base = M(w.baseMat || 'plasterExt');
  box(rect(0, len), z, plinth, base);
  box(rect(0, len), z + h - beam, beam, mat);
  const top = h - beam;
  for (let p = 0; p <= len - bar + 1e-6; p += cell) box(rect(p, Math.min(p + bar, len)), z + plinth, top - plinth, mat);
  box(rect(len - bar, len), z + plinth, top - plinth, mat);
  for (let zz = plinth + cell; zz < top - bar / 2; zz += cell) box(rect(0, len), z + zz - bar / 2, bar, mat);
}

function tableLegs(rect, z, h, mat, box) {
  const [x0, y0, x1, y1] = norm(rect), s = 0.05;
  for (const [x, y] of [[x0, y0], [x1 - s, y0], [x0, y1 - s], [x1 - s, y1 - s]]) box([x, y, x + s, y + s], z, h, mat);
}
function slatWall(rect, z, h, mat, box) {
  const [x0, y0, x1, y1] = norm(rect);
  const alongY = (y1 - y0) > (x1 - x0);
  const len = alongY ? y1 - y0 : x1 - x0;
  for (let p = 0; p < len - 0.03; p += 0.1) {
    box(alongY ? [x0, y0 + p, x1, y0 + p + 0.06] : [x0 + p, y0, x0 + p + 0.06, y1], z, h, mat);
  }
}
function chairBack(b, z, mat, box) {
  const [x0, y0, x1, y1] = norm(b.rect);
  // back sits opposite the direction the chair faces
  const r = { '+y': [x0, y0, x1, y0 + 0.05], '-y': [x0, y1 - 0.05, x1, y1],
              '+x': [x0, y0, x0 + 0.05, y1], '-x': [x1 - 0.05, y0, x1, y1] }[b.chair];
  box(r, z + b.h, 0.4, mat);
}
function deckLines(rect, ztop, mat, box) {
  const [x0, y0, x1, y1] = norm(rect);
  for (let y = y0 + 0.14; y < y1 - 0.05; y += 0.14) box([x0, y - 0.006, x1, y + 0.006], ztop, 0.004, mat, { noShadow: true });
}

function gable(r, roofMat, slatMat, backMat, root, add, box) {
  const [x0, y0, x1, y1] = norm(r.rect);
  const W = (x1 - x0) / 2, xm = (x0 + x1) / 2;
  const side = r.over?.side ?? 0.5, end = r.over?.end ?? 0.6;
  const tan = r.rise / W, ang = Math.atan(tan);
  const ridge = r.eave + r.rise;
  const lenSlope = (W + side) / Math.cos(ang);
  const depth = (y1 - y0) + 2 * end;
  const thick = 0.12;
  for (const sgn of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(lenSlope, thick, depth), roofMat);
    const cx = xm + sgn * (W + side) / 2;
    const cy = ridge - (W + side) / 2 * tan + thick / 2 / Math.cos(ang);
    m.position.set(cx, cy, (y0 + y1) / 2);
    m.rotation.z = -sgn * ang;
    add(m);
  }
  // gable end triangles
  const tri = new THREE.Shape();
  tri.moveTo(x0, r.eave); tri.lineTo(x1, r.eave); tri.lineTo(xm, ridge); tri.closePath();
  for (const [yy, isFront] of [[y0, false], [y1, true]]) {
    const g = new THREE.ShapeGeometry(tri);
    const mesh = new THREE.Mesh(g, backMat);
    mesh.material = backMat.clone(); mesh.material.side = THREE.DoubleSide;
    mesh.position.z = yy + (isFront ? -0.02 : 0);
    add(mesh);
    if (isFront && r.gableFront === 'slats' && slatMat) {
      for (let x = x0 + 0.12; x < x1 - 0.1; x += 0.16) {
        const hh = r.rise * (1 - Math.abs(x + 0.03 - xm) / W) - 0.08;
        if (hh > 0.05) box([x, yy + 0.0, x + 0.07, yy + 0.07], r.eave, hh, slatMat);
      }
    }
  }
}

function glassCanopy(r, M, box) {
  const [x0, y0, x1, y1] = norm(r.rect);
  box(r.rect, r.z, 0.025, M('glass'));
  const f = 0.05, blk = M('black');
  box([x0, y0, x1, y0 + f], r.z - 0.04, 0.06, blk);
  box([x0, y1 - f, x1, y1], r.z - 0.04, 0.06, blk);
  box([x0, y0, x0 + f, y1], r.z - 0.04, 0.06, blk);
  box([x1 - f, y0, x1, y1], r.z - 0.04, 0.06, blk);
  for (let y = y0 + (r.frame || 1); y < y1 - 0.2; y += (r.frame || 1)) box([x0, y - 0.025, x1, y + 0.025], r.z - 0.04, 0.05, blk);
  for (let x = x0 + 0.2; x < x1 - 0.1; x += 0.22) box([x, y0 + 0.05, x + 0.04, y1 - 0.05], r.z - 0.09, 0.04, M('teak'));
}

function car(c, add) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: c.color, roughness: 0.35, metalness: 0.5 });
  const glassM = new THREE.MeshStandardMaterial({ color: '#2B3036', roughness: 0.1, metalness: 0.3 });
  const tyre = new THREE.MeshStandardMaterial({ color: '#1C1C1C', roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.72, 4.6), paint); body.position.y = 0.62; g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.55, 2.5), glassM); cab.position.set(0, 1.25, -0.25); g.add(cab);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 2.3), paint); roof.position.set(0, 1.55, -0.3); g.add(roof);
  for (const [x, z] of [[-0.82, 1.45], [0.82, 1.45], [-0.82, -1.5], [0.82, -1.5]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18), tyre);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.34, z); g.add(w);
  }
  g.position.set(c.c[0], 0, c.c[1]);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  add(g);
}

function plant(p, M, add) {
  const g = new THREE.Group();
  if (p.type === 'tree') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, p.h * 0.62, 8), M('trunk'));
    trunk.position.y = p.h * 0.31; g.add(trunk);
    const blobs = [[0, p.h * 0.78, 0, 1], [p.r * 0.45, p.h * 0.72, p.r * 0.2, 0.7], [-p.r * 0.4, p.h * 0.74, -p.r * 0.25, 0.75], [0.1, p.h * 0.92, -0.1, 0.6]];
    blobs.forEach(([x, y, z, s], i) => {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(p.r * s, 1), M(i % 2 ? 'leafLight' : 'leaf'));
      m.position.set(x, y, z); m.scale.y = 0.75; g.add(m);
    });
  } else if (p.type === 'bamboo') {
    for (let i = 0; i < 4; i++) {
      const hh = 2.4 + (i % 3) * 0.35, dx = (i - 1.5) * 0.06, dz = ((i * 37) % 5 - 2) * 0.04;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, hh, 6), M('leafLight'));
      s.position.set(dx, hh / 2, dz); g.add(s);
      const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), M('leaf'));
      lf.position.set(dx, hh - 0.25, dz); lf.scale.set(0.8, 1.6, 0.8); g.add(lf);
    }
  } else {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(p.r || 0.3, 1), M('leaf'));
    m.position.y = (p.r || 0.3) * 0.75; m.scale.y = 0.8; g.add(m);
  }
  g.position.set(p.c[0], 0, p.c[1]);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  add(g);
}

function label(text) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = '600 44px "Albert Sans", system-ui, sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 40;
  c.width = w; c.height = 72;
  ctx.font = font;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  roundRect(ctx, 2, 2, w - 4, 68, 30); ctx.fill();
  ctx.fillStyle = '#232220'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.fillText(text, w / 2, 38);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.renderOrder = 10;
  const k = 0.006; s.scale.set(w * k, 72 * k, 1);
  return s;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
