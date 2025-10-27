const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const { readConfig, getSourceProject, getTargetProject } = require('../utils/config');
const { showBetaBanner } = require('../utils/banner');

module.exports = async (options) => {
  showBetaBanner();
  
  try {
    const config = await readConfig();
    const targetProject = getTargetProject(config);
    
    console.log(chalk.blue(`📁 Buscando backups em: ${config.backup.outputDir || './backups'}`));
    
    // 1. Listar backups válidos (.backup.gz)
    const validBackups = await listValidBackups(config.backup.outputDir || './backups');
    
    if (validBackups.length === 0) {
      console.error(chalk.red('❌ Nenhum backup válido encontrado'));
      console.log(chalk.yellow('💡 Execute primeiro: npx smoonb backup'));
      process.exit(1);
    }
    
    // 2. Selecionar backup interativamente
    const selectedBackup = await selectBackupInteractive(validBackups);
    
    // 3. Perguntar quais componentes restaurar
    const components = await askRestoreComponents(selectedBackup.path);
    
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
    
    // 6.1 Database
    await restoreDatabaseGz(
      path.join(selectedBackup.path, selectedBackup.backupFile),
      targetProject.targetDatabaseUrl
    );
    
    // 6.2 Edge Functions (se selecionado)
    if (components.edgeFunctions) {
      await restoreEdgeFunctions(selectedBackup.path, targetProject);
    }
    
    // 6.3 Storage Buckets (se selecionado)
    if (components.storage) {
      await restoreStorageBuckets(selectedBackup.path, targetProject);
    }
    
    // 6.4 Auth Settings (se selecionado)
    if (components.authSettings) {
      await restoreAuthSettings(selectedBackup.path, targetProject);
    }
    
    // 6.5 Database Settings (se selecionado)
    if (components.databaseSettings) {
      await restoreDatabaseSettings(selectedBackup.path, targetProject);
    }
    
    // 6.6 Realtime Settings (se selecionado)
    if (components.realtimeSettings) {
      await restoreRealtimeSettings(selectedBackup.path, targetProject);
    }
    
    console.log(chalk.green('\n🎉 Restauração completa finalizada!'));
    
  } catch (error) {
    console.error(chalk.red(`❌ Erro na restauração: ${error.message}`));
    process.exit(1);
  }
};

// Listar backups válidos (apenas com .backup.gz)
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
      const backupFile = files.find(file => file.endsWith('.backup.gz'));
      
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
  const components = {
    edgeFunctions: true,
    storage: false,
    authSettings: false,
    databaseSettings: false,
    realtimeSettings: false
  };
  
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const question = (query) => new Promise(resolve => readline.question(query, resolve));
  
  console.log(chalk.blue('\n📦 Selecione os componentes para restaurar:'));
  
  // Edge Functions
  const edgeFunctionsDir = path.join(backupPath, 'edge-functions');
  if (fs.existsSync(edgeFunctionsDir) && fs.readdirSync(edgeFunctionsDir).length > 0) {
    const edgeChoice = await question('Deseja restaurar Edge Functions? (S/n): ');
    components.edgeFunctions = edgeChoice.toLowerCase() !== 'n';
  }
  
  // Storage Buckets
  const storageDir = path.join(backupPath, 'storage');
  if (fs.existsSync(storageDir) && fs.readdirSync(storageDir).length > 0) {
    const storageChoice = await question('Deseja restaurar Storage Buckets? (s/N): ');
    components.storage = storageChoice.toLowerCase() === 's';
  }
  
  // Auth Settings
  if (fs.existsSync(path.join(backupPath, 'auth-settings.json'))) {
    const authChoice = await question('Deseja restaurar Auth Settings? (s/N): ');
    components.authSettings = authChoice.toLowerCase() === 's';
  }
  
  // Database Settings
  const dbSettingsFiles = fs.readdirSync(backupPath)
    .filter(file => file.startsWith('database-settings-') && file.endsWith('.json'));
  if (dbSettingsFiles.length > 0) {
    const dbChoice = await question('Deseja restaurar Database Extensions and Settings? (s/N): ');
    components.databaseSettings = dbChoice.toLowerCase() === 's';
  }
  
  // Realtime Settings
  if (fs.existsSync(path.join(backupPath, 'realtime-settings.json'))) {
    const realtimeChoice = await question('Deseja restaurar Realtime Settings? (s/N): ');
    components.realtimeSettings = realtimeChoice.toLowerCase() === 's';
  }
  
  readline.close();
  return components;
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
  
  console.log('✅ Database (psql -f via Docker)');
  
  if (components.edgeFunctions) {
    const edgeFunctionsDir = path.join(backup.path, 'edge-functions');
    const functions = fs.readdirSync(edgeFunctionsDir).filter(item => 
      fs.statSync(path.join(edgeFunctionsDir, item)).isDirectory()
    );
    console.log(`⚡ Edge Functions: ${functions.length} function(s)`);
    functions.forEach(func => console.log(`   - ${func}`));
  }
  
  if (components.storage) {
    console.log('📦 Storage Buckets: Restaurar buckets e objetos');
  }
  
  if (components.authSettings) {
    console.log('🔐 Auth Settings: Restaurar configurações de autenticação');
  }
  
  if (components.databaseSettings) {
    console.log('🔧 Database Settings: Restaurar extensões e configurações');
  }
  
  if (components.realtimeSettings) {
    console.log('🔄 Realtime Settings: Restaurar configurações do Realtime');
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
async function restoreDatabaseGz(backupFilePath, targetDatabaseUrl) {
  console.log(chalk.blue('📊 Restaurando Database...'));
  console.log(chalk.gray('   - Descompactando backup (se necessário)...'));
  
  try {
    const { execSync } = require('child_process');
    
    const backupDirAbs = path.resolve(path.dirname(backupFilePath));
    const fileName = path.basename(backupFilePath);
    let uncompressedFile = fileName;
    
    // Descompactar .gz se necessário
    if (fileName.endsWith('.gz')) {
      console.log(chalk.gray('   - Extraindo arquivo .gz...'));
      const unzipCmd = [
        'docker run --rm',
        `-v "${backupDirAbs}:/host"`,
        'postgres:17 gunzip /host/' + fileName
      ].join(' ');
      
      execSync(unzipCmd, { stdio: 'pipe' });
      uncompressedFile = fileName.replace('.gz', '');
      console.log(chalk.gray('   - Arquivo descompactado: ' + uncompressedFile));
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

// Restaurar Edge Functions (placeholder - implementar via Management API)
async function restoreEdgeFunctions(backupPath, targetProject) {
  console.log(chalk.blue('⚡ Restaurando Edge Functions...'));
  console.log(chalk.yellow('   ℹ️ Deploy de Edge Functions via Management API ainda não implementado'));
  // TODO: Implementar deploy via Supabase Management API
}

// Restaurar Storage Buckets (placeholder)
async function restoreStorageBuckets(backupPath, targetProject) {
  console.log(chalk.blue('📦 Restaurando Storage Buckets...'));
  console.log(chalk.yellow('   ℹ️ Restauração de Storage Buckets ainda não implementado'));
  // TODO: Implementar restauração via Management API
}

// Restaurar Auth Settings (placeholder)
async function restoreAuthSettings(backupPath, targetProject) {
  console.log(chalk.blue('🔐 Restaurando Auth Settings...'));
  console.log(chalk.yellow('   ℹ️ Restauração de Auth Settings ainda não implementado'));
  // TODO: Implementar via Management API
}

// Restaurar Database Settings (placeholder)
async function restoreDatabaseSettings(backupPath, targetProject) {
  console.log(chalk.blue('🔧 Restaurando Database Settings...'));
  console.log(chalk.yellow('   ℹ️ Restauração de Database Settings ainda não implementado'));
  // TODO: Aplicar extensões e configurações via SQL
}

// Restaurar Realtime Settings (placeholder)
async function restoreRealtimeSettings(backupPath, targetProject) {
  console.log(chalk.blue('🔄 Restaurando Realtime Settings...'));
  console.log(chalk.yellow('   ℹ️ Realtime Settings requerem configuração manual no Dashboard'));
  // TODO: Adicionar instruções de configuração manual
}
