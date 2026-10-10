const fs = require('fs');
const path = require('path');
const { t } = require('../../i18n');
const { buildRestore, readDump } = require('./dump');
const { storagePlan } = require('./steps/06-storage');
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
    for (const [name, step] of Object.entries(implementations)) {
      if (!components[name]) continue;
      current = name;
      report.results[name] = { success: false, status: 'running' };
      save();
      const labels = {
        database: 'restoringDatabase', edgeFunctions: 'restoringEdgeFunctions',
        authSettings: 'restoringAuthSettings', storage: 'restoringStorageBuckets',
        databaseSettings: 'restoringDatabaseSettings', realtimeSettings: 'restoringRealtimeSettings',
      };
      console.log((global.smoonbI18n?.t || t)(`restore.index.${labels[name]}`));
      const result = await step(context);
      if (!result?.success || !result?.verified)
        throw new Error(`Component ${name} did not pass verification`);
      report.results[name] = { ...result, status: 'verified' };
      save();
    }
    report.status = 'verified';
    report.completed_at = new Date().toISOString();
    save();
    return report.results;
  } catch (error) {
    report.status = 'failed';
    report.failed_component = current;
    report.results[current] = { success: false, status: 'failed' };
    report.completed_at = new Date().toISOString();
    save();
    throw error;
  }
}
module.exports = { runRestore };
