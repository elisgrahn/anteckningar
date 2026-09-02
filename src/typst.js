import { createTypstCompiler } from '@myriaddreamin/typst.ts/compiler';
import { createTypstRenderer } from '@myriaddreamin/typst.ts/renderer';
import { loadFonts } from '@myriaddreamin/typst.ts';
import compilerWasm from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url';
import rendererWasm from '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url';
import { medMarkörer, tolka, ursprungsrad } from './markorer.js';

// Typst har inga typsnitt inbyggda i wasm-modulen. Utan de här filerna
// kompilerar ingenting som innehåller text, och matten kräver särskilt
// NewCMMath. De ligger i public/fonts och måste cachas för offline-bruk.
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
 * Kompilerar källan till en SVG-sträng, och tar samtidigt reda på var raderna
 * hamnade på sidorna.
 *
 * figures: Map<string, Uint8Array> med sökväg relativt roten, t.ex. "figurer/f-01.svg".
 *
 * Det som kompileras är en kopia med osynliga markörer, aldrig texten som
 * ligger på disk. Positionerna kommer ur samma kompilering som artefakten, via
 * runWithWorld — ett ensamt query() misslyckas med "document is not compiled",
 * eftersom det tar en färsk snapshot utan att kompilera.
 */
export async function compile(source, figures = new Map()) {
  const { compiler, renderer } = await boot();

  compiler.resetShadow();
  for (const [path, bytes] of figures) {
    compiler.mapShadow('/' + path.replace(/^\//, ''), bytes);
  }
  const { text, karta } = medMarkörer(source);
  compiler.addSource(MAIN, text);

  const started = performance.now();
  const { artefakt, rå, diagnostik } = await compiler.runWithWorld({ mainFilePath: MAIN }, async (world) => {
    const körd = await world.compile();
    const vektor = await world.vector();
    let rå = [];
    try {
      rå = await world.query({ selector: '<am>', field: 'value' });
    } catch {
      // Markörerna är en bonus. Går de förlorade ska dokumentet ändå visas.
    }
    return { artefakt: vektor?.result, rå, diagnostik: körd?.diagnostics ?? vektor?.diagnostics };
  });

  // Radnumren gäller kopian med markörer, alltså inte det användaren ser.
  const diagnostics = (diagnostik ?? []).map((d) => ({
    severity: d.severity,
    message: d.message,
    line: ursprungsrad(karta, Number(String(d.range ?? '').split(':')[0]) || 0),
  }));

  if (!artefakt) return { svg: null, diagnostics, ms: performance.now() - started, markörer: [], sidor: [] };

  const { svg, sidor } = await renderer.runWithSession({ artifactContent: artefakt }, async (session) => ({
    sidor: session.retrievePagesInfo(),
    svg: await renderer.renderSvg({ renderSession: session }),
  }));

  return { svg, diagnostics, ms: performance.now() - started, markörer: tolka(rå), sidor };
}
