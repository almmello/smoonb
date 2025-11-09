const chalk = require('chalk');
const { t } = require('../i18n');

/**
 * Banner principal do smoonb
 */
function showBetaBanner() {
  const getT = global.smoonbI18n?.t || t;
  
  console.log(chalk.cyan.bold(`\n🚀 ${getT('app.title')}\n`));
  console.log(chalk.white(`${getT('app.tagline')}\n`));
  
  console.log(chalk.cyan.bold(`📦 ${getT('backup.components')}\n`));
  console.log(chalk.white(`  ✅ ${getT('backup.database')}`));
  console.log(chalk.white(`  ✅ ${getT('backup.extensions')}`));
  console.log(chalk.white(`  ✅ ${getT('backup.roles')}`));
  console.log(chalk.white(`  ✅ ${getT('backup.functions')}`));
  console.log(chalk.white(`  ✅ ${getT('backup.auth')}`));
  console.log(chalk.white(`  ✅ ${getT('backup.storage')}`));
  console.log(chalk.white(`  ✅ ${getT('backup.realtime')}`));
  console.log(chalk.white(`  ✅ ${getT('backup.temp')}`));
  console.log(chalk.white(`  ✅ ${getT('backup.migrations')}\n`));
  
  console.log(chalk.white(`🏢 ${getT('app.developedBy')}`));
  console.log(chalk.cyan(`🌐 ${getT('app.website')}`));
  console.log(chalk.cyan(`📖 ${getT('app.documentation')}`));
  console.log(chalk.cyan(`🐛 ${getT('app.issues')}\n`));
}

module.exports = { showBetaBanner };
