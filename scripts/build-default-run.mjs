// Precomputes the company simulation for the default scenario, so the views that show it can open
// without the ~5 s run most visitors would otherwise wait for (js/store.js fetches it).
//
// The run is made with the browser's own code: the scripts index.html loads, up to and including
// js/store.js, are evaluated here in page order, and the config is Store.toConfig(Store.defaults()).
// The file records that config; the browser uses the precomputed result only if its own default
// config serializes identically, and simulates as usual otherwise.
//
// Usage: node scripts/build-default-run.mjs [outFile]   (default: dist/data/default-run.json)
import { promises as fs } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function buildDefaultRun(outFile = path.join(ROOT, 'dist', 'data', 'default-run.json')) {
  const html = await fs.readFile(path.join(ROOT, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"?]+)/g)].map(m => m[1]);
  const upTo = scripts.indexOf('js/store.js');
  if (upTo < 0) throw new Error('index.html does not load js/store.js');
  // Evaluated in this process's own global scope (a separate vm context runs the simulation ~10×
  // slower); this script exists only to do this once per build.
  globalThis.window ??= globalThis; // UI scripts register listeners at load; nothing fires here
  globalThis.addEventListener ??= () => {};
  globalThis.document ??= { addEventListener: () => {}, querySelector: () => null };
  for (const src of scripts.slice(0, upTo + 1)) {
    vm.runInThisContext(await fs.readFile(path.join(ROOT, src), 'utf8'), { filename: src });
  }
  const { Store, FoundryCompany } = globalThis;
  const config = Store.toConfig(Store.defaults());
  const started = Date.now();
  const result = FoundryCompany.simulateCompany({ pathways: Store.PATHWAYS, markets: Store.MARKETS, sites: Store.SITES, config });
  const ms = Date.now() - started;
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, JSON.stringify({ configKey: JSON.stringify(config), result: { ...result, ms } }));
  return { outFile, ms, bytes: (await fs.stat(outFile)).size };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { outFile, ms, bytes } = await buildDefaultRun(process.argv[2] && path.resolve(process.argv[2]));
  console.log(`Wrote ${path.relative(ROOT, outFile)} (${(bytes / 1e6).toFixed(2)} MB; run took ${ms} ms)`);
}
