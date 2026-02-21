const chalk = require('chalk');
const { t } = require('../../i18n');
const ui = require('../../utils/cliUi');

const SUPPORTED_MAJORS_DEFAULT = [15, 17];
const SUPPORTED_MAJORS_ADVANCED = [16, 18];
const SUPPORTED_MAJORS_ALL = [...SUPPORTED_MAJORS_DEFAULT, ...SUPPORTED_MAJORS_ADVANCED];

/**
 * Parseia databaseUrl com URL() para suportar senhas com : e @ e querystring.
 * @param {string} databaseUrl - postgres:// ou postgresql://
 * @returns {{ username: string, password: string, host: string, port: string, database: string }|null}
 */
function parseDatabaseUrl(databaseUrl) {
  if (!databaseUrl || typeof databaseUrl !== 'string') return null;
  const normalized = databaseUrl.replace(/^postgres:\/\//i, 'postgresql://');
  try {
    const u = new URL(normalized);
    if (!/^postgresql$/i.test(u.protocol.replace(':', ''))) return null;
    const username = u.username ? decodeURIComponent(u.username) : '';
    const password = u.password ? decodeURIComponent(u.password) : '';
    const host = u.hostname || 'localhost';
    const port = u.port || '5432';
    const database = (u.pathname || '').replace(/^\//, '').split('?')[0].trim() || 'postgres';
    return { username, password, host, port, database };
  } catch {
    return null;
  }
}

function isPostgresMajorSupported(major, allowAdvanced = false) {
  const list = allowAdvanced ? SUPPORTED_MAJORS_ALL : SUPPORTED_MAJORS_DEFAULT;
  return Number.isInteger(major) && list.includes(major);
}

/**
 * Função para mostrar mensagens educativas e encerrar elegantemente
 * @param {string} reason - Motivo do bloqueio
 * @param {object} [data] - Dados extras (ex: { supabaseCliVersion } para supabase_cli_outdated)
 */
function showDockerMessagesAndExit(reason, data = {}) {
  const getT = global.smoonbI18n?.t || t;
  
  console.log('');
  
  switch (reason) {
    case 'docker_not_installed':
      console.log(chalk.red(`❌ ${getT('docker.notInstalled')}`));
      console.log('');
      console.log(chalk.yellow(`📋 ${getT('docker.instructions')}`));
      console.log(chalk.yellow(`   1. ${getT('docker.installDocker')}`));
      console.log(chalk.yellow(`   2. ${getT('docker.runDocker')}`));
      console.log(chalk.yellow(`   3. ${getT('docker.repeatCommand')}`));
      console.log('');
      console.log(chalk.blue(`🔗 ${getT('docker.download')}`));
      console.log('');
      ui.hint(`💡 ${getT('docker.requiredComponents')}`);
      break;

    case 'docker_not_running':
      console.log(chalk.red(`❌ ${getT('docker.notRunning')}`));
      console.log('');
      console.log(chalk.yellow(`📋 ${getT('docker.instructions')}`));
      console.log(chalk.yellow(`   1. ${getT('docker.runDocker')}`));
      console.log(chalk.yellow(`   2. ${getT('docker.waitInitialization')}`));
      console.log(chalk.yellow(`   3. ${getT('docker.repeatCommand')}`));
      console.log('');
      console.log(chalk.blue(`💡 ${getT('docker.tip')}`));
      console.log('');
      ui.hint(`💡 ${getT('docker.requiredComponents')}`);
      break;

    case 'supabase_cli_not_found':
      console.log(chalk.red(`❌ ${getT('supabase.cliNotFound')}`));
      console.log('');
      console.log(chalk.yellow(`📋 ${getT('supabase.installInstructions')}`));
      console.log(chalk.yellow(`   1. ${getT('supabase.installCli')}`));
      console.log(chalk.yellow(`   2. ${getT('supabase.repeatCommand')}`));
      console.log('');
      console.log(chalk.blue(`🔗 ${getT('supabase.installLink')}`));
      console.log('');
      ui.hint(`💡 ${getT('supabase.requiredComponents')}`);
      break;

    case 'supabase_cli_outdated':
      console.log(chalk.red(`❌ ${getT('supabase.cliOutdated', { version: data.supabaseCliVersion || '?', minVersion: data.supabaseCliMinVersion || '?', latest: data.supabaseCliLatest || '?' })}`));
      console.log('');
      console.log(chalk.yellow(`📋 ${getT('supabase.cliUpdateInstructions')}`));
      console.log(chalk.cyan(`   ${getT('supabase.cliUpdateCommandExamples')}`));
      console.log(chalk.cyan(`   ${getT('supabase.cliUpdateCommandGlobal')}`));
      console.log(chalk.cyan(`   ${getT('supabase.cliUpdateCommandLocal')}`));
      console.log('');
      ui.hint(`💡 ${getT('supabase.cliUpdateLink')}`);
      break;

    case 'supabase_cli_latest_unknown':
      console.log(chalk.red(`❌ ${getT('supabase.cliLatestUnknown')}`));
      console.log('');
      console.log(chalk.yellow(`📋 ${getT('supabase.cliLatestErrorLabel')}`));
      ui.hint(`   ${data.latestError || getT('supabase.cliLatestErrorUnknown')}`);
      console.log('');
      ui.hint(`💡 ${getT('supabase.cliUpdateLink')}`);
      break;
  }

  console.log('');
  console.log(chalk.red(`🚫 ${getT('docker.cancelled')}`));
  ui.hint(`   ${getT('docker.installComponents')}`);
  console.log('');
  
  process.exit(1);
}

module.exports = {
  showDockerMessagesAndExit,
  parseDatabaseUrl,
  SUPPORTED_MAJORS_DEFAULT,
  SUPPORTED_MAJORS_ADVANCED,
  SUPPORTED_MAJORS_ALL,
  isPostgresMajorSupported
};

