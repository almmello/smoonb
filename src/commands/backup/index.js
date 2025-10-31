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
const { confirm } = require('../../utils/prompt');

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
    // Executar validação Docker ANTES de tudo
    await step00DockerValidation();

    // Consentimento para leitura e escrita do .env.local
    console.log(chalk.yellow('\n⚠️  O smoonb irá ler e escrever o arquivo .env.local localmente.'));
    console.log(chalk.yellow('   Um backup automático do .env.local será criado antes de qualquer alteração.'));
    console.log(chalk.yellow('   Vamos mapear suas variáveis de ambiente para garantir que todas as chaves necessárias'));
    console.log(chalk.yellow('   estejam presentes e com os valores corretos do projeto alvo.'));
    const consentOk = await confirm('Você consente em prosseguir', true);
    if (!consentOk) {
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

    // Flags de componentes (perguntas interativas)
    const flags = await askComponentsFlags();

    // Mostrar resumo e pedir confirmação final
    console.log(chalk.cyan('\n📋 RESUMO DAS CONFIGURAÇÕES:\n'));
    console.log(chalk.white(`   ✅ Edge Functions: ${flags.includeFunctions ? 'Sim' : 'Não'}`));
    if (flags.includeFunctions) {
      console.log(chalk.white(`      🗑️  Limpar após backup: ${flags.cleanFunctions ? 'Sim' : 'Não'}`));
    }
    console.log(chalk.white(`   ✅ Supabase .temp: ${flags.includeTemp ? 'Sim' : 'Não'}`));
    if (flags.includeTemp) {
      console.log(chalk.white(`      🗑️  Apagar após backup: ${flags.cleanTemp ? 'Sim' : 'Não'}`));
    }
    console.log(chalk.white(`   ✅ Migrations: ${flags.includeMigrations ? 'Sim' : 'Não'}`));
    if (flags.includeMigrations) {
      console.log(chalk.white(`      🗑️  Apagar após backup: ${flags.cleanMigrations ? 'Sim' : 'Não'}`));
    }
    console.log(chalk.white(`   ✅ Storage: ${flags.includeStorage ? 'Sim' : 'Não'}`));
    console.log(chalk.white(`   ✅ Auth: ${flags.includeAuth ? 'Sim' : 'Não'}`));
    console.log(chalk.white(`   ✅ Realtime: ${flags.includeRealtime ? 'Sim' : 'Não'}`));
    console.log(chalk.white(`   📁 Diretório de backup: ${finalBackupDir}\n`));

    const finalOk = await confirm('Deseja iniciar o backup com estas configurações?', true);

    if (!finalOk) {
      console.log(chalk.red('🚫 Operação cancelada pelo usuário.'));
      process.exit(1);
    }

    console.log(chalk.blue(`\n🚀 Iniciando backup do projeto: ${projectId}`));

    // Criar contexto compartilhado para as etapas
    const context = {
      projectId,
      accessToken,
      databaseUrl,
      backupDir: finalBackupDir,
      outputDir: resolvedOutputDir,
      options: { ...options, flags },
      cleanupFlags: {
        cleanFunctions: flags.cleanFunctions || false,
        cleanTemp: flags.cleanTemp || false,
        cleanMigrations: flags.cleanMigrations || false
      }
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
    console.log(chalk.white(`🐳 Backup via Docker Desktop`));

    // Contar etapas totais para numeração
    // Etapas fixas: Database, Database Separado, Database Settings, Custom Roles (4)
    // Etapas condicionais: Auth, Realtime, Storage, Functions, Temp, Migrations
    let stepNumber = 0;
    const totalSteps = 4 + (flags?.includeAuth ? 1 : 0) + (flags?.includeRealtime ? 1 : 0) + (flags?.includeStorage ? 1 : 0) + (flags?.includeFunctions ? 1 : 0) + (flags?.includeTemp ? 1 : 0) + (flags?.includeMigrations ? 1 : 0);

    // 1. Backup Database via pg_dumpall Docker
    stepNumber++;
    console.log(chalk.blue(`\n📊 ${stepNumber}/${totalSteps} - Backup da Database PostgreSQL via pg_dumpall Docker...`));
    const databaseResult = await step01Database(context);
    manifest.components.database = databaseResult;

    // 2. Backup Database Separado
    stepNumber++;
    console.log(chalk.blue(`\n📊 ${stepNumber}/${totalSteps} - Backup da Database PostgreSQL (arquivos SQL separados)...`));
    const dbSeparatedResult = await step02DatabaseSeparated(context);
    manifest.components.database_separated = {
      success: dbSeparatedResult.success,
      method: 'supabase-cli',
      files: dbSeparatedResult.files || [],
      total_size_kb: dbSeparatedResult.totalSizeKB || '0.0'
    };

    // 3. Backup Database Settings
    stepNumber++;
    console.log(chalk.blue(`\n🔧 ${stepNumber}/${totalSteps} - Backup das Database Extensions and Settings via SQL...`));
    const databaseSettingsResult = await step03DatabaseSettings(context);
    manifest.components.database_settings = databaseSettingsResult;

    // 4. Backup Auth Settings
    if (flags?.includeAuth) {
      stepNumber++;
      console.log(chalk.blue(`\n🔐 ${stepNumber}/${totalSteps} - Backup das Auth Settings via API...`));
      const authResult = await step04AuthSettings(context);
      manifest.components.auth_settings = authResult;
    }

    // 5. Backup Realtime Settings
    if (flags?.includeRealtime) {
      stepNumber++;
      console.log(chalk.blue(`\n🔄 ${stepNumber}/${totalSteps} - Backup das Realtime Settings via Captura Interativa...`));
      const realtimeResult = await step05RealtimeSettings(context);
      manifest.components.realtime = realtimeResult;
    }

    // 6. Backup Storage
    if (flags?.includeStorage) {
      stepNumber++;
      console.log(chalk.blue(`\n📦 ${stepNumber}/${totalSteps} - Backup do Storage via API...`));
      const storageResult = await step06Storage(context);
      manifest.components.storage = storageResult;
    }

    // 7. Backup Custom Roles
    stepNumber++;
    console.log(chalk.blue(`\n👥 ${stepNumber}/${totalSteps} - Backup dos Custom Roles via SQL...`));
    const rolesResult = await step07CustomRoles(context);
    manifest.components.custom_roles = rolesResult;

    // 8. Backup Edge Functions
    if (flags?.includeFunctions) {
      stepNumber++;
      console.log(chalk.blue(`\n⚡ ${stepNumber}/${totalSteps} - Backup das Edge Functions via Docker...`));
      const functionsResult = await step08EdgeFunctions(context);
      manifest.components.edge_functions = functionsResult;
    }

    // 9. Backup Supabase .temp
    if (flags?.includeTemp) {
      stepNumber++;
      console.log(chalk.blue(`\n📁 ${stepNumber}/${totalSteps} - Backup do Supabase .temp...`));
      const supabaseTempResult = await step09SupabaseTemp(context);
      manifest.components.supabase_temp = supabaseTempResult;
    }

    // 10. Backup Migrations
    if (flags?.includeMigrations) {
      stepNumber++;
      console.log(chalk.blue(`\n📋 ${stepNumber}/${totalSteps} - Backup das Migrations...`));
      const migrationsResult = await step10Migrations(context);
      manifest.components.migrations = migrationsResult;
    }

    // Salvar manifest
    await writeJson(path.join(finalBackupDir, 'backup-manifest.json'), manifest);

    // Exibir resumo final (na ordem de captura)
    console.log(chalk.green('\n🎉 BACKUP COMPLETO FINALIZADO VIA DOCKER!'));
    console.log(chalk.blue(`📁 Localização: ${finalBackupDir}`));
    console.log(chalk.green(`📊 Database: ${databaseResult.fileName} (${databaseResult.size} KB) - Idêntico ao Dashboard`));
    console.log(chalk.green(`📊 Database SQL: ${dbSeparatedResult.files?.length || 0} arquivos separados (${dbSeparatedResult.totalSizeKB} KB) - Para troubleshooting`));
    console.log(chalk.green(`🔧 Database Settings: ${databaseSettingsResult.fileName} (${databaseSettingsResult.size} KB) - Extensions e Configurações`));
    
    if (flags?.includeAuth && manifest.components.auth_settings) {
      const authResult = manifest.components.auth_settings;
      console.log(chalk.green(`🔐 Auth Settings: ${authResult.success ? 'Exportadas via API' : 'Falharam'}`));
    }
    
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
    
    if (flags?.includeStorage && manifest.components.storage) {
      const storageResult = manifest.components.storage;
      console.log(chalk.green(`📦 Storage: ${storageResult.buckets?.length || 0} buckets verificados via API`));
    }
    
    console.log(chalk.green(`👥 Custom Roles: ${rolesResult.roles?.length || 0} roles exportados via SQL`));
    
    if (flags?.includeFunctions && manifest.components.edge_functions) {
      const functionsResult = manifest.components.edge_functions;
      console.log(chalk.green(`⚡ Edge Functions: ${functionsResult.success_count || 0}/${functionsResult.functions_count || 0} functions baixadas via Docker`));
    }
    
    if (flags?.includeTemp && manifest.components.supabase_temp) {
      const tempResult = manifest.components.supabase_temp;
      console.log(chalk.green(`📁 Supabase .temp: ${tempResult.file_count || 0} arquivo(s) copiado(s)`));
    }
    
    if (flags?.includeMigrations && manifest.components.migrations) {
      const migrationsResult = manifest.components.migrations;
      console.log(chalk.green(`📋 Migrations: ${migrationsResult.file_count || 0} migration(s) copiada(s)`));
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

    return { success: true, backupDir: finalBackupDir, manifest };

  } catch (error) {
    console.error(chalk.red(`❌ Erro no backup: ${error.message}`));
    process.exit(1);
  }
};

