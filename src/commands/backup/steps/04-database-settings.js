const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const { execSync } = require('child_process');
const { t } = require('../../../i18n');
const { parseDatabaseUrl } = require('../utils');

/**
 * Etapa 4: Backup Database Extensions and Settings via SQL
 * Usa context.postgresMajor (fonte única).
 */
module.exports = async ({ databaseUrl, projectId, backupDir, postgresMajor }) => {
  try {
    const getT = global.smoonbI18n?.t || t;
    if (postgresMajor == null) {
      throw new Error(getT('backup.steps.postgresVersion.postgresMajorValidationFailed'));
    }
    console.log(chalk.white(`   - ${getT('backup.steps.databaseSettings.capturing')}`));

    const parsed = parseDatabaseUrl(databaseUrl);
    if (!parsed) {
      throw new Error(getT('error.databaseUrlInvalidSimple'));
    }
    const { username, password, host, port, database } = parsed;
    
    // Gerar nome do arquivo
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    const fileName = `database-settings-${day}-${month}-${year}@${hours}-${minutes}-${seconds}.json`;
    
    // Usar caminho absoluto igual às outras funções
    const backupDirAbs = path.resolve(backupDir);
    
    // Script SQL para capturar todas as configurações
    const sqlScript = `
-- Database Extensions and Settings Backup
-- Generated at: ${new Date().toISOString()}

-- 1. Capturar extensões instaladas
SELECT json_agg(
  json_build_object(
    'name', extname,
    'version', extversion,
    'schema', extnamespace::regnamespace
  )
) as extensions
FROM pg_extension;

-- 2. Capturar configurações PostgreSQL importantes
SELECT json_agg(
  json_build_object(
    'name', name,
    'setting', setting,
    'unit', unit,
    'context', context,
    'description', short_desc
  )
) as postgres_settings
FROM pg_settings 
WHERE name IN (
  'statement_timeout',
  'idle_in_transaction_session_timeout', 
  'lock_timeout',
  'shared_buffers',
  'work_mem',
  'maintenance_work_mem',
  'effective_cache_size',
  'max_connections',
  'log_statement',
  'log_min_duration_statement',
  'timezone',
  'log_timezone', 
  'default_transaction_isolation',
  'default_transaction_read_only',
  'checkpoint_completion_target',
  'wal_buffers',
  'max_wal_size',
  'min_wal_size'
);

-- 3. Capturar configurações específicas dos roles Supabase
SELECT json_agg(
  json_build_object(
    'role', rolname,
    'config', rolconfig
  )
) as role_configurations
FROM pg_roles 
WHERE rolname IN ('anon', 'authenticated', 'authenticator', 'postgres', 'service_role')
AND rolconfig IS NOT NULL;

-- 4. Capturar configurações de PGAudit (se existir)
SELECT json_agg(
  json_build_object(
    'role', rolname,
    'config', rolconfig
  )
) as pgaudit_configurations
FROM pg_roles 
WHERE rolconfig IS NOT NULL 
AND EXISTS (
  SELECT 1 FROM unnest(rolconfig) AS config 
  WHERE config LIKE '%pgaudit%'
);
`;

    // Salvar script SQL temporário
    const sqlFile = path.join(backupDir, 'temp_settings.sql');
    await fs.writeFile(sqlFile, sqlScript);
    
    // Executar via Docker (mesma major do step Postgres version)
    const postgresImage = `postgres:${postgresMajor}`;
    const dockerCmd = [
      'docker run --rm --network host',
      `-v "${backupDirAbs}:/host"`,
      `-e PGPASSWORD="${password}"`,
      `${postgresImage} psql`,
      `-h ${host}`,
      `-p ${port}`,
      `-U ${username}`,
      `-d ${database}`,
      '-f /host/temp_settings.sql',
      '-t', // Tuples only
      '-A'  // Unaligned output
    ].join(' ');
    
    console.log(chalk.white(`   - ${getT('backup.steps.databaseSettings.executing')}`));
    const output = execSync(dockerCmd, { stdio: 'pipe', encoding: 'utf8' });
    
    // Processar output e criar JSON estruturado
    const lines = output.trim().split('\n').filter(line => line.trim());
    
    const result = {
      database_settings: {
        note: "Configurações específicas do database Supabase capturadas via SQL",
        captured_at: new Date().toISOString(),
        project_id: projectId,
        extensions: lines[0] ? JSON.parse(lines[0]) : [],
        postgres_settings: lines[1] ? JSON.parse(lines[1]) : [],
        role_configurations: lines[2] ? JSON.parse(lines[2]) : [],
        pgaudit_configurations: lines[3] ? JSON.parse(lines[3]) : [],
        restore_instructions: {
          note: "Estas configurações precisam ser aplicadas manualmente após a restauração do database",
          steps: [
            "1. Restaurar o database usando o arquivo .backup.gz",
            "2. Aplicar configurações de Postgres via SQL:",
            "   ALTER DATABASE postgres SET setting_name TO 'value';",
            "3. Aplicar configurações de roles via SQL:",
            "   ALTER ROLE role_name SET setting_name TO 'value';",
            "4. Habilitar extensões necessárias via Dashboard ou SQL:",
            "   CREATE EXTENSION IF NOT EXISTS extension_name;",
            "5. Verificar configurações aplicadas:",
            "   SELECT name, setting FROM pg_settings WHERE name IN (...);"
          ]
        }
      }
    };
    
    // Salvar arquivo JSON
    const jsonFile = path.join(backupDir, fileName);
    await fs.writeFile(jsonFile, JSON.stringify(result, null, 2));
    
    // Limpar arquivo temporário
    await fs.unlink(sqlFile);
    
    const stats = await fs.stat(jsonFile);
    const sizeKB = (stats.size / 1024).toFixed(1);
    
    console.log(chalk.green(`     ✅ Database Settings: ${fileName} (${sizeKB} KB)`));
    
    return { success: true, size: sizeKB, fileName: fileName };
  } catch (error) {
    const getT = global.smoonbI18n?.t || t;
    console.log(chalk.yellow(`     ⚠️ ${getT('backup.steps.databaseSettings.error', { message: error.message })}`));
    return { success: false };
  }
};

