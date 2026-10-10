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
) {
  const before = await request(target, endpoint);
  const patch = {};
  const unsupported = [];
  for (const [key, value] of Object.entries(desired)) {
    if (JSON.stringify(before[key]) === JSON.stringify(value)) continue;
    if (!allowed.includes(key)) {
      unsupported.push(key);
      continue;
    }
    if (
      typeof value === 'string' &&
      /^(\*{3,}|[•●]{3,}|\[redacted\])$/i.test(value)
    )
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
    throw new Error(
      `Configuration verification failed: ${differences.join(', ')}`,
    );
  return {
    success: true,
    verified: true,
    fields_verified: Object.keys(desired).length,
    fields_updated: Object.keys(patch),
  };
}
module.exports = { management, applyConfig };
