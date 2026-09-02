// Simple syntax highlighting for Typst via StreamLanguage — there is no ready
// CM6 module for Typst, and a real tree-sitter grammar is more than we need for
// headings, math, #-code, strings, comments, bold and italic. A line-based
// tokenizer, no actual parsing.
//
// The token names are strings and not Tag objects: StreamLanguage looks them up
// in its own table, splits on the dot and treats later parts as modifiers.
import { StreamLanguage } from '@codemirror/language';

// Keywords that steer the document rather than call a function — the remaining
// #-identifiers (#image, #figure, ...) are treated as function names.
const KEYWORDS = new Set([
  'let', 'set', 'show', 'if', 'else', 'for', 'while', 'import', 'include',
  'return', 'break', 'continue', 'in', 'and', 'or', 'not',
]);

function typstToken(stream, state) {
  // Block comments and multi-line math are the only things allowed to span a
  // line break — everything else is settled within the line and never leaks.
  if (state.inBlockComment) {
    if (stream.skipTo('*/')) {
      stream.match('*/');
      state.inBlockComment = false;
    } else {
      stream.skipToEnd();
    }
    return 'comment';
  }

  if (state.inMath) {
    if (stream.match(/^[^$]*\$/)) {
      state.inMath = false;
    } else {
      stream.skipToEnd();
    }
    return 'string.special';
  }

  if (stream.sol() && stream.match(/^=+ .*/)) return 'heading';

  if (stream.eatSpace()) return null;

  if (stream.match('//')) {
    stream.skipToEnd();
    return 'comment';
  }

  if (stream.match('/*')) {
    if (!stream.skipTo('*/')) {
      // Opened but not closed on this line — continue on the next.
      state.inBlockComment = true;
    } else {
      stream.match('*/');
    }
    return 'comment';
  }

  if (stream.peek() === '"') {
    // A complete "..." on the same line is a string. If no closing quote is
    // found before the end of the line only the quote itself is eaten, so the
    // rest of the line falls back to ordinary text instead of leaking an open
    // string state into the next line.
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return 'string';
    stream.next();
    return null;
  }

  if (stream.peek() === '$') {
    const atLineStart = /^\s*$/.test(stream.string.slice(0, stream.start));
    stream.next();
    if (stream.match(/^[^$]*\$/)) return 'string.special'; // closes on the same line
    if (atLineStart) {
      // A $ first on the line reads as the start of multi-line block math.
      state.inMath = true;
      stream.skipToEnd();
      return 'string.special';
    }
    // A lone $ in the middle of text — most likely a genuine symbol or a typo,
    // not math. Colour just the character and leave the rest of the line alone.
    return null;
  }

  if (stream.match(/^#[a-zA-Z_][\w-]*/)) {
    const name = stream.current().slice(1);
    return KEYWORDS.has(name) ? 'keyword' : 'variableName.function';
  }

  if (stream.match(/^\*[^*\n]+\*/)) return 'strong';
  if (stream.match(/^_[^_\n]+_/)) return 'emphasis';

  stream.next();
  return null;
}

export const typstLanguage = StreamLanguage.define({
  token: typstToken,
  startState() {
    return { inBlockComment: false, inMath: false };
  },
  blankLine(state) {
    // A paragraph break reasonably also ends multi-line math left unclosed.
    state.inMath = false;
  },
});
