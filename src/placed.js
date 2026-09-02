// Where a placed figure actually sits on the page.
//
// Nothing here is state. The lines are in the source, the anchor comes from the
// markers of the latest compilation, and the size is written in the figure's own
// svg — so a placed figure's rectangle is anchor + (dx, dy) + size, and no extra
// query is needed to know where it landed.
//
// The rule for *which* block a figure belongs to lives here too, in anchorFor.
// Drawing a new figure and dragging an old one have to agree on it; if they
// drift apart a figure changes anchor merely by being touched.

import { markerAt, nextMarker, pageAt } from './sourcemap.js';

// The line as this app writes it. Anything else — a hand-written #place with
// other arguments, or a figure inside other content — is left alone rather than
// half-understood.
const PLACE = /^#place\(dx: (-?[\d.]+)pt, dy: (-?[\d.]+)pt, image\("([^"]+)"\)\)$/;

/** The line this app writes, and the only shape parsePlaced recognises. */
export const placeCode = (path, dx, dy) =>
  `#place(dx: ${dx.toFixed(1)}pt, dy: ${dy.toFixed(1)}pt, image("${path}"))`;

/** Every #place line in the source, with its line number and offsets. */
export function parsePlaced(source) {
  const out = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(PLACE);
    if (m) out.push({ line: i, dx: parseFloat(m[1]), dy: parseFloat(m[2]), path: m[3] });
  }
  return out;
}

/** The figure's size on paper, from the svg's own width and height in points. */
export function svgSize(text) {
  const w = /\bwidth="([\d.]+)pt"/.exec(text);
  const h = /\bheight="([\d.]+)pt"/.exec(text);
  return w && h ? { width: parseFloat(w[1]), height: parseFloat(h[1]) } : null;
}

/** The top of a page in the stacked document, in points. */
export function pageTop(pages, page) {
  return pages.slice(0, page - 1).reduce((a, p) => a + p.height, 0);
}

/**
 * Which block ink at this point belongs to, in stacked points.
 *
 * The line is written before the block that follows, which puts it after the
 * block the figure belongs to — a figure drawn under a heading has to be under
 * it in the source too, or copying the heading with its contents leaves the
 * figure behind. Across a page break there is no following block on the same
 * page, and there the block itself is the only anchor that keeps the figure on
 * its own page.
 */
export function anchorFor(markers, pages, ink) {
  if (!markers.length) return null;
  const spot = pageAt(pages, ink.y);
  const own = markerAt(markers, spot.page, spot.y) ?? markers[0];
  const after = nextMarker(markers, own);
  return after && after.page === spot.page ? after : own;
}

/**
 * The anchor a #place line already hangs from: the block after it.
 *
 * Read back the same way it was written, so a figure that is only looked at
 * keeps the offsets it was given.
 */
export function anchorOf(markers, line) {
  return nextMarker(markers, { line });
}

/** The offsets that put a figure's top left corner at `origin`. */
export function offsetFrom(anchor, pages, origin) {
  return {
    dx: origin.x - anchor.x,
    dy: origin.y - (pageTop(pages, anchor.page) + anchor.y),
  };
}

/**
 * Every placed figure as a rectangle in stacked points, with the anchor it
 * hangs from. Figures whose anchor or size is unknown are left out — they
 * cannot be drawn a border around, and guessing would put it in the wrong place.
 *
 * `sizeOf(path)` returns { width, height } in points, `inkOf(path)` how far the
 * ink starts in from the figure's own top left corner (the padding).
 */
export function placedRects(source, markers, pages, sizeOf, inkOf) {
  const out = [];
  for (const p of parsePlaced(source)) {
    const anchor = anchorOf(markers, p.line);
    const size = sizeOf(p.path);
    if (!anchor || !size) continue;
    const top = pageTop(pages, anchor.page);
    const ink = inkOf(p.path) ?? { x: 0, y: 0 };
    out.push({
      ...p,
      name: p.path.split('/').pop(),
      x: anchor.x + p.dx,
      y: top + anchor.y + p.dy,
      w: size.width,
      h: size.height,
      inkDx: ink.x,
      inkDy: ink.y,
      anchorY: top + anchor.y,
      anchorLine: anchor.line,
    });
  }
  return out;
}

/**
 * The placed figure at a point, or null. The last one wins where they overlap:
 * later in the source is later on top.
 */
export function hitPlaced(placed, x, y) {
  let hit = null;
  for (const p of placed) {
    if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) hit = p;
  }
  return hit;
}
