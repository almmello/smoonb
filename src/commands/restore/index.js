const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { readEnvFile, writeEnvFile, backupEnvFile } = require('../../utils/env');
const { saveEnvMap } = require('../../utils/envMap');
const { mapEnvVariablesInteractively } = require('../../interactive/envMapper');
const { showBetaBanner } = require('../../utils/banner');
const { listValidBackups, showRestoreSummary } = require('./utils');
const { confirm } = require('../../utils/prompt');
const { ensureDir } = require('../../utils/fsx');
const step00DockerValidation = require('../backup/steps/00-docker-validation');

// Importar todas as etapas
const step00BackupSelection = require('./steps/00-backup-selection');
const step01ComponentsSelection = require('./steps/01-components-selection');
const step03Database = require('./steps/03-database');
const step04EdgeFunctions = require('./steps/04-edge-functions');
const step05AuthSettings = require('./steps/05-auth-settings');
const step06Storage = require('./steps/06-storage');
const step07DatabaseSettings = require('./steps/07-database-settings');
const step08RealtimeSettings = require('./steps/08-realtime-settings');

/**
 * Função auxiliar para importar arquivo de backup e storage (reutiliza lógica do comando import)
 */
async function importBackupFile(sourceFile, sourceStorageFile, outputDir) {
  const { t } = require('../../i18n');
  const getT = global.smoonbI18n?.t || t;
  
  // Validar arquivo de backup
  try {
    await fsPromises.access(sourceFile);
  } catch {
    throw new Error(getT('restore.import.fileNotFound', { path: sourceFile }));
  }

  // Verificar se é um arquivo .backup.gz ou .backup
  if (!sourceFile.endsWith('.backup.gz') && !sourceFile.endsWith('.backup')) {
    throw new Error(getT('restore.import.invalidFormat'));
  }

  // Validar arquivo de storage se fornecido
  if (sourceStorageFile) {
    try {
      await fsPromises.access(sourceStorageFile);
    } catch {
      throw new Error(getT('restore.import.storageNotFound', { path: sourceStorageFile }));
    }

    // Verificar se é um arquivo .storage.zip
    if (!sourceStorageFile.endsWith('.storage.zip')) {
      throw new Error(getT('restore.import.storageInvalidFormat'));
    }
  }

  // Extrair informações do nome do arquivo de backup
  // Formato esperado: db_cluster-DD-MM-YYYY@HH-MM-SS.backup.gz
  const fileName = path.basename(sourceFile);
  const match = fileName.match(/db_cluster-(\d{2})-(\d{2})-(\d{4})@(\d{2})-(\d{2})-(\d{2})\.backup(\.gz)?/);
  
  if (!match) {
    throw new Error(getT('restore.import.invalidFileName'));
  }

  const [, day, month, year, hour, minute, second] = match;
  
  // Criar nome da pasta no formato backup-YYYY-MM-DD-HH-MM-SS
  const backupDirName = `backup-${year}-${month}-${day}-${hour}-${minute}-${second}`;
  const backupDir = path.join(outputDir, backupDirName);
  
  // Criar diretório de backup
  await ensureDir(backupDir);
  console.log(chalk.blue(`📁 ${getT('restore.import.importing', { name: backupDirName })}`));
  
  // Copiar arquivo de backup para o diretório de backup
  const destFile = path.join(backupDir, fileName);
  await fsPromises.copyFile(sourceFile, destFile);
  
  // Obter tamanho do arquivo de backup
  const stats = await fsPromises.stat(destFile);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  
  console.log(chalk.green(`✅ ${getT('restore.import.backupImported', { fileName, size: sizeMB })}`));
  
  // Copiar arquivo de storage se fornecido
  if (sourceStorageFile) {
    const storageFileName = path.basename(sourceStorageFile);
    const destStorageFile = path.join(backupDir, storageFileName);
    await fsPromises.copyFile(sourceStorageFile, destStorageFile);
    
    const storageStats = await fsPromises.stat(destStorageFile);
    const storageSizeMB = (storageStats.size / (1024 * 1024)).toFixed(2);
    
    console.log(chalk.green(`✅ ${getT('restore.import.storageImported', { fileName: storageFileName, size: storageSizeMB })}`));
  }
  
  return backupDir;
}

module.exports = async (options) => {
  showBetaBanner();
  
  try {
    const { t } = require('../../i18n');
    const getT = global.smoonbI18n?.t || t;
    
    // Termo de uso e aviso de risco
    console.log(chalk.yellow.bold(`\n⚠️  ${getT('disclaimer.title')}\n`));
    console.log(chalk.white(`${getT('disclaimer.text')}\n`));
    console.log(chalk.white(`${getT('disclaimer.limitation')}\n`));
    
    const termsAccepted = await confirm(getT('disclaimer.acceptRestore'), true);
    if (!termsAccepted) {
      console.log(chalk.red(`🚫 ${getT('disclaimer.operationCancelled')}`));
      process.exit(1);
    }

    // Executar validação Docker ANTES de tudo
    await step00DockerValidation();

    // Consentimento para leitura e escrita do .env.local
    console.log(chalk.yellow(`\n⚠️  ${getT('consent.title')}`));
    console.log(chalk.yellow(`   ${getT('consent.backup')}`));
    console.log(chalk.yellow(`   ${getT('consent.mapping')}`));
    const consentOk = await confirm(getT('consent.proceed'), true);
    if (!consentOk) {
      console.log(chalk.red(`🚫 ${getT('disclaimer.operationCancelled')}`));
      process.exit(1);
    }

    // Preparar diretório de processo restore-YYYY-...
    const rootBackupsDir = path.join(process.cwd(), 'backups');
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}`;
    const processDir = path.join(rootBackupsDir, `restore-${ts}`);
    fs.mkdirSync(path.join(processDir, 'env'), { recursive: true });

    // Backup do .env.local
    const envPath = path.join(process.cwd(), '.env.local');
    const envBackupPath = path.join(processDir, 'env', '.env.local');
    
    // Verificar se o arquivo existe antes de fazer backup
    try {
      await fsPromises.access(envPath);
      await backupEnvFile(envPath, envBackupPath);
      console.log(chalk.blue(`📁 ${getT('restore.import.envBackup', { path: path.relative(process.cwd(), envBackupPath) })}`));
    } catch {
      // Arquivo não existe, não fazer backup
      console.log(chalk.yellow(getT('restore.import.envNotFound')));
    }

    // Leitura e mapeamento interativo
    const currentEnv = await readEnvFile(envPath);
    const expectedKeys = [
      'SUPABASE_PROJECT_ID',
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_DB_URL',
      'SUPABASE_ACCESS_TOKEN',
      'SMOONB_OUTPUT_DIR'
    ];
    const { finalEnv, dePara } = await mapEnvVariablesInteractively(currentEnv, expectedKeys);
    await writeEnvFile(envPath, finalEnv);
    await saveEnvMap(dePara, path.join(processDir, 'env', 'env-map.json'));
    console.log(chalk.green(`✅ ${getT('restore.index.envUpdated')}`));

    // Resolver valores esperados a partir do de-para
    function getValue(expectedKey) {
      const clientKey = Object.keys(dePara).find(k => dePara[k] === expectedKey);
      return clientKey ? finalEnv[clientKey] : '';
    }

    // Construir targetProject a partir do .env.local mapeado
    const targetProject = {
      targetProjectId: getValue('SUPABASE_PROJECT_ID'),
      targetUrl: getValue('NEXT_PUBLIC_SUPABASE_URL'),
      targetAnonKey: getValue('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      targetServiceKey: getValue('SUPABASE_SERVICE_ROLE_KEY'),
      targetDatabaseUrl: getValue('SUPABASE_DB_URL'),
      targetAccessToken: getValue('SUPABASE_ACCESS_TOKEN')
    };
    
    const outputDir = getValue('SMOONB_OUTPUT_DIR') || './backups';
    let selectedBackup = null;
    
    // Se --file foi fornecido, importar o arquivo e auto-selecionar
    if (options.file) {
      const sourceFile = path.resolve(options.file);
      const sourceStorageFile = options.storage ? path.resolve(options.storage) : null;
      
      console.log(chalk.blue(`📁 ${getT('restore.import.importingFile')}`));
      const importedBackupDir = await importBackupFile(sourceFile, sourceStorageFile, outputDir);
      
      // Listar backups válidos para encontrar o backup importado
      const validBackups = await listValidBackups(outputDir);
      selectedBackup = validBackups.find(b => b.path === importedBackupDir);
      
      if (!selectedBackup) {
        throw new Error(getT('restore.import.cannotFind'));
      }
      
      console.log(chalk.green(`✅ ${getT('restore.import.importedSelected', { name: path.basename(selectedBackup.path) })}`));
    } else {
      // Fluxo normal: listar e selecionar backup interativamente
      console.log(chalk.blue(`📁 ${getT('restore.index.searchingBackups', { path: outputDir })}`));
      
      // 1. Listar backups válidos (.backup.gz)
      const validBackups = await listValidBackups(outputDir);
      
      if (validBackups.length === 0) {
        console.error(chalk.red(`❌ ${getT('restore.index.noBackupsFound')}`));
        console.log(chalk.yellow(`💡 ${getT('restore.index.runBackupFirst')}`));
        process.exit(1);
      }
      
      // 2. Selecionar backup interativamente
      selectedBackup = await step00BackupSelection(validBackups);
    }
    
    // 3. Perguntar quais componentes restaurar
    const components = await step01ComponentsSelection(selectedBackup.path);
    
    // Validar que pelo menos um componente foi selecionado
    if (!Object.values(components).some(Boolean)) {
      console.error(chalk.red(getT('restore.import.noComponents')));
      process.exit(1);
    }
    
    // 4. Mostrar resumo detalhado
    console.log(chalk.cyan(`\n📋 ${getT('restore.index.summaryTitle')}\n`));
    console.log(chalk.white(`   📁 ${getT('restore.index.selectedBackup', { name: path.basename(selectedBackup.path) })}`));
    console.log(chalk.white(`   🎯 ${getT('restore.index.targetProject', { projectId: targetProject.targetProjectId || getT('restore.index.notConfigured') })}`));
    console.log(chalk.white(`   📊 ${getT('restore.index.database', { value: components.database ? getT('restore.index.yes') : getT('restore.index.no') })}`));
    console.log(chalk.white(`   ⚡ ${getT('restore.index.edgeFunctions', { value: components.edgeFunctions ? getT('restore.index.yes') : getT('restore.index.no') })}`));
    console.log(chalk.white(`   🔐 ${getT('restore.index.authSettings', { value: components.authSettings ? getT('restore.index.yes') : getT('restore.index.no') })}`));
    console.log(chalk.white(`   📦 ${getT('restore.index.storage', { value: components.storage ? getT('restore.index.yes') : getT('restore.index.no') })}`));
    console.log(chalk.white(`   🔧 ${getT('restore.index.databaseSettings', { value: components.databaseSettings ? getT('restore.index.yes') : getT('restore.index.no') })}`));
    console.log(chalk.white(`   🔄 ${getT('restore.index.realtimeSettings', { value: components.realtimeSettings ? getT('restore.index.yes') : getT('restore.index.no') })}\n`));
    
    // Mostrar resumo técnico adicional
    showRestoreSummary(selectedBackup, components, targetProject);
    
    // 5. Confirmar execução
    const finalOk = await confirm(getT('restore.index.confirmRestore'), true);
    if (!finalOk) {
      console.log(chalk.yellow(`🚫 ${getT('restore.index.restoreCancelled')}`));
      process.exit(0);
    }
    
    // 6. Executar restauração
    console.log(chalk.blue(`\n🚀 ${getT('restore.index.startingRestore')}`));
    
    // Contar etapas totais para numeração dinâmica
    let stepNumber = 0;
    const totalSteps = (components.database ? 1 : 0) + 
                      (components.edgeFunctions ? 1 : 0) + 
                      (components.authSettings ? 1 : 0) + 
                      (components.storage ? 1 : 0) + 
                      (components.databaseSettings ? 1 : 0) + 
                      (components.realtimeSettings ? 1 : 0);
    
    // Armazenar resultados para o resumo final
    const restoreResults = {};
    
    // 6.1 Database (se selecionado)
    if (components.database) {
      stepNumber++;
      console.log(chalk.blue(`\n📊 ${stepNumber}/${totalSteps} - ${getT('restore.index.restoringDatabase')}`));
      await step03Database({
        backupFilePath: path.join(selectedBackup.path, selectedBackup.backupFile),
        targetDatabaseUrl: targetProject.targetDatabaseUrl
      });
      restoreResults.database = { success: true };
    }
    
    // 6.2 Edge Functions (se selecionado)
    if (components.edgeFunctions) {
      stepNumber++;
      console.log(chalk.blue(`\n⚡ ${stepNumber}/${totalSteps} - ${getT('restore.index.restoringEdgeFunctions')}`));
      const edgeFunctionsResult = await step04EdgeFunctions({
        backupPath: selectedBackup.path,
        targetProject
      });
      restoreResults.edgeFunctions = edgeFunctionsResult || { success: true };
    }
    
    // 6.3 Auth Settings (se selecionado)
    if (components.authSettings) {
      stepNumber++;
      console.log(chalk.blue(`\n🔐 ${stepNumber}/${totalSteps} - ${getT('restore.index.restoringAuthSettings')}`));
      await step05AuthSettings({
        backupPath: selectedBackup.path,
        targetProject
      });
      restoreResults.authSettings = { success: true };
    }
    
    // 6.4 Storage Buckets (se selecionado)
    if (components.storage) {
      stepNumber++;
      console.log(chalk.blue(`\n📦 ${stepNumber}/${totalSteps} - ${getT('restore.index.restoringStorageBuckets')}`));
      const storageResult = await step06Storage({
        backupPath: selectedBackup.path,
        targetProject
      });
      restoreResults.storage = storageResult || { success: true };
    }
    
    // 6.5 Database Settings (se selecionado)
    if (components.databaseSettings) {
      stepNumber++;
      console.log(chalk.blue(`\n🔧 ${stepNumber}/${totalSteps} - ${getT('restore.index.restoringDatabaseSettings')}`));
      await step07DatabaseSettings({
        backupPath: selectedBackup.path,
        targetProject
      });
      restoreResults.databaseSettings = { success: true };
    }
    
    // 6.6 Realtime Settings (se selecionado)
    if (components.realtimeSettings) {
      stepNumber++;
      console.log(chalk.blue(`\n🔄 ${stepNumber}/${totalSteps} - ${getT('restore.index.restoringRealtimeSettings')}`));
      await step08RealtimeSettings({
        backupPath: selectedBackup.path,
        targetProject
      });
      restoreResults.realtimeSettings = { success: true };
    }
    
    // report.json de restauração
    const report = {
      process: 'restore',
      created_at: new Date().toISOString(),
      target_project_id: targetProject.targetProjectId,
      assets: {
        env: path.join(processDir, 'env', '.env.local'),
        env_map: path.join(processDir, 'env', 'env-map.json')
      },
      components: components,
      results: restoreResults,
      notes: [
        'supabase/functions limpo antes e depois do deploy (se Edge Functions selecionado)'
      ]
    };
    try {
      fs.writeFileSync(path.join(processDir, 'report.json'), JSON.stringify(report, null, 2));
    } catch {
      // silencioso
    }

    // Exibir resumo final
    console.log(chalk.green(`\n🎉 ${getT('restore.index.restoreComplete')}`));
    console.log(chalk.blue(`🎯 ${getT('restore.index.targetProjectFinal', { projectId: targetProject.targetProjectId || getT('restore.index.notConfigured') })}`));
    
    if (restoreResults.database) {
      console.log(chalk.green(`📊 ${getT('restore.index.databaseRestored')}`));
    }
    
    if (restoreResults.edgeFunctions) {
      const funcCount = restoreResults.edgeFunctions.functions_count || 0;
      const successCount = restoreResults.edgeFunctions.success_count || 0;
      console.log(chalk.green(`⚡ ${getT('restore.index.edgeFunctionsRestored', { success: successCount, total: funcCount })}`));
    }
    
    if (restoreResults.authSettings) {
      console.log(chalk.green(`🔐 ${getT('restore.index.authSettingsRestored')}`));
    }
    
    if (restoreResults.storage) {
      const bucketCount = restoreResults.storage.buckets_count || 0;
      const filesRestored = restoreResults.storage.files_restored;
      const totalFiles = restoreResults.storage.total_files || 0;
      
      if (filesRestored) {
        console.log(chalk.green(`📦 ${getT('restore.index.storageRestored', { buckets: bucketCount, files: totalFiles })}`));
      } else {
        console.log(chalk.green(`📦 ${getT('restore.index.storageMetadataOnly', { buckets: bucketCount })}`));
      }
    }
    
    if (restoreResults.databaseSettings) {
      console.log(chalk.green(`🔧 ${getT('restore.index.databaseSettingsRestored')}`));
    }
    
    if (restoreResults.realtimeSettings) {
      console.log(chalk.green(`🔄 ${getT('restore.index.realtimeSettingsRestored')}`));
    }
    
  } catch (error) {
    const { t } = require('../../i18n');
    const getT = global.smoonbI18n?.t || t;
    console.error(chalk.red(`❌ ${getT('restore.index.error', { message: error.message })}`));
    process.exit(1);
  }
};

