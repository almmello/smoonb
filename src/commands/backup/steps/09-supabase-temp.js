const chalk = require('chalk');
const path = require('path');
const inquirer = require('inquirer');
const { copyDirSafe } = require('../../../utils/fsExtra');
const { cleanDir } = require('../../../utils/fsExtra');

/**
 * Etapa 9: Backup Supabase .temp (NOVA ETAPA INDEPENDENTE)
 */
module.exports = async ({ backupDir }) => {
  try {
    const tempDir = path.join(process.cwd(), 'supabase', '.temp');
    const backupTempDir = path.join(backupDir, 'supabase-temp');
    
    const fileCount = await copyDirSafe(tempDir, backupTempDir);
    
    console.log(chalk.gray(`   - Copiando supabase/.temp → backups/backup-${path.basename(backupDir)}/supabase-temp (${fileCount} arquivos)...`));
    
    if (fileCount === 0) {
      console.log(chalk.gray('   - Nenhum arquivo encontrado em supabase/.temp'));
    } else {
      console.log(chalk.green(`   ✅ ${fileCount} arquivo(s) copiado(s)`));
    }
    
    // Perguntar se deseja apagar supabase/.temp após o backup
    const { shouldClean } = await inquirer.prompt([{
      type: 'confirm',
      name: 'shouldClean',
      message: 'Deseja apagar supabase/.temp após o backup? (S/n):',
      default: false,
      prefix: ''
    }]);
    
    if (shouldClean) {
      await cleanDir(tempDir);
      console.log(chalk.gray('   - supabase/.temp apagado.'));
    }
    
    return {
      success: true,
      file_count: fileCount
    };
  } catch (error) {
    console.log(chalk.yellow(`   ⚠️ Erro no backup do supabase/.temp: ${error.message}`));
    return { success: false };
  }
};

