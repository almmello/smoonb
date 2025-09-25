/**
 * Comando de gerenciamento de Edge Functions
 * Deploy via Supabase CLI
 */

const chalk = require('chalk');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Gerenciamento de Edge Functions
 * Resolve o problema: Edge Functions ficam fora da database
 */
async function functionsCommand(options) {
  console.log(chalk.red.bold('🚀 smoonb v0.0.1 - EXPERIMENTAL VERSION'));
  console.log(chalk.red.bold('⚠️  VERSÃO EXPERIMENTAL - NUNCA TESTADA EM PRODUÇÃO!'));
  console.log(chalk.red.bold('🚨 USE POR SUA CONTA E RISCO - Pode causar perda de dados!'));
  console.log(chalk.red.bold('❌ NÃO NOS RESPONSABILIZAMOS por qualquer perda de dados!\n'));
  
  console.log(chalk.cyan.bold('⚡ Gerenciamento de Edge Functions...\n'));

  try {
    const args = process.argv.slice(3); // Remover 'smoonb', 'functions'
    
    if (args.length === 0) {
      showFunctionsHelp();
      return;
    }

    const action = args[0];

    switch (action) {
      case 'push':
        await pushFunctions(options);
        break;
      case 'pull':
        await pullFunctions(options);
        break;
      case 'list':
        await listFunctions(options);
        break;
      case 'backup':
        await backupFunctions(options);
        break;
      case 'restore':
        await restoreFunctions(options);
        break;
      default:
        console.error(chalk.red.bold('❌ Ação não reconhecida:'), action);
        showFunctionsHelp();
        process.exit(1);
    }

  } catch (error) {
    console.error(chalk.red.bold('❌ Erro durante o gerenciamento de functions:'), error.message);
    process.exit(1);
  }
}

/**
 * Deploy de Edge Functions via Supabase CLI
 */
async function pushFunctions(options) {
  console.log(chalk.blue.bold('🚀 Deploy de Edge Functions...\n'));

  try {
    // Verificar se Supabase CLI está instalado
    if (!await checkSupabaseCLI()) {
      return;
    }

    // Verificar se existe pasta supabase/functions
    const functionsDir = 'supabase/functions';
    if (!fs.existsSync(functionsDir)) {
      console.log(chalk.yellow('⚠️  Pasta supabase/functions não encontrada'));
      console.log(chalk.gray('   - Crie a estrutura: mkdir -p supabase/functions'));
      console.log(chalk.gray('   - Ou use "smoonb functions pull" para baixar functions existentes'));
      return;
    }

    // Listar functions locais
    const localFunctions = fs.readdirSync(functionsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    if (localFunctions.length === 0) {
      console.log(chalk.yellow('⚠️  Nenhuma Edge Function encontrada em supabase/functions'));
      return;
    }

    console.log(chalk.gray('   - Functions locais encontradas:'));
    localFunctions.forEach(func => {
      console.log(chalk.gray(`     • ${func}`));
    });

    // Deploy via Supabase CLI
    console.log(chalk.gray('\n   - Executando deploy via Supabase CLI...'));
    
    try {
      const deployCmd = 'supabase functions deploy';
      execSync(deployCmd, { stdio: 'inherit' });
      
      console.log(chalk.green('✅ Edge Functions deployadas com sucesso!'));
      console.log(chalk.blue('🔢 Functions deployadas:'), localFunctions.length);
      
    } catch (error) {
      console.log(chalk.yellow('⚠️  Deploy falhou (projeto não configurado)'));
      console.log(chalk.gray('   - Configure o projeto: supabase link --project-ref <project-id>'));
      console.log(chalk.gray('   - Ou use: smoonb config --init'));
    }

  } catch (error) {
    console.error(chalk.red.bold('❌ Erro durante deploy de functions:'), error.message);
    throw error;
  }
}

/**
 * Baixar Edge Functions do projeto remoto
 */
async function pullFunctions(options) {
  console.log(chalk.blue.bold('📥 Baixando Edge Functions do projeto...\n'));

  try {
    // Verificar se Supabase CLI está instalado
    if (!await checkSupabaseCLI()) {
      return;
    }

    // Criar estrutura de pastas se não existir
    const functionsDir = 'supabase/functions';
    if (!fs.existsSync(functionsDir)) {
      await fs.promises.mkdir(functionsDir, { recursive: true });
      console.log(chalk.gray('   - Pasta supabase/functions criada'));
    }

    // Listar functions remotas
    console.log(chalk.gray('   - Listando functions remotas...'));
    
    try {
      const listCmd = 'supabase functions list';
      const output = execSync(listCmd, { encoding: 'utf8', stdio: 'pipe' });
      
      if (output.trim()) {
        console.log(chalk.gray('   - Functions remotas encontradas:'));
        console.log(chalk.gray(output));
      } else {
        console.log(chalk.yellow('⚠️  Nenhuma Edge Function encontrada no projeto remoto'));
        return;
      }
      
    } catch (error) {
      console.log(chalk.yellow('⚠️  Não foi possível listar functions remotas'));
      console.log(chalk.gray('   - Configure o projeto: supabase link --project-ref <project-id>'));
      return;
    }

    // TODO: Implementar download real das functions
    console.log(chalk.yellow('⚠️  Download de functions remotas em desenvolvimento'));
    console.log(chalk.gray('   - Use o Supabase CLI diretamente para baixar functions específicas'));

  } catch (error) {
    console.error(chalk.red.bold('❌ Erro durante pull de functions:'), error.message);
    throw error;
  }
}

/**
 * Listar Edge Functions (locais e remotas)
 */
async function listFunctions(options) {
  console.log(chalk.blue.bold('📋 Listando Edge Functions...\n'));

  try {
    // Listar functions locais
    const functionsDir = 'supabase/functions';
    if (fs.existsSync(functionsDir)) {
      const localFunctions = fs.readdirSync(functionsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      console.log(chalk.green('📁 Functions Locais:'));
      if (localFunctions.length > 0) {
        localFunctions.forEach(func => {
          console.log(chalk.gray(`   • ${func}`));
        });
      } else {
        console.log(chalk.gray('   (nenhuma function local encontrada)'));
      }
    } else {
      console.log(chalk.yellow('⚠️  Pasta supabase/functions não encontrada'));
    }

    // Listar functions remotas
    console.log(chalk.green('\n🌐 Functions Remotas:'));
    if (await checkSupabaseCLI()) {
      try {
        const listCmd = 'supabase functions list';
        const output = execSync(listCmd, { encoding: 'utf8', stdio: 'pipe' });
        
        if (output.trim()) {
          console.log(chalk.gray(output));
        } else {
          console.log(chalk.gray('   (nenhuma function remota encontrada)'));
        }
      } catch (error) {
        console.log(chalk.gray('   (não foi possível conectar ao projeto remoto)'));
      }
    }

  } catch (error) {
    console.error(chalk.red.bold('❌ Erro durante listagem de functions:'), error.message);
    throw error;
  }
}

/**
 * Backup de Edge Functions locais
 */
async function backupFunctions(options) {
  console.log(chalk.blue.bold('💾 Backup de Edge Functions...\n'));

  try {
    const functionsDir = 'supabase/functions';
    if (!fs.existsSync(functionsDir)) {
      console.log(chalk.yellow('⚠️  Pasta supabase/functions não encontrada'));
      return;
    }

    // Criar diretório de backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = `functions-backup-${timestamp}`;
    await fs.promises.mkdir(backupDir, { recursive: true });

    // Copiar functions
    const localFunctions = fs.readdirSync(functionsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    if (localFunctions.length === 0) {
      console.log(chalk.yellow('⚠️  Nenhuma Edge Function encontrada para backup'));
      return;
    }

    console.log(chalk.gray('   - Copiando functions:'));
    for (const func of localFunctions) {
      const srcPath = path.join(functionsDir, func);
      const destPath = path.join(backupDir, func);
      
      // Copiar recursivamente (Windows compatible)
      execSync(`xcopy "${srcPath}" "${destPath}" /E /I /Y`, { stdio: 'pipe' });
      console.log(chalk.gray(`     • ${func}`));
    }

    // Criar manifesto do backup
    const manifest = {
      timestamp: new Date().toISOString(),
      functions: localFunctions,
      count: localFunctions.length
    };

    const manifestPath = path.join(backupDir, 'functions-manifest.json');
    await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(chalk.green('✅ Backup de Edge Functions concluído!'));
    console.log(chalk.blue('📁 Diretório:'), backupDir);
    console.log(chalk.blue('🔢 Functions backupadas:'), localFunctions.length);

  } catch (error) {
    console.error(chalk.red.bold('❌ Erro durante backup de functions:'), error.message);
    throw error;
  }
}

/**
 * Restaurar Edge Functions de backup
 */
async function restoreFunctions(options) {
  console.log(chalk.blue.bold('🔄 Restaurando Edge Functions...\n'));

  try {
    // Procurar diretório de backup mais recente
    const backupDirs = fs.readdirSync('.')
      .filter(dir => dir.startsWith('functions-backup-'))
      .sort()
      .reverse();

    if (backupDirs.length === 0) {
      console.error(chalk.red.bold('❌ Nenhum backup de functions encontrado'));
      console.log(chalk.yellow('💡 Use "smoonb functions backup" primeiro'));
      return;
    }

    const backupDir = backupDirs[0];
    console.log(chalk.gray(`   - Usando backup: ${backupDir}`));

    // Verificar manifesto
    const manifestPath = path.join(backupDir, 'functions-manifest.json');
    let manifest = null;
    if (fs.existsSync(manifestPath)) {
      const manifestContent = await fs.promises.readFile(manifestPath, 'utf8');
      manifest = JSON.parse(manifestContent);
      console.log(chalk.gray(`   - Backup de: ${manifest.timestamp}`));
      console.log(chalk.gray(`   - Functions: ${manifest.count}`));
    }

    // Criar pasta de destino
    const functionsDir = 'supabase/functions';
    if (!fs.existsSync(functionsDir)) {
      await fs.promises.mkdir(functionsDir, { recursive: true });
    }

    // Restaurar functions
    const functions = fs.readdirSync(backupDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    console.log(chalk.gray('   - Restaurando functions:'));
    for (const func of functions) {
      const srcPath = path.join(backupDir, func);
      const destPath = path.join(functionsDir, func);
      
      // Copiar recursivamente (Windows compatible)
      execSync(`xcopy "${srcPath}" "${destPath}" /E /I /Y`, { stdio: 'pipe' });
      console.log(chalk.gray(`     • ${func}`));
    }

    console.log(chalk.green('✅ Edge Functions restauradas com sucesso!'));
    console.log(chalk.blue('📁 Destino:'), functionsDir);
    console.log(chalk.blue('🔢 Functions restauradas:'), functions.length);
    console.log(chalk.yellow('\n💡 Use "smoonb functions push" para deployar as functions'));

  } catch (error) {
    console.error(chalk.red.bold('❌ Erro durante restauração de functions:'), error.message);
    throw error;
  }
}

/**
 * Verificar se Supabase CLI está instalado
 */
async function checkSupabaseCLI() {
  try {
    execSync('supabase --version', { stdio: 'pipe' });
    return true;
  } catch (error) {
    console.log(chalk.yellow('⚠️  Supabase CLI não encontrado'));
    console.log(chalk.gray('   - Instale: npm install -g supabase'));
    console.log(chalk.gray('   - Ou: https://supabase.com/docs/guides/cli/getting-started'));
    return false;
  }
}

/**
 * Mostrar ajuda do comando functions
 */
function showFunctionsHelp() {
  console.log(chalk.cyan.bold('⚡ Comandos de Edge Functions disponíveis:\n'));
  console.log(chalk.cyan('  push'), chalk.gray('    - Deploy de Edge Functions via Supabase CLI'));
  console.log(chalk.cyan('  pull'), chalk.gray('    - Baixar Edge Functions do projeto remoto'));
  console.log(chalk.cyan('  list'), chalk.gray('    - Listar Edge Functions (locais e remotas)'));
  console.log(chalk.cyan('  backup'), chalk.gray('  - Backup de Edge Functions locais'));
  console.log(chalk.cyan('  restore'), chalk.gray(' - Restaurar Edge Functions de backup'));
  console.log(chalk.yellow('\n💡 Exemplos:'));
  console.log(chalk.gray('  smoonb functions push'));
  console.log(chalk.gray('  smoonb functions list'));
  console.log(chalk.gray('  smoonb functions backup'));
  console.log(chalk.gray('  smoonb functions restore'));
  console.log(chalk.yellow('\n📋 Pré-requisitos:'));
  console.log(chalk.gray('  - Supabase CLI instalado: npm install -g supabase'));
  console.log(chalk.gray('  - Projeto configurado: supabase link --project-ref <project-id>'));
}

module.exports = functionsCommand;
