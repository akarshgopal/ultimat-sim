import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const BUILD_ID = getBuildId();

// Ship exactly what the browser loads: the page, its styles and scripts, the simulation
// worker's imports, and the three generated data files. Plant models, the solver and
// generators run in Node only (scripts/build-pathways.mjs, scripts/build-sites.mjs).
const INCLUDE = [
  'index.html', 'app.css', 'css', 'js', 'favicon.svg', 'LICENSE', 'NOTICE',
  'engine/utilization.js', 'engine/company.js', 'data/pathways.js', 'data/markets.js', 'data/sites.js',
];
await fs.rm(DIST, { recursive: true, force: true });
await fs.mkdir(DIST, { recursive: true });
for (const entry of INCLUDE) {
  const target = path.join(DIST, entry);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(path.join(ROOT, entry), target, { recursive: true });
}
for (const entry of ['index.html']) {
  const entryPath = path.join(DIST, entry);
  const original = await fs.readFile(entryPath, 'utf8');
  await fs.writeFile(entryPath, rewriteLocalAssetUrls(original, BUILD_ID));
}

console.log(`Built dist/ with asset version ${BUILD_ID}`);

function getBuildId() {
  const envBuildId = (
    process.env.BUILD_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    ''
  ).trim();

  if (envBuildId) return envBuildId.slice(0, 12);

  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  }
}



function rewriteLocalAssetUrls(html, buildId) {
  return html.replace(/\b(src|href)=(["'])([^"']+)\2/g, (match, attribute, quote, url) => {
    if (!shouldVersionAssetUrl(url)) return match;
    const separator = url.includes('?') ? '&' : '?';
    return `${attribute}=${quote}${url}${separator}v=${buildId}${quote}`;
  });
}

function shouldVersionAssetUrl(url) {
  if (/^(?:[a-z]+:)?\/\//i.test(url)) return false;
  if (/^(?:data:|mailto:|tel:|#)/i.test(url)) return false;
  return /\.(?:css|js)(?:$|[?#])/i.test(url);
}
