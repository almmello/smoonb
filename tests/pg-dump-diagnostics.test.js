const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { createPgDumpDiagnostics, hasReplicaRolePrologue } = require('../src/utils/pg-dump-diagnostics');
const { createDatabaseSeparatedStep, runWithElapsedTicker } = require('../src/commands/backup/steps/03-database-separated');
const { initI18n } = require('../src/i18n');

const warning = [
  'pg_dump: warning: there are circular foreign-key constraints among these tables:',
  'pg_dump: detail: steps',
  'pg_dump: detail: after_catalog',
  'pg_dump: hint: You might not be able to restore the dump without using --disable-triggers or temporarily dropping the constraints.',
  'pg_dump: hint: Consider using a full dump instead of a --data-only dump to avoid this problem.'
].join('\n') + '\n';

function collect(text, bytewise = false) {
  let output = '';
  const parser = createPgDumpDiagnostics(chunk => { output += chunk; });
  const bytes = Buffer.from(text);
  if (bytewise) for (const byte of bytes) parser.write(Buffer.from([byte]));
  else parser.write(bytes);
  return { diagnostics: parser.end(), output };
}

async function directory(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'smoonb-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

async function logs(action) {
  const previous = console.log;
  const lines = [];
  console.log = (...args) => lines.push(args.join(' '));
  try { return { result: await action(), output: lines.join('\n') }; }
  finally { console.log = previous; }
}

test('consolidates repeated circular FK blocks, preserving table names and original diagnostics', () => {
  const self = warning.replace('among these tables', 'on this table').replace('after_catalog', 'steps');
  const result = collect(warning + self);
  assert.equal(result.output, '');
  assert.equal(result.diagnostics.circularForeignKeys, true);
  assert.deepEqual(result.diagnostics.tables, ['steps', 'after_catalog']);
  assert.equal(result.diagnostics.messages.length, 10);
});

test('handles arbitrary UTF-8 chunk boundaries, CRLF and final line without newline', () => {
  const input = warning.replace('steps', 'versões').replaceAll('\n', '\r\n') + 'pg_dump: error: conexão perdida';
  const { output, diagnostics } = collect(input, true);
  assert.deepEqual(diagnostics.tables, ['versões', 'after_catalog']);
  assert.equal(output, 'pg_dump: error: conexão perdida');
});

test('does not hide unrelated warnings, errors, hints or localized diagnostics', () => {
  const other = 'pg_dump: warning: another warning\npg_dump: detail: not a circular table\npg_dump: hint: unknown hint\npg_dump: erro: falhou\n';
  assert.equal(collect(warning + other).output, other);
  assert.equal(collect(other).diagnostics.circularForeignKeys, false);
});

test('preserves unfamiliar hints even inside a circular warning block', () => {
  assert.equal(collect(warning + 'pg_dump: hint: future hint\n').output, 'pg_dump: hint: future hint\n');
});

test('recognizes only the Supabase prologue, not SQL inside dumped records', async t => {
  const dir = await directory(t);
  const file = path.join(dir, 'data.sql');
  for (const text of ['SET session_replication_role = replica;\n', "\uFEFFSET session_replication_role = 'replica';\r\n"]) {
    await fs.writeFile(file, text);
    assert.equal(await hasReplicaRolePrologue(file), true);
  }
  for (const text of ['', '-- SET session_replication_role = replica;\n', 'COPY public.notes FROM stdin;\nSET session_replication_role = replica;\n', 'SET session_replication_role = origin;\n']) {
    await fs.writeFile(file, text);
    assert.equal(await hasReplicaRolePrologue(file), false);
  }
  await assert.rejects(hasReplicaRolePrologue(path.join(dir, 'missing.sql')), { code: 'ENOENT' });
});

function fakeDump({ fail, protectedData = true, emitWarnings = true } = {}) {
  return async (command, _args, _env, _label, consolidate) => {
    const file = command.match(/-f "([^"]+)"/)[1];
    if (path.basename(file) === fail) throw new Error('simulated export failure');
    await fs.writeFile(file, protectedData ? 'SET session_replication_role = replica;\n' : '-- no protection\n');
    if (command.includes('--data-only')) {
      assert.equal(consolidate, true);
      return collect(emitWarnings ? warning : '').diagnostics;
    }
    assert.equal(consolidate, undefined);
    return collect('').diagnostics;
  };
}

for (const locale of ['en', 'pt-BR']) {
  test(`successful export reports circular dependencies and detected protection (${locale})`, async t => {
    initI18n([], { SMOONB_LANG: locale });
    const dir = await directory(t);
    const step = createDatabaseSeparatedStep(fakeDump());
    const { result, output } = await logs(() => step({ databaseUrl: 'postgresql://fixture', backupDir: dir }));
    assert.equal(result.success, true);
    assert.equal(result.files.length, 3);
    assert.deepEqual(result.failedFiles, []);
    assert.equal(result.warnings[0].replicaRolePrologue, true);
    assert.deepEqual(result.warnings[0].tables, ['steps', 'after_catalog']);
    assert.match(output, /ON_ERROR_STOP=1/);
    assert.match(output, locale === 'en' ? /do not mean the export failed/ : /não significam falha/);
    assert.doesNotMatch(output, /pg_dump: warning:/);
  });
}

test('missing prologue produces a restoration warning, never claims protection', async t => {
  initI18n([], { SMOONB_LANG: 'en' });
  const step = createDatabaseSeparatedStep(fakeDump({ protectedData: false }));
  const dir = await directory(t);
  const { result, output } = await logs(() => step({ databaseUrl: 'fixture', backupDir: dir }));
  assert.equal(result.warnings[0].replicaRolePrologue, false);
  assert.match(output, /No replica-role prologue/);
  assert.doesNotMatch(output, /data.sql starts with SET/);
});

test('ordinary export does not create a spurious warning', async t => {
  const dir = await directory(t);
  const step = createDatabaseSeparatedStep(fakeDump({ emitWarnings: false }));
  const { result } = await logs(() => step({ databaseUrl: 'fixture', backupDir: dir }));
  assert.equal(result.success, true);
  assert.deepEqual(result.warnings, []);
});

for (const fail of ['schema.sql', 'data.sql', 'roles.sql']) {
  test(`partial export with ${fail} failure is not marked successful`, async t => {
    const dir = await directory(t);
    const step = createDatabaseSeparatedStep(fakeDump({ fail }));
    const { result, output } = await logs(() => step({ databaseUrl: 'fixture', backupDir: dir }));
    assert.equal(result.success, false);
    assert.equal(result.files.length, 2);
    assert.deepEqual(result.failedFiles, [fail]);
    assert.match(output, /simulated export failure/);
  });
}

test('subprocess errors reject even when preceded by circular warnings', async t => {
  const dir = await directory(t);
  const fixture = path.join(dir, 'failure.js');
  await fs.writeFile(fixture, `process.stderr.write(${JSON.stringify(warning + 'pg_dump: error: real failure\n')}); process.exitCode = 7;`);
  await assert.rejects(runWithElapsedTicker(`"${process.execPath}" "${fixture}"`, [], {}, 'fixture', true), /Exited with code 7/);
});

test('subprocess completes after warning-only exit and drains stdout', async t => {
  const dir = await directory(t);
  const fixture = path.join(dir, 'success.js');
  await fs.writeFile(fixture, `process.stdout.write('fixture stdout drained\\n'); process.stderr.write(${JSON.stringify(warning)});`);
  const result = await runWithElapsedTicker(`"${process.execPath}" "${fixture}"`, [], {}, 'fixture', true);
  assert.equal(result.circularForeignKeys, true);
});
