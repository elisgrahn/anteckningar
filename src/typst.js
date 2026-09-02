import { createTypstCompiler } from '@myriaddreamin/typst.ts/compiler';
import { createTypstRenderer } from '@myriaddreamin/typst.ts/renderer';
import { loadFonts } from '@myriaddreamin/typst.ts';
import compilerWasm from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url';
import rendererWasm from '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url';
import { withMarkers, parseMarkers, originalLine } from './sourcemap.js';

// Typst has no fonts built into the wasm module. Without these files nothing
// containing text compiles, and the math needs NewCMMath in particular. They
// live in public/fonts and must be cached for offline use.
const FONT_FILES = [
  'LibertinusSerif-Regular.otf',
  'LibertinusSerif-Bold.otf',
  'LibertinusSerif-Italic.otf',
  'LibertinusSerif-BoldItalic.otf',
  'NewCMMath-Regular.otf',
  'DejaVuSansMono.ttf',
];

const MAIN = '/main.typ';

let booting = null;

export function boot() {
  if (!booting) booting = start();
  return booting;
}

async function start() {
  const base = import.meta.env.BASE_URL || '/';
  const fonts = FONT_FILES.map((f) => `${base}fonts/${f}`);

  const compiler = createTypstCompiler();
  const renderer = createTypstRenderer();

  await compiler.init({
    getModule: () => new URL(compilerWasm, location.href),
    beforeBuild: [loadFonts(fonts)],
  });
  await renderer.init({
    getModule: () => new URL(rendererWasm, location.href),
  });

  return { compiler, renderer };
}

/**
 * Compiles the source to an SVG string, and works out at the same time where
 * the lines landed on the pages.
 *
 * figures: Map<string, Uint8Array> keyed by path relative to the root, e.g.
 * "figures/f-01.svg".
 *
 * What gets compiled is a copy carrying invisible markers, never the text on
 * disk. The positions come out of the same compilation as the artifact, via
 * runWithWorld — a lone query() fails with "document is not compiled", since it
 * takes a fresh snapshot without compiling.
 */
export async function compile(source, figures = new Map()) {
  const { compiler, renderer } = await boot();

  compiler.resetShadow();
  for (const [path, bytes] of figures) {
    compiler.mapShadow('/' + path.replace(/^\//, ''), bytes);
  }
  const { text, map } = withMarkers(source);
  compiler.addSource(MAIN, text);

  const started = performance.now();
  const { artifact, raw, reported } = await compiler.runWithWorld({ mainFilePath: MAIN }, async (world) => {
    const run = await world.compile();
    const vector = await world.vector();
    let raw = [];
    try {
      raw = await world.query({ selector: '<am>', field: 'value' });
    } catch {
      // The markers are a bonus. If they are lost the document still shows.
    }
    return { artifact: vector?.result, raw, reported: run?.diagnostics ?? vector?.diagnostics };
  });

  // The reported line numbers refer to the copy with markers, not to what the
  // user sees.
  const diagnostics = (reported ?? []).map((d) => ({
    severity: d.severity,
    message: d.message,
    line: originalLine(map, Number(String(d.range ?? '').split(':')[0]) || 0),
  }));

  if (!artifact) return { svg: null, diagnostics, ms: performance.now() - started, markers: [], pages: [] };

  const { svg, pages } = await renderer.runWithSession({ artifactContent: artifact }, async (session) => ({
    pages: session.retrievePagesInfo(),
    svg: await renderer.renderSvg({ renderSession: session }),
  }));

  return { svg, diagnostics, ms: performance.now() - started, markers: parseMarkers(raw), pages };
}
