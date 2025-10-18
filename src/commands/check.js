const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const { ensureBin, runCommand } = require('../utils/cli');
const { readConfig, validateFor } = require('../utils/config');
const { writeJson } = require('../utils/fsx');
const { IntrospectionService } = require('../services/introspect');
const { showBetaBanner } = require('../utils/banner');

// Exportar FUNÇÃO em vez de objeto Command
module.exports = async (options) => {
  showBetaBanner();
  
  try {
    // Verificar se psql está disponível
    const psqlPath = await ensureBin('psql');
    if (!psqlPath) {
      console.error(chalk.red('❌ psql não encontrado'));
      console.log(chalk.yellow('💡 Instale PostgreSQL:'));
      console.log(chalk.yellow('  https://www.postgresql.org/download/'));
      process.exit(1);
    }

    // Carregar configuração
    const config = await readConfig();
    validateFor(config, 'backup'); // Usar mesma validação do backup

    const databaseUrl = config.supabase.databaseUrl;
    if (!databaseUrl) {
      console.error(chalk.red('❌ databaseUrl não configurada'));
      console.log(chalk.yellow('💡 Configure databaseUrl no .smoonbrc'));
      process.exit(1);
    }

    console.log(chalk.blue(`🔍 Verificando integridade do projeto: ${config.supabase.projectId}`));

    // Executar verificações
    const report = await performChecks(config, databaseUrl);

    // Salvar relatório
    const reportPath = path.resolve(options.output || 'check-report.json');
    await writeJson(reportPath, report);

    // Mostrar resumo
    showCheckSummary(report);

    console.log(chalk.green('\n🎉 Verificação concluída!'));
    console.log(chalk.blue(`📋 Relatório salvo em: ${reportPath}`));

  } catch (error) {
    console.error(chalk.red(`❌ Erro na verificação: ${error.message}`));
    process.exit(1);
  }
};

// Executar todas as verificações
async function performChecks(config, databaseUrl) {
  const report = {
    timestamp: new Date().toISOString(),
    project_id: config.supabase.projectId,
    checks: {}
  };

  // 1. Verificar conexão com database
  console.log(chalk.blue('\n🔌 1/6 - Verificando conexão com database...'));
  report.checks.database_connection = await checkDatabaseConnection(databaseUrl);

  // 2. Verificar extensões
  console.log(chalk.blue('\n🔧 2/6 - Verificando extensões...'));
  report.checks.extensions = await checkExtensions(databaseUrl);

  // 3. Verificar tabelas
  console.log(chalk.blue('\n📊 3/6 - Verificando tabelas...'));
  report.checks.tables = await checkTables(databaseUrl);

  // 4. Verificar políticas RLS
  console.log(chalk.blue('\n🔒 4/6 - Verificando políticas RLS...'));
  report.checks.rls_policies = await checkRLSPolicies(databaseUrl);

  // 5. Verificar Realtime
  console.log(chalk.blue('\n🔄 5/6 - Verificando Realtime...'));
  report.checks.realtime = await checkRealtime(databaseUrl);

  // 6. Verificar Storage
  console.log(chalk.blue('\n📦 6/6 - Verificando Storage...'));
  report.checks.storage = await checkStorage(config);

  return report;
}

// Verificar conexão com database
async function checkDatabaseConnection(databaseUrl) {
  try {
    const { stdout } = await runCommand(
      `psql "${databaseUrl}" -t -c "SELECT 1 as test_connection;"`
    );
    
    if (stdout.trim() === '1') {
      return { status: 'ok', message: 'Conexão estabelecida com sucesso' };
    } else {
      return { status: 'error', message: 'Resposta inesperada da database' };
    }
  } catch (error) {
    return { status: 'error', message: `Falha na conexão: ${error.message}` };
  }
}

// Verificar extensões
async function checkExtensions(databaseUrl) {
  try {
    const query = `
      SELECT extname, extversion 
      FROM pg_extension 
      ORDER BY extname;
    `;
    
    const { stdout } = await runCommand(
      `psql "${databaseUrl}" -t -c "${query}"`
    );
    
    const extensions = stdout.trim().split('\n')
      .filter(line => line.trim())
      .map(line => {
        const [name, version] = line.trim().split('|');
        return { name: name?.trim(), version: version?.trim() };
      });
    
    return {
      status: 'ok',
      message: `${extensions.length} extensões encontradas`,
      data: extensions
    };
  } catch (error) {
    return { status: 'error', message: `Erro ao verificar extensões: ${error.message}` };
  }
}

// Verificar tabelas
async function checkTables(databaseUrl) {
  try {
    const query = `
      SELECT schemaname, tablename, tableowner 
      FROM pg_tables 
      WHERE schemaname IN ('public', 'auth', 'storage') 
      ORDER BY schemaname, tablename;
    `;
    
    const { stdout } = await runCommand(
      `psql "${databaseUrl}" -t -c "${query}"`
    );
    
    const tables = stdout.trim().split('\n')
      .filter(line => line.trim())
      .map(line => {
        const [schema, table, owner] = line.trim().split('|');
        return {
          schema: schema?.trim(),
          table: table?.trim(),
          owner: owner?.trim()
        };
      });
    
    return {
      status: 'ok',
      message: `${tables.length} tabelas encontradas`,
      data: tables
    };
  } catch (error) {
    return { status: 'error', message: `Erro ao verificar tabelas: ${error.message}` };
  }
}

// Verificar políticas RLS
async function checkRLSPolicies(databaseUrl) {
  try {
    const query = `
      SELECT COUNT(*) as policy_count 
      FROM pg_policies;
    `;
    
    const { stdout } = await runCommand(
      `psql "${databaseUrl}" -t -c "${query}"`
    );
    
    const policyCount = parseInt(stdout.trim());
    
    return {
      status: 'ok',
      message: `${policyCount} políticas RLS encontradas`,
      data: { policy_count: policyCount }
    };
  } catch (error) {
    return { status: 'error', message: `Erro ao verificar políticas RLS: ${error.message}` };
  }
}

// Verificar Realtime
async function checkRealtime(databaseUrl) {
  try {
    const query = `
      SELECT pubname 
      FROM pg_publication 
      ORDER BY pubname;
    `;
    
    const { stdout } = await runCommand(
      `psql "${databaseUrl}" -t -c "${query}"`
    );
    
    const publications = stdout.trim().split('\n')
      .filter(line => line.trim())
      .map(line => line.trim());
    
    return {
      status: 'ok',
      message: `${publications.length} publicações Realtime encontradas`,
      data: { publications }
    };
  } catch (error) {
    return { status: 'error', message: `Erro ao verificar Realtime: ${error.message}` };
  }
}

// Verificar Storage
async function checkStorage(config) {
  try {
    const introspection = new IntrospectionService(config);
    const storageInventory = await introspection.getStorageInventory();
    
    const bucketCount = storageInventory.buckets?.length || 0;
    const totalObjects = storageInventory.buckets?.reduce(
      (total, bucket) => total + (bucket.objects?.length || 0), 0
    ) || 0;
    
    return {
      status: 'ok',
      message: `${bucketCount} buckets e ${totalObjects} objetos encontrados`,
      data: storageInventory
    };
  } catch (error) {
    return { status: 'error', message: `Erro ao verificar Storage: ${error.message}` };
  }
}

// Mostrar resumo das verificações
function showCheckSummary(report) {
  console.log(chalk.blue('\n📋 RESUMO DAS VERIFICAÇÕES:'));
  console.log(chalk.blue('═'.repeat(50)));
  
  for (const [checkName, result] of Object.entries(report.checks)) {
    const icon = result.status === 'ok' ? '✅' : '❌';
    const color = result.status === 'ok' ? chalk.green : chalk.red;
    
    console.log(`${icon} ${color(checkName.replace(/_/g, ' ').toUpperCase())}: ${result.message}`);
  }
  
  const okCount = Object.values(report.checks).filter(c => c.status === 'ok').length;
  const totalCount = Object.keys(report.checks).length;
  
  console.log(chalk.blue('═'.repeat(50)));
  console.log(chalk.blue(`📊 Resultado: ${okCount}/${totalCount} verificações passaram`));
  
  if (okCount === totalCount) {
    console.log(chalk.green('🎉 Todas as verificações passaram!'));
  } else {
    console.log(chalk.yellow('⚠️ Algumas verificações falharam. Verifique o relatório completo.'));
  }
}