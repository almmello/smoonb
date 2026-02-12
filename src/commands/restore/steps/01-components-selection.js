const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const { confirm } = require('../../../utils/prompt');
const { t } = require('../../../i18n');

/**
 * Etapa 1: Perguntar quais componentes restaurar
 */
module.exports = async (backupPath) => {
  const getT = global.smoonbI18n?.t || t;
  // Database (sempre disponível)
  const restoreDatabase = await confirm(getT('restore.steps.components.database.include'), true);
  
  // Edge Functions
  const edgeFunctionsDir = path.join(backupPath, 'edge-functions');
  let restoreEdgeFunctions = false;
  if (fs.existsSync(edgeFunctionsDir) && fs.readdirSync(edgeFunctionsDir).length > 0) {
    console.log(chalk.cyan(`\n⚡ ${getT('restore.steps.components.edgeFunctions.title')}`));
    console.log(chalk.white(`   ${getT('restore.steps.components.edgeFunctions.description1')}`));
    console.log(chalk.white(`   ${getT('restore.steps.components.edgeFunctions.description2')}\n`));
    restoreEdgeFunctions = await confirm(getT('restore.steps.components.edgeFunctions.include'), true);
  }

  // Auth Settings
  let restoreAuthSettings = false;
  if (fs.existsSync(path.join(backupPath, 'auth-settings.json'))) {
    console.log(chalk.cyan(`\n🔐 ${getT('restore.steps.components.auth.title')}`));
    console.log(chalk.white(`   ${getT('restore.steps.components.auth.description1')}`));
    console.log(chalk.white(`   ${getT('restore.steps.components.auth.description2')}\n`));
    restoreAuthSettings = await confirm(getT('restore.steps.components.auth.include'), true);
  }
  
  // Storage Buckets
  const storageDir = path.join(backupPath, 'storage');
  let storageZipFiles = [];
  
  // Verificar se o diretório existe e listar arquivos
  try {
    if (fs.existsSync(backupPath)) {
      const files = fs.readdirSync(backupPath);
      storageZipFiles = files.filter(f => f.endsWith('.storage.zip'));
    }
  } catch {
    // Ignorar erro ao ler diretório
    storageZipFiles = [];
  }
  
  let restoreStorage = false;
  const hasStorageDir = fs.existsSync(storageDir);
  const hasStorageFiles = hasStorageDir && fs.readdirSync(storageDir).length > 0;
  
  if (storageZipFiles.length > 0 || hasStorageFiles) {
    console.log(chalk.cyan(`\n📦 ${getT('restore.steps.components.storage.title')}`));
    if (storageZipFiles.length > 0) {
      console.log(chalk.white(`   ${getT('restore.steps.components.storage.zipFound', { fileName: storageZipFiles[0] })}`));
      console.log(chalk.white(`   ${getT('restore.steps.components.storage.withZip.description1')}`));
      console.log(chalk.white(`   ${getT('restore.steps.components.storage.withZip.description2')}\n`));
    } else {
      console.log(chalk.white(`   ${getT('restore.steps.components.storage.metadataOnly.description1')}`));
      console.log(chalk.white(`   ${getT('restore.steps.components.storage.metadataOnly.description2')}`));
      console.log(chalk.white(`   ${getT('restore.steps.components.storage.metadataOnly.description3')}\n`));
    }
    restoreStorage = await confirm(getT('restore.steps.components.storage.include'), true);
  }

  // Database Extensions and Settings
  const dbSettingsFiles = fs.readdirSync(backupPath)
    .filter(file => file.startsWith('database-settings-') && file.endsWith('.json'));
  let restoreDatabaseSettings = false;
  if (dbSettingsFiles.length > 0) {
    console.log(chalk.cyan(`\n🔧 ${getT('restore.steps.components.databaseSettings.title')}`));
    console.log(chalk.white(`   ${getT('restore.steps.components.databaseSettings.description1')}`));
    console.log(chalk.white(`   ${getT('restore.steps.components.databaseSettings.description2')}\n`));
    restoreDatabaseSettings = await confirm(getT('restore.steps.components.databaseSettings.include'), true);
  }

  // Realtime Settings
  let restoreRealtimeSettings = false;
  if (fs.existsSync(path.join(backupPath, 'realtime-settings.json'))) {
    console.log(chalk.cyan(`\n🔄 ${getT('restore.steps.components.realtime.title')}`));
    console.log(chalk.white(`   ${getT('restore.steps.components.realtime.description1')}`));
    console.log(chalk.white(`   ${getT('restore.steps.components.realtime.description2')}\n`));
    restoreRealtimeSettings = await confirm(getT('restore.steps.components.realtime.include'), true);
  }
  
  return {
    database: restoreDatabase,
    edgeFunctions: restoreEdgeFunctions,
    storage: restoreStorage,
    authSettings: restoreAuthSettings,
    databaseSettings: restoreDatabaseSettings,
    realtimeSettings: restoreRealtimeSettings
  };
};

