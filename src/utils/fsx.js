const fs = require('fs');
const path = require('path');

/**
 * Copia um diretório recursivamente
 * @param {string} src - Diretório origem
 * @param {string} dest - Diretório destino
 * @returns {Promise<void>}
 */
async function copyDir(src, dest) {
  try {
    // Node.js 18+ tem fs.promises.cp
    if (fs.promises.cp) {
      await fs.promises.cp(src, dest, { recursive: true });
      return;
    }
  } catch {
    // Fallback para fs-extra se disponível
    try {
      const fse = require('fs-extra');
      await fse.copy(src, dest);
      return;
    } catch {
      // Fallback manual usando fs nativo
    }
  }

  // Fallback manual usando fs nativo
  await copyDirManual(src, dest);
}

/**
 * Implementação manual de cópia de diretório
 * @param {string} src - Diretório origem
 * @param {string} dest - Diretório destino
 */
async function copyDirManual(src, dest) {
  const stat = await fs.promises.stat(src);
  
  if (stat.isDirectory()) {
    await fs.promises.mkdir(dest, { recursive: true });
    const entries = await fs.promises.readdir(src);
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry);
      const destPath = path.join(dest, entry);
      await copyDirManual(srcPath, destPath);
    }
  } else {
    await fs.promises.copyFile(src, dest);
  }
}

/**
 * Cria diretório se não existir
 * @param {string} dirPath - Caminho do diretório
 * @returns {Promise<void>}
 */
async function ensureDir(dirPath) {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Verifica se um arquivo existe
 * @param {string} filePath - Caminho do arquivo
 * @returns {Promise<boolean>}
 */
async function exists(filePath) {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Escreve JSON de forma segura
 * @param {string} filePath - Caminho do arquivo
 * @param {any} data - Dados para escrever
 * @param {number} spaces - Espaços para indentação (padrão: 2)
 */
async function writeJson(filePath, data, spaces = 2) {
  const json = JSON.stringify(data, null, spaces);
  await fs.promises.writeFile(filePath, json, 'utf8');
}

/**
 * Lê JSON de forma segura
 * @param {string} filePath - Caminho do arquivo
 * @returns {Promise<any>}
 */
async function readJson(filePath) {
  const content = await fs.promises.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

module.exports = {
  copyDir,
  ensureDir,
  exists,
  writeJson,
  readJson
};
