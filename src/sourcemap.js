// Jumping between output and source, without the compiler needing spans.
//
// The document is made to report its own layout: the app injects invisible
// metadata markers into the copy it sends to the compiler, and query returns
// the page and point position of each marker. The file on disk is never
// touched, so `typst compile document/main.typ` still works (invariant 1).
//
// The line number rides along inside the marker as data, so it does not matter
// that injecting shifts the lines in the copy.

export const PREAMBLE = '#let __am(n) = context [#metadata((line: n, pos: here().position()))<am>]';

export const SENTINEL = '#block()';

// Lines that configure the document as a whole. A marker before #set page can
// place content ahead of the page setup, and that shows in the output.
const CONFIG_LINE = /^#(set|show|import|include|let)\b/;

/**
 * The copy that gets compiled: the same text, with `#__am(line)` on its own
 * line before each block start. Its own line is a requirement — `#__am(6)=
 * Heading` means `=` is no longer first on the line, and the heading turns into
 * ordinary text.
 *
 * Markers are never placed inside raw blocks, multi-line math or multi-line
 * function calls, where they would become visible in the output. If the
 * tracking gets it wrong the consequence is a missing marker, that is one jump
 * target fewer — never a broken document.
 *
 * Also returns a map from the copy's lines back to the original's, since the
 * compiler's error messages would otherwise point at the wrong line.
 */
export function withMarkers(source) {
  const lines = source.split('\n');
  const out = [PREAMBLE];
  const map = [null];
  let inRaw = false;
  let inMath = false;
  let parens = 0;
  let previousBlank = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!inRaw && !inMath && parens <= 0 && previousBlank && trimmed !== '' && !CONFIG_LINE.test(trimmed)) {
      out.push(`#__am(${i})`);
      map.push(null);
    }
    out.push(line);
    map.push(i);

    if (/^```/.test(trimmed)) inRaw = !inRaw;
    if (!inRaw) {
      if ((line.match(/\$/g) || []).length % 2 === 1) inMath = !inMath;
      parens += (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
      if (parens < 0) parens = 0;
    }
    previousBlank = trimmed === '';
  }

  // A marker past the last line, so that something drawn below the final block
  // still has a known flow position to be placed against.
  out.push(`#__am(${lines.length})`);
  map.push(null);

  // An empty block to close the document with.
  //
  // Without it the last block in the flow has no successor, and an invisible
  // block there reports a position one line short of what it gets as soon as
  // anything follows — which is exactly what made a figure written after the
  // final paragraph jump down onto the next thing typed. With it, the end of
  // the document behaves like the middle of it. Measured not to change the
  // layout: same word positions, same page count.
  out.push(SENTINEL);
  map.push(null);

  return { text: out.join('\n'), map };
}

/** A line number in the copy back to the original's, for error messages. */
export function originalLine(map, line) {
  for (let i = line; i >= 0; i--) if (map[i] !== null && map[i] !== undefined) return map[i];
  return null;
}

const toPt = (v) => (typeof v === 'number' ? v : parseFloat(String(v)));

/** The markers from query, cleaned to numbers and sorted in document order. */
export function parseMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m) => ({ line: m.line, page: toPt(m.pos?.page), y: toPt(m.pos?.y), x: toPt(m.pos?.x) }))
    .filter((m) => Number.isFinite(m.line) && Number.isFinite(m.page) && Number.isFinite(m.y))
    .sort((a, b) => a.page - b.page || a.y - b.y);
}

/**
 * Which page did a y position in the stacked SVG land on, and where on it?
 * The pages follow each other without a gap, in points.
 */
export function pageAt(pages, yInSvg) {
  let rest = yInSvg;
  for (let i = 0; i < pages.length; i++) {
    if (rest < pages[i].height || i === pages.length - 1) return { page: i + 1, y: rest };
    rest -= pages[i].height;
  }
  return { page: 1, y: yInSvg };
}

/** The last marker at or above the point. Block level, not per character. */
export function markerAt(markers, page, y) {
  let hit = null;
  for (const m of markers) {
    if (m.page < page || (m.page === page && m.y <= y + 1)) hit = m;
    else break;
  }
  return hit;
}

export function lineAt(markers, page, y) {
  return markerAt(markers, page, y)?.line ?? null;
}

/**
 * The marker for the block after this one.
 *
 * A figure's line is written immediately before its flow anchor, so anchoring
 * to the *next* block is what puts the line after the block the figure belongs
 * to — where it has to be if a heading and everything under it is to be copied
 * in one piece.
 *
 * That only holds because of the sentinel: an invisible block reports the same
 * position as the block that follows it, but only when one does. The last
 * marker in the list is the one before the sentinel, so there is always a next.
 */
export function nextMarker(markers, marker) {
  if (!marker) return null;
  return markers.find((m) => m.line > marker.line) ?? null;
}
