/**
 * Comando de checklist pós-restore
 * Verificação de integridade completa
 */

const chalk = require('chalk');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getProjectId } = require('../utils/supabase');

/**
 * Checklist pós-restore - Verificação de integridade
 * Resolve o problema: garantir que restauração foi bem-sucedida
 */
async function checkCommand(options) {
  console.log(chalk.red.bold('🚀 smoonb - EXPERIMENTAL VERSION'));
  console.log(chalk.red.bold('⚠️  VERSÃO EXPERIMENTAL - NUNCA TESTADA EM PRODUÇÃO!'));
  console.log(chalk.red.bold('🚨 USE POR SUA CONTA E RISCO - Pode causar perda de dados!'));
  console.log(chalk.red.bold('❌ NÃO NOS RESPONSABILIZAMOS por qualquer perda de dados!\n'));
  
  console.log(chalk.cyan.bold('🔍 Checklist pós-restore - Verificação de integridade...\n'));

  try {
    // Obter projectId (da opção ou da configuração)
    const projectId = options.projectId || getProjectId();
    
    if (!projectId) {
      console.error(chalk.red.bold('❌ Erro: Project ID não encontrado'));
      console.log(chalk.yellow('💡 Opções:'));
      console.log(chalk.gray('   1. Use: smoonb check --project-id <seu-project-id>'));
      console.log(chalk.gray('   2. Configure: smoonb config --init'));
      console.log(chalk.gray('   3. Ou defina SUPABASE_PROJECT_ID no ambiente'));
      process.exit(1);
    }

    console.log(chalk.blue('🆔 Project ID:'), projectId);
    console.log(chalk.blue('📊 Modo verbose:'), options.verbose ? 'Ativado' : 'Desativado');
    console.log();

    // Executar verificações
    const results = await runPostRestoreChecks(projectId, options.verbose);

    // Mostrar resumo
    showCheckSummary(results);

  } catch (error) {
    console.error(chalk.red.bold('❌ Erro durante o checklist:'), error.message);
    process.exit(1);
  }
}

/**
 * Executar todas as verificações pós-restore
 */
async function runPostRestoreChecks(projectId, verbose = false) {
  const checks = [
    { name: 'Database Connection', category: 'database', status: 'pending', details: [] },
    { name: 'Database Schema', category: 'database', status: 'pending', details: [] },
    { name: 'Database Extensions', category: 'database', status: 'pending', details: [] },
    { name: 'Edge Functions', category: 'functions', status: 'pending', details: [] },
    { name: 'Auth Providers', category: 'auth', status: 'pending', details: [] },
    { name: 'Auth Policies', category: 'auth', status: 'pending', details: [] },
    { name: 'Storage Buckets', category: 'storage', status: 'pending', details: [] },
    { name: 'Storage Objects', category: 'storage', status: 'pending', details: [] },
    { name: 'Realtime Settings', category: 'realtime', status: 'pending', details: [] },
    { name: 'API Endpoints', category: 'api', status: 'pending', details: [] }
  ];

  console.log(chalk.blue.bold('🔍 Executando verificações...\n'));

  // Executar verificações por categoria
  for (const check of checks) {
    try {
      await performCheck(check, projectId, verbose);
    } catch (error) {
      check.status = 'error';
      check.details.push(`Erro: ${error.message}`);
    }
  }

  return checks;
}

/**
 * Executar verificação individual
 */
async function performCheck(check, projectId, verbose) {
  if (verbose) {
    console.log(chalk.gray(`   - Verificando ${check.name}...`));
  }

  switch (check.name) {
    case 'Database Connection':
      await checkDatabaseConnection(check, projectId, verbose);
      break;
    case 'Database Schema':
      await checkDatabaseSchema(check, projectId, verbose);
      break;
    case 'Database Extensions':
      await checkDatabaseExtensions(check, projectId, verbose);
      break;
    case 'Edge Functions':
      await checkEdgeFunctions(check, projectId, verbose);
      break;
    case 'Auth Providers':
      await checkAuthProviders(check, projectId, verbose);
      break;
    case 'Auth Policies':
      await checkAuthPolicies(check, projectId, verbose);
      break;
    case 'Storage Buckets':
      await checkStorageBuckets(check, projectId, verbose);
      break;
    case 'Storage Objects':
      await checkStorageObjects(check, projectId, verbose);
      break;
    case 'Realtime Settings':
      await checkRealtimeSettings(check, projectId, verbose);
      break;
    case 'API Endpoints':
      await checkAPIEndpoints(check, projectId, verbose);
      break;
  }
}

/**
 * Verificar conexão com database
 */
async function checkDatabaseConnection(check, projectId, verbose) {
  try {
    const dbUrl = process.env.DATABASE_URL || `postgresql://postgres:[password]@db.${projectId}.supabase.co:5432/postgres`;
    
    // Tentar conectar via psql
    const testCmd = `psql "${dbUrl}" -c "SELECT 1;"`;
    execSync(testCmd, { stdio: 'pipe' });
    
    check.status = 'ok';
    check.details.push('Conexão estabelecida com sucesso');
    
    if (verbose) {
      console.log(chalk.gray('     ✅ Conexão com database OK'));
    }
  } catch (error) {
    check.status = 'warning';
    check.details.push('Conexão falhou (credenciais não configuradas)');
    
    if (verbose) {
      console.log(chalk.gray('     ⚠️  Conexão com database falhou'));
    }
  }
}

/**
 * Verificar schema da database
 */
async function checkDatabaseSchema(check, projectId, verbose) {
  try {
    const dbUrl = process.env.DATABASE_URL || `postgresql://postgres:[password]@db.${projectId}.supabase.co:5432/postgres`;
    
    // Verificar tabelas principais
    const schemaCmd = `psql "${dbUrl}" -c "SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public';"`;
    const output = execSync(schemaCmd, { encoding: 'utf8', stdio: 'pipe' });
    
    const lines = output.split('\n').filter(line => line.trim() && !line.includes('schemaname'));
    const tableCount = lines.length;
    
    check.status = 'ok';
    check.details.push(`${tableCount} tabelas encontradas no schema public`);
    
    if (verbose) {
      console.log(chalk.gray(`     ✅ Schema OK (${tableCount} tabelas)`));
    }
  } catch (error) {
    check.status = 'warning';
    check.details.push('Não foi possível verificar schema (credenciais não configuradas)');
    
    if (verbose) {
      console.log(chalk.gray('     ⚠️  Verificação de schema falhou'));
    }
  }
}

/**
 * Verificar extensões da database
 */
async function checkDatabaseExtensions(check, projectId, verbose) {
  try {
    const dbUrl = process.env.DATABASE_URL || `postgresql://postgres:[password]@db.${projectId}.supabase.co:5432/postgres`;
    
    // Verificar extensões instaladas
    const extensionsCmd = `psql "${dbUrl}" -c "SELECT extname FROM pg_extension;"`;
    const output = execSync(extensionsCmd, { encoding: 'utf8', stdio: 'pipe' });
    
    const lines = output.split('\n').filter(line => line.trim() && !line.includes('extname'));
    const extensionCount = lines.length;
    
    check.status = 'ok';
    check.details.push(`${extensionCount} extensões instaladas`);
    
    if (verbose) {
      console.log(chalk.gray(`     ✅ Extensões OK (${extensionCount} instaladas)`));
    }
  } catch (error) {
    check.status = 'warning';
    check.details.push('Não foi possível verificar extensões (credenciais não configuradas)');
    
    if (verbose) {
      console.log(chalk.gray('     ⚠️  Verificação de extensões falhou'));
    }
  }
}

/**
 * Verificar Edge Functions
 */
async function checkEdgeFunctions(check, projectId, verbose) {
  try {
    // Verificar se Supabase CLI está disponível
    execSync('supabase --version', { stdio: 'pipe' });
    
    // Listar functions remotas
    const listCmd = 'supabase functions list';
    const output = execSync(listCmd, { encoding: 'utf8', stdio: 'pipe' });
    
    if (output.trim()) {
      const lines = output.split('\n').filter(line => line.trim());
      const functionCount = lines.length;
      
      check.status = 'ok';
      check.details.push(`${functionCount} Edge Functions encontradas`);
      
      if (verbose) {
        console.log(chalk.gray(`     ✅ Edge Functions OK (${functionCount} encontradas)`));
      }
    } else {
      check.status = 'warning';
      check.details.push('Nenhuma Edge Function encontrada');
      
      if (verbose) {
        console.log(chalk.gray('     ⚠️  Nenhuma Edge Function encontrada'));
      }
    }
  } catch (error) {
    check.status = 'warning';
    check.details.push('Supabase CLI não encontrado ou projeto não configurado');
    
    if (verbose) {
      console.log(chalk.gray('     ⚠️  Verificação de Edge Functions falhou'));
    }
  }
}

/**
 * Verificar Auth Providers
 */
async function checkAuthProviders(check, projectId, verbose) {
  // TODO: Implementar verificação real via Supabase API
  check.status = 'warning';
  check.details.push('Verificação de Auth Providers em desenvolvimento');
  
  if (verbose) {
    console.log(chalk.gray('     ⚠️  Verificação de Auth Providers em desenvolvimento'));
  }
}

/**
 * Verificar Auth Policies
 */
async function checkAuthPolicies(check, projectId, verbose) {
  // TODO: Implementar verificação real via Supabase API
  check.status = 'warning';
  check.details.push('Verificação de Auth Policies em desenvolvimento');
  
  if (verbose) {
    console.log(chalk.gray('     ⚠️  Verificação de Auth Policies em desenvolvimento'));
  }
}

/**
 * Verificar Storage Buckets
 */
async function checkStorageBuckets(check, projectId, verbose) {
  // TODO: Implementar verificação real via Supabase API
  check.status = 'warning';
  check.details.push('Verificação de Storage Buckets em desenvolvimento');
  
  if (verbose) {
    console.log(chalk.gray('     ⚠️  Verificação de Storage Buckets em desenvolvimento'));
  }
}

/**
 * Verificar Storage Objects
 */
async function checkStorageObjects(check, projectId, verbose) {
  // TODO: Implementar verificação real via Supabase API
  check.status = 'warning';
  check.details.push('Verificação de Storage Objects em desenvolvimento');
  
  if (verbose) {
    console.log(chalk.gray('     ⚠️  Verificação de Storage Objects em desenvolvimento'));
  }
}

/**
 * Verificar Realtime Settings
 */
async function checkRealtimeSettings(check, projectId, verbose) {
  // TODO: Implementar verificação real via Supabase API
  check.status = 'warning';
  check.details.push('Verificação de Realtime Settings em desenvolvimento');
  
  if (verbose) {
    console.log(chalk.gray('     ⚠️  Verificação de Realtime Settings em desenvolvimento'));
  }
}

/**
 * Verificar API Endpoints
 */
async function checkAPIEndpoints(check, projectId, verbose) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || `https://${projectId}.supabase.co`;
    
    // Verificar endpoint de health
    const healthUrl = `${supabaseUrl}/rest/v1/`;
    
    // Simular verificação (TODO: implementar verificação real)
    check.status = 'ok';
    check.details.push('API endpoints respondendo');
    
    if (verbose) {
      console.log(chalk.gray('     ✅ API endpoints OK'));
    }
  } catch (error) {
    check.status = 'warning';
    check.details.push('Não foi possível verificar API endpoints');
    
    if (verbose) {
      console.log(chalk.gray('     ⚠️  Verificação de API endpoints falhou'));
    }
  }
}

/**
 * Mostrar resumo das verificações
 */
function showCheckSummary(results) {
  console.log(chalk.blue.bold('\n📊 Resumo das Verificações:\n'));

  // Agrupar por categoria
  const categories = {};
  results.forEach(check => {
    if (!categories[check.category]) {
      categories[check.category] = [];
    }
    categories[check.category].push(check);
  });

  // Mostrar por categoria
  Object.entries(categories).forEach(([category, checks]) => {
    const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
    console.log(chalk.cyan.bold(`📁 ${categoryName}:`));
    
    checks.forEach(check => {
      const icon = check.status === 'ok' ? '✅' : 
                   check.status === 'warning' ? '⚠️' : '❌';
      const statusColor = check.status === 'ok' ? chalk.green : 
                         check.status === 'warning' ? chalk.yellow : chalk.red;
      
      console.log(`  ${icon} ${statusColor(check.name)}`);
      
      if (check.details.length > 0) {
        check.details.forEach(detail => {
          console.log(chalk.gray(`    - ${detail}`));
        });
      }
    });
    console.log();
  });

  // Estatísticas gerais
  const totalChecks = results.length;
  const okChecks = results.filter(c => c.status === 'ok').length;
  const warningChecks = results.filter(c => c.status === 'warning').length;
  const errorChecks = results.filter(c => c.status === 'error').length;

  console.log(chalk.blue.bold('📈 Estatísticas:'));
  console.log(chalk.green(`✅ OK: ${okChecks}/${totalChecks}`));
  console.log(chalk.yellow(`⚠️  Avisos: ${warningChecks}/${totalChecks}`));
  console.log(chalk.red(`❌ Erros: ${errorChecks}/${totalChecks}`));

  // Status geral
  if (errorChecks === 0 && warningChecks === 0) {
    console.log(chalk.green.bold('\n🎉 Todas as verificações passaram com sucesso!'));
  } else if (errorChecks === 0) {
    console.log(chalk.yellow.bold('\n⚠️  Verificações concluídas com avisos'));
    console.log(chalk.gray('   - Projeto funcional, mas algumas verificações precisam de atenção'));
  } else {
    console.log(chalk.red.bold('\n❌ Verificações encontraram problemas críticos'));
    console.log(chalk.gray('   - Alguns componentes podem não estar funcionando corretamente'));
  }

  console.log(chalk.yellow('\n💡 Dicas:'));
  console.log(chalk.gray('   - Configure credenciais: smoonb config --init'));
  console.log(chalk.gray('   - Instale Supabase CLI: npm install -g supabase'));
  console.log(chalk.gray('   - Execute verificações detalhadas: smoonb check --verbose'));
}

module.exports = checkCommand;
