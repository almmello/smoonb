const chalk = require('chalk');
const { ensureBin, runCommand } = require('../utils/cli');
const { readConfig, validateFor } = require('../utils/config');
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

    console.log(chalk.blue('⚡ Comandos disponíveis para Edge Functions:'));
    console.log(chalk.yellow('\n📋 Listar functions:'));
    console.log(chalk.gray('  npx smoonb functions list'));
    console.log(chalk.yellow('\n🚀 Deploy functions:'));
    console.log(chalk.gray('  npx smoonb functions push'));
    console.log(chalk.yellow('\n📥 Pull functions (se disponível):'));
    console.log(chalk.gray('  npx smoonb functions pull'));
    console.log(chalk.yellow('\n💡 Para mais opções, use o Supabase CLI diretamente:'));
    console.log(chalk.gray('  supabase functions --help'));

  } catch (error) {
    console.error(chalk.red(`❌ Erro: ${error.message}`));
    process.exit(1);
  }
};

// Função para listar functions
async function listFunctions() {
  try {
    const config = await readConfig();
    validateFor(config, 'inventory');

    console.log(chalk.blue('📋 Listando Edge Functions...'));

    const { stdout, stderr } = await runCommand(
      'supabase functions list',
      {
        env: { 
          ...process.env, 
          SUPABASE_ACCESS_TOKEN: config.supabase.serviceKey 
        }
      }
    );

    if (stderr && !stderr.includes('WARN')) {
      console.log(chalk.yellow(`⚠️ Avisos: ${stderr}`));
    }

    console.log(chalk.green('✅ Edge Functions listadas:'));
    console.log(stdout);

  } catch (error) {
    console.error(chalk.red(`❌ Erro ao listar functions: ${error.message}`));
    process.exit(1);
  }
}

// Função para deploy de functions
async function pushFunctions(projectRef) {
  try {
    const config = await readConfig();
    const projectId = projectRef || config.supabase.projectId;

    if (!projectId) {
      console.error(chalk.red('❌ Project ID não encontrado'));
      console.log(chalk.yellow('💡 Use: npx smoonb functions push --project-ref <id>'));
      process.exit(1);
    }

    console.log(chalk.blue(`🚀 Fazendo deploy das Edge Functions para: ${projectId}`));

    const { stdout, stderr } = await runCommand(
      `supabase functions deploy --project-ref ${projectId}`,
      {
        env: { 
          ...process.env, 
          SUPABASE_ACCESS_TOKEN: config.supabase.serviceKey 
        }
      }
    );

    if (stderr && !stderr.includes('WARN')) {
      console.log(chalk.yellow(`⚠️ Avisos: ${stderr}`));
    }

    console.log(chalk.green('✅ Deploy concluído:'));
    console.log(stdout);

  } catch (error) {
    console.error(chalk.red(`❌ Erro no deploy: ${error.message}`));
    process.exit(1);
  }
}

// Função para pull de functions
async function pullFunctions(projectRef) {
  try {
    const config = await readConfig();
    const projectId = projectRef || config.supabase.projectId;

    if (!projectId) {
      console.error(chalk.red('❌ Project ID não encontrado'));
      console.log(chalk.yellow('💡 Use: npx smoonb functions pull --project-ref <id>'));
      process.exit(1);
    }

    console.log(chalk.yellow('⚠️ Pull de Edge Functions não é oficialmente suportado pelo Supabase CLI'));
    console.log(chalk.yellow('💡 Para baixar código das functions remotas:'));
    console.log(chalk.gray('  1. Use o Dashboard do Supabase'));
    console.log(chalk.gray('  2. Ou clone o código do seu repositório Git'));
    console.log(chalk.gray('  3. Ou use a API do Supabase diretamente'));
    console.log(chalk.blue('\n📚 Documentação: https://supabase.com/docs/guides/functions'));

  } catch (error) {
    console.error(chalk.red(`❌ Erro: ${error.message}`));
    process.exit(1);
  }
}

// Exportar funções auxiliares para uso futuro
module.exports.list = listFunctions;
module.exports.push = pushFunctions;
module.exports.pull = pullFunctions;