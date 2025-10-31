const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const { promisify } = require('util');
const { exec } = require('child_process');

const execAsync = promisify(exec);

/**
 * Etapa 7: Backup Custom Roles via SQL
 */
module.exports = async ({ databaseUrl, backupDir, accessToken }) => {
  try {
    console.log(chalk.white('   - Exportando Custom Roles via Docker...'));
    
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
      console.log(chalk.yellow(`     ⚠️ Erro ao exportar Custom Roles via Docker: ${error.message}`));
      return { success: false, roles: [] };
    }
  } catch (error) {
    console.log(chalk.yellow(`     ⚠️ Erro no backup dos Custom Roles: ${error.message}`));
    return { success: false, roles: [] };
  }
};

