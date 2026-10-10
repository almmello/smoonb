const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const {
  readDump,
  decodeCopy,
  textArray,
  remapServiceUrls,
  buildRestore,
} = require('../src/commands/restore/dump');
const {
  applyConfig,
  management,
} = require('../src/commands/restore/management');
const edge = require('../src/commands/restore/steps/04-edge-functions');
const { runRestore } = require('../src/commands/restore/runner');
const target = {
  targetProjectId: 'destination',
  targetAccessToken: 'private-test-token',
};
test('PostgreSQL MIME arrays preserve unquoted and quoted values', () => {
  assert.deepEqual(textArray('{application/zip,application/octet-stream}'), [
    'application/zip',
    'application/octet-stream',
  ]);
  assert.deepEqual(textArray('{"a,b","c"}'), ['a,b', 'c']);
  assert.equal(textArray(null), null);
  assert.deepEqual(textArray('{}'), []);
});
function temp(t) {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'smoonb-unit-'));
  t.after(() => fs.rmSync(p, { recursive: true, force: true }));
  return p;
}
const dump = `-- Name: sample; Type: TABLE; Schema: public; Owner: postgres
CREATE TABLE public.sample (id integer, label text);
-- Data for Name: sample; Type: TABLE DATA; Schema: public; Owner: postgres
COPY public.sample (id, label) FROM stdin;
1\t--keep data
2\ttext\\twith tab
\\.
`;
test('reads compressed backup without modifying it and preserves COPY values', (t) => {
  const p = path.join(temp(t), 'db.backup.gz'),
    bytes = zlib.gzipSync(dump);
  fs.writeFileSync(p, bytes);
  const parsed = readDump(p);
  assert.equal(parsed.tables[0].lines.length, 2);
  assert.match(parsed.tables[0].lines[0], /--keep data/);
  assert.deepEqual(fs.readFileSync(p), bytes);
  const plan = buildRestore(parsed);
  assert.equal(plan.summary.rows, 2);
  assert.match(plan.sql, /ON COMMIT DROP/);
  assert.match(plan.sql, /session_replication_role=replica/);
  assert.match(plan.sql, /EXCEPT ALL/);
});
test('COPY decoding handles escapes and preserves null versus literal backslash N', () => {
  assert.equal(decodeCopy('\\N'), null);
  assert.equal(decodeCopy('\\\\N'), '\\N');
  assert.equal(decodeCopy('a\\tb\\n\\134'), 'a\tb\n\\');
});
test('remaps only source service hostnames, including escaped JSON, never IDs or other domains', () => {
  const input =
    'https://source.supabase.co/storage/x source notsource.supabase.co source.supabase.co.evil https:\\/\\/source.supabase.co\\/x';
  const changed = remapServiceUrls(input, 'source', 'destination');
  assert.match(changed, /https:\/\/destination/);
  assert.match(changed, / source notsource/);
  assert.match(changed, /source.supabase.co.evil/);
  assert.match(changed, /destination.supabase.co\\\//);
});
test('nonempty unsupported managed data blocks restoration instead of being discarded', (t) => {
  const p = path.join(temp(t), 'db.backup');
  fs.writeFileSync(p, dump + dump.replaceAll('public', 'vault'));
  assert.throws(() => buildRestore(readDump(p)), /dedicated migration/);
});
test('Auth configuration is applied, re-read and verified; secrets never appear in the result', async () => {
  let state = { smtp_pass: null, site_url: 'old' };
  let patches = 0;
  const request = async (_target, _endpoint, options = {}) => {
    if (options.method === 'PATCH') {
      state = { ...state, ...options.body };
      patches++;
    }
    return { ...state };
  };
  const r = await applyConfig(
    target,
    'config/auth',
    { smtp_pass: 'test-secret', site_url: 'new' },
    ['smtp_pass', 'site_url'],
    request,
  );
  assert.equal(patches, 1);
  assert.equal(r.verified, true);
  assert.ok(!JSON.stringify(r).includes('test-secret'));
});
test('Auth mismatch after accepted PATCH fails verification', async () => {
  await assert.rejects(
    applyConfig(
      target,
      'config/auth',
      { site_url: 'new' },
      ['site_url'],
      async () => ({ site_url: 'old' }),
    ),
    /verification failed/,
  );
});
test('non-writable divergent fields and masked secrets fail before PATCH', async () => {
  await assert.rejects(
    applyConfig(target, 'config/auth', { unknown: true }, [], async () => ({})),
    /manual migration/,
  );
  await assert.rejects(
    applyConfig(
      target,
      'config/auth',
      { smtp_pass: '********' },
      ['smtp_pass'],
      async () => ({}),
    ),
    /Masked/,
  );
});
test('Management API failure reports status without leaking response or credentials', async () => {
  await assert.rejects(
    management(target, 'config/auth', {
      fetchImpl: async () => ({
        ok: false,
        status: 403,
        text: async () => 'private-test-token',
      }),
    }),
    (e) =>
      e.message.includes('403') && !e.message.includes('private-test-token'),
  );
});
test('Functions deploy uses isolated files, explicit target, JWT configuration and cleanup', async (t) => {
  const root = temp(t),
    backup = path.join(root, 'backup');
  fs.mkdirSync(path.join(backup, 'edge-functions', 'hello'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(backup, 'edge-functions', 'hello', 'index.ts'),
    'export {};',
  );
  fs.writeFileSync(
    path.join(backup, 'backup-manifest.json'),
    JSON.stringify({
      components: {
        edge_functions: { functions: [{ slug: 'hello', verify_jwt: false }] },
      },
    }),
  );
  let workspace;
  const r = await edge(
    { backupPath: backup, targetProject: target },
    {
      deploy: (_cmd, args, opts) => {
        workspace = opts.cwd;
        assert.notEqual(workspace, process.cwd());
        assert.ok(args.includes('--project-ref'));
        assert.ok(args.includes('--no-verify-jwt'));
        assert.ok(
          fs.existsSync(
            path.join(workspace, 'supabase', 'functions', 'hello', 'index.ts'),
          ),
        );
      },
      request: async () => [
        { slug: 'hello', status: 'ACTIVE', verify_jwt: false },
      ],
    },
  );
  assert.equal(r.verified, true);
  assert.equal(fs.existsSync(workspace), false);
  assert.ok(
    fs.existsSync(path.join(backup, 'edge-functions', 'hello', 'index.ts')),
  );
});
test('Functions deployment failure is fatal and removes only its temporary directory', async (t) => {
  const backup = temp(t);
  fs.mkdirSync(path.join(backup, 'edge-functions', 'hello'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(backup, 'edge-functions', 'hello', 'index.ts'),
    'original',
  );
  fs.writeFileSync(path.join(backup, 'backup-manifest.json'), '{}');
  let workspace;
  await assert.rejects(
    edge(
      { backupPath: backup, targetProject: target },
      {
        deploy: (_c, _a, o) => {
          workspace = o.cwd;
          throw Error('private');
        },
      },
    ),
    /deployment failed/,
  );
  assert.equal(fs.existsSync(workspace), false);
  assert.equal(
    fs.readFileSync(
      path.join(backup, 'edge-functions', 'hello', 'index.ts'),
      'utf8',
    ),
    'original',
  );
});
test('restore runner persists partial failure and never executes later steps', async (t) => {
  const processDir = temp(t);
  let reached = false;
  await assert.rejects(
    runRestore(
      {
        selectedBackup: {
          path: processDir,
          backupFile: 'x',
          projectId: 'source',
        },
        components: { authSettings: true, edgeFunctions: true },
        targetProject: target,
        processDir,
      },
      {
        authSettings: async () => ({ success: false }),
        edgeFunctions: async () => {
          reached = true;
        },
      },
    ),
    /did not pass verification/,
  );
  const report = JSON.parse(
    fs.readFileSync(path.join(processDir, 'report.json')),
  );
  assert.equal(report.status, 'failed');
  assert.equal(report.failed_component, 'authSettings');
  assert.equal(reached, false);
});
test('same-project restoration is refused before any step', async (t) => {
  const root = temp(t);
  await assert.rejects(
    runRestore({
      selectedBackup: { projectId: 'destination', path: root },
      components: {},
      targetProject: target,
      processDir: root,
    }),
    /different, empty/,
  );
});
