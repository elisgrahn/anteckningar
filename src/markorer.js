// Hopp mellan utfall och källa, utan att kompilatorn behöver kunna spann.
//
// Dokumentet får berätta själv var raderna hamnade: appen skjuter in osynliga
// metadata-markörer i den kopia som skickas till kompilatorn, och query ger
// tillbaka sida och punktposition för varje markör. Filen på disk rörs aldrig,
// så `typst compile dokument/main.typ` fungerar precis som förut (invariant 1).
//
// Radnumret ligger som data i markören, alltså gör det inget att injiceringen
// förskjuter raderna i kopian.

export const PREAMBEL = '#let __am(n) = context [#metadata((rad: n, pos: here().position()))<am>]';

// Rader som styr dokumentet i stort. En markör före #set page kan lägga
// innehåll före sidinställningen, och det syns i utfallet.
const KONFIG = /^#(set|show|import|include|let)\b/;

/**
 * Kopian som kompileras: samma text, med `#__am(rad)` på egen rad före varje
 * blockstart. Egen rad är ett krav — `#__am(6)= Rubrik` gör att `=` inte längre
 * står först på raden, och rubriken blir vanlig text.
 *
 * Markörer sätts aldrig inuti råblock, flerradig matte eller flerradiga
 * funktionsanrop, eftersom de skulle bli synliga i utfallet. Går räkningen fel
 * blir följden att en markör uteblir, alltså ett hoppmål mindre — aldrig ett
 * trasigt dokument.
 *
 * Returnerar även en karta från kopians rader till originalets, eftersom
 * kompilatorns felmeddelanden annars pekar på fel rad.
 */
export function medMarkörer(källa) {
  const rader = källa.split('\n');
  const ut = [PREAMBEL];
  const karta = [null];
  let iRå = false;
  let iMatte = false;
  let parenteser = 0;
  let förraTom = true;

  for (let i = 0; i < rader.length; i++) {
    const rad = rader[i];
    const trimmad = rad.trim();

    if (!iRå && !iMatte && parenteser <= 0 && förraTom && trimmad !== '' && !KONFIG.test(trimmad)) {
      ut.push(`#__am(${i})`);
      karta.push(null);
    }
    ut.push(rad);
    karta.push(i);

    if (/^```/.test(trimmad)) iRå = !iRå;
    if (!iRå) {
      if ((rad.match(/\$/g) || []).length % 2 === 1) iMatte = !iMatte;
      parenteser += (rad.match(/\(/g) || []).length - (rad.match(/\)/g) || []).length;
      if (parenteser < 0) parenteser = 0;
    }
    förraTom = trimmad === '';
  }

  return { text: ut.join('\n'), karta };
}

/** Kopians radnummer tillbaka till originalets, för felmeddelanden. */
export function ursprungsrad(karta, rad) {
  for (let i = rad; i >= 0; i--) if (karta[i] !== null && karta[i] !== undefined) return karta[i];
  return null;
}

const punkter = (v) => (typeof v === 'number' ? v : parseFloat(String(v)));

/** Markörerna från query, tvättade till tal och sorterade i dokumentordning. */
export function tolka(rådata) {
  if (!Array.isArray(rådata)) return [];
  return rådata
    .map((m) => ({ rad: m.rad, sida: punkter(m.pos?.page), y: punkter(m.pos?.y), x: punkter(m.pos?.x) }))
    .filter((m) => Number.isFinite(m.rad) && Number.isFinite(m.sida) && Number.isFinite(m.y))
    .sort((a, b) => a.sida - b.sida || a.y - b.y);
}

/**
 * Vilken sida hamnade en y-position i den staplade SVG:n på, och var på sidan?
 * Sidorna ligger efter varandra utan mellanrum, i punkter.
 */
export function sidaVid(sidor, yISvg) {
  let kvar = yISvg;
  for (let i = 0; i < sidor.length; i++) {
    if (kvar < sidor[i].height || i === sidor.length - 1) return { sida: i + 1, y: kvar };
    kvar -= sidor[i].height;
  }
  return { sida: 1, y: yISvg };
}

/** Sista markören på eller ovanför punkten. Blocknivå, inte per tecken. */
export function radVid(markörer, sida, y) {
  let träff = null;
  for (const m of markörer) {
    if (m.sida < sida || (m.sida === sida && m.y <= y + 1)) träff = m;
    else break;
  }
  return träff ? träff.rad : null;
}
