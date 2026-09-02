// Enkel syntaxfärgning för Typst via StreamLanguage — det finns ingen färdig
// CM6-modul för Typst och en riktig tree-sitter-grammatik är för mycket för
// den nytta vi behöver (rubriker, matte, #-kod, strängar, kommentarer, fetstil
// och kursiv). Radbaserad tokenizer, ingen egentlig parsning.
//
// Tokennamnen är strängar och inte Tag-objekt: StreamLanguage slår upp dem i
// sin tabell, delar på punkt och tolkar senare delar som modifierare.
import { StreamLanguage } from "@codemirror/language";

// Nyckelord som styr dokumentet snarare än anropar en funktion — resten av
// #-identifierarna (#image, #figure, ...) behandlas som funktionsnamn.
const NYCKELORD = new Set([
  "let", "set", "show", "if", "else", "for", "while", "import", "include",
  "return", "break", "continue", "in", "and", "or", "not",
]);

function typstToken(stream, tillstånd) {
  // Blockkommentar och flerradig matte är de enda sakerna som får sträcka sig
  // över ett radbyte — allt annat avgörs inom raden och läcker aldrig vidare.
  if (tillstånd.iBlockkommentar) {
    if (stream.skipTo("*/")) {
      stream.match("*/");
      tillstånd.iBlockkommentar = false;
    } else {
      stream.skipToEnd();
    }
    return 'comment';
  }

  if (tillstånd.iMatte) {
    if (stream.match(/^[^$]*\$/)) {
      tillstånd.iMatte = false;
    } else {
      stream.skipToEnd();
    }
    return 'string.special';
  }

  if (stream.sol() && stream.match(/^=+ .*/)) return 'heading';

  if (stream.eatSpace()) return null;

  if (stream.match("//")) {
    stream.skipToEnd();
    return 'comment';
  }

  if (stream.match("/*")) {
    if (!stream.skipTo("*/")) {
      // Öppnas men stängs inte på den här raden — fortsätt på nästa.
      tillstånd.iBlockkommentar = true;
    } else {
      stream.match("*/");
    }
    return 'comment';
  }

  if (stream.peek() === '"') {
    // Ett fullständigt "..." på samma rad blir en sträng. Hittas inget
    // radslut utan avslutande citattecken äts bara citatet, så resten av
    // raden faller tillbaka till vanlig text i stället för att läcka ett
    // öppet strängläge till nästa rad.
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return 'string';
    stream.next();
    return null;
  }

  if (stream.peek() === "$") {
    const vidRadstart = /^\s*$/.test(stream.string.slice(0, stream.start));
    stream.next();
    if (stream.match(/^[^$]*\$/)) return 'string.special'; // stängs på samma rad
    if (vidRadstart) {
      // $ först på raden tolkas som start på flerradig matte (blockform).
      tillstånd.iMatte = true;
      stream.skipToEnd();
      return 'string.special';
    }
    // Ett ensamt $ mitt i text — troligen en genuin symbol/felskrivning,
    // inte matte. Färga bara tecknet och låt resten av raden vara text.
    return null;
  }

  if (stream.match(/^#[a-zA-Z_][\w-]*/)) {
    const namn = stream.current().slice(1);
    return NYCKELORD.has(namn) ? 'keyword' : 'variableName.function';
  }

  if (stream.match(/^\*[^*\n]+\*/)) return 'strong';
  if (stream.match(/^_[^_\n]+_/)) return 'emphasis';

  stream.next();
  return null;
}

export const typstSpråk = StreamLanguage.define({
  token: typstToken,
  startState() {
    return { iBlockkommentar: false, iMatte: false };
  },
  blankLine(tillstånd) {
    // Ett stycke-brott avslutar rimligen även flerradig matte som glömts stängd.
    tillstånd.iMatte = false;
  },
});
