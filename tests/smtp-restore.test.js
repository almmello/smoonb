const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { authSnapshot } = require('../src/utils/auth-secrets');
const { prepareAuth } = require('../src/commands/restore/auth');
const authStep = require('../src/commands/restore/steps/05-auth-settings');
const { applyConfig } = require('../src/commands/restore/management');
const { runRestore } = require('../src/commands/restore/runner');
const target = {
  targetProjectId: 'destination',
  targetAccessToken: 'fake-token',
};

function fixture(t, snapshot) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smoonb-smtp-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(root, 'auth-settings.json'),
    JSON.stringify({ project_id: 'source', ...snapshot }),
  );
  return { backupPath: root, targetProject: target };
}

test('new backups omit opaque SMTP credentials and record the required input', () => {
  const settings = {
    smtp_pass: 'opaque-value',
    smtp_host: 'smtp.example.com',
    site_url: 'https://example.com',
  };
  const snapshot = authSnapshot(settings);
  assert.equal(snapshot.settings.smtp_pass, undefined);
  assert.equal(snapshot.secrets.smtp_pass.requires_input, true);
  assert.equal(settings.smtp_pass, 'opaque-value');
  assert.equal(
    authSnapshot({ smtp_pass: null, smtp_host: null }).secrets.smtp_pass
      .requires_input,
    false,
  );
  assert.ok(!JSON.stringify(snapshot).includes('opaque-value'));
});

test('backup step saves only readable settings and tells the user about the SMTP password', async (t) => {
  const context = fixture(t, { settings: {} });
  const messages = [];
  t.mock.method(console, 'log', (m) => messages.push(m));
  t.mock.method(global, 'fetch', async () => ({
    ok: true,
    json: async () => ({
      smtp_pass: 'protected-smtp-value',
      smtp_host: 'smtp.example.com',
    }),
  }));
  const backupStep = require('../src/commands/backup/steps/05-auth-settings');
  const result = await backupStep({
    projectId: 'source',
    accessToken: 'fake-token',
    backupDir: context.backupPath,
  });
  assert.equal(result.success, true);
  const serialized = fs.readFileSync(
    path.join(context.backupPath, 'auth-settings.json'),
    'utf8',
  );
  const snapshot = JSON.parse(serialized);
  assert.equal(snapshot.settings.smtp_pass, undefined);
  assert.equal(snapshot.secrets.smtp_pass.requires_input, true);
  assert.ok(!serialized.includes('protected-smtp-value'));
  assert.ok(messages.some((m) => /SMTP/.test(m)));
});

test('empty input and a legacy protected value are rejected even if a prompt bypasses validation', async (t) => {
  const context = fixture(t, {
    settings: {
      smtp_pass: 'opaque-protected-value',
      smtp_host: 'smtp.example.com',
    },
  });
  for (const value of ['', 'opaque-protected-value', '********']) {
    await assert.rejects(
      prepareAuth(context, {
        interactive: true,
        log: () => {},
        prompt: async () => ({ smtpPassword: value }),
      }),
    );
  }
});

for (const legacy of [true, false])
  test(`${legacy ? 'legacy' : 'new'} backup requires a hidden password; keeps archive intact`, async (t) => {
    const settings = {
      smtp_pass: 'a'.repeat(64),
      smtp_host: 'smtp.example.com',
      site_url: 'https://source.supabase.co',
    };
    const context = fixture(t, legacy ? { settings } : authSnapshot(settings));
    const filename = path.join(context.backupPath, 'auth-settings.json');
    const original = fs.readFileSync(filename);
    let prompted = false;
    const config = await prepareAuth(context, {
      interactive: true,
      log: () => {},
      prompt: async ([q]) => {
        prompted = true;
        assert.equal(q.type, 'password');
        assert.equal(q.mask, '*');
        assert.notEqual(q.validate(''), true);
        assert.notEqual(q.validate('********'), true);
        if (legacy) assert.notEqual(q.validate(settings.smtp_pass), true);
        assert.equal(q.validate('provider-secret'), true);
        return { smtpPassword: 'provider-secret' };
      },
    });
    assert.equal(prompted, true);
    assert.equal(config.desired.smtp_pass, undefined);
    assert.equal(config.desired.site_url, 'https://destination.supabase.co');
    assert.equal(config.writeOnly.smtp_pass, 'provider-secret');
    assert.deepEqual(fs.readFileSync(filename), original);
  });

test('missing SMTP password fails preflight before any remote mutation', async (t) => {
  const context = fixture(t, {
    settings: { smtp_host: 'smtp.example.com', smtp_pass: 'opaque-value' },
  });
  let mutations = 0;
  await assert.rejects(
    runRestore(
      {
        selectedBackup: {
          path: context.backupPath,
          backupFile: 'unused',
          projectId: 'source',
        },
        components: { edgeFunctions: true, authSettings: true },
        targetProject: target,
        processDir: context.backupPath,
      },
      {
        edgeFunctions: async () => {
          mutations++;
        },
        authSettings: authStep,
      },
      {
        prepareAuthConfig: (c) =>
          prepareAuth(c, { interactive: false, log: () => {} }),
      },
    ),
    /SMTP/,
  );
  assert.equal(mutations, 0);
  const report = JSON.parse(
    fs.readFileSync(path.join(context.backupPath, 'report.json')),
  );
  assert.equal(report.failed_component, 'preflight');
});

test('projects without custom SMTP never prompt for a password', async (t) => {
  const config = await prepareAuth(
    fixture(t, { settings: { smtp_pass: null, smtp_host: null } }),
    {
      prompt: () => {
        throw Error('must not prompt');
      },
      interactive: false,
    },
  );
  assert.deepEqual(config.writeOnly, {});
});

test('real SMTP password is submitted once; opaque readback is never treated as password equality', async () => {
  let state = { site_url: 'old', smtp_pass: 'opaque-before' };
  const calls = [];
  const request = async (_t, _e, options = {}) => {
    calls.push(options.method || 'GET');
    if (options.method === 'PATCH') {
      assert.equal(options.body.smtp_pass, 'real-provider-secret');
      state = {
        site_url: options.body.site_url,
        smtp_pass: 'different-opaque-after',
      };
    }
    return { ...state };
  };
  const result = await authStep(
    {
      targetProject: target,
      authConfig: {
        desired: { site_url: 'new' },
        writeOnly: { smtp_pass: 'real-provider-secret' },
      },
    },
    { request },
  );
  assert.deepEqual(calls, ['GET', 'PATCH', 'GET']);
  assert.equal(result.success, true);
  assert.equal(result.verified, false);
  assert.equal(result.configuration_readback_verified, true);
  assert.equal(result.fields_verified, 1);
  assert.deepEqual(result.write_only_fields_accepted, ['smtp_pass']);
  assert.equal(result.email_delivery_verified, false);
  assert.ok(!JSON.stringify(result).includes('real-provider-secret'));
});

test('a real mismatch in readable Auth settings still fails with write-only SMTP', async () => {
  await assert.rejects(
    applyConfig(
      target,
      'config/auth',
      { site_url: 'new' },
      ['site_url', 'smtp_pass'],
      async () => ({ site_url: 'old', smtp_pass: 'opaque' }),
      { writeOnly: { smtp_pass: 'real-password' } },
    ),
    /verification failed: site_url/,
  );
});

test('SMTP HTTP rejection remains a failure, never an accepted secret', async () => {
  await assert.rejects(
    applyConfig(
      target,
      'config/auth',
      {},
      ['smtp_pass'],
      async (_t, _e, o) => {
        if (o?.method === 'PATCH') throw Error('HTTP 403');
        return {};
      },
      { writeOnly: { smtp_pass: 'real-password' } },
    ),
    /HTTP 403/,
  );
});

test('protected backup values cannot be accidentally passed through the generic config path', async () => {
  await assert.rejects(
    applyConfig(
      target,
      'config/auth',
      { smtp_pass: 'a'.repeat(64) },
      ['smtp_pass'],
      async () => {
        throw Error('should not request');
      },
    ),
    /supplied separately/,
  );
});

test('runner continues remaining components and reports SMTP acceptance without claiming full verification', async (t) => {
  const context = fixture(t, { settings: { site_url: 'new' } });
  let reached = false;
  const reportDir = context.backupPath;
  await runRestore(
    {
      selectedBackup: {
        path: reportDir,
        backupFile: 'unused',
        projectId: 'source',
      },
      components: { authSettings: true, realtimeSettings: true },
      targetProject: target,
      processDir: reportDir,
    },
    {
      authSettings: () =>
        authStep(
          {
            targetProject: target,
            authConfig: {
              desired: { site_url: 'new' },
              writeOnly: { smtp_pass: 'real-provider-secret' },
            },
          },
          { request: async () => ({ site_url: 'new', smtp_pass: 'opaque' }) },
        ),
      realtimeSettings: async () => {
        reached = true;
        return { success: true, verified: true };
      },
    },
  );
  const serialized = fs.readFileSync(
    path.join(reportDir, 'report.json'),
    'utf8',
  );
  const report = JSON.parse(serialized);
  assert.equal(reached, true);
  assert.equal(report.status, 'applied_with_unverified_secrets');
  assert.equal(report.results.authSettings.verified, false);
  assert.equal(report.results.realtimeSettings.verified, true);
  assert.ok(!serialized.includes('real-provider-secret'));
});
