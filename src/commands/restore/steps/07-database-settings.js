const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { t } = require('../../../i18n');

/**
 * Etapa 7: Restaurar Database Settings (via SQL)
 */
module.exports = async ({ backupPath, targetProject }) => {
  try {
    const getT = global.smoonbI18n?.t || t;
    const files = fs.readdirSync(backupPath);
    const dbSettingsFile = files.find(f => f.startsWith('database-settings-') && f.endsWith('.json'));
    
    if (!dbSettingsFile) {
      console.log(chalk.yellow(`   ⚠️  ${getT('restore.steps.databaseSettings.notFound')}`));
      return { success: false };
    }
    
    const dbSettingsData = JSON.parse(fs.readFileSync(path.join(backupPath, dbSettingsFile), 'utf8'));
    const dbSettings = dbSettingsData.database_settings || dbSettingsData;
    
    const extensions = dbSettings.extensions || [];
    
    if (extensions.length > 0) {
      console.log(chalk.white(`   - ${getT('restore.steps.databaseSettings.enabling', { count: extensions.length })}`));
      
      for (const ext of extensions) {
        const extName = typeof ext === 'string' ? ext : ext.name;
        console.log(chalk.white(`     ${getT('restore.steps.databaseSettings.extension', { extName })}`));
        
        const sqlCommand = `CREATE EXTENSION IF NOT EXISTS ${extName};`;
        
        const urlMatch = targetProject.targetDatabaseUrl.match(/postgresql:\/\/([^@:]+):([^@]+)@(.+)$/);
        
        if (!urlMatch) {
          console.log(chalk.yellow(`     ⚠️  ${getT('restore.steps.databaseSettings.invalidUrl', { extName })}`));
          continue;
        }
        
        const dockerCmd = [
          'docker run --rm',
          '--network host',
          `-e PGPASSWORD="${encodeURIComponent(urlMatch[2])}"`,
          'postgres:17 psql',
          `-d "${targetProject.targetDatabaseUrl}"`,
          `-c "${sqlCommand}"`
        ].join(' ');
        
        try {
          execSync(dockerCmd, { stdio: 'pipe', encoding: 'utf8' });
        } catch {
          console.log(chalk.yellow(`     ⚠️  ${getT('restore.steps.databaseSettings.extensionExists', { extName })}`));
        }
      }
    }
    
    console.log(chalk.green(`   ✅ ${getT('restore.steps.databaseSettings.success')}`));
    
    return { success: true, extensions_count: extensions.length };
    
  } catch (error) {
    const getT = global.smoonbI18n?.t || t;
    console.error(chalk.red(`   ❌ ${getT('restore.steps.databaseSettings.error', { message: error.message })}`));
    throw error;
  }
};

