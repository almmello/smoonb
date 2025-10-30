const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const { ensureDir, writeJson } = require('../../utils/fsx');
const { readConfig, validateFor } = require('../../utils/config');
const { showBetaBanner } = require('../../utils/banner');
const { getDockerVersion } = require('../../utils/docker');
const { readEnvFile, writeEnvFile, backupEnvFile } = require('../../utils/env');
const { saveEnvMap } = require('../../utils/envMap');
const { mapEnvVariablesInteractively, askComponentsFlags } = require('../../interactive/envMapper');

// Importar todas as etapas
const step00DockerValidation = require('./steps/00-docker-validation');
const step01Database = require('./steps/01-database');
const step02DatabaseSeparated = require('./steps/02-database-separated');
const step03DatabaseSettings = require('./steps/03-database-settings');
const step04AuthSettings = require('./steps/04-auth-settings');
const step05RealtimeSettings = require('./steps/05-realtime-settings');
const step06Storage = require('./steps/06-storage');
const step07CustomRoles = require('./steps/07-custom-roles');
const step08EdgeFunctions = require('./steps/08-edge-functions');
const step09SupabaseTemp = require('./steps/09-supabase-temp');
const step10Migrations = require('./steps/10-migrations');

// Exportar FUNÇÃO em vez de objeto Command
module.exports = async (options) => {
  showBetaBanner();
  
  try {
    // Consentimento para leitura e escrita do .env.local
    console.log(chalk.yellow('⚠️  O smoonb irá ler e escrever o arquivo .env.local localmente.'));
    console.log(chalk.yellow('   Um backup automático do .env.local será criado antes de qualquer alteração.'));
    const consent = await require('inquirer').prompt([{ type: 'confirm', name: 'ok', message: 'Você consente em prosseguir (S/n):', default: true }]);
    if (!consent.ok) {
      console.log(chalk.red('🚫 Operação cancelada pelo usuário.'));
      process.exit(1);
    }

    // Carregar configuração existente apenas para defaults de diretório
    const config = await readConfig().catch(() => ({ backup: { outputDir: './backups' }, supabase: {} }));
    validateFor(config, 'backup');

    // Pré-passo de ENV: criar diretório de backup com timestamp já no início
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');

    // Resolver diretório de saída
    const defaultOutput = options.output || config.backup?.outputDir || './backups';
    const backupDir = path.join(defaultOutput, `backup-${year}-${month}-${day}-${hour}-${minute}-${second}`);
    await ensureDir(backupDir);

    // Backup e mapeamento do .env.local
    const envPath = path.join(process.cwd(), '.env.local');
    const envBackupPath = path.join(backupDir, 'env', '.env.local');
    await ensureDir(path.dirname(envBackupPath));
    await backupEnvFile(envPath, envBackupPath);
    console.log(chalk.blue(`📁 Backup do .env.local: ${path.relative(process.cwd(), envBackupPath)}`));

    const expectedKeys = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_DB_URL',
      'SUPABASE_PROJECT_ID',
      'SUPABASE_ACCESS_TOKEN',
      'SMOONB_OUTPUT_DIR'
    ];
    const currentEnv = await readEnvFile(envPath);
    const { finalEnv, dePara } = await mapEnvVariablesInteractively(currentEnv, expectedKeys);
    await writeEnvFile(envPath, finalEnv);
    await saveEnvMap(dePara, path.join(backupDir, 'env', 'env-map.json'));
    console.log(chalk.green('✅ .env.local atualizado com sucesso. Nenhuma chave renomeada; valores sincronizados.'));

    function getValue(expectedKey) {
      const clientKey = Object.keys(dePara).find(k => dePara[k] === expectedKey);
      return clientKey ? finalEnv[clientKey] : '';
    }

    // Recalcular outputDir a partir do ENV mapeado
    const resolvedOutputDir = options.output || getValue('SMOONB_OUTPUT_DIR') || config.backup?.outputDir || './backups';

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

    if (!databaseUrl) {
      console.log(chalk.red('❌ DATABASE_URL NÃO CONFIGURADA'));
      console.log('');
      console.log(chalk.yellow('📋 Para fazer backup completo do Supabase, você precisa:'));
      console.log(chalk.yellow('   1. Configurar SUPABASE_DB_URL no .env.local'));
      console.log(chalk.yellow('   2. Repetir o comando de backup'));
      console.log('');
      console.log(chalk.blue('💡 Exemplo de configuração:'));
      console.log(chalk.gray('   "databaseUrl": "postgresql://postgres:[senha]@db.[projeto].supabase.co:5432/postgres"'));
      console.log('');
      console.log(chalk.red('🚫 Backup cancelado - Configuração incompleta'));
      process.exit(1);
    }

    if (!accessToken) {
      console.log(chalk.red('❌ ACCESS_TOKEN NÃO CONFIGURADO'));
      console.log('');
      console.log(chalk.yellow('📋 Para fazer backup completo do Supabase, você precisa:'));
      console.log(chalk.yellow('   1. Obter Personal Access Token do Supabase'));
      console.log(chalk.yellow('   2. Configurar SUPABASE_ACCESS_TOKEN no .env.local'));
      console.log(chalk.yellow('   3. Repetir o comando de backup'));
      console.log('');
      console.log(chalk.blue('🔗 Como obter o token:'));
      console.log(chalk.gray('   1. Acesse: https://supabase.com/dashboard/account/tokens'));
      console.log(chalk.gray('   2. Clique: "Generate new token"'));
      console.log(chalk.gray('   3. Copie o token (formato: sbp_...)'));
      console.log('');
      console.log(chalk.red('🚫 Backup cancelado - Token não configurado'));
      process.exit(1);
    }

    console.log(chalk.blue(`🚀 Iniciando backup do projeto: ${projectId}`));

    // Executar validação Docker (etapa 0)
    await step00DockerValidation();

    // Flags de componentes
    const flags = await askComponentsFlags();

    // Criar contexto compartilhado para as etapas
    const context = {
      projectId,
      accessToken,
      databaseUrl,
      backupDir: finalBackupDir,
      outputDir: resolvedOutputDir,
      options: { ...options, flags }
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
    console.log(chalk.blue(`📁 Diretório: ${finalBackupDir}`));
    console.log(chalk.gray(`🐳 Backup via Docker Desktop`));

    // 1. Backup Database via pg_dumpall Docker
    console.log(chalk.blue('\n📊 1/12 - Backup da Database PostgreSQL via pg_dumpall Docker...'));
    const databaseResult = await step01Database(context);
    manifest.components.database = databaseResult;

    // 2. Backup Database Separado
    console.log(chalk.blue('\n📊 2/12 - Backup da Database PostgreSQL (arquivos SQL separados)...'));
    const dbSeparatedResult = await step02DatabaseSeparated(context);
    manifest.components.database_separated = {
      success: dbSeparatedResult.success,
      method: 'supabase-cli',
      files: dbSeparatedResult.files || [],
      total_size_kb: dbSeparatedResult.totalSizeKB || '0.0'
    };

    // 3. Backup Database Settings
    console.log(chalk.blue('\n🔧 3/12 - Backup das Database Extensions and Settings via SQL...'));
    const databaseSettingsResult = await step03DatabaseSettings(context);
    manifest.components.database_settings = databaseSettingsResult;

    // 4. Backup Auth Settings
    if (flags?.includeAuth) {
      console.log(chalk.blue('\n🔐 4/12 - Backup das Auth Settings via API...'));
      const authResult = await step04AuthSettings(context);
      manifest.components.auth_settings = authResult;
    }

    // 5. Backup Realtime Settings
    if (flags?.includeRealtime) {
      console.log(chalk.blue('\n🔄 5/12 - Backup das Realtime Settings via Captura Interativa...'));
      const realtimeResult = await step05RealtimeSettings(context);
      manifest.components.realtime = realtimeResult;
    }

    // 6. Backup Storage
    if (flags?.includeStorage) {
      console.log(chalk.blue('\n📦 6/12 - Backup do Storage via API...'));
      const storageResult = await step06Storage(context);
      manifest.components.storage = storageResult;
    }

    // 7. Backup Custom Roles
    console.log(chalk.blue('\n👥 7/12 - Backup dos Custom Roles via SQL...'));
    const rolesResult = await step07CustomRoles(context);
    manifest.components.custom_roles = rolesResult;

    // 8. Backup Edge Functions
    if (flags?.includeFunctions) {
      console.log(chalk.blue('\n⚡ 8/12 - Backup das Edge Functions via Docker...'));
      const functionsResult = await step08EdgeFunctions(context);
      manifest.components.edge_functions = functionsResult;
    }

    // 9. Backup Supabase .temp
    console.log(chalk.blue('\n📁 9/12 - Backup do Supabase .temp...'));
    const supabaseTempResult = await step09SupabaseTemp(context);
    manifest.components.supabase_temp = supabaseTempResult;

    // 10. Backup Migrations
    console.log(chalk.blue('\n📋 10/12 - Backup das Migrations...'));
    const migrationsResult = await step10Migrations(context);
    manifest.components.migrations = migrationsResult;

    // Salvar manifest
    await writeJson(path.join(finalBackupDir, 'backup-manifest.json'), manifest);

    // Exibir resumo final
    console.log(chalk.green('\n🎉 BACKUP COMPLETO FINALIZADO VIA DOCKER!'));
    console.log(chalk.blue(`📁 Localização: ${finalBackupDir}`));
    console.log(chalk.green(`📊 Database: ${databaseResult.fileName} (${databaseResult.size} KB) - Idêntico ao Dashboard`));
    console.log(chalk.green(`📊 Database SQL: ${dbSeparatedResult.files?.length || 0} arquivos separados (${dbSeparatedResult.totalSizeKB} KB) - Para troubleshooting`));
    console.log(chalk.green(`🔧 Database Settings: ${databaseSettingsResult.fileName} (${databaseSettingsResult.size} KB) - Extensions e Configurações`));
    
    if (flags?.includeFunctions && manifest.components.edge_functions) {
      const functionsResult = manifest.components.edge_functions;
      console.log(chalk.green(`⚡ Edge Functions: ${functionsResult.success_count || 0}/${functionsResult.functions_count || 0} functions baixadas via Docker`));
    }
    if (flags?.includeAuth && manifest.components.auth_settings) {
      const authResult = manifest.components.auth_settings;
      console.log(chalk.green(`🔐 Auth Settings: ${authResult.success ? 'Exportadas via API' : 'Falharam'}`));
    }
    if (flags?.includeStorage && manifest.components.storage) {
      const storageResult = manifest.components.storage;
      console.log(chalk.green(`📦 Storage: ${storageResult.buckets?.length || 0} buckets verificados via API`));
    }
    console.log(chalk.green(`👥 Custom Roles: ${rolesResult.roles?.length || 0} roles exportados via SQL`));
    
    // Determinar mensagem correta baseada no método usado
    if (flags?.includeRealtime && manifest.components.realtime) {
      const realtimeResult = manifest.components.realtime;
      let realtimeMessage = 'Falharam';
      if (realtimeResult.success) {
        if (options.skipRealtime) {
          realtimeMessage = 'Configurações copiadas do backup anterior';
        } else {
          realtimeMessage = 'Configurações capturadas interativamente';
        }
      }
      console.log(chalk.green(`🔄 Realtime: ${realtimeMessage}`));
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
        includeRealtime: !!flags?.includeRealtime
      }
    });

    return { success: true, backupDir: finalBackupDir, manifest };

  } catch (error) {
    console.error(chalk.red(`❌ Erro no backup: ${error.message}`));
    process.exit(1);
  }
};

