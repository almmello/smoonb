const chalk = require('chalk');
const readline = require('readline');
const { t } = require('../../../i18n');

/**
 * Etapa 0: Seleção interativa de backup
 */
module.exports = async (backups) => {
  const getT = global.smoonbI18n?.t || t;
  console.log(chalk.blue(`\n📋 ${getT('restore.steps.backupSelection.title')}`));
  console.log(chalk.blue(getT('restore.steps.backupSelection.separator')));
  
  backups.forEach((backup, index) => {
    const date = new Date(backup.created).toLocaleString('pt-BR');
    const projectInfo = backup.projectId !== 'Desconhecido' ? ` (${backup.projectId})` : '';
    
    console.log(`${index + 1}. ${backup.name}${projectInfo}`);
    console.log(`   📅 ${date} | 📦 ${backup.size}`);
    console.log('');
  });
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const question = (query) => new Promise(resolve => rl.question(query, resolve));
  
  const choice = await question(`\n${getT('restore.steps.backupSelection.input', { min: 1, max: backups.length })} `);
  rl.close();
  
  const backupIndex = parseInt(choice) - 1;
  
  if (backupIndex < 0 || backupIndex >= backups.length) {
    throw new Error(getT('restore.steps.backupSelection.invalid'));
  }
  
  return backups[backupIndex];
};

