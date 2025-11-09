const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const inquirer = require('inquirer');
const { t } = require('../../../i18n');

/**
 * Etapa 5: Restaurar Auth Settings (interativo - exibir URL e valores)
 */
module.exports = async ({ backupPath, targetProject }) => {
  
  try {
    const getT = global.smoonbI18n?.t || t;
    const authSettingsPath = path.join(backupPath, 'auth-settings.json');
    
    if (!fs.existsSync(authSettingsPath)) {
      console.log(chalk.yellow(`   ⚠️  ${getT('restore.steps.auth.notFound')}`));
      return;
    }
    
    const authSettings = JSON.parse(fs.readFileSync(authSettingsPath, 'utf8'));
    const dashboardUrl = `https://supabase.com/dashboard/project/${targetProject.targetProjectId}/auth/url-config`;
    
    console.log(chalk.green(`\n   ✅ ${getT('restore.steps.auth.urlTitle')}`));
    console.log(chalk.cyan(`   ${dashboardUrl}`));
    console.log(chalk.yellow(`\n   📋 ${getT('restore.steps.auth.configureTitle')}`));
    
    if (authSettings.settings?.auth_url_config) {
      Object.entries(authSettings.settings.auth_url_config).forEach(([key, value]) => {
        console.log(chalk.white(`   - ${key}: ${value}`));
      });
    } else if (authSettings.auth_url_config) {
      Object.entries(authSettings.auth_url_config).forEach(([key, value]) => {
        console.log(chalk.white(`   - ${key}: ${value}`));
      });
    }
    
    console.log(chalk.yellow(`\n   ⚠️  ${getT('restore.steps.auth.pressEnter')}`));
    
    await inquirer.prompt([{
      type: 'input',
      name: 'continue',
      message: getT('restore.steps.auth.pressEnter'),
      prefix: ''
    }]);
    
    console.log(chalk.green(`   ✅ ${getT('restore.steps.auth.success')}`));
    
  } catch (error) {
    const getT = global.smoonbI18n?.t || t;
    console.error(chalk.red(`   ❌ ${getT('restore.steps.auth.error', { message: error.message })}`));
  }
};

