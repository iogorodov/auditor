// Прод-сборка (V3). Один проход: HTML-бандл + статика (манифест/иконки) + Service Worker с
// внедрённым списком пред-кэша, собранным из реального содержимого dist.
import { readdirSync } from 'node:fs';
import { rm, cp, readFile, writeFile } from 'node:fs/promises';

const DIST = 'dist';

await rm(DIST, { recursive: true, force: true });

// 1) HTML-бандл: index.html → dist (хэши в именах, относительные пути, минификация).
const html = await Bun.build({ entrypoints: ['./index.html'], outdir: DIST, minify: true });
if (!html.success) { console.error(html.logs); throw new Error('HTML build failed'); }

// 2) Статика со стабильными именами — копируем МИМО бандлера: иначе Bun хэширует и манифест, и
//    иконки, но не переписывает пути к иконкам ВНУТРИ манифеста → рассинхрон. public/* → dist.
await cp('public', DIST, { recursive: true });

// 3) Ссылки на манифест/иконку вставляем в собранный index.html (стабильные имена, относительные).
const indexPath = `${DIST}/index.html`;
const links = '<link rel="manifest" href="./manifest.webmanifest"><link rel="apple-touch-icon" href="./icon-192.png">';
await writeFile(indexPath, (await readFile(indexPath, 'utf8')).replace('</head>', `${links}</head>`));

// 4) Список пред-кэша — из реального содержимого dist. './' — стартовый URL (на Pages отдаёт
//    index.html). sw.js себя не кэширует.
const files = readdirSync(DIST).filter((f) => f !== 'sw.js');
const precache = ['./', ...files.map((f) => `./${f}`)];
const version = Bun.hash(JSON.stringify(precache)).toString(16).slice(0, 12);

// 5) Service Worker: sw.ts → dist/sw.js (стабильное имя, без хэша) с внедрёнными списком и версией.
const sw = await Bun.build({
  entrypoints: ['./src/sw.ts'],
  outdir: DIST,
  target: 'browser',
  minify: true,
  naming: '[name].[ext]',
  define: {
    __PRECACHE__: JSON.stringify(precache),
    __CACHE_VERSION__: JSON.stringify(version),
  },
});
if (!sw.success) { console.error(sw.logs); throw new Error('SW build failed'); }

console.log(`build ok: ${precache.length} pre-cached entries, cache auditor-${version}`);
