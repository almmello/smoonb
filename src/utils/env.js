const fsp = require('fs').promises;
const path = require('path');

function parseEnvContent(content) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const entries = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1);
    // Remove optional quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
}

function stringifyEnv(entries, existingContent) {
  // Best-effort: keep existing comments and order; update or append keys
  const existingLines = (existingContent || '').replace(/\r\n/g, '\n').split('\n');
  const seen = new Set();
  const resultLines = [];

  for (const line of existingLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      resultLines.push(line);
      continue;
    }
    const eqIndex = line.indexOf('=');
    const key = line.slice(0, eqIndex).trim();
    if (Object.prototype.hasOwnProperty.call(entries, key)) {
      const rawValue = entries[key] ?? '';
      const needsQuote = /\s|[#]/.test(rawValue);
      const safeValue = needsQuote ? `"${rawValue.replace(/"/g, '\\"')}"` : rawValue;
      resultLines.push(`${key}=${safeValue}`);
      seen.add(key);
    } else {
      resultLines.push(line);
    }
  }

  for (const [key, value] of Object.entries(entries)) {
    if (seen.has(key)) continue;
    const rawValue = value ?? '';
    const needsQuote = /\s|[#]/.test(rawValue);
    const safeValue = needsQuote ? `"${rawValue.replace(/"/g, '\\"')}"` : rawValue;
    resultLines.push(`${key}=${safeValue}`);
  }

  // Ensure trailing newline
  let out = resultLines.join('\n');
  if (!out.endsWith('\n')) out += '\n';
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
  try { existing = await fsp.readFile(filePath, 'utf8'); } catch {}
  const content = stringifyEnv(entries, existing);
  await fsp.writeFile(filePath, content, 'utf8');
}

async function backupEnvFile(srcPath, destPath) {
  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  try {
    // Verificar se o arquivo existe antes de fazer backup
    await fsp.access(srcPath);
    await fsp.copyFile(srcPath, destPath);
  } catch (e) {
    if (e.code === 'ENOENT') {
      // Arquivo não existe, não fazer backup de arquivo vazio
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


