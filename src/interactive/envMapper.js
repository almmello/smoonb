const inquirer = require('inquirer');
const chalk = require('chalk');

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
    const { isCorrect } = await inquirer.prompt([{
      type: 'confirm',
      name: 'isCorrect',
      message: `Valor atual: ${currentValue || '(vazio)'} Este é o valor correto do projeto alvo? (S/n):`,
      default: true,
      prefix: ''
    }]);

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
  const answers = await inquirer.prompt([
    { type: 'confirm', name: 'includeFunctions', message: 'Deseja incluir Edge Functions (S/n):', default: true },
    { type: 'confirm', name: 'includeStorage', message: 'Deseja incluir Storage (s/N):', default: false },
    { type: 'confirm', name: 'includeAuth', message: 'Deseja incluir Auth (s/N):', default: false },
    { type: 'confirm', name: 'includeRealtime', message: 'Deseja incluir Realtime (s/N):', default: false }
  ]);
  return answers;
}

module.exports = {
  mapEnvVariablesInteractively,
  askComponentsFlags
};


