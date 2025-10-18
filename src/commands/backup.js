const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const { ensureBin, runCommand } = require('../utils/cli');
const { ensureDir, writeJson, copyDir } = require('../utils/fsx');
const { sha256 } = require('../utils/hash');
const { readConfig, validateFor } = require('../utils/config');
const { IntrospectionService } = require('../services/introspect');
const { showBetaBanner } = require('../utils/banner');

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
    
    // Criar diretório de backup com timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(outputDir, `backup-${timestamp}`);
    await ensureDir(backupDir);

    console.log(chalk.blue(`🚀 Iniciando backup do projeto: ${config.supabase.projectId}`));
    console.log(chalk.blue(`📁 Diretório: ${backupDir}`));
    console.log(chalk.gray(`🔧 Usando pg_dump: ${pgDumpPath}`));

    // 1. Backup da Database usando pg_dump/pg_dumpall
    console.log(chalk.blue('\n📊 1/3 - Backup da Database PostgreSQL...'));
    const dbBackupResult = await backupDatabaseWithPgDump(databaseUrl, backupDir, pgDumpPath);
    
    if (!dbBackupResult.success) {
      console.error(chalk.red('❌ Falha crítica no backup da database'));
      console.log(chalk.yellow('💡 Verifique:'));
      console.log(chalk.yellow('  - Se DATABASE_URL está correta'));
      console.log(chalk.yellow('  - Se as credenciais estão corretas'));
      console.log(chalk.yellow('  - Se o banco está acessível'));
      process.exit(1);
    }

    // 2. Gerar inventário real
    console.log(chalk.blue('\n🔍 2/3 - Gerando inventário completo...'));
    await generateInventory(config, backupDir);

    // 3. Backup das Edge Functions locais
    console.log(chalk.blue('\n⚡ 3/3 - Backup das Edge Functions locais...'));
    await backupLocalFunctions(backupDir);

    // Gerar manifesto do backup
    await generateBackupManifest(config, backupDir, dbBackupResult.files);

    console.log(chalk.green('\n🎉 Backup completo finalizado!'));
    console.log(chalk.blue(`📁 Localização: ${backupDir}`));
    console.log(chalk.green(`✅ Database: ${dbBackupResult.files.length} arquivos SQL gerados`));

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

    // 1. Backup dos roles usando pg_dumpall
    console.log(chalk.blue('   - Exportando roles...'));
    const rolesFile = path.join(backupDir, 'roles.sql');
    const rolesCommand = `"${pgDumpPath.replace('pg_dump', 'pg_dumpall')}" --host=${host} --port=${port} --username=${username} --roles-only -f "${rolesFile}"`;
    
    try {
      await runCommand(rolesCommand, {
        env: { ...process.env, PGPASSWORD: password }
      });
      
      if (await validateSqlFile(rolesFile)) {
        files.push('roles.sql');
        console.log(chalk.green('     ✅ Roles exportados com sucesso'));
      } else {
        console.log(chalk.yellow('     ⚠️ Arquivo roles.sql está vazio'));
        success = false;
      }
    } catch (error) {
      console.log(chalk.red(`     ❌ Erro ao exportar roles: ${error.message}`));
      success = false;
    }

    // 2. Backup do schema usando pg_dump
    console.log(chalk.blue('   - Exportando schema...'));
    const schemaFile = path.join(backupDir, 'schema.sql');
    const schemaCommand = `"${pgDumpPath}" --host=${host} --port=${port} --username=${username} --schema-only -f "${schemaFile}" ${database}`;
    
    try {
      await runCommand(schemaCommand, {
        env: { ...process.env, PGPASSWORD: password }
      });
      
      if (await validateSqlFile(schemaFile)) {
        files.push('schema.sql');
        console.log(chalk.green('     ✅ Schema exportado com sucesso'));
      } else {
        console.log(chalk.yellow('     ⚠️ Arquivo schema.sql está vazio'));
        success = false;
      }
    } catch (error) {
      console.log(chalk.red(`     ❌ Erro ao exportar schema: ${error.message}`));
      success = false;
    }

    // 3. Backup dos dados usando pg_dump
    console.log(chalk.blue('   - Exportando dados...'));
    const dataFile = path.join(backupDir, 'data.sql');
    const dataCommand = `"${pgDumpPath}" --host=${host} --port=${port} --username=${username} --data-only --use-copy -f "${dataFile}" ${database}`;
    
    try {
      await runCommand(dataCommand, {
        env: { ...process.env, PGPASSWORD: password }
      });
      
      if (await validateSqlFile(dataFile)) {
        files.push('data.sql');
        console.log(chalk.green('     ✅ Dados exportados com sucesso'));
      } else {
        console.log(chalk.yellow('     ⚠️ Arquivo data.sql está vazio'));
        success = false;
      }
    } catch (error) {
      console.log(chalk.red(`     ❌ Erro ao exportar dados: ${error.message}`));
      success = false;
    }

    return { success, files };
  } catch (error) {
    throw new Error(`Falha no backup da database: ${error.message}`);
  }
}

// Validar arquivo SQL (não vazio e com conteúdo válido)
async function validateSqlFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return false;
    }

    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      return false;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    
    // Verificar se contém conteúdo SQL válido
    const sqlKeywords = ['CREATE', 'INSERT', 'COPY', 'ALTER', 'DROP', 'GRANT', 'REVOKE'];
    const hasValidContent = sqlKeywords.some(keyword => 
      content.toUpperCase().includes(keyword)
    );

    return hasValidContent;
  } catch (error) {
    return false;
  }
}

// Gerar inventário completo
async function generateInventory(config, backupDir) {
  try {
    const introspection = new IntrospectionService(config);
    const inventory = await introspection.generateFullInventory();

    // Salvar inventário em arquivos separados
    const inventoryDir = path.join(backupDir, 'inventory');
    await ensureDir(inventoryDir);

    for (const [component, data] of Object.entries(inventory.components)) {
      const filePath = path.join(inventoryDir, `${component}.json`);
      await writeJson(filePath, data);
    }

    console.log(chalk.green('✅ Inventário completo gerado'));
  } catch (error) {
    console.log(chalk.yellow(`⚠️ Erro ao gerar inventário: ${error.message}`));
  }
}

// Backup das Edge Functions locais
async function backupLocalFunctions(backupDir) {
  const localFunctionsPath = 'supabase/functions';
  
  try {
    if (fs.existsSync(localFunctionsPath)) {
      const functionsBackupDir = path.join(backupDir, 'functions');
      await copyDir(localFunctionsPath, functionsBackupDir);
      console.log(chalk.green('✅ Edge Functions locais copiadas'));
    } else {
      console.log(chalk.yellow('⚠️ Diretório supabase/functions não encontrado'));
    }
  } catch (error) {
    console.log(chalk.yellow(`⚠️ Erro ao copiar Edge Functions: ${error.message}`));
  }
}

// Gerar manifesto do backup
async function generateBackupManifest(config, backupDir, sqlFiles) {
  const manifest = {
    created_at: new Date().toISOString(),
    project_id: config.supabase.projectId,
    smoonb_version: require('../../package.json').version,
    backup_type: 'complete',
    files: {
      roles: 'roles.sql',
      schema: 'schema.sql',
      data: 'data.sql'
    },
    hashes: {},
    inventory: {},
    validation: {
      sql_files_created: sqlFiles.length,
      sql_files_valid: sqlFiles.length === 3
    }
  };

  // Calcular hashes dos arquivos SQL
  for (const [type, filename] of Object.entries(manifest.files)) {
    const filePath = path.join(backupDir, filename);
    if (fs.existsSync(filePath)) {
      manifest.hashes[type] = await sha256(filePath);
    }
  }

  // Adicionar referências ao inventário
  const inventoryDir = path.join(backupDir, 'inventory');
  if (fs.existsSync(inventoryDir)) {
    const inventoryFiles = fs.readdirSync(inventoryDir);
    manifest.inventory = inventoryFiles.reduce((acc, file) => {
      const component = path.basename(file, '.json');
      acc[component] = `inventory/${file}`;
      return acc;
    }, {});
  }

  const manifestPath = path.join(backupDir, 'backup-manifest.json');
  await writeJson(manifestPath, manifest);
}