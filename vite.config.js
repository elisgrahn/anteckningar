import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Filerna ligger på riktig disk i dokument/, ägda av maskinen som kör
// servern. Klienterna har ingen egen sanning, bara en kopia.
const ROOT = path.resolve('dokument');
const FIGURER = path.join(ROOT, 'figurer');
const MAIN = path.join(ROOT, 'main.typ');

const START = `#set page(paper: "a4")
#set text(size: 11pt, lang: "sv")
#set heading(numbering: "1.1")

// Kursens egen notation. Definiera en gång, använd överallt.
#let lg = $limits(<)^(>)$

= Föreläsning 1

Matte mellan dollartecken: $ integral_0^1 x^2 dif x = 1/3 $

Cmd-D öppnar ritläget. Står markören på en rad som redan har en figur
öppnas den för påfyllning i stället för att en ny skapas.
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
  await fs.mkdir(FIGURER, { recursive: true });
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
      if (s.length > 8e6) reject(new Error('för stor'));
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

function filApi() {
  const handler = async (req, res, next) => {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/api/')) return next();
    await ensure();

    try {
      // Hela tillståndet i ett anrop: källa, ändringstider och figurer.
      if (url.pathname === '/api/state' && req.method === 'GET') {
        const names = (await fs.readdir(FIGURER)).filter((n) => n.endsWith('.svg')).sort();
        const figurer = {};
        for (const n of names) figurer[n] = await mtime(path.join(FIGURER, n));
        return json(res, 200, {
          source: await fs.readFile(MAIN, 'utf8'),
          mtime: await mtime(MAIN),
          figurer,
        });
      }

      if (url.pathname === '/api/doc' && req.method === 'PUT') {
        await fs.writeFile(MAIN, await body(req));
        return json(res, 200, { mtime: await mtime(MAIN) });
      }

      if (url.pathname.startsWith('/api/figur/')) {
        const name = decodeURIComponent(url.pathname.slice('/api/figur/'.length));
        if (!safeFigure(name)) return json(res, 400, { fel: 'ogiltigt namn' });
        const p = path.join(FIGURER, name);
        if (req.method === 'GET') {
          return json(res, 200, { svg: await fs.readFile(p, 'utf8'), mtime: await mtime(p) });
        }
        if (req.method === 'PUT') {
          await fs.writeFile(p, await body(req));
          return json(res, 200, { mtime: await mtime(p) });
        }
        // Radering sker bara på uttrycklig begäran från städlistan, aldrig
        // automatiskt: en figur kan vara oanvänd för att stycket skrivs om.
        if (req.method === 'DELETE') {
          try {
            await fs.unlink(p);
          } catch (e) {
            if (e.code !== 'ENOENT') throw e;
          }
          return json(res, 200, { raderad: true });
        }
      }

      return json(res, 404, { fel: 'okänd väg' });
    } catch (e) {
      return json(res, 500, { fel: String(e.message || e) });
    }
  };

  return {
    name: 'fil-api',
    // Blockkropp med flit: configureServer tolkar ett returvärde som en
    // efter-hook, och middlewares.use() returnerar connect-appen.
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
  plugins: [react(), filApi(), ...(https ? [basicSsl()] : [])],
  server: { host: true },
  build: { target: 'es2022' },
});
