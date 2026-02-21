const chalk = require('chalk');
const { canPerformCompleteBackup } = require('../../../utils/docker');
const { showDockerMessagesAndExit } = require('../utils');
const { t } = require('../../../i18n');

/**
 * Etapa 0: Validação Docker
 * Deve ocorrer antes de tudo
 * @param {object} [options]
 * @param {boolean} [options.skipSupabaseVersionCheck=false]
 */
module.exports = async (options = {}) => {
  const getT = global.smoonbI18n?.t || t;
  console.log(chalk.blue(`\n🐳 ${getT('docker.validation.title')}`));
  console.log(chalk.cyan(`🔍 ${getT('docker.validation.checking')}`));
  
  const backupCapability = await canPerformCompleteBackup({
    skipSupabaseVersionCheck: options.skipSupabaseVersionCheck || false
  });

  if (!backupCapability.canBackupComplete) {
    showDockerMessagesAndExit(backupCapability.reason, backupCapability);
  }

  if (backupCapability.supabaseVersionCheckSkipped) {
    console.log(chalk.yellow(`⚠️  ${getT('supabase.cliVersionSkipWarning')}`));
  }
  
  console.log(chalk.green(`✅ ${getT('docker.validation.detected')}`));
  console.log(chalk.white(`🐳 ${getT('docker.validation.version', { version: backupCapability.dockerStatus.version })}`));
  
  return { success: true };
};

