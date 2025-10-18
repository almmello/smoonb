const chalk = require('chalk');
const path = require('path');
const { ensureBin, runCommand } = require('../utils/cli');
const { ensureDir, writeJson, copyDir } = require('../utils/fsx');
const { sha256 } = require('../utils/hash');
const { readConfig, validateFor } = require('../utils/config');
const { IntrospectionService } = require('../services/introspect');
const { showBetaBanner } = require('../index');

// Exportar FUNÇÃO em vez de objeto Command
module.exports = async (options) => {
  showBetaBanner();
  
  try {
    // Verificar se Supabase CLI está disponível
    const supabasePath = await ensureBin('supabase');
    if (!supabasePath) {
      console.error(chalk.red('❌ Supabase CLI não encontrado'));
      console.log(chalk.yellow('💡 Instale o Supabase CLI:'));
      console.log(chalk.yellow('  npm install -g supabase'));
      console.log(chalk.yellow('  ou visite: https://supabase.com/docs/guides/cli'));
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

    // 1. Backup da Database usando Supabase CLI
    console.log(chalk.blue('\n📊 1/3 - Backup da Database PostgreSQL...'));
    await backupDatabaseWithSupabaseCLI(databaseUrl, backupDir);

    // 2. Gerar inventário real
    console.log(chalk.blue('\n🔍 2/3 - Gerando inventário completo...'));
    await generateInventory(config, backupDir);

    // 3. Backup das Edge Functions locais
    console.log(chalk.blue('\n⚡ 3/3 - Backup das Edge Functions locais...'));
    await backupLocalFunctions(backupDir);

    // Gerar manifesto do backup
    await generateBackupManifest(config, backupDir);

    console.log(chalk.green('\n🎉 Backup completo finalizado!'));
    console.log(chalk.blue(`📁 Localização: ${backupDir}`));

  } catch (error) {
    console.error(chalk.red(`❌ Erro no backup: ${error.message}`));
    process.exit(1);
  }
};

// Backup da database usando Supabase CLI
async function backupDatabaseWithSupabaseCLI(databaseUrl, backupDir) {
  try {
    console.log(chalk.blue('   - Exportando roles...'));
    const { stdout: rolesOutput } = await runCommand(
      `supabase db dump --db-url "${databaseUrl}" -f roles.sql --role-only`
    );
    
    console.log(chalk.blue('   - Exportando schema...'));
    const { stdout: schemaOutput } = await runCommand(
      `supabase db dump --db-url "${databaseUrl}" -f schema.sql`
    );
    
    console.log(chalk.blue('   - Exportando dados...'));
    const { stdout: dataOutput } = await runCommand(
      `supabase db dump --db-url "${databaseUrl}" -f data.sql --use-copy --data-only`
    );

    console.log(chalk.green('✅ Database exportada com sucesso'));
  } catch (error) {
    throw new Error(`Falha no backup da database: ${error.message}`);
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
    const fs = require('fs');
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
async function generateBackupManifest(config, backupDir) {
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
    inventory: {}
  };

  // Calcular hashes dos arquivos SQL
  const fs = require('fs');
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