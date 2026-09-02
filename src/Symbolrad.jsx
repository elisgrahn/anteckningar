// Utan tangentbord är $integral_0^1 x^2 dif x$ rent plågsamt att skriva, och
// det är det som avgör om appen går att använda på iPaden i en sal. Raden
// visas därför bara på pekskärm.
//
// Kursens egen notation står inte här utan läses ur dokumentets #let-rader.
// Det är samma princip som gör källan läsbar för en språkmodell: notationen
// definieras en gång i Typst, inte som en lista inne i appen.

const FASTA = ['$', '_', '^', '(', ')', 'integral', 'sum', 'dif', '->', '<=', '!=', 'alpha', 'beta', 'pi'];

// Både `#let lg = ...` och `#let f(x) = ...`. Funktionsmakron sätts in med
// bara namnet — parenteserna finns på raden.
const MAKRO = /^#let\s+([A-Za-zÅÄÖåäö_][\wÅÄÖåäö-]*)\s*[=(]/gm;

export function makron(source) {
  const ut = [];
  for (const m of source.matchAll(MAKRO)) if (!ut.includes(m[1])) ut.push(m[1]);
  return ut;
}

const pekskärm = () => {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
};

export default function Symbolrad({ source, onInfoga }) {
  if (!pekskärm()) return null;

  const egna = makron(source);

  return (
    <div className="symbolrad">
      {FASTA.map((t) => (
        <button key={t} onClick={() => onInfoga(t)}>
          {t}
        </button>
      ))}
      {egna.map((namn) => (
        <button key={namn} className="eget" onClick={() => onInfoga(namn)}>
          {namn}
        </button>
      ))}
    </div>
  );
}
