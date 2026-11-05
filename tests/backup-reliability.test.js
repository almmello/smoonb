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
