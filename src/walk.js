// First-person walk through the house: joystick (phone) or WASD/arrows (desktop) to move, drag to look.
// Collision and floor heights come straight from house.json: walls (with their door openings),
// furniture footprints, the two stair flights and landing, and the floor-2 slabs.
const THICK = { ext: 0.15, int: 0.1, boundary: 0.15, low: 0.12, roster: 0.12 };
const PASSABLE = new Set(['door', 'slide', 'opening', 'sliding', 'swing', 'gate', 'bifold']);
const RADIUS = 0.2, EYE = 1.55, STEP = 0.5, WALK = 1.3, RUN = 2.6;

export function createWalk({ viewer, data, overlay, joystick }) {
  const world = buildWorld(data);
  const p = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  const keys = new Set();
  const stick = { x: 0, y: 0 };
  let active = false;

  // ---- input ----
  const onKey = (e) => {
    if (!active) return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
      e.type === 'keydown' ? keys.add(k) : keys.delete(k); e.preventDefault();
    }
  };
  window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);

  const canvas = viewer.renderer.domElement;
  let look = null;
  canvas.addEventListener('pointerdown', (e) => { if (active) { look = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); } });
  canvas.addEventListener('pointermove', (e) => {
    if (!active || !look || e.pointerId !== look.id) return;
    p.yaw -= (e.clientX - look.x) * 0.0045;
    p.pitch = clamp(p.pitch - (e.clientY - look.y) * 0.0045, -1.2, 1.1);
    look.x = e.clientX; look.y = e.clientY;
  });
  const endLook = (e) => { if (look && e.pointerId === look.id) look = null; };
  canvas.addEventListener('pointerup', endLook); canvas.addEventListener('pointercancel', endLook);

  const knob = joystick.querySelector('span');
  let joy = null;
  joystick.addEventListener('pointerdown', (e) => {
    const r = joystick.getBoundingClientRect();
    joy = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2, R: r.width / 2 };
    joystick.setPointerCapture(e.pointerId); moveJoy(e); e.preventDefault();
  });
  const moveJoy = (e) => {
    if (!joy || e.pointerId !== joy.id) return;
    let dx = (e.clientX - joy.cx) / joy.R, dy = (e.clientY - joy.cy) / joy.R;
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    stick.x = dx; stick.y = dy;
    knob.style.transform = `translate(${dx * joy.R * 0.55}px, ${dy * joy.R * 0.55}px)`;
  };
  joystick.addEventListener('pointermove', moveJoy);
  const endJoy = (e) => { if (joy && e.pointerId === joy.id) { joy = null; stick.x = stick.y = 0; knob.style.transform = ''; } };
  joystick.addEventListener('pointerup', endJoy); joystick.addEventListener('pointercancel', endJoy);

  // ---- per frame ----
  viewer.onFrame((dt) => {
    if (!active) return;
    dt = Math.min(dt, 0.05);
    let fwd = -stick.y, str = stick.x;
    if (keys.has('w') || keys.has('arrowup')) fwd += 1;
    if (keys.has('s') || keys.has('arrowdown')) fwd -= 1;
    if (keys.has('a')) str -= 1;
    if (keys.has('d')) str += 1;
    if (keys.has('arrowleft')) p.yaw += 1.8 * dt;
    if (keys.has('arrowright')) p.yaw -= 1.8 * dt;
    step(world, p, fwd, str, keys.has('shift') || Math.hypot(stick.x, stick.y) > 0.95, dt);
    const cam = viewer.camera;
    cam.position.set(p.x, p.z + EYE, p.y);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(p.pitch, p.yaw, 0);
  });

  function teleport(spot) {
    p.x = spot.at[0]; p.y = spot.at[1];
    p.z = (data.levels[spot.level] || { z: 0 }).z;
    p.yaw = ((spot.yaw || 0) * Math.PI) / 180; p.pitch = -0.05;
  }

  return {
    enter(spot) {
      active = true; viewer.setOrbit(false); overlay.hidden = false;
      viewer.camera.fov = viewer.camera.aspect < 1 ? 82 : 68; viewer.camera.updateProjectionMatrix();
      const tip = overlay.querySelector('.tip'); if (tip) { tip.hidden = false; setTimeout(() => { tip.hidden = true; }, 7000); }
      teleport(spot || data.walk.start);
    },
    exit() {
      active = false; keys.clear(); stick.x = stick.y = 0; overlay.hidden = true;
      viewer.camera.rotation.set(0, 0, 0); viewer.setOrbit(true);
    },
    teleport,
    get active() { return active; },
  };
}

// ---------------------------------------------------------------------------
// one movement step (pure, so it can be tested without a browser)
export function step(world, p, fwd, str, run, dt) {
  const len = Math.hypot(fwd, str);
  if (len > 1) { fwd /= len; str /= len; }
  const speed = (run ? RUN : WALK) * dt;
  // camera looks along −Z at yaw 0; plan y is three Z
  const dx = (-Math.sin(p.yaw) * fwd + Math.cos(p.yaw) * str) * speed;
  const dy = (-Math.cos(p.yaw) * fwd - Math.sin(p.yaw) * str) * speed;
  if (dx || dy) { tryMove(world, p, dx, 0); tryMove(world, p, 0, dy); }
  // floor: highest surface within a step of the feet; fall gently if there is none
  const f = floorAt(world.supports, p.x, p.y, p.z + STEP);
  p.z = f > p.z ? f : Math.max(f, p.z - 7 * dt);
}

function tryMove(world, p, dx, dy) {
  const nx = p.x + dx, ny = p.y + dy;
  const f = floorAt(world.supports, nx, ny, p.z + STEP);
  const zb = Math.max(p.z, f) + 0.3, zt = Math.max(p.z, f) + 1.75;
  for (const b of world.blockers) {
    if (b.zt <= zb || b.zb >= zt) continue;
    if (circleHitsRect(nx, ny, RADIUS, b.r)) return;        // blocked on this axis: slide along the other
  }
  p.x = clamp(nx, -4, 13); p.y = clamp(ny, -2, 18);
}

export function buildWorld(data) { return { blockers: buildBlockers(data), supports: buildSupports(data) }; }

function buildBlockers(data) {
  const out = [];
  const L = data.levels;
  for (const w of data.walls || []) {
    const z0 = (L[w.level] || { z: 0 }).z, h = w.h || (L[w.level] && L[w.level].h) || 2.4;
    const t = (THICK[w.kind] || 0.15) / 2;
    const horiz = Math.abs(w.a[1] - w.b[1]) < 1e-6;
    const s0 = horiz ? Math.min(w.a[0], w.b[0]) : Math.min(w.a[1], w.b[1]);
    const len = horiz ? Math.abs(w.b[0] - w.a[0]) : Math.abs(w.b[1] - w.a[1]);
    const c = horiz ? w.a[1] : w.a[0];
    const gaps = [];
    for (const o of w.open || []) {
      if (!PASSABLE.has(o.type)) continue;
      if (!o.leaves) { gaps.push([o.at, o.at + o.w]); continue; }
      const pw = o.w / o.leaves.length;                       // fixed glass panes stay solid
      o.leaves.forEach((k, i) => { if (k !== 'fixed') gaps.push([o.at + i * pw, o.at + (i + 1) * pw]); });
    }
    gaps.sort((a, b) => a[0] - b[0]);
    let cur = 0;
    const seg = (a, b) => {
      if (b - a < 0.01) return;
      out.push({ r: horiz ? [s0 + a, c - t, s0 + b, c + t] : [c - t, s0 + a, c + t, s0 + b], zb: z0, zt: z0 + h });
    };
    for (const [a, b] of gaps) { seg(cur, a); cur = Math.max(cur, b); }
    seg(cur, len);
  }
  for (const b of data.boxes || []) {
    const h = b.h ?? 0.75;
    if (h < 0.25 || (b.z || 0) > 1.2 || b.type === 'steppingStone' || b.mat === 'jute') continue;
    if (b.type === 'hood' || b.type === 'tv' || b.type === 'wallCabinet') continue;
    const z0 = (L[b.level] || { z: 0 }).z + (b.z || 0);
    out.push({ r: norm(b.rect), zb: z0, zt: z0 + h });
  }
  for (const c of data.cars || []) {
    const W = (c.width || 1.85) / 2, Lh = (c.length || 4.75) / 2;
    out.push({ r: [c.c[0] - W, c.c[1] - Lh, c.c[0] + W, c.c[1] + Lh], zb: 0, zt: 1.8 });
  }
  for (const p of data.plants || []) {
    const r = p.type === 'tree' ? 0.15 : p.type === 'bamboo' ? 0.12 : (p.r || 0.3) * 0.8;
    out.push({ r: [p.c[0] - r, p.c[1] - r, p.c[0] + r, p.c[1] + r], zb: 0, zt: 2 });
  }
  return out;
}

function buildSupports(data) {
  const s = [];
  for (const sl of data.slabs || []) s.push({ r: norm(sl.rect), z: () => sl.z + sl.t });
  for (const st of data.stairs || []) {
    const base = (data.levels[st.level] || { z: 0 }).z;
    for (const f of st.flights) {
      const [x0, y0, x1, y1] = norm(f.rect);
      const lerp = (t) => base + f.z0 + (f.z1 - f.z0) * clamp(t, 0, 1);
      const fn = {
        '-y': (x, y) => lerp((y1 - y) / (y1 - y0)), '+y': (x, y) => lerp((y - y0) / (y1 - y0)),
        '+x': (x) => lerp((x - x0) / (x1 - x0)), '-x': (x) => lerp((x1 - x) / (x1 - x0)),
      }[f.dir];
      s.push({ r: [x0, y0, x1, y1], z: fn });
    }
    for (const l of st.landings || []) s.push({ r: norm(l.rect), z: () => base + l.z });
  }
  return s;
}

function floorAt(supports, x, y, maxZ) {
  let best = 0;
  for (const s of supports) {
    const [x0, y0, x1, y1] = s.r;
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const z = s.z(x, y);
    if (z <= maxZ && z > best) best = z;
  }
  return best;
}

function circleHitsRect(cx, cy, r, [x0, y0, x1, y1]) {
  const qx = clamp(cx, x0, x1), qy = clamp(cy, y0, y1);
  return (cx - qx) ** 2 + (cy - qy) ** 2 < r * r;
}
function norm([a, b, c, d]) { return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)]; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
