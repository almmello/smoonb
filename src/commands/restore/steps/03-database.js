const { readDump, buildRestore } = require('../dump');
const { runSql } = require('../pg');
module.exports = async ({
  backupFilePath,
  targetDatabaseUrl,
  sourceProjectId,
  targetProjectId,
  remapUrls = true,
  postgresMajor = 17,
}) => {
  const plan = buildRestore(readDump(backupFilePath), {
    sourceProjectId,
    targetProjectId,
    remapUrls,
  });
  await runSql(targetDatabaseUrl, plan.sql, { postgresMajor });
  return plan.summary;
};
