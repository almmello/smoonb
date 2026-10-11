const { isMasked } = require('../../utils/auth-secrets');

class ConfigurationVerificationError extends Error {
  constructor(fields, updatedFields) {
    super(`Configuration verification failed: ${fields.join(', ')}`);
    this.name = 'ConfigurationVerificationError';
    // Field names only: Auth readback may contain credentials.
    this.fields = [...fields];
    this.updatedFields = [...updatedFields];
  }
}

async function management(
  target,
  endpoint,
  { method = 'GET', body, fetchImpl = fetch } = {},
) {
  if (!/^[a-z0-9-]+$/.test(target.targetProjectId) || !target.targetAccessToken)
    throw new Error('Management API credentials are required');
  let response;
  try {
    response = await fetchImpl(
      `https://api.supabase.com/v1/projects/${target.targetProjectId}/${endpoint}`,
      {
        method,
        signal: AbortSignal.timeout(60000),
        headers: {
          Authorization: `Bearer ${target.targetAccessToken}`,
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
  } catch {
    throw new Error(`Management API ${endpoint}: network failure`);
  }
  // Error response bodies may contain secrets from the submitted configuration.
  if (!response.ok)
    throw new Error(`Management API ${endpoint}: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
async function applyConfig(
  target,
  endpoint,
  desired,
  allowed,
  request = management,
  { writeOnly = {} } = {},
) {
  const secretFields = Object.keys(writeOnly);
  for (const key of secretFields) {
    if (
      endpoint !== 'config/auth' ||
      key !== 'smtp_pass' ||
      !allowed.includes(key)
    )
      throw new Error(`Unsupported write-only configuration: ${key}`);
    if (
      typeof writeOnly[key] !== 'string' ||
      !writeOnly[key].trim() ||
      isMasked(writeOnly[key])
    )
      throw new Error(`A real credential is required: ${key}`);
  }
  if (endpoint === 'config/auth' && Object.hasOwn(desired, 'smtp_pass'))
    throw new Error(
      'SMTP password must be supplied separately, never copied from a configuration response',
    );
  const before = await request(target, endpoint);
  const patch = { ...writeOnly };
  const unsupported = [];
  for (const [key, value] of Object.entries(desired)) {
    if (JSON.stringify(before[key]) === JSON.stringify(value)) continue;
    if (!allowed.includes(key)) {
      unsupported.push(key);
      continue;
    }
    if (isMasked(value))
      throw new Error(`Masked configuration cannot be restored: ${key}`);
    patch[key] = value;
  }
  if (unsupported.length)
    throw new Error(
      `Configuration requires manual migration: ${unsupported.join(', ')}`,
    );
  if (Object.keys(patch).length)
    await request(target, endpoint, { method: 'PATCH', body: patch });
  const after = await request(target, endpoint);
  const differences = Object.keys(desired).filter(
    (k) => JSON.stringify(desired[k]) !== JSON.stringify(after[k]),
  );
  if (differences.length)
    throw new ConfigurationVerificationError(differences, Object.keys(patch));
  return {
    success: true,
    verified: secretFields.length === 0,
    configuration_readback_verified: true,
    write_only_fields_accepted: secretFields,
    ...(secretFields.length ? { email_delivery_verified: false } : {}),
    fields_verified: Object.keys(desired).length,
    fields_updated: Object.keys(patch),
  };
}
module.exports = { management, applyConfig, ConfigurationVerificationError };
