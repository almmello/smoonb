const readline = require('readline');

/**
 * Etapa 2: Confirmar execução
 */
module.exports = async () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const question = (query) => new Promise(resolve => rl.question(query, resolve));
  
  const confirm = await question('Deseja continuar com a restauração? (s/N): ');
  rl.close();
  
  return confirm.toLowerCase() === 's';
};

