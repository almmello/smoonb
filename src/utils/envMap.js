const fs = require('fs').promises;
const path = require('path');

async function loadEnvMap(filePath) {
  if (!filePath) return {};
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function saveEnvMap(map, destPath) {
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  const json = JSON.stringify(map || {}, null, 2);
  await fs.writeFile(destPath, json, 'utf8');
}

module.exports = {
  loadEnvMap,
  saveEnvMap
};


