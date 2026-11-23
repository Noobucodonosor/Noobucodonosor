import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const WEB_DIR = path.join(ROOT_DIR, 'web');
const BUNDLES_DIR = path.join(ROOT_DIR, 'bundles');

function stripEsmSyntax(source) {
  return source
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm, '')
    .replace(/^export\s+(?=(async\s+)?function|const|let|var|class)/gm, '');
}

export function buildPortableBundle() {
  const datasetRaw = fs.readFileSync(path.join(WEB_DIR, 'data', 'preloaded-services.json'), 'utf8');
  const cssRaw = fs.readFileSync(path.join(WEB_DIR, 'styles.css'), 'utf8');
  const htmlRaw = fs.readFileSync(path.join(WEB_DIR, 'index.html'), 'utf8');
  const aiClientRaw = fs.readFileSync(path.join(WEB_DIR, 'ai-client.js'), 'utf8');
  const appRaw = fs.readFileSync(path.join(WEB_DIR, 'app.js'), 'utf8');

  // Validate JSON
  const dataset = JSON.parse(datasetRaw);
  const safeJson = JSON.stringify(dataset).replace(/<\/script>/gi, '<\\/script>');

  const patchedApp = stripEsmSyntax(appRaw).replace(
    "const res = await fetch('./data/preloaded-services.json');\n  state.dataset = await res.json();",
    'state.dataset = window.__PRELOADED_DATASET__;',
  );

  const inlineScript = [
    '(function () {',
    `window.__PRELOADED_DATASET__ = ${safeJson};`,
    stripEsmSyntax(aiClientRaw),
    patchedApp,
    '})();',
  ].join('\n\n');

  let portableHtml = htmlRaw
    .replace(
      '<title>Noobucodonosor — Vetrina Progetti &amp; Playground AI Prescaricati</title>',
      '<title>Noobucodonosor — Kit Locale Portabile (Offline + BYOK Free-Tier)</title>',
    )
    .replace('<link rel="stylesheet" href="./styles.css" />', `<style>\n${cssRaw}\n</style>`)
    .replace('<script type="module" src="./app.js"></script>', `<script>\n${inlineScript}\n</script>`)
    .replace(
      '<a href="#locale">Usa in Locale</a>',
      '<span class="badge badge-playground">Edizione Locale Portabile</span>',
    )
    .replace(
      '<a class="btn btn-slate" href="#locale">Scarica Kit Locale</a>',
      '<button type="button" class="btn btn-slate" onclick="document.getElementById(\'open-byok-btn\').click()">Configura BYOK Gratis</button>',
    )
    .replace(/<section id="locale">[\s\S]*?<\/section>/, '');

  fs.mkdirSync(BUNDLES_DIR, { recursive: true });
  const outPath = path.join(BUNDLES_DIR, 'noobucodonosor-portable.html');
  fs.writeFileSync(outPath, portableHtml, 'utf8');
  return { outPath, bytes: Buffer.byteLength(portableHtml, 'utf8') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { outPath, bytes } = buildPortableBundle();
  console.log(`Bundle portabile generato: ${outPath} (${(bytes / 1024).toFixed(1)} KB)`);
}
