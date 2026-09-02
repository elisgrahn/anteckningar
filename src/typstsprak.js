// Enkel syntaxfärgning för Typst via StreamLanguage — det finns ingen färdig
// CM6-modul för Typst och en riktig tree-sitter-grammatik är för mycket för
// den nytta vi behöver (rubriker, matte, #-kod, strängar, kommentarer, fetstil
// och kursiv). Radbaserad tokenizer, ingen egentlig parsning.
import { StreamLanguage } from "@codemirror/language";
import { tags } from "@lezer/highlight";

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
    return tags.comment;
  }

  if (tillstånd.iMatte) {
    if (stream.match(/^[^$]*\$/)) {
      tillstånd.iMatte = false;
    } else {
      stream.skipToEnd();
    }
    return tags.special(tags.string);
  }

  if (stream.sol() && stream.match(/^=+ .*/)) return tags.heading;

  if (stream.eatSpace()) return null;

  if (stream.match("//")) {
    stream.skipToEnd();
    return tags.comment;
  }

  if (stream.match("/*")) {
    if (!stream.skipTo("*/")) {
      // Öppnas men stängs inte på den här raden — fortsätt på nästa.
      tillstånd.iBlockkommentar = true;
    } else {
      stream.match("*/");
    }
    return tags.comment;
  }

  if (stream.peek() === '"') {
    // Ett fullständigt "..." på samma rad blir en sträng. Hittas inget
    // radslut utan avslutande citattecken äts bara citatet, så resten av
    // raden faller tillbaka till vanlig text i stället för att läcka ett
    // öppet strängläge till nästa rad.
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return tags.string;
    stream.next();
    return null;
  }

  if (stream.peek() === "$") {
    const vidRadstart = /^\s*$/.test(stream.string.slice(0, stream.start));
    stream.next();
    if (stream.match(/^[^$]*\$/)) return tags.special(tags.string); // stängs på samma rad
    if (vidRadstart) {
      // $ först på raden tolkas som start på flerradig matte (blockform).
      tillstånd.iMatte = true;
      stream.skipToEnd();
      return tags.special(tags.string);
    }
    // Ett ensamt $ mitt i text — troligen en genuin symbol/felskrivning,
    // inte matte. Färga bara tecknet och låt resten av raden vara text.
    return null;
  }

  if (stream.match(/^#[a-zA-Z_][\w-]*/)) {
    const namn = stream.current().slice(1);
    return NYCKELORD.has(namn) ? tags.keyword : tags.function(tags.variableName);
  }

  if (stream.match(/^\*[^*\n]+\*/)) return tags.strong;
  if (stream.match(/^_[^_\n]+_/)) return tags.emphasis;

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
