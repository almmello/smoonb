const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const { t } = require('../../i18n');

/**
 * Listar backups válidos (aceita .backup.gz e .backup)
 */
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
          } catch {
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

/**
 * Formatar bytes
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Mostrar resumo da restauração
 */
function showRestoreSummary(backup, components, targetProject) {
  const getT = global.smoonbI18n?.t || t;
  console.log(chalk.blue(`\n📋 ${getT('restore.utils.summaryTitle')}`));
  console.log(chalk.blue(getT('restore.utils.summarySeparator')));
  console.log(chalk.cyan(`📦 ${getT('restore.utils.backup', { name: backup.name })}`));
  console.log(chalk.cyan(`📤 ${getT('restore.utils.sourceProject', { projectId: backup.projectId })}`));
  console.log(chalk.cyan(`📥 ${getT('restore.utils.targetProject', { projectId: targetProject.targetProjectId })}`));
  console.log('');
  console.log(chalk.cyan(getT('restore.utils.componentsTitle')));
  console.log('');
  
  if (components.database) {
    console.log(`✅ ${getT('restore.utils.database')}`);
  }
  
  if (components.edgeFunctions) {
    const edgeFunctionsDir = path.join(backup.path, 'edge-functions');
    const functions = fs.readdirSync(edgeFunctionsDir).filter(item => 
      fs.statSync(path.join(edgeFunctionsDir, item)).isDirectory()
    );
    console.log(`⚡ ${getT('restore.utils.edgeFunctions', { count: functions.length })}`);
    functions.forEach(func => console.log(`   - ${func}`));
  }
  
  if (components.authSettings) {
    console.log(`🔐 ${getT('restore.utils.authSettings')}`);
  }
  
  if (components.storage) {
    const backupPath = backup.path;
    const storageZipFiles = fs.readdirSync(backupPath).filter(f => f.endsWith('.storage.zip'));
    if (storageZipFiles.length > 0) {
      console.log(`📦 ${getT('restore.utils.storageBuckets')}`);
    } else {
      console.log(`📦 ${getT('restore.utils.storageMetadataOnly')}`);
    }
  }
  
  if (components.databaseSettings) {
    console.log(`🔧 ${getT('restore.utils.databaseSettings')}`);
  }
  
  if (components.realtimeSettings) {
    console.log(`🔄 ${getT('restore.utils.realtimeSettings')}`);
  }
  
  console.log('');
}

/**
 * Função auxiliar para copiar diretório recursivamente
 */
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

module.exports = {
  listValidBackups,
  formatBytes,
  showRestoreSummary,
  copyDirectoryRecursive
};

