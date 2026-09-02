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
const FORM_TOL = 0.12; // passning mot ellips respektive rektangel

// Punkttäthet längs en rektangels kanter, glest på raksträckan och tätt i
// hörnen. Se kommentaren i rektangel() för varför hörnen behöver det.
const GLES = 12;
const TÄT = 3;
const HÖRNZON = 15;

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
function ellips(l, points) {
  const rx = l.bredd / 2;
  const ry = l.höjd / 2;
  if (rx < MIN_STORLEK / 2 || ry < MIN_STORLEK / 2) return null;
  const cx = l.x0 + rx;
  const cy = l.y0 + ry;
  let summa = 0;
  for (const p of points) {
    const r = Math.hypot((p.x - cx) / rx, (p.y - cy) / ry);
    summa += Math.abs(r - 1);
  }
  const fel = summa / points.length;
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
function rektangel(l, points) {
  if (l.bredd < MIN_STORLEK || l.höjd < MIN_STORLEK) return null;
  const diag = Math.hypot(l.bredd, l.höjd);
  let summa = 0;
  for (const p of points) {
    const dx = Math.min(Math.abs(p.x - l.x0), Math.abs(p.x - l.x1));
    const dy = Math.min(Math.abs(p.y - l.y0), Math.abs(p.y - l.y1));
    summa += Math.min(dx, dy);
  }
  const fel = summa / points.length / diag;
  if (fel > FORM_TOL / 2) return null;

  const hörn = [
    { x: l.x0, y: l.y0 },
    { x: l.x1, y: l.y0 },
    { x: l.x1, y: l.y1 },
    { x: l.x0, y: l.y1 },
    { x: l.x0, y: l.y0 },
  ];
  // Punkterna sitter tätt nära hörnen. perfect-freehand glättar indata med ett
  // glidande medelvärde (streamline), och med jämnt glesa punkter kapas hörnet
  // med drygt fem pixlar. Tätt inom hörnzonen hinner medelvärdet i kapp, och
  // avvikelsen blir mindre än en linjebredd.
  const ut = [];
  for (let i = 1; i < hörn.length; i++) {
    const a = hörn[i - 1];
    const b = hörn[i];
    const len = avst(a, b);
    let d = 0;
    while (d < len) {
      ut.push({ x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len });
      d += d < HÖRNZON || d > len - HÖRNZON ? TÄT : GLES;
    }
  }
  ut.push({ ...hörn[0] });
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

  const kandidater = [rektangel(l, points), ellips(l, points)].filter(Boolean);
  if (!kandidater.length) return null;
  return kandidater.sort((a, b) => a.fel - b.fel)[0];
}
