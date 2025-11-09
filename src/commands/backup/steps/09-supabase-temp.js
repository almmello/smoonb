const chalk = require('chalk');
const path = require('path');
const { copyDirSafe } = require('../../../utils/fsExtra');
const { cleanDir } = require('../../../utils/fsExtra');
const { t } = require('../../../i18n');

/**
 * Etapa 9: Backup Supabase .temp (NOVA ETAPA INDEPENDENTE)
 */
module.exports = async (context) => {
  const { backupDir } = context;
  try {
    const getT = global.smoonbI18n?.t || t;
    const tempDir = path.join(process.cwd(), 'supabase', '.temp');
    const backupTempDir = path.join(backupDir, 'supabase-temp');
    
    const fileCount = await copyDirSafe(tempDir, backupTempDir);
    const relativePath = path.relative(process.cwd(), backupTempDir);
    console.log(chalk.white(`   - ${getT('backup.steps.temp.copying', { path: relativePath, count: fileCount })}`));
    
    if (fileCount === 0) {
      console.log(chalk.white(`   - ${getT('backup.steps.temp.noFiles')}`));
    } else {
      console.log(chalk.green(`   ✅ ${getT('backup.steps.temp.copied', { count: fileCount })}`));
    }
    
    // Usar flag de limpeza do contexto (já foi perguntado no início)
    const shouldClean = context?.cleanupFlags?.cleanTemp || false;
    
    if (shouldClean) {
      await cleanDir(tempDir);
      console.log(chalk.white(`   - ${getT('backup.steps.temp.cleaned')}`));
    }
    
    return {
      success: true,
      file_count: fileCount
    };
  } catch (error) {
    const getT = global.smoonbI18n?.t || t;
    console.log(chalk.yellow(`   ⚠️ ${getT('backup.steps.temp.error', { message: error.message })}`));
    return { success: false };
  }
};

