const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const { t } = require('../../../i18n');

function runWithElapsedTicker(command, env, label) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const ticker = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      process.stdout.write(`\r     ⏱ ${label} ${elapsed}s`);
    }, 1000);
    const proc = spawn(command, [], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env: { ...process.env, ...env }
    });
    proc.stderr.on('data', (chunk) => process.stderr.write(chunk));
    proc.on('close', (code) => {
      clearInterval(ticker);
      process.stdout.write('\r' + ' '.repeat(60) + '\r');
      if (code !== 0) reject(new Error(`Exited with code ${code}`));
      else resolve();
    });
    proc.on('error', reject);
  });
}

/**
 * Etapa 7: Backup Custom Roles via SQL
 */
module.exports = async ({ databaseUrl, backupDir, accessToken }) => {
  try {
    const getT = global.smoonbI18n?.t || t;
    console.log(chalk.white(`   - ${getT('backup.steps.roles.exporting')}`));
    
    const customRolesFile = path.join(backupDir, 'custom-roles.sql');
    const cmd = `supabase db dump --db-url "${databaseUrl}" --role-only -f "${customRolesFile}"`;
    
    try {
      await runWithElapsedTicker(cmd, { SUPABASE_ACCESS_TOKEN: accessToken || '' }, getT('backup.steps.roles.exporting'));
      
      const stats = await fs.stat(customRolesFile);
      const sizeKB = (stats.size / 1024).toFixed(1);
      
      console.log(chalk.green(`     ✅ Custom Roles exportados via Docker: ${sizeKB} KB`));
      
      return { success: true, roles: [{ filename: 'custom-roles.sql', sizeKB }] };
    } catch (error) {
      console.log(chalk.yellow(`     ⚠️ ${getT('backup.steps.roles.exportError', { message: error.message })}`));
      return { success: false, roles: [] };
    }
  } catch (error) {
    const getT = global.smoonbI18n?.t || t;
    console.log(chalk.yellow(`     ⚠️ ${getT('backup.steps.roles.error', { message: error.message })}`));
    return { success: false, roles: [] };
  }
};

