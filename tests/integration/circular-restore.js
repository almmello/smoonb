// Explicit opt-in integration test: creates and removes only its own disposable
// PostgreSQL container and generated fixtures. Never reads project credentials.
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('child_process');
const { randomUUID } = require('crypto');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const backupStep = require('../../src/commands/backup/steps/03-database-separated');
const { initI18n } = require('../../src/i18n');

const name = `smoonb-circular-test-${randomUUID()}`;
let created = false;
let temp;
function docker(args, input) {
  return execFileSync('docker', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
}
function sql(database, input, role = 'postgres') {
  return docker(['exec', '-i', name, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-U', role, '-d', database], input);
}
function assertRestoreFails(database, input, pattern, role = 'postgres') {
  const result = spawnSync('docker', ['exec', '-i', name, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-U', role, '-d', database], { input, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 3, result.stderr);
  assert.match(result.stderr, pattern);
  assert.match(sql(database, 'SELECT count(*) FROM public.steps;'), /\b0\b/);
}
const fixture = `
CREATE TABLE public.steps (id integer PRIMARY KEY, catalog_id integer NOT NULL);
CREATE TABLE public.after_catalog (id integer PRIMARY KEY, step_id integer NOT NULL);
CREATE TABLE public.navigation_menus (id integer PRIMARY KEY, parent_id integer NOT NULL);
INSERT INTO public.steps VALUES (1,10), (2,20);
INSERT INTO public.after_catalog VALUES (10,1), (20,2);
INSERT INTO public.navigation_menus VALUES (1,2), (2,1);
ALTER TABLE public.steps ADD CONSTRAINT steps_catalog_fk FOREIGN KEY(catalog_id) REFERENCES public.after_catalog(id);
ALTER TABLE public.after_catalog ADD CONSTRAINT catalog_steps_fk FOREIGN KEY(step_id) REFERENCES public.steps(id);
ALTER TABLE public.navigation_menus ADD CONSTRAINT menus_parent_fk FOREIGN KEY(parent_id) REFERENCES public.navigation_menus(id);
`;
const verify = `
DO $$ BEGIN
 IF (SELECT count(*) FROM public.steps) <> 2 OR
    (SELECT count(*) FROM public.after_catalog) <> 2 OR
    (SELECT count(*) FROM public.navigation_menus) <> 2 THEN
   RAISE EXCEPTION 'row count mismatch';
 END IF;
 IF EXISTS (SELECT 1 FROM public.steps s LEFT JOIN public.after_catalog c ON c.id=s.catalog_id WHERE c.id IS NULL) OR
    EXISTS (SELECT 1 FROM public.after_catalog c LEFT JOIN public.steps s ON s.id=c.step_id WHERE s.id IS NULL) OR
    EXISTS (SELECT 1 FROM public.navigation_menus m LEFT JOIN public.navigation_menus p ON p.id=m.parent_id WHERE p.id IS NULL) THEN
   RAISE EXCEPTION 'orphaned reference';
 END IF;
END $$;
SHOW session_replication_role;
`;
(async () => {
  try {
    initI18n([], { SMOONB_LANG: 'pt-BR' });
    temp = await fs.mkdtemp(path.join(os.tmpdir(), 'smoonb-circular-integration-'));
    docker(['run', '-d', '--rm', '--name', name, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-p', '127.0.0.1::5432', 'postgres:17']);
    created = true;
    let ready = false;
    for (let i=0; i<60; i++) {
      try { docker(['exec', name, 'pg_isready', '-U', 'postgres']); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    assert.ok(ready, 'Postgres readiness timeout');
    for (const database of ['fixture', 'restored', 'unprotected', 'unprivileged', 'full_restore']) {
      docker(['exec', name, 'createdb', '-U', 'postgres', database]);
    }
    sql('fixture', fixture);
    const port = docker(['port', name, '5432/tcp']).trim().split(':').pop();
    const result = await backupStep({
      databaseUrl: `postgresql://postgres:fixture@host.docker.internal:${port}/fixture`,
      backupDir: temp
    });
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.warnings.length, 1);
    assert.equal(result.warnings[0].replicaRolePrologue, true);
    assert.ok(result.warnings[0].tables.includes('steps'));
    assert.ok(result.warnings[0].tables.includes('after_catalog'));
    assert.ok(result.warnings[0].tables.includes('navigation_menus'));
    const schema = await fs.readFile(path.join(temp, 'schema.sql'), 'utf8');
    const data = await fs.readFile(path.join(temp, 'data.sql'), 'utf8');
    sql('restored', schema + '\n' + data);
    assert.match(sql('restored', verify), /origin/);
    console.log('PASS: real Supabase CLI export + restore preserves every cyclic reference; replica setting does not leak to a new session.');
    sql('unprotected', schema);
    const withoutPrologue = data.replace(/^SET session_replication_role = replica;\r?\n/, '');
    assert.notEqual(withoutPrologue, data);
    assertRestoreFails('unprotected', withoutPrologue, /foreign key constraint/);
    console.log('PASS: removing the prologue fails restoration and rolls back all rows (negative control).');
    sql('unprivileged', schema + '\nCREATE ROLE restore_reader LOGIN; GRANT USAGE ON SCHEMA public TO restore_reader; GRANT ALL ON ALL TABLES IN SCHEMA public TO restore_reader;');
    assertRestoreFails('unprivileged', data, /permission denied to set parameter "session_replication_role"/, 'restore_reader');
    console.log('PASS: insufficient privileges fail explicitly with ON_ERROR_STOP=1; no false success.');
    const full = docker(['exec', name, 'pg_dump', '-U', 'postgres', '-d', 'fixture']);
    sql('full_restore', full);
    assert.match(sql('full_restore', verify), /origin/);
    console.log('PASS: full schema+data dump also restores cyclic references.');
    console.log('Docker integration completed successfully.');
  } finally {
    if (created) docker(['rm', '-f', '-v', name]);
    if (temp) await fs.rm(temp, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error.message);
  if (error.stderr) console.error(String(error.stderr));
  process.exitCode = 1;
});
