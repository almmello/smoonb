const fs = require('fs');
const path = require('path');
const { applyConfig } = require('../management');
const allowed = [
  'private_only',
  'connection_pool',
  'postgres_changes_pool',
  'max_concurrent_users',
  'max_events_per_second',
  'max_bytes_per_second',
  'max_channels_per_client',
  'max_joins_per_second',
  'max_presence_events_per_second',
  'max_payload_size_in_kb',
  'suspend',
  'presence_enabled',
];
module.exports = async ({ backupPath, targetProject }) => {
  const backup = JSON.parse(
    fs.readFileSync(path.join(backupPath, 'realtime-settings.json'), 'utf8'),
  );
  let desired = backup.settings;
  if (!desired) {
    const legacy = backup.realtime_settings?.settings;
    if (!legacy) throw new Error('Realtime configuration missing from backup');
    const mapping = {
      enable_realtime_service: 'suspend',
      allow_public_access: 'private_only',
      database_connection_pool_size: 'connection_pool',
      max_concurrent_clients: 'max_concurrent_users',
      max_events_per_second: 'max_events_per_second',
      max_presence_events_per_second: 'max_presence_events_per_second',
      max_payload_size_kb: 'max_payload_size_in_kb',
    };
    desired = Object.fromEntries(
      Object.entries(legacy).map(([key, item]) => {
        if (!mapping[key])
          throw new Error(`Unsupported Realtime configuration: ${key}`);
        return [
          mapping[key],
          ['enable_realtime_service', 'allow_public_access'].includes(key)
            ? !item.value
            : item.value,
        ];
      }),
    );
    console.log(
      `Realtime: restoring the recorded snapshot (${backup.realtime_settings.captured_at || 'date unavailable'}).`,
    );
  }
  const result = await applyConfig(
    targetProject,
    'config/realtime',
    desired,
    allowed,
  );
  return {
    ...result,
    captured_at: backup.captured_at || backup.realtime_settings?.captured_at,
  };
};
