const chalk = require('chalk');
const { t } = require('../../i18n');

/**
 * Função para mostrar mensagens educativas e encerrar elegantemente
 */
function showDockerMessagesAndExit(reason) {
  const getT = global.smoonbI18n?.t || t;
  
  console.log('');
  
  switch (reason) {
    case 'docker_not_installed':
      console.log(chalk.red(`❌ ${getT('docker.notInstalled')}`));
      console.log('');
      console.log(chalk.yellow(`📋 ${getT('docker.instructions')}`));
      console.log(chalk.yellow(`   1. ${getT('docker.installDocker')}`));
      console.log(chalk.yellow(`   2. ${getT('docker.runDocker')}`));
      console.log(chalk.yellow(`   3. ${getT('docker.repeatCommand')}`));
      console.log('');
      console.log(chalk.blue(`🔗 ${getT('docker.download')}`));
      console.log('');
      console.log(chalk.gray(`💡 ${getT('docker.requiredComponents')}`));
      break;

    case 'docker_not_running':
      console.log(chalk.red(`❌ ${getT('docker.notRunning')}`));
      console.log('');
      console.log(chalk.yellow(`📋 ${getT('docker.instructions')}`));
      console.log(chalk.yellow(`   1. ${getT('docker.runDocker')}`));
      console.log(chalk.yellow(`   2. ${getT('docker.waitInitialization')}`));
      console.log(chalk.yellow(`   3. ${getT('docker.repeatCommand')}`));
      console.log('');
      console.log(chalk.blue(`💡 ${getT('docker.tip')}`));
      console.log('');
      console.log(chalk.gray(`💡 ${getT('docker.requiredComponents')}`));
      break;

    case 'supabase_cli_not_found':
      console.log(chalk.red(`❌ ${getT('supabase.cliNotFound')}`));
      console.log('');
      console.log(chalk.yellow(`📋 ${getT('supabase.installInstructions')}`));
      console.log(chalk.yellow(`   1. ${getT('supabase.installCli')}`));
      console.log(chalk.yellow(`   2. ${getT('supabase.repeatCommand')}`));
      console.log('');
      console.log(chalk.blue(`🔗 ${getT('supabase.installLink')}`));
      console.log('');
      console.log(chalk.gray(`💡 ${getT('supabase.requiredComponents')}`));
      break;
  }

  console.log('');
  console.log(chalk.red(`🚫 ${getT('docker.cancelled')}`));
  console.log(chalk.gray(`   ${getT('docker.installComponents')}`));
  console.log('');
  
  process.exit(1);
}

module.exports = {
  showDockerMessagesAndExit
};

