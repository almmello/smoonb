/**
 * Installation ID: unique per machine, persisted once and used for license binding.
 * Stored in config dir via env-paths (Windows: %APPDATA%/smoonb-nodejs/Config, macOS/Linux: ~/.config/smoonb-nodejs).
 * Never stores license key; only installationId and createdAt.
 */
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const CONFIG_FILENAME = 'config.json';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getConfigDir() {
  try {
    const envPaths = require('env-paths');
    const paths = typeof envPaths === 'function' ? envPaths('smoonb') : envPaths.default('smoonb');
    return paths.config;
  } catch {
    const os = require('os');
    const home = os.homedir();
    return process.platform === 'win32'
      ? path.join(process.env.APPDATA || home, 'smoonb')
      : path.join(home, '.config', 'smoonb');
  }
}

function generateUuidV4() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Returns installationId (uuid v4). Creates config dir and config.json on first run.
 * @returns {Promise<string>}
 */
async function getOrCreateInstallationId() {
  const configDir = getConfigDir();
  const configPath = path.join(configDir, CONFIG_FILENAME);

  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const data = JSON.parse(raw);
    const id = data && typeof data.installationId === 'string' && data.installationId.trim();
    if (id && UUID_REGEX.test(id)) {
      return id;
    }
  } catch {
    // File missing or invalid: create new
  }

  const installationId = generateUuidV4();
  const payload = {
    installationId,
    createdAt: new Date().toISOString()
  };

  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(payload, null, 2), 'utf8');

  return installationId;
}

/**
 * Masks installationId for diagnostics: first 4 + last 4 chars (e.g. 2f3a…91bc).
 * @param {string} id
 * @returns {string}
 */
function maskInstallationId(id) {
  if (id == null || typeof id !== 'string') return '***';
  const s = id.trim().replace(/-/g, '');
  if (s.length <= 8) return '***';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

module.exports = {
  getOrCreateInstallationId,
  maskInstallationId,
  getConfigDir
};
