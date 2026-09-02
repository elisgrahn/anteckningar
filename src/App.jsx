import { useCallback, useEffect, useRef, useState } from 'react';
import Editor, { figureAtCursor, insertAtCursor, setDoc } from './Editor.jsx';
import Canvas from './Canvas.jsx';
import { compile } from './typst.js';
import { fromSvg } from './ink.js';
import * as api from './server.js';

const POLL_MS = 1500;

export default function App() {
  const viewRef = useRef(null);

  const [source, setSource] = useState(null);
  const [figures, setFigures] = useState(new Map()); // "figurer/x.svg" -> Uint8Array
  const [svg, setSvg] = useState('');
  const [diags, setDiags] = useState([]);
  const [status, setStatus] = useState('startar');
  const [drawing, setDrawing] = useState(null);
  const [pane, setPane] = useState('båda');

  // Vad servern senast sa, och vad vi senast skickade dit. Skillnaden
  // mellan de två är hela synkmodellen.
  const sync = useRef({ mtime: 0, sparad: null, figurer: {}, skriver: false });

  const figuresRef = useRef(new Map());
  const sourceRef = useRef(null);

  const läsFigurer = useCallback(async (lista) => {
    const map = new Map(figuresRef.current);
    for (const [namn, m] of Object.entries(lista)) {
      const nyckel = 'figurer/' + namn;
      if (sync.current.figurer[namn] === m && map.has(nyckel)) continue;
      try {
        const { svg } = await api.hämtaFigur(namn);
        map.set(nyckel, api.tillBytes(svg));
      } catch {
        /* hoppa över, nästa poll försöker igen */
      }
    }
    for (const nyckel of [...map.keys()]) {
      if (!lista[nyckel.slice('figurer/'.length)]) map.delete(nyckel);
    }
    sync.current.figurer = lista;
    return map;
  }, []);

  // Hämta tillståndet, både vid start och på poll
  const dra = useCallback(
    async (första = false) => {
      const s = await api.hämtaTillstånd();
      const egnaÄndringar = !första && sync.current.sparad !== null && sync.current.sparad !== sourceRef.current;

      if (s.mtime !== sync.current.mtime && !egnaÄndringar && !sync.current.skriver) {
        sync.current.mtime = s.mtime;
        sync.current.sparad = s.source;
        setSource(s.source);
        setDoc(viewRef.current, s.source);
      } else if (första) {
        sync.current.mtime = s.mtime;
        sync.current.sparad = s.source;
        setSource(s.source);
      }

      const nu = figuresRef.current;
      const ny = await läsFigurer(s.figurer);
      if (ny.size !== nu.size || [...ny.keys()].some((k) => nu.get(k) !== ny.get(k))) {
        figuresRef.current = ny;
        setFigures(ny);
      }
    },
    [läsFigurer],
  );

  sourceRef.current = source;
  figuresRef.current = figures;

  useEffect(() => {
    dra(true).catch((e) => {
      setStatus('ingen kontakt: ' + (e.message || e));
      setSource('');
    });
  }, [dra]);

  useEffect(() => {
    const id = setInterval(() => {
      dra().catch(() => setStatus('ingen kontakt'));
    }, POLL_MS);
    return () => clearInterval(id);
  }, [dra]);

  // Spara till servern, med paus. Misslyckas det ligger texten kvar och
  // nästa tangenttryck försöker igen.
  useEffect(() => {
    if (source === null || source === sync.current.sparad) return;
    const id = setTimeout(async () => {
      sync.current.skriver = true;
      try {
        const r = await api.sparaDokument(source);
        sync.current.mtime = r.mtime;
        sync.current.sparad = source;
      } catch (e) {
        setStatus('sparar inte: ' + (e.message || e));
      } finally {
        sync.current.skriver = false;
      }
    }, 400);
    return () => clearTimeout(id);
  }, [source]);

  // Kompilera
  useEffect(() => {
    if (source === null) return;
    let alive = true;
    const id = setTimeout(async () => {
      try {
        const res = await compile(source, figures);
        if (!alive) return;
        if (res.svg) setSvg(res.svg);
        setDiags(res.diagnostics);
        setStatus(`${Math.round(res.ms)} ms`);
      } catch (e) {
        if (alive) setStatus(String(e.message || e));
      }
    }, 220);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [source, figures]);

  const openCanvas = useCallback(async () => {
    const befintlig = figureAtCursor(viewRef.current);
    if (befintlig) {
      const namn = befintlig.split('/').pop();
      const bytes = figures.get('figurer/' + namn);
      const strokes = bytes ? fromSvg(new TextDecoder().decode(bytes)) : null;
      setDrawing({ namn, strokes: strokes ?? [], ny: false });
    } else {
      setDrawing({ namn: api.nästaFigurnamn(sync.current.figurer), strokes: [], ny: true });
    }
  }, [figures]);

  const finishCanvas = async (svgText) => {
    const { namn, ny } = drawing;
    try {
      const r = await api.sparaFigur(namn, svgText);
      sync.current.figurer = { ...sync.current.figurer, [namn]: r.mtime };
      const ny = new Map(figuresRef.current).set('figurer/' + namn, api.tillBytes(svgText));
      figuresRef.current = ny;
      setFigures(ny);
      if (ny) {
        // #image, inte #figure: det senare finns för numrering och
        // korsreferenser och skriver "Figur 1:" i utfallet, vilket inte är
        // vad man vill ha under en föreläsning.
        insertAtCursor(viewRef.current, `\n#image("figurer/${namn}")\n`);
      }
      setDrawing(null);
    } catch (e) {
      setStatus('figuren sparades inte: ' + (e.message || e));
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'd' && !drawing) {
        e.preventDefault();
        openCanvas();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawing, openCanvas]);

  if (source === null) return <div className="boot">Laddar…</div>;

  const errors = diags.filter((d) => d.severity === 'error');

  return (
    <div className="app">
      <header>
        <strong>Anteckningar</strong>
        <button onClick={openCanvas}>
          Rita <kbd>⌘D</kbd>
        </button>
        <div className="panes">
          {['kod', 'båda', 'utfall'].map((p) => (
            <button key={p} className={pane === p ? 'on' : ''} onClick={() => setPane(p)}>
              {p}
            </button>
          ))}
        </div>
        <span className={'status' + (errors.length ? ' bad' : '')}>
          {errors.length ? `${errors.length} fel` : status}
        </span>
      </header>

      <main className={'pane-' + pane}>
        <section className="left">
          <Editor value={source} onChange={setSource} onDraw={openCanvas} viewRef={viewRef} />
          {errors.length > 0 && (
            <ul className="diags">
              {errors.slice(0, 4).map((d, i) => (
                <li key={i}>
                  {d.line !== null ? `rad ${d.line + 1}: ` : ''}
                  {d.message}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="right" dangerouslySetInnerHTML={{ __html: svg }} />
      </main>

      {drawing && (
        <Canvas
          key={drawing.namn}
          name={drawing.namn}
          initialStrokes={drawing.strokes}
          onDone={finishCanvas}
          onCancel={() => setDrawing(null)}
        />
      )}
    </div>
  );
}
