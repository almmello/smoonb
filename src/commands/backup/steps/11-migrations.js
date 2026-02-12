const chalk = require('chalk');
const path = require('path');
const { execSync } = require('child_process');
const { extractPasswordFromDbUrl, ensureCleanLink } = require('../../../utils/supabaseLink');
const { cleanDir, countFiles, copyDirSafe } = require('../../../utils/fsExtra');
const { t } = require('../../../i18n');
const ui = require('../../../utils/cliUi');

/**
 * Etapa 10: Migrations Backup (NOVA ETAPA INDEPENDENTE)
 */
module.exports = async (context) => {
  const { projectId, accessToken, databaseUrl, backupDir } = context;
  try {
    const getT = global.smoonbI18n?.t || t;
    // Reset de link ao projeto de ORIGEM
    const dbPassword = extractPasswordFromDbUrl(databaseUrl);
    await ensureCleanLink(projectId, accessToken, dbPassword);
    
    // Limpar migrations local (opcional, mas recomendado para garantir servidor como fonte da verdade)
    const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
    await cleanDir(migrationsDir);
    console.log(chalk.white(`   - ${getT('backup.steps.migrations.cleaning')}`));
    
    // Baixar todas as migrations do servidor usando migration fetch
    console.log(chalk.white(`   - ${getT('backup.steps.migrations.downloading')}`));
    
    const env = {
      ...process.env,
      SUPABASE_ACCESS_TOKEN: accessToken
    };
    
    try {
      execSync('supabase migration fetch', {
        cwd: process.cwd(),
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 120000,
        env
      });
    } catch (error) {
      console.log(chalk.yellow(`   ⚠️ ${getT('backup.steps.migrations.fetchError', { message: error.message })}`));
      console.log(chalk.yellow(`   💡 ${getT('backup.steps.migrations.fetchTip')}`));
      return { success: false };
    }
    
    // Contar arquivos baixados
    const fileCount = await countFiles(migrationsDir);
    console.log(chalk.white(`   - ${getT('backup.steps.migrations.downloaded', { count: fileCount })}`));
    
    // Copiar migrations para o backup
    const backupMigrationsDir = path.join(backupDir, 'migrations');
    const copiedCount = await copyDirSafe(migrationsDir, backupMigrationsDir);
    const relativePath = path.relative(process.cwd(), backupMigrationsDir);
    console.log(chalk.white(`   - ${getT('backup.steps.migrations.copying', { path: relativePath, count: copiedCount })}`));
    
    if (copiedCount > 0) {
      console.log(chalk.green(`   ✅ ${getT('backup.steps.migrations.copied', { count: copiedCount })}`));
    }
    
    // Usar flag de limpeza do contexto (já foi perguntado no início)
    const shouldClean = context?.cleanupFlags?.cleanMigrations || false;
    
    if (shouldClean) {
      await cleanDir(migrationsDir);
      ui.hint(`   - ${getT('backup.steps.migrations.cleaned')}`);
    }
    
    return {
      success: true,
      file_count: copiedCount
    };
  } catch (error) {
    const getT = global.smoonbI18n?.t || t;
    console.log(chalk.yellow(`   ⚠️ ${getT('backup.steps.migrations.error', { message: error.message })}`));
    return { success: false };
  }
};

