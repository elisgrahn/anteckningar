import { createTypstCompiler } from '@myriaddreamin/typst.ts/compiler';
import { createTypstRenderer } from '@myriaddreamin/typst.ts/renderer';
import { loadFonts } from '@myriaddreamin/typst.ts';
import compilerWasm from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url';
import rendererWasm from '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url';

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
 * Kompilerar källan till en SVG-sträng.
 * figures: Map<string, Uint8Array> med sökväg relativt roten, t.ex. "figurer/f-01.svg".
 */
export async function compile(source, figures = new Map()) {
  const { compiler, renderer } = await boot();

  compiler.resetShadow();
  for (const [path, bytes] of figures) {
    compiler.mapShadow('/' + path.replace(/^\//, ''), bytes);
  }
  compiler.addSource(MAIN, source);

  const started = performance.now();
  const out = await compiler.compile({ mainFilePath: MAIN, format: 'vector' });
  const diagnostics = (out?.diagnostics ?? []).map((d) => ({
    severity: d.severity,
    message: d.message,
    line: Number(String(d.range ?? '').split(':')[0]) || null,
  }));

  if (!out?.result) return { svg: null, diagnostics, ms: performance.now() - started };

  const svg = await renderer.renderSvg({ artifactContent: out.result });
  return { svg, diagnostics, ms: performance.now() - started };
}
