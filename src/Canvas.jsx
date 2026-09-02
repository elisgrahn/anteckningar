import { useEffect, useRef, useState } from 'react';
import { toSvg, hitStroke } from './ink.js';

const COLORS = ['#16233d', '#b03030', '#1c6b45'];

export default function Canvas({ initialStrokes, name, onDone, onCancel }) {
  const boxRef = useRef(null);
  const canvasRef = useRef(null);

  const s = useRef({
    strokes: initialStrokes ? structuredClone(initialStrokes) : [],
    current: null,
    lastPenAt: 0,
    dirty: true,
  });

  const [tool, setTool] = useState('penna');
  const [color, setColor] = useState(COLORS[0]);
  const [count, setCount] = useState(s.current.strokes.length);

  const toolRef = useRef(tool);
  toolRef.current = tool;
  const colorRef = useRef(color);
  colorRef.current = color;

  // Storleken mäts på behållaren, aldrig på canvasen som skalas om
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

  // Handloven ska inte kunna markera eller rulla medan pennan är i luften
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
      if (c && c.width && st.dirty) {
        const ctx = c.getContext('2d', { desynchronized: true });
        const dpr = window.devicePixelRatio || 1;
        ctx.clearRect(0, 0, c.width / dpr, c.height / dpr);
        const all = st.current ? [...st.strokes, st.current] : st.strokes;
        for (const stroke of all) {
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth = stroke.width;
          ctx.beginPath();
          const p = stroke.points;
          if (p.length === 1) {
            ctx.arc(p[0].x, p[0].y, stroke.width / 2, 0, Math.PI * 2);
            ctx.fillStyle = stroke.color;
            ctx.fill();
          } else {
            ctx.moveTo(p[0].x, p[0].y);
            for (let i = 1; i < p.length - 1; i++) {
              ctx.quadraticCurveTo(p[i].x, p[i].y, (p[i].x + p[i + 1].x) / 2, (p[i].y + p[i + 1].y) / 2);
            }
            ctx.lineTo(p[p.length - 1].x, p[p.length - 1].y);
            ctx.stroke();
          }
        }
        st.dirty = false;
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
    // Fingret får rita bara om ingen penna varit i bruk nyligen
    return performance.now() - st.lastPenAt > 1500;
  };

  const erase = (x, y) => {
    const st = s.current;
    const before = st.strokes.length;
    st.strokes = st.strokes.filter((stroke) => !hitStroke(stroke, x, y, 14));
    if (st.strokes.length !== before) {
      st.dirty = true;
      setCount(st.strokes.length);
    }
  };

  const onDown = (e) => {
    if (!allowed(e)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    if (toolRef.current === 'sudd') return erase(p.x, p.y);
    s.current.current = { color: colorRef.current, width: 2.4, points: [p] };
    s.current.dirty = true;
  };

  const onMove = (e) => {
    const st = s.current;
    if (e.buttons === 0) return;
    if (!allowed(e)) return;
    const evs = e.nativeEvent.getCoalescedEvents ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
    if (toolRef.current === 'sudd') {
      for (const ev of evs) {
        const p = local(ev);
        erase(p.x, p.y);
      }
      return;
    }
    if (!st.current) return;
    for (const ev of evs) st.current.points.push(local(ev));
    st.dirty = true;
  };

  const onUp = () => {
    const st = s.current;
    if (st.current) {
      st.strokes.push(st.current);
      st.current = null;
      st.dirty = true;
      setCount(st.strokes.length);
    }
  };

  const undo = () => {
    const st = s.current;
    st.strokes.pop();
    st.dirty = true;
    setCount(st.strokes.length);
  };

  const done = () => {
    if (!s.current.strokes.length) return onCancel();
    onDone(toSvg(s.current.strokes), s.current.strokes);
  };

  // Tangentbordet är verktygsväxlaren, eftersom pennans dubbeltryck
  // och kläm inte är tillgängliga för webbsidor.
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
        setTool('sudd');
      }
    };
    const up = (e) => {
      if (e.key === 'e') {
        held.delete('e');
        setTool('penna');
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
          <button className={tool === 'penna' ? 'on' : ''} onClick={() => setTool('penna')}>
            Penna
          </button>
          <button className={tool === 'sudd' ? 'on' : ''} onClick={() => setTool('sudd')}>
            Sudd <kbd>E</kbd>
          </button>
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => {
                setColor(c);
                setTool('penna');
              }}
              className={'swatch' + (c === color ? ' on' : '')}
              style={{ background: c }}
              aria-label={'Färg ' + c}
            />
          ))}
          <button onClick={undo} disabled={!count}>
            Ångra
          </button>
        </div>
        <div className="right">
          <button onClick={onCancel}>Avbryt <kbd>Esc</kbd></button>
          <button className="primary" onClick={done}>
            Klar <kbd>⌘⏎</kbd>
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
