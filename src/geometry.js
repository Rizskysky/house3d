// Builds the whole house as a THREE.Group from data/house.json.
// Plan coordinates: x = west→east, y = back→front street, z = height (meters).
// Three.js mapping: X = x, Y = z (up), Z = y.

import * as THREE from 'three';

const bust = new URL(import.meta.url).search;
const { patternTexture } = await import(`./textures.js${bust}`);
const { buildItem, buildCar, buildPlant } = await import(`./furniture.js${bust}`);
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
    const geo = new THREE.BoxGeometry(w, hh, d);
    const m = new THREE.Mesh(geo, mat);
    m.position.set((x0 + x1) / 2, z0 + hh / 2, (y0 + y1) / 2);
    if (mat.map) meterUV(geo, m.position);
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
    if (b.type) {                                          // modeled furniture (src/furniture.js)
      let item = b;
      if (show.cutLevel === b.level) {                     // cut view: trim tall pieces like the walls
        if ((b.z || 0) >= CUT_HEIGHT) continue;
        if ((b.z || 0) + (b.h ?? 0.75) > CUT_HEIGHT) item = { ...b, h: CUT_HEIGHT - (b.z || 0) };
      }
      const g = buildItem(item, lz(b.level), M, meterUV);
      if (g) root.add(g);
      continue;
    }
    const mat = M(b.mat, b.opacity);
    if (b.legs) { tableLegs(b.rect, z, b.h, mat, box); continue; }
    if (b.slats) { slatWall(b.rect, z, b.h, mat, box); continue; }
    box(b.rect, z, b.h, mat);
    if (b.chair) chairBack(b, z, mat, box);
    if (b.slatsTop) deckLines(b.rect, z + b.h, M('teak'), box);
  }
  // ---------- lights (on in "Malam") ----------
  for (const l of data.lights || []) {
    if (!show.level(l.level)) continue;
    // ceiling fittings would float in a cut view, or under a roof that is hidden
    const cutAway = l.kind !== 'up' && (show.cutLevel === l.level || (l.level === 'site' && state.view === 'lt1'));
    const [x, y] = l.at, z = lz(l.level) + l.z;
    const glow = lampMaterial();
    if (cutAway) { /* light only */ } else if (l.kind === 'pendant') {
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.18, 24, 1, true), M('black'));
      shade.position.set(x, z + 0.09, y); add(shade, { shadow: false });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), glow);
      bulb.position.set(x, z + 0.03, y); bulb.userData.lamp = true; add(bulb, { shadow: false });
      const ceiling = lz(l.level) + (l.ceiling || 3.25);
      box([x - 0.005, y - 0.005, x + 0.005, y + 0.005], z + 0.18, ceiling - z - 0.18, M('black'), { noShadow: true });
    } else if (l.kind === 'up') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 12), glow);
      m.position.set(x, z, y); m.userData.lamp = true; add(m, { shadow: false });
    } else {                                                  // ceiling downlight
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 16), glow);
      m.position.set(x, z, y); m.userData.lamp = true; add(m, { shadow: false });
    }
    const light = new THREE.PointLight(l.color || '#FFD9A8', l.power || 12, l.range || 7, 2);
    light.position.set(x, l.kind === 'up' ? z + 0.3 : z - 0.12, y);
    light.userData.nightOnly = true; light.visible = false;
    root.add(light);
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
  for (const c of data.cars || []) root.add(buildCar(c, M));
  for (const p of data.plants || []) root.add(buildPlant(p, M));
  if (state.context) for (const h of (data.context && data.context.houses) || []) {
    box(h.rect, 0, h.eave, M('neighbor'));
    gable({ rect: h.rect, eave: h.eave, rise: h.rise, over: { side: 0.4, end: 0.5 } }, M('neighborRoof'), null, M('neighbor'), root, add, box);
  }

  mergeStatic(root);

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

// Thousands of small parts → one mesh per material, so phones draw a few dozen meshes instead of thousands.
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map(), done = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.lamp || Array.isArray(o.material)) return;
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.clearGroups();
    geo.applyMatrix4(o.matrixWorld);
    const key = `${o.material.uuid}|${o.castShadow}|${o.receiveShadow}`;
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, list: [] });
    buckets.get(key).list.push(geo);
    done.push(o);
  });
  for (const o of done) { o.parent.remove(o); o.geometry.dispose(); }
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.list, false);
    b.list.forEach((x) => x.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast; mesh.receiveShadow = b.recv;
    root.add(mesh);
  }
}

// one shared glowing material for light fixtures; the viewer turns its glow on at night
let lampMat = null;
function lampMaterial() {
  if (!lampMat) lampMat = new THREE.MeshStandardMaterial({ color: '#F4EFE6', emissive: new THREE.Color('#FFD9A8'), emissiveIntensity: 0, roughness: 0.4 });
  return lampMat;
}

function norm([a, b, c, d]) { return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)]; }

// Materials are built once per distinct "materials" block and reused on every rebuild.
let matCache = { key: null, mats: null };
function makeMaterials(defs) {
  const key = JSON.stringify(defs);
  if (matCache.key === key) return matCache.mats;
  const out = {};
  for (const [k, d] of Object.entries(defs)) {
    const op = d.opacity ?? 1;
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(d.color), roughness: d.rough ?? 0.8, metalness: d.metal ?? 0,
      transparent: op < 1, opacity: op, depthWrite: op >= 1,
    });
    if (op < 1) m.userData.castShadow = false;
    m.envMapIntensity = d.env ?? 0.4;                     // sky reflections: subtle, the sun does the main lighting
    const t = d.tex && patternTexture(d.tex);
    if (t) {
      const rep = 1 / (d.scale || 1);
      m.map = t.map.clone(); m.map.repeat.set(rep, rep); m.map.needsUpdate = true;
      m.color.multiplyScalar(1 / t.mean);                 // the pattern darkens on average; keep the specified color
      if (d.bump) { m.bumpMap = t.bump.clone(); m.bumpMap.repeat.set(rep, rep); m.bumpMap.needsUpdate = true; m.bumpScale = d.bump; }
    }
    out[k] = m;
  }
  matCache = { key, mats: out };
  return out;
}

// UVs in meters from world position, so a texture's scale is the same on every box and patterns run on across boxes.
function meterUV(geo, offset) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + offset.x, y = pos.getY(i) + offset.y, z = pos.getZ(i) + offset.z;
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i));
    if (ax > 0.5) uv.setXY(i, z, y); else if (ay > 0.5) uv.setXY(i, x, z); else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
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
    if (o.type === 'door' && o.hinge) {
      // hinged leaf drawn open 90°: hinge 'start'/'end' of the opening, swinging to side +1/−1 of the wall
      const lt = 0.04, side = o.side || 1;
      const a0 = o.hinge === 'start' ? p0 : p1 - lt, a1 = a0 + lt;
      const n0 = side * (t / 2), n1 = side * (t / 2 + o.w - 0.03);
      const r = horiz ? [s0 + a0, c + n0, s0 + a1, c + n1] : [c + n0, s0 + a0, c + n1, s0 + a1];
      box(r, z + 0.01, top - 0.02, M(o.leaf || 'oak'));
      const hn = side * (t / 2 + o.w - 0.1);
      const hr = horiz ? [s0 + a0 - 0.02, c + hn - 0.02, s0 + a1 + 0.02, c + hn + 0.02] : [c + hn - 0.02, s0 + a0 - 0.02, c + hn + 0.02, s0 + a1 + 0.02];
      if (top > 1.1) box(hr, z + 1.0, 0.03, M('black'));    // handle near the free edge
    } else if (o.type === 'window') {
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
    const geo = new THREE.BoxGeometry(lenSlope, thick, depth);
    if (roofMat.map) meterUV(geo, new THREE.Vector3());
    const m = new THREE.Mesh(geo, roofMat);
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
