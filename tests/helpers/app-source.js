// The flowsheet app UI is split across js/app/*.js panel files plus the
// js/flowsheet-app.js entry (which must load last). index.html is the single
// source of truth for which files make up the app and in what order.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const ENTRY = 'js/flowsheet-app.js';

function appFiles() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const files = [...html.matchAll(/<script src="(js\/[^"]+\.js)"><\/script>/g)].map(match => match[1]);
  if (files[files.length - 1] !== ENTRY) throw new Error(`${ENTRY} must be the last app script in index.html`);
  return files;
}

const APP_FILES = appFiles();

// Replace the entry in a vm load list with every app file, in index.html order.
function expandAppFiles(files) {
  return files.flatMap(file => (file === ENTRY ? APP_FILES : [file]));
}

// Concatenated source of every app file, for source-text assertions.
function readAppSource() {
  return APP_FILES.map(file => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n');
}

module.exports = { APP_FILES, ENTRY, expandAppFiles, readAppSource };
