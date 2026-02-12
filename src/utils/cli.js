const { spawn } = require('child_process');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

/**
 * Detecta se um binário está disponível no PATH
 * @param {string} name - Nome do binário (ex: 'supabase', 'psql')
 * @returns {Promise<string|null>} - Caminho do binário ou null se não encontrado
 */
async function ensureBin(name) {
  try {
    const command = process.platform === 'win32' ? `where ${name}` : `which ${name}`;
    const { stdout } = await exec(command);
    const path = stdout.trim().split('\n')[0];
    return path || null;
  } catch {
    return null;
  }
}

/**
 * Executa um comando e retorna resultado estruturado
 * @param {string} cmd - Comando principal
 * @param {string[]} args - Argumentos do comando
 * @param {object} opts - Opções adicionais (cwd, env, etc.)
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
async function run(cmd, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...opts
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ code, stdout, stderr });
      } else {
        const error = new Error(`Comando falhou com código ${code}: ${cmd} ${args.join(' ')}`);
        error.code = code;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });

    child.on('error', (error) => {
      reject(new Error(`Erro ao executar comando: ${error.message}`));
    });
  });
}

/**
 * Executa um comando simples (string completa)
 * @param {string} command - Comando completo
 * @param {object} opts - Opções adicionais
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
async function runCommand(command, opts = {}) {
  try {
    const { stdout, stderr } = await exec(command, opts);
    return { code: 0, stdout, stderr };
  } catch (error) {
    return {
      code: error.code || 1,
      stdout: error.stdout || '',
      stderr: error.stderr || error.message
    };
  }
}

module.exports = {
  ensureBin,
  run,
  runCommand
};
