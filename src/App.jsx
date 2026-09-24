import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor, {
  deleteLine,
  figureAtCursor,
  goTo,
  goToLine,
  inMath,
  insertAtCursor,
  moveLine,
  setDoc,
  upsertLine,
} from './Editor.jsx';
import { lineAt } from './sourcemap.js';
import { anchorFor, offsetFrom, pageTop, placeCode, placedRects, svgSize } from './placed.js';
import SymbolRow, { macros } from './SymbolRow.jsx';
import Canvas from './Canvas.jsx';
import PageDraw from './PageDraw.jsx';
import { compile } from './typst.js';
import { figureOrigin, fromSvg, inkTopLeft, toSvg, SCALE } from './ink.js';
import * as api from './server.js';

const POLL_MS = 1500;

// A path inside the user's document, referenced from main.typ.
const FIG_DIR = 'figures/';

// #image, not #figure: the latter exists for numbering and cross-references and
// writes "Figure 1:" in the output, which is not what you want during a lecture.
const figureCode = (name) => `\n#image("${FIG_DIR}${name}")\n`;

export default function App() {
  const viewRef = useRef(null);
  const rightRef = useRef(null);

  const [source, setSource] = useState(null);
  const [figures, setFigures] = useState(new Map()); // "figures/x.svg" -> Uint8Array
  const [svg, setSvg] = useState('');
  // Where the lines landed in the latest rendering. Belongs to that exact svg
  // and is replaced together with it, or it would point wrong after a keystroke.
  const [layout, setLayout] = useState({ markers: [], pages: [] });
  const [diags, setDiags] = useState([]);
  const [status, setStatus] = useState('starting');
  const [drawing, setDrawing] = useState(null);
  const [pane, setPane] = useState('both');
  // The figure on the cursor's line, if any. Set by the editor on every move;
  // the same value twice in a row causes no re-render.
  const [onFigure, setOnFigure] = useState(null);
  // The other device has changed something, but we have unsaved characters.
  const [waiting, setWaiting] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [showCleanup, setShowCleanup] = useState(false);

  // What the server last said, and what we last sent there. The difference
  // between the two is the whole sync model.
  //
  // `loaded` guards against the one way this app can destroy your work: a
  // failed first load falls back to an empty editor so you never get stuck on
  // "Loading…" (invariant 6), and the autosave would then happily write that
  // emptiness to disk. Nothing is saved until a load has actually succeeded.
  const sync = useRef({ mtime: 0, saved: null, figures: {}, writing: false, loaded: false });

  const figuresRef = useRef(new Map());
  const sourceRef = useRef(null);

  // Figure names that have appeared in the source at some point since load.
  const seenBefore = useRef(new Set());

  const loadFigures = useCallback(async (list) => {
    const map = new Map(figuresRef.current);
    for (const [name, m] of Object.entries(list)) {
      const key = FIG_DIR + name;
      if (sync.current.figures[name] === m && map.has(key)) continue;
      try {
        const { svg } = await api.fetchFigure(name);
        map.set(key, api.toBytes(svg));
      } catch {
        /* skip it, the next poll tries again */
      }
    }
    for (const key of [...map.keys()]) {
      if (!list[key.slice(FIG_DIR.length)]) map.delete(key);
    }
    sync.current.figures = list;
    return map;
  }, []);

  // Fetch the state, both at start and on every poll
  const pull = useCallback(
    async (first = false) => {
      const s = await api.fetchState();
      if (typeof s?.source !== 'string' || !s.figures) throw new Error('unexpected state from the server');
      sync.current.loaded = true;
      const ownEdits = !first && sync.current.saved !== null && sync.current.saved !== sourceRef.current;

      // Blocking is right — your unsaved characters must not be overwritten —
      // but it was silent, so the other device's text existed without showing.
      setWaiting(s.mtime !== sync.current.mtime && (ownEdits || sync.current.writing));

      if (s.mtime !== sync.current.mtime && !ownEdits && !sync.current.writing) {
        sync.current.mtime = s.mtime;
        sync.current.saved = s.source;
        setSource(s.source);
        setDoc(viewRef.current, s.source);
      } else if (first) {
        sync.current.mtime = s.mtime;
        sync.current.saved = s.source;
        setSource(s.source);
      }

      // Everything already on disk at start counts as seen, even if it is not
      // in the text. Otherwise a figure whose line was deleted yesterday would
      // show up as new after every reload.
      if (first) for (const name of Object.keys(s.figures)) seenBefore.current.add(name);

      const now = figuresRef.current;
      const next = await loadFigures(s.figures);
      if (next.size !== now.size || [...next.keys()].some((k) => now.get(k) !== next.get(k))) {
        figuresRef.current = next;
        setFigures(next);
      }
    },
    [loadFigures],
  );

  sourceRef.current = source;
  figuresRef.current = figures;

  useEffect(() => {
    pull(true).catch((e) => {
      setStatus('no connection: ' + (e.message || e));
      setSource('');
    });
  }, [pull]);

  useEffect(() => {
    const id = setInterval(() => {
      pull().catch(() => setStatus('no connection'));
    }, POLL_MS);
    return () => clearInterval(id);
  }, [pull]);

  // Save to the server, debounced. If it fails the text is still there and the
  // next keystroke tries again.
  useEffect(() => {
    if (!sync.current.loaded || source === null || source === sync.current.saved) return;
    const id = setTimeout(async () => {
      sync.current.writing = true;
      try {
        const r = await api.saveDoc(source);
        sync.current.mtime = r.mtime;
        sync.current.saved = source;
      } catch (e) {
        setStatus('not saving: ' + (e.message || e));
      } finally {
        sync.current.writing = false;
      }
    }, 400);
    return () => clearTimeout(id);
  }, [source]);

  // Compile
  useEffect(() => {
    if (source === null) return;
    let alive = true;
    const id = setTimeout(async () => {
      try {
        const res = await compile(source, figures);
        if (!alive) return;
        if (res.svg) {
          setSvg(res.svg);
          setLayout({ markers: res.markers, pages: res.pages });
        }
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

  // What each figure file says about itself: its size on paper, how far in from
  // its corner the ink starts, and a copy to show while it is being dragged.
  // Read out of the files, not tracked — they are the truth.
  const figureInfo = useMemo(() => {
    const out = new Map();
    for (const [path, bytes] of figures) {
      const text = new TextDecoder().decode(bytes);
      const size = svgSize(text);
      if (!size) continue;
      const strokes = fromSvg(text);
      const origin = strokes?.length ? figureOrigin(strokes) : null;
      const top = strokes?.length ? inkTopLeft(strokes) : null;
      const ink = origin ? { x: (top.x - origin.x) / SCALE, y: (top.y - origin.y) / SCALE } : { x: 0, y: 0 };
      out.set(path, { size, ink, href: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}` });
    }
    return out;
  }, [figures]);

  // Every placed figure as a rectangle on the page. Derived from the source and
  // the latest markers, like the outline and the pending figures — no state of
  // its own, so it cannot fall out of step with the text.
  const placed = useMemo(() => {
    if (source === null) return [];
    return placedRects(
      source,
      layout.markers,
      layout.pages,
      (p) => figureInfo.get(p)?.size ?? null,
      (p) => figureInfo.get(p)?.ink ?? null,
    ).map((r) => ({ ...r, href: figureInfo.get(r.path)?.href ?? null }));
  }, [source, layout, figureInfo]);

  const openCanvas = useCallback(async () => {
    const existing = figureAtCursor(viewRef.current);
    if (existing) {
      const name = existing.split('/').pop();
      const bytes = figures.get(FIG_DIR + name);
      const strokes = bytes ? fromSvg(new TextDecoder().decode(bytes)) : null;
      // A placed figure keeps its anchor while it is added to, but its corner
      // moves if the new ink reaches further up or left. The offsets are
      // adjusted by that much on the way out, or the figure would slide.
      const place = placed.find((p) => p.name === name) ?? null;
      setDrawing({
        name,
        strokes: strokes ?? [],
        isNew: false,
        place,
        origin: strokes?.length ? figureOrigin(strokes) : null,
      });
    } else {
      setDrawing({ name: api.nextFigureName(sync.current.figures), strokes: [], isNew: true });
    }
  }, [figures, placed]);

  // Double-clicking the output goes to the line in the code. If that line holds
  // a figure it opens for editing instead — the cursor is already in place.
  //
  // The resolution is block level, not per character: the click lands at the
  // start of the block, not on the word it hit. That is deliberate, not a bug.
  const pick = ({ page, y }) => {
    const line = lineAt(layout.markers, page, y);
    if (line === null) return;
    goToLine(viewRef.current, line);
    if (figureAtCursor(viewRef.current)) openCanvas();
  };

  // A figure drawn on the page. The name and the anchor are decided when the
  // first stroke lands and then stay put: the figure grows, but it keeps
  // belonging to the block it was started at.
  const onPage = useRef(null);

  const placeFigure = useCallback(
    async (name, strokes) => {
      // Which block the figure belongs to is decided by the ink, not by the
      // saved figure's padded corner — the padding is taller than a line of
      // text, so an underline would otherwise belong to the paragraph above.
      // Which block the figure belongs to is settled by anchorFor, the same
      // rule a drag uses — see src/placed.js. It holds only because withMarkers
      // closes the document with a sentinel block: without it a figure written
      // after the final paragraph sat one line too high and jumped as soon as
      // anything was typed after it. Measured with the sentinel: 109.49 both
      // before and after.
      const ink = inkTopLeft(strokes);
      const origin = figureOrigin(strokes);
      const flow = onPage.current.flow ?? anchorFor(layout.markers, layout.pages, { x: ink.x / SCALE, y: ink.y / SCALE });
      if (!flow) return; // nothing to anchor to; the figure is saved anyway
      onPage.current.flow = flow;

      const { dx, dy } = offsetFrom(flow, layout.pages, { x: origin.x / SCALE, y: origin.y / SCALE });
      const path = FIG_DIR + name;
      upsertLine(viewRef.current, `image("${path}")`, placeCode(path, dx, dy), flow.line);
    },
    [layout],
  );

  // Nothing waits for a save button: each finished stroke is written straight
  // through. Done only ends the grouping, so the next stroke starts a new
  // figure instead of joining this one.
  const onPageStrokes = (data) => {
    clearTimeout(onPage.current?.timer);
    if (!data) {
      onPage.current = null;
      return;
    }
    if (!onPage.current) {
      onPage.current = { name: api.nextFigureName(sync.current.figures), flow: null };
    }
    const { name } = onPage.current;
    onPage.current.timer = setTimeout(async () => {
      try {
        const svgText = toSvg(data.strokes);
        const r = await api.saveFigure(name, svgText);
        sync.current.figures = { ...sync.current.figures, [name]: r.mtime };
        const next = new Map(figuresRef.current).set(FIG_DIR + name, api.toBytes(svgText));
        figuresRef.current = next;
        setFigures(next);
        await placeFigure(name, data.strokes);
      } catch (e) {
        setStatus('figure not saved: ' + (e.message || e));
      }
    }, 400);
  };

  // Selecting, moving and deleting a figure that is already on the page. The
  // line in the source is the only thing that changes: the svg on disk is
  // untouched, so a deleted figure turns up in the cleanup list rather than
  // disappearing.
  const anchorAt = useCallback(
    (ink) => {
      const a = anchorFor(layout.markers, layout.pages, ink);
      return a ? { line: a.line, y: pageTop(layout.pages, a.page) + a.y } : null;
    },
    [layout],
  );

  const movePlaced = useCallback(
    (item, ddx, ddy) => {
      const origin = { x: item.x + ddx, y: item.y + ddy };
      const flow = anchorFor(layout.markers, layout.pages, { x: origin.x + item.inkDx, y: origin.y + item.inkDy });
      if (!flow) return;
      const { dx, dy } = offsetFrom(flow, layout.pages, origin);
      // Changing anchor has to move the line, not just its numbers, or the
      // offsets point from the wrong block the moment the text reflows.
      moveLine(viewRef.current, `image("${item.path}")`, placeCode(item.path, dx, dy), flow.line);
    },
    [layout],
  );

  const deletePlaced = useCallback((item) => {
    deleteLine(viewRef.current, `image("${item.path}")`);
  }, []);

  const openPlaced = useCallback(
    (item) => {
      goToLine(viewRef.current, item.line);
      openCanvas();
    },
    [openCanvas],
  );

  const finishCanvas = async (svgText) => {
    const { name, isNew, place, origin } = drawing;
    try {
      const r = await api.saveFigure(name, svgText);
      sync.current.figures = { ...sync.current.figures, [name]: r.mtime };
      const next = new Map(figuresRef.current).set(FIG_DIR + name, api.toBytes(svgText));
      figuresRef.current = next;
      setFigures(next);
      // If we only added to a figure that is already in the text, the line
      // stays as it is. Only new figures are inserted.
      if (isNew) {
        insertAtCursor(viewRef.current, figureCode(name));
      } else if (place && origin) {
        // A placed figure that grew upwards or to the left has a new corner.
        // The offsets follow it, so the ink stays where it was drawn instead of
        // sliding by the amount the figure grew.
        const strokes = fromSvg(svgText);
        const now = strokes?.length ? figureOrigin(strokes) : origin;
        const dx = place.dx + (now.x - origin.x) / SCALE;
        const dy = place.dy + (now.y - origin.y) / SCALE;
        upsertLine(viewRef.current, `image("${place.path}")`, placeCode(place.path, dx, dy), place.line);
      }
      setDrawing(null);
    } catch (e) {
      setStatus('figure not saved: ' + (e.message || e));
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      // Mod-i, not Mod-d: Mod-d is selectNextOccurrence in the editor.
      if ((e.metaKey || e.ctrlKey) && e.key === 'i' && !drawing) {
        e.preventDefault();
        openCanvas();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawing, openCanvas]);

  // Pending is a figure whose file name does not appear in the source and never
  // has. Deleting a figure line is a deliberate choice — the figure must not
  // come back as "new" and offer to insert itself again. What remains is what
  // the button is actually for: a figure that never made it into the text, for
  // instance when the other device's write got there first and removed the line.
  const pending = useMemo(() => {
    if (source === null) return [];
    const names = [...figures.keys()].map((k) => k.slice(FIG_DIR.length));
    for (const n of names) if (source.includes(n)) seenBefore.current.add(n);
    return names.filter((n) => !source.includes(n) && !seenBefore.current.has(n)).sort();
  }, [figures, source]);

  // All at once, in name order, as a single undoable change.
  const insertPending = () => insertAtCursor(viewRef.current, pending.map(figureCode).join(''));

  // A dollar sign is inserted as a pair with the cursor between them. A macro
  // goes in bare in math mode and with a # outside it, since that is how Typst
  // wants it.
  const insertSymbol = (t) => {
    const view = viewRef.current;
    if (t === '$') return insertAtCursor(view, '$$', 1);
    if (t === '(') return insertAtCursor(view, '()', 1);
    const own = source !== null && macros(source).includes(t);
    insertAtCursor(view, own && !inMath(view) ? '#' + t : t);
  };

  // Every figure not mentioned in the text, including the ones whose line you
  // deleted. Unlike pending, which is only those that never entered the text.
  const unused = useMemo(() => {
    if (source === null) return [];
    return [...figures.keys()]
      .map((k) => k.slice(FIG_DIR.length))
      .filter((name) => !source.includes(name))
      .sort();
  }, [figures, source]);

  const remove = async (name) => {
    if (!window.confirm(`Delete ${name}? The file disappears from disk.`)) return;
    try {
      await api.deleteFigure(name);
      const left = new Map(figuresRef.current);
      left.delete(FIG_DIR + name);
      figuresRef.current = left;
      setFigures(left);
      const { [name]: _gone, ...rest } = sync.current.figures;
      sync.current.figures = rest;
    } catch (e) {
      setStatus('could not delete: ' + (e.message || e));
    }
  };

  // The outline is derived from the source, just like pending figures. No Typst
  // involved: the headings are in plain text in the document.
  const headings = useMemo(() => {
    if (source === null) return [];
    const out = [];
    const re = /^(=+)[ \t]+(.+)$/gm;
    let m;
    while ((m = re.exec(source)) !== null) {
      out.push({ level: m[1].length, text: m[2].trim(), pos: m.index });
    }
    return out;
  }, [source]);

  if (source === null) return <div className="boot">Loading…</div>;

  const errors = diags.filter((d) => d.severity === 'error');

  return (
    <div className="app">
      <header>
        <strong>Notes</strong>
        <button onClick={openCanvas}>
          {onFigure ? 'Edit' : 'Draw'} <kbd>⌘I</kbd>
        </button>
        {unused.length > 0 && (
          <button className={showCleanup ? 'on' : ''} onClick={() => setShowCleanup((v) => !v)}>
            Clean up {unused.length}
          </button>
        )}
        {headings.length > 0 && (
          <button className={showOutline ? 'on' : ''} onClick={() => setShowOutline((v) => !v)}>
            Outline
          </button>
        )}
        {pending.length > 0 && (
          <button className="primary" onClick={insertPending}>
            {pending.length === 1 ? '1 new figure' : `${pending.length} new figures`}
          </button>
        )}
        <div className="panes">
          {['code', 'both', 'output'].map((p) => (
            <button key={p} className={pane === p ? 'on' : ''} onClick={() => setPane(p)}>
              {p}
            </button>
          ))}
        </div>
        <span className={'status' + (errors.length ? ' bad' : waiting ? ' waiting' : '')}>
          {errors.length ? `${errors.length} errors` : waiting ? 'changes waiting' : status}
        </span>
      </header>

      <main className={'pane-' + pane}>
        <section className="left">
          {showCleanup && (
            <ul className="cleanup">
              <li className="label">Not mentioned in the text</li>
              {unused.map((name) => (
                <li key={name}>
                  <span>{name}</span>
                  <button onClick={() => remove(name)}>Delete</button>
                </li>
              ))}
            </ul>
          )}
          {showOutline && (
            <ol className="outline">
              {headings.map((h) => (
                <li key={h.pos} style={{ paddingLeft: (h.level - 1) * 14 }}>
                  <button
                    onClick={() => {
                      goTo(viewRef.current, h.pos);
                      setShowOutline(false);
                    }}
                  >
                    {h.text}
                  </button>
                </li>
              ))}
            </ol>
          )}
          <Editor
            value={source}
            onChange={setSource}
            onDraw={openCanvas}
            onCursor={setOnFigure}
            viewRef={viewRef}
          />
          <SymbolRow source={source} onInsert={insertSymbol} />
          {errors.length > 0 && (
            <ul className="diags">
              {errors.slice(0, 4).map((d, i) => (
                <li key={i}>
                  {d.line !== null ? `line ${d.line + 1}: ` : ''}
                  {d.message}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="right" ref={rightRef}>
          <div className="page-stack">
            <div dangerouslySetInnerHTML={{ __html: svg }} />
            <PageDraw
              pages={layout.pages}
              placed={placed}
              onStrokes={onPageStrokes}
              onPick={pick}
              onOpenPlaced={openPlaced}
              onMovePlaced={movePlaced}
              onDeletePlaced={deletePlaced}
              anchorAt={anchorAt}
              scrollerRef={rightRef}
            />
          </div>
        </section>
      </main>

      {drawing && (
        <Canvas
          key={drawing.name}
          name={drawing.name}
          initialStrokes={drawing.strokes}
          onDone={finishCanvas}
          onCancel={() => setDrawing(null)}
        />
      )}
    </div>
  );
}
