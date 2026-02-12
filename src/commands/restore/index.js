const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { readEnvFile, writeEnvFile, backupEnvFile } = require('../../utils/env');
const { saveEnvMap } = require('../../utils/envMap');
const { mapEnvVariablesInteractively, printSupabasePostgresMajorHintOnce } = require('../../interactive/envMapper');
const { showBetaBanner } = require('../../utils/banner');
const { listValidBackups, showRestoreSummary } = require('./utils');
const { confirm } = require('../../utils/prompt');
const ui = require('../../utils/cliUi');
const { isPostgresMajorSupported } = require('../backup/utils');
const step00License = require('../backup/steps/00-license');
const step01DockerValidation = require('../backup/steps/01-docker-validation');

const SUPABASE_RESTORE_DOC_URL = 'https://supabase.com/docs/guides/platform/migrating-within-supabase/dashboard-restore';

// Importar todas as etapas
const step00BackupSelection = require('./steps/00-backup-selection');
const step01ComponentsSelection = require('./steps/01-components-selection');
const step03Database = require('./steps/03-database');
const step04EdgeFunctions = require('./steps/04-edge-functions');
const step05AuthSettings = require('./steps/05-auth-settings');
const step06Storage = require('./steps/06-storage');
const step07DatabaseSettings = require('./steps/07-database-settings');
const step08RealtimeSettings = require('./steps/08-realtime-settings');
const { sendTelemetry } = require('../../telemetry');

module.exports = async () => {
  showBetaBanner();
  const restoreStartTime = Date.now();
  let telemetryEnabled = (process.env.SMOONB_TELEMETRY_ENABLED || 'true') !== 'false';

  try {
    const { t } = require('../../i18n');
    const getT = global.smoonbI18n?.t || t;

    // Termo de uso e aviso de risco
    ui.warn(`\n⚠️  ${getT('disclaimer.title')}\n`);
    ui.info(`${getT('disclaimer.text')}\n`);
    ui.info(`${getT('disclaimer.limitation')}\n`);

    const termsAccepted = await confirm(getT('disclaimer.acceptRestore'), true);
    if (!termsAccepted) {
      ui.error(`🚫 ${getT('disclaimer.operationCancelled')}`);
      process.exit(1);
    }

    const envPathForLicense = path.join(process.cwd(), '.env.local');
    await step00License({ envPath: envPathForLicense, command: 'restore' });

    // Executar validação Docker
    await step01DockerValidation();

    // Consentimento para leitura e escrita do .env.local
    ui.warn(`\n⚠️  ${getT('consent.title')}`);
    ui.warn(`   ${getT('consent.backup')}`);
    ui.warn(`   ${getT('consent.mapping')}`);
    const consentOk = await confirm(getT('consent.proceed'), true);
    if (!consentOk) {
      ui.error(`🚫 ${getT('disclaimer.operationCancelled')}`);
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
      ui.step(`📁 ${getT('restore.import.envBackup', { path: path.relative(process.cwd(), envBackupPath) })}`);
    } catch {
      ui.warn(getT('restore.import.envNotFound'));
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
      'SUPABASE_POSTGRES_MAJOR',
      'SMOONB_OUTPUT_DIR',
      'SMOONB_TELEMETRY_ENABLED'
    ];
    const { finalEnv, dePara } = await mapEnvVariablesInteractively(currentEnv, expectedKeys);
    await writeEnvFile(envPath, finalEnv);
    await saveEnvMap(dePara, path.join(processDir, 'env', 'env-map.json'));
    ui.success(`✅ ${getT('restore.index.envUpdated')}`);

    // Resolver valores esperados a partir do de-para
    function getValue(expectedKey) {
      const clientKey = Object.keys(dePara).find(k => dePara[k] === expectedKey);
      return clientKey ? finalEnv[clientKey] : '';
    }
    telemetryEnabled = (getValue('SMOONB_TELEMETRY_ENABLED') || 'true') !== 'false';

    // Validar SUPABASE_POSTGRES_MAJOR (alinhado ao backup)
    const postgresMajorRaw = (getValue('SUPABASE_POSTGRES_MAJOR') || process.env.SUPABASE_POSTGRES_MAJOR || '').toString().trim();
    if (!postgresMajorRaw) {
      ui.error(`❌ ${getT('backup.error.postgresMajorNotSet')}`);
      ui.info(`   ${getT('backup.error.postgresMajorInstructions')}`);
      printSupabasePostgresMajorHintOnce(getT);
      process.exit(1);
    }
    const parsedMajor = parseInt(postgresMajorRaw, 10);
    if (Number.isNaN(parsedMajor) || !isPostgresMajorSupported(parsedMajor, true)) {
      ui.error(`❌ ${getT('backup.error.postgresMajorInvalid')}`);
      ui.info(`   ${getT('backup.error.postgresMajorInstructions')}`);
      printSupabasePostgresMajorHintOnce(getT);
      process.exit(1);
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

    ui.step(`📁 ${getT('restore.index.searchingBackups', { path: outputDir })}`);

    const validBackups = await listValidBackups(outputDir);

    if (validBackups.length === 0) {
      ui.error(`❌ ${getT('restore.index.noBackupsFound')}`);
      ui.warn(`💡 ${getT('restore.index.runBackupFirst')}`);
      process.exit(1);
    }

    const selectedBackup = await step00BackupSelection(validBackups);
    
    // 3. Perguntar quais componentes restaurar
    const components = await step01ComponentsSelection(selectedBackup.path);
    
    // Validar que pelo menos um componente foi selecionado
    if (!Object.values(components).some(Boolean)) {
      ui.error(getT('restore.import.noComponents'));
      process.exit(1);
    }
    
    // 4. Mostrar resumo detalhado
    ui.title(`\n📋 ${getT('restore.index.summaryTitle')}\n`);
    ui.info(`   📁 ${getT('restore.index.selectedBackup', { name: path.basename(selectedBackup.path) })}`);
    ui.info(`   🎯 ${getT('restore.index.targetProject', { projectId: targetProject.targetProjectId || getT('restore.index.notConfigured') })}`);
    ui.info(`   📊 ${getT('restore.index.database', { value: components.database ? getT('restore.index.yes') : getT('restore.index.no') })}`);
    ui.info(`   ⚡ ${getT('restore.index.edgeFunctions', { value: components.edgeFunctions ? getT('restore.index.yes') : getT('restore.index.no') })}`);
    ui.info(`   🔐 ${getT('restore.index.authSettings', { value: components.authSettings ? getT('restore.index.yes') : getT('restore.index.no') })}`);
    ui.info(`   📦 ${getT('restore.index.storage', { value: components.storage ? getT('restore.index.yes') : getT('restore.index.no') })}`);
    ui.info(`   🔧 ${getT('restore.index.databaseSettings', { value: components.databaseSettings ? getT('restore.index.yes') : getT('restore.index.no') })}`);
    ui.info(`   🔄 ${getT('restore.index.realtimeSettings', { value: components.realtimeSettings ? getT('restore.index.yes') : getT('restore.index.no') })}\n`);
    
    // Mostrar resumo técnico adicional
    showRestoreSummary(selectedBackup, components, targetProject);
    
    // 5. Confirmar execução
    const finalOk = await confirm(getT('restore.index.confirmRestore'), true);
    if (!finalOk) {
      ui.warn(`🚫 ${getT('restore.index.restoreCancelled')}`);
      process.exit(0);
    }

    // 5.1 Disclaimer: erros esperados durante restore (destacado)
    ui.errorBold(`\n⚠️  ${getT('restore.disclaimer.errorsTitle')}\n`);
    ui.info(`   ${getT('restore.disclaimer.errorsIntro')}`);
    ui.info(`   ${getT('restore.disclaimer.errorsReason')}`);
    ui.info('');
    ui.info(`   ${getT('restore.disclaimer.supabaseDoc')}`);
    ui.link(`   ${SUPABASE_RESTORE_DOC_URL}`);
    ui.info('');
    ui.warn(`   ${getT('restore.disclaimer.waitComplete')}`);
    ui.warn(`   ${getT('restore.disclaimer.testResult')}`);
    ui.info('');
    const acceptErrors = await confirm(getT('restore.disclaimer.acceptProceed'), true);
    if (!acceptErrors) {
      ui.warn(`🚫 ${getT('restore.index.restoreCancelled')}`);
      process.exit(0);
    }

    // 6. Executar restauração
    ui.step(`\n🚀 ${getT('restore.index.startingRestore')}`);
    
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
      ui.step(`\n📊 ${stepNumber}/${totalSteps} - ${getT('restore.index.restoringDatabase')}`);
      await step03Database({
        backupFilePath: path.join(selectedBackup.path, selectedBackup.backupFile),
        targetDatabaseUrl: targetProject.targetDatabaseUrl
      });
      restoreResults.database = { success: true };
    }
    
    // 6.2 Edge Functions (se selecionado)
    if (components.edgeFunctions) {
      stepNumber++;
      ui.step(`\n⚡ ${stepNumber}/${totalSteps} - ${getT('restore.index.restoringEdgeFunctions')}`);
      const edgeFunctionsResult = await step04EdgeFunctions({
        backupPath: selectedBackup.path,
        targetProject
      });
      restoreResults.edgeFunctions = edgeFunctionsResult || { success: true };
    }
    
    // 6.3 Auth Settings (se selecionado)
    if (components.authSettings) {
      stepNumber++;
      ui.step(`\n🔐 ${stepNumber}/${totalSteps} - ${getT('restore.index.restoringAuthSettings')}`);
      await step05AuthSettings({
        backupPath: selectedBackup.path,
        targetProject
      });
      restoreResults.authSettings = { success: true };
    }
    
    // 6.4 Storage Buckets (se selecionado)
    if (components.storage) {
      stepNumber++;
      ui.step(`\n📦 ${stepNumber}/${totalSteps} - ${getT('restore.index.restoringStorageBuckets')}`);
      const storageResult = await step06Storage({
        backupPath: selectedBackup.path,
        targetProject
      });
      restoreResults.storage = storageResult || { success: true };
    }
    
    // 6.5 Database Settings (se selecionado)
    if (components.databaseSettings) {
      stepNumber++;
      ui.step(`\n🔧 ${stepNumber}/${totalSteps} - ${getT('restore.index.restoringDatabaseSettings')}`);
      await step07DatabaseSettings({
        backupPath: selectedBackup.path,
        targetProject
      });
      restoreResults.databaseSettings = { success: true };
    }
    
    // 6.6 Realtime Settings (se selecionado)
    if (components.realtimeSettings) {
      stepNumber++;
      ui.step(`\n🔄 ${stepNumber}/${totalSteps} - ${getT('restore.index.restoringRealtimeSettings')}`);
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
    ui.success(`\n🎉 ${getT('restore.index.restoreComplete')}`);
    ui.link(`🎯 ${getT('restore.index.targetProjectFinal', { projectId: targetProject.targetProjectId || getT('restore.index.notConfigured') })}`);

    if (restoreResults.database) {
      ui.success(`📊 ${getT('restore.index.databaseRestored')}`);
    }

    if (restoreResults.edgeFunctions) {
      const funcCount = restoreResults.edgeFunctions.functions_count || 0;
      const successCount = restoreResults.edgeFunctions.success_count || 0;
      ui.success(`⚡ ${getT('restore.index.edgeFunctionsRestored', { success: successCount, total: funcCount })}`);
    }

    if (restoreResults.authSettings) {
      ui.success(`🔐 ${getT('restore.index.authSettingsRestored')}`);
    }

    if (restoreResults.storage) {
      const bucketCount = restoreResults.storage.buckets_count || 0;
      const filesRestored = restoreResults.storage.files_restored;
      const totalFiles = restoreResults.storage.total_files || 0;

      if (filesRestored) {
        ui.success(`📦 ${getT('restore.index.storageRestored', { buckets: bucketCount, files: totalFiles })}`);
      } else {
        ui.success(`📦 ${getT('restore.index.storageMetadataOnly', { buckets: bucketCount })}`);
      }
    }

    if (restoreResults.databaseSettings) {
      ui.success(`🔧 ${getT('restore.index.databaseSettingsRestored')}`);
    }

    if (restoreResults.realtimeSettings) {
      ui.success(`🔄 ${getT('restore.index.realtimeSettingsRestored')}`);
    }

    sendTelemetry({
      enabled: telemetryEnabled,
      command: 'restore',
      durationMs: Date.now() - restoreStartTime,
      success: true
    });
  } catch (error) {
    sendTelemetry({
      enabled: telemetryEnabled,
      command: 'restore',
      durationMs: Date.now() - restoreStartTime,
      success: false,
      errorCode: 'error'
    });
    const { t } = require('../../i18n');
    const getT = global.smoonbI18n?.t || t;
    ui.error(`❌ ${getT('restore.index.error', { message: error.message })}`);
    process.exit(1);
  }
};

