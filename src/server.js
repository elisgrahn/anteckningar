// Klientsidan av fil-API:t. Servern äger filerna, det här är bara en kopia.
// När det blir dags för Supabase är det de här fyra funktionerna som byts ut.

const enc = new TextEncoder();

async function jsonOf(res) {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export function hämtaTillstånd() {
  return fetch('/api/state', { cache: 'no-store' }).then(jsonOf);
}

export function sparaDokument(text) {
  return fetch('/api/doc', { method: 'PUT', body: text }).then(jsonOf);
}

export function hämtaFigur(namn) {
  return fetch('/api/figur/' + encodeURIComponent(namn), { cache: 'no-store' }).then(jsonOf);
}

export function sparaFigur(namn, svg) {
  return fetch('/api/figur/' + encodeURIComponent(namn), { method: 'PUT', body: svg }).then(jsonOf);
}

export function nästaFigurnamn(figurer) {
  let n = 1;
  for (const namn of Object.keys(figurer)) {
    const m = namn.match(/^f-(\d+)\.svg$/);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return `f-${String(n).padStart(2, '0')}.svg`;
}

export const tillBytes = (text) => enc.encode(text);
