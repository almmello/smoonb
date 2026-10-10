const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { runSupabase } = require('../../../utils/supabaseCli');
const { management } = require('../management');
const { copyDirectoryRecursive } = require('../utils');
module.exports = async (
  { backupPath, targetProject },
  { deploy = runSupabase, request = management } = {},
) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smoonb-functions-'));
  try {
    const source = path.join(backupPath, 'edge-functions');
    const names = (await fs.readdir(source, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && e.name !== '_shared')
      .map((e) => e.name);
    if (!names.length)
      return {
        success: true,
        verified: true,
        functions_count: 0,
        success_count: 0,
      };
    if (names.some((n) => !/^[-a-zA-Z0-9_]+$/.test(n)))
      throw new Error('Invalid function slug in backup');
    await copyDirectoryRecursive(
      source,
      path.join(root, 'supabase', 'functions'),
    );
    const manifest = JSON.parse(
      await fs.readFile(path.join(backupPath, 'backup-manifest.json'), 'utf8'),
    );
    const metadata = manifest.components?.edge_functions?.functions || [];
    const settings = names.map((name) => ({
      name,
      verify_jwt:
        metadata.find((f) => (f.slug || f.name) === name)?.verify_jwt ?? true,
    }));
    await fs.writeFile(
      path.join(root, 'supabase', 'config.toml'),
      `project_id = "smoonb-restore"\n` +
        settings
          .map((f) => `[functions.${f.name}]\nverify_jwt = ${f.verify_jwt}\n`)
          .join('\n'),
    );
    for (const f of settings) {
      const args = [
        'functions',
        'deploy',
        f.name,
        '--project-ref',
        targetProject.targetProjectId,
        '--workdir',
        root,
        '--use-api',
      ];
      if (!f.verify_jwt) args.push('--no-verify-jwt');
      try {
        deploy('supabase', args, {
          cwd: root,
          env: {
            ...process.env,
            SUPABASE_ACCESS_TOKEN: targetProject.targetAccessToken,
          },
          stdio: 'pipe',
          timeout: 180000,
          windowsHide: true,
        });
      } catch {
        throw new Error(`Edge Function deployment failed: ${f.name}`);
      }
    }
    const remote = await request(targetProject, 'functions');
    for (const f of settings)
      if (
        !remote.some(
          (r) =>
            r.slug === f.name &&
            r.status === 'ACTIVE' &&
            r.verify_jwt === f.verify_jwt,
        )
      )
        throw new Error(`Edge Function verification failed: ${f.name}`);
    return {
      success: true,
      verified: true,
      functions_count: names.length,
      success_count: names.length,
      local_sources_preserved: true,
    };
  } finally {
    // Only the directory freshly allocated by mkdtemp is removed.
    await fs.rm(root, { recursive: true, force: true });
  }
};
