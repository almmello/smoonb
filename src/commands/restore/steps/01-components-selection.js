const path = require('path');
const fs = require('fs');
const inquirer = require('inquirer');

/**
 * Etapa 1: Perguntar quais componentes restaurar
 */
module.exports = async (backupPath) => {
  const questions = [];
  
  // Database
  questions.push({
    type: 'confirm',
    name: 'restoreDatabase',
    message: 'Deseja restaurar Database (S/n):',
    default: true
  });
  
  // Edge Functions
  const edgeFunctionsDir = path.join(backupPath, 'edge-functions');
  if (fs.existsSync(edgeFunctionsDir) && fs.readdirSync(edgeFunctionsDir).length > 0) {
    questions.push({
      type: 'confirm',
      name: 'restoreEdgeFunctions',
      message: 'Deseja restaurar Edge Functions (S/n):',
      default: true
    });
  }
  
  // Auth Settings
  if (fs.existsSync(path.join(backupPath, 'auth-settings.json'))) {
    questions.push({
      type: 'confirm',
      name: 'restoreAuthSettings',
      message: 'Deseja restaurar Auth Settings (s/N):',
      default: false
    });
  }
  
  // Storage Buckets
  const storageDir = path.join(backupPath, 'storage');
  if (fs.existsSync(storageDir) && fs.readdirSync(storageDir).length > 0) {
    questions.push({
      type: 'confirm',
      name: 'restoreStorage',
      message: 'Deseja ver informações de Storage Buckets (s/N):',
      default: false
    });
  }
  
  // Database Extensions and Settings
  const dbSettingsFiles = fs.readdirSync(backupPath)
    .filter(file => file.startsWith('database-settings-') && file.endsWith('.json'));
  if (dbSettingsFiles.length > 0) {
    questions.push({
      type: 'confirm',
      name: 'restoreDatabaseSettings',
      message: 'Deseja restaurar Database Extensions and Settings (s/N):',
      default: false
    });
  }
  
  // Realtime Settings
  if (fs.existsSync(path.join(backupPath, 'realtime-settings.json'))) {
    questions.push({
      type: 'confirm',
      name: 'restoreRealtimeSettings',
      message: 'Deseja restaurar Realtime Settings (s/N):',
      default: false
    });
  }
  
  const answers = await inquirer.prompt(questions);
  
  return {
    database: answers.restoreDatabase,
    edgeFunctions: answers.restoreEdgeFunctions || false,
    storage: answers.restoreStorage || false,
    authSettings: answers.restoreAuthSettings || false,
    databaseSettings: answers.restoreDatabaseSettings || false,
    realtimeSettings: answers.restoreRealtimeSettings || false
  };
};

