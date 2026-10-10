const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { createHash } = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { readDump, records, textArray, remapServiceUrls } = require('../dump');
const { runSql, literal } = require('../pg');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const encodePath = (value) =>
  value.split('/').map(encodeURIComponent).join('/');

function storagePlan(backupPath, backupFilePath) {
  const dump = readDump(backupFilePath);
  const buckets = records(
    dump.tables.find((t) => t.schema === 'storage' && t.name === 'buckets'),
  );
  const objects = records(
    dump.tables.find((t) => t.schema === 'storage' && t.name === 'objects'),
  );
  const manifest = JSON.parse(
    fs.readFileSync(path.join(backupPath, 'backup-manifest.json'), 'utf8'),
  );
  const files = fs
    .readdirSync(backupPath)
    .filter((f) => f.endsWith('.storage.zip'));
  if (files.length > 1 || (objects.length && files.length !== 1))
    throw new Error('Storage archive missing or ambiguous');
  const entries = new Map();
  if (files.length)
    for (const e of new AdmZip(path.join(backupPath, files[0])).getEntries()) {
      if (e.isDirectory) continue;
      let name = e.entryName;
      if (name.startsWith(manifest.project_id + '/'))
        name = name.slice(manifest.project_id.length + 1);
      if (
        name.includes('\\') ||
        name.split('/').some((p) => ['.', '..', ''].includes(p)) ||
        entries.has(name)
      )
        throw new Error('Unsafe or duplicate Storage archive path');
      entries.set(name, e);
    }
  if (
    entries.size !== objects.length ||
    objects.some((o) => !entries.has(`${o.bucket_id}/${o.name}`))
  )
    throw new Error('Storage archive does not match database inventory');
  return { buckets, objects, entries, sourceProjectId: manifest.project_id };
}

module.exports = async ({
  backupPath,
  backupFilePath,
  targetProject,
  remapUrls = true,
  postgresMajor = 17,
}) => {
  const plan = storagePlan(backupPath, backupFilePath);
  const client = createClient(
    targetProject.targetUrl,
    targetProject.targetServiceKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: existing, error } = await client.storage.listBuckets();
  if (error) throw new Error('Cannot inspect destination Storage buckets');
  for (const b of plan.buckets) {
    const options = {
      public: b.public === 't',
      fileSizeLimit:
        b.file_size_limit === null ? null : Number(b.file_size_limit),
      allowedMimeTypes: textArray(b.allowed_mime_types),
    };
    const operation = (existing || []).some((x) => x.id === b.id)
      ? client.storage.updateBucket(b.id, options)
      : client.storage.createBucket(b.id, options);
    const result = await operation;
    if (result.error)
      throw new Error(`Storage bucket configuration failed: ${b.id}`);
  }
  const headers = {
    Authorization: `Bearer ${targetProject.targetServiceKey}`,
    apikey: targetProject.targetServiceKey,
  };
  let transformed = 0,
    completed = 0;
  const metadataSql = [];
  for (const o of plan.objects) {
    const metadata = JSON.parse(o.metadata || '{}');
    let bytes = plan.entries.get(`${o.bucket_id}/${o.name}`).getData();
    const textual =
      /^(text\/|application\/(json|javascript|xml))/.test(
        metadata.mimetype || '',
      ) || /\.(html?|css|js|json|txt|md|svg|xml)$/i.test(o.name);
    if (remapUrls && textual) {
      const changed = Buffer.from(
        remapServiceUrls(
          bytes.toString('utf8'),
          plan.sourceProjectId,
          targetProject.targetProjectId,
        ),
      );
      if (!bytes.equals(changed)) {
        bytes = changed;
        transformed++;
      }
    }
    const objectPath = encodePath(`${o.bucket_id}/${o.name}`);
    const response = await fetch(
      `${targetProject.targetUrl}/storage/v1/object/${objectPath}`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(180000),
        headers: {
          ...headers,
          'x-upsert': 'true',
          'content-type': metadata.mimetype || 'application/octet-stream',
          'cache-control': metadata.cacheControl || 'max-age=3600',
        },
        body: bytes,
      },
    );
    if (!response.ok)
      throw new Error(
        `Storage upload failed (HTTP ${response.status}); completed ${completed}/${plan.objects.length}`,
      );
    const downloaded = await fetch(
      `${targetProject.targetUrl}/storage/v1/object/authenticated/${objectPath}`,
      { headers, signal: AbortSignal.timeout(180000) },
    );
    if (
      !downloaded.ok ||
      hash(Buffer.from(await downloaded.arrayBuffer())) !== hash(bytes)
    )
      throw new Error(
        `Storage content verification failed; completed ${completed}/${plan.objects.length}`,
      );
    const assignments = [];
    for (const field of [
      'id',
      'owner',
      'owner_id',
      'created_at',
      'user_metadata',
    ])
      if (Object.prototype.hasOwnProperty.call(o, field))
        assignments.push(
          `${field}=${o[field] === null ? 'NULL' : literal(o[field])}`,
        );
    const expectedMetadata = {
      mimetype: metadata.mimetype || 'application/octet-stream',
      cacheControl: metadata.cacheControl || 'max-age=3600',
      size: bytes.length,
    };
    assignments.push(
      `metadata=COALESCE(metadata,'{}'::jsonb)||${literal(JSON.stringify(expectedMetadata))}::jsonb`,
    );
    const where = `bucket_id=${literal(o.bucket_id)} AND name=${literal(o.name)}`;
    metadataSql.push(
      `UPDATE storage.objects SET ${assignments.join(',')} WHERE ${where};`,
    );
    metadataSql.push(
      `DO $verify$ BEGIN IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE ${where} AND owner_id IS NOT DISTINCT FROM ${o.owner_id === null ? 'NULL' : literal(o.owner_id)} AND metadata @> ${literal(JSON.stringify(expectedMetadata))}::jsonb) THEN RAISE EXCEPTION 'Storage metadata verification failed'; END IF; END $verify$;`,
    );
    completed++;
    if (completed % 50 === 0 || completed === plan.objects.length)
      console.log(
        `Storage: ${completed}/${plan.objects.length} files uploaded and verified.`,
      );
  }
  if (metadataSql.length)
    await runSql(
      targetProject.targetDatabaseUrl,
      `BEGIN; SET LOCAL session_replication_role=replica;\n${metadataSql.join('\n')}\nCOMMIT;`,
      { postgresMajor },
    );
  const { data: actual, error: verifyError } =
    await client.storage.listBuckets();
  if (
    verifyError ||
    plan.buckets.some(
      (b) =>
        !actual.some(
          (a) =>
            a.id === b.id &&
            a.public === (b.public === 't') &&
            Number(a.file_size_limit || 0) === Number(b.file_size_limit || 0) &&
            JSON.stringify(a.allowed_mime_types || null) ===
              JSON.stringify(textArray(b.allowed_mime_types)),
        ),
    )
  )
    throw new Error('Storage bucket verification failed');
  return {
    success: true,
    verified: true,
    buckets_count: plan.buckets.length,
    files_restored: true,
    total_files: completed,
    remapped_files: transformed,
    verification: 'SHA-256 of every downloaded object and restored metadata',
  };
};
module.exports.storagePlan = storagePlan;
