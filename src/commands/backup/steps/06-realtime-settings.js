const path = require('path');
const fs = require('fs').promises;
const { management } = require('../../restore/management');
module.exports = async ({ projectId, accessToken, backupDir }) => {
  try {
    const settings = await management(
      { targetProjectId: projectId, targetAccessToken: accessToken },
      'config/realtime',
    );
    const captured_at = new Date().toISOString();
    await fs.writeFile(
      path.join(backupDir, 'realtime-settings.json'),
      JSON.stringify({ project_id: projectId, captured_at, settings }, null, 2),
    );
    return { success: true, settings, source: 'management-api', captured_at };
  } catch {
    return { success: false, reason: 'realtime_api_capture_failed' };
  }
};
