import { useEffect, useRef, useState } from 'react';
import { getStroke } from 'perfect-freehand';
import { toSvg, hitStroke, pathFromOutline } from './ink.js';
import { recognise } from './shapes.js';

const COLORS = ['#16233d', '#b03030', '#1c6b45'];

// The gesture: hold the tip still at the end of a stroke and it snaps to a shape.
const HOLD_MS = 500;
const STILL_PX = 4;
const FLASH_MS = 1100;
const HISTORY_MAX = 60;

const SHAPE_NAMES = { line: 'line', circle: 'circle', rectangle: 'rectangle' };

// Undo works on the whole stroke list rather than popping the last stroke, so
// that both erasing and a snapped shape can be taken back.
function remember(st, state) {
  st.undo.push(state);
  if (st.undo.length > HISTORY_MAX) st.undo.shift();
}

// The colour is a setting, not content, and belongs in the browser rather than
// in the document. Can throw in private mode, hence try/catch.
//
// The key stays Swedish on purpose: it is already written in people's browsers,
// and renaming it would silently forget the colour they picked.
const COLOR_KEY = 'anteckningar.färg';
const savedColor = () => {
  try {
    const c = localStorage.getItem(COLOR_KEY);
    return COLORS.includes(c) ? c : COLORS[0];
  } catch {
    return COLORS[0];
  }
};

export default function Canvas({ initialStrokes, name, onDone, onCancel }) {
  const boxRef = useRef(null);
  const canvasRef = useRef(null);

  const s = useRef({
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
    flash: null,
  });

  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(savedColor);
  const [undoCount, setUndoCount] = useState(0);
  const [shape, setShape] = useState(null);

  const toolRef = useRef(tool);
  toolRef.current = tool;
  const colorRef = useRef(color);
  colorRef.current = color;

  // The size is measured on the container, never on the canvas that is resized
  useEffect(() => {
    const box = boxRef.current;
    const setup = () => {
      const r = box.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      const c = canvasRef.current;
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      const ctx = c.getContext('2d', { desynchronized: true });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      s.current.dirty = true;
    };
    setup();
    const ro = new ResizeObserver(setup);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  // The wrist must not be able to select or scroll while the pen is in the air
  useEffect(() => {
    const block = (e) => {
      if (performance.now() - s.current.lastPenAt < 1500 && e.cancelable) e.preventDefault();
    };
    document.addEventListener('touchstart', block, { passive: false });
    document.addEventListener('touchmove', block, { passive: false });
    return () => {
      document.removeEventListener('touchstart', block);
      document.removeEventListener('touchmove', block);
    };
  }, []);

  useEffect(() => {
    let raf;
    const draw = () => {
      const st = s.current;
      const c = canvasRef.current;

      // The test sits outside the dirty block: while the tip is still there are
      // no pointermove events, and so nothing marks the drawing as dirty.
      if (st.current && !st.locked && !st.tested && performance.now() - st.lastMovedAt > HOLD_MS) {
        st.tested = true;
        const hit = recognise(st.current.points);
        if (hit) {
          st.rawPoints = st.current.points;
          st.current = { ...st.current, points: hit.points };
          st.locked = true;
          st.flash = { points: hit.points, width: st.current.width, until: performance.now() + FLASH_MS };
          st.dirty = true;
          setShape(SHAPE_NAMES[hit.kind]);
          clearTimeout(st.shapeTimer);
          st.shapeTimer = setTimeout(() => setShape(null), 1400);
        }
      }

      if (c && c.width && st.dirty) {
        const ctx = c.getContext('2d', { desynchronized: true });
        const dpr = window.devicePixelRatio || 1;
        ctx.clearRect(0, 0, c.width / dpr, c.height / dpr);

        // A flash behind the shape when it snaps, so you can see that it did.
        if (st.flash) {
          const left = (st.flash.until - performance.now()) / FLASH_MS;
          if (left <= 0) st.flash = null;
          else {
            // last: true here too. Without it the halo ends before the stroke,
            // and the error scales with the width: a snapped line has only two
            // points, and at eight times the line width over thirty pixels are
            // missing at the end.
            const halo = getStroke(st.flash.points, {
              size: st.flash.width * 8,
              thinning: 0,
              simulatePressure: false,
              last: true,
            });
            ctx.fillStyle = `rgba(28, 107, 69, ${(0.25 * left).toFixed(3)})`;
            ctx.fill(new Path2D(pathFromOutline(halo)));
          }
        }

        const all = st.current ? [...st.strokes, st.current] : st.strokes;
        for (const stroke of all) {
          // thinning/simulatePressure off: fixed width (stroke.width), no
          // guessed pressure. getStroke handles a single point (a dot) itself.
          // last: true draws the outline all the way to the final point —
          // without it the stroke ends a couple of pixels behind the pen.
          const outline = getStroke(stroke.points, {
            size: stroke.width,
            thinning: 0,
            simulatePressure: false,
            last: true,
          });
          if (!outline.length) continue;
          ctx.fillStyle = stroke.color;
          ctx.fill(new Path2D(pathFromOutline(outline)));
        }
        // The flash is fading, so the next frame has to be drawn anyway.
        st.dirty = Boolean(st.flash);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const local = (e) => {
    const r = boxRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const allowed = (e) => {
    const st = s.current;
    if (e.pointerType === 'pen') {
      st.lastPenAt = performance.now();
      return true;
    }
    // A finger may draw only if no pen has been in use recently
    return performance.now() - st.lastPenAt > 1500;
  };

  const erase = (x, y) => {
    const st = s.current;
    const left = st.strokes.filter((stroke) => !hitStroke(stroke, x, y, 14));
    if (left.length === st.strokes.length) return;
    // A whole erasing pass is one undo step, not one per stroke hit.
    if (!st.erasedThisDrag) {
      remember(st, st.strokes);
      st.erasedThisDrag = true;
    }
    st.strokes = left;
    st.dirty = true;
    setUndoCount(st.undo.length);
  };

  const onDown = (e) => {
    if (!allowed(e)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    const st = s.current;
    if (toolRef.current === 'eraser') {
      st.erasedThisDrag = false;
      return erase(p.x, p.y);
    }
    st.current = { color: colorRef.current, width: 2.4, points: [p] };
    st.restAt = p;
    st.lastMovedAt = performance.now();
    st.tested = false;
    st.locked = false;
    st.rawPoints = null;
    st.dirty = true;
  };

  const onMove = (e) => {
    const st = s.current;
    if (e.buttons === 0) return;
    if (!allowed(e)) return;
    const evs = e.nativeEvent.getCoalescedEvents ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
    if (toolRef.current === 'eraser') {
      for (const ev of evs) {
        const p = local(ev);
        erase(p.x, p.y);
      }
      return;
    }
    if (!st.current || st.locked) return; // after a snap the shape stays put
    for (const ev of evs) {
      const p = local(ev);
      st.current.points.push(p);
      if (Math.hypot(p.x - st.restAt.x, p.y - st.restAt.y) > STILL_PX) {
        st.restAt = p;
        st.lastMovedAt = performance.now();
        st.tested = false;
      }
    }
    st.dirty = true;
  };

  const onUp = () => {
    const st = s.current;
    if (!st.current) return;
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
    setUndoCount(st.undo.length);
  };

  const undo = () => {
    const st = s.current;
    const previous = st.undo.pop();
    if (!previous) return;
    st.strokes = previous;
    st.dirty = true;
    setUndoCount(st.undo.length);
  };

  const done = () => {
    if (!s.current.strokes.length) return onCancel();
    onDone(toSvg(s.current.strokes), s.current.strokes);
  };

  // The keyboard is the tool switcher, since the pencil's double tap and
  // squeeze are not available to a web page.
  useEffect(() => {
    const held = new Set();
    const down = (e) => {
      if (e.key === 'Escape') return onCancel();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) return done();
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        return undo();
      }
      if (e.key === 'e' && !held.has('e')) {
        held.add('e');
        setTool('eraser');
      }
    };
    const up = (e) => {
      if (e.key === 'e') {
        held.delete('e');
        setTool('pen');
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  });

  return (
    <div className="overlay">
      <div className="overlay-bar">
        <strong>{name}</strong>
        <div className="tools">
          <button className={tool === 'pen' ? 'on' : ''} onClick={() => setTool('pen')}>
            Pen
          </button>
          <button className={tool === 'eraser' ? 'on' : ''} onClick={() => setTool('eraser')}>
            Eraser <kbd>E</kbd>
          </button>
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => {
                setColor(c);
                setTool('pen');
                try {
                  localStorage.setItem(COLOR_KEY, c);
                } catch {
                  /* private mode, the colour lasts for this session only */
                }
              }}
              className={'swatch' + (c === color ? ' on' : '')}
              style={{ background: c }}
              aria-label={'Colour ' + c}
            />
          ))}
          <button onClick={undo} disabled={!undoCount}>
            Undo
          </button>
          {shape && <span className="snap">{shape}</span>}
        </div>
        <div className="right">
          <button onClick={onCancel}>Cancel <kbd>Esc</kbd></button>
          <button className="primary" onClick={done}>
            Done <kbd>⌘⏎</kbd>
          </button>
        </div>
      </div>
      <div ref={boxRef} className="overlay-canvas">
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onContextMenu={(e) => e.preventDefault()}
          style={{ touchAction: 'none' }}
        />
      </div>
    </div>
  );
}
