const { execFileSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const assert = require('assert/strict');
const { isolatedSupabase, runSupabase } = require('../../src/utils/supabaseCli');
const separated = require('../../src/commands/backup/steps/03-database-separated');
const migrations = require('../../src/commands/backup/steps/11-migrations');
const name = `smoonb-backup-test-${process.pid}`;
const docker = args => execFileSync('docker', args, { stdio: 'pipe', timeout: 120000 });
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smoonb-isolation-test-'));
  const previous = process.cwd();
  let started = false;
  try {
    await fs.mkdir(path.join(root, 'supabase', 'migrations'), { recursive: true });
    const sentinel = '[inbucket]\nenabled = true\n';
    await fs.writeFile(path.join(root, 'supabase', 'config.toml'), sentinel);
    await fs.writeFile(path.join(root, 'supabase', 'migrations', 'local.sql'), '-- preserve');
    await fs.writeFile(path.join(root, '.env.local'), 'FIXTURE=unchanged');
    process.chdir(root);
    assert.equal(runSupabase('supabase', ['--version'], { encoding: 'utf8', stdio: 'pipe' }).trim(), '2.122.1');
    docker(['run', '-d', '--rm', '--name', name, '-e', 'POSTGRES_PASSWORD=fixture', '-p', '127.0.0.1:55438:5432', 'postgres:17']);
    started = true;
    for (let n = 0; n < 30; n++) {
      try { docker(['exec', name, 'pg_isready', '-U', 'postgres']); break; }
      catch { await new Promise(r => setTimeout(r, 1000)); }
    }
    docker(['exec', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', "CREATE TABLE public.fixture(id integer primary key); INSERT INTO public.fixture VALUES (7); CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text primary key, statements text[], name text); INSERT INTO supabase_migrations.schema_migrations VALUES ('20261105000000', ARRAY['CREATE TABLE public.fixture(id integer primary key);'], 'fixture');"]);
    const backupDir = path.join(root, 'backup'); await fs.mkdir(backupDir);
    const context = { databaseUrl: 'postgresql://postgres:fixture@127.0.0.1:55438/postgres?sslmode=disable', backupDir };
    const result = await separated(context);
    assert.equal(result.success, true);
    assert.equal(result.files.length, 3);
    assert.match(await fs.readFile(path.join(backupDir, 'schema.sql'), 'utf8'), /fixture/);
    assert.equal((await migrations(context)).success, true);
    assert.equal(await fs.readFile(path.join(root, 'supabase', 'config.toml'), 'utf8'), sentinel);
    assert.equal(await fs.readFile(path.join(root, 'supabase', 'migrations', 'local.sql'), 'utf8'), '-- preserve');
    assert.equal(await fs.readFile(path.join(root, '.env.local'), 'utf8'), 'FIXTURE=unchanged');
    await assert.rejects(isolatedSupabase(['invalid-command', 'secret-fixture']), e => !String(e).includes('secret-fixture'));
    console.log('PASS: real SQL exports, migrations, legacy config isolation, source preservation, sanitized failure');
  } finally {
    process.chdir(previous);
    if (started) docker(['stop', name]);
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
