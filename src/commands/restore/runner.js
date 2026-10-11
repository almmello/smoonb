const fs = require('fs');
const path = require('path');
const { t } = require('../../i18n');
const { buildRestore, readDump } = require('./dump');
const { storagePlan } = require('./steps/06-storage');
const { prepareAuth } = require('./auth');
const {
  RealtimeRestoreError,
  capacityLimits,
} = require('./steps/08-realtime-settings');
const steps = {
  database: require('./steps/03-database'),
  edgeFunctions: require('./steps/04-edge-functions'),
  authSettings: require('./steps/05-auth-settings'),
  storage: require('./steps/06-storage'),
  databaseSettings: require('./steps/07-database-settings'),
  realtimeSettings: require('./steps/08-realtime-settings'),
};
async function runRestore(
  {
    selectedBackup,
    components,
    targetProject,
    processDir,
    postgresMajor,
    remapUrls = true,
  },
  implementations = steps,
  { prepareAuthConfig = prepareAuth } = {},
) {
  if (selectedBackup.projectId === targetProject.targetProjectId)
    throw new Error('Restore requires a different, empty destination project');
  const context = {
    backupPath: selectedBackup.path,
    backupFilePath: path.join(selectedBackup.path, selectedBackup.backupFile),
    targetProject,
    targetDatabaseUrl: targetProject.targetDatabaseUrl,
    sourceProjectId: selectedBackup.projectId,
    targetProjectId: targetProject.targetProjectId,
    postgresMajor,
    remapUrls,
  };
  const report = {
    process: 'restore',
    smoonb_version: require('../../../package.json').version,
    created_at: new Date().toISOString(),
    source_project_id: selectedBackup.projectId,
    target_project_id: targetProject.targetProjectId,
    status: 'running',
    components,
    results: {},
    remap_service_urls: remapUrls,
    notes: [
      'Local source files and backup archives are preserved.',
      'Verification covers selected components; application login and workflows require acceptance testing.',
    ],
  };
  const save = () =>
    fs.writeFileSync(
      path.join(processDir, 'report.json'),
      JSON.stringify(report, null, 2),
    );
  save();
  let current = 'preflight';
  try {
    if (targetProject.targetDatabaseUrl) {
      const url = new URL(targetProject.targetDatabaseUrl);
      const hosted =
        url.hostname.endsWith('.supabase.co') ||
        url.hostname.endsWith('.supabase.com');
      if (
        hosted &&
        url.hostname !== `db.${targetProject.targetProjectId}.supabase.co` &&
        !decodeURIComponent(url.username).endsWith(
          `.${targetProject.targetProjectId}`,
        )
      )
        throw new Error(
          'Database connection does not match the destination project',
        );
    }
    if (
      targetProject.targetUrl &&
      new URL(targetProject.targetUrl).hostname !==
        `${targetProject.targetProjectId}.supabase.co`
    )
      throw new Error('API URL does not match the destination project');
    // Parse and validate inventories before the first mutation.
    if (components.database)
      buildRestore(readDump(context.backupFilePath), context);
    if (components.storage)
      storagePlan(context.backupPath, context.backupFilePath);
    // Resolve write-only credentials before restoring the database or any service.
    if (components.authSettings)
      context.authConfig = await prepareAuthConfig(context);
    for (const [name, step] of Object.entries(implementations)) {
      if (!components[name]) continue;
      current = name;
      report.results[name] = { success: false, status: 'running' };
      save();
      const labels = {
        database: 'restoringDatabase',
        edgeFunctions: 'restoringEdgeFunctions',
        authSettings: 'restoringAuthSettings',
        storage: 'restoringStorageBuckets',
        databaseSettings: 'restoringDatabaseSettings',
        realtimeSettings: 'restoringRealtimeSettings',
      };
      console.log((global.smoonbI18n?.t || t)(`restore.index.${labels[name]}`));
      const result = await step(context);
      const acceptedSmtp =
        name === 'authSettings' &&
        result?.configuration_readback_verified === true &&
        result?.email_delivery_verified === false &&
        result?.write_only_fields_accepted?.length === 1 &&
        result.write_only_fields_accepted[0] === 'smtp_pass';
      const acceptedLimits =
        name === 'realtimeSettings' &&
        result?.effective_configuration_verified === true &&
        result?.destination_limits_accepted === true &&
        Array.isArray(result?.accepted_differences) &&
        result.accepted_differences.length > 0 &&
        result.accepted_differences.every(
          (d) =>
            capacityLimits.has(d.field) &&
            Number.isInteger(d.backup_value) &&
            d.backup_value > 0 &&
            Number.isInteger(d.destination_value) &&
            d.destination_value > 0,
        );
      if (
        !result?.success ||
        (!result?.verified && !acceptedSmtp && !acceptedLimits)
      )
        throw new Error(`Component ${name} did not pass verification`);
      report.results[name] = {
        ...result,
        status: result.verified
          ? 'verified'
          : acceptedLimits
            ? 'completed_with_accepted_differences'
            : 'applied_with_unverified_secrets',
      };
      save();
      if (acceptedSmtp)
        console.log((global.smoonbI18n?.t || t)('restore.smtp.accepted'));
    }
    const results = Object.values(report.results);
    report.status = results.some(
      (r) => r.status === 'completed_with_accepted_differences',
    )
      ? 'completed_with_accepted_differences'
      : results.every((r) => r.verified)
        ? 'verified'
        : 'applied_with_unverified_secrets';
    report.completed_at = new Date().toISOString();
    save();
    return report.results;
  } catch (error) {
    report.status = 'failed';
    report.failed_component = current;
    report.results[current] = { success: false, status: 'failed' };
    if (current === 'realtimeSettings' && error instanceof RealtimeRestoreError)
      report.results[current].unapplied_limits = error.differences;
    report.completed_at = new Date().toISOString();
    save();
    throw error;
  }
}
module.exports = { runRestore };
