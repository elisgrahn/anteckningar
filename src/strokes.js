// The behaviour of drawing, with no opinion about the surface it happens on.
//
// Pen handling, palm rejection, the hold-still snap and the undo history belong
// to *drawing*, not to the full-screen box that used to own them. Both surfaces
// — the full-screen canvas and the overlay on the rendered page — use this, so
// a fix lands in one place instead of two.
//
// Everything here mutates a plain state object. React state is for what the
// toolbar shows, never for points during a stroke.

import { recognise } from './shapes.js';
import { hitStroke } from './ink.js';

export const HOLD_MS = 500; // how long the tip must stand still to snap
export const STILL_PX = 4; // and how little it may move
export const HISTORY_MAX = 60;
export const ERASER_R = 14;
export const PALM_MS = 1500; // a finger is ignored this long after the pen

export function createState(initialStrokes) {
  return {
    strokes: initialStrokes ? structuredClone(initialStrokes) : [],
    current: null,
    lastPenAt: 0,
    dirty: true,
    undo: [],
    // Rest: where the tip last moved more than STILL_PX, and when.
    restAt: null,
    lastMovedAt: 0,
    tested: false, // shape already tried at this rest position
    locked: false, // the stroke has snapped and takes no more points
    rawPoints: null, // the points actually drawn, for Cmd-Z
    erasedThisDrag: false,
  };
}

// Undo works on the whole stroke list rather than popping the last stroke, so
// that both erasing and a snapped shape can be taken back.
export function remember(st, state) {
  st.undo.push(state);
  if (st.undo.length > HISTORY_MAX) st.undo.shift();
}

// M8: once a real pen has drawn anywhere in this tab, the mouse switches
// from drawing to marking (selecting, dragging a placed figure) — a Wacom
// tablet used next to an ordinary mouse must not turn an incidental mouse
// drag into a stroke. Module-level and never reset, so both drawing
// surfaces agree (see the file header) and a laptop that never sees a pen
// keeps today's mouse-draws behaviour forever.
let penEverUsed = false;
export const penSeen = () => penEverUsed;

/**
 * May this pointer draw?
 *
 * The pen always wins. What a finger does differs by surface: in the
 * full-screen box it draws (unless the pen was just used, which means the
 * finger is a resting wrist), while on the rendered page it scrolls, because
 * the page is something you also need to move around.
 */
export function allowPointer(st, pointerType, fingerDraws = true) {
  if (pointerType === 'pen') {
    st.lastPenAt = performance.now();
    penEverUsed = true;
    return true;
  }
  if (pointerType === 'touch') return fingerDraws && performance.now() - st.lastPenAt > PALM_MS;
  if (pointerType === 'mouse') return !penEverUsed; // M8: marks, doesn't draw, once a pen exists
  return true;
}

// The eraser end of a stylus is not a separate pointerType — the spec has it
// report pointerType "pen" with the eraser bit set in `buttons` instead.
export const isEraserEnd = (e) => e.pointerType === 'pen' && (e.buttons & 32) !== 0;

// A graphics tablet's pen, as opposed to a touchscreen's (Apple Pencil):
// real analog pressure is worth drawing with on one and not the other (see
// ink.js's outlineOf), and there's no pointerType for that distinction —
// maxTouchPoints stands in for "this is a desktop with a separate tablet",
// which is what M8 actually targets.
export const isDesktopPen = (e) => e.pointerType === 'pen' && navigator.maxTouchPoints === 0;

export function beginStroke(st, p, color, width) {
  st.current = { color, width, points: [p] };
  st.restAt = p;
  st.lastMovedAt = performance.now();
  st.tested = false;
  st.locked = false;
  st.rawPoints = null;
  st.dirty = true;
}

/** Adds points to the stroke in progress and tracks when the tip stood still. */
export function extendStroke(st, points) {
  if (!st.current || st.locked) return; // after a snap the shape stays put
  for (const p of points) {
    st.current.points.push(p);
    if (Math.hypot(p.x - st.restAt.x, p.y - st.restAt.y) > STILL_PX) {
      st.restAt = p;
      st.lastMovedAt = performance.now();
      st.tested = false;
    }
  }
  st.dirty = true;
}

/**
 * The hold-still gesture. Call it from the render loop: while the tip is still
 * there are no pointermove events, so nothing else would notice.
 *
 * Returns the shape kind when it snapped, otherwise null.
 */
export function trySnap(st) {
  if (!st.current || st.locked || st.tested) return null;
  if (performance.now() - st.lastMovedAt <= HOLD_MS) return null;
  st.tested = true;
  const hit = recognise(st.current.points);
  if (!hit) return null;
  st.rawPoints = st.current.points;
  st.current = { ...st.current, points: hit.points };
  st.locked = true;
  st.dirty = true;
  return hit.kind;
}

/**
 * Throws away the stroke in progress. A double click is two down-up pairs, and
 * without this the gesture that jumps to the source would leave two dots on the
 * page. A deliberate dot is held for a moment; a click is not.
 */
export function cancelStroke(st) {
  st.current = null;
  st.rawPoints = null;
  st.locked = false;
  st.dirty = true;
}

export function endStroke(st) {
  if (!st.current) return false;
  const finished = st.current;
  remember(st, st.strokes);
  // If the stroke snapped, the drawn shape goes in as its own step, so the
  // first Cmd-Z gives it back instead of deleting the stroke.
  if (st.rawPoints) remember(st, [...st.strokes, { ...finished, points: st.rawPoints }]);
  st.strokes = [...st.strokes, finished];
  st.current = null;
  st.rawPoints = null;
  st.locked = false;
  st.dirty = true;
  return true;
}

export function eraseAt(st, x, y, r = ERASER_R) {
  const left = st.strokes.filter((stroke) => !hitStroke(stroke, x, y, r));
  if (left.length === st.strokes.length) return false;
  // A whole erasing pass is one undo step, not one per stroke hit.
  if (!st.erasedThisDrag) {
    remember(st, st.strokes);
    st.erasedThisDrag = true;
  }
  st.strokes = left;
  st.dirty = true;
  return true;
}

export function undoStep(st) {
  const previous = st.undo.pop();
  if (!previous) return false;
  st.strokes = previous;
  st.dirty = true;
  return true;
}
