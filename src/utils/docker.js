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

module.exports = {
  detectDockerInstallation,
  detectDockerRunning,
  detectSupabaseCLI,
  detectDockerDependencies
};
