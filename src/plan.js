// 2D floor plans as SVG, drawn from data/house.json (same source as the 3D model).
// Units are meters; the SVG is sized in millimetres so it prints at 1:100 on A4.
const THICK = { ext: 0.15, int: 0.1, boundary: 0.15, low: 0.12, roster: 0.12 };
const FILL = {
  tile: '#F2EFE9', oakFloor: '#EEDFC4', terrazzo: '#E7E7E3', stone: '#DEDDD7', grass: '#E1EBD4',
  gravel: '#F1EFEA', concrete: '#E9E7E2',
};
const LEVELS = { lt1: ['site', 'lt1'], lt2: ['lt2'] };

export function codeOf(o) { const m = /^([A-Z]+\d+)\b/.exec(o.note || ''); return m ? m[1] : null; }

export function planSVG(data, level, { scale = 100 } = {}) {
  const lv = LEVELS[level];
  const pad = 1.7, X0 = -pad, Y0 = -pad, W = 9 + pad * 2, H = 14 + pad * 2;
  const mm = 1000 / scale;                                   // mm on paper per meter
  const out = [];
  const r = (x, y, w, h, attrs) => out.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" ${attrs}/>`);
  const line = (x1, y1, x2, y2, attrs) => out.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" ${attrs}/>`);
  const text = (x, y, s, attrs = '') => out.push(`<text x="${f(x)}" y="${f(y)}" ${attrs}>${esc(s)}</text>`);

  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${X0} ${Y0} ${W} ${H}" width="${f(W * mm)}mm" height="${f(H * mm)}mm" class="plan" font-family="Albert Sans, system-ui, sans-serif">`);
  out.push(`<defs>
    <pattern id="hatch" width="0.12" height="0.12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="0.12" stroke="#9C968B" stroke-width="0.012"/></pattern>
    <pattern id="roster" width="0.2" height="0.2" patternUnits="userSpaceOnUse"><rect width="0.2" height="0.2" fill="#6B665E"/><rect x="0.05" y="0.05" width="0.1" height="0.1" fill="#fff"/></pattern>
    <pattern id="deck" width="1" height="0.14" patternUnits="userSpaceOnUse"><rect width="1" height="0.14" fill="#E6D3B6"/><line x1="0" y1="0.135" x2="1" y2="0.135" stroke="#B89A72" stroke-width="0.01"/></pattern>
  </defs>`);

  // lot
  r(0, 0, 9, 14, 'fill="none" stroke="#8F8A80" stroke-width="0.02" stroke-dasharray="0.15 0.08"');

  // floors
  for (const fl of data.floors) if (lv.includes(fl.level)) {
    const [x0, y0, x1, y1] = norm(fl.rect);
    r(x0, y0, x1 - x0, y1 - y0, `fill="${FILL[fl.mat] || '#F4F2EE'}" stroke="none"`);
  }
  // deck, rugs and furniture outlines
  for (const b of data.boxes) {
    if (!lv.includes(b.level)) continue;
    const [x0, y0, x1, y1] = norm(b.rect);
    if (b.slatsTop) { r(x0, y0, x1 - x0, y1 - y0, 'fill="url(#deck)" stroke="#B89A72" stroke-width="0.012"'); continue; }
    if ((b.z || 0) > 1.2 && !['wallCabinet', 'hood', 'acIndoor', 'acOutdoor'].includes(b.type)) continue;
    if (b.mat === 'glass') { r(x0, y0, x1 - x0, y1 - y0, 'fill="#CFE1EC" stroke="#7FA3B8" stroke-width="0.01"'); continue; }
    if (b.mat === 'jute') { r(x0, y0, x1 - x0, y1 - y0, 'fill="none" stroke="#C4B79F" stroke-width="0.01" stroke-dasharray="0.05 0.04"'); continue; }
    if (b.type === 'steppingStone') { out.push(`<ellipse cx="${f((x0 + x1) / 2)}" cy="${f((y0 + y1) / 2)}" rx="${f((x1 - x0) / 2)}" ry="${f((y1 - y0) / 2)}" fill="#D3D1CA"/>`); continue; }
    const dash = ['wallCabinet', 'hood', 'acIndoor', 'acOutdoor'].includes(b.type) ? 'stroke-dasharray="0.06 0.04"' : '';
    if (b.type === 'acIndoor' || b.type === 'acOutdoor') {
      r(x0, y0, x1 - x0, y1 - y0, `fill="#DCEAF2" stroke="#4F7F9C" stroke-width="0.012" ${dash}`);
      text((x0 + x1) / 2, (y0 + y1) / 2 + 0.045, b.type === 'acIndoor' ? 'AC' : 'OU', 'font-size="0.11" font-weight="600" text-anchor="middle" fill="#2F5D7A"');
      continue;
    }
    r(x0, y0, x1 - x0, y1 - y0, `fill="#FFFFFF" fill-opacity="0.75" stroke="#A9A398" stroke-width="0.012" ${dash}`);
    if (b.type === 'bed') bedMarks(b, line);
  }
  for (const p of data.plants || []) if (lv.includes('site')) out.push(`<circle cx="${f(p.c[0])}" cy="${f(p.c[1])}" r="${f(p.type === 'tree' ? p.r : p.type === 'bamboo' ? 0.15 : p.r || 0.3)}" fill="#C9DDB6" fill-opacity="0.8" stroke="#8FB077" stroke-width="0.01"/>`);
  if (lv.includes('site')) for (const c of data.cars || []) {
    const w = (c.width || 1.85) / 2, l = (c.length || 4.75) / 2;
    r(c.c[0] - w, c.c[1] - l, w * 2, l * 2, 'fill="none" stroke="#B0AAA0" stroke-width="0.012" stroke-dasharray="0.08 0.05" rx="0.25"');
  }

  // stairs
  for (const st of data.stairs || []) {
    const below = level === 'lt2';
    for (const fl of st.flights) {
      const [x0, y0, x1, y1] = norm(fl.rect), n = fl.steps;
      r(x0, y0, x1 - x0, y1 - y0, `fill="#FFFFFF" stroke="#6B665E" stroke-width="0.012" ${below ? 'stroke-dasharray="0.06 0.04"' : ''}`);
      for (let i = 1; i < n; i++) {
        if (fl.dir === '-y' || fl.dir === '+y') { const y = y0 + (y1 - y0) * i / n; line(x0, y, x1, y, 'stroke="#6B665E" stroke-width="0.008"'); }
        else { const x = x0 + (x1 - x0) * i / n; line(x, y0, x, y1, 'stroke="#6B665E" stroke-width="0.008"'); }
      }
    }
    for (const l of st.landings || []) { const [x0, y0, x1, y1] = norm(l.rect); r(x0, y0, x1 - x0, y1 - y0, 'fill="#FFFFFF" stroke="#6B665E" stroke-width="0.012"'); }
    if (!below) {
      // walking line: up flight 1 (−y), across the landing, up flight 2 (+x)
      const a = norm(st.flights[0].rect), b = norm(st.flights[1].rect);
      const pts = [[(a[0] + a[2]) / 2, a[3] - 0.1], [(a[0] + a[2]) / 2, (b[1] + b[3]) / 2], [b[2] - 0.12, (b[1] + b[3]) / 2]];
      out.push(`<polyline points="${pts.map((q) => q.map(f).join(',')).join(' ')}" fill="none" stroke="#2F5D4A" stroke-width="0.015"/>`);
      const e = pts[2];
      out.push(`<path d="M${f(e[0] + 0.08)},${f(e[1])} l-0.14,-0.06 l0,0.12 z" fill="#2F5D4A"/>`);
      text(pts[0][0], pts[0][1] - 0.12, 'naik', 'font-size="0.13" text-anchor="middle" fill="#2F5D4A"');
    } else {
      const v = norm(st.flights[0].rect);
      text((v[0] + v[2]) / 2, (v[1] + v[3]) / 2, 'void', 'font-size="0.13" text-anchor="middle" fill="#8F8A80" transform="rotate(-90 ' + f((v[0] + v[2]) / 2) + ' ' + f((v[1] + v[3]) / 2) + ')"');
    }
  }

  // walls and openings
  const labels = [];
  for (const w of data.walls) {
    if (!lv.includes(w.level)) continue;
    const t = THICK[w.kind] || 0.15;
    const horiz = Math.abs(w.a[1] - w.b[1]) < 1e-6;
    const s0 = horiz ? Math.min(w.a[0], w.b[0]) : Math.min(w.a[1], w.b[1]);
    const len = horiz ? Math.abs(w.b[0] - w.a[0]) : Math.abs(w.b[1] - w.a[1]);
    const c = horiz ? w.a[1] : w.a[0];
    const rect = (p0, p1, tt = t, off = 0) => horiz ? [s0 + p0, c - tt / 2 + off, p1 - p0, tt] : [c - tt / 2 + off, s0 + p0, tt, p1 - p0];
    const fill = w.kind === 'roster' ? 'url(#roster)' : w.kind === 'boundary' ? '#8F8A80' : w.kind === 'low' ? '#B9B3A8' : w.kind === 'int' ? '#4A4741' : '#232220';
    const ops = [...(w.open || [])].sort((a, b) => a.at - b.at);
    let cur = 0;
    const solid = (a, b) => { if (b - a > 0.001) { const [x, y, ww, hh] = rect(a, b); r(x, y, ww, hh, `fill="${fill}"`); } };
    for (const o of ops) {
      solid(cur, o.at);
      const p0 = o.at, p1 = o.at + o.w, P = (p, n = 0) => horiz ? [s0 + p, c + n] : [c + n, s0 + p];
      if (o.type === 'window') {
        const [x, y, ww, hh] = rect(p0, p1);
        r(x, y, ww, hh, 'fill="#FFFFFF" stroke="#232220" stroke-width="0.01"');
        const [a1, a2] = [P(p0, 0), P(p1, 0)];
        line(a1[0], a1[1], a2[0], a2[1], 'stroke="#232220" stroke-width="0.01"');
      } else if (o.type === 'door') {
        const side = o.side || 1, hinge = o.hinge === 'end' ? p1 : p0, free = o.hinge === 'end' ? p0 : p1;
        const h0 = P(hinge, side * t / 2), h1 = P(hinge, side * (t / 2 + o.w)), fr = P(free, side * t / 2);
        line(h0[0], h0[1], h1[0], h1[1], 'stroke="#232220" stroke-width="0.02"');
        const sweep = arcSweep(horiz, side, o.hinge === 'end');
        out.push(`<path d="M${f(h1[0])},${f(h1[1])} A${f(o.w)},${f(o.w)} 0 0 ${sweep} ${f(fr[0])},${f(fr[1])}" fill="none" stroke="#6B665E" stroke-width="0.008" stroke-dasharray="0.04 0.03"/>`);
      } else if (o.type === 'slide' || o.type === 'sliding') {
        const n = o.leaves ? o.leaves.length : 2, pw = o.w / n;
        for (let i = 0; i < n; i++) {
          const off = (o.leaves ? (o.leaves[i] === 'fixed' ? 1 : -1) : (i % 2 ? 1 : -1)) * t * 0.22;
          const a1 = P(p0 + i * pw, off), a2 = P(p0 + (i + 1) * pw, off);
          line(a1[0], a1[1], a2[0], a2[1], 'stroke="#232220" stroke-width="0.022"');
        }
      } else if (o.type === 'gate') {
        const a1 = P(p0), a2 = P(p1);
        line(a1[0], a1[1], a2[0], a2[1], 'stroke="#98673B" stroke-width="0.05" stroke-dasharray="0.05 0.04"');
      }
      const code = codeOf(o);
      if (code) labels.push({ at: P((p0 + p1) / 2), code });
      cur = p1;
    }
    solid(cur, len);
  }
  for (const l of labels) {
    const wpx = 0.13 + l.code.length * 0.085;
    out.push(`<g class="tag"><rect x="${f(l.at[0] - wpx / 2)}" y="${f(l.at[1] - 0.1)}" width="${f(wpx)}" height="0.2" rx="0.1" fill="#2F5D4A"/>` +
      `<text x="${f(l.at[0])}" y="${f(l.at[1] + 0.05)}" font-size="0.14" font-weight="600" text-anchor="middle" fill="#FFFFFF">${l.code}</text></g>`);
  }

  // room names and sizes
  for (const fl of data.floors) if (lv.includes(fl.level) && fl.name) {
    const [x0, y0, x1, y1] = norm(fl.rect), w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const small = Math.min(w, h) < 1.6;
    const fs = small ? 0.15 : 0.2;
    text(cx, cy - (small ? 0.02 : 0.06), fl.name, `font-size="${fs}" font-weight="600" text-anchor="middle" fill="#232220" class="halo"`);
    text(cx, cy + fs * 0.9, `${num(w)} × ${num(h)} · ${num(w * h, 1)} m²`, `font-size="${fs * 0.72}" text-anchor="middle" fill="#6B665E" class="halo"`);
  }

  // dimension chains (outside the lot)
  const xs = level === 'lt1' ? [0, 2, 7, 9] : [0, 3.5, 7];
  const ys = level === 'lt1' ? [0, 1.5, 4, 4.5, 7, 8.5, 14] : [1.5, 4, 5.5, 8.5, 9.5];
  dimChain(out, xs, 'x', -0.75); dimChain(out, [0, 9], 'x', -1.25);
  dimChain(out, ys, 'y', -0.75); dimChain(out, [0, 14], 'y', -1.25);

  // north arrow and scale bar
  out.push(`<g transform="translate(${f(9 + 0.9)},${f(-1.0)})"><circle r="0.32" fill="none" stroke="#232220" stroke-width="0.015"/>` +
    `<path d="M0,-0.28 L0.12,0.16 L0,0.08 L-0.12,0.16 z" fill="#232220"/><text y="-0.38" font-size="0.18" font-weight="600" text-anchor="middle">U</text></g>`);
  const sy = 14 + 1.15;
  for (let i = 0; i < 3; i++) r(i, sy, 1, 0.08, `fill="${i % 2 ? '#FFFFFF' : '#232220'}" stroke="#232220" stroke-width="0.01"`);
  for (let i = 0; i <= 3; i++) text(i, sy + 0.3, `${i}`, 'font-size="0.15" text-anchor="middle"');
  text(3.25, sy + 0.08, 'm', 'font-size="0.15"');
  text(9, sy + 0.3, `skala 1:${scale}`, 'font-size="0.15" text-anchor="end" fill="#6B665E"');

  out.push('</svg>');
  return out.join('\n');
}

// door / window schedule rows for both floors
export function openingSchedule(data) {
  const rows = [];
  for (const w of data.walls) for (const o of w.open || []) {
    const code = codeOf(o);
    if (!code) continue;
    const kind = { window: 'Jendela', door: 'Pintu engsel', slide: 'Pintu geser', sliding: 'Pintu geser kaca', gate: 'Pintu pagar', opening: 'Bukaan' }[o.type] || o.type;
    const head = o.head ?? 2.1, sill = o.type === 'window' ? (o.sill ?? 0.9) : 0;
    rows.push({ code, kind, level: data.levels[w.level === 'site' ? 'lt1' : w.level].name, w: o.w, h: head - sill, sill, note: (o.note || '').replace(/^[A-Z]+\d+\s*/, '') });
  }
  const order = (c) => ({ P: 0, PL: 1, PG: 2, PK: 3, B: 4, J: 5 }[c.replace(/\d+/, '')] ?? 9) * 100 + parseInt(c.replace(/\D+/, ''), 10);
  return rows.sort((a, b) => order(a.code) - order(b.code));
}

function bedMarks(b, line) {
  const [x0, y0, x1, y1] = norm(b.rect), face = b.face || '+y';
  const d = 0.07;
  if (face === '+y') line(x0, y0 + d, x1, y0 + d, 'stroke="#A9A398" stroke-width="0.012"');
  if (face === '-y') line(x0, y1 - d, x1, y1 - d, 'stroke="#A9A398" stroke-width="0.012"');
  if (face === '+x') line(x0 + d, y0, x0 + d, y1, 'stroke="#A9A398" stroke-width="0.012"');
  if (face === '-x') line(x1 - d, y0, x1 - d, y1, 'stroke="#A9A398" stroke-width="0.012"');
}
function arcSweep(horiz, side, hingeEnd) {
  // SVG sweep flag for the quarter circle from the open leaf tip back to the free jamb
  const s = (horiz ? 1 : -1) * side * (hingeEnd ? -1 : 1);
  return s > 0 ? 0 : 1;
}
function dimChain(out, stops, axis, off) {
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1], m = (a + b) / 2;
    if (axis === 'x') {
      out.push(`<line x1="${f(a)}" y1="${f(off)}" x2="${f(b)}" y2="${f(off)}" stroke="#6B665E" stroke-width="0.01"/>`);
      for (const v of [a, b]) out.push(`<line x1="${f(v - 0.06)}" y1="${f(off + 0.06)}" x2="${f(v + 0.06)}" y2="${f(off - 0.06)}" stroke="#232220" stroke-width="0.015"/>`);
      out.push(`<text x="${f(m)}" y="${f(off - 0.07)}" font-size="0.15" text-anchor="middle" fill="#232220">${num(b - a)}</text>`);
    } else {
      out.push(`<line x1="${f(off)}" y1="${f(a)}" x2="${f(off)}" y2="${f(b)}" stroke="#6B665E" stroke-width="0.01"/>`);
      for (const v of [a, b]) out.push(`<line x1="${f(off - 0.06)}" y1="${f(v + 0.06)}" x2="${f(off + 0.06)}" y2="${f(v - 0.06)}" stroke="#232220" stroke-width="0.015"/>`);
      out.push(`<text x="${f(off - 0.07)}" y="${f(m)}" font-size="0.15" text-anchor="middle" fill="#232220" transform="rotate(-90 ${f(off - 0.07)} ${f(m)})">${num(b - a)}</text>`);
    }
  }
}
function norm([a, b, c, d]) { return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)]; }
function f(v) { return Math.round(v * 1000) / 1000; }
function num(v, dec = 2) { return v.toLocaleString('id-ID', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
