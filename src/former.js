// Formigenkänning för gesten "håll kvar": står spetsen still i slutet av ett
// drag byts de ritade punkterna mot en idealiserad form. Byggt själv i stället
// för med Excalidraw eller tldraw, som för med sig egen dokumentmodell och eget
// filformat och skulle bryta invarianten att en figur är en vanlig SVG.
//
// Utdata är alltid en vanlig punktlista, så scenformatet och suddgummits
// träffprövning fungerar oförändrat.

// Hellre missa en form än att förstöra ett drag som var meningen. Tröskorna
// är avsiktligt snäva: en slarvig cirkel ska snäppa, en medveten klotter inte.
const MIN_PUNKTER = 8;
const MIN_STORLEK = 30; // mindre än så är det en prick, ett streck eller en bokstav
const LINJE_TOL = 0.08; // avvikelse från rät linje, andel av längden
const SLUTEN_TOL = 0.2; // avstånd start–slut, andel av omkretsen
// Passning mot ellips respektive rektangel. Båda mäts som medelavstånd från
// punkterna till formen, delat med halva diagonalen, alltså på samma skala.
const FORM_TOL = 0.08;

const KANT = 12; // punktavstånd längs en rektangels kanter
const HÖRNPUNKTER = 8; // upprepningar i varje hörn, se rektangel()
const KVANTIL = 0.03; // hur mycket av ytterlägena lådan bortser från

const avst = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function låda(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1, bredd: x1 - x0, höjd: y1 - y0 };
}

const kvantil = (v, q) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.round(q * (s.length - 1)))];
};

// Lådan som formen passas mot, med ytterlägena bortklippta. En enda
// överskjutande punkt ska inte kunna blåsa upp lådan så att alla de andra
// hamnar en bit innanför kanten — det är precis vad som gör en darrig fyrkant
// till en cirkel, och en fyrkant med rundade hörn till en cirkel redan vid
// måttlig darrning.
function passlåda(points) {
  const x0 = kvantil(points.map((p) => p.x), KVANTIL);
  const x1 = kvantil(points.map((p) => p.x), 1 - KVANTIL);
  const y0 = kvantil(points.map((p) => p.y), KVANTIL);
  const y1 = kvantil(points.map((p) => p.y), 1 - KVANTIL);
  return { x0, y0, x1, y1, bredd: x1 - x0, höjd: y1 - y0 };
}

const omkrets = (points) => {
  let s = 0;
  for (let i = 1; i < points.length; i++) s += avst(points[i - 1], points[i]);
  return s;
};

// Vinkelrät avstånd från p till linjen ab.
function tillLinje(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return avst(p, a);
  return Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / len;
}

function linje(points) {
  const a = points[0];
  const b = points[points.length - 1];
  const längd = avst(a, b);
  if (längd < MIN_STORLEK) return null;
  let värst = 0;
  for (const p of points) värst = Math.max(värst, tillLinje(p, a, b));
  if (värst > Math.max(4, LINJE_TOL * längd)) return null;
  return { typ: 'linje', points: [{ ...a }, { ...b }], fel: värst / längd };
}

// Passning mot ellipsen som fyller lådan. Ellips i stället för cirkel gör
// gesten förlåtande: en cirkel ritad på fri hand blir sällan rund.
function ellips(l, points, halvdiag) {
  const rx = l.bredd / 2;
  const ry = l.höjd / 2;
  if (rx < MIN_STORLEK / 2 || ry < MIN_STORLEK / 2) return null;
  const cx = l.x0 + rx;
  const cy = l.y0 + ry;
  let summa = 0;
  for (const p of points) {
    const r = Math.hypot((p.x - cx) / rx, (p.y - cy) / ry);
    // Avståndet till ellipsen, inte den relativa radieavvikelsen. Annars går
    // felet inte att jämföra med rektangelns, och en skakig cirkel förlorar
    // mot rektangeln vars fel står stilla runt 0,035.
    const lokal = r > 1e-6 ? Math.hypot(p.x - cx, p.y - cy) / r : rx;
    summa += Math.abs(r - 1) * lokal;
  }
  const fel = summa / points.length / halvdiag;
  if (fel > FORM_TOL) return null;

  const ut = [];
  const steg = 72;
  for (let i = 0; i <= steg; i++) {
    const v = (i / steg) * Math.PI * 2;
    ut.push({ x: cx + rx * Math.cos(v), y: cy + ry * Math.sin(v) });
  }
  return { typ: 'cirkel', points: ut, fel };
}

// Passning mot lådans kanter: en rektangel har alla punkter nära en kant.
function rektangel(l, points, halvdiag) {
  if (l.bredd < MIN_STORLEK || l.höjd < MIN_STORLEK) return null;
  let summa = 0;
  for (const p of points) {
    const dx = Math.min(Math.abs(p.x - l.x0), Math.abs(p.x - l.x1));
    const dy = Math.min(Math.abs(p.y - l.y0), Math.abs(p.y - l.y1));
    summa += Math.min(dx, dy);
  }
  const fel = summa / points.length / halvdiag;
  if (fel > FORM_TOL) return null;

  const hörn = [
    { x: l.x0, y: l.y0 },
    { x: l.x1, y: l.y0 },
    { x: l.x1, y: l.y1 },
    { x: l.x0, y: l.y1 },
    { x: l.x0, y: l.y0 },
  ];
  // Varje hörn upprepas. perfect-freehand glättar indata med ett glidande
  // medelvärde (streamline), och med en enda punkt i hörnet hinner medelvärdet
  // inte fram — hörnet kapas då med 5,7 px. Åtta upprepningar tar ner det till
  // 0,51 px, vilket är golvet som den runda fogen och Q-kurvan i
  // pathFromOutline sätter. Tätare punkter längs kanterna hjälper mindre.
  const ut = [];
  for (let i = 1; i < hörn.length; i++) {
    const a = hörn[i - 1];
    const b = hörn[i];
    const len = avst(a, b);
    for (let k = 0; k < HÖRNPUNKTER; k++) ut.push({ ...a });
    for (let d = KANT; d < len; d += KANT) {
      ut.push({ x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len });
    }
  }
  for (let k = 0; k < HÖRNPUNKTER; k++) ut.push({ ...hörn[0] });
  return { typ: 'rektangel', points: ut, fel };
}

/**
 * Känner igen en form i ett drag. Returnerar { typ, points } eller null när
 * inget passar tillräckligt väl — då ska draget behållas som det ritades.
 */
export function känn(points) {
  if (!points || points.length < MIN_PUNKTER) return null;
  const l = låda(points);
  if (Math.hypot(l.bredd, l.höjd) < MIN_STORLEK) return null;

  const rak = linje(points);
  if (rak) return rak;

  // Slutna former bara om draget faktiskt gick runt.
  const runt = omkrets(points);
  if (runt < 1e-6 || avst(points[0], points[points.length - 1]) > SLUTEN_TOL * runt) return null;

  const p = passlåda(points);
  const halvdiag = Math.hypot(p.bredd, p.höjd) / 2;
  const kandidater = [rektangel(p, points, halvdiag), ellips(p, points, halvdiag)].filter(Boolean);
  if (!kandidater.length) return null;
  return kandidater.sort((a, b) => a.fel - b.fel)[0];
}
