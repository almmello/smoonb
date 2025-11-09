const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const { promisify } = require('util');
const { exec } = require('child_process');
const { t } = require('../../../i18n');

const execAsync = promisify(exec);

/**
 * Etapa 7: Backup Custom Roles via SQL
 */
module.exports = async ({ databaseUrl, backupDir, accessToken }) => {
  try {
    const getT = global.smoonbI18n?.t || t;
    console.log(chalk.white(`   - ${getT('backup.steps.roles.exporting')}`));
    
    const customRolesFile = path.join(backupDir, 'custom-roles.sql');
    
    try {
      // Usar Supabase CLI via Docker para roles
      await execAsync(`supabase db dump --db-url "${databaseUrl}" --role-only -f "${customRolesFile}"`, { 
        env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken || '' } 
      });
      
      const stats = await fs.stat(customRolesFile);
      const sizeKB = (stats.size / 1024).toFixed(1);
      
      console.log(chalk.green(`     ✅ Custom Roles exportados via Docker: ${sizeKB} KB`));
      
      return { success: true, roles: [{ filename: 'custom-roles.sql', sizeKB }] };
    } catch (error) {
      console.log(chalk.yellow(`     ⚠️ ${getT('backup.steps.roles.exportError', { message: error.message })}`));
      return { success: false, roles: [] };
    }
  } catch (error) {
    const getT = global.smoonbI18n?.t || t;
    console.log(chalk.yellow(`     ⚠️ ${getT('backup.steps.roles.error', { message: error.message })}`));
    return { success: false, roles: [] };
  }
};

