const chalk = require('chalk');
const path = require('path');
const inquirer = require('inquirer');
const { execSync } = require('child_process');
const { extractPasswordFromDbUrl, ensureCleanLink } = require('../../../utils/supabaseLink');
const { cleanDir, countFiles, copyDirSafe } = require('../../../utils/fsExtra');

/**
 * Etapa 10: Backup Migrations (NOVA ETAPA INDEPENDENTE)
 */
module.exports = async ({ projectId, accessToken, databaseUrl, backupDir }) => {
  try {
    // Reset de link ao projeto de ORIGEM
    const dbPassword = extractPasswordFromDbUrl(databaseUrl);
    await ensureCleanLink(projectId, accessToken, dbPassword);
    
    // Limpar migrations local (opcional, mas recomendado para garantir servidor como fonte da verdade)
    const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
    await cleanDir(migrationsDir);
    console.log(chalk.gray('   - Limpando supabase/migrations...'));
    
    // Baixar todas as migrations do servidor usando migration fetch
    console.log(chalk.gray('   - Baixando todas as migrations do servidor usando migration fetch...'));
    
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
      console.log(chalk.yellow(`   ⚠️ Erro ao executar migration fetch: ${error.message}`));
      console.log(chalk.yellow('   💡 Verifique se o projeto está linkado corretamente e se o token está válido.'));
      return { success: false };
    }
    
    // Contar arquivos baixados
    const fileCount = await countFiles(migrationsDir);
    console.log(chalk.gray(`   - Arquivos baixados: ${fileCount} migrations`));
    
    // Copiar migrations para o backup
    const backupMigrationsDir = path.join(backupDir, 'migrations');
    const copiedCount = await copyDirSafe(migrationsDir, backupMigrationsDir);
    console.log(chalk.gray(`   - Copiando supabase/migrations → backups/backup-${path.basename(backupDir)}/migrations (${copiedCount} arquivos)...`));
    
    if (copiedCount > 0) {
      console.log(chalk.green(`   ✅ ${copiedCount} migration(s) copiada(s)`));
    }
    
    // Perguntar se deseja apagar supabase/migrations após o backup
    const { shouldClean } = await inquirer.prompt([{
      type: 'confirm',
      name: 'shouldClean',
      message: 'Deseja apagar supabase/migrations após o backup? (S/n):',
      default: false,
      prefix: ''
    }]);
    
    if (shouldClean) {
      await cleanDir(migrationsDir);
      console.log(chalk.gray('   - supabase/migrations apagado.'));
    }
    
    return {
      success: true,
      file_count: copiedCount
    };
  } catch (error) {
    console.log(chalk.yellow(`   ⚠️ Erro no backup das migrations: ${error.message}`));
    return { success: false };
  }
};

