const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
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
    backup_type: 'complete_docker',
    docker_version: await getDockerVersion(),
    components: {}
  };

  // 1. Backup Database via Docker
  console.log(chalk.blue('\n📊 1/6 - Backup da Database PostgreSQL via Docker...'));
  const dbResult = await backupDatabaseWithDocker(config.supabase.databaseUrl, backupDir);
  manifest.components.database = {
    success: dbResult.success,
    method: 'docker',
    files: dbResult.files?.length || 0,
    total_size_kb: dbResult.totalSizeKB || '0.0'
  };

  // 2. Backup Edge Functions via Docker
  console.log(chalk.blue('\n⚡ 2/6 - Backup das Edge Functions via Docker...'));
  const functionsResult = await backupEdgeFunctionsWithDocker(config.supabase.projectId, config.supabase.accessToken, backupDir);
  manifest.components.edge_functions = functionsResult;

  // 3. Backup Auth Settings via API
  console.log(chalk.blue('\n🔐 3/6 - Backup das Auth Settings via API...'));
  const authResult = await backupAuthSettings(config.supabase.projectId, config.supabase.accessToken, backupDir);
  manifest.components.auth_settings = authResult;

  // 4. Backup Storage via API
  console.log(chalk.blue('\n📦 4/6 - Backup do Storage via API...'));
  const storageResult = await backupStorage(config.supabase.projectId, config.supabase.accessToken, backupDir);
  manifest.components.storage = storageResult;

  // 5. Backup Custom Roles via SQL
  console.log(chalk.blue('\n👥 5/6 - Backup dos Custom Roles via SQL...'));
  const rolesResult = await backupCustomRoles(config.supabase.databaseUrl, backupDir);
  manifest.components.custom_roles = rolesResult;

  // 6. Backup Realtime Settings via Captura Interativa
  console.log(chalk.blue('\n🔄 6/6 - Backup das Realtime Settings via Captura Interativa...'));
  const realtimeResult = await backupRealtimeSettings(config.supabase.projectId, backupDir, options.skipRealtime);
  manifest.components.realtime = realtimeResult;

  // Salvar manifest
  await writeJson(path.join(backupDir, 'backup-manifest.json'), manifest);

  console.log(chalk.green('\n🎉 BACKUP COMPLETO FINALIZADO VIA DOCKER!'));
  console.log(chalk.blue(`📁 Localização: ${backupDir}`));
  console.log(chalk.green(`🐳 Database: ${dbResult.files?.length || 0} arquivos SQL gerados via Docker`));
  console.log(chalk.green(`⚡ Edge Functions: ${functionsResult.success_count || 0}/${functionsResult.functions_count || 0} functions baixadas via Docker`));
  console.log(chalk.green(`🔐 Auth Settings: ${authResult.success ? 'Exportadas via API' : 'Falharam'}`));
  console.log(chalk.green(`📦 Storage: ${storageResult.buckets?.length || 0} buckets verificados via API`));
  console.log(chalk.green(`👥 Custom Roles: ${rolesResult.roles?.length || 0} roles exportados via SQL`));
  console.log(chalk.green(`🔄 Realtime: ${realtimeResult.success ? 'Configurações capturadas interativamente' : 'Falharam'}`));

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

// Backup da database usando Docker
async function backupDatabaseWithDocker(databaseUrl, backupDir) {
  try {
    console.log(chalk.gray('🐳 Iniciando backup de database via Docker...'));
    
    const files = [];
    let success = true;
    let totalSizeKB = 0;

    // 1. Backup do Schema
    console.log(chalk.gray('   - Exportando schema...'));
    const schemaFile = path.join(backupDir, 'schema.sql');
    
    try {
      await execAsync(`supabase db dump --db-url "${databaseUrl}" -f "${schemaFile}"`);
      
      const schemaValidation = await validateSqlFile(schemaFile);
      if (schemaValidation.valid) {
        files.push({
          filename: 'schema.sql',
          size: schemaValidation.size,
          sizeKB: schemaValidation.sizeKB
        });
        totalSizeKB += parseFloat(schemaValidation.sizeKB);
        console.log(chalk.green(`     ✅ Schema exportado: ${schemaValidation.sizeKB} KB`));
      } else {
        console.log(chalk.red(`     ❌ Arquivo schema.sql inválido: ${schemaValidation.error}`));
        success = false;
      }
    } catch (error) {
      console.log(chalk.red(`     ❌ Erro ao exportar schema: ${error.message}`));
      success = false;
    }

    // 2. Backup dos Dados
    console.log(chalk.gray('   - Exportando dados...'));
    const dataFile = path.join(backupDir, 'data.sql');
    
    try {
      await execAsync(`supabase db dump --db-url "${databaseUrl}" --data-only -f "${dataFile}"`);
      
      const dataValidation = await validateSqlFile(dataFile);
      if (dataValidation.valid) {
        files.push({
          filename: 'data.sql',
          size: dataValidation.size,
          sizeKB: dataValidation.sizeKB
        });
        totalSizeKB += parseFloat(dataValidation.sizeKB);
        console.log(chalk.green(`     ✅ Dados exportados: ${dataValidation.sizeKB} KB`));
      } else {
        console.log(chalk.red(`     ❌ Arquivo data.sql inválido: ${dataValidation.error}`));
        success = false;
      }
    } catch (error) {
      console.log(chalk.red(`     ❌ Erro ao exportar dados: ${error.message}`));
      success = false;
    }

    // 3. Backup dos Roles
    console.log(chalk.gray('   - Exportando roles...'));
    const rolesFile = path.join(backupDir, 'roles.sql');
    
    try {
      await execAsync(`supabase db dump --db-url "${databaseUrl}" --role-only -f "${rolesFile}"`);
      
      const rolesValidation = await validateSqlFile(rolesFile);
      if (rolesValidation.valid) {
        files.push({
          filename: 'roles.sql',
          size: rolesValidation.size,
          sizeKB: rolesValidation.sizeKB
        });
        totalSizeKB += parseFloat(rolesValidation.sizeKB);
        console.log(chalk.green(`     ✅ Roles exportados: ${rolesValidation.sizeKB} KB`));
      } else {
        console.log(chalk.red(`     ❌ Arquivo roles.sql inválido: ${rolesValidation.error}`));
        success = false;
      }
    } catch (error) {
      console.log(chalk.red(`     ❌ Erro ao exportar roles: ${error.message}`));
      success = false;
    }

    console.log(chalk.green(`✅ Backup de database concluído via Docker`));
    return { success, files, totalSizeKB: totalSizeKB.toFixed(1) };

  } catch (error) {
    console.log(chalk.red(`❌ Erro no backup de database: ${error.message}`));
    return { success: false, error: error.message };
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

    // ✅ Baixar cada Edge Function usando Supabase CLI via Docker
    for (const func of functions) {
      try {
        console.log(chalk.gray(`   - Baixando: ${func.name}...`));
        
        // Usar comando oficial do Supabase CLI via Docker
        await execAsync(`supabase functions download ${func.name}`, {
          cwd: process.cwd(),
          timeout: 60000 // 60 segundos timeout
        });
        
        // Mover arquivos baixados para o diretório de backup
        const sourceDir = path.join(process.cwd(), 'supabase', 'functions', func.name);
        const targetDir = path.join(functionsDir, func.name);
        
        if (fs.existsSync(sourceDir)) {
          await copyDir(sourceDir, targetDir);
          console.log(chalk.green(`     ✅ ${func.name} baixada com sucesso`));
          successCount++;
          
          downloadedFunctions.push({
            name: func.name,
            slug: func.name,
            version: func.version || 'unknown',
            files: fs.existsSync(targetDir) ? fs.readdirSync(targetDir) : []
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
      
      const stats = fs.statSync(customRolesFile);
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

// Backup das Realtime Settings via Captura Interativa
async function backupRealtimeSettings(projectId, backupDir, skipInteractive = false) {
  try {
    console.log(chalk.gray('   - Capturando Realtime Settings interativamente...'));
    
    const result = await captureRealtimeSettings(projectId, backupDir, skipInteractive);
    
    const stats = fs.statSync(path.join(backupDir, 'realtime-settings.json'));
    const sizeKB = (stats.size / 1024).toFixed(1);
    
    console.log(chalk.green(`     ✅ Realtime Settings capturadas: ${sizeKB} KB`));
    
    return { success: true, settings: result };
  } catch (error) {
    console.log(chalk.yellow(`     ⚠️ Erro ao capturar Realtime Settings: ${error.message}`));
    return { success: false };
  }
}

// Validar arquivo SQL
async function validateSqlFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { valid: false, error: 'Arquivo não existe', size: 0, sizeKB: '0.0' };
    }

    const stats = fs.statSync(filePath);
    const sizeKB = (stats.size / 1024).toFixed(1);
    
    if (stats.size === 0) {
      return { valid: false, error: 'Arquivo vazio', size: 0, sizeKB: '0.0' };
    }

    const content = fs.readFileSync(filePath, 'utf8');
    
    const sqlKeywords = ['CREATE', 'INSERT', 'COPY', 'ALTER', 'DROP', 'GRANT', 'REVOKE'];
    const hasValidContent = sqlKeywords.some(keyword => 
      content.toUpperCase().includes(keyword)
    );

    if (!hasValidContent) {
      return { valid: false, error: 'Sem conteúdo SQL válido', size: stats.size, sizeKB };
    }

    return { valid: true, error: null, size: stats.size, sizeKB };
  } catch (error) {
    return { valid: false, error: error.message, size: 0, sizeKB: '0.0' };
  }
}
