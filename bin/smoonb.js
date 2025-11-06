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
  .description('Complete Supabase backup and migration tool')
  .version(packageJson.version, '-v, --version', 'display version number')
  .addHelpText('before', () => {
    showBetaBanner();
    return chalk.yellow.bold('\n⚠️  TERMO DE USO E AVISO DE RISCO\n') +
      chalk.white('Ao prosseguir, você reconhece e concorda que o Supa Moonbase (smoonb) é fornecido "NO ESTADO EM QUE SE ENCONTRA" ("AS IS") e "CONFORME DISPONIBILIDADE", sem garantias de qualquer natureza—expressas, implícitas ou legais—incluindo, sem limitação, garantias de comercialização, adequação a um fim específico e não violação, na máxima extensão permitida pela lei aplicável. Operações de backup e restauração envolvem riscos, os ambientes variam amplamente e não é possível prever ou validar todas as configurações dos usuários. Você é o único responsável por validar seu ambiente, manter cópias independentes e verificar os resultados antes de utilizá-los em produção. O Supa Moonbase (smoonb) é construído com repositórios públicos, auditáveis e software livre, para auxiliar pessoas a simplificar seus fluxos, sem com isso criar qualquer garantia, promessa de suporte ou compromisso de nível de serviço.\n\n') +
      chalk.white('Limitação de responsabilidade (PT-BR) — Na máxima extensão permitida por lei, a Goalmoon, seus contribuidores e licenciadores não serão responsáveis por danos indiretos, incidentais, especiais, consequentes, exemplares ou punitivos (incluindo perda de dados, interrupção de negócios ou lucros cessantes) decorrentes do uso, incapacidade de uso, das operações de backup/restauração realizadas com, ou dos resultados gerados pelo Supa Moonbase (smoonb). Em qualquer hipótese, a responsabilidade total por todas as reivindicações relacionadas ao Supa Moonbase (smoonb) não excederá o valor pago por você pelo Supa Moonbase (smoonb) nos 12 meses anteriores ao evento. Nada neste aviso exclui ou limita responsabilidades onde tais limites sejam proibidos por lei, incluindo (conforme aplicável) dolo ou culpa grave.\n\n') +
      chalk.white('Observação para consumidores no Brasil (PT-BR) — Para consumidores brasileiros, este aviso não afasta direitos irrenunciáveis previstos no Código de Defesa do Consumidor (CDC); qualquer limitação aqui prevista só se aplica nos limites da lei e não impede a indenização obrigatória quando cabível.\n\n');
  })
  .addHelpText('after', () => {
    return chalk.cyan.bold(`
📋 CONFIGURAÇÃO:
   Configure o arquivo .env.local na raiz do projeto com suas credenciais Supabase.
   O smoonb irá mapear as variáveis interativamente na primeira execução.

🔄 ATUALIZAR PARA ÚLTIMA VERSÃO:
   npm install smoonb@latest
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
  .command('check')
  .description('Verificar integridade do projeto Supabase após restauração')
  .option('-o, --output <file>', 'Arquivo de saída do relatório', 'check-report.json')
  .action(commands.check);

program
  .command('import')
  .description('Importar arquivo .backup.gz do Dashboard do Supabase')
  .requiredOption('-f, --file <path>', 'Caminho completo do arquivo .backup.gz a importar')
  .action(async (options) => {
    await commands.import({ file: options.file });
  });

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

process.on('unhandledRejection', (reason, _promise) => {
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
