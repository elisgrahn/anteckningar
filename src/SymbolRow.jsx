// Without a keyboard, $integral_0^1 x^2 dif x$ is plain painful to type, and
// that is what decides whether the app is usable on the iPad in a lecture
// hall. The row is therefore only shown on a touch screen.
//
// The notation of your course is not listed here — it is read from the
// document's own #let lines. Same principle that keeps the source readable to
// a language model: notation is defined once in Typst, not as a list inside
// the app.

const FIXED = ['$', '_', '^', '(', ')', 'integral', 'sum', 'dif', '->', '<=', '!=', 'alpha', 'beta', 'pi'];

// Both `#let lg = ...` and `#let f(x) = ...`. Function macros are inserted
// with the name alone — the parentheses are on the row.
//
// \p{L} rather than A-Za-z: this reads the user's document, which is written in
// a natural language and may well name a macro with a letter outside ASCII.
const MACRO = /^#let\s+([\p{L}_][\p{L}\p{N}_-]*)\s*[=(]/gmu;

export function macros(source) {
  const out = [];
  for (const m of source.matchAll(MACRO)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

const isTouch = () => {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
};

export default function SymbolRow({ source, onInsert }) {
  if (!isTouch()) return null;

  const own = macros(source);

  return (
    <div className="symbols">
      {FIXED.map((t) => (
        <button key={t} onClick={() => onInsert(t)}>
          {t}
        </button>
      ))}
      {own.map((name) => (
        <button key={name} className="own" onClick={() => onInsert(name)}>
          {name}
        </button>
      ))}
    </div>
  );
}
