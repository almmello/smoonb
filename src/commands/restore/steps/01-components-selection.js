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
    console.log(chalk.gray('   As Edge Functions serão copiadas para supabase/functions e implantadas no projeto destino.'));
    console.log(chalk.gray('   A pasta supabase/functions será limpa antes do processo.\n'));
    restoreEdgeFunctions = await confirm('Deseja restaurar Edge Functions', true);
  }
  
  // Auth Settings
  let restoreAuthSettings = false;
  if (fs.existsSync(path.join(backupPath, 'auth-settings.json'))) {
    console.log(chalk.cyan('\n🔐 Auth Settings:'));
    console.log(chalk.gray('   As configurações de Auth serão exibidas para configuração manual no Dashboard.'));
    console.log(chalk.gray('   Algumas configurações não podem ser aplicadas automaticamente por questões de segurança.\n'));
    restoreAuthSettings = await confirm('Deseja ver as configurações de Auth Settings', true);
  }
  
  // Storage Buckets
  const storageDir = path.join(backupPath, 'storage');
  let restoreStorage = false;
  if (fs.existsSync(storageDir) && fs.readdirSync(storageDir).length > 0) {
    console.log(chalk.cyan('\n📦 Storage:'));
    console.log(chalk.gray('   As informações dos buckets de Storage serão exibidas para migração manual.'));
    console.log(chalk.gray('   Os arquivos precisam ser migrados manualmente usando as ferramentas do Supabase.\n'));
    restoreStorage = await confirm('Deseja ver informações de Storage Buckets', true);
  }
  
  // Database Extensions and Settings
  const dbSettingsFiles = fs.readdirSync(backupPath)
    .filter(file => file.startsWith('database-settings-') && file.endsWith('.json'));
  let restoreDatabaseSettings = false;
  if (dbSettingsFiles.length > 0) {
    console.log(chalk.cyan('\n🔧 Database Extensions and Settings:'));
    console.log(chalk.gray('   As extensões e configurações do banco de dados serão restauradas via SQL.'));
    console.log(chalk.gray('   Isso inclui extensões PostgreSQL e configurações específicas do projeto.\n'));
    restoreDatabaseSettings = await confirm('Deseja restaurar Database Extensions and Settings', true);
  }
  
  // Realtime Settings
  let restoreRealtimeSettings = false;
  if (fs.existsSync(path.join(backupPath, 'realtime-settings.json'))) {
    console.log(chalk.cyan('\n🔄 Realtime Settings:'));
    console.log(chalk.gray('   As configurações de Realtime serão exibidas para configuração manual no Dashboard.'));
    console.log(chalk.gray('   Algumas configurações precisam ser aplicadas manualmente.\n'));
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

