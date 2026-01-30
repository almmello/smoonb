const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const { t } = require('../../../i18n');

function runWithElapsedTicker(command, args, env, label) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const ticker = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      process.stdout.write(`\r     ⏱ ${label} ${elapsed}s`);
    }, 1000);
    const proc = spawn(command, args, {
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
 * Etapa 2: Backup Database Separado (SQL files para troubleshooting)
 */
module.exports = async ({ databaseUrl, backupDir, accessToken }) => {
  try {
    const getT = global.smoonbI18n?.t || t;
    console.log(chalk.white(`   - ${getT('backup.steps.database.separated.creating')}`));
    
    const dbUrl = databaseUrl;
    const files = [];
    let totalSizeKB = 0;
    
    // 1. Backup do Schema
    console.log(chalk.white(`   - ${getT('backup.steps.database.separated.exportingSchema')}`));
    const schemaFile = path.join(backupDir, 'schema.sql');
    
    try {
      await runWithElapsedTicker(
        `supabase db dump --db-url "${dbUrl}" -f "${schemaFile}"`,
        [],
        { SUPABASE_ACCESS_TOKEN: accessToken || '' },
        getT('backup.steps.database.separated.exportingSchema')
      );
      const stats = await fs.stat(schemaFile);
      const sizeKB = (stats.size / 1024).toFixed(1);
      files.push({ filename: 'schema.sql', sizeKB });
      totalSizeKB += parseFloat(sizeKB);
      console.log(chalk.green(`     ✅ Schema: ${sizeKB} KB`));
    } catch (error) {
      console.log(chalk.yellow(`     ⚠️ ${getT('backup.steps.database.separated.schemaError', { message: error.message })}`));
    }
    
    // 2. Backup dos Dados
    console.log(chalk.white(`   - ${getT('backup.steps.database.separated.exportingData')}`));
    const dataFile = path.join(backupDir, 'data.sql');
    
    try {
      await runWithElapsedTicker(
        `supabase db dump --db-url "${dbUrl}" --data-only -f "${dataFile}"`,
        [],
        { SUPABASE_ACCESS_TOKEN: accessToken || '' },
        getT('backup.steps.database.separated.exportingData')
      );
      const stats = await fs.stat(dataFile);
      const sizeKB = (stats.size / 1024).toFixed(1);
      files.push({ filename: 'data.sql', sizeKB });
      totalSizeKB += parseFloat(sizeKB);
      console.log(chalk.green(`     ✅ Data: ${sizeKB} KB`));
    } catch (error) {
      console.log(chalk.yellow(`     ⚠️ ${getT('backup.steps.database.separated.dataError', { message: error.message })}`));
    }
    
    // 3. Backup dos Roles
    console.log(chalk.white(`   - ${getT('backup.steps.database.separated.exportingRoles')}`));
    const rolesFile = path.join(backupDir, 'roles.sql');
    
    try {
      await runWithElapsedTicker(
        `supabase db dump --db-url "${dbUrl}" --role-only -f "${rolesFile}"`,
        [],
        { SUPABASE_ACCESS_TOKEN: accessToken || '' },
        getT('backup.steps.database.separated.exportingRoles')
      );
      const stats = await fs.stat(rolesFile);
      const sizeKB = (stats.size / 1024).toFixed(1);
      files.push({ filename: 'roles.sql', sizeKB });
      totalSizeKB += parseFloat(sizeKB);
      console.log(chalk.green(`     ✅ Roles: ${sizeKB} KB`));
    } catch (error) {
      console.log(chalk.yellow(`     ⚠️ ${getT('backup.steps.database.separated.rolesError', { message: error.message })}`));
    }
    
    return { 
      success: files.length > 0, 
      files, 
      totalSizeKB: totalSizeKB.toFixed(1) 
    };
    
  } catch (error) {
    const getT = global.smoonbI18n?.t || t;
    console.log(chalk.yellow(`     ⚠️ ${getT('backup.steps.database.separated.error', { message: error.message })}`));
    return { success: false, files: [], totalSizeKB: '0.0' };
  }
};

