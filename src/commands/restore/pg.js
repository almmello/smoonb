const { spawn } = require('child_process');

const ident = (value) => '"' + String(value).replace(/"/g, '""') + '"';
const literal = (value) => "'" + String(value).replace(/'/g, "''") + "'";

// SQL and credentials go through stdin/environment, never a shell command.
function runSql(databaseUrl, sql, { postgresMajor = 17 } = {}) {
  const url = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('Invalid database URL');
  if (![15, 16, 17].includes(Number(postgresMajor)))
    throw new Error('Unsupported PostgreSQL major');
  const env = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1) || 'postgres'),
    PGSSLMODE: url.searchParams.get('sslmode') || 'prefer',
    PGCONNECT_TIMEOUT: '20',
  };
  const args = [
    'run',
    '--rm',
    '-i',
    '--network',
    'host',
    ...[
      'PGHOST',
      'PGPORT',
      'PGUSER',
      'PGPASSWORD',
      'PGDATABASE',
      'PGSSLMODE',
      'PGCONNECT_TIMEOUT',
    ].flatMap((k) => ['-e', k]),
    `postgres:${postgresMajor}`,
    'psql',
    '-X',
    '-q',
    '-A',
    '-t',
    '-v',
    'ON_ERROR_STOP=1',
    '-v',
    'VERBOSITY=sqlstate',
  ];
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, {
      env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    let errors = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      errors += chunk;
    });
    child.stdin.on('error', () => {});
    child.on('error', () =>
      reject(new Error('Could not start Docker PostgreSQL client')),
    );
    child.on('close', (code) => {
      if (code !== 0) {
        // COPY errors can contain customer records. Expose SQLSTATE only.
        const states = [
          ...new Set(errors.match(/\b[0-9A-Z]{5}\b/g) || []),
        ].filter((x) => /\d/.test(x));
        reject(
          new Error(
            `Database operation failed (exit ${code}; SQLSTATE ${states.join(', ') || 'unavailable'}). Transaction rolled back when applicable.`,
          ),
        );
      } else resolve(output.trim());
    });
    child.stdin.end(sql);
  });
}
module.exports = { runSql, ident, literal };
