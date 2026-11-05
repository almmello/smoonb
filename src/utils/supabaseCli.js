const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
function runSupabase(_command, args, options = {}) {
  const root = path.dirname(require.resolve('supabase/package.json'));
  const pkg = require(path.join(root, 'package.json'));
  if (pkg.version !== require('../../package.json').dependencies.supabase) throw new Error('Supabase CLI version mismatch; reinstall smoonb');
  const entry = path.resolve(root, typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.supabase);
  try {
    const result = spawnSync(entry.endsWith('.js') ? process.execPath : entry, entry.endsWith('.js') ? [entry, ...args] : args, { ...options, shell: false, windowsHide: true, timeout: options.timeout || 180000, maxBuffer: 16 * 1024 * 1024 });
    if (result.error || result.status !== 0) throw { status: result.status, code: result.error?.code };
    return options.capture ? result : result.stdout;
  } catch (error) {
    throw new Error(`Supabase CLI operation failed (${error.code === 'ETIMEDOUT' ? 'timeout; check Docker image downloads and connectivity' : 'exit ' + (Number.isInteger(error.status) ? error.status : 'unavailable')}). Check connectivity and credentials.`);
  }
}
async function isolatedSupabase(args, env = {}, options = {}) {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'smoonb-cli-'));
  try {
    await fs.promises.mkdir(path.join(root, 'supabase'));
    await fs.promises.writeFile(path.join(root, 'supabase', 'config.toml'), 'project_id = "smoonb-backup"\n');
    return runSupabase('supabase', [...args, '--workdir', root], { ...options, cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', stdio: 'pipe' });
  } finally { await fs.promises.rm(root, { recursive: true, force: true }); }
}
module.exports = { runSupabase, isolatedSupabase };
