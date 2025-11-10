#!/usr/bin/env node

/**
 * smoonb - Complete Supabase backup and migration tool
 * 
 * CLI principal para backup e migração de projetos Supabase
 * EXPERIMENTAL VERSION - USE AT YOUR OWN RISK
 * 
 * Desenvolvido por: Goalmoon Tecnologia LTDA
 * Website: https://goalmoon.com
 */

const { Command } = require('commander');
const chalk = require('chalk');
const packageJson = require('../package.json');

// Inicializar i18n ANTES de importar outros módulos
// Nota: --lang será processado após o parse, mas precisamos inicializar agora
const { initI18n } = require('../src/i18n');
let i18n = initI18n(process.argv, process.env);
let { t } = i18n;

// Importar módulos principais
const { commands, showBetaBanner, showQuickHelp } = require('../src/index');

// Criar instância do Commander
const program = new Command();

// Configuração básica do programa
program
  .name('smoonb')
  .description('Complete Supabase backup and migration tool')
  .version(packageJson.version, '-v, --version', 'display version number')
  .option('--lang <code>', 'Set language (en, pt-BR). Overrides SMOONB_LANG and system locale')
  .addHelpText('before', () => {
    showBetaBanner();
    const getT = global.smoonbI18n?.t || t;
    return chalk.yellow.bold(`\n⚠️  ${getT('disclaimer.title')}\n`) +
      chalk.white(`${getT('disclaimer.text')}\n\n`) +
      chalk.white(`${getT('disclaimer.limitation')}\n\n`);
  })
  .addHelpText('after', () => {
    const getT = global.smoonbI18n?.t || t;
    return chalk.cyan.bold(`
📋 ${getT('help.configuration')}
   ${getT('help.configurationDesc')}

🔄 ${getT('help.update')}
   ${getT('help.updateCommand')}

📚 ${getT('help.manual')}

${chalk.yellow.bold(getT('help.backupTitle'))}
   ${chalk.white(getT('help.backupExample1'))}
   ${chalk.gray(getT('help.backupExample1Desc'))}
   
   ${chalk.white(getT('help.backupExample2'))}
   ${chalk.gray(getT('help.backupExample2Desc'))}

${chalk.yellow.bold(getT('help.restoreTitle'))}
   ${chalk.white(getT('help.restoreExample1'))}
   ${chalk.gray(getT('help.restoreExample1Desc'))}
   
   ${chalk.white(getT('help.restoreExample2'))}
   ${chalk.gray(getT('help.restoreExample2Desc'))}
   
   ${chalk.white(getT('help.restoreExample3'))}
   ${chalk.gray(getT('help.restoreExample3Desc'))}

${chalk.yellow.bold(getT('help.importTitle'))}
   ${chalk.white(getT('help.importExample1'))}
   ${chalk.gray(getT('help.importExample1Desc'))}
   
   ${chalk.white(getT('help.importExample2'))}
   ${chalk.gray(getT('help.importExample2Desc'))}

${chalk.yellow.bold(getT('help.checkTitle'))}
   ${chalk.white(getT('help.checkExample1'))}
   ${chalk.gray(getT('help.checkExample1Desc'))}

${chalk.yellow.bold(getT('help.tipsTitle'))}
   ${chalk.white(getT('help.tip1'))}
   ${chalk.white(getT('help.tip2'))}
   ${chalk.white(getT('help.tip3'))}
   ${chalk.white(getT('help.tip4'))}
   ${chalk.white(getT('help.tip5'))}
`);
  });

// Comandos principais
program
  .command('backup')
  .description(() => {
    const getT = global.smoonbI18n?.t || t;
    return getT('help.commands.backupDesc');
  })
  .option('--skip-realtime', () => {
    const getT = global.smoonbI18n?.t || t;
    return getT('help.commands.backupSkipRealtime');
  })
  .addHelpText('after', () => {
    const getT = global.smoonbI18n?.t || t;
    return `
${chalk.yellow.bold(getT('help.commands.backupExamples'))}
  ${chalk.white(getT('help.commands.backupExample1'))}
  ${chalk.gray(getT('help.commands.backupExample1Desc'))}
  
  ${chalk.white(getT('help.commands.backupExample2'))}
  ${chalk.gray(getT('help.commands.backupExample2Desc'))}

${chalk.yellow.bold(getT('help.commands.backupWhat'))}
  ${getT('help.commands.backupWhat1')}
  ${getT('help.commands.backupWhat2')}
  ${getT('help.commands.backupWhat3')}
  ${getT('help.commands.backupWhat4')}
  ${getT('help.commands.backupWhat5')}
  ${getT('help.commands.backupWhat6')}
  ${getT('help.commands.backupWhat7')}
  ${getT('help.commands.backupWhat8')}
  ${getT('help.commands.backupWhat9')}
`;
  })
  .action(commands.backup);

program
  .command('restore')
  .description(() => {
    const getT = global.smoonbI18n?.t || t;
    return getT('help.commands.restoreDesc');
  })
  .option('--file <path>', () => {
    const getT = global.smoonbI18n?.t || t;
    return getT('help.commands.restoreFile');
  })
  .option('--storage <path>', () => {
    const getT = global.smoonbI18n?.t || t;
    return getT('help.commands.restoreStorage');
  })
  .addHelpText('after', () => {
    const getT = global.smoonbI18n?.t || t;
    return `
${chalk.yellow.bold(getT('help.commands.restoreExamples'))}
  ${chalk.white(getT('help.commands.restoreExample1'))}
  ${chalk.gray(getT('help.commands.restoreExample1Desc'))}
  
  ${chalk.white(getT('help.commands.restoreExample2'))}
  ${chalk.gray(getT('help.commands.restoreExample2Desc'))}
  
  ${chalk.white(getT('help.commands.restoreExample3'))}
  ${chalk.gray(getT('help.commands.restoreExample3Desc'))}

${chalk.yellow.bold(getT('help.commands.restoreFlow'))}
  ${getT('help.commands.restoreFlow1')}
  ${getT('help.commands.restoreFlow2')}
  ${getT('help.commands.restoreFlow3')}
  ${getT('help.commands.restoreFlow4')}
  ${getT('help.commands.restoreFlow5')}
  ${getT('help.commands.restoreFlow6')}
  ${getT('help.commands.restoreFlow7')}

${chalk.yellow.bold(getT('help.commands.restoreWhenFile'))}
  ${getT('help.commands.restoreWhenFile1')}
  ${getT('help.commands.restoreWhenFile2')}
  ${getT('help.commands.restoreWhenFile3')}
  ${getT('help.commands.restoreWhenFile4')}

${chalk.yellow.bold(getT('help.commands.restoreFormats'))}
  ${getT('help.commands.restoreFormats1')}
  ${getT('help.commands.restoreFormats2')}
`;
  })
  .action(async (options) => {
    await commands.restore({ file: options.file, storage: options.storage });
  });

program
  .command('check')
  .description(() => {
    const getT = global.smoonbI18n?.t || t;
    return getT('help.commands.checkDesc');
  })
  .addHelpText('after', () => {
    const getT = global.smoonbI18n?.t || t;
    return `
${chalk.yellow.bold(getT('help.commands.checkExamples'))}
  ${chalk.white(getT('help.commands.checkExample1'))}
  ${chalk.gray(getT('help.commands.checkExample1Desc'))}

${chalk.yellow.bold(getT('help.commands.checkWhat'))}
  ${getT('help.commands.checkWhat1')}
  ${getT('help.commands.checkWhat2')}
  ${getT('help.commands.checkWhat3')}
  ${getT('help.commands.checkWhat4')}
  ${getT('help.commands.checkWhat5')}
  ${getT('help.commands.checkWhat6')}
`;
  })
  .action(commands.check);

program
  .command('import')
  .description(() => {
    const getT = global.smoonbI18n?.t || t;
    return getT('help.commands.importDesc');
  })
  .requiredOption('--file <path>', () => {
    const getT = global.smoonbI18n?.t || t;
    return getT('help.commands.importFile');
  })
  .option('--storage <path>', () => {
    const getT = global.smoonbI18n?.t || t;
    return getT('help.commands.importStorage');
  })
  .addHelpText('after', () => {
    const getT = global.smoonbI18n?.t || t;
    return `
${chalk.yellow.bold(getT('help.commands.importExamples'))}
  ${chalk.white(getT('help.commands.importExample1'))}
  ${chalk.gray(getT('help.commands.importExample1Desc'))}
  
  ${chalk.white(getT('help.commands.importExample2'))}
  ${chalk.gray(getT('help.commands.importExample2Desc'))}

${chalk.yellow.bold(getT('help.commands.importFormats'))}
  ${getT('help.commands.importFormats1')}
  ${getT('help.commands.importFormats2')}

${chalk.yellow.bold(getT('help.commands.importImportant'))}
  ${getT('help.commands.importImportant1')}
  ${getT('help.commands.importImportant2')}
  ${getT('help.commands.importImportant3')}
  ${getT('help.commands.importImportant4')}
  ${getT('help.commands.importImportant5')}
`;
  })
  .action(async (options) => {
    await commands.import({ file: options.file, storage: options.storage });
  });

// Tratamento de erros
program.on('command:*', function (operands) {
  console.error(chalk.red.bold(`❌ ${t('error.commandNotFound', { command: operands[0] })}`));
  console.error(chalk.yellow(`💡 ${t('error.useHelp', { cmd: 'smoonb' })}`));
  process.exit(1);
});

// Tratamento de exceções não capturadas
process.on('uncaughtException', (error) => {
  console.error(chalk.red.bold(`❌ ${t('error.uncaughtException', { message: error.message })}`));
  console.error(chalk.gray('Stack trace:'), error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, _promise) => {
  console.error(chalk.red.bold(`❌ ${t('error.unhandledRejection', { reason: String(reason) })}`));
  process.exit(1);
});

// Exibir informações do período beta quando nenhum comando é fornecido
if (process.argv.length === 2) {
  showBetaBanner();
  showQuickHelp();
}

// Parse dos argumentos da linha de comando
program.parse(process.argv);

// Re-inicializar i18n se --lang foi fornecido (após parse)
// Criar um novo argv com --lang para detectLocale
const options = program.opts();
if (options.lang) {
  const { initI18n, detectLocale } = require('../src/i18n');
  // Forçar detecção do locale fornecido
  const forcedLocale = detectLocale(['--lang', options.lang], process.env);
  const newI18n = initI18n(['--lang', forcedLocale], { ...process.env, SMOONB_LANG: forcedLocale });
  i18n = newI18n;
  t = newI18n.t;
}

// Se nenhum comando foi fornecido, mostrar ajuda
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
