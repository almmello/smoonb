const fs = require('fs');
const zlib = require('zlib');
const { ident, literal } = require('./pg');
const managed = new Set([
  'auth',
  'storage',
  'realtime',
  '_realtime',
  'extensions',
  'graphql',
  'graphql_public',
  'pgbouncer',
  'vault',
  'supabase_functions',
  'net',
  'cron',
  'pgsodium',
  'pgsodium_masks',
]);
const isApplication = (schema) =>
  schema !== '-' && !managed.has(schema) && !schema.startsWith('pg_');

function readDump(file) {
  const bytes = fs.readFileSync(file);
  const text = (file.endsWith('.gz') ? zlib.gunzipSync(bytes) : bytes)
    .toString('utf8')
    .replace(/\r\n/g, '\n');
  const matches = [
    ...text.matchAll(
      /^-- (?:Data for )?Name: (.*); Type: ([A-Z ]+); Schema: (.*); Owner: (.*)$/gm,
    ),
  ];
  if (!matches.length)
    throw new Error('Unsupported or incomplete plain PostgreSQL backup');
  const sections = matches.map((m, i) => ({
    name: m[1],
    type: m[2],
    schema: m[3],
    owner: m[4],
    sql: text
      .slice(m.index + m[0].length, matches[i + 1]?.index ?? text.length)
      .replace(/^(?:\n|--\n)+/, '')
      .trim(),
  }));
  return {
    sections,
    tables: sections.filter((s) => s.type === 'TABLE DATA').map(parseCopy),
  };
}
function parseCopy(section) {
  const m = section.sql.match(
    /^COPY (.+?) \((.+)\) FROM stdin;\n([\s\S]*?)^\\\.$/m,
  );
  if (!m)
    throw new Error(
      `Unsupported data section: ${section.schema}.${section.name}`,
    );
  const lines = m[3] ? m[3].replace(/\n$/, '').split('\n') : [];
  return {
    schema: section.schema,
    name: section.name,
    table: m[1],
    columns: m[2],
    lines,
  };
}
function decodeCopy(value) {
  if (value === '\\N') return null;
  return value.replace(/\\([0-7]{1,3}|x[0-9a-f]{1,2}|.)/gi, (_, code) => {
    if (/^[0-7]/.test(code)) return String.fromCharCode(parseInt(code, 8));
    if (/^x/i.test(code))
      return String.fromCharCode(parseInt(code.slice(1), 16));
    return (
      { t: '\t', n: '\n', r: '\r', b: '\b', f: '\f', v: '\v' }[code] || code
    );
  });
}
function records(table) {
  if (!table) return [];
  const columns = table.columns
    .split(/,\s*/)
    .map((x) => x.replace(/^"|"$/g, '').replace(/""/g, '"'));
  return table.lines.map((line) =>
    Object.fromEntries(
      line.split('\t').map((v, i) => [columns[i], decodeCopy(v)]),
    ),
  );
}
function textArray(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value;
  if (!value.startsWith('{') || !value.endsWith('}'))
    throw new Error('Invalid PostgreSQL text array');
  if (value === '{}') return [];
  const result = [];
  let item = '',
    quoted = false,
    escaped = false;
  for (const char of value.slice(1, -1)) {
    if (escaped) {
      item += char;
      escaped = false;
    } else if (char === '\\') escaped = true;
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) {
      result.push(item);
      item = '';
    } else item += char;
  }
  if (quoted || escaped) throw new Error('Invalid PostgreSQL text array');
  result.push(item);
  return result;
}
function remapServiceUrls(text, source, target) {
  if (!source || !target || source === target) return text;
  for (const ref of [source, target])
    if (!/^[a-z0-9-]+$/.test(ref)) throw new Error('Invalid project reference');
  return text.replace(
    new RegExp(
      `(?<![a-z0-9.-])${source}\\.supabase\\.co(?=[:/\\\\"'\\s]|$)`,
      'g',
    ),
    `${target}.supabase.co`,
  );
}
function resetObjectAcl(schemas) {
  const scope = schemas.map(literal).join(',');
  return `DO $smoonb_acl$ DECLARE o record; g record; BEGIN
  FOR o IN
    SELECT 'TABLE' kind,format('%I.%I',n.nspname,c.relname) object,c.relowner owner,c.relacl acl,false public_default
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN (${scope}) AND c.relkind IN ('r','p','v','m','f')
    UNION ALL SELECT 'SEQUENCE',format('%I.%I',n.nspname,c.relname),c.relowner,c.relacl,false FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN (${scope}) AND c.relkind='S'
    UNION ALL SELECT 'FUNCTION',format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),p.proowner,p.proacl,true FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN (${scope}) AND p.prokind IN ('f','w')
  LOOP
    FOR g IN SELECT DISTINCT grantee FROM aclexplode(o.acl) WHERE grantee<>o.owner LOOP
      EXECUTE format('REVOKE ALL ON %s %s FROM %s',o.kind,o.object,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
    END LOOP;
    IF o.public_default THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC',o.object); END IF;
  END LOOP;
  END $smoonb_acl$;`;
}
const verifyForeignKeys = `DO $smoonb_fk$ DECLARE fk record; join_sql text; null_sql text; bad boolean; BEGIN
 FOR fk IN SELECT c.* FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE c.contype='f' AND n.nspname NOT LIKE 'pg_%' LOOP
  SELECT string_agg(format('c.%I = p.%I',a.attname,b.attname),' AND '),string_agg(format('c.%I IS NOT NULL',a.attname),' AND ')
  INTO join_sql,null_sql FROM unnest(fk.conkey,fk.confkey) WITH ORDINALITY k(a,b,i)
  JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=k.a JOIN pg_attribute b ON b.attrelid=fk.confrelid AND b.attnum=k.b;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s c WHERE %s AND NOT EXISTS(SELECT 1 FROM %s p WHERE %s))',fk.conrelid::regclass,null_sql,fk.confrelid::regclass,join_sql) INTO bad;
  IF bad THEN RAISE EXCEPTION 'Foreign key verification failed: %',fk.conname; END IF;
 END LOOP;
END $smoonb_fk$;`;
function buildRestore(
  dump,
  { sourceProjectId, targetProjectId, remapUrls = true } = {},
) {
  const { sections, tables } = dump;
  const schemas = [
    ...new Set(sections.map((s) => s.schema).filter(isApplication)),
  ];
  if (!schemas.length) throw new Error('No application schema in backup');
  const sql = [
    "BEGIN; SET LOCAL statement_timeout=0; SET LOCAL lock_timeout='30s'; SET LOCAL check_function_bodies=false; SET LOCAL session_replication_role=replica; SET LOCAL search_path='';",
  ];
  const clean = (s) => s.sql.replace(/^\\.*$/gm, '');
  const app = (s) =>
    isApplication(s.schema) ||
    (s.type === 'SCHEMA' && isApplication(s.name)) ||
    (s.type === 'ACL' &&
      s.name.startsWith('SCHEMA ') &&
      isApplication(s.name.slice(7)));
  const selected = sections.filter(
    (s) =>
      app(s) ||
      s.type === 'EXTENSION' ||
      (managed.has(s.schema) &&
        (s.type === 'POLICY' ||
          (s.type === 'TRIGGER' &&
            /EXECUTE (?:FUNCTION|PROCEDURE) (?:public|"public")\./.test(
              s.sql,
            )))),
  );
  const late = new Set([
    'TABLE DATA',
    'SEQUENCE SET',
    'ACL',
    'DEFAULT ACL',
    'FK CONSTRAINT',
    'TRIGGER',
    'POLICY',
    'ROW SECURITY',
  ]);
  for (const s of selected.filter((s) => !late.has(s.type))) sql.push(clean(s));
  const restored = tables.filter(
    (t) =>
      isApplication(t.schema) ||
      (t.schema === 'auth' && t.name !== 'schema_migrations') ||
      (t.schema === 'storage' && ['objects', 'buckets'].includes(t.name)),
  );
  const unsupported = tables.filter(
    (t) =>
      t.lines.length &&
      !restored.includes(t) &&
      !['schema_migrations', 'migrations'].includes(t.name),
  );
  if (unsupported.length)
    throw new Error(
      `Backup has data requiring a dedicated migration: ${unsupported.map((t) => t.table).join(', ')}`,
    );
  let changedRows = 0;
  for (const [i, t] of restored.entries()) {
    const temp = ident(`smoonb_expected_${i}`);
    let lines = t.lines;
    if (remapUrls && isApplication(t.schema))
      lines = lines.map((line) => {
        const v = remapServiceUrls(line, sourceProjectId, targetProjectId);
        if (v !== line) changedRows++;
        return v;
      });
    sql.push(
      `DO $smoonb_empty$ BEGIN IF EXISTS(SELECT 1 FROM ${t.table}) THEN RAISE EXCEPTION USING MESSAGE=${literal('Destination must be empty: ' + t.table)}; END IF; END $smoonb_empty$;`,
    );
    sql.push(
      `CREATE TEMP TABLE ${temp} ON COMMIT DROP AS SELECT ${t.columns} FROM ${t.table} WITH NO DATA;`,
    );
    sql.push(
      `COPY ${temp} (${t.columns}) FROM stdin;\n${lines.length ? lines.join('\n') + '\n' : ''}\\.`,
    );
    sql.push(
      `INSERT INTO ${t.table} (${t.columns}) OVERRIDING SYSTEM VALUE SELECT ${t.columns} FROM ${temp};`,
    );
    const actual = `SELECT to_jsonb(r) FROM (SELECT ${t.columns} FROM ${t.table}) r`;
    const expected = `SELECT to_jsonb(r) FROM (SELECT ${t.columns} FROM ${temp}) r`;
    sql.push(
      `DO $smoonb_rows$ BEGIN IF EXISTS((${actual} EXCEPT ALL ${expected}) UNION ALL (${expected} EXCEPT ALL ${actual})) THEN RAISE EXCEPTION USING MESSAGE=${literal('Data verification failed: ' + t.table)}; END IF; END $smoonb_rows$;`,
    );
  }
  for (const s of sections.filter(
    (s) => s.type === 'SEQUENCE SET' && (app(s) || s.schema === 'auth'),
  ))
    sql.push(clean(s));
  for (const s of selected.filter((s) =>
    ['FK CONSTRAINT', 'TRIGGER', 'POLICY', 'ROW SECURITY'].includes(s.type),
  ))
    sql.push(clean(s));
  sql.push(resetObjectAcl(schemas));
  // Supabase-managed administrator defaults are maintained by the platform;
  // the customer postgres role cannot and must not impersonate supabase_admin.
  for (const s of selected.filter(
    (s) =>
      s.type === 'ACL' ||
      (s.type === 'DEFAULT ACL' && !s.owner.startsWith('supabase_')),
  ))
    sql.push(clean(s));
  for (const s of sections.filter((s) => s.type === 'PUBLICATION TABLE'))
    sql.push(clean(s));
  sql.push(
    verifyForeignKeys,
    'SET LOCAL session_replication_role=origin; COMMIT;',
  );
  return {
    sql: sql.join('\n'),
    summary: {
      success: true,
      verified: true,
      tables: restored.length,
      rows: restored.reduce((n, t) => n + t.lines.length, 0),
      remapped_rows: changedRows,
      managed_schema_ddl: 'preserved_destination',
      verification:
        'all restored columns (multiset) and foreign keys, in transaction',
    },
  };
}
module.exports = {
  readDump,
  parseCopy,
  records,
  decodeCopy,
  textArray,
  remapServiceUrls,
  buildRestore,
  managed,
  isApplication,
  verifyForeignKeys,
};
