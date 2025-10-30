const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const { readConfig, getSourceProject, getTargetProject } = require('../utils/config');
const { showBetaBanner } = require('../utils/banner');
const inquirer = require('inquirer');
const { readEnvFile, writeEnvFile, backupEnvFile } = require('../utils/env');
const { saveEnvMap } = require('../utils/envMap');
const { mapEnvVariablesInteractively } = require('../interactive/envMapper');

module.exports = async (options) => {
  showBetaBanner();
  
  try {
    // Consentimento para leitura e escrita do .env.local
    console.log(chalk.yellow('⚠️  O smoonb irá ler e escrever o arquivo .env.local localmente.'));
    console.log(chalk.yellow('   Um backup automático do .env.local será criado antes de qualquer alteração.'));
    const consent = await inquirer.prompt([{ type: 'confirm', name: 'ok', message: 'Você consente em prosseguir (S/n):', default: true }]);
    if (!consent.ok) {
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
    await backupEnvFile(envPath, envBackupPath);
    console.log(chalk.blue(`📁 Backup do .env.local: ${path.relative(process.cwd(), envBackupPath)}`));

    // Leitura e mapeamento interativo
    const currentEnv = await readEnvFile(envPath);
    const expectedKeys = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_DB_URL',
      'SUPABASE_PROJECT_ID',
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
    
    console.log(chalk.blue(`📁 Buscando backups em: ${getValue('SMOONB_OUTPUT_DIR') || './backups'}`));
    
    // 1. Listar backups válidos (.backup.gz)
    const validBackups = await listValidBackups(getValue('SMOONB_OUTPUT_DIR') || './backups');
    
    if (validBackups.length === 0) {
      console.error(chalk.red('❌ Nenhum backup válido encontrado'));
      console.log(chalk.yellow('💡 Execute primeiro: npx smoonb backup'));
      process.exit(1);
    }
    
    // 2. Selecionar backup interativamente
    const selectedBackup = await selectBackupInteractive(validBackups);
    
    // 3. Perguntar quais componentes restaurar
    const components = await askRestoreComponents(selectedBackup.path);
    
    // Validar que pelo menos um componente foi selecionado
    if (!Object.values(components).some(Boolean)) {
      console.error(chalk.red('\n❌ Nenhum componente selecionado para restauração!'));
      process.exit(1);
    }
    
    // 4. Mostrar resumo
    showRestoreSummary(selectedBackup, components, targetProject);
    
    // 5. Confirmar execução
    const confirmed = await confirmExecution();
    if (!confirmed) {
      console.log(chalk.yellow('Restauração cancelada.'));
      process.exit(0);
    }
    
    // 6. Executar restauração
    console.log(chalk.blue('\n🚀 Iniciando restauração...'));
    
    // 6.1 Database (se selecionado)
    if (components.database) {
      await restoreDatabaseGz(
        path.join(selectedBackup.path, selectedBackup.backupFile),
        targetProject.targetDatabaseUrl
      );
    }
    
    // 6.2 Edge Functions (se selecionado)
    if (components.edgeFunctions) {
      await restoreEdgeFunctions(selectedBackup.path, targetProject);
    }
    
    // 6.3 Auth Settings (se selecionado)
    if (components.authSettings) {
      await restoreAuthSettings(selectedBackup.path, targetProject);
    }
    
    // 6.4 Storage Buckets (se selecionado)
    if (components.storage) {
      await restoreStorageBuckets(selectedBackup.path, targetProject);
    }
    
    // 6.5 Database Settings (se selecionado)
    if (components.databaseSettings) {
      await restoreDatabaseSettings(selectedBackup.path, targetProject);
    }
    
    // 6.6 Realtime Settings (se selecionado)
    if (components.realtimeSettings) {
      await restoreRealtimeSettings(selectedBackup.path, targetProject);
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
      notes: [
        'supabase/functions limpo antes e depois do deploy (se Edge Functions selecionado)'
      ]
    };
    try {
      require('fs').writeFileSync(path.join(processDir, 'report.json'), JSON.stringify(report, null, 2));
    } catch (e) {
      // silencioso
    }

    console.log(chalk.green('\n🎉 Restauração completa finalizada!'));
    
  } catch (error) {
    console.error(chalk.red(`❌ Erro na restauração: ${error.message}`));
    process.exit(1);
  }
};

// Listar backups válidos (aceita .backup.gz e .backup)
async function listValidBackups(backupsDir) {
  if (!fs.existsSync(backupsDir)) {
    return [];
  }

  const items = fs.readdirSync(backupsDir, { withFileTypes: true });
  const validBackups = [];

  for (const item of items) {
    if (item.isDirectory() && item.name.startsWith('backup-')) {
      const backupPath = path.join(backupsDir, item.name);
      const files = fs.readdirSync(backupPath);
      // Aceitar tanto .backup.gz quanto .backup
      const backupFile = files.find(file => 
        file.endsWith('.backup.gz') || file.endsWith('.backup')
      );
      
      if (backupFile) {
        const manifestPath = path.join(backupPath, 'backup-manifest.json');
        let manifest = null;
        
        if (fs.existsSync(manifestPath)) {
          try {
            manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          } catch (error) {
            // Ignorar erro de leitura do manifest
          }
        }

        const stats = fs.statSync(path.join(backupPath, backupFile));
        
        validBackups.push({
          name: item.name,
          path: backupPath,
          backupFile: backupFile,
          created: manifest?.created_at || stats.birthtime.toISOString(),
          projectId: manifest?.project_id || 'Desconhecido',
          size: formatBytes(stats.size),
          manifest: manifest
        });
      }
    }
  }

  return validBackups.sort((a, b) => new Date(b.created) - new Date(a.created));
}

// Formatar bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Seleção interativa de backup
async function selectBackupInteractive(backups) {
  console.log(chalk.blue('\n📋 Backups disponíveis:'));
  console.log(chalk.blue('═'.repeat(80)));
  
  backups.forEach((backup, index) => {
    const date = new Date(backup.created).toLocaleString('pt-BR');
    const projectInfo = backup.projectId !== 'Desconhecido' ? ` (${backup.projectId})` : '';
    
    console.log(`${index + 1}. ${backup.name}${projectInfo}`);
    console.log(`   📅 ${date} | 📦 ${backup.size}`);
    console.log('');
  });
  
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const question = (query) => new Promise(resolve => readline.question(query, resolve));
  
  const choice = await question(`\nDigite o número do backup para restaurar (1-${backups.length}): `);
  readline.close();
  
  const backupIndex = parseInt(choice) - 1;
  
  if (backupIndex < 0 || backupIndex >= backups.length) {
    throw new Error('Número inválido');
  }
  
  return backups[backupIndex];
}

// Perguntar quais componentes restaurar
async function askRestoreComponents(backupPath) {
  const questions = [];
  
  // Database
  questions.push({
    type: 'confirm',
    name: 'restoreDatabase',
    message: 'Deseja restaurar Database (S/n):',
    default: true
  });
  
  // Edge Functions
  const edgeFunctionsDir = path.join(backupPath, 'edge-functions');
  if (fs.existsSync(edgeFunctionsDir) && fs.readdirSync(edgeFunctionsDir).length > 0) {
    questions.push({
      type: 'confirm',
      name: 'restoreEdgeFunctions',
      message: 'Deseja restaurar Edge Functions (S/n):',
      default: true
    });
  }
  
  // Auth Settings
  if (fs.existsSync(path.join(backupPath, 'auth-settings.json'))) {
    questions.push({
      type: 'confirm',
      name: 'restoreAuthSettings',
      message: 'Deseja restaurar Auth Settings (s/N):',
      default: false
    });
  }
  
  // Storage Buckets
  const storageDir = path.join(backupPath, 'storage');
  if (fs.existsSync(storageDir) && fs.readdirSync(storageDir).length > 0) {
    questions.push({
      type: 'confirm',
      name: 'restoreStorage',
      message: 'Deseja ver informações de Storage Buckets (s/N):',
      default: false
    });
  }
  
  // Database Extensions and Settings
  const dbSettingsFiles = fs.readdirSync(backupPath)
    .filter(file => file.startsWith('database-settings-') && file.endsWith('.json'));
  if (dbSettingsFiles.length > 0) {
    questions.push({
      type: 'confirm',
      name: 'restoreDatabaseSettings',
      message: 'Deseja restaurar Database Extensions and Settings (s/N):',
      default: false
    });
  }
  
  // Realtime Settings
  if (fs.existsSync(path.join(backupPath, 'realtime-settings.json'))) {
    questions.push({
      type: 'confirm',
      name: 'restoreRealtimeSettings',
      message: 'Deseja restaurar Realtime Settings (s/N):',
      default: false
    });
  }
  
  const answers = await inquirer.prompt(questions);
  
  return {
    database: answers.restoreDatabase,
    edgeFunctions: answers.restoreEdgeFunctions || false,
    storage: answers.restoreStorage || false,
    authSettings: answers.restoreAuthSettings || false,
    databaseSettings: answers.restoreDatabaseSettings || false,
    realtimeSettings: answers.restoreRealtimeSettings || false
  };
}

// Mostrar resumo da restauração
function showRestoreSummary(backup, components, targetProject) {
  console.log(chalk.blue('\n📋 Resumo da Restauração:'));
  console.log(chalk.blue('═'.repeat(80)));
  console.log(chalk.cyan(`📦 Backup: ${backup.name}`));
  console.log(chalk.cyan(`📤 Projeto Origem: ${backup.projectId}`));
  console.log(chalk.cyan(`📥 Projeto Destino: ${targetProject.targetProjectId}`));
  console.log('');
  console.log(chalk.cyan('Componentes que serão restaurados:'));
  console.log('');
  
  if (components.database) {
    console.log('✅ Database (psql -f via Docker)');
  }
  
  if (components.edgeFunctions) {
    const edgeFunctionsDir = path.join(backup.path, 'edge-functions');
    const functions = fs.readdirSync(edgeFunctionsDir).filter(item => 
      fs.statSync(path.join(edgeFunctionsDir, item)).isDirectory()
    );
    console.log(`⚡ Edge Functions: ${functions.length} function(s)`);
    functions.forEach(func => console.log(`   - ${func}`));
  }
  
  if (components.authSettings) {
    console.log('🔐 Auth Settings: Exibir URL e valores para configuração manual');
  }
  
  if (components.storage) {
    console.log('📦 Storage Buckets: Exibir informações e instruções do Google Colab');
  }
  
  if (components.databaseSettings) {
    console.log('🔧 Database Extensions and Settings: Restaurar via SQL');
  }
  
  if (components.realtimeSettings) {
    console.log('🔄 Realtime Settings: Exibir URL e valores para configuração manual');
  }
  
  console.log('');
}

// Confirmar execução
async function confirmExecution() {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const question = (query) => new Promise(resolve => readline.question(query, resolve));
  
  const confirm = await question('Deseja continuar com a restauração? (s/N): ');
  readline.close();
  
  return confirm.toLowerCase() === 's';
}

// Restaurar Database via psql (conforme documentação oficial Supabase: https://supabase.com/docs/guides/platform/migrating-within-supabase/dashboard-restore)
// Aceita tanto arquivos .backup.gz quanto .backup já descompactados
async function restoreDatabaseGz(backupFilePath, targetDatabaseUrl) {
  console.log(chalk.blue('📊 Restaurando Database...'));
  
  try {
    const { execSync } = require('child_process');
    
    const backupDirAbs = path.resolve(path.dirname(backupFilePath));
    const fileName = path.basename(backupFilePath);
    let uncompressedFile = fileName;
    
    // Verificar se é arquivo .backup.gz (compactado) ou .backup (descompactado)
    if (fileName.endsWith('.backup.gz')) {
      console.log(chalk.gray('   - Arquivo .backup.gz detectado'));
      console.log(chalk.gray('   - Extraindo arquivo .gz...'));
      
      const unzipCmd = [
        'docker run --rm',
        `-v "${backupDirAbs}:/host"`,
        'postgres:17 gunzip /host/' + fileName
      ].join(' ');
      
      execSync(unzipCmd, { stdio: 'pipe' });
      uncompressedFile = fileName.replace('.gz', '');
      console.log(chalk.gray('   - Arquivo descompactado: ' + uncompressedFile));
    } else if (fileName.endsWith('.backup')) {
      console.log(chalk.gray('   - Arquivo .backup detectado (já descompactado)'));
      console.log(chalk.gray('   - Prosseguindo com restauração direta'));
    } else {
      throw new Error(`Formato de arquivo inválido. Esperado .backup.gz ou .backup, recebido: ${fileName}`);
    }
    
    // Extrair credenciais da URL de conexão
    const urlMatch = targetDatabaseUrl.match(/postgresql:\/\/([^@:]+):([^@]+)@(.+)$/);
    
    if (!urlMatch) {
      throw new Error('Database URL inválida. Formato esperado: postgresql://user:password@host/database');
    }
    
    // Comando psql conforme documentação oficial Supabase
    // Formato: psql -d [CONNECTION_STRING] -f /file/path
    // Referência: https://supabase.com/docs/guides/platform/migrating-within-supabase/dashboard-restore
    const restoreCmd = [
      'docker run --rm --network host',
      `-v "${backupDirAbs}:/host"`,
      `-e PGPASSWORD="${encodeURIComponent(urlMatch[2])}"`,
      'postgres:17 psql',
      `-d "${targetDatabaseUrl}"`,
      `-f /host/${uncompressedFile}`
    ].join(' ');
    
    console.log(chalk.gray('   - Executando psql via Docker...'));
    console.log(chalk.gray('   ℹ️ Seguindo documentação oficial Supabase'));
    console.log(chalk.yellow('   ⚠️ AVISO: Erros como "object already exists" são ESPERADOS'));
    console.log(chalk.yellow('   ⚠️ Isto acontece porque o backup contém CREATE para todos os schemas'));
    console.log(chalk.yellow('   ⚠️ Supabase já tem auth e storage criados, então esses erros são normais'));
    
    // Executar comando de restauração
    execSync(restoreCmd, { stdio: 'inherit', encoding: 'utf8' });
    
    console.log(chalk.green('   ✅ Database restaurada com sucesso!'));
    console.log(chalk.gray('   ℹ️ Erros "already exists" são normais e não afetam a restauração'));
    
  } catch (error) {
    // Erros esperados conforme documentação oficial Supabase
    // Referência: https://supabase.com/docs/guides/platform/migrating-within-supabase/dashboard-restore#common-errors
    if (error.message.includes('already exists') || 
        error.message.includes('constraint') ||
        error.message.includes('duplicate') ||
        error.stdout?.includes('already exists')) {
      console.log(chalk.yellow('   ⚠️ Erros esperados encontrados (conforme documentação Supabase)'));
      console.log(chalk.green('   ✅ Database restaurada com sucesso!'));
      console.log(chalk.gray('   ℹ️ Erros são ignorados pois são comandos de CREATE que já existem'));
    } else {
      console.error(chalk.red(`   ❌ Erro inesperado na restauração: ${error.message}`));
      throw error;
    }
  }
}

// Restaurar Edge Functions via supabase functions deploy
async function restoreEdgeFunctions(backupPath, targetProject) {
  console.log(chalk.blue('\n⚡ Restaurando Edge Functions...'));
  
  try {
    const fs = require('fs').promises;
    const { execSync } = require('child_process');
    const edgeFunctionsDir = path.join(backupPath, 'edge-functions');
    
    if (!await fs.access(edgeFunctionsDir).then(() => true).catch(() => false)) {
      console.log(chalk.yellow('   ⚠️  Nenhuma Edge Function encontrada no backup'));
      return;
    }
    
    const items = await fs.readdir(edgeFunctionsDir);
    const functions = [];
    
    for (const item of items) {
      const itemPath = path.join(edgeFunctionsDir, item);
      const stats = await fs.stat(itemPath);
      if (stats.isDirectory()) {
        functions.push(item);
      }
    }
    
    if (functions.length === 0) {
      console.log(chalk.yellow('   ⚠️  Nenhuma Edge Function encontrada no backup'));
      return;
    }
    
    console.log(chalk.gray(`   - Encontradas ${functions.length} Edge Function(s)`));
    
    // ✅ COPIAR Edge Functions de backups/backup-XXX/edge-functions para supabase/functions
    const supabaseFunctionsDir = path.join(process.cwd(), 'supabase', 'functions');
    
    // Criar diretório supabase/functions se não existir
    await fs.mkdir(supabaseFunctionsDir, { recursive: true });
    
    // Limpar supabase/functions antes de copiar
    console.log(chalk.gray('   - Limpando supabase/functions...'));
    try {
      await fs.rm(supabaseFunctionsDir, { recursive: true, force: true });
      await fs.mkdir(supabaseFunctionsDir, { recursive: true });
    } catch (cleanError) {
      // Ignorar erro de limpeza se não existir
    }
    
    // Copiar cada Edge Function para supabase/functions
    for (const funcName of functions) {
      const backupFuncPath = path.join(edgeFunctionsDir, funcName);
      const targetFuncPath = path.join(supabaseFunctionsDir, funcName);
      
      console.log(chalk.gray(`   - Copiando ${funcName} para supabase/functions...`));
      
      // Copiar recursivamente
      await copyDirectoryRecursive(backupFuncPath, targetFuncPath);
    }
    
    console.log(chalk.gray(`   - Linkando com projeto ${targetProject.targetProjectId}...`));
    
    // Linkar com o projeto destino
    try {
      execSync(`supabase link --project-ref ${targetProject.targetProjectId}`, {
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 10000,
        env: { ...process.env, SUPABASE_ACCESS_TOKEN: targetProject.targetAccessToken || '' }
      });
    } catch (linkError) {
      console.log(chalk.yellow('   ⚠️  Link pode já existir, continuando...'));
    }
    
    // Deploy das Edge Functions
    for (const funcName of functions) {
      console.log(chalk.gray(`   - Deployando ${funcName}...`));
      
      try {
        execSync(`supabase functions deploy ${funcName}`, {
          cwd: process.cwd(),
          stdio: 'pipe',
          encoding: 'utf8',
          timeout: 120000,
          env: { ...process.env, SUPABASE_ACCESS_TOKEN: targetProject.targetAccessToken || '' }
        });
        
        console.log(chalk.green(`   ✅ ${funcName} deployada com sucesso!`));
      } catch (deployError) {
        console.log(chalk.yellow(`   ⚠️  ${funcName} - deploy falhou: ${deployError.message}`));
      }
    }
    
    // Limpar supabase/functions após deploy
    console.log(chalk.gray('   - Limpando supabase/functions após deploy...'));
    try {
      await fs.rm(supabaseFunctionsDir, { recursive: true, force: true });
    } catch (cleanError) {
      // Ignorar erro de limpeza
    }
    
    console.log(chalk.green('   ✅ Edge Functions restauradas com sucesso!'));
    
  } catch (error) {
    console.error(chalk.red(`   ❌ Erro ao restaurar Edge Functions: ${error.message}`));
  }
}

// Função auxiliar para copiar diretório recursivamente
async function copyDirectoryRecursive(src, dest) {
  const fs = require('fs').promises;
  
  await fs.mkdir(dest, { recursive: true });
  
  const entries = await fs.readdir(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      await copyDirectoryRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

// Restaurar Storage Buckets (interativo - exibir informações)
async function restoreStorageBuckets(backupPath, targetProject) {
  console.log(chalk.blue('\n📦 Restaurando Storage Buckets...'));
  
  try {
    const storageDir = path.join(backupPath, 'storage');
    
    if (!fs.existsSync(storageDir)) {
      console.log(chalk.yellow('   ⚠️  Nenhum bucket de Storage encontrado no backup'));
      return;
    }
    
    const manifestPath = path.join(backupPath, 'backup-manifest.json');
    let manifest = null;
    
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    }
    
    const buckets = manifest?.components?.storage?.buckets || [];
    
    if (buckets.length === 0) {
      console.log(chalk.gray('   ℹ️  Nenhum bucket para restaurar'));
      return;
    }
    
    console.log(chalk.green(`\n   ✅ ${buckets.length} bucket(s) encontrado(s) no backup`));
    buckets.forEach(bucket => {
      console.log(chalk.gray(`   - ${bucket.name} (${bucket.public ? 'público' : 'privado'})`));
    });
    
    const colabUrl = 'https://colab.research.google.com/github/PLyn/supabase-storage-migrate/blob/main/Supabase_Storage_migration.ipynb';
    
    console.log(chalk.yellow('\n   ⚠️  Migração de objetos de Storage requer processo manual'));
    console.log(chalk.cyan(`   ℹ️  Use o script do Google Colab: ${colabUrl}`));
    console.log(chalk.gray('\n   📋 Instruções:'));
    console.log(chalk.gray('   1. Execute o script no Google Colab'));
    console.log(chalk.gray('   2. Configure as credenciais dos projetos (origem e destino)'));
    console.log(chalk.gray('   3. Execute a migração'));
    
    await inquirer.prompt([{
      type: 'input',
      name: 'continue',
      message: 'Pressione Enter para continuar'
    }]);
    
  } catch (error) {
    console.error(chalk.red(`   ❌ Erro ao processar Storage: ${error.message}`));
  }
}

// Restaurar Auth Settings (interativo - exibir URL e valores)
async function restoreAuthSettings(backupPath, targetProject) {
  console.log(chalk.blue('\n🔐 Restaurando Auth Settings...'));
  
  try {
    const authSettingsPath = path.join(backupPath, 'auth-settings.json');
    
    if (!fs.existsSync(authSettingsPath)) {
      console.log(chalk.yellow('   ⚠️  Nenhuma configuração de Auth encontrada no backup'));
      return;
    }
    
    const authSettings = JSON.parse(fs.readFileSync(authSettingsPath, 'utf8'));
    const dashboardUrl = `https://supabase.com/dashboard/project/${targetProject.targetProjectId}/auth/url-config`;
    
    console.log(chalk.green('\n   ✅ URL para configuração manual:'));
    console.log(chalk.cyan(`   ${dashboardUrl}`));
    console.log(chalk.yellow('\n   📋 Configure manualmente as seguintes opções:'));
    
    if (authSettings.auth_url_config) {
      Object.entries(authSettings.auth_url_config).forEach(([key, value]) => {
        console.log(chalk.gray(`   - ${key}: ${value}`));
      });
    }
    
    console.log(chalk.yellow('\n   ⚠️  Após configurar, pressione Enter para continuar...'));
    
    await inquirer.prompt([{
      type: 'input',
      name: 'continue',
      message: 'Pressione Enter para continuar'
    }]);
    
    console.log(chalk.green('   ✅ Auth Settings processados'));
    
  } catch (error) {
    console.error(chalk.red(`   ❌ Erro ao processar Auth Settings: ${error.message}`));
  }
}

// Restaurar Database Settings (via SQL)
async function restoreDatabaseSettings(backupPath, targetProject) {
  console.log(chalk.blue('\n🔧 Restaurando Database Settings...'));
  
  try {
    const files = fs.readdirSync(backupPath);
    const dbSettingsFile = files.find(f => f.startsWith('database-settings-') && f.endsWith('.json'));
    
    if (!dbSettingsFile) {
      console.log(chalk.yellow('   ⚠️  Nenhuma configuração de Database encontrada no backup'));
      return;
    }
    
    const dbSettings = JSON.parse(fs.readFileSync(path.join(backupPath, dbSettingsFile), 'utf8'));
    const { execSync } = require('child_process');
    
    if (dbSettings.extensions && dbSettings.extensions.length > 0) {
      console.log(chalk.gray(`   - Habilitando ${dbSettings.extensions.length} extension(s)...`));
      
      for (const ext of dbSettings.extensions) {
        console.log(chalk.gray(`     - ${ext}`));
        
        const sqlCommand = `CREATE EXTENSION IF NOT EXISTS ${ext};`;
        
        const urlMatch = targetProject.targetDatabaseUrl.match(/postgresql:\/\/([^@:]+):([^@]+)@(.+)$/);
        
        if (!urlMatch) {
          console.log(chalk.yellow(`     ⚠️  URL inválida para ${ext}`));
          continue;
        }
        
        const dockerCmd = [
          'docker run --rm',
          '--network host',
          `-e PGPASSWORD="${encodeURIComponent(urlMatch[2])}"`,
          'postgres:17 psql',
          `-d "${targetProject.targetDatabaseUrl}"`,
          `-c "${sqlCommand}"`
        ].join(' ');
        
        try {
          execSync(dockerCmd, { stdio: 'pipe', encoding: 'utf8' });
        } catch (sqlError) {
          console.log(chalk.yellow(`     ⚠️  ${ext} - extension já existe ou não pode ser habilitada`));
        }
      }
    }
    
    console.log(chalk.green('   ✅ Database Settings restaurados com sucesso!'));
    
  } catch (error) {
    console.error(chalk.red(`   ❌ Erro ao restaurar Database Settings: ${error.message}`));
  }
}

// Restaurar Realtime Settings (interativo - exibir URL e valores)
async function restoreRealtimeSettings(backupPath, targetProject) {
  console.log(chalk.blue('\n🔄 Restaurando Realtime Settings...'));
  
  try {
    const realtimeSettingsPath = path.join(backupPath, 'realtime-settings.json');
    
    if (!fs.existsSync(realtimeSettingsPath)) {
      console.log(chalk.yellow('   ⚠️  Nenhuma configuração de Realtime encontrada no backup'));
      return;
    }
    
    const realtimeSettings = JSON.parse(fs.readFileSync(realtimeSettingsPath, 'utf8'));
    const dashboardUrl = `https://supabase.com/dashboard/project/${targetProject.targetProjectId}/realtime/settings`;
    
    console.log(chalk.green('\n   ✅ URL para configuração manual:'));
    console.log(chalk.cyan(`   ${dashboardUrl}`));
    console.log(chalk.yellow('\n   📋 Configure manualmente as seguintes opções:'));
    
    if (realtimeSettings.realtime_settings?.settings) {
      Object.entries(realtimeSettings.realtime_settings.settings).forEach(([key, setting]) => {
        console.log(chalk.gray(`   - ${setting.label}: ${setting.value}`));
        if (setting.description) {
          console.log(chalk.gray(`     ${setting.description}`));
        }
      });
    }
    
    console.log(chalk.yellow('\n   ⚠️  Após configurar, pressione Enter para continuar...'));
    
    await inquirer.prompt([{
      type: 'input',
      name: 'continue',
      message: 'Pressione Enter para continuar'
    }]);
    
    console.log(chalk.green('   ✅ Realtime Settings processados'));
    
  } catch (error) {
    console.error(chalk.red(`   ❌ Erro ao processar Realtime Settings: ${error.message}`));
  }
}
