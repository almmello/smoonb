const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const { ensureDir } = require('../utils/fsx');
const { readEnvFile } = require('../utils/env');
const { showBetaBanner } = require('../utils/banner');
const { confirm } = require('../utils/prompt');

/**
 * Comando para importar arquivo .backup.gz e opcionalmente .storage.zip do Dashboard do Supabase
 */
module.exports = async (options) => {
  showBetaBanner();
  
  try {
    // Termo de uso e aviso de risco
    console.log(chalk.yellow.bold('\n⚠️  TERMO DE USO E AVISO DE RISCO\n'));
    console.log(chalk.white('Ao prosseguir, você reconhece e concorda que o Supa Moonbase (smoonb) é fornecido "NO ESTADO EM QUE SE ENCONTRA" ("AS IS") e "CONFORME DISPONIBILIDADE", sem garantias de qualquer natureza—expressas, implícitas ou legais—incluindo, sem limitação, garantias de comercialização, adequação a um fim específico e não violação, na máxima extensão permitida pela lei aplicável. Operações de backup e restauração envolvem riscos, os ambientes variam amplamente e não é possível prever ou validar todas as configurações dos usuários. Você é o único responsável por validar seu ambiente, manter cópias independentes e verificar os resultados antes de utilizá-los em produção. O Supa Moonbase (smoonb) é construído com repositórios públicos, auditáveis e software livre, para auxiliar pessoas a simplificar seus fluxos, sem com isso criar qualquer garantia, promessa de suporte ou compromisso de nível de serviço.\n'));
    console.log(chalk.white('Limitação de responsabilidade (PT-BR) — Na máxima extensão permitida por lei, a Goalmoon, seus contribuidores e licenciadores não serão responsáveis por danos indiretos, incidentais, especiais, consequentes, exemplares ou punitivos (incluindo perda de dados, interrupção de negócios ou lucros cessantes) decorrentes do uso, incapacidade de uso, das operações de backup/restauração realizadas com, ou dos resultados gerados pelo Supa Moonbase (smoonb). Em qualquer hipótese, a responsabilidade total por todas as reivindicações relacionadas ao Supa Moonbase (smoonb) não excederá o valor pago por você pelo Supa Moonbase (smoonb) nos 12 meses anteriores ao evento. Nada neste aviso exclui ou limita responsabilidades onde tais limites sejam proibidos por lei, incluindo (conforme aplicável) dolo ou culpa grave.\n'));
    console.log(chalk.white('Observação para consumidores no Brasil (PT-BR) — Para consumidores brasileiros, este aviso não afasta direitos irrenunciáveis previstos no Código de Defesa do Consumidor (CDC); qualquer limitação aqui prevista só se aplica nos limites da lei e não impede a indenização obrigatória quando cabível.\n'));
    
    const termsAccepted = await confirm('Você aceita os Termos de Uso e o Aviso de Risco de Importação?', true);
    if (!termsAccepted) {
      console.log(chalk.red('🚫 Operação cancelada pelo usuário.'));
      process.exit(1);
    }

    // Validar que o arquivo de backup foi fornecido
    if (!options.file) {
      console.error(chalk.red('❌ Arquivo de backup não fornecido'));
      console.log(chalk.yellow('💡 Use: npx smoonb import --file <caminho-do-backup> [--storage <caminho-do-storage>]'));
      console.log(chalk.white('   Exemplo: npx smoonb import --file "C:\\Downloads\\db_cluster-04-03-2024@14-16-59.backup.gz"'));
      console.log(chalk.white('   Exemplo com storage: npx smoonb import --file "backup.backup.gz" --storage "meu-projeto.storage.zip"'));
      process.exit(1);
    }

    const sourceFile = path.resolve(options.file);
    
    // Verificar se o arquivo de backup existe
    try {
      await fs.access(sourceFile);
    } catch {
      console.error(chalk.red(`❌ Arquivo de backup não encontrado: ${sourceFile}`));
      process.exit(1);
    }

    // Verificar se é um arquivo .backup.gz ou .backup
    if (!sourceFile.endsWith('.backup.gz') && !sourceFile.endsWith('.backup')) {
      console.error(chalk.red('❌ Arquivo de backup deve ser .backup.gz ou .backup'));
      process.exit(1);
    }

    // Validar arquivo de storage se fornecido
    let sourceStorageFile = null;
    if (options.storage) {
      sourceStorageFile = path.resolve(options.storage);
      
      try {
        await fs.access(sourceStorageFile);
      } catch {
        console.error(chalk.red(`❌ Arquivo de storage não encontrado: ${sourceStorageFile}`));
        process.exit(1);
      }

      // Verificar se é um arquivo .storage.zip
      if (!sourceStorageFile.endsWith('.storage.zip')) {
        console.error(chalk.red('❌ Arquivo de storage deve ser .storage.zip'));
        process.exit(1);
      }
    }

    // Ler .env.local para obter SMOONB_OUTPUT_DIR
    const envPath = path.join(process.cwd(), '.env.local');
    let outputDir = './backups';
    
    try {
      const currentEnv = await readEnvFile(envPath);
      outputDir = currentEnv.SMOONB_OUTPUT_DIR || './backups';
    } catch {
      // Se não conseguir ler .env.local, usar padrão
      console.log(chalk.yellow('⚠️  Não foi possível ler .env.local, usando diretório padrão: ./backups'));
    }

    // Extrair informações do nome do arquivo de backup
    // Formato esperado: db_cluster-DD-MM-YYYY@HH-MM-SS.backup.gz
    const fileName = path.basename(sourceFile);
    const match = fileName.match(/db_cluster-(\d{2})-(\d{2})-(\d{4})@(\d{2})-(\d{2})-(\d{2})\.backup(\.gz)?/);
    
    if (!match) {
      console.error(chalk.red('❌ Nome do arquivo de backup não está no formato esperado do Dashboard'));
      console.log(chalk.yellow('💡 Formato esperado: db_cluster-DD-MM-YYYY@HH-MM-SS.backup.gz'));
      console.log(chalk.white(`   Arquivo recebido: ${fileName}`));
      process.exit(1);
    }

    const [, day, month, year, hour, minute, second] = match;
    
    // Criar nome da pasta no formato backup-YYYY-MM-DD-HH-MM-SS
    const backupDirName = `backup-${year}-${month}-${day}-${hour}-${minute}-${second}`;
    const backupDir = path.join(outputDir, backupDirName);
    
    // Criar diretório de backup
    await ensureDir(backupDir);
    console.log(chalk.blue(`📁 Criando diretório de backup: ${backupDirName}`));
    
    // Copiar arquivo de backup para o diretório de backup
    const destFile = path.join(backupDir, fileName);
    await fs.copyFile(sourceFile, destFile);
    
    // Obter tamanho do arquivo de backup
    const stats = await fs.stat(destFile);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    console.log(chalk.green(`✅ Arquivo de backup importado com sucesso!`));
    console.log(chalk.blue(`📦 Backup: ${fileName} (${sizeMB} MB)`));
    
    // Copiar arquivo de storage se fornecido
    if (sourceStorageFile) {
      const storageFileName = path.basename(sourceStorageFile);
      const destStorageFile = path.join(backupDir, storageFileName);
      await fs.copyFile(sourceStorageFile, destStorageFile);
      
      const storageStats = await fs.stat(destStorageFile);
      const storageSizeMB = (storageStats.size / (1024 * 1024)).toFixed(2);
      
      console.log(chalk.green(`✅ Arquivo de storage importado com sucesso!`));
      console.log(chalk.blue(`📦 Storage: ${storageFileName} (${storageSizeMB} MB)`));
    }
    
    console.log(chalk.blue(`📁 Localização: ${backupDir}`));
    console.log(chalk.cyan(`\n💡 Próximo passo: Execute 'npx smoonb restore' para restaurar este backup`));
    
  } catch (error) {
    console.error(chalk.red(`❌ Erro ao importar arquivo: ${error.message}`));
    process.exit(1);
  }
};

