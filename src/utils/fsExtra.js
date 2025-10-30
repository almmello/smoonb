const fs = require('fs').promises;
const path = require('path');

/**
 * Copia um diretório de forma segura (retorna 0 se src não existir)
 * @param {string} src - Diretório origem
 * @param {string} dest - Diretório destino
 * @returns {Promise<number>} - Quantidade de arquivos copiados (0 se src não existir)
 */
async function copyDirSafe(src, dest) {
  try {
    await fs.access(src);
  } catch {
    return 0; // Diretório não existe, retornar 0
  }
  
  const stats = await fs.stat(src);
  if (!stats.isDirectory()) {
    return 0; // Não é diretório
  }
  
  // Criar diretório destino
  await fs.mkdir(dest, { recursive: true });
  
  // Contar e copiar arquivos
  let count = 0;
  const entries = await fs.readdir(src);
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    
    const entryStats = await fs.stat(srcPath);
    if (entryStats.isDirectory()) {
      count += await copyDirSafe(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
      count++;
    }
  }
  
  return count;
}

/**
 * Limpa um diretório completamente (rm -rf) e recria (mkdir -p)
 * @param {string} dir - Diretório a limpar
 * @returns {Promise<void>}
 */
async function cleanDir(dir) {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignorar erro se não existir
  }
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Conta arquivos em um diretório recursivamente
 * @param {string} dir - Diretório a contar
 * @returns {Promise<number>} - Número de arquivos (0 se não existir)
 */
async function countFiles(dir) {
  try {
    await fs.access(dir);
  } catch {
    return 0;
  }
  
  const stats = await fs.stat(dir);
  if (!stats.isDirectory()) {
    return 1; // É um arquivo
  }
  
  let count = 0;
  const entries = await fs.readdir(dir);
  
  for (const entry of entries) {
    const entryPath = path.join(dir, entry);
    const entryStats = await fs.stat(entryPath);
    
    if (entryStats.isDirectory()) {
      count += await countFiles(entryPath);
    } else {
      count++;
    }
  }
  
  return count;
}

module.exports = {
  copyDirSafe,
  cleanDir,
  countFiles
};

