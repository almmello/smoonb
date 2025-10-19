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

// Importar módulos principais
const { commands, showBetaBanner, showQuickHelp } = require('../src/index');

// Criar instância do Commander
const program = new Command();

// Configuração básica do programa
program
  .name('smoonb')
  .description('Complete Supabase backup and migration tool - EXPERIMENTAL VERSION - USE AT YOUR OWN RISK')
  .version(packageJson.version, '-v, --version', 'display version number')
  .addHelpText('before', () => {
    showBetaBanner();
    return '';
  })
  .addHelpText('after', () => {
    return chalk.cyan.bold(`
                📋 CONFIGURAÇÃO AUTOMÁTICA:
                   npx smoonb config --init       # Cria .smoonbrc com projectId, URLs, etc.
                   # Edite o arquivo com suas credenciais Supabase
                   npx smoonb backup              # Funciona sem --project-id!

📝 EXEMPLO DE CONFIGURAÇÃO (.smoonbrc):
   {
     "supabase": {
       "projectId": "abc123def456",
       "url": "https://abc123def456.supabase.co",
       "serviceKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
       "anonKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
       "databaseUrl": "postgresql://postgres:[senha]@db.abc123def456.supabase.co:5432/postgres"
     },
     "backup": {
       "includeFunctions": true,
       "includeStorage": true,
       "includeAuth": true,
       "includeRealtime": true,
       "outputDir": "./backups"
     },
     "restore": {
       "cleanRestore": false,
       "verifyAfterRestore": true
     }
   }

                🔧 COMO CONFIGURAR:
                   1. npx smoonb config --init
                   2. Edite .smoonbrc com suas credenciais
                   3. npx smoonb backup (funciona automaticamente!)
`);
  });

// Comandos principais
program
  .command('backup')
  .description('Fazer backup completo do projeto Supabase usando Supabase CLI')
  .option('-o, --output <dir>', 'Diretório de saída do backup')
  .option('--skip-realtime', 'Pular captura interativa de Realtime Settings')
  .action(commands.backup);

program
  .command('restore')
  .description('Restaurar backup completo usando psql (modo interativo)')
  .option('--db-url <url>', 'URL da database de destino (override)')
  .action(commands.restore);


program
  .command('functions')
  .description('Gerenciar Edge Functions do Supabase')
  .action(commands.functions);

program
  .command('check')
  .description('Verificar integridade do projeto Supabase após restauração')
  .option('-o, --output <file>', 'Arquivo de saída do relatório', 'check-report.json')
  .action(commands.check);

program
  .command('config')
  .description('Configurar credenciais e configurações do smoonb')
  .option('--init', 'Inicializar configuração')
  .option('--show', 'Mostrar configuração atual')
  .action(commands.config);

// Tratamento de erros
program.on('command:*', function (operands) {
  console.error(chalk.red.bold('❌ Comando não reconhecido:'), operands[0]);
  console.error(chalk.yellow('💡 Use'), chalk.cyan('smoonb --help'), chalk.yellow('para ver comandos disponíveis'));
  process.exit(1);
});

// Tratamento de exceções não capturadas
process.on('uncaughtException', (error) => {
  console.error(chalk.red.bold('❌ Erro não tratado:'), error.message);
  console.error(chalk.gray('Stack trace:'), error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red.bold('❌ Promise rejeitada não tratada:'), reason);
  process.exit(1);
});

// Exibir informações do período beta quando nenhum comando é fornecido
if (process.argv.length === 2) {
  showBetaBanner();
  showQuickHelp();
}

// Parse dos argumentos da linha de comando
program.parse(process.argv);

// Se nenhum comando foi fornecido, mostrar ajuda
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
