const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const { runSupabase } = require('../../../utils/supabaseCli');
const { management } = require('../../restore/management');
const { copyDirectoryRecursive } = require('../../restore/utils');
module.exports = async ({ projectId, accessToken, backupDir }) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), 'smoonb-functions-backup-'),
  );
  try {
    const functions = await management(
      { targetProjectId: projectId, targetAccessToken: accessToken },
      'functions',
    );
    await fs.mkdir(path.join(root, 'supabase'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'supabase', 'config.toml'),
      'project_id = "smoonb-backup"\n',
    );
    const downloaded = [];
    for (const f of functions) {
      const name = f.slug || f.name;
      if (!/^[-a-zA-Z0-9_]+$/.test(name))
        throw new Error('Invalid function slug');
      runSupabase(
        'supabase',
        [
          'functions',
          'download',
          name,
          '--project-ref',
          projectId,
          '--workdir',
          root,
        ],
        {
          cwd: root,
          env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken },
          stdio: 'pipe',
          timeout: 180000,
          windowsHide: true,
        },
      );
      const destination = path.join(backupDir, 'edge-functions', name);
      await copyDirectoryRecursive(
        path.join(root, 'supabase', 'functions', name),
        destination,
      );
      downloaded.push({
        name,
        slug: name,
        version: f.version,
        verify_jwt: f.verify_jwt,
        files: await fs.readdir(destination),
      });
    }
    return {
      success: true,
      reason: 'success',
      functions: downloaded,
      functions_count: downloaded.length,
      success_count: downloaded.length,
      error_count: 0,
      method: 'cli-isolated',
    };
  } catch {
    return {
      success: false,
      reason: 'function_download_failed',
      functions: [],
    };
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
};
