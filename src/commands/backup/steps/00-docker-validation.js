const chalk = require('chalk');
const { canPerformCompleteBackup } = require('../../../utils/docker');
const { showDockerMessagesAndExit } = require('../utils');

/**
 * Etapa 0: Validação Docker
 * Deve ocorrer antes de tudo
 */
module.exports = async () => {
  console.log(chalk.blue('\n🐳 0/12 - Validação Docker...'));
  console.log(chalk.gray('🔍 Verificando dependências Docker...'));
  
  const backupCapability = await canPerformCompleteBackup();

  if (!backupCapability.canBackupComplete) {
    showDockerMessagesAndExit(backupCapability.reason);
  }
  
  console.log(chalk.green('✅ Docker Desktop detectado e funcionando'));
  console.log(chalk.gray(`🐳 Versão: ${backupCapability.dockerStatus.version}`));
  
  return { success: true };
};

