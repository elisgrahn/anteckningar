import { useEffect, useRef } from 'react';
import { EditorView, keymap, highlightActiveLine } from '@codemirror/view';
import { EditorState, Prec } from '@codemirror/state';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { search, searchKeymap } from '@codemirror/search';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { typstLanguage } from './typstlang.js';

// CodeMirror rather than Monaco: Monaco is built for mouse and keyboard and
// behaves badly with a touch screen and the iPad keyboard.
export default function Editor({ value, onChange, onDraw, onCursor, viewRef }) {
  const host = useRef(null);

  // The editor is created once, but props change identity on every render.
  // Without this ref the keymap closes over the first render's callbacks and
  // draws with an empty figure list.
  const latest = useRef(null);
  latest.current = { onChange, onDraw, onCursor };

  useEffect(() => {
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        // At the end of the document, not the start. Notes grow downwards, so
        // that is where the next figure goes unless the cursor was moved.
        selection: { anchor: value.length },
        extensions: [
          history(),
          highlightActiveLine(),
          typstLanguage,
          // Without syntaxHighlighting the tags get no colour at all — the
          // language on its own is not enough.
          syntaxHighlighting(defaultHighlightStyle),
          search(),
          EditorView.lineWrapping,
          Prec.high(
            keymap.of([
              {
                key: 'Mod-d',
                preventDefault: true,
                run: () => {
                  latest.current.onDraw();
                  return true;
                },
              },
            ]),
          ),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) latest.current.onChange(u.state.doc.toString());
            // On a figure line the button changes its name to Edit.
            if (u.docChanged || u.selectionSet) latest.current.onCursor(figureAtCursor(u.view));
          }),
          EditorView.theme({
            '&': { height: '100%', fontSize: '15px' },
            '.cm-content': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', padding: '12px' },
            '.cm-scroller': { overflow: 'auto' },
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => view.destroy();
    // The editor is created once; the text is owned by CodeMirror after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="editor" ref={host} />;
}

/** Replaces the whole text from outside without losing the cursor position. */
export function setDoc(view, text) {
  if (!view || view.state.doc.toString() === text) return;
  const head = Math.min(view.state.selection.main.head, text.length);
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    selection: { anchor: head },
  });
}

/** Path to the figure on the cursor's line, if there is one. */
export function figureAtCursor(view) {
  if (!view) return null;
  const line = view.state.doc.lineAt(view.state.selection.main.head).text;
  const m = line.match(/image\(\s*"([^"]+\.svg)"/);
  return m ? m[1] : null;
}

/** Moves the cursor to the start of a line and scrolls there. */
export function goToLine(view, line) {
  if (!view) return;
  const nr = Math.min(Math.max(line + 1, 1), view.state.doc.lines);
  const target = view.state.doc.line(nr);
  view.dispatch({ selection: { anchor: target.from }, scrollIntoView: true });
  view.focus();
}

/** Moves the cursor to a position in the text and scrolls there. */
export function goTo(view, pos) {
  if (!view) return;
  const p = Math.min(pos, view.state.doc.length);
  view.dispatch({ selection: { anchor: p }, scrollIntoView: true });
  view.focus();
}

/**
 * Inserts text at the cursor as a single undoable change, keeping focus.
 * `back` moves the cursor backwards afterwards, to land inside a pair that was
 * just inserted.
 */
export function insertAtCursor(view, text, back = 0) {
  if (!view) return;
  const pos = view.state.selection.main.head;
  view.dispatch({
    changes: { from: pos, insert: text },
    selection: { anchor: pos + text.length - back },
    scrollIntoView: true,
  });
  view.focus();
}

/**
 * Writes a line that identifies itself by `match`: replaces it where it already
 * exists, otherwise inserts it before line `beforeLine`. One dispatch, so one
 * undo step, and the cursor is carried along by CodeMirror.
 *
 * This is how a figure drawn on the page keeps its #place line up to date while
 * it grows, without the app having to track a line number that keeps moving.
 */
export function upsertLine(view, match, text, beforeLine) {
  if (!view) return;
  const doc = view.state.doc;
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    if (line.text.includes(match)) {
      if (line.text === text) return;
      view.dispatch({ changes: { from: line.from, to: line.to, insert: text } });
      return;
    }
  }
  // Past the last line — a figure drawn below everything. Clamping to the last
  // line would put it above the final paragraph instead of after it.
  if (beforeLine + 1 > doc.lines) {
    const tail = doc.sliceString(Math.max(0, doc.length - 2));
    const lead = tail.endsWith('\n\n') ? '' : tail.endsWith('\n') ? '\n' : '\n\n';
    view.dispatch({ changes: { from: doc.length, insert: lead + text + '\n' } });
    return;
  }

  // A block of its own, blank lines on both sides: the block that follows keeps
  // its own marker, the one before does not swallow it as a continuation, and
  // the figure reads as belonging to what comes before it.
  const n = Math.max(beforeLine + 1, 1);
  const at = doc.line(n);
  const lead = n > 1 && doc.line(n - 1).text.trim() !== '' ? '\n' : '';
  const trail = at.text.trim() === '' ? '\n' : '\n\n';
  view.dispatch({ changes: { from: at.from, insert: lead + text + trail } });
}

/** Is the cursor between two dollar signs? Decides whether a macro is inserted
 *  as `lg` or as `#lg`, since math mode uses the name bare. */
export function inMath(view) {
  if (!view) return false;
  const before = view.state.doc.sliceString(0, view.state.selection.main.head);
  return (before.match(/\$/g) || []).length % 2 === 1;
}
