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

📚 MANUAL DE USO - EXEMPLOS COMPLETOS:

${chalk.yellow.bold('1. BACKUP - Fazer backup completo do projeto:')}
   ${chalk.white('npx smoonb backup')}
   ${chalk.gray('# Processo interativo que captura todos os componentes do Supabase')}
   
   ${chalk.white('npx smoonb backup --skip-realtime')}
   ${chalk.gray('# Pula a captura interativa de Realtime Settings')}

${chalk.yellow.bold('2. RESTORE - Restaurar backup em um projeto:')}
   ${chalk.white('npx smoonb restore')}
   ${chalk.gray('# Processo interativo que lista backups disponíveis e permite escolher')}

${chalk.yellow.bold('3. IMPORT - Importar backup do Dashboard do Supabase:')}
   ${chalk.white('npx smoonb import --file "C:\\Downloads\\db_cluster-04-03-2024@14-16-59.backup.gz"')}
   ${chalk.gray('# Importa apenas o arquivo de database')}
   
   ${chalk.white('npx smoonb import --file "backup.backup.gz" --storage "meu-projeto.storage.zip"')}
   ${chalk.gray('# Importa database e storage juntos (storage é opcional)')}

${chalk.yellow.bold('4. CHECK - Verificar integridade após restauração:')}
   ${chalk.white('npx smoonb check')}
   ${chalk.gray('# Verifica conexão, extensões, tabelas, RLS, Realtime e Storage')}

${chalk.yellow.bold('💡 DICAS IMPORTANTES:')}
   ${chalk.white('• O comando import requer um arquivo de backup (.backup.gz), mas o storage (.storage.zip) é opcional')}
   ${chalk.white('• O storage depende de um backup, mas o backup não depende do storage')}
   ${chalk.white('• Use caminhos absolutos ou relativos para os arquivos no comando import')}
   ${chalk.white('• O formato do arquivo de backup deve ser: db_cluster-DD-MM-YYYY@HH-MM-SS.backup.gz')}
   ${chalk.white('• O formato do arquivo de storage deve ser: *.storage.zip')}
`);
  });

// Comandos principais
program
  .command('backup')
  .description('Fazer backup completo do projeto Supabase usando Supabase CLI')
  .option('--skip-realtime', 'Pular captura interativa de Realtime Settings')
  .addHelpText('after', `
${chalk.yellow.bold('Exemplos:')}
  ${chalk.white('npx smoonb backup')}
  ${chalk.gray('# Processo interativo completo')}
  
  ${chalk.white('npx smoonb backup --skip-realtime')}
  ${chalk.gray('# Pula configuração de Realtime Settings')}

${chalk.yellow.bold('O que é capturado:')}
  • Database PostgreSQL (pg_dumpall + SQL separado)
  • Database Extensions and Settings
  • Custom Roles
  • Edge Functions (download automático)
  • Auth Settings (via Management API)
  • Storage Buckets (metadados via Management API)
  • Realtime Settings (7 parâmetros interativos)
  • Supabase .temp (arquivos temporários)
  • Migrations (todas as migrations do projeto)
`)
  .action(commands.backup);

program
  .command('restore')
  .description('Restaurar backup completo usando psql (modo interativo)')
  .addHelpText('after', `
${chalk.yellow.bold('Exemplos:')}
  ${chalk.white('npx smoonb restore')}
  ${chalk.gray('# Processo interativo que lista backups disponíveis')}

${chalk.yellow.bold('Fluxo do restore:')}
  1. Validação Docker
  2. Consentimento para ler/escrever .env.local
  3. Mapeamento de variáveis de ambiente
  4. Seleção de backup disponível
  5. Seleção de componentes para restaurar
  6. Resumo detalhado e confirmação
  7. Execução da restauração

${chalk.yellow.bold('Formatos suportados:')}
  • .backup.gz (compactado) - Descompacta automaticamente
  • .backup (descompactado) - Restaura diretamente
`)
  .action(commands.restore);

program
  .command('check')
  .description('Verificar integridade do projeto Supabase após restauração')
  .addHelpText('after', `
${chalk.yellow.bold('Exemplos:')}
  ${chalk.white('npx smoonb check')}
  ${chalk.gray('# Verifica integridade e exibe relatório no console')}

${chalk.yellow.bold('O que é verificado:')}
  • Conexão com database
  • Extensões PostgreSQL instaladas
  • Tabelas criadas
  • Políticas RLS (Row Level Security)
  • Publicações Realtime
  • Buckets de Storage
`)
  .action(commands.check);

program
  .command('import')
  .description('Importar arquivo .backup.gz e opcionalmente .storage.zip do Dashboard do Supabase')
  .requiredOption('--file <path>', 'Caminho completo do arquivo .backup.gz a importar')
  .option('--storage <path>', 'Caminho completo do arquivo .storage.zip a importar (opcional)')
  .addHelpText('after', `
${chalk.yellow.bold('Exemplos:')}
  ${chalk.white('npx smoonb import --file "C:\\Downloads\\db_cluster-04-03-2024@14-16-59.backup.gz"')}
  ${chalk.gray('# Importa apenas o arquivo de database')}
  
  ${chalk.white('npx smoonb import --file "backup.backup.gz" --storage "meu-projeto.storage.zip"')}
  ${chalk.gray('# Importa database e storage juntos')}

${chalk.yellow.bold('Formato dos arquivos:')}
  • Backup: db_cluster-DD-MM-YYYY@HH-MM-SS.backup.gz (obrigatório)
  • Storage: *.storage.zip (opcional)

${chalk.yellow.bold('Importante:')}
  • O arquivo de backup é obrigatório
  • O arquivo de storage é opcional e depende de um backup
  • Ambos os arquivos serão copiados para a mesma pasta de backup
  • O backup importado ficará disponível para o comando restore
  • Use caminhos absolutos ou relativos
`)
  .action(async (options) => {
    await commands.import({ file: options.file, storage: options.storage });
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
