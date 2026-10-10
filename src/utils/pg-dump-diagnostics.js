const { StringDecoder } = require('string_decoder');
const fs = require('fs').promises;

// Only the exact, known pg_dump circular-FK block is consolidated. All other
// stderr (including errors and unfamiliar/localized warnings) remains visible.
function createPgDumpDiagnostics(writeStderr) {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  let inCircularWarning = false;
  const warnings = [];
  const tables = new Set();
  const hints = new Set([
    'pg_dump: hint: You might not be able to restore the dump without using --disable-triggers or temporarily dropping the constraints.',
    'pg_dump: hint: Consider using a full dump instead of a --data-only dump to avoid this problem.'
  ]);
  function line(raw) {
    const text = raw.replace(/\r?\n$/, '');
    if (/^pg_dump: warning: there are circular foreign-key constraints (?:among these tables|on this table):$/.test(text)) {
      inCircularWarning = true;
      warnings.push(text);
    } else if (inCircularWarning && text.startsWith('pg_dump: detail: ')) {
      tables.add(text.slice('pg_dump: detail: '.length));
      warnings.push(text);
    } else if (inCircularWarning && hints.has(text)) {
      warnings.push(text);
    } else {
      inCircularWarning = false;
      writeStderr(raw);
    }
  }
  function consume(text) {
    pending += text;
    let end;
    while ((end = pending.indexOf('\n')) !== -1) {
      line(pending.slice(0, end + 1));
      pending = pending.slice(end + 1);
    }
  }
  return {
    write(chunk) { consume(decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))); },
    end() {
      consume(decoder.end());
      if (pending) line(pending);
      pending = '';
      return { circularForeignKeys: warnings.length > 0, tables: [...tables], messages: warnings };
    }
  };
}

// Supabase prepends this command before pg_dump output. Check the first line,
// not arbitrary table contents: a data row containing SQL is not protection.
async function hasReplicaRolePrologue(file) {
  const handle = await fs.open(file, 'r');
  try {
    const buffer = Buffer.alloc(256);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const firstLine = buffer.toString('utf8', 0, bytesRead).split('\n')[0].replace(/^\uFEFF/, '').trim();
    return /^SET\s+session_replication_role\s*=\s*(?:replica|'replica');$/i.test(firstLine);
  } finally {
    await handle.close();
  }
}

module.exports = { createPgDumpDiagnostics, hasReplicaRolePrologue };
