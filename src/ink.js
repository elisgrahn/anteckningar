// En figur är en SVG-fil som Typst kan rendera direkt, med den råa
// scenen inbäddad i ett metadata-element. Filen är alltså både bild och
// redigerbart dokument, vilket är det som gör att en figur kan fyllas på
// senare i stället för att ritas om.

import { getStroke } from 'perfect-freehand';

const SCENE_OPEN = '<!--scen:';
const SCENE_CLOSE = '-->';

// Ritade pixlar per punkt. Storleken på pappret följer alltså det man
// faktiskt ritade: en liten skiss blir liten, en stor blir stor, och två
// figurer ritade lika stort på skärmen blir lika stora i utfallet.
const SKALA = 2.0;

// Bredden Canvas.jsx ritar med, som fallback när scenen är tom.
const BREDD = 2.4;

// Marginalen följer linjebredden i stället för att vara konstant, så att en
// tunn skiss inte får en ram tilltagen för ett tjockt streck.
const marginal = (strokes) => 8 * Math.max(BREDD, ...strokes.map((s) => s.width || 0));

// perfect-freehands kontur är en sluten polygon (array av [x, y]). Standard-
// mönstret för att göra den till ett d-attribut: M till första punkten, en Q
// per segment genom nästa punkts mittpunkt (så hörnen mjukas av), stängt med
// Z. Delas mellan Canvas.jsx (Path2D) och toSvg nedan.
export function pathFromOutline(outline) {
  if (!outline.length) return '';
  const [x0, y0] = outline[0];
  let d = `M ${x0.toFixed(1)} ${y0.toFixed(1)}`;
  for (let i = 0; i < outline.length; i++) {
    const [x, y] = outline[i];
    const [nx, ny] = outline[(i + 1) % outline.length];
    d += ` Q ${x.toFixed(1)} ${y.toFixed(1)} ${((x + nx) / 2).toFixed(1)} ${((y + ny) / 2).toFixed(1)}`;
  }
  return d + ' Z';
}

// thinning: 0 och simulatePressure: false stänger av bibliotekets gissning om
// tryck — vi ritar med fast bredd (stroke.width), och utan dem blir strecket
// ojämnt tjockt. getStroke hanterar en enda punkt (blir en prick) och två
// punkter (blir en kapsel) på egen hand, så inget specialfall behövs här.
function pathFrom(points, width) {
  const outline = getStroke(points, { size: width, thinning: 0, simulatePressure: false });
  return pathFromOutline(outline);
}

function bounds(strokes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) {
    for (const p of s.points) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  }
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 1, y1: 1 };
  return { x0, y0, x1, y1 };
}

export function toSvg(strokes) {
  const b = bounds(strokes);
  const pad = marginal(strokes);
  const w = Math.round(b.x1 - b.x0 + pad * 2);
  const h = Math.round(b.y1 - b.y0 + pad * 2);
  const shift = (s) => ({
    ...s,
    points: s.points.map((p) => ({ x: p.x - b.x0 + pad, y: p.y - b.y0 + pad })),
  });
  const paths = strokes
    .map(shift)
    .map((s) => `<path d="${pathFrom(s.points, s.width)}" fill="${s.color}"/>`)
    .join('');
  const scene = JSON.stringify({ v: 1, strokes });
  // viewBox i ritpixlar, storleken i punkter. Path-datan är alltså oförändrad
  // och gamla figurer renderar som förut, men Typst får en fysisk storlek i
  // stället för att figuren skalas till en fast andel av textbredden.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${(w / SKALA).toFixed(1)}pt" height="${(h / SKALA).toFixed(1)}pt" viewBox="0 0 ${w} ${h}">` +
    paths +
    `${SCENE_OPEN}${scene.replace(/--/g, '- -')}${SCENE_CLOSE}` +
    `</svg>`
  );
}

export function fromSvg(text) {
  const i = text.indexOf(SCENE_OPEN);
  if (i === -1) return null;
  const j = text.indexOf(SCENE_CLOSE, i);
  const raw = text.slice(i + SCENE_OPEN.length, j).replace(/- -/g, '--');
  try {
    return JSON.parse(raw).strokes ?? null;
  } catch {
    return null;
  }
}

// Träffar ett drag ett suddgummi vid (x, y)?
export function hitStroke(stroke, x, y, r) {
  for (const p of stroke.points) {
    if ((p.x - x) ** 2 + (p.y - y) ** 2 < r * r) return true;
  }
  return false;
}
