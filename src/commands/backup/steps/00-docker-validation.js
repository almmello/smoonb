const chalk = require('chalk');
const { canPerformCompleteBackup } = require('../../../utils/docker');
const { showDockerMessagesAndExit } = require('../utils');
const { t } = require('../../../i18n');

/**
 * Etapa 0: Validação Docker
 * Deve ocorrer antes de tudo
 */
module.exports = async () => {
  const getT = global.smoonbI18n?.t || t;
  console.log(chalk.blue(`\n🐳 ${getT('docker.validation.title')}`));
  console.log(chalk.cyan(`🔍 ${getT('docker.validation.checking')}`));
  
  const backupCapability = await canPerformCompleteBackup();

  if (!backupCapability.canBackupComplete) {
    showDockerMessagesAndExit(backupCapability.reason, backupCapability);
  }
  
  console.log(chalk.green(`✅ ${getT('docker.validation.detected')}`));
  console.log(chalk.white(`🐳 ${getT('docker.validation.version', { version: backupCapability.dockerStatus.version })}`));
  
  return { success: true };
};

