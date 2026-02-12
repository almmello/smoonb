const chalk = require('chalk');
const path = require('path');
const { execSync } = require('child_process');
const { t } = require('../../../i18n');
const ui = require('../../../utils/cliUi');

/**
 * Etapa 3: Restaurar Database via psql
 */
module.exports = async ({ backupFilePath, targetDatabaseUrl }) => {
  try {
    const getT = global.smoonbI18n?.t || t;
    const backupDirAbs = path.resolve(path.dirname(backupFilePath));
    const fileName = path.basename(backupFilePath);
    let uncompressedFile = fileName;
    
    // Verificar se é arquivo .backup.gz (compactado) ou .backup (descompactado)
    if (fileName.endsWith('.backup.gz')) {
      console.log(chalk.white(`   - ${getT('restore.steps.database.detectedGz')}`));
      console.log(chalk.white(`   - ${getT('restore.steps.database.extractingGz')}`));
      
      const unzipCmd = [
        'docker run --rm',
        `-v "${backupDirAbs}:/host"`,
        'postgres:17 gunzip /host/' + fileName
      ].join(' ');
      
      execSync(unzipCmd, { stdio: 'pipe' });
      uncompressedFile = fileName.replace('.gz', '');
      console.log(chalk.white(`   - ${getT('restore.steps.database.uncompressed', { file: uncompressedFile })}`));
    } else if (fileName.endsWith('.backup')) {
      console.log(chalk.white(`   - ${getT('restore.steps.database.detectedBackup')}`));
      console.log(chalk.white(`   - ${getT('restore.steps.database.proceeding')}`));
    } else {
      throw new Error(`Formato de arquivo inválido. Esperado .backup.gz ou .backup, recebido: ${fileName}`);
    }
    
    // Extrair credenciais da URL de conexão
    const urlMatch = targetDatabaseUrl.match(/postgresql:\/\/([^@:]+):([^@]+)@(.+)$/);
    
    if (!urlMatch) {
      const getT = global.smoonbI18n?.t || t;
      throw new Error(getT('error.databaseUrlInvalid'));
    }
    
    // Comando psql conforme documentação oficial Supabase
    const restoreCmd = [
      'docker run --rm --network host',
      `-v "${backupDirAbs}:/host"`,
      `-e PGPASSWORD="${encodeURIComponent(urlMatch[2])}"`,
      'postgres:17 psql',
      `-d "${targetDatabaseUrl}"`,
      `-f /host/${uncompressedFile}`
    ].join(' ');
    
    console.log(chalk.cyan(`   - ${getT('restore.steps.database.executing')}`));
    console.log(chalk.cyan(`   ℹ️ ${getT('restore.steps.database.followingDocs')}`));
    console.log(chalk.yellow(`   ⚠️ ${getT('restore.steps.database.warning')}`));
    console.log(chalk.yellow(`   ⚠️ ${getT('restore.steps.database.warningReason1')}`));
    console.log(chalk.yellow(`   ⚠️ ${getT('restore.steps.database.warningReason2')}`));
    
    // Executar comando de restauração
    execSync(restoreCmd, { stdio: 'inherit', encoding: 'utf8' });
    
    console.log(chalk.green(`   ✅ ${getT('restore.steps.database.success')}`));
    ui.hint(`   ℹ️ ${getT('restore.steps.database.normalErrors')}`);
    
  } catch (error) {
    // Erros esperados conforme documentação oficial Supabase
    const getT = global.smoonbI18n?.t || t;
    if (error.message.includes('already exists') || 
        error.message.includes('constraint') ||
        error.message.includes('duplicate') ||
        error.stdout?.includes('already exists')) {
      console.log(chalk.yellow(`   ⚠️ ${getT('restore.steps.database.expectedErrors')}`));
      console.log(chalk.green(`   ✅ ${getT('restore.steps.database.success')}`));
      ui.hint(`   ℹ️ ${getT('restore.steps.database.errorsIgnored')}`);
    } else {
      console.error(chalk.red(`   ❌ ${getT('restore.steps.database.error', { message: error.message })}`));
      throw error;
    }
  }
};

