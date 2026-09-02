import { useEffect, useRef } from 'react';
import { EditorView, keymap, highlightActiveLine } from '@codemirror/view';
import { EditorState, Prec } from '@codemirror/state';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { search, searchKeymap } from '@codemirror/search';

// CodeMirror i stället för Monaco: Monaco är byggd för mus och tangentbord
// och beter sig illa med pekskärm och iPad-tangentbord.
export default function Editor({ value, onChange, onDraw, onMarkör, viewRef }) {
  const host = useRef(null);

  // Editorn skapas en gång, men props byter identitet vid varje render.
  // Utan den här refen stänger keymapen om första renderns callbacks och
  // ritar med en tom figurlista.
  const senaste = useRef(null);
  senaste.current = { onChange, onDraw, onMarkör };

  useEffect(() => {
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        // Sist i dokumentet, inte först. Anteckningar växer nedåt, så det är
        // där nästa figur ska in om man inte flyttat markören själv.
        selection: { anchor: value.length },
        extensions: [
          history(),
          highlightActiveLine(),
          search(),
          EditorView.lineWrapping,
          Prec.high(
            keymap.of([
              {
                key: 'Mod-d',
                preventDefault: true,
                run: () => {
                  senaste.current.onDraw();
                  return true;
                },
              },
            ]),
          ),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) senaste.current.onChange(u.state.doc.toString());
            // Står markören på en figurrad byter knappen namn till Redigera.
            if (u.docChanged || u.selectionSet) senaste.current.onMarkör(figureAtCursor(u.view));
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
    // Editorn skapas en gång; texten ägs sedan av CodeMirror.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="editor" ref={host} />;
}

/** Byter ut hela texten utifrån, utan att kasta bort markörens position. */
export function setDoc(view, text) {
  if (!view || view.state.doc.toString() === text) return;
  const head = Math.min(view.state.selection.main.head, text.length);
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    selection: { anchor: head },
  });
}

/** Sökväg till figuren på raden där markören står, om det finns någon. */
export function figureAtCursor(view) {
  if (!view) return null;
  const line = view.state.doc.lineAt(view.state.selection.main.head).text;
  const m = line.match(/image\(\s*"([^"]+\.svg)"/);
  return m ? m[1] : null;
}

/** Flyttar markören till en position i texten och rullar dit. */
export function gåTill(view, pos) {
  if (!view) return;
  const p = Math.min(pos, view.state.doc.length);
  view.dispatch({ selection: { anchor: p }, scrollIntoView: true });
  view.focus();
}

/** Lägger in text vid markören som en enda ångra-bar ändring och behåller fokus. */
export function insertAtCursor(view, text) {
  if (!view) return;
  const pos = view.state.selection.main.head;
  view.dispatch({
    changes: { from: pos, insert: text },
    selection: { anchor: pos + text.length },
    scrollIntoView: true,
  });
  view.focus();
}
