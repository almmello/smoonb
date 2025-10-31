const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

/**
 * Etapa 7: Restaurar Database Settings (via SQL)
 */
module.exports = async ({ backupPath, targetProject }) => {
  console.log(chalk.blue('\n🔧 Restaurando Database Settings...'));
  
  try {
    const files = fs.readdirSync(backupPath);
    const dbSettingsFile = files.find(f => f.startsWith('database-settings-') && f.endsWith('.json'));
    
    if (!dbSettingsFile) {
      console.log(chalk.yellow('   ⚠️  Nenhuma configuração de Database encontrada no backup'));
      return;
    }
    
    const dbSettingsData = JSON.parse(fs.readFileSync(path.join(backupPath, dbSettingsFile), 'utf8'));
    const dbSettings = dbSettingsData.database_settings || dbSettingsData;
    
    const extensions = dbSettings.extensions || [];
    
    if (extensions.length > 0) {
      console.log(chalk.gray(`   - Habilitando ${extensions.length} extension(s)...`));
      
      for (const ext of extensions) {
        const extName = typeof ext === 'string' ? ext : ext.name;
        console.log(chalk.gray(`     - ${extName}`));
        
        const sqlCommand = `CREATE EXTENSION IF NOT EXISTS ${extName};`;
        
        const urlMatch = targetProject.targetDatabaseUrl.match(/postgresql:\/\/([^@:]+):([^@]+)@(.+)$/);
        
        if (!urlMatch) {
          console.log(chalk.yellow(`     ⚠️  URL inválida para ${extName}`));
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
          console.log(chalk.yellow(`     ⚠️  ${extName} - extension já existe ou não pode ser habilitada`));
        }
      }
    }
    
    console.log(chalk.green('   ✅ Database Settings restaurados com sucesso!'));
    
  } catch (error) {
    console.error(chalk.red(`   ❌ Erro ao restaurar Database Settings: ${error.message}`));
  }
};

