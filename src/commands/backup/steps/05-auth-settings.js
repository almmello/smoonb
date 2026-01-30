const chalk = require('chalk');
const path = require('path');
const { writeJson } = require('../../../utils/fsx');
const { t } = require('../../../i18n');

/**
 * Etapa 4: Backup Auth Settings via Management API
 */
module.exports = async ({ projectId, accessToken, backupDir }) => {
  try {
    const getT = global.smoonbI18n?.t || t;
    console.log(chalk.white(`   - ${getT('backup.steps.auth.exporting')}`));
    
    // Usar fetch direto para Management API com Personal Access Token
    const authResponse = await fetch(`https://api.supabase.com/v1/projects/${projectId}/config/auth`, {
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!authResponse.ok) {
      console.log(chalk.yellow(`     ⚠️ ${getT('backup.steps.auth.getError', { status: authResponse.status, statusText: authResponse.statusText })}`));
      return { success: false };
    }

    const authSettings = await authResponse.json();
    
    // Salvar configurações de Auth
    const authSettingsPath = path.join(backupDir, 'auth-settings.json');
    await writeJson(authSettingsPath, {
      project_id: projectId,
      timestamp: new Date().toISOString(),
      settings: authSettings
    });

    console.log(chalk.green(`✅ Auth Settings exportadas: ${path.basename(authSettingsPath)}`));
    return { success: true };

  } catch (error) {
    const getT = global.smoonbI18n?.t || t;
    console.log(chalk.yellow(`   ⚠️ ${getT('backup.steps.auth.error', { message: error.message })}`));
    return { success: false };
  }
};

