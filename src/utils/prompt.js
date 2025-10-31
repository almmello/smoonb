const readline = require('readline');

/**
 * Função helper para fazer perguntas de confirmação customizadas
 * Mostra (S/n) ou (s/N) em português em vez de (Y/n) ou (y/N)
 */
async function confirm(question, defaultYes = true) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const promptText = defaultYes ? '(S/n)' : '(s/N)';
  const fullQuestion = `${question} ${promptText}: `;

  return new Promise((resolve) => {
    rl.question(fullQuestion, (answer) => {
      rl.close();
      
      if (!answer || answer.trim() === '') {
        resolve(defaultYes);
        return;
      }

      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 's' || normalized === 'sim' || normalized === 'y' || normalized === 'yes');
    });
  });
}

module.exports = {
  confirm
};

