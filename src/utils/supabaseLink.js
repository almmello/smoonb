const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const { execSync } = require('child_process');
const { t } = require('../i18n');

/**
 * Extrai a senha da URL de conexão PostgreSQL
 * @param {string} dbUrl - URL completa (postgresql://user:password@host:port/db)
 * @returns {string} - Senha extraída
 */
function extractPasswordFromDbUrl(dbUrl) {
  const { t } = require('../i18n');
  const getT = global.smoonbI18n?.t || t;
  const urlMatch = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (!urlMatch) {
    throw new Error(getT('error.databaseUrlInvalidSimple'));
  }
  const [, , password] = urlMatch;
  return password;
}

/**
 * Garante que o projeto está corretamente linkado, removendo .temp e refazendo o link
 * @param {string} projectRef - ID do projeto Supabase
 * @param {string} accessToken - Token de acesso Supabase
 * @param {string} dbPassword - Senha do banco de dados
 * @returns {Promise<void>}
 */
async function ensureCleanLink(projectRef, accessToken, dbPassword) {
  const getT = global.smoonbI18n?.t || t;
  const tempDir = path.join(process.cwd(), 'supabase', '.temp');
  
  // Remover supabase/.temp completamente
  console.log(chalk.white(`   - ${getT('utils.supabaseLink.linking', { projectId: projectRef })}`));
  
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // Ignorar erro se não existir
  }
  
  // Executar supabase link com env local (não modificar process.env global)
  const env = {
    ...process.env,
    SUPABASE_ACCESS_TOKEN: accessToken
  };
  
  try {
    execSync(`supabase link --project-ref ${projectRef} --password ${dbPassword}`, {
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: 15000,
      env
    });
  } catch (error) {
    throw new Error(getT('utils.supabaseLink.linkFailed', { projectId: projectRef, message: error.message }));
  }
  
  // Validar: ler supabase/.temp/project-ref e verificar se == projectRef
  const projectRefFile = path.join(tempDir, 'project-ref');
  try {
    const linkedRef = await fs.readFile(projectRefFile, 'utf8');
    const linkedRefTrimmed = linkedRef.trim();
    
    if (linkedRefTrimmed !== projectRef) {
      throw new Error(getT('utils.supabaseLink.validationFailed', { linkedRef: linkedRefTrimmed, expected: projectRef }));
    }
    
    console.log(chalk.white(`   - ${getT('utils.supabaseLink.validation', { linkedRef: linkedRefTrimmed, expected: projectRef })}`));
  } catch (error) {
    if (error.message.includes('Validation failed') || error.message.includes('Validação falhou')) {
      throw error;
    }
    throw new Error(getT('utils.supabaseLink.cannotValidate', { message: error.message }));
  }
}

module.exports = {
  extractPasswordFromDbUrl,
  ensureCleanLink
};

