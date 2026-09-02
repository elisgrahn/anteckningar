import { useEffect, useRef, useState } from 'react';
import { SCALE } from './ink.js';
import { pageAt } from './sourcemap.js';
import { paint, Tools, PEN_WIDTH, FLASH_MS, savedColor } from './Canvas.jsx';
import * as draw from './strokes.js';

// Drawing straight onto the rendered page.
//
// The interaction model is the one the palm rejection already implies: the pen
// draws, the finger scrolls. No mode button to forget, and an iPad without a
// pencil behaves exactly as before. A mouse draws too — a laptop has no pen,
// and the preview is a backdrop, not a text you select from.
//
// Points are kept in drawn pixels (page points times SCALE) rather than in
// screen pixels, so a figure is the same size whatever the preview is scaled
// to, and so the snap thresholds mean the same thing on both surfaces.

// A tap shorter than this, that moved less than this, is a click and not a
// mark. Long enough that a deliberate dot survives.
const TAP_MS = 250;
const TAP_PX = 3;

export default function PageDraw({ pages, onStrokes, onPick, scrollerRef }) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const s = useRef(draw.createState(null));

  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(savedColor);
  const [undoCount, setUndoCount] = useState(0);
  const [shape, setShape] = useState(null);
  const [count, setCount] = useState(0);

  const toolRef = useRef(tool);
  toolRef.current = tool;
  const colorRef = useRef(color);
  colorRef.current = color;

  // Drawn pixels per CSS pixel, from the rendered svg's own scaling.
  const scaleRef = useRef(SCALE);

  const measure = () => {
    const host = hostRef.current;
    const svg = host?.parentElement?.querySelector('svg');
    const c = canvasRef.current;
    if (!host || !svg || !c) return;
    const r = svg.getBoundingClientRect();
    const box = svg.viewBox?.baseVal;
    if (!r.height || !box?.height) return;
    host.style.width = `${r.width}px`;
    host.style.height = `${r.height}px`;
    const drawnPerCss = (box.height / r.height) * SCALE;
    scaleRef.current = drawnPerCss;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const ctx = c.getContext('2d', { desynchronized: true });
    ctx.setTransform(dpr / drawnPerCss, 0, 0, dpr / drawnPerCss, 0, 0);
    s.current.dirty = true;
  };

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (hostRef.current?.parentElement) ro.observe(hostRef.current.parentElement);
    return () => ro.disconnect();
  });

  useEffect(() => {
    let raf;
    const loop = () => {
      const st = s.current;
      const c = canvasRef.current;
      const snapped = draw.trySnap(st);
      if (snapped) {
        st.flash = { points: st.current.points, width: st.current.width, until: performance.now() + FLASH_MS };
        setShape(snapped);
        clearTimeout(st.shapeTimer);
        st.shapeTimer = setTimeout(() => setShape(null), 1400);
      }
      if (c && c.width && st.dirty) {
        const ctx = c.getContext('2d', { desynchronized: true });
        const k = scaleRef.current;
        const dpr = window.devicePixelRatio || 1;
        if (st.flash && performance.now() > st.flash.until) st.flash = null;
        paint(ctx, (c.width / dpr) * k, (c.height / dpr) * k, st.current ? [...st.strokes, st.current] : st.strokes, st.flash);
        st.dirty = Boolean(st.flash);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  /** Client coordinates to drawn pixels on the whole stacked document. */
  const local = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const k = scaleRef.current;
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
  };

  /** Which page a drawn-pixel y belongs to, and where on it, in points. */
  const onPage = (drawn) => pageAt(pages, drawn.y / SCALE);

  const finger = useRef(null);
  const down = useRef(null);

  const onDown = (e) => {
    // The finger scrolls. Doing it by hand rather than through touch-action,
    // because touch-action cannot tell a pen drag from a finger drag.
    if (e.pointerType === 'touch') {
      finger.current = { y: e.clientY, top: scrollerRef.current?.scrollTop ?? 0 };
      return;
    }
    if (!draw.allowPointer(s.current, e.pointerType, false)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    if (toolRef.current === 'eraser') {
      s.current.erasedThisDrag = false;
      if (draw.eraseAt(s.current, p.x, p.y)) after();
      return;
    }
    // A stroke that starts on another page belongs to another figure. A figure
    // lives on one page — a drawing across a page break would have to be two.
    if (s.current.strokes.length && onPage(p).page !== s.current.page) {
      onStrokes(null);
      const pen = s.current.lastPenAt;
      s.current = draw.createState(null);
      s.current.lastPenAt = pen;
      setUndoCount(0);
      setCount(0);
    }
    s.current.page = onPage(p).page;
    down.current = { at: performance.now(), p };
    draw.beginStroke(s.current, p, colorRef.current, PEN_WIDTH);
  };

  const onMove = (e) => {
    if (e.pointerType === 'touch') {
      const f = finger.current;
      if (f && scrollerRef.current) scrollerRef.current.scrollTop = f.top - (e.clientY - f.y);
      return;
    }
    if (e.buttons === 0) return;
    if (!draw.allowPointer(s.current, e.pointerType, false)) return;
    const evs = e.nativeEvent.getCoalescedEvents ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
    if (toolRef.current === 'eraser') {
      for (const ev of evs) {
        const p = local(ev);
        if (draw.eraseAt(s.current, p.x, p.y)) after();
      }
      return;
    }
    draw.extendStroke(s.current, evs.map(local));
  };

  const onUp = (e) => {
    if (e?.pointerType === 'touch') {
      finger.current = null;
      return;
    }
    // A quick tap that went nowhere is a click, not a mark. Without this the
    // double click that jumps to the source would leave two dots behind.
    const d = down.current;
    const points = s.current.current?.points;
    if (d && points && performance.now() - d.at < TAP_MS) {
      const far = points.some((p) => Math.hypot(p.x - d.p.x, p.y - d.p.y) > TAP_PX);
      if (!far) return draw.cancelStroke(s.current);
    }
    if (draw.endStroke(s.current)) after();
  };

  // Nothing here waits for a save button: every finished stroke is handed up,
  // and the figure on disk follows along. Done only ends the grouping.
  const after = () => {
    setUndoCount(s.current.undo.length);
    setCount(s.current.strokes.length);
    onStrokes(s.current.strokes.length ? { strokes: s.current.strokes, page: s.current.page } : null);
  };

  const undo = () => {
    if (draw.undoStep(s.current)) after();
  };

  const finish = () => {
    s.current = draw.createState(null);
    setUndoCount(0);
    setCount(0);
    onStrokes(null);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (!s.current.strokes.length) return;
      if (e.key === 'Escape') return finish();
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div ref={hostRef} className="pagedraw">
      <canvas
        ref={canvasRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={(e) => {
          const p = local(e);
          onPick(onPage(p));
        }}
        onContextMenu={(e) => e.preventDefault()}
        style={{ touchAction: 'none' }}
      />
      {count > 0 && (
        <div className="pagedraw-bar" onPointerDown={(e) => e.stopPropagation()}>
          <Tools
            tool={tool}
            setTool={setTool}
            color={color}
            setColor={setColor}
            undo={undo}
            undoCount={undoCount}
            shape={shape}
          />
          <button className="primary" onClick={finish}>
            Done <kbd>Esc</kbd>
          </button>
        </div>
      )}
    </div>
  );
}
