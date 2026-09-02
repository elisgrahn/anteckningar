// The client side of the file API. The server owns the files; this is only a
// copy. When the time comes for Supabase, these are the functions to replace.

const enc = new TextEncoder();

async function jsonOf(res) {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export function fetchState() {
  return fetch('/api/state', { cache: 'no-store' }).then(jsonOf);
}

export function saveDoc(text) {
  return fetch('/api/doc', { method: 'PUT', body: text }).then(jsonOf);
}

export function fetchFigure(name) {
  return fetch('/api/figure/' + encodeURIComponent(name), { cache: 'no-store' }).then(jsonOf);
}

export function saveFigure(name, svg) {
  return fetch('/api/figure/' + encodeURIComponent(name), { method: 'PUT', body: svg }).then(jsonOf);
}

export function deleteFigure(name) {
  return fetch('/api/figure/' + encodeURIComponent(name), { method: 'DELETE' }).then(jsonOf);
}

export function nextFigureName(figures) {
  let n = 1;
  for (const name of Object.keys(figures)) {
    const m = name.match(/^f-(\d+)\.svg$/);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return `f-${String(n).padStart(2, '0')}.svg`;
}

export const toBytes = (text) => enc.encode(text);
