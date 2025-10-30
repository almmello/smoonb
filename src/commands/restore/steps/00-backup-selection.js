const chalk = require('chalk');
const readline = require('readline');

/**
 * Etapa 0: Seleção interativa de backup
 */
module.exports = async (backups) => {
  console.log(chalk.blue('\n📋 Backups disponíveis:'));
  console.log(chalk.blue('═'.repeat(80)));
  
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
  
  const choice = await question(`\nDigite o número do backup para restaurar (1-${backups.length}): `);
  rl.close();
  
  const backupIndex = parseInt(choice) - 1;
  
  if (backupIndex < 0 || backupIndex >= backups.length) {
    throw new Error('Número inválido');
  }
  
  return backups[backupIndex];
};

