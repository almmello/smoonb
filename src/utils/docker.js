const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Detecta se Docker Desktop está instalado no sistema
 * @returns {Promise<{installed: boolean, running: boolean}>}
 */
async function detectDockerInstallation() {
  try {
    // Tentar executar docker --version
    await execAsync('docker --version');
    return { installed: true, running: false }; // Instalado mas não sabemos se está rodando
  } catch {
    return { installed: false, running: false };
  }
}

/**
 * Verifica se Docker está rodando e acessível
 * @returns {Promise<boolean>}
 */
async function detectDockerRunning() {
  try {
    // Tentar executar docker ps
    await execAsync('docker ps');
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifica se Supabase CLI está disponível
 * @returns {Promise<boolean>}
 */
async function detectSupabaseCLI() {
  try {
    await execAsync('supabase --version');
    return true;
  } catch {
    return false;
  }
}

/**
 * Obtém a versão instalada do Supabase CLI (ex: "2.51.0").
 * @returns {Promise<string|null>} Semver ou null se não disponível
 */
async function getSupabaseCLIVersion() {
  try {
    const { stdout } = await execAsync('supabase --version');
    const match = stdout.match(/(\d+)\.(\d+)\.(\d+)/);
    return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
  } catch {
    return null;
  }
}

/**
 * Obtém a versão latest do Supabase CLI no npm.
 * @returns {Promise<{version: string|null, error: string|null}>} version ou error preenchido
 */
async function getSupabaseCLILatestVersion() {
  try {
    const res = await fetch('https://registry.npmjs.org/supabase/latest', {
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) {
      return { version: null, error: `HTTP ${res.status} ${res.statusText}` };
    }
    const data = await res.json();
    const version = data.version || null;
    if (!version) {
      return { version: null, error: 'Resposta do registro npm sem campo version' };
    }
    return { version, error: null };
  } catch (err) {
    const message = err && typeof err.message === 'string' ? err.message : String(err);
    return { version: null, error: message };
  }
}

/**
 * Compara duas versões semver (ex: "2.51.0", "2.72.7").
 * @param {string} a
 * @param {string} b
 * @returns {number} -1 se a < b, 0 se a === b, 1 se a > b
 */
function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

/**
 * Detecta Docker Desktop completo com versão
 * @returns {Promise<{installed: boolean, running: boolean, version: string}>}
 */
async function detectDockerDesktop() {
  try {
    // Verificar se Docker está instalado
    await execAsync('docker --version');
    
    // Verificar se Docker está rodando
    await execAsync('docker ps');
    
    return { 
      installed: true, 
      running: true,
      version: await getDockerVersion()
    };
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('not recognized')) {
      return { installed: false, running: false, version: 'Unknown' };
    } else {
      return { installed: true, running: false, version: await getDockerVersion() };
    }
  }
}

/**
 * Obtém a versão do Docker
 * @returns {Promise<string>}
 */
async function getDockerVersion() {
  try {
    const { stdout } = await execAsync('docker --version');
    return stdout.trim();
  } catch {
    return 'Unknown';
  }
}

/**
 * Função principal para detectar todas as dependências do Docker
 * @returns {Promise<{dockerInstalled: boolean, dockerRunning: boolean, supabaseCLI: boolean}>}
 */
async function detectDockerDependencies() {
  console.log('🔍 Verificando dependências para backup de Edge Functions...');
  
  const dockerInstalled = await detectDockerInstallation();
  const dockerRunning = dockerInstalled.installed ? await detectDockerRunning() : false;
  const supabaseCLI = await detectSupabaseCLI();
  
  return {
    dockerInstalled: dockerInstalled.installed,
    dockerRunning,
    supabaseCLI
  };
}

/**
 * Detecta se é possível fazer backup completo via Docker
 * @returns {Promise<{canBackupComplete: boolean, reason?: string, dockerStatus: any}>}
 */
async function canPerformCompleteBackup() {
  const dockerStatus = await detectDockerDesktop();
  
  if (!dockerStatus.installed) {
    return {
      canBackupComplete: false,
      reason: 'docker_not_installed',
      dockerStatus
    };
  }
  
  if (!dockerStatus.running) {
    return {
      canBackupComplete: false,
      reason: 'docker_not_running',
      dockerStatus
    };
  }
  
  const supabaseCLI = await detectSupabaseCLI();
  if (!supabaseCLI) {
    return {
      canBackupComplete: false,
      reason: 'supabase_cli_not_found',
      dockerStatus
    };
  }

  const supabaseCliVersion = await getSupabaseCLIVersion();
  const latestResult = await getSupabaseCLILatestVersion();
  if (latestResult.error) {
    return {
      canBackupComplete: false,
      reason: 'supabase_cli_latest_unknown',
      latestError: latestResult.error,
      supabaseCliVersion: supabaseCliVersion || null,
      dockerStatus
    };
  }
  if (supabaseCliVersion && latestResult.version && compareSemver(supabaseCliVersion, latestResult.version) < 0) {
    return {
      canBackupComplete: false,
      reason: 'supabase_cli_outdated',
      supabaseCliVersion,
      supabaseCliLatest: latestResult.version,
      dockerStatus
    };
  }
  
  return {
    canBackupComplete: true,
    dockerStatus
  };
}

module.exports = {
  detectDockerInstallation,
  detectDockerRunning,
  detectSupabaseCLI,
  detectDockerDependencies,
  detectDockerDesktop,
  getDockerVersion,
  getSupabaseCLIVersion,
  getSupabaseCLILatestVersion,
  compareSemver,
  canPerformCompleteBackup
};
