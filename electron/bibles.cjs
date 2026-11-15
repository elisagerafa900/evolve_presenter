// Imported Bibles live in the app's data folder (not inside the installer),
// so each church keeps its own licensed translations across updates.
const fs = require('node:fs');
const path = require('node:path');

let dir = null;
const indexFile = () => path.join(dir, 'index.json');

function setDir(d) {
  dir = d;
  fs.mkdirSync(dir, { recursive: true });
}

function list() {
  try {
    return JSON.parse(fs.readFileSync(indexFile(), 'utf8'));
  } catch {
    return [];
  }
}

function safeId(id) {
  const s = String(id || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!s || s.length > 10) throw new Error('Short name must be 1–10 letters or numbers.');
  return s;
}

function save(id, name, json) {
  const sid = safeId(id);
  fs.writeFileSync(path.join(dir, `${sid}.json`), json);
  const items = list().filter((b) => b.id !== sid);
  items.push({ id: sid, name: String(name || sid).slice(0, 60), importedAt: new Date().toISOString() });
  fs.writeFileSync(indexFile(), JSON.stringify(items, null, 2));
  return items;
}

function read(id) {
  return fs.readFileSync(path.join(dir, `${safeId(id)}.json`), 'utf8');
}

function remove(id) {
  const sid = safeId(id);
  fs.rmSync(path.join(dir, `${sid}.json`), { force: true });
  const items = list().filter((b) => b.id !== sid);
  fs.writeFileSync(indexFile(), JSON.stringify(items, null, 2));
  return items;
}

module.exports = { setDir, list, save, read, remove };
