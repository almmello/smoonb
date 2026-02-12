const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Lê configuração do .smoonbrc
 * @returns {Promise<object>} - Configuração carregada com defaults
 */
async function readConfig() {
  const configPaths = [
    path.join(process.cwd(), '.smoonbrc'),
    path.join(os.homedir(), '.smoonbrc')
  ];

  let configContent = null;

  for (const configPathCandidate of configPaths) {
    try {
      if (fs.existsSync(configPathCandidate)) {
        configContent = fs.readFileSync(configPathCandidate, 'utf8');
        break;
      }
    } catch {
      // Continue para próximo caminho
    }
  }

  if (!configContent) {
    throw new Error('Arquivo .smoonbrc não encontrado. Execute: npx smoonb config --init');
  }

  let config;
  try {
    config = JSON.parse(configContent);
  } catch (error) {
    throw new Error(`Erro ao parsear .smoonbrc: ${error.message}`);
  }

  // Aplicar defaults
  const defaultConfig = {
    backup: {
      includeFunctions: true,
      includeStorage: true,
      includeAuth: true,
      includeRealtime: true,
      outputDir: './backups'
    },
    restore: {
      cleanRestore: true,
      verifyAfterRestore: true
    }
  };

  const mergedConfig = mergeDeep(defaultConfig, config);

  // Warning para pgDumpPath deprecated
  if (mergedConfig.backup?.pgDumpPath) {
    console.warn('⚠️ backup.pgDumpPath será ignorado na v0.0.8 (usando Supabase CLI).');
    delete mergedConfig.backup.pgDumpPath;
  }

  return mergedConfig;
}

/**
 * Valida configuração para uma ação específica
 * @param {object} config - Configuração carregada
 * @param {string} action - Ação ('backup', 'restore', 'inventory')
 * @throws {Error} - Se configuração inválida
 */
function validateFor(config, action) {
  const errors = [];

  switch (action) {
    case 'backup':
    case 'restore':
      if (!config.supabase?.databaseUrl) {
        errors.push('supabase.databaseUrl é obrigatório');
      }
      break;

    case 'inventory':
      if (!config.supabase?.url) {
        errors.push('supabase.url é obrigatório');
      }
      if (!config.supabase?.accessToken) {
        errors.push('supabase.accessToken é obrigatório para Management API');
      }
      break;
  }

  if (errors.length > 0) {
    throw new Error(`Configuração inválida para ${action}: ${errors.join(', ')}`);
  }
}

/**
 * Merge profundo de objetos
 * @param {object} target - Objeto destino
 * @param {object} source - Objeto origem
 * @returns {object} - Objeto mesclado
 */
function mergeDeep(target, source) {
  const result = { ...target };

  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = mergeDeep(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

/**
 * Salva configuração no .smoonbrc
 * @param {object} config - Configuração para salvar
 * @param {string} targetPath - Caminho de destino (opcional)
 */
async function saveConfig(config, targetPath = null) {
  const configPath = targetPath || path.join(process.cwd(), '.smoonbrc');
  
  // Remover pgDumpPath se existir
  if (config.backup?.pgDumpPath) {
    delete config.backup.pgDumpPath;
  }

  const jsonContent = JSON.stringify(config, null, 2);
  await fs.promises.writeFile(configPath, jsonContent, 'utf8');
}

/**
 * Obtém configuração do projeto source
 * @param {object} config - Configuração carregada
 * @returns {object} - Configuração do projeto source
 */
function getSourceProject(config) {
  if (config.projects && config.projects.source) {
    return config.projects.source;
  }
  // Fallback para estrutura antiga
  return config.supabase;
}

/**
 * Obtém configuração do projeto target
 * @param {object} config - Configuração carregada
 * @returns {object} - Configuração do projeto target
 */
function getTargetProject(config) {
  // Tenta restaurar.targetProject (nova estrutura)
  if (config.restore?.targetProject) {
    return config.restore.targetProject;
  }
  
  throw new Error('Projeto destino não configurado. Configure "targetProject" em restore no .smoonbrc');
}

module.exports = {
  readConfig,
  validateFor,
  saveConfig,
  getSourceProject,
  getTargetProject
};
