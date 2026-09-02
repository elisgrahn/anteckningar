// A figure is an SVG file Typst renders directly, with the raw scene embedded
// in a comment at the end. The file is therefore both picture and editable
// document, which is what lets a figure be added to later instead of redrawn.

import { getStroke } from 'perfect-freehand';

// Written into every figure on disk. Changing it makes older figures
// unreadable, so it is migrated deliberately, not casually.
const SCENE_OPEN = '<!--scene:';
const SCENE_CLOSE = '-->';

// Drawn pixels per point. Size on paper therefore follows what was actually
// drawn: a small sketch stays small, a large one stays large, and two figures
// drawn the same size on screen come out the same size.
export const SCALE = 2.0;

// The width Canvas.jsx draws with, as a fallback for an empty scene.
const WIDTH = 2.4;

// Padding follows the line width rather than being constant, so a thin sketch
// does not get a frame sized for a thick stroke.
const padding = (strokes) => 8 * Math.max(WIDTH, ...strokes.map((s) => s.width || 0));

// perfect-freehand's outline is a closed polygon (array of [x, y]). The usual
// pattern for turning it into a d attribute: M to the first point, one Q per
// segment through the next point's midpoint (which softens the corners),
// closed with Z. Shared by Canvas.jsx (Path2D) and toSvg below.
export function pathFromOutline(outline) {
  if (!outline.length) return '';
  const [x0, y0] = outline[0];
  let d = `M ${x0.toFixed(1)} ${y0.toFixed(1)}`;
  for (let i = 0; i < outline.length; i++) {
    const [x, y] = outline[i];
    const [nx, ny] = outline[(i + 1) % outline.length];
    d += ` Q ${x.toFixed(1)} ${y.toFixed(1)} ${((x + nx) / 2).toFixed(1)} ${((y + ny) / 2).toFixed(1)}`;
  }
  return d + ' Z';
}

// thinning: 0 and simulatePressure: false turn off the library's guess at pen
// pressure — we draw at a fixed width (stroke.width), and without them the
// stroke comes out unevenly thick. getStroke handles a single point (a dot)
// and two points (a capsule) on its own, so no special case is needed here.
// last: true draws the outline all the way to the final point; without it the
// stroke ends a few pixels behind the pen, and the error grows with the size.
//
// Shared so that the two drawing surfaces and the saved file cannot drift apart
// on these options.
export function outlineOf(points, size) {
  return getStroke(points, { size, thinning: 0, simulatePressure: false, last: true });
}

function pathFrom(points, width) {
  return pathFromOutline(outlineOf(points, width));
}

function bounds(strokes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) {
    for (const p of s.points) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  }
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 1, y1: 1 };
  return { x0, y0, x1, y1 };
}

/**
 * The top left of the ink itself, without the padding.
 *
 * Which block a figure belongs to has to be decided from here and not from
 * figureOrigin: the padding is 8 line widths, more than a line of text is tall,
 * so an underline drawn just below a word would otherwise be judged to belong
 * to the paragraph above it.
 */
export function inkTopLeft(strokes) {
  const b = bounds(strokes);
  return { x: b.x0, y: b.y0 };
}

/**
 * Where the saved figure's top left corner sits, in the coordinates the strokes
 * were drawn in. toSvg shifts everything so that this corner becomes (0, 0), so
 * a caller that needs to place the figure on a page has to know it.
 */
export function figureOrigin(strokes) {
  const b = bounds(strokes);
  const pad = padding(strokes);
  return { x: b.x0 - pad, y: b.y0 - pad };
}

/** The figure's size in points, matching what toSvg writes. */
export function figureSize(strokes) {
  const b = bounds(strokes);
  const pad = padding(strokes);
  return {
    width: Math.round(b.x1 - b.x0 + pad * 2) / SCALE,
    height: Math.round(b.y1 - b.y0 + pad * 2) / SCALE,
  };
}

export function toSvg(strokes) {
  const b = bounds(strokes);
  const pad = padding(strokes);
  const w = Math.round(b.x1 - b.x0 + pad * 2);
  const h = Math.round(b.y1 - b.y0 + pad * 2);
  const shift = (s) => ({
    ...s,
    points: s.points.map((p) => ({ x: p.x - b.x0 + pad, y: p.y - b.y0 + pad })),
  });
  const paths = strokes
    .map(shift)
    .map((s) => `<path d="${pathFrom(s.points, s.width)}" fill="${s.color}"/>`)
    .join('');
  const scene = JSON.stringify({ v: 1, strokes });
  // viewBox in drawn pixels, size in points. The path data is therefore
  // unchanged and old figures render as before, but Typst gets a physical size
  // instead of scaling the figure to a fixed fraction of the text width.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${(w / SCALE).toFixed(1)}pt" height="${(h / SCALE).toFixed(1)}pt" viewBox="0 0 ${w} ${h}">` +
    paths +
    `${SCENE_OPEN}${scene.replace(/--/g, '- -')}${SCENE_CLOSE}` +
    `</svg>`
  );
}

export function fromSvg(text) {
  const i = text.indexOf(SCENE_OPEN);
  if (i === -1) return null;
  const j = text.indexOf(SCENE_CLOSE, i);
  const raw = text.slice(i + SCENE_OPEN.length, j).replace(/- -/g, '--');
  try {
    return JSON.parse(raw).strokes ?? null;
  } catch {
    return null;
  }
}

// Squared distance from (x, y) to the segment ab.
function distanceToSegment(x, y, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0;
  const qx = a.x + t * dx;
  const qy = a.y + t * dy;
  return (x - qx) ** 2 + (y - qy) ** 2;
}

// Does an eraser at (x, y) hit this stroke?
//
// Against the segments, not the points. A snapped line has only two points,
// start and end, so testing points made its whole middle impossible to erase.
// Fast freehand strokes have the same problem: the points thin out when the
// pen moves quickly.
export function hitStroke(stroke, x, y, r) {
  const p = stroke.points;
  if (!p.length) return false;
  if (p.length === 1) return (p[0].x - x) ** 2 + (p[0].y - y) ** 2 < r * r;
  for (let i = 1; i < p.length; i++) {
    if (distanceToSegment(x, y, p[i - 1], p[i]) < r * r) return true;
  }
  return false;
}
