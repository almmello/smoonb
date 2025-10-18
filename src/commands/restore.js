const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const inquirer = require('inquirer');
const { ensureBin, runCommand } = require('../utils/cli');
const { readConfig, validateFor } = require('../utils/config');
const { showBetaBanner } = require('../utils/banner');

// Exportar FUNÇÃO em vez de objeto Command
module.exports = async (options) => {
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

    console.log(chalk.blue(`🔍 Procurando backups em: ${config.backup.outputDir || './backups'}`));

    // Listar backups disponíveis
    const backups = await listAvailableBackups(config.backup.outputDir || './backups');
    
    if (backups.length === 0) {
      console.error(chalk.red('❌ Nenhum backup encontrado'));
      console.log(chalk.yellow('💡 Execute primeiro: npx smoonb backup'));
      process.exit(1);
    }

    // Seleção interativa do backup
    const selectedBackup = await selectBackup(backups);
    
    console.log(chalk.blue(`🚀 Iniciando restauração do backup: ${selectedBackup.name}`));
    console.log(chalk.blue(`🎯 Database destino: ${databaseUrl.replace(/:[^:]*@/, ':***@')}`));

    // Verificar se é clean restore
    if (config.restore.cleanRestore) {
      await checkCleanRestore(databaseUrl);
    }

    // Executar restauração
    await performRestore(selectedBackup.path, databaseUrl);

    // Verificação pós-restore
    if (config.restore.verifyAfterRestore) {
      console.log(chalk.blue('\n🔍 Executando verificação pós-restore...'));
      console.log(chalk.yellow('💡 Execute manualmente: npx smoonb check'));
    }

    console.log(chalk.green('\n🎉 Restauração concluída com sucesso!'));

  } catch (error) {
    console.error(chalk.red(`❌ Erro na restauração: ${error.message}`));
    process.exit(1);
  }
};

// Listar backups disponíveis
async function listAvailableBackups(backupsDir) {
  if (!fs.existsSync(backupsDir)) {
    return [];
  }

  const items = fs.readdirSync(backupsDir, { withFileTypes: true });
  const backups = [];

  for (const item of items) {
    if (item.isDirectory() && item.name.startsWith('backup-')) {
      const backupPath = path.join(backupsDir, item.name);
      const manifestPath = path.join(backupPath, 'backup-manifest.json');
      
      let manifest = null;
      if (fs.existsSync(manifestPath)) {
        try {
          manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        } catch (error) {
          console.warn(chalk.yellow(`⚠️ Erro ao ler manifesto: ${item.name}`));
        }
      }

      const stats = fs.statSync(backupPath);
      
      backups.push({
        name: item.name,
        path: backupPath,
        created: manifest?.created_at || stats.birthtime.toISOString(),
        projectId: manifest?.project_id || 'Desconhecido',
        size: getDirectorySize(backupPath),
        manifest: manifest
      });
    }
  }

  // Ordenar por data de criação (mais recente primeiro)
  return backups.sort((a, b) => new Date(b.created) - new Date(a.created));
}

// Calcular tamanho do diretório
function getDirectorySize(dirPath) {
  let totalSize = 0;
  
  function calculateSize(itemPath) {
    const stats = fs.statSync(itemPath);
    
    if (stats.isDirectory()) {
      const items = fs.readdirSync(itemPath);
      for (const item of items) {
        calculateSize(path.join(itemPath, item));
      }
    } else {
      totalSize += stats.size;
    }
  }
  
  try {
    calculateSize(dirPath);
  } catch (error) {
    // Ignorar erros de acesso
  }
  
  return formatBytes(totalSize);
}

// Formatar bytes em formato legível
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Seleção interativa do backup
async function selectBackup(backups) {
  console.log(chalk.blue('\n📋 Backups disponíveis:'));
  console.log(chalk.blue('═'.repeat(80)));
  
  const choices = backups.map((backup, index) => {
    const date = new Date(backup.created).toLocaleString('pt-BR');
    const projectInfo = backup.projectId !== 'Desconhecido' ? ` (${backup.projectId})` : '';
    
    return {
      name: `${index + 1}. ${backup.name}${projectInfo}\n   📅 ${date} | 📦 ${backup.size}`,
      value: backup,
      short: backup.name
    };
  });

  const { selectedBackup } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedBackup',
      message: 'Selecione o backup para restaurar:',
      choices: choices,
      pageSize: 10
    }
  ]);

  return selectedBackup;
}

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