const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const { ensureDir } = require('../utils/fsx');
const { readEnvFile } = require('../utils/env');
const { showBetaBanner } = require('../utils/banner');
const { confirm } = require('../utils/prompt');
const { t } = require('../i18n');

/**
 * Comando para importar arquivo .backup.gz e opcionalmente .storage.zip do Dashboard do Supabase
 */
module.exports = async (options) => {
  showBetaBanner();
  
  try {
    const getT = global.smoonbI18n?.t || t;
    
    // Termo de uso e aviso de risco
    console.log(chalk.yellow.bold(`\n⚠️  ${getT('disclaimer.title')}\n`));
    console.log(chalk.white(`${getT('disclaimer.text')}\n`));
    console.log(chalk.white(`${getT('disclaimer.limitation')}\n`));
    
    const termsAccepted = await confirm(getT('disclaimer.acceptImport'), true);
    if (!termsAccepted) {
      console.log(chalk.red(`🚫 ${getT('disclaimer.operationCancelled')}`));
      process.exit(1);
    }
    
    // Validar que o arquivo de backup foi fornecido
    if (!options.file) {
      console.error(chalk.red(`❌ ${getT('import.fileRequired')}`));
      console.log(chalk.yellow('💡 Use: npx smoonb import --file <caminho-do-backup> [--storage <caminho-do-storage>]'));
      console.log(chalk.white('   Exemplo: npx smoonb import --file "C:\\Downloads\\db_cluster-04-03-2024@14-16-59.backup.gz"'));
      console.log(chalk.white('   Exemplo com storage: npx smoonb import --file "backup.backup.gz" --storage "meu-projeto.storage.zip"'));
      process.exit(1);
    }

    const sourceFile = path.resolve(options.file);
    
    // Verificar se o arquivo de backup existe
    try {
      await fs.access(sourceFile);
    } catch {
      console.error(chalk.red(`❌ ${getT('import.fileNotFound', { path: sourceFile })}`));
      process.exit(1);
    }

    // Verificar se é um arquivo .backup.gz ou .backup
    if (!sourceFile.endsWith('.backup.gz') && !sourceFile.endsWith('.backup')) {
      console.error(chalk.red(`❌ ${getT('import.invalidFormat')}`));
      process.exit(1);
    }

    // Validar arquivo de storage se fornecido
    let sourceStorageFile = null;
    if (options.storage) {
      sourceStorageFile = path.resolve(options.storage);
      
      try {
        await fs.access(sourceStorageFile);
      } catch {
        console.error(chalk.red(`❌ ${getT('import.storageNotFound', { path: sourceStorageFile })}`));
        process.exit(1);
      }

      // Verificar se é um arquivo .storage.zip
      if (!sourceStorageFile.endsWith('.storage.zip')) {
        console.error(chalk.red(`❌ ${getT('import.storageInvalidFormat')}`));
        process.exit(1);
      }
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

    // Extrair informações do nome do arquivo de backup
    // Formato esperado: db_cluster-DD-MM-YYYY@HH-MM-SS.backup.gz
    const fileName = path.basename(sourceFile);
    const match = fileName.match(/db_cluster-(\d{2})-(\d{2})-(\d{4})@(\d{2})-(\d{2})-(\d{2})\.backup(\.gz)?/);
    
    if (!match) {
      console.error(chalk.red(`❌ ${getT('import.invalidFileName')}`));
      console.log(chalk.yellow(`💡 ${getT('import.expectedFormat')}`));
      console.log(chalk.white(`   ${getT('import.fileReceived', { fileName })}`));
      process.exit(1);
    }

    const [, day, month, year, hour, minute, second] = match;
    
    // Criar nome da pasta no formato backup-YYYY-MM-DD-HH-MM-SS
    const backupDirName = `backup-${year}-${month}-${day}-${hour}-${minute}-${second}`;
    const backupDir = path.join(outputDir, backupDirName);
    
    // Criar diretório de backup
    await ensureDir(backupDir);
    console.log(chalk.blue(`📁 Criando diretório de backup: ${backupDirName}`));
    
    // Copiar arquivo de backup para o diretório de backup
    const destFile = path.join(backupDir, fileName);
    await fs.copyFile(sourceFile, destFile);
    
    // Obter tamanho do arquivo de backup
    const stats = await fs.stat(destFile);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    console.log(chalk.green(`✅ ${getT('import.success')}`));
    console.log(chalk.blue(`📦 Backup: ${fileName} (${sizeMB} MB)`));
    
    // Copiar arquivo de storage se fornecido
    if (sourceStorageFile) {
      const storageFileName = path.basename(sourceStorageFile);
      const destStorageFile = path.join(backupDir, storageFileName);
      await fs.copyFile(sourceStorageFile, destStorageFile);
      
      const storageStats = await fs.stat(destStorageFile);
      const storageSizeMB = (storageStats.size / (1024 * 1024)).toFixed(2);
      
      console.log(chalk.green(`✅ ${getT('import.storageSuccess')}`));
      console.log(chalk.blue(`📦 Storage: ${storageFileName} (${storageSizeMB} MB)`));
    }
    
    console.log(chalk.blue(`📁 Localização: ${backupDir}`));
    console.log(chalk.cyan(`\n💡 ${getT('import.nextStep')}`));
    
  } catch (error) {
    const getT = global.smoonbI18n?.t || t;
    console.error(chalk.red(`❌ ${getT('error.generic')}: ${error.message}`));
    process.exit(1);
  }
};

