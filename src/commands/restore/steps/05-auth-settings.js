const fs = require('fs');
const path = require('path');
const { applyConfig } = require('../management');
const { remapServiceUrls } = require('../dump');
const allowed = require('../auth-fields.json');
module.exports = async ({ backupPath, targetProject, remapUrls = true }) => {
  const backup = JSON.parse(
    fs.readFileSync(path.join(backupPath, 'auth-settings.json'), 'utf8'),
  );
  const settings =
    backup.settings?.auth_url_config ||
    backup.settings ||
    backup.auth_url_config;
  if (!settings || !Object.keys(settings).length)
    throw new Error('Auth configuration missing from backup');
  const desired = remapUrls
    ? JSON.parse(
        remapServiceUrls(
          JSON.stringify(settings),
          backup.project_id,
          targetProject.targetProjectId,
        ),
      )
    : settings;
  return applyConfig(targetProject, 'config/auth', desired, allowed);
};
