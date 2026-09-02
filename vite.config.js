import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// The files live on real disk in dokument/, owned by the machine running the
// server. The clients hold no truth of their own, only a copy.
//
// The directory names stay Swedish: they are paths inside the user's document,
// referenced from main.typ, not identifiers in this code.
const ROOT = path.resolve('dokument');
const FIGURES = path.join(ROOT, 'figurer');
const MAIN = path.join(ROOT, 'main.typ');

const START = `#set page(paper: "a4")
#set text(size: 11pt, lang: "sv")
#set heading(numbering: "1.1")

// Your own notation. Define it once, use it everywhere.
#let lg = $limits(<)^(>)$

= Lecture 1

Math between dollar signs: $ integral_0^1 x^2 dif x = 1/3 $

Cmd-D opens the drawing mode. With the cursor on a line that already has a
figure, that figure opens to be added to instead of a new one being made.
`;

const safeFigure = (name) => /^[\w.-]+\.svg$/.test(name) && !name.includes('..');

async function mtime(p) {
  try {
    return Math.round((await fs.stat(p)).mtimeMs);
  } catch {
    return 0;
  }
}

async function ensure() {
  await fs.mkdir(FIGURES, { recursive: true });
  try {
    await fs.access(MAIN);
  } catch {
    await fs.writeFile(MAIN, START);
  }
}

function body(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => {
      s += c;
      if (s.length > 8e6) reject(new Error('too large'));
    });
    req.on('end', () => resolve(s));
    req.on('error', reject);
  });
}

function json(res, code, data) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(data));
}

function fileApi() {
  const handler = async (req, res, next) => {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/api/')) return next();
    await ensure();

    try {
      // The whole state in one call: source, modification times and figures.
      if (url.pathname === '/api/state' && req.method === 'GET') {
        const names = (await fs.readdir(FIGURES)).filter((n) => n.endsWith('.svg')).sort();
        const figures = {};
        for (const n of names) figures[n] = await mtime(path.join(FIGURES, n));
        return json(res, 200, {
          source: await fs.readFile(MAIN, 'utf8'),
          mtime: await mtime(MAIN),
          figures,
        });
      }

      if (url.pathname === '/api/doc' && req.method === 'PUT') {
        await fs.writeFile(MAIN, await body(req));
        return json(res, 200, { mtime: await mtime(MAIN) });
      }

      if (url.pathname.startsWith('/api/figure/')) {
        const name = decodeURIComponent(url.pathname.slice('/api/figure/'.length));
        if (!safeFigure(name)) return json(res, 400, { error: 'invalid name' });
        const p = path.join(FIGURES, name);
        if (req.method === 'GET') {
          return json(res, 200, { svg: await fs.readFile(p, 'utf8'), mtime: await mtime(p) });
        }
        if (req.method === 'PUT') {
          await fs.writeFile(p, await body(req));
          return json(res, 200, { mtime: await mtime(p) });
        }
        // Deleting happens only on an explicit request from the cleanup list,
        // never automatically: a figure can be unused because the paragraph
        // around it is being rewritten.
        if (req.method === 'DELETE') {
          try {
            await fs.unlink(p);
          } catch (e) {
            if (e.code !== 'ENOENT') throw e;
          }
          return json(res, 200, { deleted: true });
        }
      }

      return json(res, 404, { error: 'unknown path' });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  };

  return {
    name: 'file-api',
    // Block body on purpose: configureServer reads a return value as a post
    // hook, and middlewares.use() returns the connect app.
    configureServer(s) {
      s.middlewares.use(handler);
    },
    configurePreviewServer(s) {
      s.middlewares.use(handler);
    },
  };
}

const https = process.env.HTTPS === '1';

export default defineConfig({
  plugins: [react(), fileApi(), ...(https ? [basicSsl()] : [])],
  server: { host: true },
  build: { target: 'es2022' },
});
