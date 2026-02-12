const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const { captureRealtimeSettings } = require('../../../utils/realtime-settings');
const { t } = require('../../../i18n');

/**
 * Etapa 5: Backup Realtime Settings via Captura Interativa
 */
module.exports = async ({ projectId, backupDir, options }) => {
  try {
    const getT = global.smoonbI18n?.t || t;
    console.log(chalk.white(`   - ${getT('backup.steps.realtime.capturing')}`));
    
    const result = await captureRealtimeSettings(projectId, backupDir, options?.skipRealtime);

    const settings = result.settings !== undefined ? result.settings : result;
    const source = result.source || 'interactive';
    const reusedFrom = result.reusedFrom || null;

    const stats = await fs.stat(path.join(backupDir, 'realtime-settings.json'));
    const sizeKB = (stats.size / 1024).toFixed(1);

    console.log(chalk.green(`     ✅ Realtime Settings capturadas: ${sizeKB} KB`));

    return { success: true, settings, source, reusedFrom };
  } catch (error) {
    const getT = global.smoonbI18n?.t || t;
    console.log(chalk.yellow(`     ⚠️ ${getT('backup.steps.realtime.error', { message: error.message })}`));
    return { success: false };
  }
};

