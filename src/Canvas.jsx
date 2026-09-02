import { useEffect, useRef, useState } from 'react';
import { getStroke } from 'perfect-freehand';
import { toSvg, hitStroke, pathFromOutline } from './ink.js';
import { känn } from './former.js';

const COLORS = ['#16233d', '#b03030', '#1c6b45'];

// Gesten: håll spetsen still i slutet av ett drag så snäpper det till en form.
const HÅLL_MS = 500;
const STILLA_PX = 4;
const BLÄNK_MS = 1100;
const HISTORIK = 60;

const NAMN = { linje: 'linje', cirkel: 'cirkel', rektangel: 'rektangel' };

// Ångra arbetar på hela draglistan i stället för att poppa sista draget, så
// att både suddning och en snäppt form går att ta tillbaka.
function minns(st, läge) {
  st.ångra.push(läge);
  if (st.ångra.length > HISTORIK) st.ångra.shift();
}

export default function Canvas({ initialStrokes, name, onDone, onCancel }) {
  const boxRef = useRef(null);
  const canvasRef = useRef(null);

  const s = useRef({
    strokes: initialStrokes ? structuredClone(initialStrokes) : [],
    current: null,
    lastPenAt: 0,
    dirty: true,
    ångra: [],
    // Vila: var spetsen senast rörde sig mer än STILLA_PX, och när.
    vilaVid: null,
    sistRörd: 0,
    prövad: false, // formen redan prövad i den här vilan
    låst: false, // draget har snäppt och tar inte emot fler punkter
    råa: null, // punkterna som faktiskt ritades, för Cmd-Z
    blänk: null,
  });

  const [tool, setTool] = useState('penna');
  const [color, setColor] = useState(COLORS[0]);
  const [ångraAntal, setÅngraAntal] = useState(0);
  const [form, setForm] = useState(null);

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

      // Prövningen ligger utanför dirty-blocket: står spetsen still kommer
      // inga pointermove, och då är det ingenting som gör ritningen smutsig.
      if (st.current && !st.låst && !st.prövad && performance.now() - st.sistRörd > HÅLL_MS) {
        st.prövad = true;
        const träff = känn(st.current.points);
        if (träff) {
          st.råa = st.current.points;
          st.current = { ...st.current, points: träff.points };
          st.låst = true;
          st.blänk = { points: träff.points, width: st.current.width, slut: performance.now() + BLÄNK_MS };
          st.dirty = true;
          setForm(NAMN[träff.typ]);
          clearTimeout(st.formTimer);
          st.formTimer = setTimeout(() => setForm(null), 1400);
        }
      }

      if (c && c.width && st.dirty) {
        const ctx = c.getContext('2d', { desynchronized: true });
        const dpr = window.devicePixelRatio || 1;
        ctx.clearRect(0, 0, c.width / dpr, c.height / dpr);

        // Ett blänk bakom formen när den snäppt, så man ser att det hände.
        if (st.blänk) {
          const kvar = (st.blänk.slut - performance.now()) / BLÄNK_MS;
          if (kvar <= 0) st.blänk = null;
          else {
            // last: true även här. Utan den slutar halon före strecket, och
            // felet skalar med bredden: en snäppt linje har bara två punkter,
            // och med åtta gånger bredden saknas över trettio pixlar i änden.
            const halo = getStroke(st.blänk.points, {
              size: st.blänk.width * 8,
              thinning: 0,
              simulatePressure: false,
              last: true,
            });
            ctx.fillStyle = `rgba(28, 107, 69, ${(0.25 * kvar).toFixed(3)})`;
            ctx.fill(new Path2D(pathFromOutline(halo)));
          }
        }

        const all = st.current ? [...st.strokes, st.current] : st.strokes;
        for (const stroke of all) {
          // thinning/simulatePressure avstängda: fast bredd (stroke.width),
          // inget gissat tryck. getStroke klarar en enda punkt (blir en prick).
          // last: true drar konturen hela vägen fram till sista punkten —
          // utan den slutar strecket ett par pixlar bakom pennan.
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
        // Blänket bleknar, alltså måste nästa bild ritas om ändå.
        st.dirty = Boolean(st.blänk);
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
    const kvar = st.strokes.filter((stroke) => !hitStroke(stroke, x, y, 14));
    if (kvar.length === st.strokes.length) return;
    // En hel suddning är ett ångra-steg, inte ett per träffat drag.
    if (!st.suddat) {
      minns(st, st.strokes);
      st.suddat = true;
    }
    st.strokes = kvar;
    st.dirty = true;
    setÅngraAntal(st.ångra.length);
  };

  const onDown = (e) => {
    if (!allowed(e)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    const st = s.current;
    if (toolRef.current === 'sudd') {
      st.suddat = false;
      return erase(p.x, p.y);
    }
    st.current = { color: colorRef.current, width: 2.4, points: [p] };
    st.vilaVid = p;
    st.sistRörd = performance.now();
    st.prövad = false;
    st.låst = false;
    st.råa = null;
    st.dirty = true;
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
    if (!st.current || st.låst) return; // efter ett snäpp ligger formen fast
    for (const ev of evs) {
      const p = local(ev);
      st.current.points.push(p);
      if (Math.hypot(p.x - st.vilaVid.x, p.y - st.vilaVid.y) > STILLA_PX) {
        st.vilaVid = p;
        st.sistRörd = performance.now();
        st.prövad = false;
      }
    }
    st.dirty = true;
  };

  const onUp = () => {
    const st = s.current;
    if (!st.current) return;
    const klar = st.current;
    minns(st, st.strokes);
    // Snäppte draget läggs den ritade formen in som ett eget steg, så att
    // första Cmd-Z ger tillbaka den i stället för att radera draget.
    if (st.råa) minns(st, [...st.strokes, { ...klar, points: st.råa }]);
    st.strokes = [...st.strokes, klar];
    st.current = null;
    st.råa = null;
    st.låst = false;
    st.dirty = true;
    setÅngraAntal(st.ångra.length);
  };

  const undo = () => {
    const st = s.current;
    const förra = st.ångra.pop();
    if (!förra) return;
    st.strokes = förra;
    st.dirty = true;
    setÅngraAntal(st.ångra.length);
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
          <button onClick={undo} disabled={!ångraAntal}>
            Ångra
          </button>
          {form && <span className="snäpp">{form}</span>}
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
