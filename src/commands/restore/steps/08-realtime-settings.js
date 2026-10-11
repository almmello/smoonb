const fs = require('fs');
const path = require('path');
const {
  applyConfig,
  management,
  ConfigurationVerificationError,
} = require('../management');
const { confirm } = require('../../../utils/prompt');
const { t } = require('../../../i18n');
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
// Only capacity limits can be explicitly retained. Security, service switches
// and database connection pools must still match the backup exactly.
const capacityLimits = new Set([
  'max_concurrent_users',
  'max_events_per_second',
  'max_bytes_per_second',
  'max_channels_per_client',
  'max_joins_per_second',
  'max_presence_events_per_second',
  'max_payload_size_in_kb',
]);
class RealtimeRestoreError extends Error {
  constructor(message, differences = []) {
    super(message);
    this.name = 'RealtimeRestoreError';
    this.differences = differences;
  }
}
module.exports = async (
  { backupPath, targetProject },
  {
    request = management,
    confirmLimits = confirm,
    interactive = Boolean(process.stdin.isTTY),
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log = console.log,
  } = {},
) => {
  const getT = global.smoonbI18n?.t || t;
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
    log(
      getT('restore.realtime.snapshot', {
        date:
          backup.realtime_settings.captured_at ||
          getT('restore.realtime.unknownDate'),
      }),
    );
  }
  const capturedAt =
    backup.captured_at || backup.realtime_settings?.captured_at;
  const mismatches = (state) =>
    Object.keys(desired).filter(
      (key) => JSON.stringify(desired[key]) !== JSON.stringify(state[key]),
    );
  try {
    const result = await applyConfig(
      targetProject,
      'config/realtime',
      desired,
      allowed,
      request,
    );
    return { ...result, captured_at: capturedAt };
  } catch (error) {
    if (!(error instanceof ConfigurationVerificationError)) throw error;
    // A successful PATCH may take time to become visible. Never repeat PATCH
    // just to poll: changing Realtime settings can disconnect clients.
    let actual;
    let fields;
    for (const delay of [1000, 2000]) {
      await wait(delay);
      actual = await request(targetProject, 'config/realtime');
      fields = mismatches(actual);
      if (!fields.length)
        return {
          success: true,
          verified: true,
          configuration_readback_verified: true,
          fields_verified: Object.keys(desired).length,
          fields_updated: error.updatedFields,
          captured_at: capturedAt,
        };
    }
    const canRetain = fields.every(
      (key) =>
        capacityLimits.has(key) &&
        Number.isInteger(desired[key]) &&
        desired[key] > 0 &&
        Number.isInteger(actual[key]) &&
        actual[key] > 0,
    );
    if (!canRetain)
      throw new RealtimeRestoreError(
        getT('restore.realtime.strictMismatch', { fields: fields.join(', ') }),
      );
    const differences = fields.map((field) => ({
      field,
      backup_value: desired[field],
      destination_value: actual[field],
    }));
    log(getT('restore.realtime.limitsNotApplied'));
    for (const difference of differences)
      log(
        getT('restore.realtime.difference', {
          field: getT(`restore.realtime.fields.${difference.field}`),
          backup: difference.backup_value,
          destination: difference.destination_value,
        }),
      );
    log(getT('restore.realtime.limitsExplanation'));
    if (
      !interactive ||
      (await confirmLimits(getT('restore.realtime.acceptLimits'), true)) !==
        true
    )
      throw new RealtimeRestoreError(
        getT('restore.realtime.notAccepted'),
        differences,
      );
    // The user approved these exact numeric differences. A fresh read must
    // still match both the approved limits and every other backed-up field.
    const accepted = {
      ...desired,
      ...Object.fromEntries(
        differences.map((d) => [d.field, d.destination_value]),
      ),
    };
    const final = await request(targetProject, 'config/realtime');
    if (
      Object.keys(accepted).some(
        (key) => JSON.stringify(accepted[key]) !== JSON.stringify(final[key]),
      )
    )
      throw new RealtimeRestoreError(
        getT('restore.realtime.changed'),
        differences,
      );
    log(getT('restore.realtime.accepted'));
    return {
      success: true,
      verified: false,
      effective_configuration_verified: true,
      destination_limits_accepted: true,
      accepted_differences: differences,
      fields_verified: Object.keys(desired).length - differences.length,
      fields_updated: error.updatedFields.filter(
        (key) => !fields.includes(key),
      ),
      captured_at: capturedAt,
    };
  }
};
module.exports.RealtimeRestoreError = RealtimeRestoreError;
module.exports.capacityLimits = capacityLimits;
