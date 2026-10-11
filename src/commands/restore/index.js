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

const { runRestore } = require('./runner');

// Importar todas as etapas
const step00BackupSelection = require('./steps/00-backup-selection');
const step01ComponentsSelection = require('./steps/01-components-selection');
const { sendTelemetry } = require('../../telemetry');

module.exports = async (options = {}) => {
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
    await step01DockerValidation({ skipSupabaseVersionCheck: !!(options && options.skipSupabaseVersionCheck) });

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

    const remapUrls = await confirm(getT('restore.verified.remapUrls'), true);
    const restoreResults = await runRestore({ selectedBackup, components, targetProject, processDir, postgresMajor:parsedMajor, remapUrls });

    // Exibir resumo final
    if (Object.values(restoreResults).some(result => !result.verified))
      ui.warn(`\n${getT('restore.index.restoreCompleteWithNotes')}`);
    else
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
      if (restoreResults.authSettings.verified)
        ui.success(`🔐 ${getT('restore.index.authSettingsRestored')}`);
      else
        ui.warn(getT('restore.smtp.accepted'));
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
      if (restoreResults.realtimeSettings.verified)
        ui.success(`🔄 ${getT('restore.index.realtimeSettingsRestored')}`);
      else
        ui.warn(getT('restore.realtime.accepted'));
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

