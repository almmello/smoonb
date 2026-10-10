const fs = require('fs');
const path = require('path');
const { runSql, ident, literal } = require('../pg');
module.exports = async ({ backupPath, targetProject, postgresMajor = 17 }) => {
  const file = fs
    .readdirSync(backupPath)
    .find((f) => f.startsWith('database-settings-') && f.endsWith('.json'));
  if (!file) throw new Error('Database settings missing from backup');
  const data = JSON.parse(fs.readFileSync(path.join(backupPath, file), 'utf8'));
  const settings = data.database_settings || data;
  const query = async (sql) =>
    JSON.parse(
      await runSql(targetProject.targetDatabaseUrl, sql, { postgresMajor }),
    );
  const actual = await query(
    "SELECT json_build_object('settings',(SELECT json_object_agg(name,setting) FROM pg_settings),'roles',(SELECT json_object_agg(rolname,rolconfig) FROM pg_roles),'extensions',(SELECT json_object_agg(extname,extversion) FROM pg_extension));",
  );
  const commands = [],
    pending = [];
  for (const ext of settings.extensions || []) {
    if (!actual.extensions[ext.name])
      commands.push(
        `CREATE EXTENSION IF NOT EXISTS ${ident(ext.name)} WITH SCHEMA ${ident(ext.schema)};`,
      );
  }
  for (const item of settings.postgres_settings || []) {
    if (actual.settings[item.name] === item.setting) continue;
    if (!['user', 'superuser'].includes(item.context)) {
      pending.push(item.name);
      continue;
    }
    const value =
      item.unit && Number(item.setting) >= 0
        ? `${Number(item.setting) * (item.unit === '8kB' ? 8 : 1)}${item.unit === '8kB' ? 'kB' : item.unit}`
        : item.setting;
    commands.push(
      `ALTER DATABASE ${ident(new URL(targetProject.targetDatabaseUrl).pathname.slice(1) || 'postgres')} SET ${ident(item.name)} TO ${literal(value)};`,
    );
  }
  for (const role of [
    ...(settings.role_configurations || []),
    ...(settings.pgaudit_configurations || []),
  ]) {
    for (const config of role.config || []) {
      if ((actual.roles[role.role] || []).includes(config)) continue;
      const eq = config.indexOf('=');
      commands.push(
        `ALTER ROLE ${ident(role.role)} SET ${ident(config.slice(0, eq))} TO ${literal(config.slice(eq + 1))};`,
      );
    }
  }
  if (pending.length)
    throw new Error(
      `Database platform settings require compatible destination configuration: ${pending.join(', ')}`,
    );
  if (commands.length)
    await runSql(
      targetProject.targetDatabaseUrl,
      'BEGIN;\n' + commands.join('\n') + '\nCOMMIT;',
      { postgresMajor },
    );
  const after = await query(
    "SELECT json_build_object('settings',(SELECT json_object_agg(name,setting) FROM pg_settings),'roles',(SELECT json_object_agg(rolname,rolconfig) FROM pg_roles),'extensions',(SELECT json_object_agg(extname,extversion) FROM pg_extension));",
  );
  const differences = (settings.postgres_settings || [])
    .filter((s) => after.settings[s.name] !== s.setting)
    .map((s) => s.name);
  for (const role of settings.role_configurations || [])
    if (
      (role.config || []).some(
        (c) => !(after.roles[role.role] || []).includes(c),
      )
    )
      differences.push(`role:${role.role}`);
  for (const ext of settings.extensions || [])
    if (!after.extensions[ext.name]) differences.push(`extension:${ext.name}`);
  if (differences.length)
    throw new Error(
      `Database settings verification failed: ${differences.join(', ')}`,
    );
  return {
    success: true,
    verified: true,
    extensions_count: (settings.extensions || []).length,
    settings_count: (settings.postgres_settings || []).length,
  };
};
