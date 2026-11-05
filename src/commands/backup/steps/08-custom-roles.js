const path = require('path');
const fs = require('fs').promises;
const { isolatedSupabase } = require('../../../utils/supabaseCli');
module.exports = async ({ databaseUrl, backupDir, accessToken }) => {
  try {
    const file = path.resolve(backupDir, 'custom-roles.sql');
    await isolatedSupabase(['db', 'dump', '--db-url', databaseUrl, '--role-only', '-f', file], { SUPABASE_ACCESS_TOKEN: accessToken || '' });
    return { success: true, roles: [{ filename: 'custom-roles.sql', sizeKB: ((await fs.stat(file)).size / 1024).toFixed(1) }] };
  } catch { return { success: false, roles: [], reason: 'roles_export_failed' }; }
};
