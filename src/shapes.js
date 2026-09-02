// Shape recognition for the hold-still gesture: keep the tip still at the end
// of a stroke and the drawn points are replaced by an idealised shape. Built
// here rather than pulled from Excalidraw or tldraw, which bring their own
// document model and file format and would break the invariant that a figure
// is a plain SVG.
//
// The output is always an ordinary list of points, so the scene format and the
// eraser's hit test keep working unchanged.

// Better to miss a shape than to ruin a stroke that was meant as it was drawn.
// The thresholds are deliberately tight: a sloppy circle should snap, a
// deliberate scribble should not.
const MIN_POINTS = 8;
const MIN_SIZE = 30; // below this it is a dot, a tick or a letter
const LINE_TOL = 0.08; // deviation from a straight line, as a fraction of length
const CLOSED_TOL = 0.2; // start-to-end distance, as a fraction of path length
// Fit against ellipse and rectangle. Both are measured as the mean distance
// from the points to the shape divided by half the diagonal — the same scale.
const SHAPE_TOL = 0.08;

const EDGE_STEP = 12; // spacing of points along a rectangle's edges
const CORNER_REPEATS = 8; // repeats at each corner, see rectangle()
const QUANTILE = 0.03; // how much of the extremes the fitting box ignores

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function boundingBox(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1, width: x1 - x0, height: y1 - y0 };
}

const quantile = (v, q) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.round(q * (s.length - 1)))];
};

// The box the shape is fitted against, with the extremes trimmed off. A single
// overshooting point must not be able to inflate the box so that all the others
// end up inside the edge — that is exactly what turns a shaky square into a
// circle, and a square with rounded corners into a circle at merely moderate
// wobble.
function fitBox(points) {
  const x0 = quantile(points.map((p) => p.x), QUANTILE);
  const x1 = quantile(points.map((p) => p.x), 1 - QUANTILE);
  const y0 = quantile(points.map((p) => p.y), QUANTILE);
  const y1 = quantile(points.map((p) => p.y), 1 - QUANTILE);
  return { x0, y0, x1, y1, width: x1 - x0, height: y1 - y0 };
}

const pathLength = (points) => {
  let s = 0;
  for (let i = 1; i < points.length; i++) s += dist(points[i - 1], points[i]);
  return s;
};

// Perpendicular distance from p to the line ab.
function distanceToLine(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return dist(p, a);
  return Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / len;
}

function line(points) {
  const a = points[0];
  const b = points[points.length - 1];
  const length = dist(a, b);
  if (length < MIN_SIZE) return null;
  let worst = 0;
  for (const p of points) worst = Math.max(worst, distanceToLine(p, a, b));
  if (worst > Math.max(4, LINE_TOL * length)) return null;
  return { kind: 'line', points: [{ ...a }, { ...b }], error: worst / length };
}

// Fit against the ellipse that fills the box. An ellipse rather than a circle
// makes the gesture forgiving: a freehand circle is rarely round.
function ellipse(box, points, halfDiagonal) {
  const rx = box.width / 2;
  const ry = box.height / 2;
  if (rx < MIN_SIZE / 2 || ry < MIN_SIZE / 2) return null;
  const cx = box.x0 + rx;
  const cy = box.y0 + ry;
  let sum = 0;
  for (const p of points) {
    const r = Math.hypot((p.x - cx) / rx, (p.y - cy) / ry);
    // Distance to the ellipse, not the relative radius deviation. Otherwise
    // the error cannot be compared with the rectangle's, and a shaky circle
    // loses to the rectangle whose error sits still around 0.035.
    const local = r > 1e-6 ? Math.hypot(p.x - cx, p.y - cy) / r : rx;
    sum += Math.abs(r - 1) * local;
  }
  const error = sum / points.length / halfDiagonal;
  if (error > SHAPE_TOL) return null;

  const out = [];
  const steps = 72;
  for (let i = 0; i <= steps; i++) {
    const v = (i / steps) * Math.PI * 2;
    out.push({ x: cx + rx * Math.cos(v), y: cy + ry * Math.sin(v) });
  }
  return { kind: 'circle', points: out, error };
}

// Fit against the box edges: a rectangle has every point close to an edge.
function rectangle(box, points, halfDiagonal) {
  if (box.width < MIN_SIZE || box.height < MIN_SIZE) return null;
  let sum = 0;
  for (const p of points) {
    const dx = Math.min(Math.abs(p.x - box.x0), Math.abs(p.x - box.x1));
    const dy = Math.min(Math.abs(p.y - box.y0), Math.abs(p.y - box.y1));
    sum += Math.min(dx, dy);
  }
  const error = sum / points.length / halfDiagonal;
  if (error > SHAPE_TOL) return null;

  const corners = [
    { x: box.x0, y: box.y0 },
    { x: box.x1, y: box.y0 },
    { x: box.x1, y: box.y1 },
    { x: box.x0, y: box.y1 },
    { x: box.x0, y: box.y0 },
  ];
  // Every corner is repeated. perfect-freehand smooths its input with a moving
  // average (streamline), and with a single point at the corner the average
  // never catches up — the corner is then cut by 5.7 px. Eight repeats bring
  // that down to 0.51 px, which is the floor set by the round join and the
  // Q curve in pathFromOutline. Denser points along the edges help less.
  const out = [];
  for (let i = 1; i < corners.length; i++) {
    const a = corners[i - 1];
    const b = corners[i];
    const len = dist(a, b);
    for (let k = 0; k < CORNER_REPEATS; k++) out.push({ ...a });
    for (let d = EDGE_STEP; d < len; d += EDGE_STEP) {
      out.push({ x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len });
    }
  }
  for (let k = 0; k < CORNER_REPEATS; k++) out.push({ ...corners[0] });
  return { kind: 'rectangle', points: out, error };
}

/**
 * Recognises a shape in a stroke. Returns { kind, points } or null when
 * nothing fits well enough — then the stroke is kept as it was drawn.
 */
export function recognise(points) {
  if (!points || points.length < MIN_POINTS) return null;
  const box = boundingBox(points);
  if (Math.hypot(box.width, box.height) < MIN_SIZE) return null;

  const straight = line(points);
  if (straight) return straight;

  // Closed shapes only if the stroke actually went around.
  const around = pathLength(points);
  if (around < 1e-6 || dist(points[0], points[points.length - 1]) > CLOSED_TOL * around) return null;

  const fit = fitBox(points);
  const halfDiagonal = Math.hypot(fit.width, fit.height) / 2;
  const candidates = [rectangle(fit, points, halfDiagonal), ellipse(fit, points, halfDiagonal)].filter(Boolean);
  if (!candidates.length) return null;
  return candidates.sort((a, b) => a.error - b.error)[0];
}
