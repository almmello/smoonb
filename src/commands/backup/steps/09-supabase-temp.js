const chalk = require('chalk');
const path = require('path');
const { copyDirSafe } = require('../../../utils/fsExtra');
const { cleanDir } = require('../../../utils/fsExtra');

/**
 * Etapa 9: Backup Supabase .temp (NOVA ETAPA INDEPENDENTE)
 */
module.exports = async (context) => {
  const { backupDir } = context;
  try {
    const tempDir = path.join(process.cwd(), 'supabase', '.temp');
    const backupTempDir = path.join(backupDir, 'supabase-temp');
    
    const fileCount = await copyDirSafe(tempDir, backupTempDir);
    
    console.log(chalk.white(`   - Copiando supabase/.temp → backups/backup-${path.basename(backupDir)}/supabase-temp (${fileCount} arquivos)...`));
    
    if (fileCount === 0) {
      console.log(chalk.white('   - Nenhum arquivo encontrado em supabase/.temp'));
    } else {
      console.log(chalk.green(`   ✅ ${fileCount} arquivo(s) copiado(s)`));
    }
    
    // Usar flag de limpeza do contexto (já foi perguntado no início)
    const shouldClean = context?.cleanupFlags?.cleanTemp || false;
    
    if (shouldClean) {
      await cleanDir(tempDir);
      console.log(chalk.white('   - supabase/.temp apagado.'));
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

