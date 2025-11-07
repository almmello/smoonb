const inquirer = require('inquirer');
const chalk = require('chalk');
const { confirm } = require('../utils/prompt');

async function mapEnvVariablesInteractively(env, expectedKeys) {
  const finalEnv = { ...env };
  const dePara = {};

  const allKeys = Object.keys(env);
  let projectId = null;

  // Função auxiliar para obter Project ID já mapeado
  function getProjectId() {
    if (projectId) return projectId;
    // Tentar encontrar Project ID já mapeado
    const projectIdKey = Object.keys(dePara).find(k => dePara[k] === 'SUPABASE_PROJECT_ID');
    if (projectIdKey && finalEnv[projectIdKey]) {
      projectId = finalEnv[projectIdKey];
      return projectId;
    }
    // Tentar encontrar no env original
    const originalKey = Object.keys(env).find(k => k === 'SUPABASE_PROJECT_ID' || env[k]?.match(/^[a-z]{20}$/));
    if (originalKey && env[originalKey]) {
      projectId = env[originalKey];
      return projectId;
    }
    return null;
  }

  // Função para obter instruções e links específicos para cada variável
  function getVariableInstructions(expected, currentProjectId) {
    const instructions = {
      'SUPABASE_PROJECT_ID': {
        notFound: 'Não foi encontrada uma entrada para a variável SUPABASE_PROJECT_ID.',
        help: 'Encontre em: Dashboard -> Project Settings -> General -> General Settings -> Project ID',
        link: null
      },
      'NEXT_PUBLIC_SUPABASE_URL': {
        notFound: 'Não foi encontrada uma entrada para a variável NEXT_PUBLIC_SUPABASE_URL.',
        help: currentProjectId 
          ? `Acesse: https://supabase.com/dashboard/project/${currentProjectId}/settings/api`
          : 'Acesse: Dashboard -> Project Settings -> API -> Project URL',
        link: currentProjectId ? `https://supabase.com/dashboard/project/${currentProjectId}/settings/api` : null
      },
      'NEXT_PUBLIC_SUPABASE_ANON_KEY': {
        notFound: 'Não foi encontrada uma entrada para a variável NEXT_PUBLIC_SUPABASE_ANON_KEY.',
        help: currentProjectId
          ? `Acesse: https://supabase.com/dashboard/project/${currentProjectId}/settings/api-keys`
          : 'Acesse: Dashboard -> Project Settings -> API -> API Keys -> anon public',
        link: currentProjectId ? `https://supabase.com/dashboard/project/${currentProjectId}/settings/api-keys` : null
      },
      'SUPABASE_SERVICE_ROLE_KEY': {
        notFound: 'Não foi encontrada uma entrada para a variável SUPABASE_SERVICE_ROLE_KEY.',
        help: currentProjectId
          ? `Acesse: https://supabase.com/dashboard/project/${currentProjectId}/settings/api-keys`
          : 'Acesse: Dashboard -> Project Settings -> API -> API Keys -> service_role secret',
        link: currentProjectId ? `https://supabase.com/dashboard/project/${currentProjectId}/settings/api-keys` : null
      },
      'SUPABASE_DB_URL': {
        notFound: 'Não foi encontrada uma entrada para a variável SUPABASE_DB_URL.',
        help: currentProjectId
          ? `Formato: postgresql://postgres:[DATABASE_PASSWORD]@db.${currentProjectId}.supabase.co:5432/postgres\nPara resetar senha: https://supabase.com/dashboard/project/${currentProjectId}/database/settings`
          : 'Formato: postgresql://postgres:[DATABASE_PASSWORD]@db.[PROJECT_ID].supabase.co:5432/postgres\nPara resetar senha: Dashboard -> Project Settings -> Database -> Database Settings',
        link: currentProjectId ? `https://supabase.com/dashboard/project/${currentProjectId}/database/settings` : null
      },
      'SUPABASE_ACCESS_TOKEN': {
        notFound: 'Não foi encontrada uma entrada para a variável SUPABASE_ACCESS_TOKEN.',
        help: 'Acesse: https://supabase.com/dashboard/account/tokens',
        link: 'https://supabase.com/dashboard/account/tokens'
      },
      'SMOONB_OUTPUT_DIR': {
        notFound: 'Não foi encontrada uma entrada para a variável SMOONB_OUTPUT_DIR.',
        help: 'Diretório padrão para armazenar backups',
        link: null,
        default: './backups'
      }
    };

    return instructions[expected] || {
      notFound: `Não foi encontrada uma entrada para a variável ${expected}.`,
      help: '',
      link: null
    };
  }

  for (const expected of expectedKeys) {
    console.log(chalk.blue(`\n🔧 Mapeando variável: ${expected}`));

    let clientKey = undefined;

    // Se existir chave exatamente igual, pular seleção e ir direto para confirmação
    if (Object.prototype.hasOwnProperty.call(finalEnv, expected)) {
      clientKey = expected;
    } else {
      // Opção explícita para adicionar nova chave
      const choices = [
        ...allKeys.map((k, idx) => ({ name: `${idx + 1}. ${k}`, value: k })),
        new inquirer.Separator(),
        { name: 'Adicione uma nova chave para mim', value: '__ADD_NEW__' }
      ];

      const { chosen } = await inquirer.prompt([{
        type: 'list',
        name: 'chosen',
        message: `Selecione a chave correspondente para: ${expected}`,
        choices,
        loop: false,
        prefix: ''
      }]);

      clientKey = chosen;
      if (chosen === '__ADD_NEW__') {
        clientKey = expected;
        if (Object.prototype.hasOwnProperty.call(finalEnv, clientKey)) {
          // Evitar colisão: gerar sufixo incremental
          let i = 2;
          while (Object.prototype.hasOwnProperty.call(finalEnv, `${clientKey}_${i}`)) i++;
          clientKey = `${clientKey}_${i}`;
        }
        finalEnv[clientKey] = '';
      }
    }

    const currentValue = finalEnv[clientKey] ?? '';
    const currentProjectId = getProjectId();
    const instructions = getVariableInstructions(expected, currentProjectId);

    // Se não tem valor, mostrar mensagem específica
    if (!currentValue) {
      console.log(chalk.yellow(instructions.notFound));
      if (instructions.help) {
        console.log(chalk.white(instructions.help));
      }
      if (instructions.link) {
        console.log(chalk.cyan(`🔗 ${instructions.link}`));
      }
    } else {
      // Se tem valor, perguntar se está correto
      const isCorrect = await confirm(`Valor atual: ${currentValue}\nEste é o valor correto do projeto alvo?`, true);
      if (isCorrect) {
        finalEnv[clientKey] = currentValue;
        if (expected === 'SUPABASE_PROJECT_ID') {
          projectId = currentValue;
        }
        if (dePara[clientKey] && dePara[clientKey] !== expected) {
          throw new Error(`Duplicidade de mapeamento detectada para ${clientKey}`);
        }
        dePara[clientKey] = expected;
        continue;
      }
    }

    // Solicitar novo valor
    let valueToWrite = '';
    if (expected === 'SMOONB_OUTPUT_DIR') {
      // Para SMOONB_OUTPUT_DIR, pré-preencher com ./backups
      const { newValue } = await inquirer.prompt([{
        type: 'input',
        name: 'newValue',
        message: `Confirme o novo valor para ${expected}:`,
        default: instructions.default || './backups',
        prefix: ''
      }]);
      valueToWrite = newValue || instructions.default || './backups';
    } else {
      const { newValue } = await inquirer.prompt([{
        type: 'input',
        name: 'newValue',
        message: `Cole o novo valor para ${expected}:`,
        prefix: ''
      }]);
      valueToWrite = newValue || '';
    }

    // Validar valor obrigatório (exceto SMOONB_OUTPUT_DIR que tem default)
    if (!valueToWrite && expected !== 'SMOONB_OUTPUT_DIR') {
      const { newValueRequired } = await inquirer.prompt([{
        type: 'input',
        name: 'newValueRequired',
        message: `Valor obrigatório. Informe valor para ${expected}:`,
        prefix: ''
      }]);
      valueToWrite = newValueRequired || '';
    }

    finalEnv[clientKey] = valueToWrite || (expected === 'SMOONB_OUTPUT_DIR' ? './backups' : '');
    if (expected === 'SUPABASE_PROJECT_ID') {
      projectId = valueToWrite;
    }
    if (dePara[clientKey] && dePara[clientKey] !== expected) {
      throw new Error(`Duplicidade de mapeamento detectada para ${clientKey}`);
    }
    dePara[clientKey] = expected;
  }

  return { finalEnv, dePara };
}

async function askComponentsFlags() {
  // Explicação sobre Edge Functions
  console.log(chalk.cyan('\n⚡ Edge Functions:'));
  console.log(chalk.white('   Vamos apagar as funções existentes na pasta supabase/functions, fazer um reset no link'));
  console.log(chalk.white('   entre a ferramenta e o projeto, e baixar novamente as funções do servidor.'));
  console.log(chalk.white('   Você terá a opção de manter ou apagar as funções na pasta após o backup.\n'));

  const includeFunctions = await confirm('Deseja incluir Edge Functions', true);
  
  // Pergunta de limpeza de functions imediatamente após
  let cleanFunctions = false;
  if (includeFunctions) {
    cleanFunctions = await confirm('Deseja limpar supabase/functions após o backup', false);
  }

  // Explicação sobre .temp
  console.log(chalk.cyan('\n📁 Supabase .temp:'));
  console.log(chalk.white('   Vamos copiar os arquivos existentes (se existirem) na pasta supabase/.temp.'));
  console.log(chalk.white('   Você terá a opção de manter ou apagar os arquivos nesta pasta após o backup.\n'));

  const includeTemp = await confirm('Deseja incluir Supabase .temp', true);
  
  // Pergunta de limpeza de .temp imediatamente após
  let cleanTemp = false;
  if (includeTemp) {
    cleanTemp = await confirm('Deseja apagar supabase/.temp após o backup', false);
  }

  // Explicação sobre Migrations
  console.log(chalk.cyan('\n📋 Migrations:'));
  console.log(chalk.white('   Vamos apagar as migrations existentes (se existirem) na pasta supabase/migrations,'));
  console.log(chalk.white('   fazer um reset no link entre a ferramenta e o projeto, e baixar novamente as migrations'));
  console.log(chalk.white('   do servidor. Você terá a opção de manter ou apagar as migrations na pasta após o backup.\n'));

  const includeMigrations = await confirm('Deseja incluir Migrations', true);
  
  // Pergunta de limpeza de migrations imediatamente após
  let cleanMigrations = false;
  if (includeMigrations) {
    cleanMigrations = await confirm('Deseja apagar supabase/migrations após o backup', false);
  }

  // Continuar com outras perguntas
  const includeStorage = await confirm('Deseja incluir Storage', true);
  const includeAuth = await confirm('Deseja incluir Auth', true);
  const includeRealtime = await confirm('Deseja incluir Realtime', true);

  return {
    includeFunctions,
    includeStorage,
    includeAuth,
    includeRealtime,
    includeTemp,
    includeMigrations,
    cleanFunctions,
    cleanTemp,
    cleanMigrations
  };
}

module.exports = {
  mapEnvVariablesInteractively,
  askComponentsFlags
};


