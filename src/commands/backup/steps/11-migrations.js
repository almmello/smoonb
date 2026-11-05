const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { runSupabase } = require('../../../utils/supabaseCli');
const { copyDirectoryRecursive } = require('../../restore/utils');
module.exports = async ({ databaseUrl, accessToken, backupDir }) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smoonb-migrations-'));
  try {
    await fs.mkdir(path.join(root, 'supabase', 'migrations'), { recursive: true });
    await fs.writeFile(path.join(root, 'supabase', 'config.toml'), 'project_id = "smoonb-backup"\n');
    runSupabase('supabase', ['migration', 'fetch', '--db-url', databaseUrl, '--workdir', root, '--yes'], { cwd: root, env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken }, stdio: 'pipe' });
    const source = path.join(root, 'supabase', 'migrations');
    await copyDirectoryRecursive(source, path.join(backupDir, 'migrations'));
    return { success: true, file_count: (await fs.readdir(source)).length };
  } catch { return { success: false, reason: 'migration_export_failed' }; }
  finally { await fs.rm(root, { recursive: true, force: true }); }
};
