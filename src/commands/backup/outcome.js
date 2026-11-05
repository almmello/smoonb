function backupOutcome(components) {
  const failed_components = Object.entries(components).filter(([, value]) => value?.success !== true).map(([name]) => name);
  return { success: failed_components.length === 0, status: failed_components.length ? 'incomplete' : 'completed', failed_components };
}
function storageComplete(buckets, expected) {
  return buckets.length === expected && buckets.every(b => !b.listingFailed && b.filesSkipped === 0 && b.filesDownloaded === b.totalFiles && b.objectCount === b.totalFiles);
}
module.exports = { backupOutcome, storageComplete };
