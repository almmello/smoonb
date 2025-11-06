const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const { ensureDir } = require('../utils/fsx');
const { readEnvFile } = require('../utils/env');
const { showBetaBanner } = require('../utils/banner');

/**
 * Comando para importar arquivo .backup.gz do Dashboard do Supabase
 */
module.exports = async (options) => {
  showBetaBanner();
  
  try {
    // Validar que o arquivo foi fornecido
    if (!options.file) {
      console.error(chalk.red('❌ Arquivo não fornecido'));
      console.log(chalk.yellow('💡 Use: npx smoonb --import --file <caminho-completo-do-arquivo>'));
      console.log(chalk.gray('   Exemplo: npx smoonb --import --file "C:\\Downloads\\db_cluster-04-03-2024@14-16-59.backup.gz"'));
      process.exit(1);
    }

    const sourceFile = path.resolve(options.file);
    
    // Verificar se o arquivo existe
    try {
      await fs.access(sourceFile);
    } catch {
      console.error(chalk.red(`❌ Arquivo não encontrado: ${sourceFile}`));
      process.exit(1);
    }

    // Verificar se é um arquivo .backup.gz
    if (!sourceFile.endsWith('.backup.gz') && !sourceFile.endsWith('.backup')) {
      console.error(chalk.red('❌ Arquivo deve ser .backup.gz ou .backup'));
      process.exit(1);
    }

    // Ler .env.local para obter SMOONB_OUTPUT_DIR
    const envPath = path.join(process.cwd(), '.env.local');
    let outputDir = './backups';
    
    try {
      const currentEnv = await readEnvFile(envPath);
      outputDir = currentEnv.SMOONB_OUTPUT_DIR || './backups';
    } catch {
      // Se não conseguir ler .env.local, usar padrão
      console.log(chalk.yellow('⚠️  Não foi possível ler .env.local, usando diretório padrão: ./backups'));
    }

    // Extrair informações do nome do arquivo
    // Formato esperado: db_cluster-DD-MM-YYYY@HH-MM-SS.backup.gz
    const fileName = path.basename(sourceFile);
    const match = fileName.match(/db_cluster-(\d{2})-(\d{2})-(\d{4})@(\d{2})-(\d{2})-(\d{2})\.backup(\.gz)?/);
    
    if (!match) {
      console.error(chalk.red('❌ Nome do arquivo não está no formato esperado do Dashboard'));
      console.log(chalk.yellow('💡 Formato esperado: db_cluster-DD-MM-YYYY@HH-MM-SS.backup.gz'));
      console.log(chalk.gray(`   Arquivo recebido: ${fileName}`));
      process.exit(1);
    }

    const [, day, month, year, hour, minute, second] = match;
    
    // Criar nome da pasta no formato backup-YYYY-MM-DD-HH-MM-SS
    const backupDirName = `backup-${year}-${month}-${day}-${hour}-${minute}-${second}`;
    const backupDir = path.join(outputDir, backupDirName);
    
    // Criar diretório de backup
    await ensureDir(backupDir);
    console.log(chalk.blue(`📁 Criando diretório de backup: ${backupDirName}`));
    
    // Copiar arquivo para o diretório de backup
    const destFile = path.join(backupDir, fileName);
    await fs.copyFile(sourceFile, destFile);
    
    // Obter tamanho do arquivo
    const stats = await fs.stat(destFile);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    console.log(chalk.green(`✅ Arquivo importado com sucesso!`));
    console.log(chalk.blue(`📁 Localização: ${backupDir}`));
    console.log(chalk.blue(`📦 Arquivo: ${fileName} (${sizeMB} MB)`));
    console.log(chalk.cyan(`\n💡 Próximo passo: Execute 'npx smoonb restore' para restaurar este backup`));
    
  } catch (error) {
    console.error(chalk.red(`❌ Erro ao importar arquivo: ${error.message}`));
    process.exit(1);
  }
};

