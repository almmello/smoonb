const inquirer = require('inquirer');
const chalk = require('chalk');
const { confirm } = require('../utils/prompt');

async function mapEnvVariablesInteractively(env, expectedKeys) {
  const finalEnv = { ...env };
  const dePara = {};

  const allKeys = Object.keys(env);

  for (const expected of expectedKeys) {
    console.log(chalk.blue(`\n🔧 Mapeando variável: ${expected}`));

    let clientKey = undefined;

    // 3) Se existir chave exatamente igual, pular seleção e ir direto para confirmação
    if (Object.prototype.hasOwnProperty.call(finalEnv, expected)) {
      clientKey = expected;
    } else {
      // 2) Remover o caractere '?' do início da pergunta definindo prefix: ''
      // 4) Opção explícita para adicionar nova chave
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
    const isCorrect = await confirm(`Valor atual: ${currentValue || '(vazio)'}\nEste é o valor correto do projeto alvo?`, true);

    let valueToWrite = currentValue;
    if (!isCorrect) {
      const { newValue } = await inquirer.prompt([{
        type: 'input',
        name: 'newValue',
        message: `Cole o novo valor para ${clientKey}:`,
        prefix: ''
      }]);
      valueToWrite = newValue || '';
    }

    if (!valueToWrite) {
      const { newValueRequired } = await inquirer.prompt([{
        type: 'input',
        name: 'newValueRequired',
        message: `Valor obrigatório. Informe valor para ${clientKey}:`,
        prefix: ''
      }]);
      valueToWrite = newValueRequired || '';
    }

    finalEnv[clientKey] = valueToWrite;
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


