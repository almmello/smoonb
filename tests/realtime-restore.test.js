const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const realtime = require('../src/commands/restore/steps/08-realtime-settings');
const auth = require('../src/commands/restore/steps/05-auth-settings');
const { runRestore } = require('../src/commands/restore/runner');
const {
  applyConfig,
  ConfigurationVerificationError,
} = require('../src/commands/restore/management');
const desired = {
  private_only: false,
  connection_pool: 2,
  suspend: false,
  max_presence_events_per_second: 100,
  max_payload_size_in_kb: 100,
};
const effective = {
  ...desired,
  max_presence_events_per_second: 20,
  max_payload_size_in_kb: 256,
};
function fixture(t, settings = desired, legacy = false) {
  const backupPath = fs.mkdtempSync(path.join(os.tmpdir(), 'smoonb-realtime-'));
  t.after(() => fs.rmSync(backupPath, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(backupPath, 'realtime-settings.json'),
    JSON.stringify(
      legacy
        ? {
            realtime_settings: {
              captured_at: '2026-06-06T19:53:01.139Z',
              settings: {
                enable_realtime_service: { value: true },
                allow_public_access: { value: true },
                database_connection_pool_size: { value: 2 },
                max_presence_events_per_second: { value: 100 },
                max_payload_size_kb: { value: 100 },
              },
            },
          }
        : { settings, captured_at: '2026-10-10T19:53:01.139Z' },
    ),
  );
  return {
    backupPath,
    targetProject: {
      targetProjectId: 'destination',
      targetAccessToken: 'fake-token',
    },
  };
}
function api(state = effective) {
  const calls = [];
  return {
    calls,
    request: async (_target, _endpoint, options = {}) => {
      calls.push(options.method || 'GET');
      return { ...state };
    },
  };
}
const quiet = { interactive: true, wait: async () => {}, log: () => {} };

for (const legacy of [true, false])
  test(`${legacy ? 'legacy' : 'API'} snapshot records accepted destination quotas without claiming an identical restore`, async (t) => {
    const context = fixture(t, desired, legacy),
      transport = api();
    const original = fs.readFileSync(
      path.join(context.backupPath, 'realtime-settings.json'),
    );
    let confirmations = 0;
    const result = await realtime(context, {
      ...quiet,
      ...transport,
      confirmLimits: async (_q, defaultYes) => {
        confirmations++;
        assert.equal(defaultYes, false);
        return true;
      },
    });
    assert.equal(confirmations, 1);
    assert.equal(result.success, true);
    assert.equal(result.verified, false);
    assert.equal(result.destination_limits_accepted, true);
    assert.equal(result.effective_configuration_verified, true);
    assert.equal(result.fields_verified, 3);
    assert.deepEqual(result.accepted_differences, [
      {
        field: 'max_presence_events_per_second',
        backup_value: 100,
        destination_value: 20,
      },
      {
        field: 'max_payload_size_in_kb',
        backup_value: 100,
        destination_value: 256,
      },
    ]);
    assert.equal(transport.calls.filter((c) => c === 'PATCH').length, 1);
    assert.deepEqual(
      fs.readFileSync(path.join(context.backupPath, 'realtime-settings.json')),
      original,
    );
  });

test('matching snapshots never ask for consent or send a PATCH', async (t) => {
  const transport = api(desired);
  const result = await realtime(fixture(t), {
    ...quiet,
    ...transport,
    confirmLimits: () => assert.fail('unexpected confirmation'),
  });
  assert.equal(result.verified, true);
  assert.deepEqual(transport.calls, ['GET', 'GET']);
});

test('delayed readback converges without repeating PATCH or asking for exceptions', async (t) => {
  let reads = 0,
    patches = 0;
  const result = await realtime(fixture(t), {
    ...quiet,
    request: async (_t, _e, o = {}) => {
      if (o.method === 'PATCH') {
        patches++;
        return null;
      }
      return ++reads < 3 ? effective : desired;
    },
    confirmLimits: () => assert.fail('unexpected confirmation'),
  });
  assert.equal(result.verified, true);
  assert.equal(patches, 1);
  assert.equal(reads, 3);
});

test('rejected limits remain pending and retain exact numeric differences', async (t) => {
  await assert.rejects(
    realtime(fixture(t), {
      ...quiet,
      ...api(),
      confirmLimits: async () => false,
    }),
    (error) => {
      assert.ok(error instanceof realtime.RealtimeRestoreError);
      assert.equal(error.differences.length, 2);
      return true;
    },
  );
});

test('noninteractive restore cannot silently accept limits or wait for input', async (t) => {
  await assert.rejects(
    realtime(fixture(t), {
      ...quiet,
      ...api(),
      interactive: false,
      confirmLimits: () => assert.fail('unexpected prompt'),
    }),
    realtime.RealtimeRestoreError,
  );
});

for (const key of [
  'private_only',
  'suspend',
  'presence_enabled',
  'connection_pool',
  'postgres_changes_pool',
])
  test(`divergent ${key} cannot be accepted as a quota exception`, async (t) => {
    const settings = { ...desired, [key]: key.includes('pool') ? 2 : false };
    const current = { ...effective, [key]: key.includes('pool') ? 3 : true };
    await assert.rejects(
      realtime(fixture(t, settings), {
        ...quiet,
        ...api(current),
        confirmLimits: () => assert.fail('unexpected prompt'),
      }),
      realtime.RealtimeRestoreError,
    );
  });

for (const value of [null, undefined, '20', true, 0, -1, 1.5])
  test(`invalid numeric limit ${String(value)} cannot be accepted`, async (t) => {
    await assert.rejects(
      realtime(fixture(t), {
        ...quiet,
        ...api({ ...effective, max_presence_events_per_second: value }),
        confirmLimits: () => assert.fail('unexpected prompt'),
      }),
      realtime.RealtimeRestoreError,
    );
  });

test('HTTP rejection never offers a quota exception', async (t) => {
  await assert.rejects(
    realtime(fixture(t), {
      ...quiet,
      request: async (_t, _e, o = {}) => {
        if (o.method === 'PATCH') throw Error('HTTP 403');
        return effective;
      },
      confirmLimits: () => assert.fail('unexpected prompt'),
    }),
    /HTTP 403/,
  );
});

test('unknown settings never offer a quota exception', async (t) => {
  await assert.rejects(
    realtime(fixture(t, { ...desired, unknown_field: 1 }), {
      ...quiet,
      ...api(),
      confirmLimits: () => assert.fail('unexpected prompt'),
    }),
    /manual migration/,
  );
});

for (const change of [{ max_payload_size_in_kb: 512 }, { private_only: true }])
  test(`concurrent change after consent is rejected: ${Object.keys(change)[0]}`, async (t) => {
    let consented = false;
    await assert.rejects(
      realtime(fixture(t), {
        ...quiet,
        request: async () => ({ ...effective, ...(consented ? change : {}) }),
        confirmLimits: async () => {
          consented = true;
          return true;
        },
      }),
      realtime.RealtimeRestoreError,
    );
  });

test('configuration mismatch exceptions expose field names, never Auth values', async () => {
  await assert.rejects(
    applyConfig(
      {},
      'config/auth',
      { site_url: 'private-before' },
      ['site_url'],
      async () => ({ site_url: 'private-after' }),
    ),
    (error) => {
      assert.ok(error instanceof ConfigurationVerificationError);
      assert.deepEqual(error.fields, ['site_url']);
      assert.ok(!JSON.stringify(error).includes('private-'));
      return true;
    },
  );
});

for (const accept of [true, false])
  test(`Realtime-only retry ${accept ? 'completes with accepted differences' : 'saves failure details'} without running other components`, async (t) => {
    const context = fixture(t),
      config = {
        selectedBackup: {
          path: context.backupPath,
          backupFile: 'unused',
          projectId: 'source',
        },
        components: { realtimeSettings: true },
        targetProject: context.targetProject,
        processDir: context.backupPath,
      };
    const implementations = {
      database: () => assert.fail('database repeated'),
      authSettings: () => assert.fail('auth repeated'),
      storage: () => assert.fail('storage repeated'),
      realtimeSettings: (c) =>
        realtime(c, { ...quiet, ...api(), confirmLimits: async () => accept }),
    };
    if (accept) await runRestore(config, implementations);
    else
      await assert.rejects(
        runRestore(config, implementations),
        realtime.RealtimeRestoreError,
      );
    const report = JSON.parse(
      fs.readFileSync(path.join(context.backupPath, 'report.json')),
    );
    assert.equal(
      report.status,
      accept ? 'completed_with_accepted_differences' : 'failed',
    );
    assert.equal(
      report.results.realtimeSettings.verified,
      accept ? false : undefined,
    );
    assert.equal(Object.keys(report.results).length, 1);
    if (!accept)
      assert.equal(report.results.realtimeSettings.unapplied_limits.length, 2);
  });

test('accepted quotas do not erase SMTP verification limits in a combined report', async (t) => {
  const context = fixture(t);
  fs.writeFileSync(
    path.join(context.backupPath, 'auth-settings.json'),
    JSON.stringify({ settings: { site_url: 'site' } }),
  );
  await runRestore(
    {
      selectedBackup: {
        path: context.backupPath,
        backupFile: 'unused',
        projectId: 'source',
      },
      components: { authSettings: true, realtimeSettings: true },
      targetProject: context.targetProject,
      processDir: context.backupPath,
    },
    {
      authSettings: (c) =>
        auth(
          {
            ...c,
            authConfig: {
              desired: { site_url: 'site' },
              writeOnly: { smtp_pass: 'fake-provider-secret' },
            },
          },
          { request: async () => ({ site_url: 'site' }) },
        ),
      realtimeSettings: (c) =>
        realtime(c, { ...quiet, ...api(), confirmLimits: async () => true }),
    },
  );
  const serialized = fs.readFileSync(
    path.join(context.backupPath, 'report.json'),
    'utf8',
  );
  const report = JSON.parse(serialized);
  assert.equal(report.status, 'completed_with_accepted_differences');
  assert.equal(report.results.authSettings.email_delivery_verified, false);
  assert.equal(
    report.results.authSettings.status,
    'applied_with_unverified_secrets',
  );
  assert.equal(report.results.realtimeSettings.verified, false);
  assert.ok(!serialized.includes('fake-provider-secret'));
});
