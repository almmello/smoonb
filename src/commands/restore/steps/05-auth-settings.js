const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const inquirer = require('inquirer');

/**
 * Etapa 5: Restaurar Auth Settings (interativo - exibir URL e valores)
 */
module.exports = async ({ backupPath, targetProject }) => {
  console.log(chalk.blue('\n🔐 Restaurando Auth Settings...'));
  
  try {
    const authSettingsPath = path.join(backupPath, 'auth-settings.json');
    
    if (!fs.existsSync(authSettingsPath)) {
      console.log(chalk.yellow('   ⚠️  Nenhuma configuração de Auth encontrada no backup'));
      return;
    }
    
    const authSettings = JSON.parse(fs.readFileSync(authSettingsPath, 'utf8'));
    const dashboardUrl = `https://supabase.com/dashboard/project/${targetProject.targetProjectId}/auth/url-config`;
    
    console.log(chalk.green('\n   ✅ URL para configuração manual:'));
    console.log(chalk.cyan(`   ${dashboardUrl}`));
    console.log(chalk.yellow('\n   📋 Configure manualmente as seguintes opções:'));
    
    if (authSettings.settings?.auth_url_config) {
      Object.entries(authSettings.settings.auth_url_config).forEach(([key, value]) => {
        console.log(chalk.gray(`   - ${key}: ${value}`));
      });
    } else if (authSettings.auth_url_config) {
      Object.entries(authSettings.auth_url_config).forEach(([key, value]) => {
        console.log(chalk.gray(`   - ${key}: ${value}`));
      });
    }
    
    console.log(chalk.yellow('\n   ⚠️  Após configurar, pressione Enter para continuar...'));
    
    await inquirer.prompt([{
      type: 'input',
      name: 'continue',
      message: 'Pressione Enter para continuar'
    }]);
    
    console.log(chalk.green('   ✅ Auth Settings processados'));
    
  } catch (error) {
    console.error(chalk.red(`   ❌ Erro ao processar Auth Settings: ${error.message}`));
  }
};

