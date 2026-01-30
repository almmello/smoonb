const chalk = require('chalk');
const inquirer = require('inquirer');
const { getPostgresServerMajor } = require('../utils');
const { t } = require('../../../i18n');

const POSSIBLE_MAJORS = [15, 16, 17, 18];

/**
 * Step: Mostra a versão do Postgres detectada e permite ao usuário sobrescrever com um menu.
 * Preenche context.postgresMajor para o step 02-database usar.
 */
module.exports = async (context) => {
  const getT = global.smoonbI18n?.t || t;
  const { databaseUrl } = context;

  if (!databaseUrl) {
    context.postgresMajor = 17;
    return { success: true, postgresMajor: 17 };
  }

  let detectedMajor = null;
  try {
    detectedMajor = await getPostgresServerMajor(databaseUrl);
  } catch (err) {
    console.log(chalk.yellow(`   ⚠️ ${getT('backup.steps.postgresVersion.detectError', { message: err.message })}`));
    console.log(chalk.white(`   - ${getT('backup.steps.postgresVersion.usingDefault')}`));
    context.postgresMajor = 17;
    return { success: true, postgresMajor: 17 };
  }

  const major = detectedMajor != null ? detectedMajor : 17;
  const choices = [
    { name: getT('backup.steps.postgresVersion.useDetected', { major, image: `postgres:${major}` }), value: major },
    ...POSSIBLE_MAJORS.filter(m => m !== major).map(m => ({
      name: `postgres:${m}`,
      value: m
    }))
  ];

  console.log(chalk.white(`   - ${getT('backup.steps.postgresVersion.found', { major, image: `postgres:${major}` })}`));
  console.log(chalk.white(`   - ${getT('backup.steps.postgresVersion.proceedWith')}`));

  const { postgresMajor } = await inquirer.prompt([{
    type: 'list',
    name: 'postgresMajor',
    message: getT('backup.steps.postgresVersion.selectVersion'),
    choices,
    default: major
  }]);

  context.postgresMajor = postgresMajor;
  console.log(chalk.green(`   ✅ ${getT('backup.steps.postgresVersion.selected', { image: `postgres:${postgresMajor}` })}`));
  return { success: true, postgresMajor };
};
