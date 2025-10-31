const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const { captureRealtimeSettings } = require('../../../utils/realtime-settings');

/**
 * Etapa 5: Backup Realtime Settings via Captura Interativa
 */
module.exports = async ({ projectId, backupDir, options }) => {
  try {
    console.log(chalk.white('   - Capturando Realtime Settings interativamente...'));
    
    const result = await captureRealtimeSettings(projectId, backupDir, options?.skipRealtime);
    
    const stats = await fs.stat(path.join(backupDir, 'realtime-settings.json'));
    const sizeKB = (stats.size / 1024).toFixed(1);
    
    console.log(chalk.green(`     ✅ Realtime Settings capturadas: ${sizeKB} KB`));
    
    return { success: true, settings: result };
  } catch (error) {
    console.log(chalk.yellow(`     ⚠️ Erro ao capturar Realtime Settings: ${error.message}`));
    return { success: false };
  }
};

