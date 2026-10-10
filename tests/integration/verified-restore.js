// Disposable Docker databases only. No .env files, credentials or remote services.
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const { randomUUID } = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
const restore = require('../../src/commands/restore/steps/03-database');
const storage = require('../../src/commands/restore/steps/06-storage');
const name = `smoonb-verified-${randomUUID()}`;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smoonb-verified-'));
let created = false;
function docker(args, input) {
  return execFileSync('docker', args, {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 120000,
    maxBuffer: 16e6,
  });
}
function sql(db, input) {
  return docker(
    [
      'exec',
      '-i',
      name,
      'psql',
      '-U',
      'postgres',
      '-d',
      db,
      '-X',
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    input,
  );
}
const baseline = `CREATE SCHEMA auth;
 CREATE TABLE auth.users(id int PRIMARY KEY);
 CREATE TABLE auth.identities(id int PRIMARY KEY,user_id int REFERENCES auth.users(id));
 CREATE SCHEMA storage;
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid PRIMARY KEY,bucket_id text REFERENCES storage.buckets(id),name text,metadata jsonb,owner uuid,owner_id text,created_at timestamptz,user_metadata jsonb);
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;`;
const fixture = `${baseline}
 CREATE TABLE public.nodes(id int PRIMARY KEY,parent_id int,link text,payload json);
 INSERT INTO public.nodes VALUES(1,2,'https://source.supabase.co/storage/v1/object/public/assets/page.html','{"link":"https://source.supabase.co/x"}'),(2,1,'source','{"keep":"source"}');
 ALTER TABLE public.nodes ADD CONSTRAINT nodes_parent_fk FOREIGN KEY(parent_id) REFERENCES public.nodes(id);
 CREATE FUNCTION public.privileged() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'SELECT 1';
 REVOKE ALL ON FUNCTION public.privileged() FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION public.privileged() TO service_role;
 REVOKE ALL ON public.nodes FROM anon,authenticated;
 GRANT SELECT ON public.nodes TO authenticated;
 INSERT INTO auth.users VALUES(1);
 INSERT INTO auth.identities VALUES(1,1);
 INSERT INTO storage.buckets VALUES('assets','assets',true,NULL,NULL),('empty','empty',false,NULL,NULL);
 INSERT INTO storage.objects VALUES('00000000-0000-0000-0000-000000000001','assets','page.html','{"mimetype":"text/html; charset=utf-8","cacheControl":"no-cache","size":40}',NULL,'owner-retained','2026-01-01','{"custom":"preserved"}');`;
(async () => {
  try {
    docker([
      'run',
      '--rm',
      '-d',
      '--name',
      name,
      '-e',
      'POSTGRES_HOST_AUTH_METHOD=trust',
      '-p',
      '127.0.0.1::5432',
      'postgres:17',
    ]);
    created = true;
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        docker(['exec', name, 'pg_isready', '-U', 'postgres']);
        ready = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    assert.ok(ready);
    sql(
      'postgres',
      'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;',
    );
    for (const db of ['source', 'destination', 'broken'])
      docker(['exec', name, 'createdb', '-U', 'postgres', db]);
    sql('source', fixture);
    sql('destination', baseline);
    sql('broken', baseline);
    const dump = docker([
      'exec',
      name,
      'pg_dump',
      '-U',
      'postgres',
      '-d',
      'source',
    ]);
    const file = path.join(root, 'database.backup');
    fs.writeFileSync(file, dump);
    const port = docker(['port', name, '5432/tcp']).trim().split(':').pop();
    const url = (db) =>
      `postgresql://postgres:fixture@host.docker.internal:${port}/${db}`;
    const args = {
      backupFilePath: file,
      targetDatabaseUrl: url('destination'),
      sourceProjectId: 'source',
      targetProjectId: 'destination',
    };
    const result = await restore(args);
    assert.equal(result.verified, true);
    assert.equal(
      sql('destination', 'SELECT count(*) FROM auth.identities;').trim(),
      '1',
    );
    assert.equal(
      sql(
        'destination',
        "SELECT has_function_privilege('anon','public.privileged()','EXECUTE');",
      ).trim(),
      'f',
    );
    assert.equal(
      sql(
        'destination',
        "SELECT has_table_privilege('anon','public.nodes','SELECT');",
      ).trim(),
      'f',
    );
    assert.equal(
      sql(
        'destination',
        "SELECT has_table_privilege('authenticated','public.nodes','SELECT');",
      ).trim(),
      't',
    );
    assert.equal(
      sql(
        'destination',
        "SELECT count(*) FROM public.nodes WHERE link LIKE '%destination.supabase.co%';",
      ).trim(),
      '1',
    );
    console.log(
      'PASS: actual restore step preserves Auth identities, cycles, JSON and restricted permissions despite broad destination defaults.',
    );
    const corrupt = dump.replace(
      /(COPY auth.identities[^\n]+\n)1\t1\n/,
      (_all, prefix) => prefix + '1\t999\n',
    );
    assert.notEqual(corrupt, dump);
    fs.writeFileSync(file, corrupt);
    await assert.rejects(
      restore({ ...args, targetDatabaseUrl: url('broken') }),
      /Database operation failed/,
    );
    assert.equal(
      sql('broken', "SELECT to_regclass('public.nodes') IS NULL;").trim(),
      't',
    );
    assert.equal(sql('broken', 'SELECT count(*) FROM auth.users;').trim(), '0');
    console.log(
      'PASS: invalid Auth foreign key fails and rolls back application schema and every loaded row.',
    );
    fs.writeFileSync(file, dump);
    await assert.rejects(restore(args), /Database operation failed/);
    assert.equal(
      sql('destination', 'SELECT count(*) FROM auth.identities;').trim(),
      '1',
    );
    console.log(
      'PASS: nonempty target is refused without damaging the prior restoration.',
    );
    const zip = new AdmZip();
    zip.addFile(
      'source/assets/page.html',
      Buffer.from('<img src="https://source.supabase.co/x">'),
    );
    zip.writeZip(path.join(root, 'source.storage.zip'));
    fs.writeFileSync(
      path.join(root, 'backup-manifest.json'),
      JSON.stringify({ project_id: 'source' }),
    );
    const realFetch = global.fetch;
    let uploaded;
    let bucketUpdates = 0;
    const buckets = [
      {
        id: 'assets',
        name: 'assets',
        public: true,
        file_size_limit: null,
        allowed_mime_types: null,
      },
      {
        id: 'empty',
        name: 'empty',
        public: false,
        file_size_limit: null,
        allowed_mime_types: null,
      },
    ];
    global.fetch = async (request, options = {}) => {
      const address = String(request);
      if (
        address.endsWith('/bucket') &&
        (!options.method || options.method === 'GET')
      )
        return new Response(JSON.stringify(buckets), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      if (address.includes('/bucket/') && options.method === 'PUT') {
        bucketUpdates++;
        return new Response('{}');
      }
      if (address.includes('/object/') && options.method === 'POST') {
        assert.equal(options.headers['cache-control'], 'no-cache');
        assert.equal(
          options.headers['content-type'],
          'text/html; charset=utf-8',
        );
        uploaded = Buffer.from(options.body);
        return new Response('{}');
      }
      if (address.includes('/object/authenticated/'))
        return new Response(uploaded);
      throw new Error('Unexpected mock storage request');
    };
    try {
      const r = await storage({
        backupPath: root,
        backupFilePath: file,
        targetProject: {
          targetUrl: 'https://destination.supabase.co',
          targetServiceKey: 'test-key',
          targetProjectId: 'destination',
          targetDatabaseUrl: url('destination'),
        },
      });
      assert.equal(r.total_files, 1);
      assert.equal(r.buckets_count, 2);
      assert.equal(bucketUpdates, 2);
      assert.match(uploaded.toString(), /destination.supabase.co/);
      assert.equal(
        sql(
          'destination',
          "SELECT owner_id||'|'||(metadata->>'cacheControl') FROM storage.objects;",
        ).trim(),
        'owner-retained|no-cache',
      );
      console.log(
        'PASS: Storage uses original MIME/cache, preserves owner, counts empty buckets, remaps URLs and verifies downloaded content (mock HTTP, real PostgreSQL).',
      );
    } finally {
      global.fetch = realFetch;
    }
  } finally {
    if (created) docker(['rm', '-f', name]);
    assert.ok(path.basename(root).startsWith('smoonb-verified-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
