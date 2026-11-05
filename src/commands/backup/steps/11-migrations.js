const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { runSupabase } = require('../../../utils/supabaseCli');
const { runSql } = require('../../restore/pg');
const { copyDirectoryRecursive } = require('../../restore/utils');
module.exports = async ({ databaseUrl, accessToken, backupDir, postgresMajor = 17 }, { query = runSql, run = runSupabase } = {}) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smoonb-migrations-'));
  let phase = 'migration_history_check_failed';
  try {
    const history = await query(databaseUrl, "BEGIN READ ONLY; SET LOCAL statement_timeout = '20s'; SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL; COMMIT;", { postgresMajor });
    if (!['t', 'f'].includes(history.trim())) throw new Error('Unexpected history response');
    let count = 0;
    if (history.trim() === 't') {
      const value = await query(databaseUrl, "BEGIN READ ONLY; SET LOCAL statement_timeout = '20s'; SELECT count(*) FROM supabase_migrations.schema_migrations; COMMIT;", { postgresMajor });
      if (!/^\d+$/.test(value.trim())) throw new Error('Unexpected migration count');
      count = Number(value.trim());
    }
    if (count === 0) {
      await fs.mkdir(path.join(backupDir, 'migrations'), { recursive: true });
      console.log('Migrations: nenhum histórico registrado no banco; nada a exportar.');
      return { success: true, file_count: 0, reason: history.trim() === 'f' ? 'history_absent' : 'history_empty' };
    }
    phase = 'migration_export_failed';
    await fs.mkdir(path.join(root, 'supabase', 'migrations'), { recursive: true });
    await fs.writeFile(path.join(root, 'supabase', 'config.toml'), 'project_id = "smoonb-backup"\n');
    run('supabase', ['migration', 'fetch', '--db-url', databaseUrl, '--workdir', root, '--yes'], { cwd: root, env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken }, stdio: 'pipe' });
    const source = path.join(root, 'supabase', 'migrations');
    await copyDirectoryRecursive(source, path.join(backupDir, 'migrations'));
    const fileCount = (await fs.readdir(source)).filter(name => name.endsWith('.sql')).length;
    if (fileCount !== count) throw new Error('Migration export count mismatch');
    return { success: true, file_count: fileCount };
  } catch { return { success: false, reason: phase, action: 'Check database connectivity and access to supabase_migrations.schema_migrations; retry the backup.' }; }
  finally { await fs.rm(root, { recursive: true, force: true }); }
};
