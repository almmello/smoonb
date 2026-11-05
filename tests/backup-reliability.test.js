const { test } = require('node:test');
const assert = require('node:assert/strict');
const { backupOutcome } = require('../src/commands/backup/outcome');
test('any requested failed component makes the backup incomplete', () => {
  assert.equal(backupOutcome({ database: { success: true }, functions: { success: false } }).success, false);
  assert.deepEqual(backupOutcome({ database: { success: true }, functions: {} }).failed_components, ['functions']);
  assert.equal(backupOutcome({ database: { success: true } }).status, 'completed');
});

test('Storage rejects lost buckets, failed listings, skipped objects and inventory drift', () => {
  const { storageComplete } = require('../src/commands/backup/outcome');
  const good = { filesSkipped: 0, filesDownloaded: 2, totalFiles: 2, objectCount: 2 };
  assert.equal(storageComplete([good], 1), true);
  for (const change of [{listingFailed: true}, {filesSkipped: 1}, {filesDownloaded: 1}, {objectCount: 3}]) assert.equal(storageComplete([{...good,...change}], 1), false);
  assert.equal(storageComplete([], 1), false);
});

const migrations = require('../src/commands/backup/steps/11-migrations');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
for (const exists of ['t', 'f']) test(`empty migration history is successful (${exists})`, async t => {
  const backupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smoonb-history-test-'));
  t.after(() => fs.rm(backupDir, { recursive: true, force: true }));
  const values = [exists, '0'];
  const result = await migrations({ backupDir }, { query: async () => values.shift(), run: () => assert.fail('empty history must not call CLI') });
  assert.equal(result.success, true); assert.equal(result.file_count, 0);
  assert.ok((await fs.stat(path.join(backupDir, 'migrations'))).isDirectory());
});
test('connection/permission failure must not be classified as empty history', async () => {
  const result = await migrations({}, { query: async () => { throw Error('private connection detail'); }, run: () => assert.fail() });
  assert.equal(result.success, false); assert.equal(result.reason, 'migration_history_check_failed');
  assert.ok(!JSON.stringify(result).includes('private connection detail'));
});
test('partial summary includes successful and failed components', () => {
  const lines = require('../src/commands/backup/outcome').componentSummary({ database: {success:true}, migrations: {success:false, reason:'migration_history_check_failed'} });
  assert.equal(lines.length, 2); assert.match(lines[0], /OK.*Banco de dados/); assert.match(lines[1], /FALHA.*Migrations/);
});

test('pinned CLI upgrade advertisement is suppressed without hiding other warnings', () => {
  const filter = require('../src/utils/pg-dump-diagnostics').withoutCliUpgradeNotice;
  const warnings = 'pg_dump: warning: important warning\n';
  const advert = 'A new version of Supabase CLI is available: v3.0.0 (currently installed v2.122.1)\nWe recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli\n';
  assert.equal(filter(warnings + advert), warnings);
  assert.equal(filter('Unrelated warning\n'), 'Unrelated warning\n');
});
