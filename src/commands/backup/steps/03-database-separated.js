const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const { t } = require('../../../i18n');
const { createPgDumpDiagnostics, hasReplicaRolePrologue } = require('../../../utils/pg-dump-diagnostics');

const { isolatedSupabase } = require('../../../utils/supabaseCli');
async function runWithElapsedTicker(_command, args, env) {
  const result = await isolatedSupabase(args, env, { capture: true });
  let stderr = String(result.stderr || '');
  const secrets = Object.values(env || {}).filter(Boolean);
  const databaseUrl = args[args.indexOf('--db-url') + 1];
  if (databaseUrl) {
    secrets.push(databaseUrl);
    try { secrets.push(decodeURIComponent(new URL(databaseUrl).password)); } catch { /* invalid URLs are handled by the CLI */ }
  }
  for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) stderr = stderr.split(secret).join('[redacted]');
  stderr = stderr.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[database URL redacted]');
  const diagnostics = createPgDumpDiagnostics(chunk => process.stderr.write(chunk));
  diagnostics.write(stderr);
  return diagnostics.end();
}

/**
 * Etapa 2: Backup Database Separado (SQL files para troubleshooting)
 */
function createDatabaseSeparatedStep(runDump = runWithElapsedTicker) {
  return async ({ databaseUrl, backupDir, accessToken }) => {
    try {
      const getT = global.smoonbI18n?.t || t;
      console.log(chalk.white(`   - ${getT('backup.steps.database.separated.creating')}`));

      const dbUrl = databaseUrl;
      const files = [];
      let totalSizeKB = 0;
      const warnings = [];
      const failedFiles = [];

      // 1. Backup do Schema
      console.log(chalk.white(`   - ${getT('backup.steps.database.separated.exportingSchema')}`));
      const schemaFile = path.join(backupDir, 'schema.sql');

      try {
        await runDump(
          'supabase',
          ['db', 'dump', '--db-url', dbUrl, '-f', path.resolve(schemaFile)],
          { SUPABASE_ACCESS_TOKEN: accessToken || '' },
          getT('backup.steps.database.separated.exportingSchema')
        );
        const stats = await fs.stat(schemaFile);
        const sizeKB = (stats.size / 1024).toFixed(1);
        files.push({ filename: 'schema.sql', sizeKB });
        totalSizeKB += parseFloat(sizeKB);
        console.log(chalk.green(`     ✅ Schema: ${sizeKB} KB`));
      } catch (error) {
        failedFiles.push('schema.sql');
        console.log(chalk.yellow(`     ⚠️ ${getT('backup.steps.database.separated.schemaError', { message: error.message })}`));
      }

      // 2. Backup dos Dados
      console.log(chalk.white(`   - ${getT('backup.steps.database.separated.exportingData')}`));
      const dataFile = path.join(backupDir, 'data.sql');

      try {
        const diagnostics = await runDump(
          'supabase',
          ['db', 'dump', '--db-url', dbUrl, '--data-only', '-f', path.resolve(dataFile)],
          { SUPABASE_ACCESS_TOKEN: accessToken || '' },
          getT('backup.steps.database.separated.exportingData'),
          true
        );
        const stats = await fs.stat(dataFile);
        if (diagnostics.circularForeignKeys) {
          const replicaRolePrologue = await hasReplicaRolePrologue(dataFile);
          warnings.push({ code: 'CIRCULAR_FOREIGN_KEYS', ...diagnostics, replicaRolePrologue });
          console.log(chalk.cyan(`     ℹ️ ${getT('backup.steps.database.separated.circularSummary', { tables: diagnostics.tables.join(', ') })}`));
          console.log(chalk.yellow(`     ⚠️ ${getT(replicaRolePrologue
            ? 'backup.steps.database.separated.circularProtected'
            : 'backup.steps.database.separated.circularUnprotected')}`));
        }
        const sizeKB = (stats.size / 1024).toFixed(1);
        files.push({ filename: 'data.sql', sizeKB });
        totalSizeKB += parseFloat(sizeKB);
        console.log(chalk.green(`     ✅ Data: ${sizeKB} KB`));
      } catch (error) {
        failedFiles.push('data.sql');
        console.log(chalk.yellow(`     ⚠️ ${getT('backup.steps.database.separated.dataError', { message: error.message })}`));
      }

      // 3. Backup dos Roles
      console.log(chalk.white(`   - ${getT('backup.steps.database.separated.exportingRoles')}`));
      const rolesFile = path.join(backupDir, 'roles.sql');

      try {
        await runDump(
          'supabase',
          ['db', 'dump', '--db-url', dbUrl, '--role-only', '-f', path.resolve(rolesFile)],
          { SUPABASE_ACCESS_TOKEN: accessToken || '' },
          getT('backup.steps.database.separated.exportingRoles')
        );
        const stats = await fs.stat(rolesFile);
        const sizeKB = (stats.size / 1024).toFixed(1);
        files.push({ filename: 'roles.sql', sizeKB });
        totalSizeKB += parseFloat(sizeKB);
        console.log(chalk.green(`     ✅ Roles: ${sizeKB} KB`));
      } catch (error) {
        failedFiles.push('roles.sql');
        console.log(chalk.yellow(`     ⚠️ ${getT('backup.steps.database.separated.rolesError', { message: error.message })}`));
      }

      return {
        success: files.length === 3,
        warnings,
        failedFiles,
        files,
        totalSizeKB: totalSizeKB.toFixed(1)
      };

    } catch (error) {
      const getT = global.smoonbI18n?.t || t;
      console.log(chalk.yellow(`     ⚠️ ${getT('backup.steps.database.separated.error', { message: error.message })}`));
      return { success: false, files: [], warnings: [], failedFiles: ['schema.sql', 'data.sql', 'roles.sql'], totalSizeKB: '0.0' };
    }
  };
}

module.exports = createDatabaseSeparatedStep();
module.exports.createDatabaseSeparatedStep = createDatabaseSeparatedStep;
module.exports.runWithElapsedTicker = runWithElapsedTicker;
