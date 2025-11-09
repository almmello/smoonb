const readline = require('readline');
const { t } = require('../i18n');

/**
 * Função helper para fazer perguntas de confirmação customizadas
 * Mostra (S/n) ou (s/N) em português em vez de (Y/n) ou (y/N)
 */
async function confirm(question, defaultYes = true) {
  const getT = global.smoonbI18n?.t || t;
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const promptText = defaultYes ? getT('prompt.confirmYes') : getT('prompt.confirmNo');
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

