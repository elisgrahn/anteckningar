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

// baseMtime is the version this write was made against. The server saves the
// write as a conflict copy instead of overwriting when that version is stale
// — see writeVersioned() in vite.config.js — so a device that queued a write
// while offline can never silently erase what the other one wrote meanwhile.
export function saveDoc(text, baseMtime) {
  const headers = baseMtime === undefined ? undefined : { 'x-base-mtime': String(baseMtime) };
  return fetch('/api/doc', { method: 'PUT', body: text, headers }).then(jsonOf);
}

export function fetchFigure(name) {
  return fetch('/api/figure/' + encodeURIComponent(name), { cache: 'no-store' }).then(jsonOf);
}

export function saveFigure(name, svg, baseMtime) {
  const headers = baseMtime === undefined ? undefined : { 'x-base-mtime': String(baseMtime) };
  return fetch('/api/figure/' + encodeURIComponent(name), { method: 'PUT', body: svg, headers }).then(jsonOf);
}

// A network failure (offline, DNS, connection refused) throws a TypeError
// from fetch itself, before any response exists. An HTTP error status throws
// too (see jsonOf above), but as a plain Error with the status in its
// message — that's a real rejection from a server that IS reachable, so it
// must not be queued and retried forever.
export const isOffline = (e) => e instanceof TypeError;

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
