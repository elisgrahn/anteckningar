// Completion for Typst. Five sources, all derived from the document itself or
// from a short hand-written list — no language server, no index on disk.
//
// The sources are handed to `autocompletion({override})` rather than being
// registered as language data: language data holds one source per language,
// and these are five.
import { completeAnyWord, completeFromList, snippetCompletion } from '@codemirror/autocomplete';
import { macros } from './SymbolRow.jsx';
import { mathAt } from './typstlang.js';

// The commands actually used in these notes, not all of Typst. Snippets, so
// Tab steps through the fields.
const COMMANDS = completeFromList([
  snippetCompletion('#figure(${body}, caption: [${caption}])', { label: '#figure', type: 'function' }),
  snippetCompletion('#image("figures/${f-01.svg}")', { label: '#image', type: 'function' }),
  snippetCompletion('#let ${name} = ${value}', { label: '#let', type: 'keyword' }),
  snippetCompletion('#set ${text(size: 11pt)}', { label: '#set', type: 'keyword' }),
  snippetCompletion('#place(dx: ${0pt}, dy: ${0pt}, ${body})', { label: '#place', type: 'function' }),
]);

// Math symbol names. The ones that take an argument are snippets; the rest are
// plain words. Far from complete — this is the notation of a physics and maths
// course, and the row in SymbolRow covers the same ground for a bare finger.
const MATH_WORDS = [
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota',
  'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon',
  'phi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi',
  'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
  'integral', 'integral.double', 'integral.cont', 'sum', 'product', 'dif',
  'diff', 'partial', 'nabla', 'infinity', 'lim', 'inf', 'sup', 'max', 'min',
  'log', 'ln', 'exp', 'sin', 'cos', 'tan', 'det', 'arg',
  'arrow.r', 'arrow.l', 'arrow.t', 'arrow.b', 'arrow.r.long', 'arrow.r.double',
  'in', 'in.not', 'subset', 'subset.eq', 'union', 'sect', 'forall', 'exists',
  'emptyset', 'times', 'dot.c', 'plus.minus', 'minus.plus', 'approx', 'equiv',
  'prop', 'lt.eq', 'gt.eq', 'eq.not', 'angle', 'degree', 'quad', 'space',
];
const MATH_FUNCS = [
  'sqrt', 'root', 'frac', 'vec', 'mat', 'cases', 'abs', 'norm', 'floor',
  'ceil', 'hat', 'bar', 'tilde', 'dot', 'arrow', 'bb', 'cal', 'upright', 'op',
];
const SYMBOLS = completeFromList([
  ...MATH_WORDS.map((label) => ({ label, type: 'constant' })),
  ...MATH_FUNCS.map((label) => snippetCompletion(label + '(${})', { label, type: 'function' })),
]);

// Everything read out of the source, rebuilt only when the text has changed.
// A completion source runs on every keystroke, and the document is scanned
// whole.
let cache = { src: null, tables: null };

function tables(state) {
  const src = state.doc.toString();
  if (cache.src !== src) cache = { src, tables: build(src) };
  return cache.tables;
}

// Everything between two dollar signs. Coarse — a $ inside a string in code
// throws the pairing off — but the cost of being wrong is a missing suggestion.
const MATH = /\$([^$]+)\$/g;
// `f(x)` and the like, so that `f` can suggest the shape it is written with.
// The arguments stay on one line: without that, `cases(` swallows three rows of
// the document and offers them back as a single suggestion.
const CALL = /([\p{L}][\p{L}\p{N}_.-]*)\(([^()\n]*)\)/gu;

function build(src) {
  const subs = new Map();
  const calls = new Set();
  for (const region of src.matchAll(MATH)) {
    const body = region[1];
    for (const m of body.matchAll(CALL)) if (m[2].trim()) calls.add(m[0]);
    for (const line of body.split('\n')) {
      const eq = equation(line);
      if (!eq) continue;
      const had = subs.get(eq.lhs);
      if (!had) subs.set(eq.lhs, [eq.rhs]);
      else if (!had.includes(eq.rhs)) had.push(eq.rhs);
    }
  }
  return { names: macros(src), subs, calls: [...calls] };
}

/** `lhs = rhs` on a single line, and nothing that only looks like it. */
function equation(line) {
  const m = /^\s*([^=]+?)\s*=\s*([^=]+?)\s*$/.exec(line.replace(/[,;&]\s*$/, ''));
  if (!m) return null;
  const [, lhs, rhs] = m;
  // `<=`, `!=`, `:=` and `=>` are comparisons and definitions, not something
  // the right-hand side can be substituted into.
  if (/[<>!:]$/.test(lhs) || /^[<>]/.test(rhs)) return null;
  if (!lhs || !rhs || lhs.length > 40) return null;
  return { lhs, rhs };
}

/** The macros defined by the document's own #let lines. */
function macroSource(context) {
  const { names } = tables(context.state);
  if (!names.length) return null;
  // Bare in math mode, with a # outside it — that is how Typst wants them, and
  // the same rule the symbol row follows.
  const math = mathAt(context.state.doc, context.pos);
  return completeFromList(
    names.map((n) => ({ label: math ? n : '#' + n, type: 'variable', detail: 'macro' })),
  )(context);
}

const inMath = (source) => (context) =>
  mathAt(context.state.doc, context.pos) ? source(context) : null;
const outsideMath = (source) => (context) =>
  mathAt(context.state.doc, context.pos) ? null : source(context);

// An identifier, possibly with its arguments: `v`, `v(t)`, `E_k`.
const TOKEN = /[\p{L}][\p{L}\p{N}_.-]*(\([^()\n]*\))?$/u;

/**
 * Substitution: what the thing under the cursor has been said to equal earlier
 * in the document. Never applied on its own — substituting is a step in a
 * calculation, not a spelling correction, so it has to be picked from the list.
 */
function substitution(context) {
  if (!mathAt(context.state.doc, context.pos)) return null;
  const before = context.matchBefore(TOKEN);
  if (!before) return null;
  const { subs, calls } = tables(context.state);
  const options = [];
  for (const rhs of subs.get(before.text) || []) {
    options.push({ label: rhs, detail: before.text + ' =', type: 'constant', boost: 1 });
  }
  // The simpler half of the same table: `v` suggests `v(t)`, because that is
  // how v has been written before.
  for (const call of calls) {
    if (call !== before.text && call.startsWith(before.text)) {
      options.push({ label: call, type: 'function' });
    }
  }
  if (!options.length) return null;
  // filter: false — the options are what the typed text may *become*, so
  // CodeMirror's own filtering would throw away `2g` as no match for `v(t)`.
  return { from: before.from, options, filter: false };
}

export const typstCompletions = [
  outsideMath(COMMANDS),
  macroSource,
  inMath(SYMBOLS),
  substitution,
  completeAnyWord,
];
