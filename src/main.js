// Entry point: loads data/house.json, wires the controls, rebuilds the model on every change.
// Same cache-busting query as index.html, so a new deploy never mixes fresh data with stale code.
const bust = new URL(import.meta.url).search;
const { createViewer } = await import(`./viewer.js${bust}`);
const { buildHouse } = await import(`./geometry.js${bust}`);
const { createWalk } = await import(`./walk.js${bust}`);
const THREE = await import('three');

const $ = (s) => document.querySelector(s);
const phone = window.matchMedia('(max-width: 640px)').matches;
const state = { view: 'all', roof: true, cut: true, labels: false, context: true, camera: 'iso', time: 'pagi', night: false, quality: phone ? 'std' : 'high' };
// ?varian=barat loads the mirrored comparison plan (garden on the side-street), built by tools/mirror.py
const variant = new URLSearchParams(location.search).get('varian') === 'barat' ? 'barat' : 'timur';
const dataFile = variant === 'barat' ? 'data/house-barat.json' : 'data/house.json';

// deep link: #lt1, #lt2, #all and/or a camera id, e.g. #lt1-top
for (const part of location.hash.replace('#', '').split('-')) {
  if (['all', 'lt1', 'lt2'].includes(part)) state.view = part;
  if (part === 'malam' || part === 'sore') state.time = part;
}

const viewer = createViewer($('#stage'));
if (phone) {
  $('#panel').dataset.open = 'false'; $('#panel-toggle').setAttribute('aria-expanded', 'false');
}
let data;

try {
  const res = await fetch(dataFile, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  data = await res.json();
} catch (e) {
  $('#status').textContent = `${dataFile} gagal dimuat (${e.message}). Buka lewat server lokal atau GitHub Pages, bukan langsung dari file.`;
  $('#status').hidden = false;
  throw e;
}

for (const part of location.hash.replace('#', '').split('-')) if (data.cameras[part]) state.camera = part;

$('#version').textContent = data.meta.version;
$('#area').textContent = `LB ±${data.meta.lb.total} m² · lantai 1 ±${data.meta.lb.lt1} m² · lantai 2 ±${data.meta.lb.lt2} m²`;

// camera chips from data
const camWrap = $('#cams');
for (const [id, c] of Object.entries(data.cameras)) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip'; b.dataset.cam = id; b.textContent = c.label;
  b.addEventListener('click', () => { state.camera = id; viewer.setCamera(data.cameras[id]); sync(); });
  camWrap.appendChild(b);
}

document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
  state.view = b.dataset.view; rebuild(); sync();
}));
document.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
  const k = b.dataset.toggle; state[k] = !state[k]; rebuild(); sync();
}));

document.querySelectorAll('[data-time]').forEach((b) => b.addEventListener('click', () => {
  setTime(b.dataset.time); sync();
}));
function setTime(t) {
  state.time = t; state.night = t === 'malam';
  if (!state.night) viewer.setSun(t);
  viewer.setNight(state.night);
}
document.querySelectorAll('[data-variant]').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.variant === variant) return;
  location.href = location.pathname + (b.dataset.variant === 'barat' ? '?varian=barat' : '') + location.hash;
}));
if (variant === 'barat') $('#doclink').href = 'docs.html?varian=barat';
document.querySelectorAll('[data-quality]').forEach((b) => b.addEventListener('click', () => {
  state.quality = b.dataset.quality; viewer.setQuality(state.quality); sync();
}));

$('#save').addEventListener('click', async () => {
  const blob = await viewer.snapshot();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `house3d-${state.view}-${state.camera}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
});

// ---- walk mode ----
const walk = createWalk({ viewer, data, overlay: $('#walk'), joystick: $('#joy') });
const spotSel = $('#walk-spot');
data.walk.spots.forEach((s, i) => { const o = document.createElement('option'); o.value = i; o.textContent = s.label; spotSel.appendChild(o); });
let beforeWalk = null;
$('#walk-btn').addEventListener('click', () => {
  beforeWalk = { view: state.view, roof: state.roof };
  state.view = 'all'; state.roof = true; rebuild(); sync();
  closeInfo(); document.body.classList.add('walking');
  spotSel.value = '0'; walk.enter(data.walk.spots[0]);
});
spotSel.addEventListener('change', () => walk.teleport(data.walk.spots[+spotSel.value]));
$('#walk-exit').addEventListener('click', () => {
  walk.exit(); document.body.classList.remove('walking');
  Object.assign(state, beforeWalk); rebuild();
  viewer.setCamera(data.cameras[state.camera]); sync();
});

// ---- tap a room ----
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let tap = null;
const canvas = viewer.renderer.domElement;
canvas.addEventListener('pointerdown', (e) => { tap = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  if (!tap || walk.active) return;
  const moved = Math.hypot(e.clientX - tap.x, e.clientY - tap.y), quick = performance.now() - tap.t < 450;
  tap = null;
  if (moved > 6 || !quick) return;
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, viewer.camera);
  const hit = ray.intersectObject(viewer.getModel(), true).find((h) => h.object.visible && !h.object.isSprite);
  if (!hit) return closeInfo();
  const room = roomAt(hit.point.x, hit.point.z, hit.point.y);
  room ? openInfo(room) : closeInfo();
});
function roomAt(x, y, z) {
  const levels = z >= data.levels.lt2.z - 0.1 ? ['lt2'] : ['lt1', 'site'];
  const named = data.floors.filter((f) => f.name && levels.includes(f.level));
  const inside = named.filter((f) => { const [a, b, c, d] = f.rect; return x >= Math.min(a, c) && x <= Math.max(a, c) && y >= Math.min(b, d) && y <= Math.max(b, d); });
  inside.sort((p, q) => (p.level === 'site') - (q.level === 'site') || area(p.rect) - area(q.rect));
  return inside[0] || null;
}
const area = ([a, b, c, d]) => Math.abs(c - a) * Math.abs(d - b);
const fmt = (n) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
function openInfo(f) {
  const [a, b, c, d] = f.rect, w = Math.abs(c - a), l = Math.abs(d - b);
  $('#info-name').textContent = f.name;
  $('#info-size').textContent = `${fmt(w)} × ${fmt(l)} m · ${fmt(w * l)} m² · ${data.levels[f.level].name}`;
  $('#info').hidden = false;
  viewer.highlight([Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)], data.levels[f.level].z + (f.z || 0));
}
function closeInfo() { $('#info').hidden = true; viewer.clearHighlight(); }
$('#info-close').addEventListener('click', closeInfo);

// ---- high-quality still ----
$('#hq-btn').addEventListener('click', async () => {
  const frames = phone ? 16 : 32, long = phone ? 1920 : 2560;
  $('#hq').hidden = false; $('#hq-bar').max = frames; $('#hq-bar').value = 0;
  $('#hq-text').textContent = 'Merender gambar kualitas tinggi…';
  try {
    const blob = await viewer.renderHQ({ long, frames, onProgress: (i, n) => { $('#hq-bar').value = i; $('#hq-text').textContent = `Merender gambar kualitas tinggi… ${i}/${n}`; } });
    download(blob, `house3d-hq${variant === 'barat' ? '-barat' : ''}-${state.view}-${state.camera}${state.time !== 'pagi' ? '-' + state.time : ''}.png`);
  } catch (e) {
    console.error(e); alert('Render gagal: ' + e.message);
  } finally { $('#hq').hidden = true; }
});
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

$('#panel-toggle').addEventListener('click', () => {
  const p = $('#panel'); const open = p.dataset.open !== 'true';
  p.dataset.open = String(open); $('#panel-toggle').setAttribute('aria-expanded', String(open));
});

function rebuild() { viewer.setModel(buildHouse(data, state)); if (!$('#info').hidden) closeInfo(); }
function sync() {
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
  document.querySelectorAll('[data-toggle]').forEach((b) => {
    b.setAttribute('aria-pressed', String(!!state[b.dataset.toggle]));
    const k = b.dataset.toggle;
    b.disabled = (k === 'roof' && state.view !== 'all') || (k === 'cut' && state.view === 'all');
  });
  document.querySelectorAll('[data-cam]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cam === state.camera)));
  document.querySelectorAll('[data-time]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.time === state.time)));
  document.querySelectorAll('[data-variant]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.variant === variant)));
  document.querySelectorAll('[data-quality]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.quality === state.quality)));
  const tag = `${state.view}-${state.camera}${state.time !== 'pagi' ? '-' + state.time : ''}`;
  if (location.hash !== `#${tag}`) history.replaceState(null, '', `#${tag}`);
}

viewer.setQuality(state.quality);
setTime(state.time);
rebuild();
viewer.setCamera(data.cameras[state.camera]);
sync();
window.__house = { data, state, viewer, rebuild, walk, openInfo, roomAt, setTime, variant };
document.body.dataset.ready = 'true';
