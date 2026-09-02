import { useEffect, useRef, useState } from 'react';
import { toSvg, pathFromOutline, outlineOf } from './ink.js';
import * as draw from './strokes.js';

export const COLORS = ['#16233d', '#b03030', '#1c6b45'];
export const PEN_WIDTH = 2.4;
export const FLASH_MS = 1100;

// The colour is a setting, not content, and belongs in the browser rather than
// in the document. Can throw in private mode, hence try/catch.
const COLOR_KEY = 'notes.penColor';
export const savedColor = () => {
  try {
    const c = localStorage.getItem(COLOR_KEY);
    return COLORS.includes(c) ? c : COLORS[0];
  } catch {
    return COLORS[0];
  }
};

export const rememberColor = (c) => {
  try {
    localStorage.setItem(COLOR_KEY, c);
  } catch {
    /* private mode, the colour lasts for this session only */
  }
};

/** Paints a stroke list, plus a fading halo behind a shape that just snapped. */
export function paint(ctx, width, height, strokes, flash) {
  ctx.clearRect(0, 0, width, height);
  if (flash) {
    const left = (flash.until - performance.now()) / FLASH_MS;
    if (left > 0) {
      // The halo is drawn at eight times the line width, which is exactly why
      // it needs the same outline options: without last: true it would end
      // thirty pixels short of a snapped line.
      ctx.fillStyle = `rgba(28, 107, 69, ${(0.25 * left).toFixed(3)})`;
      ctx.fill(new Path2D(pathFromOutline(outlineOf(flash.points, flash.width * 8))));
    }
  }
  for (const stroke of strokes) {
    const outline = outlineOf(stroke.points, stroke.width);
    if (!outline.length) continue;
    ctx.fillStyle = stroke.color;
    ctx.fill(new Path2D(pathFromOutline(outline)));
  }
}

export default function Canvas({ initialStrokes, name, onDone, onCancel }) {
  const boxRef = useRef(null);
  const canvasRef = useRef(null);

  const s = useRef(draw.createState(initialStrokes));

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
      if (performance.now() - s.current.lastPenAt < draw.PALM_MS && e.cancelable) e.preventDefault();
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
        const dpr = window.devicePixelRatio || 1;
        if (st.flash && performance.now() > st.flash.until) st.flash = null;
        paint(ctx, c.width / dpr, c.height / dpr, st.current ? [...st.strokes, st.current] : st.strokes, st.flash);
        // The flash is fading, so the next frame has to be drawn anyway.
        st.dirty = Boolean(st.flash);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const local = (e) => {
    const r = boxRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e) => {
    if (!draw.allowPointer(s.current, e.pointerType)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    if (toolRef.current === 'eraser') {
      s.current.erasedThisDrag = false;
      if (draw.eraseAt(s.current, p.x, p.y)) setUndoCount(s.current.undo.length);
      return;
    }
    draw.beginStroke(s.current, p, colorRef.current, PEN_WIDTH);
  };

  const onMove = (e) => {
    if (e.buttons === 0) return;
    if (!draw.allowPointer(s.current, e.pointerType)) return;
    const evs = e.nativeEvent.getCoalescedEvents ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
    if (toolRef.current === 'eraser') {
      for (const ev of evs) {
        const p = local(ev);
        if (draw.eraseAt(s.current, p.x, p.y)) setUndoCount(s.current.undo.length);
      }
      return;
    }
    draw.extendStroke(s.current, evs.map(local));
  };

  const onUp = () => {
    if (draw.endStroke(s.current)) setUndoCount(s.current.undo.length);
  };

  const undo = () => {
    if (draw.undoStep(s.current)) setUndoCount(s.current.undo.length);
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
        <Tools
          tool={tool}
          setTool={setTool}
          color={color}
          setColor={setColor}
          undo={undo}
          undoCount={undoCount}
          shape={shape}
        />
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

/** Pen, eraser, colours and undo. Shared by both drawing surfaces. */
export function Tools({ tool, setTool, color, setColor, undo, undoCount, shape }) {
  return (
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
            rememberColor(c);
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
  );
}
