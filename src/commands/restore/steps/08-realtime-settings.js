const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const inquirer = require('inquirer');

/**
 * Etapa 8: Restaurar Realtime Settings (interativo - exibir URL e valores)
 */
module.exports = async ({ backupPath, targetProject }) => {
  
  try {
    const realtimeSettingsPath = path.join(backupPath, 'realtime-settings.json');
    
    if (!fs.existsSync(realtimeSettingsPath)) {
      console.log(chalk.yellow('   ⚠️  Nenhuma configuração de Realtime encontrada no backup'));
      return;
    }
    
    const realtimeSettings = JSON.parse(fs.readFileSync(realtimeSettingsPath, 'utf8'));
    const dashboardUrl = `https://supabase.com/dashboard/project/${targetProject.targetProjectId}/realtime/settings`;
    
    console.log(chalk.green('\n   ✅ URL para configuração manual:'));
    console.log(chalk.cyan(`   ${dashboardUrl}`));
    console.log(chalk.yellow('\n   📋 Configure manualmente as seguintes opções:'));
    
    if (realtimeSettings.realtime_settings?.settings) {
      Object.values(realtimeSettings.realtime_settings.settings).forEach((setting) => {
        console.log(chalk.white(`   - ${setting.label}: ${setting.value}`));
        if (setting.description) {
          console.log(chalk.white(`     ${setting.description}`));
        }
      });
    }
    
    console.log(chalk.yellow('\n   ⚠️  Após configurar, pressione Enter para continuar...'));
    
    await inquirer.prompt([{
      type: 'input',
      name: 'continue',
      message: 'Pressione Enter para continuar'
    }]);
    
    console.log(chalk.green('   ✅ Realtime Settings processados'));
    
  } catch (error) {
    console.error(chalk.red(`   ❌ Erro ao processar Realtime Settings: ${error.message}`));
  }
};

