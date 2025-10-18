const { Command } = require('commander');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const { ensureBin, runCommand } = require('../utils/cli');
const { readConfig, validateFor } = require('../utils/config');
const { showBetaBanner } = require('../index');

const restoreCommand = new Command('restore')
  .description('Restaurar backup do projeto Supabase usando psql')
  .option('-b, --backup-dir <dir>', 'Diretório do backup')
  .option('--db-url <url>', 'URL da database de destino (override)')
  .action(async (options) => {
    showBetaBanner();
    
    try {
      // Verificar se psql está disponível
      const psqlPath = await ensureBin('psql');
      if (!psqlPath) {
        console.error(chalk.red('❌ psql não encontrado'));
        console.log(chalk.yellow('💡 Instale PostgreSQL:'));
        console.log(chalk.yellow('  https://www.postgresql.org/download/'));
        process.exit(1);
      }

      // Carregar configuração
      const config = await readConfig();
      validateFor(config, 'restore');

      // Resolver URL da database
      const databaseUrl = options.dbUrl || config.supabase.databaseUrl;
      if (!databaseUrl) {
        console.error(chalk.red('❌ databaseUrl não configurada'));
        console.log(chalk.yellow('💡 Configure databaseUrl no .smoonbrc ou use --db-url'));
        process.exit(1);
      }

      // Resolver diretório do backup
      let backupDir = options.backupDir;
      if (!backupDir) {
        // Procurar backup mais recente
        const backupsDir = config.backup.outputDir || './backups';
        if (fs.existsSync(backupsDir)) {
          const backups = fs.readdirSync(backupsDir)
            .filter(dir => dir.startsWith('backup-'))
            .sort()
            .reverse();
          
          if (backups.length > 0) {
            backupDir = path.join(backupsDir, backups[0]);
            console.log(chalk.blue(`📁 Usando backup mais recente: ${backups[0]}`));
          }
        }
      }

      if (!backupDir || !fs.existsSync(backupDir)) {
        console.error(chalk.red('❌ Diretório de backup não encontrado'));
        console.log(chalk.yellow('💡 Use: npx smoonb restore --backup-dir <caminho>'));
        process.exit(1);
      }

      console.log(chalk.blue(`🚀 Iniciando restauração do backup: ${path.basename(backupDir)}`));
      console.log(chalk.blue(`🎯 Database destino: ${databaseUrl.replace(/:[^:]*@/, ':***@')}`));

      // Verificar se é clean restore
      if (config.restore.cleanRestore) {
        await checkCleanRestore(databaseUrl);
      }

      // Executar restauração
      await performRestore(backupDir, databaseUrl);

      // Verificação pós-restore
      if (config.restore.verifyAfterRestore) {
        console.log(chalk.blue('\n🔍 Executando verificação pós-restore...'));
        // TODO: Implementar verificação automática
        console.log(chalk.yellow('⚠️ Verificação automática não implementada ainda'));
        console.log(chalk.yellow('💡 Execute manualmente: npx smoonb check'));
      }

      console.log(chalk.green('\n🎉 Restauração concluída com sucesso!'));

    } catch (error) {
      console.error(chalk.red(`❌ Erro na restauração: ${error.message}`));
      process.exit(1);
    }
  });

// Verificar se é possível fazer clean restore
async function checkCleanRestore(databaseUrl) {
  try {
    console.log(chalk.blue('🔍 Verificando se database está vazia...'));
    
    // Verificar se existem tabelas no schema public
    const checkQuery = `
      SELECT COUNT(*) as table_count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `;
    
    const { stdout } = await runCommand(
      `psql "${databaseUrl}" -t -c "${checkQuery}"`
    );
    
    const tableCount = parseInt(stdout.trim());
    
    if (tableCount > 0) {
      console.error(chalk.red('❌ Database não está vazia!'));
      console.log(chalk.yellow('💡 Para clean restore, a database deve estar vazia'));
      console.log(chalk.yellow('💡 Opções:'));
      console.log(chalk.yellow('  1. Criar uma nova database'));
      console.log(chalk.yellow('  2. Desabilitar cleanRestore no .smoonbrc'));
      console.log(chalk.yellow('  3. Limpar manualmente a database'));
      process.exit(1);
    }
    
    console.log(chalk.green('✅ Database está vazia, prosseguindo com clean restore'));
    
  } catch (error) {
    console.log(chalk.yellow(`⚠️ Não foi possível verificar database: ${error.message}`));
    console.log(chalk.yellow('💡 Prosseguindo com restauração...'));
  }
}

// Executar restauração usando psql
async function performRestore(backupDir, databaseUrl) {
  const sqlFiles = ['roles.sql', 'schema.sql', 'data.sql'];
  
  for (const sqlFile of sqlFiles) {
    const filePath = path.join(backupDir, sqlFile);
    
    if (!fs.existsSync(filePath)) {
      console.log(chalk.yellow(`⚠️ Arquivo ${sqlFile} não encontrado, pulando...`));
      continue;
    }
    
    console.log(chalk.blue(`📄 Executando ${sqlFile}...`));
    
    try {
      let command;
      if (sqlFile === 'data.sql') {
        // Para dados, usar single-transaction
        command = `psql "${databaseUrl}" -v ON_ERROR_STOP=1 --single-transaction -f "${filePath}"`;
      } else {
        // Para roles e schema, usar ON_ERROR_STOP
        command = `psql "${databaseUrl}" -v ON_ERROR_STOP=1 -f "${filePath}"`;
      }
      
      const { stdout, stderr } = await runCommand(command);
      
      if (stderr && !stderr.includes('NOTICE')) {
        console.log(chalk.yellow(`⚠️ Avisos em ${sqlFile}: ${stderr}`));
      }
      
      console.log(chalk.green(`✅ ${sqlFile} executado com sucesso`));
      
    } catch (error) {
      throw new Error(`Falha ao executar ${sqlFile}: ${error.message}`);
    }
  }
}

module.exports = restoreCommand;