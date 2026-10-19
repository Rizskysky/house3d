// Entry point: loads data/house.json, wires the controls, rebuilds the model on every change.
// Same cache-busting query as index.html, so a new deploy never mixes fresh data with stale code.
const bust = new URL(import.meta.url).search;
const { createViewer } = await import(`./viewer.js${bust}`);
const { buildHouse } = await import(`./geometry.js${bust}`);

const $ = (s) => document.querySelector(s);
const phone = window.matchMedia('(max-width: 640px)').matches;
const state = { view: 'all', roof: true, cut: true, labels: false, context: true, camera: 'iso', night: false, quality: phone ? 'std' : 'high' };

// deep link: #lt1, #lt2, #all and/or a camera id, e.g. #lt1-top
for (const part of location.hash.replace('#', '').split('-')) {
  if (['all', 'lt1', 'lt2'].includes(part)) state.view = part;
  if (part === 'malam') state.night = true;
}

const viewer = createViewer($('#stage'));
if (phone) {
  $('#panel').dataset.open = 'false'; $('#panel-toggle').setAttribute('aria-expanded', 'false');
}
let data;

try {
  const res = await fetch('data/house.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  data = await res.json();
} catch (e) {
  $('#status').textContent = `data/house.json gagal dimuat (${e.message}). Buka lewat server lokal atau GitHub Pages, bukan langsung dari file.`;
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
  state.night = b.dataset.time === 'night'; viewer.setNight(state.night); sync();
}));
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

$('#panel-toggle').addEventListener('click', () => {
  const p = $('#panel'); const open = p.dataset.open !== 'true';
  p.dataset.open = String(open); $('#panel-toggle').setAttribute('aria-expanded', String(open));
});

function rebuild() { viewer.setModel(buildHouse(data, state)); }
function sync() {
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
  document.querySelectorAll('[data-toggle]').forEach((b) => {
    b.setAttribute('aria-pressed', String(!!state[b.dataset.toggle]));
    const k = b.dataset.toggle;
    b.disabled = (k === 'roof' && state.view !== 'all') || (k === 'cut' && state.view === 'all');
  });
  document.querySelectorAll('[data-cam]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cam === state.camera)));
  document.querySelectorAll('[data-time]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.time === 'night') === state.night)));
  document.querySelectorAll('[data-quality]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.quality === state.quality)));
  const tag = `${state.view}-${state.camera}${state.night ? '-malam' : ''}`;
  if (location.hash !== `#${tag}`) history.replaceState(null, '', `#${tag}`);
}

viewer.setQuality(state.quality);
viewer.setNight(state.night);
rebuild();
viewer.setCamera(data.cameras[state.camera]);
sync();
window.__house = { data, state, viewer, rebuild };
document.body.dataset.ready = 'true';
