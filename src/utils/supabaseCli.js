const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// npm installs a .cmd shim on Windows; execFile cannot execute that shim safely.
// Resolve its package entry point instead of interpolating arguments into cmd.exe.
function runSupabase(_command, args, options = {}) {
  if (process.platform !== 'win32')
    return execFileSync('supabase', args, options);
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    const executable = path.join(directory, 'supabase.exe');
    if (fs.existsSync(executable))
      return execFileSync(executable, args, options);
    for (const root of [
      path.join(directory, 'node_modules', 'supabase'),
      path.resolve(directory, '..', 'supabase'),
    ]) {
      const file = path.join(root, 'package.json');
      if (!fs.existsSync(file)) continue;
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
      const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.supabase;
      if (!bin) continue;
      const entry = path.resolve(root, bin);
      if (!fs.existsSync(entry)) continue;
      if (entry.endsWith('.js'))
        return execFileSync(process.execPath, [entry, ...args], options);
      return execFileSync(entry, args, options);
    }
  }
  throw new Error('Supabase CLI executable was not found in PATH');
}
module.exports = { runSupabase };
