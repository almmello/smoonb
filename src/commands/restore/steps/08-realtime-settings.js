const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const inquirer = require('inquirer');
const { t } = require('../../../i18n');

/**
 * Etapa 8: Restaurar Realtime Settings (interativo - exibir URL e valores)
 */
module.exports = async ({ backupPath, targetProject }) => {
  
  try {
    const getT = global.smoonbI18n?.t || t;
    const realtimeSettingsPath = path.join(backupPath, 'realtime-settings.json');
    
    if (!fs.existsSync(realtimeSettingsPath)) {
      console.log(chalk.yellow(`   ⚠️  ${getT('restore.steps.realtime.notFound')}`));
      return;
    }
    
    const realtimeSettings = JSON.parse(fs.readFileSync(realtimeSettingsPath, 'utf8'));
    const dashboardUrl = `https://supabase.com/dashboard/project/${targetProject.targetProjectId}/realtime/settings`;
    
    console.log(chalk.green(`\n   ✅ ${getT('restore.steps.realtime.urlTitle')}`));
    console.log(chalk.cyan(`   ${dashboardUrl}`));
    console.log(chalk.yellow(`\n   📋 ${getT('restore.steps.realtime.configureTitle')}`));
    
    if (realtimeSettings.realtime_settings?.settings) {
      Object.values(realtimeSettings.realtime_settings.settings).forEach((setting) => {
        console.log(chalk.white(`   - ${setting.label}: ${setting.value}`));
        if (setting.description) {
          console.log(chalk.white(`     ${setting.description}`));
        }
      });
    }
    
    console.log(chalk.yellow(`\n   ⚠️  ${getT('restore.steps.realtime.pressEnter')}`));
    
    await inquirer.prompt([{
      type: 'input',
      name: 'continue',
      message: getT('restore.steps.realtime.pressEnter'),
      prefix: ''
    }]);
    
    console.log(chalk.green(`   ✅ ${getT('restore.steps.realtime.success')}`));
    
  } catch (error) {
    const getT = global.smoonbI18n?.t || t;
    console.error(chalk.red(`   ❌ ${getT('restore.steps.realtime.error', { message: error.message })}`));
  }
};

