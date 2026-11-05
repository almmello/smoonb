const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const inquirer = require('inquirer');
const { readEnvFile, writeEnvFile, backupEnvFile } = require('../src/utils/env');
const { mapEnvVariablesInteractively } = require('../src/interactive/envMapper');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smoonb-env-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, file: path.join(root, '.env.local') };
}
test('persists values without rewriting unrelated lines, comments or CRLF', async t => {
  const { file, root } = await fixture(t);
  const original = '# keep comment\r\nOTHER = "keep this"\r\nexport EXPORTED=old\r\n';
  await fs.writeFile(file, original);
  await backupEnvFile(file, path.join(root, '.env.local.before'));
  const values = { TOKEN: 'fake#token', QUOTED: 'a "double" and \'single\' quote', WINDOWS_PATH: 'C:\\new folder\\test', DATABASE_URL: 'postgresql://fixture:p%40ss@localhost/postgres' };
  await writeEnvFile(file, values);
  const contents = await fs.readFile(file, 'utf8');
  assert.ok(contents.startsWith(original));
  assert.equal(await fs.readFile(path.join(root, '.env.local.before'), 'utf8'), original);
  const saved = await readEnvFile(file);
  for (const [key, value] of Object.entries(values)) assert.equal(saved[key], value);
  await writeEnvFile(file, { ...saved, EXPORTED: 'new' });
  assert.ok((await fs.readFile(file, 'utf8')).includes('export EXPORTED=new\r\n'));
  assert.equal((await readEnvFile(file)).EXPORTED, 'new');
  assert.deepEqual((await fs.readdir(root)).filter(n => n.endsWith('.tmp')), []);
});
test('failed atomic replacement preserves the original file and removes temporary secrets', async t => {
  const { file, root } = await fixture(t);
  await fs.writeFile(file, 'KEEP=original\n');
  t.mock.method(fs, 'rename', async () => { throw Object.assign(new Error('fixture permission failure'), {code:'EACCES'}); });
  await assert.rejects(writeEnvFile(file, {TOKEN:'fixture'}), /permission failure/);
  assert.equal(await fs.readFile(file, 'utf8'), 'KEEP=original\n');
  assert.deepEqual(await fs.readdir(root), ['.env.local']);
});
test('rejects newline injection without changing the existing environment', async t => {
  const { file } = await fixture(t);
  await fs.writeFile(file, 'KEEP=original\n');
  await assert.rejects(writeEnvFile(file, {TOKEN:'one\nOTHER=two'}), /Invalid environment entry/);
  assert.equal(await fs.readFile(file, 'utf8'), 'KEEP=original\n');
});
test('first answer remains on disk when a later configuration prompt fails', async t => {
  const { file } = await fixture(t);
  let prompts = 0;
  t.mock.method(console, 'log', () => {});
  t.mock.method(inquirer, 'prompt', async () => {
    if (++prompts === 1) return {newValue:'fixture-project'};
    throw new Error('simulated interruption');
  });
  await assert.rejects(mapEnvVariablesInteractively({}, ['SUPABASE_PROJECT_ID','SUPABASE_ACCESS_TOKEN'], entry => writeEnvFile(file, entry)), /simulated interruption/);
  assert.equal((await readEnvFile(file)).SUPABASE_PROJECT_ID, 'fixture-project');
});
test('configuration is saved before a later backup failure and available on the next run', async t => {
  const { file } = await fixture(t);
  t.mock.method(console, 'log', () => {});
  t.mock.method(inquirer, 'prompt', async () => ({newValue:'fixture-token'}));
  await mapEnvVariablesInteractively({}, ['SUPABASE_ACCESS_TOKEN'], entry => writeEnvFile(file, entry));
  await assert.rejects((async () => { assert.equal((await readEnvFile(file)).SUPABASE_ACCESS_TOKEN, 'fixture-token'); throw new Error('simulated database failure'); })(), /database failure/);
  assert.equal((await readEnvFile(file)).SUPABASE_ACCESS_TOKEN, 'fixture-token');
});

test('real backup orchestrator persists configuration before the database step fails', async t => {
  const { root, file } = await fixture(t);
  const vm = require('node:vm');
  const { createRequire } = require('node:module');
  const entry = path.resolve(__dirname, '../src/commands/backup/index.js');
  const originalRequire = createRequire(entry);
  const moduleFixture = { exports: {} };
  const originalDirectory = process.cwd();
  const original = '# application settings\nOTHER=untouched\n';
  await fs.writeFile(file, original);
  const configured = { SUPABASE_PROJECT_ID: 'fixture-project', SUPABASE_DB_URL: 'postgresql://fixture:fake@localhost/postgres', SUPABASE_POSTGRES_MAJOR: '17', SUPABASE_ACCESS_TOKEN: 'fixture-token' };
  let databaseReached = false;
  const processFixture = { env: {}, cwd: () => root, exit: () => { throw Error('Unexpected early exit'); } };
  const fixtureRequire = name => {
    if (name === '../../utils/docker') return { getDockerVersion: async () => 'fixture' };
    if (name === '../../utils/prompt') return { confirm: async () => true };
    if (name === '../../telemetry') return { sendTelemetry: () => {} };
    if (name === '../../interactive/envMapper') return {
      askComponentsFlags: async () => ({}),
      printSupabasePostgresMajorHintOnce: () => {},
      mapEnvVariablesInteractively: async (env, _keys, onMapped) => {
        const dePara = {};
        for (const [key, value] of Object.entries(configured)) { dePara[key] = key; await onMapped({[key]:value}, dePara); }
        return { finalEnv: {...env,...configured}, dePara };
      },
    };
    if (name.startsWith('./steps/')) return async () => {
      if (name === './steps/02-database') {
        databaseReached = true;
        const saved = await readEnvFile(file);
        for (const [key,value] of Object.entries(configured)) assert.equal(saved[key], value);
        throw Error('simulated database failure');
      }
      return {success:true,files:[],roles:[]};
    };
    return originalRequire(name);
  };
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  vm.runInNewContext(await fs.readFile(entry,'utf8'), { require: fixtureRequire, module: moduleFixture, process: processFixture, global: {}, console });
  try {
    process.chdir(root);
    const result = await moduleFixture.exports({});
    assert.equal(databaseReached, true);
    assert.equal(result.success, false);
    assert.equal(processFixture.exitCode, 1);
    const saved = await readEnvFile(file);
    for (const [key, value] of Object.entries(configured)) assert.equal(saved[key], value);
    assert.equal(await fs.readFile(path.join(result.backupDir,'env','.env.local.before'),'utf8'), original);
    assert.equal((await readEnvFile(path.join(result.backupDir,'env','.env.local'))).SUPABASE_ACCESS_TOKEN, 'fixture-token');
  } finally { process.chdir(originalDirectory); }
});
