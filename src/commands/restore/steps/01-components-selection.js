const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const { confirm } = require('../../../utils/prompt');

/**
 * Etapa 1: Perguntar quais componentes restaurar
 */
module.exports = async (backupPath) => {
  // Database (sempre disponível)
  const restoreDatabase = await confirm('Deseja restaurar Database', true);
  
  // Edge Functions
  const edgeFunctionsDir = path.join(backupPath, 'edge-functions');
  let restoreEdgeFunctions = false;
  if (fs.existsSync(edgeFunctionsDir) && fs.readdirSync(edgeFunctionsDir).length > 0) {
    console.log(chalk.cyan('\n⚡ Edge Functions:'));
    console.log(chalk.white('   As Edge Functions serão copiadas para supabase/functions e implantadas no projeto destino.'));
    console.log(chalk.white('   A pasta supabase/functions será limpa antes do processo.\n'));
    restoreEdgeFunctions = await confirm('Deseja restaurar Edge Functions', true);
  }
  
  // Auth Settings
  let restoreAuthSettings = false;
  if (fs.existsSync(path.join(backupPath, 'auth-settings.json'))) {
    console.log(chalk.cyan('\n🔐 Auth Settings:'));
    console.log(chalk.white('   As configurações de Auth serão exibidas para configuração manual no Dashboard.'));
    console.log(chalk.white('   Algumas configurações não podem ser aplicadas automaticamente por questões de segurança.\n'));
    restoreAuthSettings = await confirm('Deseja ver as configurações de Auth Settings', true);
  }
  
  // Storage Buckets
  const storageDir = path.join(backupPath, 'storage');
  const storageZipFiles = fs.readdirSync(backupPath).filter(f => f.endsWith('.storage.zip'));
  let restoreStorage = false;
  
  if (storageZipFiles.length > 0 || (fs.existsSync(storageDir) && fs.readdirSync(storageDir).length > 0)) {
    console.log(chalk.cyan('\n📦 Storage:'));
    if (storageZipFiles.length > 0) {
      console.log(chalk.white(`   Arquivo .storage.zip encontrado: ${storageZipFiles[0]}`));
      console.log(chalk.white('   Os buckets e arquivos serão restaurados automaticamente no projeto destino.'));
      console.log(chalk.white('   O arquivo ZIP será extraído, buckets criados e arquivos enviados via API.\n'));
    } else {
      console.log(chalk.white('   Apenas metadados dos buckets encontrados (pasta storage).'));
      console.log(chalk.white('   Para restaurar os arquivos, é necessário o arquivo .storage.zip do Dashboard.'));
      console.log(chalk.white('   Apenas informações dos buckets serão exibidas.\n'));
    }
    restoreStorage = await confirm('Deseja restaurar Storage Buckets', true);
  }
  
  // Database Extensions and Settings
  const dbSettingsFiles = fs.readdirSync(backupPath)
    .filter(file => file.startsWith('database-settings-') && file.endsWith('.json'));
  let restoreDatabaseSettings = false;
  if (dbSettingsFiles.length > 0) {
    console.log(chalk.cyan('\n🔧 Database Extensions and Settings:'));
    console.log(chalk.white('   As extensões e configurações do banco de dados serão restauradas via SQL.'));
    console.log(chalk.white('   Isso inclui extensões PostgreSQL e configurações específicas do projeto.\n'));
    restoreDatabaseSettings = await confirm('Deseja restaurar Database Extensions and Settings', true);
  }
  
  // Realtime Settings
  let restoreRealtimeSettings = false;
  if (fs.existsSync(path.join(backupPath, 'realtime-settings.json'))) {
    console.log(chalk.cyan('\n🔄 Realtime Settings:'));
    console.log(chalk.white('   As configurações de Realtime serão exibidas para configuração manual no Dashboard.'));
    console.log(chalk.white('   Algumas configurações precisam ser aplicadas manualmente.\n'));
    restoreRealtimeSettings = await confirm('Deseja ver as configurações de Realtime Settings', true);
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

