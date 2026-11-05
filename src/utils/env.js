const fsp = require('fs').promises;
const path = require('path');
const { randomUUID } = require('crypto');

function parseEnvContent(content) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const entries = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim().replace(/^export\s+/, '');
    let value = line.slice(eqIndex + 1);
    // Remove optional quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")) || (value.startsWith("`") && value.endsWith("`"))) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
}

function encodeEnvValue(value) {
  const raw = String(value ?? '');
  if (!/[\s#"'`]/.test(raw)) return raw;
  const quote = ["'", '`', '"'].find(q => !raw.includes(q) && (q !== '"' || !/\\[nr]/.test(raw)));
  if (!quote) throw new Error('Environment value cannot be safely quoted; file was not changed');
  return quote + raw + quote;
}

function stringifyEnv(entries, existingContent) {
  // Best-effort: keep existing comments and order; update or append keys
  const existingLines = (existingContent || '').replace(/\r\n/g, '\n').split('\n');
  const seen = new Set();
  const existingEntries = parseEnvContent(existingContent || '');
  const resultLines = [];

  for (const line of existingLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      resultLines.push(line);
      continue;
    }
    const eqIndex = line.indexOf('=');
    const prefix = line.slice(0, eqIndex);
    const key = prefix.trim().replace(/^export\s+/, '');
    if (Object.prototype.hasOwnProperty.call(entries, key)) {
      if (existingEntries[key] === entries[key]) { resultLines.push(line); seen.add(key); continue; }
      const safeValue = encodeEnvValue(entries[key]);
      resultLines.push(`${prefix}=${safeValue}`);
      seen.add(key);
    } else {
      resultLines.push(line);
    }
  }

  for (const [key, value] of Object.entries(entries)) {
    if (seen.has(key)) continue;
    const safeValue = encodeEnvValue(value);
    resultLines.push(`${key}=${safeValue}`);
  }

  // Ensure trailing newline
  const newline = (existingContent || '').includes('\r\n') ? '\r\n' : '\n';
  let out = resultLines.join(newline);
  if (!out.endsWith('\n')) out += newline;
  return out;
}

async function readEnvFile(filePath) {
  try {
    const content = await fsp.readFile(filePath, 'utf8');
    return parseEnvContent(content);
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }
}

async function writeEnvFile(filePath, entries, _options = {}) {
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });
  let existing = '';
  try { existing = await fsp.readFile(filePath, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const [key, value] of Object.entries(entries)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || /[\r\n\0]/.test(String(value ?? ''))) throw new Error('Invalid environment entry; file was not changed');
  }
  const content = stringifyEnv(entries, existing);
  if (content === existing) return;
  const temporary = path.join(dir, `.smoonb-env-${randomUUID()}.tmp`);
  try {
    await fsp.writeFile(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await fsp.rename(temporary, filePath);
  } finally { await fsp.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }

}

async function backupEnvFile(srcPath, destPath) {
  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  try {
    // Verificar se o arquivo existe antes de fazer backup
    await fsp.access(srcPath);
    await fsp.copyFile(srcPath, destPath);
  } catch (e) {
    if (e.code === 'ENOENT') {
      // Arquivo nÃƒÂ£o existe, nÃƒÂ£o fazer backup de arquivo vazio
      return;
    }
    throw e;
  }
}

function listEnvKeys(env) {
  return Object.keys(env).sort();
}

module.exports = {
  readEnvFile,
  writeEnvFile,
  backupEnvFile,
  listEnvKeys
};


