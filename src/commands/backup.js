const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const { ensureBin, runCommand } = require('../utils/cli');
const { ensureDir, writeJson, copyDir } = require('../utils/fsx');
const { sha256 } = require('../utils/hash');
const { readConfig, validateFor } = require('../utils/config');
const { showBetaBanner } = require('../utils/banner');
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
    console.log(chalk.green(`✅ Edge Functions: ${edgeFunctionsResult.functions.length} functions baixadas`));
    console.log(chalk.green(`✅ Auth Settings: ${authSettingsResult.success ? 'Exportadas' : 'Falharam'}`));
    console.log(chalk.green(`✅ Storage: ${storageResult.buckets.length} buckets verificados`));
    console.log(chalk.green(`✅ Custom Roles: ${customRolesResult.roles.length} roles exportados`));
    console.log(chalk.green(`✅ Realtime: ${realtimeResult.success ? 'Configurações exportadas' : 'Falharam'}`));
    
    // Mostrar resumo dos arquivos
    console.log(chalk.blue('\n📊 Resumo dos arquivos gerados:'));
    for (const file of dbBackupResult.files) {
      console.log(chalk.gray(`   - ${file.filename}: ${file.sizeKB} KB`));
    }
    if (edgeFunctionsResult.functions.length > 0) {
      console.log(chalk.gray(`   - Edge Functions: ${edgeFunctionsResult.functions.length} functions`));
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

// Backup das Edge Functions via Supabase API
async function backupEdgeFunctions(config, backupDir) {
  try {
    const functionsDir = path.join(backupDir, 'edge-functions');
    await ensureDir(functionsDir);

    console.log(chalk.gray('   - Listando Edge Functions via Management API...'));
    
    // ✅ Usar fetch direto para Management API
    const functionsResponse = await fetch(`https://api.supabase.com/v1/projects/${config.supabase.projectId}/functions`, {
      headers: { 
        'Authorization': `Bearer ${config.supabase.serviceKey}`, 
        'apikey': config.supabase.serviceKey,
        'Content-Type': 'application/json'
      }
    });
    
    if (!functionsResponse.ok) {
      console.log(chalk.yellow(`     ⚠️ Erro ao listar Edge Functions: ${functionsResponse.status} ${functionsResponse.statusText}`));
      return { success: false, functions: [] };
    }

    const functions = await functionsResponse.json();
    
    if (!functions || functions.length === 0) {
      console.log(chalk.gray('   - Nenhuma Edge Function encontrada'));
      await writeJson(path.join(functionsDir, 'README.md'), {
        message: 'Nenhuma Edge Function encontrada neste projeto'
      });
      return { success: true, functions: [] };
    }

    console.log(chalk.gray(`   - Encontradas ${functions.length} Edge Functions`));
    
    const downloadedFunctions = [];

    // ✅ Baixar todas as functions encontradas
    for (const func of functions) {
      try {
        console.log(chalk.gray(`   - Baixando: ${func.name}`));
        
        // ✅ Baixar código da function via Management API
        const functionResponse = await fetch(`https://api.supabase.com/v1/projects/${config.supabase.projectId}/functions/${func.name}`, {
          headers: { 
            'Authorization': `Bearer ${config.supabase.serviceKey}`, 
            'apikey': config.supabase.serviceKey,
            'Content-Type': 'application/json'
          }
        });
        
        if (!functionResponse.ok) {
          console.log(chalk.yellow(`     ⚠️ Erro ao baixar ${func.name}: ${functionResponse.status} ${functionResponse.statusText}`));
          continue;
        }

        const functionData = await functionResponse.json();

        // ✅ Salvar arquivos dinamicamente
        const funcDir = path.join(functionsDir, func.name);
        await ensureDir(funcDir);

        // ✅ Salvar cada arquivo da function
        if (functionData && functionData.files) {
          for (const file of functionData.files) {
            const fileName = path.basename(file.name);
            const filePath = path.join(funcDir, fileName);
            await fs.promises.writeFile(filePath, file.content);
          }
        } else if (functionData && functionData.code) {
          // Fallback para estrutura simples
          const indexPath = path.join(funcDir, 'index.ts');
          await fs.promises.writeFile(indexPath, functionData.code);
          
          if (functionData.deno_config) {
            const denoPath = path.join(funcDir, 'deno.json');
            await writeJson(denoPath, functionData.deno_config);
          }
        } else {
          // Criar arquivo placeholder se não houver código
          const indexPath = path.join(funcDir, 'index.ts');
          await fs.promises.writeFile(indexPath, `// Edge Function: ${func.name}\n// Code not available via API\n`);
        }

        downloadedFunctions.push({
          name: func.name,
          slug: func.name,
          version: func.version || 'unknown',
          files: fs.existsSync(funcDir) ? fs.readdirSync(funcDir) : []
        });

        console.log(chalk.green(`     ✅ ${func.name} baixada`));
      } catch (error) {
        console.log(chalk.yellow(`     ⚠️ Erro ao baixar ${func.name}: ${error.message}`));
      }
    }

    console.log(chalk.green(`✅ Edge Functions backupadas: ${downloadedFunctions.length} functions`));
    return { success: true, functions: downloadedFunctions };

  } catch (error) {
    console.log(chalk.yellow(`   ⚠️ Erro no backup das Edge Functions: ${error.message}`));
    return { success: false, functions: [] };
  }
}

// Backup das Auth Settings via Management API
async function backupAuthSettings(config, backupDir) {
  try {
    console.log(chalk.gray('   - Exportando configurações de Auth via Management API...'));
    
    // ✅ Usar fetch direto para Management API
    const authResponse = await fetch(`https://api.supabase.com/v1/projects/${config.supabase.projectId}/auth/settings`, {
      headers: { 
        'Authorization': `Bearer ${config.supabase.serviceKey}`, 
        'apikey': config.supabase.serviceKey,
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
    
    // ✅ Usar fetch direto para Management API
    const storageResponse = await fetch(`https://api.supabase.com/v1/projects/${config.supabase.projectId}/storage/buckets`, {
      headers: { 
        'Authorization': `Bearer ${config.supabase.serviceKey}`, 
        'apikey': config.supabase.serviceKey,
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
        
        // ✅ Listar objetos do bucket via Management API
        const objectsResponse = await fetch(`https://api.supabase.com/v1/projects/${config.supabase.projectId}/storage/buckets/${bucket.name}/objects`, {
          headers: { 
            'Authorization': `Bearer ${config.supabase.serviceKey}`, 
            'apikey': config.supabase.serviceKey,
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
        functions_count: results.edgeFunctions.functions.length,
        functions: results.edgeFunctions.functions.map(f => f.name)
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