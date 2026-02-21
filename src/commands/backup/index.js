const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const { ensureDir, writeJson } = require('../../utils/fsx');
const { showBetaBanner } = require('../../utils/banner');
const { getDockerVersion } = require('../../utils/docker');
const { readEnvFile, writeEnvFile, backupEnvFile } = require('../../utils/env');
const { saveEnvMap } = require('../../utils/envMap');
const { mapEnvVariablesInteractively, askComponentsFlags, printSupabasePostgresMajorHintOnce } = require('../../interactive/envMapper');
const { confirm } = require('../../utils/prompt');
const { isPostgresMajorSupported } = require('./utils');

// Importar etapas (00 = License; 01 = Docker; 02..11 = backup)
const step00License = require('./steps/00-license');
const step01DockerValidation = require('./steps/01-docker-validation');
const step02Database = require('./steps/02-database');
const step03DatabaseSeparated = require('./steps/03-database-separated');
const step04DatabaseSettings = require('./steps/04-database-settings');
const step05AuthSettings = require('./steps/05-auth-settings');
const step06RealtimeSettings = require('./steps/06-realtime-settings');
const step07Storage = require('./steps/07-storage');
const step08CustomRoles = require('./steps/08-custom-roles');
const step09EdgeFunctions = require('./steps/09-edge-functions');
const step10SupabaseTemp = require('./steps/10-supabase-temp');
const step11Migrations = require('./steps/11-migrations');
const { sendTelemetry } = require('../../telemetry');
const ui = require('../../utils/cliUi');

// Exportar FUNÇÃO em vez de objeto Command
module.exports = async (options) => {
  showBetaBanner();
  const backupStartTime = Date.now();
  let telemetryEnabled = (process.env.SMOONB_TELEMETRY_ENABLED || 'true') !== 'false';

  try {
    const { t } = require('../../i18n');
    const getT = global.smoonbI18n?.t || t;

    // Termo de uso e aviso de risco
    console.log(chalk.yellow.bold(`\n⚠️  ${getT('disclaimer.title')}\n`));
    console.log(chalk.white(`${getT('disclaimer.text')}\n`));
    console.log(chalk.white(`${getT('disclaimer.limitation')}\n`));
    
    const termsAccepted = await confirm(getT('disclaimer.acceptBackup'), true);
    if (!termsAccepted) {
      console.log(chalk.red(`🚫 ${getT('disclaimer.operationCancelled')}`));
      process.exit(1);
    }

    const envPath = path.join(process.cwd(), '.env.local');
    const licenseResult = await step00License({ envPath, command: 'backup' });

    // Executar validação Docker
    await step01DockerValidation({ skipSupabaseVersionCheck: !!(options && options.skipSupabaseVersionCheck) });

    // Consentimento para leitura e escrita do .env.local
    console.log(chalk.yellow(`\n⚠️  ${getT('consent.title')}`));
    console.log(chalk.yellow(`   ${getT('consent.backup')}`));
    console.log(chalk.yellow(`   ${getT('consent.mapping')}`));
    const consentOk = await confirm(getT('consent.proceed'), true);
    if (!consentOk) {
      console.log(chalk.red(`🚫 ${getT('disclaimer.operationCancelled')}`));
      process.exit(1);
    }

    // Diretório de backup padrão
    const defaultOutputDir = './backups';

    // Pré-passo de ENV: criar diretório de backup com timestamp já no início
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');

    // Resolver diretório de saída
    const backupDir = path.join(defaultOutputDir, `backup-${year}-${month}-${day}-${hour}-${minute}-${second}`);
    await ensureDir(backupDir);

    // Backup e mapeamento do .env.local
    const envBackupPath = path.join(backupDir, 'env', '.env.local');
    await ensureDir(path.dirname(envBackupPath));
    
    // Verificar se o arquivo existe antes de fazer backup
    try {
      await fs.access(envPath);
      await backupEnvFile(envPath, envBackupPath);
      console.log(chalk.blue(`📁 ${getT('env.mapping.backupCreated', { path: path.relative(process.cwd(), envBackupPath) })}`));
    } catch {
      // Arquivo não existe, não fazer backup
      console.log(chalk.yellow(`⚠️  ${getT('env.mapping.fileNotFound')}`));
    }

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
    const currentEnv = await readEnvFile(envPath);
    const { finalEnv, dePara } = await mapEnvVariablesInteractively(currentEnv, expectedKeys);
    await writeEnvFile(envPath, finalEnv);
    await saveEnvMap(dePara, path.join(backupDir, 'env', 'env-map.json'));
    console.log(chalk.green(`✅ ${getT('env.mapping.updated')}`));

    function getValue(expectedKey) {
      const clientKey = Object.keys(dePara).find(k => dePara[k] === expectedKey);
      return clientKey ? finalEnv[clientKey] : '';
    }
    telemetryEnabled = (getValue('SMOONB_TELEMETRY_ENABLED') || 'true') !== 'false';

    // Recalcular outputDir a partir do ENV mapeado
    const resolvedOutputDir = getValue('SMOONB_OUTPUT_DIR') || defaultOutputDir;

    // Se mudou o outputDir, movemos o backupDir inicial para o novo local mantendo timestamp
    const finalBackupDir = backupDir.startsWith(path.resolve(resolvedOutputDir))
      ? backupDir
      : path.join(resolvedOutputDir, path.basename(backupDir));
    if (finalBackupDir !== backupDir) {
      await ensureDir(resolvedOutputDir);
      await fs.rename(backupDir, finalBackupDir);
    }

    const projectId = getValue('SUPABASE_PROJECT_ID');
    const accessToken = getValue('SUPABASE_ACCESS_TOKEN');
    const databaseUrl = getValue('SUPABASE_DB_URL');
    const supabaseUrl = getValue('NEXT_PUBLIC_SUPABASE_URL');
    const supabaseServiceKey = getValue('SUPABASE_SERVICE_ROLE_KEY');

    if (!databaseUrl) {
      console.log(chalk.red(`❌ ${getT('backup.error.databaseUrlNotConfigured')}`));
      console.log('');
      console.log(chalk.yellow(`📋 ${getT('backup.error.databaseUrlInstructions')}`));
      console.log(chalk.yellow(`   1. ${getT('backup.error.databaseUrlStep1')}`));
      console.log(chalk.yellow(`   2. ${getT('backup.error.databaseUrlStep2')}`));
      console.log('');
      console.log(chalk.blue(`💡 ${getT('backup.error.databaseUrlExample')}:`));
      ui.hint(`   ${getT('backup.error.databaseUrlExampleValue')}`);
      console.log('');
      console.log(chalk.red(`🚫 ${getT('backup.error.databaseUrlCancelled')}`));
      process.exit(1);
    }

    if (!accessToken) {
      console.log(chalk.red(`❌ ${getT('backup.error.accessTokenNotConfigured')}`));
      console.log('');
      console.log(chalk.yellow(`📋 ${getT('backup.error.accessTokenInstructions')}`));
      console.log(chalk.yellow(`   1. ${getT('backup.error.accessTokenStep1')}`));
      console.log(chalk.yellow(`   2. ${getT('backup.error.accessTokenStep2')}`));
      console.log(chalk.yellow(`   3. ${getT('backup.error.accessTokenStep3')}`));
      console.log('');
      console.log(chalk.blue(`🔗 ${getT('backup.error.accessTokenHowTo')}:`));
      ui.hint(`   ${getT('backup.error.accessTokenStep1Detail')}`);
      ui.hint(`   ${getT('backup.error.accessTokenStep2Detail')}`);
      ui.hint(`   ${getT('backup.error.accessTokenStep3Detail')}`);
      console.log('');
      console.log(chalk.red(`🚫 ${getT('backup.error.accessTokenCancelled')}`));
      process.exit(1);
    }

    const postgresMajorRaw = (getValue('SUPABASE_POSTGRES_MAJOR') || process.env.SUPABASE_POSTGRES_MAJOR || '').toString().trim();
    if (!postgresMajorRaw) {
      console.log(chalk.red(`❌ ${getT('backup.error.postgresMajorNotSet')}`));
      console.log(chalk.white(`   ${getT('backup.error.postgresMajorInstructions')}`));
      printSupabasePostgresMajorHintOnce(getT);
      console.log('');
      process.exit(1);
    }
    const parsedMajor = parseInt(postgresMajorRaw, 10);
    if (Number.isNaN(parsedMajor) || !isPostgresMajorSupported(parsedMajor, true)) {
      console.log(chalk.red(`❌ ${getT('backup.error.postgresMajorInvalid')}`));
      console.log(chalk.white(`   ${getT('backup.error.postgresMajorInstructions')}`));
      printSupabasePostgresMajorHintOnce(getT);
      console.log('');
      process.exit(1);
    }

    // Flags de componentes (perguntas interativas)
    const flags = await askComponentsFlags();

    // Mostrar resumo e pedir confirmação final
    console.log(chalk.cyan(`\n📋 ${getT('backup.summary.title')}\n`));
    console.log(chalk.white(`   ✅ ${getT('backup.summary.edgeFunctions', { value: flags.includeFunctions ? getT('backup.summary.yes') : getT('backup.summary.no') })}`));
    if (flags.includeFunctions) {
      console.log(chalk.white(`      🗑️  ${getT('backup.summary.edgeFunctionsCleanup', { value: flags.cleanFunctions ? getT('backup.summary.yes') : getT('backup.summary.no') })}`));
    }
    console.log(chalk.white(`   ✅ ${getT('backup.summary.temp', { value: flags.includeTemp ? getT('backup.summary.yes') : getT('backup.summary.no') })}`));
    if (flags.includeTemp) {
      console.log(chalk.white(`      🗑️  ${getT('backup.summary.tempCleanup', { value: flags.cleanTemp ? getT('backup.summary.yes') : getT('backup.summary.no') })}`));
    }
    console.log(chalk.white(`   ✅ ${getT('backup.summary.migrations', { value: flags.includeMigrations ? getT('backup.summary.yes') : getT('backup.summary.no') })}`));
    if (flags.includeMigrations) {
      console.log(chalk.white(`      🗑️  ${getT('backup.summary.migrationsCleanup', { value: flags.cleanMigrations ? getT('backup.summary.yes') : getT('backup.summary.no') })}`));
    }
    console.log(chalk.white(`   ✅ ${getT('backup.summary.storage', { value: flags.includeStorage ? getT('backup.summary.yes') : getT('backup.summary.no') })}`));
    console.log(chalk.white(`   ✅ ${getT('backup.summary.auth', { value: flags.includeAuth ? getT('backup.summary.yes') : getT('backup.summary.no') })}`));
    console.log(chalk.white(`   ✅ ${getT('backup.summary.realtime', { value: flags.includeRealtime ? getT('backup.summary.yes') : getT('backup.summary.no') })}`));
    console.log(chalk.white(`   📁 ${getT('backup.summary.backupDir', { path: finalBackupDir })}\n`));

    const finalOk = await confirm(getT('backup.summary.confirm'), true);

    if (!finalOk) {
      console.log(chalk.red(`🚫 ${getT('disclaimer.operationCancelled')}`));
      process.exit(1);
    }

    console.log(chalk.blue(`\n🚀 ${getT('backup.start.title', { projectId })}`));

    // Criar contexto compartilhado para as etapas (postgresMajor vem da validação SUPABASE_POSTGRES_MAJOR)
    const context = {
      projectId,
      accessToken,
      databaseUrl,
      supabaseUrl,
      supabaseServiceKey,
      backupDir: finalBackupDir,
      outputDir: resolvedOutputDir,
      options: { ...options, flags },
      cleanupFlags: {
        cleanFunctions: flags.cleanFunctions || false,
        cleanTemp: flags.cleanTemp || false,
        cleanMigrations: flags.cleanMigrations || false
      },
      postgresMajor: parsedMajor,
      postgresMajorLocked: true,
      postgresMajorSource: 'env',
      license: licenseResult.license,
      smoonbToken: licenseResult.smoonbToken,
      telemetryEnabled
    };

    // Criar manifest
    const manifest = {
      created_at: new Date().toISOString(),
      project_id: projectId,
      smoonb_version: require('../../../package.json').version,
      backup_type: 'pg_dumpall_docker_dashboard_compatible',
      docker_version: await getDockerVersion(),
      dashboard_compatible: true,
      components: {}
    };

    // Executar todas as etapas na ordem
    console.log(chalk.blue(`📁 ${getT('backup.start.directory', { path: finalBackupDir })}`));
    console.log(chalk.white(`🐳 ${getT('backup.start.docker')}`));

    // Contar etapas totais para numeração (4 fixas + condicionais)
    let stepNumber = 0;
    const totalSteps = 4 + (flags?.includeAuth ? 1 : 0) + (flags?.includeRealtime ? 1 : 0) + (flags?.includeStorage ? 1 : 0) + (flags?.includeFunctions ? 1 : 0) + (flags?.includeTemp ? 1 : 0) + (flags?.includeMigrations ? 1 : 0);

    // 1. Backup Database via pg_dumpall Docker
    stepNumber++;
    console.log(chalk.blue(`\n📊 ${stepNumber}/${totalSteps} - ${getT('backup.steps.database.title')}`));
    const databaseResult = await step02Database(context);
    manifest.components.database = databaseResult;

    // 3. Backup Database Separado
    stepNumber++;
    console.log(chalk.blue(`\n📊 ${stepNumber}/${totalSteps} - ${getT('backup.steps.database.separated.title')}`));
    const dbSeparatedResult = await step03DatabaseSeparated(context);
    manifest.components.database_separated = {
      success: dbSeparatedResult.success,
      method: 'supabase-cli',
      files: dbSeparatedResult.files || [],
      total_size_kb: dbSeparatedResult.totalSizeKB || '0.0'
    };

    // 4. Backup Database Settings
    stepNumber++;
    console.log(chalk.blue(`\n🔧 ${stepNumber}/${totalSteps} - ${getT('backup.steps.databaseSettings.title')}`));
    const databaseSettingsResult = await step04DatabaseSettings(context);
    manifest.components.database_settings = databaseSettingsResult;

    // 5. Backup Auth Settings
    if (flags?.includeAuth) {
      stepNumber++;
      console.log(chalk.blue(`\n🔐 ${stepNumber}/${totalSteps} - ${getT('backup.steps.auth.title')}`));
      const authResult = await step05AuthSettings(context);
      manifest.components.auth_settings = authResult;
    }

    // 6. Backup Realtime Settings
    if (flags?.includeRealtime) {
      stepNumber++;
      console.log(chalk.blue(`\n🔄 ${stepNumber}/${totalSteps} - ${getT('backup.steps.realtime.title')}`));
      const realtimeResult = await step06RealtimeSettings(context);
      manifest.components.realtime = realtimeResult;
    }

    // 7. Backup Storage
    if (flags?.includeStorage) {
      stepNumber++;
      console.log(chalk.blue(`\n📦 ${stepNumber}/${totalSteps} - ${getT('backup.steps.storage.title')}`));
      const storageResult = await step07Storage(context);
      manifest.components.storage = storageResult;
    }

    // 8. Backup Custom Roles
    stepNumber++;
    console.log(chalk.blue(`\n👥 ${stepNumber}/${totalSteps} - ${getT('backup.steps.roles.title')}`));
    const rolesResult = await step08CustomRoles(context);
    manifest.components.custom_roles = rolesResult;

    // 9. Backup Edge Functions
    if (flags?.includeFunctions) {
      stepNumber++;
      console.log(chalk.blue(`\n⚡ ${stepNumber}/${totalSteps} - ${getT('backup.steps.functions.title')}`));
      const functionsResult = await step09EdgeFunctions(context);
      manifest.components.edge_functions = functionsResult;
    }

    // 10. Backup Supabase .temp
    if (flags?.includeTemp) {
      stepNumber++;
      console.log(chalk.blue(`\n📁 ${stepNumber}/${totalSteps} - ${getT('backup.steps.temp.title')}`));
      const supabaseTempResult = await step10SupabaseTemp(context);
      manifest.components.supabase_temp = supabaseTempResult;
    }

    // 11. Backup Migrations
    if (flags?.includeMigrations) {
      stepNumber++;
      console.log(chalk.blue(`\n📋 ${stepNumber}/${totalSteps} - ${getT('backup.steps.migrations.title')}`));
      const migrationsResult = await step11Migrations(context);
      manifest.components.migrations = migrationsResult;
    }

    // Salvar manifest
    await writeJson(path.join(finalBackupDir, 'backup-manifest.json'), manifest);

    // Exibir resumo final (na ordem de captura)
    console.log(chalk.green(`\n🎉 ${getT('backup.complete.title')}`));
    console.log(chalk.blue(`📁 ${getT('backup.complete.location', { path: finalBackupDir })}`));
    console.log(chalk.green(`📊 ${getT('backup.complete.database', { fileName: databaseResult.fileName, size: `${databaseResult.size} KB` })}`));
    console.log(chalk.green(`📊 ${getT('backup.complete.databaseSql', { count: dbSeparatedResult.files?.length || 0, size: `${dbSeparatedResult.totalSizeKB} KB` })}`));
    console.log(chalk.green(`🔧 ${getT('backup.complete.databaseSettings', { fileName: databaseSettingsResult.fileName, size: `${databaseSettingsResult.size} KB` })}`));
    
    if (flags?.includeAuth && manifest.components.auth_settings) {
      console.log(chalk.green(`🔐 ${getT('backup.complete.auth')}`));
    }
    
    if (flags?.includeRealtime && manifest.components.realtime) {
      const realtimeResult = manifest.components.realtime;
      let realtimeMessage;
      if (!realtimeResult.success) {
        realtimeMessage = 'Falharam';
      } else if (realtimeResult.source === 'reused' && realtimeResult.reusedFrom) {
        realtimeMessage = getT('backup.complete.realtimeReused', { backup: realtimeResult.reusedFrom });
      } else {
        realtimeMessage = getT('backup.complete.realtime');
      }
      console.log(chalk.green(`🔄 Realtime: ${realtimeMessage}`));
    }
    
    if (flags?.includeStorage && manifest.components.storage) {
      const storageResult = manifest.components.storage;
      if (storageResult.zipFile) {
        console.log(chalk.green(`📦 ${getT('backup.complete.storage', { buckets: storageResult.buckets?.length || 0, files: storageResult.totalFiles || 0, zipFile: storageResult.zipFile, size: `${storageResult.zipSizeMB || 0} MB` })}`));
      } else {
        console.log(chalk.green(`📦 Storage: ${storageResult.buckets?.length || 0} buckets verificados via API (apenas metadados)`));
      }
    }
    
    console.log(chalk.green(`👥 ${getT('backup.complete.roles', { count: rolesResult.roles?.length || 0 })}`));
    
    if (flags?.includeFunctions && manifest.components.edge_functions) {
      const functionsResult = manifest.components.edge_functions;
      console.log(chalk.green(`⚡ ${getT('backup.complete.functions', { downloaded: functionsResult.success_count || 0, total: functionsResult.functions_count || 0 })}`));
    }
    
    if (flags?.includeTemp && manifest.components.supabase_temp) {
      const tempResult = manifest.components.supabase_temp;
      console.log(chalk.green(`📁 ${getT('backup.complete.temp', { count: tempResult.file_count || 0 })}`));
    }
    
    if (flags?.includeMigrations && manifest.components.migrations) {
      const migrationsResult = manifest.components.migrations;
      console.log(chalk.green(`📋 ${getT('backup.complete.migrations', { count: migrationsResult.file_count || 0 })}`));
    }

    // report.json
    await writeJson(path.join(finalBackupDir, 'report.json'), {
      process: 'backup',
      created_at: manifest.created_at,
      project_id: manifest.project_id,
      assets: {
        env: path.join(finalBackupDir, 'env', '.env.local'),
        env_map: path.join(finalBackupDir, 'env', 'env-map.json'),
        manifest: path.join(finalBackupDir, 'backup-manifest.json')
      },
      components: {
        includeFunctions: !!flags?.includeFunctions,
        includeStorage: !!flags?.includeStorage,
        includeAuth: !!flags?.includeAuth,
        includeRealtime: !!flags?.includeRealtime,
        includeTemp: !!flags?.includeTemp,
        includeMigrations: !!flags?.includeMigrations
      }
    });

    sendTelemetry({
      enabled: context.telemetryEnabled,
      command: 'backup',
      durationMs: Date.now() - backupStartTime,
      success: true
    });
    return { success: true, backupDir: finalBackupDir, manifest };

  } catch (error) {
    sendTelemetry({
      enabled: telemetryEnabled,
      command: 'backup',
      durationMs: Date.now() - backupStartTime,
      success: false,
      errorCode: 'error'
    });
    console.error(chalk.red(`❌ Erro no backup: ${error.message}`));
    process.exit(1);
  }
};

