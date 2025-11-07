const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { readEnvFile, writeEnvFile, backupEnvFile } = require('../../utils/env');
const { saveEnvMap } = require('../../utils/envMap');
const { mapEnvVariablesInteractively } = require('../../interactive/envMapper');
const { showBetaBanner } = require('../../utils/banner');
const { listValidBackups, showRestoreSummary } = require('./utils');
const { confirm } = require('../../utils/prompt');
const { ensureDir } = require('../../utils/fsx');
const step00DockerValidation = require('../backup/steps/00-docker-validation');

// Importar todas as etapas
const step00BackupSelection = require('./steps/00-backup-selection');
const step01ComponentsSelection = require('./steps/01-components-selection');
const step03Database = require('./steps/03-database');
const step04EdgeFunctions = require('./steps/04-edge-functions');
const step05AuthSettings = require('./steps/05-auth-settings');
const step06Storage = require('./steps/06-storage');
const step07DatabaseSettings = require('./steps/07-database-settings');
const step08RealtimeSettings = require('./steps/08-realtime-settings');

/**
 * Função auxiliar para importar arquivo de backup e storage (reutiliza lógica do comando import)
 */
async function importBackupFile(sourceFile, sourceStorageFile, outputDir) {
  // Validar arquivo de backup
  try {
    await fsPromises.access(sourceFile);
  } catch {
    throw new Error(`Arquivo de backup não encontrado: ${sourceFile}`);
  }

  // Verificar se é um arquivo .backup.gz ou .backup
  if (!sourceFile.endsWith('.backup.gz') && !sourceFile.endsWith('.backup')) {
    throw new Error('Arquivo de backup deve ser .backup.gz ou .backup');
  }

  // Validar arquivo de storage se fornecido
  if (sourceStorageFile) {
    try {
      await fsPromises.access(sourceStorageFile);
    } catch {
      throw new Error(`Arquivo de storage não encontrado: ${sourceStorageFile}`);
    }

    // Verificar se é um arquivo .storage.zip
    if (!sourceStorageFile.endsWith('.storage.zip')) {
      throw new Error('Arquivo de storage deve ser .storage.zip');
    }
  }

  // Extrair informações do nome do arquivo de backup
  // Formato esperado: db_cluster-DD-MM-YYYY@HH-MM-SS.backup.gz
  const fileName = path.basename(sourceFile);
  const match = fileName.match(/db_cluster-(\d{2})-(\d{2})-(\d{4})@(\d{2})-(\d{2})-(\d{2})\.backup(\.gz)?/);
  
  if (!match) {
    throw new Error('Nome do arquivo de backup não está no formato esperado do Dashboard. Formato esperado: db_cluster-DD-MM-YYYY@HH-MM-SS.backup.gz');
  }

  const [, day, month, year, hour, minute, second] = match;
  
  // Criar nome da pasta no formato backup-YYYY-MM-DD-HH-MM-SS
  const backupDirName = `backup-${year}-${month}-${day}-${hour}-${minute}-${second}`;
  const backupDir = path.join(outputDir, backupDirName);
  
  // Criar diretório de backup
  await ensureDir(backupDir);
  console.log(chalk.blue(`📁 Importando backup para: ${backupDirName}`));
  
  // Copiar arquivo de backup para o diretório de backup
  const destFile = path.join(backupDir, fileName);
  await fsPromises.copyFile(sourceFile, destFile);
  
  // Obter tamanho do arquivo de backup
  const stats = await fsPromises.stat(destFile);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  
  console.log(chalk.green(`✅ Arquivo de backup importado: ${fileName} (${sizeMB} MB)`));
  
  // Copiar arquivo de storage se fornecido
  if (sourceStorageFile) {
    const storageFileName = path.basename(sourceStorageFile);
    const destStorageFile = path.join(backupDir, storageFileName);
    await fsPromises.copyFile(sourceStorageFile, destStorageFile);
    
    const storageStats = await fsPromises.stat(destStorageFile);
    const storageSizeMB = (storageStats.size / (1024 * 1024)).toFixed(2);
    
    console.log(chalk.green(`✅ Arquivo de storage importado: ${storageFileName} (${storageSizeMB} MB)`));
  }
  
  return backupDir;
}

module.exports = async (options) => {
  showBetaBanner();
  
  try {
    // Termo de uso e aviso de risco
    console.log(chalk.yellow.bold('\n⚠️  TERMO DE USO E AVISO DE RISCO\n'));
    console.log(chalk.white('Ao prosseguir, você reconhece e concorda que o Supa Moonbase (smoonb) é fornecido "NO ESTADO EM QUE SE ENCONTRA" ("AS IS") e "CONFORME DISPONIBILIDADE", sem garantias de qualquer natureza—expressas, implícitas ou legais—incluindo, sem limitação, garantias de comercialização, adequação a um fim específico e não violação, na máxima extensão permitida pela lei aplicável. Operações de backup e restauração envolvem riscos, os ambientes variam amplamente e não é possível prever ou validar todas as configurações dos usuários. Você é o único responsável por validar seu ambiente, manter cópias independentes e verificar os resultados antes de utilizá-los em produção. O Supa Moonbase (smoonb) é construído com repositórios públicos, auditáveis e software livre, para auxiliar pessoas a simplificar seus fluxos, sem com isso criar qualquer garantia, promessa de suporte ou compromisso de nível de serviço.\n'));
    console.log(chalk.white('Limitação de responsabilidade (PT-BR) — Na máxima extensão permitida por lei, a Goalmoon, seus contribuidores e licenciadores não serão responsáveis por danos indiretos, incidentais, especiais, consequentes, exemplares ou punitivos (incluindo perda de dados, interrupção de negócios ou lucros cessantes) decorrentes do uso, incapacidade de uso, das operações de backup/restauração realizadas com, ou dos resultados gerados pelo Supa Moonbase (smoonb). Em qualquer hipótese, a responsabilidade total por todas as reivindicações relacionadas ao Supa Moonbase (smoonb) não excederá o valor pago por você pelo Supa Moonbase (smoonb) nos 12 meses anteriores ao evento. Nada neste aviso exclui ou limita responsabilidades onde tais limites sejam proibidos por lei, incluindo (conforme aplicável) dolo ou culpa grave.\n'));
    console.log(chalk.white('Observação para consumidores no Brasil (PT-BR) — Para consumidores brasileiros, este aviso não afasta direitos irrenunciáveis previstos no Código de Defesa do Consumidor (CDC); qualquer limitação aqui prevista só se aplica nos limites da lei e não impede a indenização obrigatória quando cabível.\n'));
    
    const termsAccepted = await confirm('Você aceita os Termos de Uso e o Aviso de Risco de Restauração?', true);
    if (!termsAccepted) {
      console.log(chalk.red('🚫 Operação cancelada pelo usuário.'));
      process.exit(1);
    }

    // Executar validação Docker ANTES de tudo
    await step00DockerValidation();

    // Consentimento para leitura e escrita do .env.local
    console.log(chalk.yellow('\n⚠️  O smoonb irá ler e escrever o arquivo .env.local localmente.'));
    console.log(chalk.yellow('   Um backup automático do .env.local será criado antes de qualquer alteração.'));
    console.log(chalk.yellow('   Vamos mapear suas variáveis de ambiente para garantir que todas as chaves necessárias'));
    console.log(chalk.yellow('   estejam presentes e com os valores corretos do projeto de destino.'));
    const consentOk = await confirm('Você consente em prosseguir', true);
    if (!consentOk) {
      console.log(chalk.red('🚫 Operação cancelada pelo usuário.'));
      process.exit(1);
    }

    // Preparar diretório de processo restore-YYYY-...
    const rootBackupsDir = path.join(process.cwd(), 'backups');
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}`;
    const processDir = path.join(rootBackupsDir, `restore-${ts}`);
    fs.mkdirSync(path.join(processDir, 'env'), { recursive: true });

    // Backup do .env.local
    const envPath = path.join(process.cwd(), '.env.local');
    const envBackupPath = path.join(processDir, 'env', '.env.local');
    
    // Verificar se o arquivo existe antes de fazer backup
    try {
      await fsPromises.access(envPath);
      await backupEnvFile(envPath, envBackupPath);
      console.log(chalk.blue(`📁 Backup do .env.local: ${path.relative(process.cwd(), envBackupPath)}`));
    } catch {
      // Arquivo não existe, não fazer backup
      console.log(chalk.yellow('⚠️  Arquivo .env.local não encontrado. Será criado durante o mapeamento.'));
    }

    // Leitura e mapeamento interativo
    const currentEnv = await readEnvFile(envPath);
    const expectedKeys = [
      'SUPABASE_PROJECT_ID',
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_DB_URL',
      'SUPABASE_ACCESS_TOKEN',
      'SMOONB_OUTPUT_DIR'
    ];
    const { finalEnv, dePara } = await mapEnvVariablesInteractively(currentEnv, expectedKeys);
    await writeEnvFile(envPath, finalEnv);
    await saveEnvMap(dePara, path.join(processDir, 'env', 'env-map.json'));
    console.log(chalk.green('✅ .env.local atualizado com sucesso. Nenhuma chave renomeada; valores sincronizados.'));

    // Resolver valores esperados a partir do de-para
    function getValue(expectedKey) {
      const clientKey = Object.keys(dePara).find(k => dePara[k] === expectedKey);
      return clientKey ? finalEnv[clientKey] : '';
    }

    // Construir targetProject a partir do .env.local mapeado
    const targetProject = {
      targetProjectId: getValue('SUPABASE_PROJECT_ID'),
      targetUrl: getValue('NEXT_PUBLIC_SUPABASE_URL'),
      targetAnonKey: getValue('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      targetServiceKey: getValue('SUPABASE_SERVICE_ROLE_KEY'),
      targetDatabaseUrl: getValue('SUPABASE_DB_URL'),
      targetAccessToken: getValue('SUPABASE_ACCESS_TOKEN')
    };
    
    const outputDir = getValue('SMOONB_OUTPUT_DIR') || './backups';
    let selectedBackup = null;
    
    // Se --file foi fornecido, importar o arquivo e auto-selecionar
    if (options.file) {
      const sourceFile = path.resolve(options.file);
      const sourceStorageFile = options.storage ? path.resolve(options.storage) : null;
      
      console.log(chalk.blue(`📁 Importando arquivo de backup...`));
      const importedBackupDir = await importBackupFile(sourceFile, sourceStorageFile, outputDir);
      
      // Listar backups válidos para encontrar o backup importado
      const validBackups = await listValidBackups(outputDir);
      selectedBackup = validBackups.find(b => b.path === importedBackupDir);
      
      if (!selectedBackup) {
        throw new Error('Não foi possível encontrar o backup importado');
      }
      
      console.log(chalk.green(`✅ Backup importado e selecionado automaticamente: ${path.basename(selectedBackup.path)}`));
    } else {
      // Fluxo normal: listar e selecionar backup interativamente
      console.log(chalk.blue(`📁 Buscando backups em: ${outputDir}`));
      
      // 1. Listar backups válidos (.backup.gz)
      const validBackups = await listValidBackups(outputDir);
      
      if (validBackups.length === 0) {
        console.error(chalk.red('❌ Nenhum backup válido encontrado'));
        console.log(chalk.yellow('💡 Execute primeiro: npx smoonb backup'));
        process.exit(1);
      }
      
      // 2. Selecionar backup interativamente
      selectedBackup = await step00BackupSelection(validBackups);
    }
    
    // 3. Perguntar quais componentes restaurar
    const components = await step01ComponentsSelection(selectedBackup.path);
    
    // Validar que pelo menos um componente foi selecionado
    if (!Object.values(components).some(Boolean)) {
      console.error(chalk.red('\n❌ Nenhum componente selecionado para restauração!'));
      process.exit(1);
    }
    
    // 4. Mostrar resumo detalhado
    console.log(chalk.cyan('\n📋 RESUMO DA RESTAURAÇÃO:\n'));
    console.log(chalk.white(`   📁 Backup selecionado: ${path.basename(selectedBackup.path)}`));
    console.log(chalk.white(`   🎯 Projeto destino: ${targetProject.targetProjectId || '(não configurado)'}`));
    console.log(chalk.white(`   📊 Database: ${components.database ? 'Sim' : 'Não'}`));
    console.log(chalk.white(`   ⚡ Edge Functions: ${components.edgeFunctions ? 'Sim' : 'Não'}`));
    console.log(chalk.white(`   🔐 Auth Settings: ${components.authSettings ? 'Sim' : 'Não'}`));
    console.log(chalk.white(`   📦 Storage: ${components.storage ? 'Sim' : 'Não'}`));
    console.log(chalk.white(`   🔧 Database Settings: ${components.databaseSettings ? 'Sim' : 'Não'}`));
    console.log(chalk.white(`   🔄 Realtime Settings: ${components.realtimeSettings ? 'Sim' : 'Não'}\n`));
    
    // Mostrar resumo técnico adicional
    showRestoreSummary(selectedBackup, components, targetProject);
    
    // 5. Confirmar execução
    const finalOk = await confirm('Deseja iniciar a restauração com estas configurações?', true);
    if (!finalOk) {
      console.log(chalk.yellow('🚫 Restauração cancelada.'));
      process.exit(0);
    }
    
    // 6. Executar restauração
    console.log(chalk.blue('\n🚀 Iniciando restauração...'));
    
    // Contar etapas totais para numeração dinâmica
    let stepNumber = 0;
    const totalSteps = (components.database ? 1 : 0) + 
                      (components.edgeFunctions ? 1 : 0) + 
                      (components.authSettings ? 1 : 0) + 
                      (components.storage ? 1 : 0) + 
                      (components.databaseSettings ? 1 : 0) + 
                      (components.realtimeSettings ? 1 : 0);
    
    // Armazenar resultados para o resumo final
    const restoreResults = {};
    
    // 6.1 Database (se selecionado)
    if (components.database) {
      stepNumber++;
      console.log(chalk.blue(`\n📊 ${stepNumber}/${totalSteps} - Restaurando Database...`));
      await step03Database({
        backupFilePath: path.join(selectedBackup.path, selectedBackup.backupFile),
        targetDatabaseUrl: targetProject.targetDatabaseUrl
      });
      restoreResults.database = { success: true };
    }
    
    // 6.2 Edge Functions (se selecionado)
    if (components.edgeFunctions) {
      stepNumber++;
      console.log(chalk.blue(`\n⚡ ${stepNumber}/${totalSteps} - Restaurando Edge Functions...`));
      const edgeFunctionsResult = await step04EdgeFunctions({
        backupPath: selectedBackup.path,
        targetProject
      });
      restoreResults.edgeFunctions = edgeFunctionsResult || { success: true };
    }
    
    // 6.3 Auth Settings (se selecionado)
    if (components.authSettings) {
      stepNumber++;
      console.log(chalk.blue(`\n🔐 ${stepNumber}/${totalSteps} - Restaurando Auth Settings...`));
      await step05AuthSettings({
        backupPath: selectedBackup.path,
        targetProject
      });
      restoreResults.authSettings = { success: true };
    }
    
    // 6.4 Storage Buckets (se selecionado)
    if (components.storage) {
      stepNumber++;
      console.log(chalk.blue(`\n📦 ${stepNumber}/${totalSteps} - Restaurando Storage Buckets...`));
      const storageResult = await step06Storage({
        backupPath: selectedBackup.path
      });
      restoreResults.storage = storageResult || { success: true };
    }
    
    // 6.5 Database Settings (se selecionado)
    if (components.databaseSettings) {
      stepNumber++;
      console.log(chalk.blue(`\n🔧 ${stepNumber}/${totalSteps} - Restaurando Database Settings...`));
      await step07DatabaseSettings({
        backupPath: selectedBackup.path,
        targetProject
      });
      restoreResults.databaseSettings = { success: true };
    }
    
    // 6.6 Realtime Settings (se selecionado)
    if (components.realtimeSettings) {
      stepNumber++;
      console.log(chalk.blue(`\n🔄 ${stepNumber}/${totalSteps} - Restaurando Realtime Settings...`));
      await step08RealtimeSettings({
        backupPath: selectedBackup.path,
        targetProject
      });
      restoreResults.realtimeSettings = { success: true };
    }
    
    // report.json de restauração
    const report = {
      process: 'restore',
      created_at: new Date().toISOString(),
      target_project_id: targetProject.targetProjectId,
      assets: {
        env: path.join(processDir, 'env', '.env.local'),
        env_map: path.join(processDir, 'env', 'env-map.json')
      },
      components: components,
      results: restoreResults,
      notes: [
        'supabase/functions limpo antes e depois do deploy (se Edge Functions selecionado)'
      ]
    };
    try {
      fs.writeFileSync(path.join(processDir, 'report.json'), JSON.stringify(report, null, 2));
    } catch {
      // silencioso
    }

    // Exibir resumo final
    console.log(chalk.green('\n🎉 RESTAURAÇÃO COMPLETA FINALIZADA!'));
    console.log(chalk.blue(`🎯 Projeto destino: ${targetProject.targetProjectId || '(não configurado)'}`));
    
    if (restoreResults.database) {
      console.log(chalk.green(`📊 Database: Restaurada com sucesso via Docker`));
    }
    
    if (restoreResults.edgeFunctions) {
      const funcCount = restoreResults.edgeFunctions.functions_count || 0;
      const successCount = restoreResults.edgeFunctions.success_count || 0;
      console.log(chalk.green(`⚡ Edge Functions: ${successCount}/${funcCount} functions restauradas`));
    }
    
    if (restoreResults.authSettings) {
      console.log(chalk.green(`🔐 Auth Settings: Configurações exibidas para configuração manual`));
    }
    
    if (restoreResults.storage) {
      const bucketCount = restoreResults.storage.buckets_count || 0;
      console.log(chalk.green(`📦 Storage: ${bucketCount} bucket(s) encontrado(s) - migração manual necessária`));
    }
    
    if (restoreResults.databaseSettings) {
      console.log(chalk.green(`🔧 Database Settings: Extensões e configurações restauradas via SQL`));
    }
    
    if (restoreResults.realtimeSettings) {
      console.log(chalk.green(`🔄 Realtime Settings: Configurações exibidas para configuração manual`));
    }
    
  } catch (error) {
    console.error(chalk.red(`❌ Erro na restauração: ${error.message}`));
    process.exit(1);
  }
};

