// En figur är en SVG-fil som Typst kan rendera direkt, med den råa
// scenen inbäddad i ett metadata-element. Filen är alltså både bild och
// redigerbart dokument, vilket är det som gör att en figur kan fyllas på
// senare i stället för att ritas om.

const SCENE_OPEN = '<!--scen:';
const SCENE_CLOSE = '-->';

export const PAD = 24;

function pathFrom(points) {
  if (points.length < 2) {
    const p = points[0];
    return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} l 0.1 0`;
  }
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    d += ` Q ${a.x.toFixed(1)} ${a.y.toFixed(1)} ${((a.x + b.x) / 2).toFixed(1)} ${((a.y + b.y) / 2).toFixed(1)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
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
  const w = b.x1 - b.x0 + PAD * 2;
  const h = b.y1 - b.y0 + PAD * 2;
  const shift = (s) => ({
    ...s,
    points: s.points.map((p) => ({ x: p.x - b.x0 + PAD, y: p.y - b.y0 + PAD })),
  });
  const paths = strokes
    .map(shift)
    .map(
      (s) =>
        `<path d="${pathFrom(s.points)}" fill="none" stroke="${s.color}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('');
  const scene = JSON.stringify({ v: 1, strokes });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(0)}" height="${h.toFixed(0)}" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}">` +
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
