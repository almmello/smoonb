const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const { ensureBin, runCommand } = require('../utils/cli');
const { ensureDir, writeJson, copyDir } = require('../utils/fsx');
const { sha256 } = require('../utils/hash');
const { readConfig, validateFor } = require('../utils/config');
const { showBetaBanner } = require('../utils/banner');
const { detectDockerDependencies } = require('../utils/docker');
const { createClient } = require('@supabase/supabase-js');

// Exportar FUNÇÃO em vez de objeto Command
module.exports = async (options) => {
  showBetaBanner();
  
  try {
    // Verificar se pg_dump está disponível
    const pgDumpPath = await findPgDumpPath();
    if (!pgDumpPath) {
      console.error(chalk.red('❌ pg_dump não encontrado'));
      console.log(chalk.yellow('💡 Instale PostgreSQL:'));
      console.log(chalk.yellow('  https://www.postgresql.org/download/'));
      process.exit(1);
    }

    // Carregar e validar configuração
    const config = await readConfig();
    validateFor(config, 'backup');

    const databaseUrl = config.supabase.databaseUrl;
    if (!databaseUrl) {
      console.error(chalk.red('❌ databaseUrl não configurada'));
      console.log(chalk.yellow('💡 Configure databaseUrl no .smoonbrc'));
      process.exit(1);
    }

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

    console.log(chalk.blue(`🚀 Iniciando backup COMPLETO do projeto: ${config.supabase.projectId}`));
    console.log(chalk.blue(`📁 Diretório: ${backupDir}`));
    console.log(chalk.gray(`🔧 Usando pg_dump: ${pgDumpPath}`));

    // 1. Backup da Database PostgreSQL (básico)
    console.log(chalk.blue('\n📊 1/6 - Backup da Database PostgreSQL...'));
    const dbBackupResult = await backupDatabaseWithPgDump(databaseUrl, backupDir, pgDumpPath);
    
    if (!dbBackupResult.success) {
      console.error(chalk.red('❌ Falha crítica no backup da database'));
      console.log(chalk.yellow('💡 Verifique:'));
      console.log(chalk.yellow('  - Se DATABASE_URL está correta'));
      console.log(chalk.yellow('  - Se as credenciais estão corretas'));
      console.log(chalk.yellow('  - Se o banco está acessível'));
      process.exit(1);
    }

    // 2. Backup das Edge Functions via Supabase API
    console.log(chalk.blue('\n⚡ 2/6 - Backup das Edge Functions via API...'));
    const edgeFunctionsResult = await backupEdgeFunctions(config, backupDir);

    // 3. Backup das Auth Settings via Management API
    console.log(chalk.blue('\n🔐 3/6 - Backup das Auth Settings via API...'));
    const authSettingsResult = await backupAuthSettings(config, backupDir);

    // 4. Backup do Storage via Supabase API
    console.log(chalk.blue('\n📦 4/6 - Backup do Storage via API...'));
    const storageResult = await backupStorage(config, backupDir);

    // 5. Backup dos Custom Roles via SQL
    console.log(chalk.blue('\n👥 5/6 - Backup dos Custom Roles via SQL...'));
    const customRolesResult = await backupCustomRoles(databaseUrl, backupDir);

    // 6. Backup das Realtime Settings via SQL
    console.log(chalk.blue('\n🔄 6/6 - Backup das Realtime Settings via SQL...'));
    const realtimeResult = await backupRealtimeSettings(databaseUrl, backupDir);

    // Gerar manifesto do backup completo
    await generateCompleteBackupManifest(config, backupDir, {
      database: dbBackupResult,
      edgeFunctions: edgeFunctionsResult,
      authSettings: authSettingsResult,
      storage: storageResult,
      customRoles: customRolesResult,
      realtime: realtimeResult
    });

    console.log(chalk.green('\n🎉 BACKUP COMPLETO FINALIZADO!'));
    console.log(chalk.blue(`📁 Localização: ${backupDir}`));
    console.log(chalk.green(`✅ Database: ${dbBackupResult.files.length} arquivos SQL gerados`));
    if (edgeFunctionsResult.success) {
      console.log(chalk.green(`✅ Edge Functions: ${edgeFunctionsResult.successCount}/${edgeFunctionsResult.functionsCount} functions baixadas`));
    } else {
      console.log(chalk.yellow(`⚠️ Edge Functions: ${edgeFunctionsResult.reason === 'docker_not_installed' ? 'Docker não instalado' : 
        edgeFunctionsResult.reason === 'docker_not_running' ? 'Docker não está rodando' : 
        edgeFunctionsResult.reason === 'supabase_cli_not_found' ? 'Supabase CLI não encontrado' : 
        'Erro no backup'}`));
    }
    console.log(chalk.green(`✅ Auth Settings: ${authSettingsResult.success ? 'Exportadas' : 'Falharam'}`));
    console.log(chalk.green(`✅ Storage: ${storageResult.buckets.length} buckets verificados`));
    console.log(chalk.green(`✅ Custom Roles: ${customRolesResult.roles.length} roles exportados`));
    console.log(chalk.green(`✅ Realtime: ${realtimeResult.success ? 'Configurações exportadas' : 'Falharam'}`));
    
    // Mostrar resumo dos arquivos
    console.log(chalk.blue('\n📊 Resumo dos arquivos gerados:'));
    for (const file of dbBackupResult.files) {
      console.log(chalk.gray(`   - ${file.filename}: ${file.sizeKB} KB`));
    }
    if (edgeFunctionsResult.success && edgeFunctionsResult.functions.length > 0) {
      console.log(chalk.gray(`   - Edge Functions: ${edgeFunctionsResult.successCount}/${edgeFunctionsResult.functionsCount} functions`));
    } else if (!edgeFunctionsResult.success) {
      console.log(chalk.gray(`   - Edge Functions: Pulado (${edgeFunctionsResult.reason})`));
    }

  } catch (error) {
    console.error(chalk.red(`❌ Erro no backup: ${error.message}`));
    process.exit(1);
  }
};

// Encontrar caminho do pg_dump automaticamente
async function findPgDumpPath() {
  // Primeiro, tentar encontrar no PATH
  const pgDumpPath = await ensureBin('pg_dump');
  if (pgDumpPath) {
    return pgDumpPath;
  }

  // No Windows, tentar caminhos comuns
  if (process.platform === 'win32') {
    const possiblePaths = [
      'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
      'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
      'C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe',
      'C:\\Program Files\\PostgreSQL\\14\\bin\\pg_dump.exe',
      'C:\\Program Files\\PostgreSQL\\13\\bin\\pg_dump.exe'
    ];
    
    for (const pgDumpPath of possiblePaths) {
      if (fs.existsSync(pgDumpPath)) {
        return pgDumpPath;
      }
    }
  }

  return null;
}

// Backup da database usando pg_dump/pg_dumpall
async function backupDatabaseWithPgDump(databaseUrl, backupDir, pgDumpPath) {
  try {
    // Parse da URL da database
    const url = new URL(databaseUrl);
    const host = url.hostname;
    const port = url.port || '5432';
    const username = url.username;
    const password = url.password;
    const database = url.pathname.slice(1);

    console.log(chalk.gray(`   - Host: ${host}:${port}`));
    console.log(chalk.gray(`   - Database: ${database}`));
    console.log(chalk.gray(`   - Username: ${username}`));

    const files = [];
    let success = true;

    // 1. Backup do schema usando pg_dump
    console.log(chalk.blue('   - Exportando schema...'));
    const schemaFile = path.join(backupDir, 'schema.sql');
    const schemaCommand = `"${pgDumpPath}" "${databaseUrl}" --schema-only -f "${schemaFile}"`;
    
    try {
      await runCommand(schemaCommand, {
        env: { ...process.env, PGPASSWORD: password }
      });
      
      const schemaValidation = await validateSqlFile(schemaFile);
      if (schemaValidation.valid) {
        files.push({
          filename: 'schema.sql',
          size: schemaValidation.size,
          sizeKB: schemaValidation.sizeKB
        });
        console.log(chalk.green(`     ✅ Schema exportado: ${schemaValidation.sizeKB} KB`));
      } else {
        console.log(chalk.red(`     ❌ Arquivo schema.sql inválido: ${schemaValidation.error}`));
        success = false;
      }
    } catch (error) {
      console.log(chalk.red(`     ❌ Erro ao exportar schema: ${error.message}`));
      success = false;
    }

    // 2. Backup dos dados usando pg_dump
    console.log(chalk.blue('   - Exportando dados...'));
    const dataFile = path.join(backupDir, 'data.sql');
    const dataCommand = `"${pgDumpPath}" "${databaseUrl}" --data-only -f "${dataFile}"`;
    
    try {
      await runCommand(dataCommand, {
        env: { ...process.env, PGPASSWORD: password }
      });
      
      const dataValidation = await validateSqlFile(dataFile);
      if (dataValidation.valid) {
        files.push({
          filename: 'data.sql',
          size: dataValidation.size,
          sizeKB: dataValidation.sizeKB
        });
        console.log(chalk.green(`     ✅ Dados exportados: ${dataValidation.sizeKB} KB`));
      } else {
        console.log(chalk.red(`     ❌ Arquivo data.sql inválido: ${dataValidation.error}`));
        success = false;
      }
    } catch (error) {
      console.log(chalk.red(`     ❌ Erro ao exportar dados: ${error.message}`));
      success = false;
    }

    // 3. Backup dos roles usando pg_dumpall
    console.log(chalk.blue('   - Exportando roles...'));
    const rolesFile = path.join(backupDir, 'roles.sql');
    const pgDumpallPath = pgDumpPath.replace('pg_dump', 'pg_dumpall');
    const rolesCommand = `"${pgDumpallPath}" --host=${host} --port=${port} --username=${username} --roles-only -f "${rolesFile}"`;
    
    try {
      await runCommand(rolesCommand, {
        env: { ...process.env, PGPASSWORD: password }
      });
      
      const rolesValidation = await validateSqlFile(rolesFile);
      if (rolesValidation.valid) {
        files.push({
          filename: 'roles.sql',
          size: rolesValidation.size,
          sizeKB: rolesValidation.sizeKB
        });
        console.log(chalk.green(`     ✅ Roles exportados: ${rolesValidation.sizeKB} KB`));
      } else {
        console.log(chalk.red(`     ❌ Arquivo roles.sql inválido: ${rolesValidation.error}`));
        success = false;
      }
    } catch (error) {
      console.log(chalk.red(`     ❌ Erro ao exportar roles: ${error.message}`));
      success = false;
    }

    return { success, files };
  } catch (error) {
    throw new Error(`Falha no backup da database: ${error.message}`);
  }
}

// Backup das Edge Functions com detecção inteligente do Docker
async function backupEdgeFunctions(config, backupDir) {
  try {
    console.log('🔍 Verificando dependências para backup de Edge Functions...');
    
    // 1. Verificar se Docker está instalado e rodando
    const dockerStatus = await detectDockerDependencies();
    
    if (!dockerStatus.dockerInstalled) {
      console.log('⚠️  DOCKER DESKTOP NÃO ENCONTRADO');
      console.log('');
      console.log('📋 Para fazer backup das Edge Functions, você precisa:');
      console.log('   1. Instalar Docker Desktop');
      console.log('   2. Executar Docker Desktop');
      console.log('   3. Repetir o comando de backup');
      console.log('');
      console.log('🔗 Download: https://docs.docker.com/desktop/install/');
      console.log('');
      console.log('⏭️  Pulando backup de Edge Functions...');
      console.log('✅ Continuando com outros componentes do backup...');
      return { success: false, reason: 'docker_not_installed', functions: [] };
    }
    
    if (!dockerStatus.dockerRunning) {
      console.log('⚠️  DOCKER DESKTOP NÃO ESTÁ EXECUTANDO');
      console.log('');
      console.log('📋 Para fazer backup das Edge Functions, você precisa:');
      console.log('   1. Abrir Docker Desktop');
      console.log('   2. Aguardar inicialização completa');
      console.log('   3. Repetir o comando de backup');
      console.log('');
      console.log('💡 Dica: Docker Desktop deve estar rodando em segundo plano');
      console.log('');
      console.log('⏭️  Pulando backup de Edge Functions...');
      console.log('✅ Continuando com outros componentes do backup...');
      return { success: false, reason: 'docker_not_running', functions: [] };
    }
    
    if (!dockerStatus.supabaseCLI) {
      console.log('⚠️  SUPABASE CLI NÃO ENCONTRADO');
      console.log('');
      console.log('📋 Para fazer backup das Edge Functions, você precisa:');
      console.log('   1. Instalar Supabase CLI');
      console.log('   2. Repetir o comando de backup');
      console.log('');
      console.log('🔗 Instalação: npm install -g supabase');
      console.log('');
      console.log('⏭️  Pulando backup de Edge Functions...');
      console.log('✅ Continuando com outros componentes do backup...');
      return { success: false, reason: 'supabase_cli_not_found', functions: [] };
    }
    
    // 3. Docker está OK, proceder com backup
    console.log('✅ Docker Desktop detectado e funcionando');
    console.log('✅ Supabase CLI detectado');
    console.log('📥 Iniciando backup das Edge Functions...');
    
    const functionsDir = path.join(backupDir, 'edge-functions');
    await ensureDir(functionsDir);

    console.log(chalk.gray('   - Listando Edge Functions via Management API...'));
    
    // ✅ Usar fetch direto para Management API com Personal Access Token
    const functionsResponse = await fetch(`https://api.supabase.com/v1/projects/${config.supabase.projectId}/functions`, {
      headers: { 
        'Authorization': `Bearer ${config.supabase.accessToken}`,
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

    // ✅ Baixar cada Edge Function usando Supabase CLI
    for (const func of functions) {
      try {
        console.log(chalk.gray(`   - Baixando: ${func.name}...`));
        
        // Usar comando oficial do Supabase CLI
        await runCommand(`supabase functions download ${func.name}`, {
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
      functionsCount: functions.length,
      successCount,
      errorCount
    };

  } catch (error) {
    console.log(chalk.yellow(`   ⚠️ Erro durante backup de Edge Functions: ${error.message}`));
    console.log('⏭️  Continuando com outros componentes...');
    return { success: false, reason: 'download_error', error: error.message, functions: [] };
  }
}

// Backup das Auth Settings via Management API
async function backupAuthSettings(config, backupDir) {
  try {
    console.log(chalk.gray('   - Exportando configurações de Auth via Management API...'));
    
    // ✅ Usar fetch direto para Management API com Personal Access Token
    const authResponse = await fetch(`https://api.supabase.com/v1/projects/${config.supabase.projectId}/config/auth`, {
      headers: { 
        'Authorization': `Bearer ${config.supabase.accessToken}`,
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
      project_id: config.supabase.projectId,
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
async function backupStorage(config, backupDir) {
  try {
    const storageDir = path.join(backupDir, 'storage');
    await ensureDir(storageDir);

    console.log(chalk.gray('   - Listando buckets de Storage via Management API...'));
    
    // ✅ Usar fetch direto para Management API com Personal Access Token
    const storageResponse = await fetch(`https://api.supabase.com/v1/projects/${config.supabase.projectId}/storage/buckets`, {
      headers: { 
        'Authorization': `Bearer ${config.supabase.accessToken}`,
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

    for (const bucket of buckets || []) {
      try {
        console.log(chalk.gray(`   - Processando bucket: ${bucket.name}`));
        
        // ✅ Listar objetos do bucket via Management API com Personal Access Token
        const objectsResponse = await fetch(`https://api.supabase.com/v1/projects/${config.supabase.projectId}/storage/buckets/${bucket.name}/objects`, {
          headers: { 
            'Authorization': `Bearer ${config.supabase.accessToken}`,
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
  } catch (error) {
    console.log(chalk.yellow(`⚠️ Erro no backup do Storage: ${error.message}`));
    return { success: false, buckets: [] };
  }
}

// Backup dos Custom Roles via SQL
async function backupCustomRoles(databaseUrl, backupDir) {
  try {
    console.log(chalk.gray('   - Exportando Custom Roles...'));
    
    const customRolesFile = path.join(backupDir, 'custom-roles.sql');
    
    // Query para obter roles customizados com senhas
    const customRolesQuery = `
-- Custom Roles Backup
-- Roles customizados com senhas

SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolconnlimit, rolpassword 
FROM pg_roles 
WHERE rolname NOT IN ('postgres', 'supabase_admin', 'supabase_auth_admin', 'supabase_storage_admin', 'supabase_read_only_user', 'authenticator', 'anon', 'authenticated', 'service_role')
ORDER BY rolname;
`;

    // Executar query e salvar resultado
    const { stdout } = await runCommand(
      `psql "${databaseUrl}" -t -c "${customRolesQuery}"`
    );

    const rolesContent = `-- Custom Roles Backup
-- Generated at: ${new Date().toISOString()}

${customRolesQuery}

-- Results:
${stdout}
`;

    await fs.promises.writeFile(customRolesFile, rolesContent);
    
    const stats = fs.statSync(customRolesFile);
    const sizeKB = (stats.size / 1024).toFixed(1);
    
    console.log(chalk.green(`     ✅ Custom Roles exportados: ${sizeKB} KB`));
    
    return { success: true, roles: [{ filename: 'custom-roles.sql', sizeKB }] };
  } catch (error) {
    console.log(chalk.yellow(`     ⚠️ Erro ao exportar Custom Roles: ${error.message}`));
    return { success: false, roles: [] };
  }
}

// Backup das Realtime Settings via SQL
async function backupRealtimeSettings(databaseUrl, backupDir) {
  try {
    console.log(chalk.gray('   - Exportando Realtime Settings...'));
    
    const realtimeFile = path.join(backupDir, 'realtime-settings.sql');
    
    // Query para obter configurações de Realtime
    const realtimeQuery = `
-- Realtime Settings Backup
-- Publicações e configurações de Realtime

-- Publicações
SELECT pubname, puballtables, pubinsert, pubupdate, pubdelete, pubtruncate 
FROM pg_publication 
ORDER BY pubname;

-- Tabelas publicadas
SELECT p.pubname, c.relname as table_name, n.nspname as schema_name
FROM pg_publication_tables pt
JOIN pg_publication p ON p.oid = pt.ptpubid
JOIN pg_class c ON c.oid = pt.ptrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
ORDER BY p.pubname, n.nspname, c.relname;
`;

    // Executar query e salvar resultado
    const { stdout } = await runCommand(
      `psql "${databaseUrl}" -t -c "${realtimeQuery}"`
    );

    const realtimeContent = `-- Realtime Settings Backup
-- Generated at: ${new Date().toISOString()}

${realtimeQuery}

-- Results:
${stdout}
`;

    await fs.promises.writeFile(realtimeFile, realtimeContent);
    
    const stats = fs.statSync(realtimeFile);
    const sizeKB = (stats.size / 1024).toFixed(1);
    
    console.log(chalk.green(`     ✅ Realtime Settings exportados: ${sizeKB} KB`));
    
    return { success: true };
  } catch (error) {
    console.log(chalk.yellow(`     ⚠️ Erro ao exportar Realtime Settings: ${error.message}`));
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

// Gerar manifesto do backup completo
async function generateCompleteBackupManifest(config, backupDir, results) {
  const manifest = {
    created_at: new Date().toISOString(),
    project_id: config.supabase.projectId,
    smoonb_version: require('../../package.json').version,
    backup_type: 'complete_supabase',
    components: {
      database: {
        success: results.database.success,
        files: results.database.files.length,
        total_size_kb: results.database.files.reduce((total, file) => total + parseFloat(file.sizeKB), 0).toFixed(1)
      },
      edge_functions: {
        success: results.edgeFunctions.success,
        reason: results.edgeFunctions.reason || null,
        functions_count: results.edgeFunctions.functionsCount || 0,
        success_count: results.edgeFunctions.successCount || 0,
        error_count: results.edgeFunctions.errorCount || 0,
        functions: results.edgeFunctions.functions.map(f => f.name),
        timestamp: new Date().toISOString()
      },
      auth_settings: {
        success: results.authSettings.success
      },
      storage: {
        success: results.storage.success,
        buckets_count: results.storage.buckets.length,
        buckets: results.storage.buckets.map(b => b.name)
      },
      custom_roles: {
        success: results.customRoles.success,
        roles_count: results.customRoles.roles.length
      },
      realtime: {
        success: results.realtime.success
      }
    },
    files: {
      roles: 'roles.sql',
      schema: 'schema.sql',
      data: 'data.sql',
      custom_roles: 'custom-roles.sql',
      realtime_settings: 'realtime-settings.sql',
      auth_settings: 'auth-settings.json',
      edge_functions: 'edge-functions/',
      storage: 'storage/'
    },
    hashes: {},
    validation: {
      all_components_backed_up: Object.values(results).every(r => r.success),
      total_files: results.database.files.length + 4, // +4 for custom files
      backup_complete: true
    }
  };

  // Calcular hashes dos arquivos principais
  const mainFiles = ['roles.sql', 'schema.sql', 'data.sql', 'custom-roles.sql', 'realtime-settings.sql'];
  for (const filename of mainFiles) {
    const filePath = path.join(backupDir, filename);
    if (fs.existsSync(filePath)) {
      manifest.hashes[filename] = await sha256(filePath);
    }
  }

  const manifestPath = path.join(backupDir, 'backup-manifest.json');
  await writeJson(manifestPath, manifest);
}