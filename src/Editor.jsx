import { useEffect, useRef } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState, Prec } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { search, openSearchPanel } from '@codemirror/search';
import { autocompletion, acceptCompletion } from '@codemirror/autocomplete';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { typstLanguage, mathAt } from './typstlang.js';
import { typstCompletions } from './complete.js';

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
          // The whole standard editor in one line: line numbers, undo history,
          // multiple selections, bracket matching and closing, folding,
          // autocompletion, search and the default key bindings. Everything
          // below either adds to it or replaces a part of it on purpose.
          basicSetup,
          typstLanguage,
          // Without syntaxHighlighting the tags get no colour at all — the
          // language on its own is not enough. basicSetup carries the same
          // style as a fallback; stating it here keeps that from being an
          // accident.
          syntaxHighlighting(defaultHighlightStyle),
          // openSearchPanel installs the search field itself when it is
          // missing, but then the configuration would be the default one.
          search({ top: true }),
          // Our own sources rather than the language's: there are five of them,
          // and language data holds one.
          autocompletion({ override: typstCompletions }),
          EditorView.lineWrapping,
          Prec.high(
            keymap.of([
              {
                // Mod-d belongs to selectNextOccurrence in a code editor, so
                // drawing moved out of the way. The button in the header says
                // the same thing, which is what the iPad goes by.
                key: 'Mod-i',
                preventDefault: true,
                run: () => {
                  latest.current.onDraw();
                  return true;
                },
              },
              // What VS Code uses for replace. The panel is the same one Mod-f
              // opens — it has the replace fields already.
              { key: 'Mod-h', preventDefault: true, run: openSearchPanel },
              // Returns false when no completion is open, so Tab still does
              // what it did. Snippet fields bind Tab above this one.
              { key: 'Tab', run: acceptCompletion },
            ]),
          ),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) latest.current.onChange(u.state.doc.toString());
            // On a figure line the button changes its name to Edit.
            if (u.docChanged || u.selectionSet) latest.current.onCursor(figureAtCursor(u.view));
          }),
          EditorView.theme({
            '&': { height: '100%', fontSize: '15px' },
            '.cm-content': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', padding: '12px 12px 12px 6px' },
            '.cm-scroller': { overflow: 'auto' },
            // The line numbers come with basicSetup. Grey on the same white as
            // the editor, so the gutter reads as a margin and not as a second
            // column.
            '.cm-gutters': { background: 'transparent', border: 'none', color: '#b3b9c4' },
            '.cm-activeLineGutter': { background: 'transparent', color: '#6b7280' },
            '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 12px' },
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

/** The line number, one-based, holding `match` — or 0 if the text has none. */
function findLine(doc, match) {
  for (let n = 1; n <= doc.lines; n++) if (doc.line(n).text.includes(match)) return n;
  return 0;
}

/** The change that writes `text` as a block of its own before line `beforeLine`. */
function insertion(doc, beforeLine, text) {
  // Past the last line — a figure drawn below everything. Clamping to the last
  // line would put it above the final paragraph instead of after it.
  if (beforeLine + 1 > doc.lines) {
    const tail = doc.sliceString(Math.max(0, doc.length - 2));
    const lead = tail.endsWith('\n\n') ? '' : tail.endsWith('\n') ? '\n' : '\n\n';
    return { from: doc.length, to: doc.length, insert: lead + text + '\n' };
  }

  // Blank lines on both sides: the block that follows keeps its own marker, the
  // one before does not swallow it as a continuation, and the figure reads as
  // belonging to what comes before it.
  const n = Math.max(beforeLine + 1, 1);
  const at = doc.line(n);
  const lead = n > 1 && doc.line(n - 1).text.trim() !== '' ? '\n' : '';
  const trail = at.text.trim() === '' ? '\n' : '\n\n';
  return { from: at.from, to: at.from, insert: lead + text + trail };
}

/**
 * The change that removes line `n` whole, along with the blank line it would
 * otherwise leave behind. Without that the document collects empty paragraphs
 * every time a figure is moved or deleted.
 */
function removal(doc, n) {
  const line = doc.line(n);
  const before = n === 1 || doc.line(n - 1).text.trim() === '';
  const after = n < doc.lines && doc.line(n + 1).text.trim() === '';
  const last = before && after ? doc.line(n + 1) : line;
  return { from: line.from, to: Math.min(last.to + 1, doc.length), insert: '' };
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
  const n = findLine(doc, match);
  if (n) {
    const line = doc.line(n);
    if (line.text === text) return;
    view.dispatch({ changes: { from: line.from, to: line.to, insert: text } });
    return;
  }
  view.dispatch({ changes: insertion(doc, beforeLine, text) });
}

/**
 * Like upsertLine, but the line may also have to change place: a figure dragged
 * far enough belongs to another block, and then new numbers are not enough —
 * the offsets would point from the wrong place the moment the text reflows.
 *
 * Removal and insertion go out as one dispatch, so a move is a single undo step.
 */
export function moveLine(view, match, text, beforeLine) {
  if (!view) return;
  const doc = view.state.doc;
  const n = findLine(doc, match);
  if (!n) return upsertLine(view, match, text, beforeLine);

  const put = insertion(doc, beforeLine, text);
  const cut = removal(doc, n);
  // Already standing where it belongs: only the numbers changed.
  if (put.from >= cut.from && put.from <= cut.to) {
    const line = doc.line(n);
    if (line.text === text) return;
    view.dispatch({ changes: { from: line.from, to: line.to, insert: text } });
    return;
  }
  view.dispatch({ changes: [cut, put].sort((a, b) => a.from - b.from) });
}

/** Removes the line holding `match`. The figure's file on disk is untouched. */
export function deleteLine(view, match) {
  if (!view) return;
  const doc = view.state.doc;
  const n = findLine(doc, match);
  if (n) view.dispatch({ changes: removal(doc, n) });
}

/** Is the cursor between two dollar signs? Decides whether a macro is inserted
 *  as `lg` or as `#lg`, since math mode uses the name bare. */
export function inMath(view) {
  if (!view) return false;
  return mathAt(view.state.doc, view.state.selection.main.head);
}
