const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const { ensureDir, writeJson, copyDir } = require('../utils/fsx');
const { sha256 } = require('../utils/hash');
const { readConfig, validateFor } = require('../utils/config');
const { showBetaBanner } = require('../utils/banner');
const { canPerformCompleteBackup, getDockerVersion } = require('../utils/docker');
const { captureRealtimeSettings } = require('../utils/realtime-settings');

const execAsync = promisify(exec);

// Exportar FUNÇÃO em vez de objeto Command
module.exports = async (options) => {
  showBetaBanner();
  
  try {
    // Carregar e validar configuração
    const config = await readConfig();
    validateFor(config, 'backup');

    // Validação adicional para pré-requisitos obrigatórios
    if (!config.supabase.databaseUrl) {
      console.log(chalk.red('❌ DATABASE_URL NÃO CONFIGURADA'));
      console.log('');
      console.log(chalk.yellow('📋 Para fazer backup completo do Supabase, você precisa:'));
      console.log(chalk.yellow('   1. Configurar databaseUrl no .smoonbrc'));
      console.log(chalk.yellow('   2. Repetir o comando de backup'));
      console.log('');
      console.log(chalk.blue('💡 Exemplo de configuração:'));
      console.log(chalk.gray('   "databaseUrl": "postgresql://postgres:[senha]@db.[projeto].supabase.co:5432/postgres"'));
      console.log('');
      console.log(chalk.red('🚫 Backup cancelado - Configuração incompleta'));
      process.exit(1);
    }

    if (!config.supabase.accessToken) {
      console.log(chalk.red('❌ ACCESS_TOKEN NÃO CONFIGURADO'));
      console.log('');
      console.log(chalk.yellow('📋 Para fazer backup completo do Supabase, você precisa:'));
      console.log(chalk.yellow('   1. Obter Personal Access Token do Supabase'));
      console.log(chalk.yellow('   2. Configurar accessToken no .smoonbrc'));
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

    console.log(chalk.blue(`🚀 Iniciando backup do projeto: ${config.supabase.projectId}`));
    console.log(chalk.gray(`🔍 Verificando dependências Docker...`));

    // Verificar se é possível fazer backup completo via Docker
    const backupCapability = await canPerformCompleteBackup();

    if (backupCapability.canBackupComplete) {
      console.log(chalk.green('✅ Docker Desktop detectado e funcionando'));
      console.log(chalk.gray(`🐳 Versão: ${backupCapability.dockerStatus.version}`));
      console.log('');
      
      // Proceder com backup completo via Docker
      return await performFullBackup(config, options);
    } else {
      // Mostrar mensagens educativas e encerrar elegantemente
      showDockerMessagesAndExit(backupCapability.reason);
    }

  } catch (error) {
    console.error(chalk.red(`❌ Erro no backup: ${error.message}`));
    process.exit(1);
  }
};

// Função para backup completo via Docker
async function performFullBackup(config, options) {
  // Resolver diretório de saída
  const outputDir = options.output || config.backup.outputDir;
  
  // Criar diretório de backup com timestamp humanizado
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  
  const backupDir = path.join(outputDir, `backup-${year}-${month}-${day}-${hour}-${minute}-${second}`);
  await ensureDir(backupDir);

  console.log(chalk.blue(`📁 Diretório: ${backupDir}`));
  console.log(chalk.gray(`🐳 Backup via Docker Desktop`));

  const manifest = {
    created_at: new Date().toISOString(),
    project_id: config.supabase.projectId,
    smoonb_version: require('../../package.json').version,
    backup_type: 'pg_dumpall_docker_dashboard_compatible',
    docker_version: await getDockerVersion(),
    dashboard_compatible: true,
    components: {}
  };

  // 1. Backup Database via pg_dumpall Docker (idêntico ao Dashboard)
  console.log(chalk.blue('\n📊 1/8 - Backup da Database PostgreSQL via pg_dumpall Docker...'));
  const databaseResult = await backupDatabase(config.supabase.projectId, backupDir);
  manifest.components.database = databaseResult;

  // 1.5. Backup Database Separado (SQL files para troubleshooting)
  console.log(chalk.blue('\n📊 1.5/8 - Backup da Database PostgreSQL (arquivos SQL separados)...'));
  const dbSeparatedResult = await backupDatabaseSeparated(config.supabase.projectId, backupDir);
  manifest.components.database_separated = {
    success: dbSeparatedResult.success,
    method: 'supabase-cli',
    files: dbSeparatedResult.files || [],
    total_size_kb: dbSeparatedResult.totalSizeKB || '0.0'
  };

  // 2. Backup Edge Functions via Docker
  console.log(chalk.blue('\n⚡ 2/8 - Backup das Edge Functions via Docker...'));
  const functionsResult = await backupEdgeFunctionsWithDocker(config.supabase.projectId, config.supabase.accessToken, backupDir);
  manifest.components.edge_functions = functionsResult;

  // 3. Backup Auth Settings via API
  console.log(chalk.blue('\n🔐 3/8 - Backup das Auth Settings via API...'));
  const authResult = await backupAuthSettings(config.supabase.projectId, config.supabase.accessToken, backupDir);
  manifest.components.auth_settings = authResult;

  // 4. Backup Storage via API
  console.log(chalk.blue('\n📦 4/8 - Backup do Storage via API...'));
  const storageResult = await backupStorage(config.supabase.projectId, config.supabase.accessToken, backupDir);
  manifest.components.storage = storageResult;

  // 5. Backup Custom Roles via SQL
  console.log(chalk.blue('\n👥 5/8 - Backup dos Custom Roles via SQL...'));
  const rolesResult = await backupCustomRoles(config.supabase.databaseUrl, backupDir);
  manifest.components.custom_roles = rolesResult;

  // 6. Backup das Database Extensions and Settings via SQL
  console.log(chalk.blue('\n🔧 6/8 - Backup das Database Extensions and Settings via SQL...'));
  const databaseSettingsResult = await backupDatabaseSettings(config.supabase.projectId, backupDir);
  manifest.components.database_settings = databaseSettingsResult;

  // 7. Backup Realtime Settings via Captura Interativa
  console.log(chalk.blue('\n🔄 7/8 - Backup das Realtime Settings via Captura Interativa...'));
  const realtimeResult = await backupRealtimeSettings(config.supabase.projectId, backupDir, options.skipRealtime);
  manifest.components.realtime = realtimeResult;

  // Salvar manifest
  await writeJson(path.join(backupDir, 'backup-manifest.json'), manifest);

  console.log(chalk.green('\n🎉 BACKUP COMPLETO FINALIZADO VIA DOCKER!'));
  console.log(chalk.blue(`📁 Localização: ${backupDir}`));
  console.log(chalk.green(`📊 Database: ${databaseResult.fileName} (${databaseResult.size} KB) - Idêntico ao Dashboard`));
  console.log(chalk.green(`📊 Database SQL: ${dbSeparatedResult.files?.length || 0} arquivos separados (${dbSeparatedResult.totalSizeKB} KB) - Para troubleshooting`));
  console.log(chalk.green(`🔧 Database Settings: ${databaseSettingsResult.fileName} (${databaseSettingsResult.size} KB) - Extensions e Configurações`));
  console.log(chalk.green(`⚡ Edge Functions: ${functionsResult.success_count || 0}/${functionsResult.functions_count || 0} functions baixadas via Docker`));
  console.log(chalk.green(`🔐 Auth Settings: ${authResult.success ? 'Exportadas via API' : 'Falharam'}`));
  console.log(chalk.green(`📦 Storage: ${storageResult.buckets?.length || 0} buckets verificados via API`));
  console.log(chalk.green(`👥 Custom Roles: ${rolesResult.roles?.length || 0} roles exportados via SQL`));
  // Determinar mensagem correta baseada no método usado
  let realtimeMessage = 'Falharam';
  if (realtimeResult.success) {
    if (options.skipRealtime) {
      realtimeMessage = 'Configurações copiadas do backup anterior';
    } else {
      realtimeMessage = 'Configurações capturadas interativamente';
    }
  }
  console.log(chalk.green(`🔄 Realtime: ${realtimeMessage}`));

  return { success: true, backupDir, manifest };
}

// Função para mostrar mensagens educativas e encerrar elegantemente
function showDockerMessagesAndExit(reason) {
  console.log('');
  
  switch (reason) {
    case 'docker_not_installed':
      console.log(chalk.red('❌ DOCKER DESKTOP NÃO ENCONTRADO'));
      console.log('');
      console.log(chalk.yellow('📋 Para fazer backup completo do Supabase, você precisa:'));
      console.log(chalk.yellow('   1. Instalar Docker Desktop'));
      console.log(chalk.yellow('   2. Executar Docker Desktop'));
      console.log(chalk.yellow('   3. Repetir o comando de backup'));
      console.log('');
      console.log(chalk.blue('🔗 Download: https://docs.docker.com/desktop/install/'));
      console.log('');
      console.log(chalk.gray('💡 O Docker Desktop é obrigatório para backup completo do Supabase'));
      console.log(chalk.gray('   - Database PostgreSQL'));
      console.log(chalk.gray('   - Edge Functions'));
      console.log(chalk.gray('   - Todos os componentes via Supabase CLI'));
      break;

    case 'docker_not_running':
      console.log(chalk.red('❌ DOCKER DESKTOP NÃO ESTÁ EXECUTANDO'));
      console.log('');
      console.log(chalk.yellow('📋 Para fazer backup completo do Supabase, você precisa:'));
      console.log(chalk.yellow('   1. Abrir Docker Desktop'));
      console.log(chalk.yellow('   2. Aguardar inicialização completa'));
      console.log(chalk.yellow('   3. Repetir o comando de backup'));
      console.log('');
      console.log(chalk.blue('💡 Dica: Docker Desktop deve estar rodando em segundo plano'));
      console.log('');
      console.log(chalk.gray('💡 O Docker Desktop é obrigatório para backup completo do Supabase'));
      console.log(chalk.gray('   - Database PostgreSQL'));
      console.log(chalk.gray('   - Edge Functions'));
      console.log(chalk.gray('   - Todos os componentes via Supabase CLI'));
      break;

    case 'supabase_cli_not_found':
      console.log(chalk.red('❌ SUPABASE CLI NÃO ENCONTRADO'));
      console.log('');
      console.log(chalk.yellow('📋 Para fazer backup completo do Supabase, você precisa:'));
      console.log(chalk.yellow('   1. Instalar Supabase CLI'));
      console.log(chalk.yellow('   2. Repetir o comando de backup'));
      console.log('');
      console.log(chalk.blue('🔗 Instalação: npm install -g supabase'));
      console.log('');
      console.log(chalk.gray('💡 O Supabase CLI é obrigatório para backup completo do Supabase'));
      console.log(chalk.gray('   - Database PostgreSQL'));
      console.log(chalk.gray('   - Edge Functions'));
      console.log(chalk.gray('   - Todos os componentes via Docker'));
      break;
  }

  console.log('');
  console.log(chalk.red('🚫 Backup cancelado - Pré-requisitos não atendidos'));
  console.log(chalk.gray('   Instale os componentes necessários e tente novamente'));
  console.log('');
  
  process.exit(1);
}

// Backup da database usando pg_dumpall via Docker (idêntico ao Supabase Dashboard)
async function backupDatabase(projectId, backupDir) {
  try {
    console.log(chalk.gray('   - Criando backup completo via pg_dumpall...'));
    
    const { execSync } = require('child_process');
    const config = await readConfig();
    
    // Extrair credenciais da databaseUrl
    const dbUrl = config.supabase.databaseUrl;
    const urlMatch = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
    
    if (!urlMatch) {
      throw new Error('Database URL inválida');
    }
    
    const [, username, password, host, port, database] = urlMatch;
    
    // Gerar nome do arquivo igual ao dashboard
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    const fileName = `db_cluster-${day}-${month}-${year}@${hours}-${minutes}-${seconds}.backup`;
    
    // CORREÇÃO: Usar caminho absoluto igual às Edge Functions
    const backupDirAbs = path.resolve(backupDir);
    
    // Comando pg_dumpall via Docker (mesma abordagem das Edge Functions)
    const dockerCmd = [
      'docker run --rm --network host',
      `-v "${backupDirAbs}:/host"`,
      `-e PGPASSWORD="${password}"`,
      'postgres:17 pg_dumpall',
      `-h ${host}`,
      `-p ${port}`,
      `-U ${username}`,
      `-f /host/${fileName}`
    ].join(' ');
    
    console.log(chalk.gray(`   - Executando pg_dumpall via Docker...`));
    execSync(dockerCmd, { stdio: 'pipe' });
    
    // Compactar igual ao Supabase Dashboard
    const gzipCmd = [
      'docker run --rm',
      `-v "${backupDirAbs}:/host"`,
      `postgres:17 gzip /host/${fileName}`
    ].join(' ');
    
    execSync(gzipCmd, { stdio: 'pipe' });
    
    const finalFileName = `${fileName}.gz`;
    const stats = await fs.stat(path.join(backupDir, finalFileName));
    const sizeKB = (stats.size / 1024).toFixed(1);
    
    console.log(chalk.green(`     ✅ Database backup: ${finalFileName} (${sizeKB} KB)`));
    
    return { success: true, size: sizeKB, fileName: finalFileName };
  } catch (error) {
    console.log(chalk.yellow(`     ⚠️ Erro no backup do database: ${error.message}`));
    return { success: false };
  }
}

// Backup da database usando arquivos SQL separados via Supabase CLI (para troubleshooting)
async function backupDatabaseSeparated(projectId, backupDir) {
  try {
    console.log(chalk.gray('   - Criando backups SQL separados via Supabase CLI...'));
    
    const { execSync } = require('child_process');
    const config = await readConfig();
    
    const dbUrl = config.supabase.databaseUrl;
    const files = [];
    let totalSizeKB = 0;
    
    // 1. Backup do Schema
    console.log(chalk.gray('   - Exportando schema...'));
    const schemaFile = path.join(backupDir, 'schema.sql');
    
    try {
      execSync(`supabase db dump --db-url "${dbUrl}" -f "${schemaFile}"`, { stdio: 'pipe' });
      const stats = await fs.stat(schemaFile);
      const sizeKB = (stats.size / 1024).toFixed(1);
      files.push({ filename: 'schema.sql', sizeKB });
      totalSizeKB += parseFloat(sizeKB);
      console.log(chalk.green(`     ✅ Schema: ${sizeKB} KB`));
    } catch (error) {
      console.log(chalk.yellow(`     ⚠️ Erro no schema: ${error.message}`));
    }
    
    // 2. Backup dos Dados
    console.log(chalk.gray('   - Exportando dados...'));
    const dataFile = path.join(backupDir, 'data.sql');
    
    try {
      execSync(`supabase db dump --db-url "${dbUrl}" --data-only -f "${dataFile}"`, { stdio: 'pipe' });
      const stats = await fs.stat(dataFile);
      const sizeKB = (stats.size / 1024).toFixed(1);
      files.push({ filename: 'data.sql', sizeKB });
      totalSizeKB += parseFloat(sizeKB);
      console.log(chalk.green(`     ✅ Data: ${sizeKB} KB`));
    } catch (error) {
      console.log(chalk.yellow(`     ⚠️ Erro nos dados: ${error.message}`));
    }
    
    // 3. Backup dos Roles
    console.log(chalk.gray('   - Exportando roles...'));
    const rolesFile = path.join(backupDir, 'roles.sql');
    
    try {
      execSync(`supabase db dump --db-url "${dbUrl}" --role-only -f "${rolesFile}"`, { stdio: 'pipe' });
      const stats = await fs.stat(rolesFile);
      const sizeKB = (stats.size / 1024).toFixed(1);
      files.push({ filename: 'roles.sql', sizeKB });
      totalSizeKB += parseFloat(sizeKB);
      console.log(chalk.green(`     ✅ Roles: ${sizeKB} KB`));
    } catch (error) {
      console.log(chalk.yellow(`     ⚠️ Erro nos roles: ${error.message}`));
    }
    
    return { 
      success: files.length > 0, 
      files, 
      totalSizeKB: totalSizeKB.toFixed(1) 
    };
    
  } catch (error) {
    console.log(chalk.yellow(`     ⚠️ Erro nos backups SQL separados: ${error.message}`));
    return { success: false, files: [], totalSizeKB: '0.0' };
  }
}

// Backup das Edge Functions via Docker
async function backupEdgeFunctionsWithDocker(projectId, accessToken, backupDir) {
  try {
    const functionsDir = path.join(backupDir, 'edge-functions');
    await ensureDir(functionsDir);

    console.log(chalk.gray('   - Listando Edge Functions via Management API...'));
    
    // ✅ Usar fetch direto para Management API com Personal Access Token
    const functionsResponse = await fetch(`https://api.supabase.com/v1/projects/${projectId}/functions`, {
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!functionsResponse.ok) {
      console.log(chalk.yellow(`     ⚠️ Erro ao listar Edge Functions: ${functionsResponse.status} ${functionsResponse.statusText}`));
      return { success: false, reason: 'api_error', functions: [] };
    }

    const functions = await functionsResponse.json();
    
    if (!functions || functions.length === 0) {
      console.log(chalk.gray('   - Nenhuma Edge Function encontrada'));
      await writeJson(path.join(functionsDir, 'README.md'), {
        message: 'Nenhuma Edge Function encontrada neste projeto'
      });
      return { success: true, reason: 'no_functions', functions: [] };
    }

    console.log(chalk.gray(`   - Encontradas ${functions.length} Edge Function(s)`));
    
    const downloadedFunctions = [];
    let successCount = 0;
    let errorCount = 0;

    // ✅ Baixar cada Edge Function DIRETAMENTE para o backup (sem tocar em ./supabase/functions)
    for (const func of functions) {
      try {
        console.log(chalk.gray(`   - Baixando: ${func.name}...`));
        
        // Criar diretório da função DIRETAMENTE no backup
        const functionTargetDir = path.join(functionsDir, func.name);
        await ensureDir(functionTargetDir);
        
        // Baixar Edge Function via Supabase CLI DIRETAMENTE para o backup
        const { execSync } = require('child_process');
        const tempBackupDir = path.join(backupDir, 'temp-supabase-download');
        
        // Criar estrutura temp para download sem contaminar ./supabase/
        await ensureDir(tempBackupDir);
        
        // Download para diretório temporário
        execSync(`supabase functions download ${func.name}`, {
          cwd: tempBackupDir,
          timeout: 60000,
          stdio: 'pipe'
        });
        
        // Mover de temp para o backup final
        const tempFunctionDir = path.join(tempBackupDir, 'supabase', 'functions', func.name);
        
        // Verificar se existe usando fs.promises.access
        try {
          await fs.access(tempFunctionDir);
          await copyDir(tempFunctionDir, functionTargetDir);
          
          // Limpar diretório temporário
          await fs.rm(tempBackupDir, { recursive: true, force: true }).catch(() => {});
          
          console.log(chalk.green(`     ✅ ${func.name} baixada com sucesso`));
          successCount++;
          
          downloadedFunctions.push({
            name: func.name,
            slug: func.name,
            version: func.version || 'unknown',
            files: await fs.readdir(functionTargetDir).catch(() => [])
          });
        } else {
          throw new Error('Diretório não encontrado após download');
        }
        
      } catch (error) {
        console.log(chalk.yellow(`     ⚠️ Erro ao baixar ${func.name}: ${error.message}`));
        errorCount++;
      }
    }
    
    console.log(chalk.green(`📊 Backup de Edge Functions concluído:`));
    console.log(chalk.green(`   ✅ Sucessos: ${successCount}`));
    console.log(chalk.green(`   ❌ Erros: ${errorCount}`));
    
    return { 
      success: true, 
      reason: 'success',
      functions: downloadedFunctions,
      functions_count: functions.length,
      success_count: successCount,
      error_count: errorCount,
      method: 'docker'
    };

  } catch (error) {
    console.log(chalk.yellow(`   ⚠️ Erro durante backup de Edge Functions: ${error.message}`));
    console.log('⏭️  Continuando com outros componentes...');
    return { success: false, reason: 'download_error', error: error.message, functions: [] };
  }
}

// Backup das Auth Settings via Management API
async function backupAuthSettings(projectId, accessToken, backupDir) {
  try {
    console.log(chalk.gray('   - Exportando configurações de Auth via Management API...'));
    
    // ✅ Usar fetch direto para Management API com Personal Access Token
    const authResponse = await fetch(`https://api.supabase.com/v1/projects/${projectId}/config/auth`, {
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!authResponse.ok) {
      console.log(chalk.yellow(`     ⚠️ Erro ao obter Auth Settings: ${authResponse.status} ${authResponse.statusText}`));
      return { success: false };
    }

    const authSettings = await authResponse.json();
    
    // Salvar configurações de Auth
    const authSettingsPath = path.join(backupDir, 'auth-settings.json');
    await writeJson(authSettingsPath, {
      project_id: projectId,
      timestamp: new Date().toISOString(),
      settings: authSettings
    });

    console.log(chalk.green(`✅ Auth Settings exportadas: ${path.basename(authSettingsPath)}`));
    return { success: true };

  } catch (error) {
    console.log(chalk.yellow(`   ⚠️ Erro no backup das Auth Settings: ${error.message}`));
    return { success: false };
  }
}

// Backup do Storage via Supabase API
async function backupStorage(projectId, accessToken, backupDir) {
  try {
    const storageDir = path.join(backupDir, 'storage');
    await ensureDir(storageDir);

    console.log(chalk.gray('   - Listando buckets de Storage via Management API...'));
    
    // ✅ Usar fetch direto para Management API com Personal Access Token
    const storageResponse = await fetch(`https://api.supabase.com/v1/projects/${projectId}/storage/buckets`, {
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!storageResponse.ok) {
      console.log(chalk.yellow(`     ⚠️ Erro ao listar buckets: ${storageResponse.status} ${storageResponse.statusText}`));
      return { success: false, buckets: [] };
    }

    const buckets = await storageResponse.json();

    if (!buckets || buckets.length === 0) {
      console.log(chalk.gray('   - Nenhum bucket encontrado'));
      await writeJson(path.join(storageDir, 'README.md'), {
        message: 'Nenhum bucket de Storage encontrado neste projeto'
      });
      return { success: true, buckets: [] };
    }

    console.log(chalk.gray(`   - Encontrados ${buckets.length} buckets`));

    const processedBuckets = [];

    for (const bucket of buckets || []) {
      try {
        console.log(chalk.gray(`   - Processando bucket: ${bucket.name}`));
        
        // ✅ Listar objetos do bucket via Management API com Personal Access Token
        const objectsResponse = await fetch(`https://api.supabase.com/v1/projects/${projectId}/storage/buckets/${bucket.name}/objects`, {
          headers: { 
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        let objects = [];
        if (objectsResponse.ok) {
          objects = await objectsResponse.json();
        }

        const bucketInfo = {
          id: bucket.id,
          name: bucket.name,
          public: bucket.public,
          file_size_limit: bucket.file_size_limit,
          allowed_mime_types: bucket.allowed_mime_types,
          objects: objects || []
        };

        // Salvar informações do bucket
        const bucketPath = path.join(storageDir, `${bucket.name}.json`);
        await writeJson(bucketPath, bucketInfo);

        processedBuckets.push({
          name: bucket.name,
          objectCount: objects?.length || 0
        });

        console.log(chalk.green(`     ✅ Bucket ${bucket.name}: ${objects?.length || 0} objetos`));
      } catch (error) {
        console.log(chalk.yellow(`     ⚠️ Erro ao processar bucket ${bucket.name}: ${error.message}`));
      }
    }

    console.log(chalk.green(`✅ Storage backupado: ${processedBuckets.length} buckets`));
    return { success: true, buckets: processedBuckets };
  } catch (error) {
    console.log(chalk.yellow(`⚠️ Erro no backup do Storage: ${error.message}`));
    return { success: false, buckets: [] };
  }
}

// Backup dos Custom Roles via Docker
async function backupCustomRoles(databaseUrl, backupDir) {
  try {
    console.log(chalk.gray('   - Exportando Custom Roles via Docker...'));
    
    const customRolesFile = path.join(backupDir, 'custom-roles.sql');
    
    try {
      // ✅ Usar Supabase CLI via Docker para roles
      await execAsync(`supabase db dump --db-url "${databaseUrl}" --role-only -f "${customRolesFile}"`);
      
      const stats = await fs.stat(customRolesFile);
      const sizeKB = (stats.size / 1024).toFixed(1);
      
      console.log(chalk.green(`     ✅ Custom Roles exportados via Docker: ${sizeKB} KB`));
      
      return { success: true, roles: [{ filename: 'custom-roles.sql', sizeKB }] };
    } catch (error) {
      console.log(chalk.yellow(`     ⚠️ Erro ao exportar Custom Roles via Docker: ${error.message}`));
      return { success: false, roles: [] };
    }
  } catch (error) {
    console.log(chalk.yellow(`     ⚠️ Erro no backup dos Custom Roles: ${error.message}`));
    return { success: false, roles: [] };
  }
}

// Backup das Database Extensions and Settings via SQL
async function backupDatabaseSettings(projectId, backupDir) {
  try {
    console.log(chalk.gray('   - Capturando Database Extensions and Settings...'));
    
    const { execSync } = require('child_process');
    const config = await readConfig();
    
    // Extrair credenciais da databaseUrl
    const dbUrl = config.supabase.databaseUrl;
    const urlMatch = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
    
    if (!urlMatch) {
      throw new Error('Database URL inválida');
    }
    
    const [, username, password, host, port, database] = urlMatch;
    
    // Gerar nome do arquivo
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    const fileName = `database-settings-${day}-${month}-${year}@${hours}-${minutes}-${seconds}.json`;
    
    // Usar caminho absoluto igual às outras funções
    const backupDirAbs = path.resolve(backupDir);
    
    // Script SQL para capturar todas as configurações
    const sqlScript = `
-- Database Extensions and Settings Backup
-- Generated at: ${new Date().toISOString()}

-- 1. Capturar extensões instaladas
SELECT json_agg(
  json_build_object(
    'name', extname,
    'version', extversion,
    'schema', extnamespace::regnamespace
  )
) as extensions
FROM pg_extension;

-- 2. Capturar configurações PostgreSQL importantes
SELECT json_agg(
  json_build_object(
    'name', name,
    'setting', setting,
    'unit', unit,
    'context', context,
    'description', short_desc
  )
) as postgres_settings
FROM pg_settings 
WHERE name IN (
  'statement_timeout',
  'idle_in_transaction_session_timeout', 
  'lock_timeout',
  'shared_buffers',
  'work_mem',
  'maintenance_work_mem',
  'effective_cache_size',
  'max_connections',
  'log_statement',
  'log_min_duration_statement',
  'timezone',
  'log_timezone', 
  'default_transaction_isolation',
  'default_transaction_read_only',
  'checkpoint_completion_target',
  'wal_buffers',
  'max_wal_size',
  'min_wal_size'
);

-- 3. Capturar configurações específicas dos roles Supabase
SELECT json_agg(
  json_build_object(
    'role', rolname,
    'config', rolconfig
  )
) as role_configurations
FROM pg_roles 
WHERE rolname IN ('anon', 'authenticated', 'authenticator', 'postgres', 'service_role')
AND rolconfig IS NOT NULL;

-- 4. Capturar configurações de PGAudit (se existir)
SELECT json_agg(
  json_build_object(
    'role', rolname,
    'config', rolconfig
  )
) as pgaudit_configurations
FROM pg_roles 
WHERE rolconfig IS NOT NULL 
AND EXISTS (
  SELECT 1 FROM unnest(rolconfig) AS config 
  WHERE config LIKE '%pgaudit%'
);
`;

    // Salvar script SQL temporário
    const sqlFile = path.join(backupDir, 'temp_settings.sql');
    await fs.writeFile(sqlFile, sqlScript);
    
    // Executar via Docker
    const dockerCmd = [
      'docker run --rm --network host',
      `-v "${backupDirAbs}:/host"`,
      `-e PGPASSWORD="${password}"`,
      'postgres:17 psql',
      `-h ${host}`,
      `-p ${port}`,
      `-U ${username}`,
      `-d ${database}`,
      '-f /host/temp_settings.sql',
      '-t', // Tuples only
      '-A'  // Unaligned output
    ].join(' ');
    
    console.log(chalk.gray('   - Executando queries de configurações via Docker...'));
    const output = execSync(dockerCmd, { stdio: 'pipe', encoding: 'utf8' });
    
    // Processar output e criar JSON estruturado
    const lines = output.trim().split('\n').filter(line => line.trim());
    
    const result = {
      database_settings: {
        note: "Configurações específicas do database Supabase capturadas via SQL",
        captured_at: new Date().toISOString(),
        project_id: projectId,
        extensions: lines[0] ? JSON.parse(lines[0]) : [],
        postgres_settings: lines[1] ? JSON.parse(lines[1]) : [],
        role_configurations: lines[2] ? JSON.parse(lines[2]) : [],
        pgaudit_configurations: lines[3] ? JSON.parse(lines[3]) : [],
        restore_instructions: {
          note: "Estas configurações precisam ser aplicadas manualmente após a restauração do database",
          steps: [
            "1. Restaurar o database usando o arquivo .backup.gz",
            "2. Aplicar configurações de Postgres via SQL:",
            "   ALTER DATABASE postgres SET setting_name TO 'value';",
            "3. Aplicar configurações de roles via SQL:",
            "   ALTER ROLE role_name SET setting_name TO 'value';",
            "4. Habilitar extensões necessárias via Dashboard ou SQL:",
            "   CREATE EXTENSION IF NOT EXISTS extension_name;",
            "5. Verificar configurações aplicadas:",
            "   SELECT name, setting FROM pg_settings WHERE name IN (...);"
          ]
        }
      }
    };
    
    // Salvar arquivo JSON
    const jsonFile = path.join(backupDir, fileName);
    await fs.writeFile(jsonFile, JSON.stringify(result, null, 2));
    
    // Limpar arquivo temporário
    await fs.unlink(sqlFile);
    
    const stats = await fs.stat(jsonFile);
    const sizeKB = (stats.size / 1024).toFixed(1);
    
    console.log(chalk.green(`     ✅ Database Settings: ${fileName} (${sizeKB} KB)`));
    
    return { success: true, size: sizeKB, fileName: fileName };
  } catch (error) {
    console.log(chalk.yellow(`     ⚠️ Erro no backup das Database Settings: ${error.message}`));
    return { success: false };
  }
}

// Backup das Realtime Settings via Captura Interativa
async function backupRealtimeSettings(projectId, backupDir, skipInteractive = false) {
  try {
    console.log(chalk.gray('   - Capturando Realtime Settings interativamente...'));
    
    const result = await captureRealtimeSettings(projectId, backupDir, skipInteractive);
    
    const stats = await fs.stat(path.join(backupDir, 'realtime-settings.json'));
    const sizeKB = (stats.size / 1024).toFixed(1);
    
    console.log(chalk.green(`     ✅ Realtime Settings capturadas: ${sizeKB} KB`));
    
    return { success: true, settings: result };
  } catch (error) {
    console.log(chalk.yellow(`     ⚠️ Erro ao capturar Realtime Settings: ${error.message}`));
    return { success: false };
  }
}

