// Winder (anak tangga putar) geometry shared by the 3D model, the plans and walk mode.
// A winder set fills a corner rect with `steps` wedge-shaped treads that fan out from `pivot`
// (the inner corner), from angle a0 to a1 (degrees, plan coordinates: 0 = +x/east, −90 = −y/north).
// Tread i rises to z0 + (z1 − z0) · (i + 1) / steps.

export function winderPolys(w) {
  const [x0, y0, x1, y1] = norm(w.rect), [px, py] = w.pivot, n = w.steps;
  const rad = (a) => (a * Math.PI) / 180;
  const hit = (a) => {                                   // where the ray from the pivot leaves the rect
    const dx = Math.cos(rad(a)), dy = Math.sin(rad(a));
    const tx = dx > 1e-9 ? (x1 - px) / dx : dx < -1e-9 ? (x0 - px) / dx : Infinity;
    const ty = dy > 1e-9 ? (y1 - py) / dy : dy < -1e-9 ? (y0 - py) / dy : Infinity;
    const t = Math.min(tx, ty);
    return [px + dx * t, py + dy * t];
  };
  const span = w.a1 - w.a0;
  const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
    .filter(([cx, cy]) => Math.hypot(cx - px, cy - py) > 1e-6)
    .map(([cx, cy]) => ({ p: [cx, cy], s: (deg(Math.atan2(cy - py, cx - px)) - w.a0) / span }));
  const out = [];
  for (let i = 0; i < n; i++) {
    const s0 = i / n, s1 = (i + 1) / n;
    const pts = [[px, py], hit(w.a0 + span * s0)];
    for (const c of corners.filter((c) => c.s > s0 + 1e-6 && c.s < s1 - 1e-6).sort((a, b) => a.s - b.s)) pts.push(c.p);
    pts.push(hit(w.a0 + span * s1));
    out.push({ pts, top: w.z0 + ((w.z1 - w.z0) * (i + 1)) / n });
  }
  return out;
}

// height of the winder tread under plan point (x, y), or null outside the rect
export function winderHeight(w, x, y) {
  const [x0, y0, x1, y1] = norm(w.rect);
  if (x < x0 || x > x1 || y < y0 || y > y1) return null;
  const a = deg(Math.atan2(y - w.pivot[1], x - w.pivot[0]));
  const s = Math.min(Math.max((a - w.a0) / (w.a1 - w.a0), 0), 0.9999);
  const i = Math.floor(s * w.steps);
  return w.z0 + ((w.z1 - w.z0) * (i + 1)) / w.steps;
}

function deg(r) { return (r * 180) / Math.PI; }
function norm([a, b, c, d]) { return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)]; }
