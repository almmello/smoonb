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
  } catch (error) {
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
  } catch (error) {
    return false;
  }
}

/**
 * Verifica se Supabase CLI está disponível
 * @returns {Promise<boolean>}
 */
async function detectSupabaseCLI() {
  try {
    // Tentar executar supabase --version
    await execAsync('supabase --version');
    return true;
  } catch (error) {
    return false;
  }
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
  canPerformCompleteBackup
};
