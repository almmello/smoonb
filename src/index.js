/**
 * smoonb - Complete Supabase backup and migration tool
 * Entry point principal e exports dos módulos
 * 
 * Versão: 0.1.0-beta (FREE BETA PERIOD)
 */

const chalk = require('chalk');
const path = require('path');
const { showBetaBanner } = require('./utils/banner');
const { t } = require('./i18n');

// Exportar comandos
const backupCommand = require('./commands/backup');
const restoreCommand = require('./commands/restore');
const checkCommand = require('./commands/check');
const importCommand = require('./commands/import');

// Exportar utilitários
const supabaseUtils = require('./utils/supabase');
const validationUtils = require('./utils/validation');

/**
 * Informações do pacote
 */
const packageInfo = {
  name: 'smoonb',
  description: 'Complete Supabase backup and migration tool - EXPERIMENTAL VERSION - USE AT YOUR OWN RISK',
  author: 'Goalmoon Tecnologia LTDA <https://goalmoon.com>',
  license: 'SEE LICENSE IN LICENSE.md'
};

/**
 * Informações de licenciamento
 */
function showLicenseInfo() {
  console.log(chalk.yellow.bold(`
📋 INFORMAÇÕES DE LICENCIAMENTO:

🆓 VERSÃO EXPERIMENTAL GRATUITA (Versões 0.x.x):
   ✅ Uso gratuito para projetos pessoais e comerciais
   ✅ Sem restrições de funcionalidades
   ❌ SEM SUPORTE - apenas aceitamos contribuições
   ⚠️ USE POR SUA CONTA E RISCO - software não testado

💼 LICENÇA COMERCIAL (Versões 1.0.0+):
   ⚠️  A partir da versão 1.0.0, o smoonb será licenciado comercialmente
   📧 Aviso prévio: Mudanças serão anunciadas 90 dias antes
   💰 Desconto especial: Usuários experimentais terão condições preferenciais

🏢 DESENVOLVIDO POR: Goalmoon Tecnologia LTDA
🌐 Website: https://goalmoon.com

📖 Leia a licença completa em: LICENSE.md
`));
}

/**
 * Informações de ajuda rápida
 */
function showQuickHelp() {
  const getT = global.smoonbI18n?.t || t;
  console.log(chalk.cyan.bold(`
🚀 ${getT('quickHelp.title')}

📊 ${getT('quickHelp.backupTitle')}
   ${getT('quickHelp.backupDesc')}

🔄 ${getT('quickHelp.restoreTitle')}
   ${getT('quickHelp.restoreDesc')}

🔍 ${getT('quickHelp.checkTitle')}
   ${getT('quickHelp.checkDesc')}

📋 ${getT('quickHelp.configuration')}
   ${getT('quickHelp.configurationDesc')}

🔑 ${getT('quickHelp.tokenTitle')}
   ${getT('quickHelp.tokenDesc')}
   ${getT('quickHelp.tokenStep1')}
   ${getT('quickHelp.tokenStep2')}
   ${getT('quickHelp.tokenStep3')}
   ${getT('quickHelp.tokenStep4')}

🔄 ${getT('quickHelp.update')}
   ${getT('quickHelp.updateCommand')}
`));
}

/**
 * Verificar pré-requisitos
 */
function checkPrerequisites() {
  const prerequisites = {
    node: { installed: true, version: process.version },
    npm: { installed: false, version: null },
    supabase_cli: { installed: false, version: null },
    pg_dump: { installed: false, version: null }
  };

  // Verificar npm
  try {
    const { execSync } = require('child_process');
    const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    prerequisites.npm = { installed: true, version: npmVersion };
  } catch {
    prerequisites.npm = { installed: false, version: null };
  }

  // Verificar Supabase CLI
  try {
    const { execSync } = require('child_process');
    const supabaseVersion = execSync('supabase --version', { encoding: 'utf8' }).trim();
    prerequisites.supabase_cli = { installed: true, version: supabaseVersion };
  } catch {
    prerequisites.supabase_cli = { installed: false, version: null };
  }

  // Verificar pg_dump
  try {
    const { execSync } = require('child_process');
    const pgDumpVersion = execSync('pg_dump --version', { encoding: 'utf8' }).trim();
    prerequisites.pg_dump = { installed: true, version: pgDumpVersion };
  } catch {
    prerequisites.pg_dump = { installed: false, version: null };
  }

  return prerequisites;
}

/**
 * Mostrar status dos pré-requisitos
 */
function showPrerequisitesStatus() {
  const prerequisites = checkPrerequisites();
  
  console.log(chalk.blue.bold('\n📋 Status dos Pré-requisitos:\n'));
  
  Object.entries(prerequisites).forEach(([name, info]) => {
    const icon = info.installed ? '✅' : '❌';
    const status = info.installed ? chalk.green('Instalado') : chalk.red('Não instalado');
    const version = info.version ? chalk.gray(`(${info.version})`) : '';
    
    console.log(`  ${icon} ${chalk.cyan(name)}: ${status} ${version}`);
  });

  // Mostrar instruções para instalar dependências faltantes
  const missing = Object.entries(prerequisites)
    .filter(([_, info]) => !info.installed)
    .map(([name, _]) => name);

  if (missing.length > 0) {
    console.log(chalk.yellow.bold('\n💡 Instruções de instalação:'));
    
    if (missing.includes('supabase_cli')) {
      console.log(chalk.gray('  - Supabase CLI: npm install -g supabase'));
    }
    
    if (missing.includes('pg_dump')) {
      console.log(chalk.gray('  - PostgreSQL: https://www.postgresql.org/download/'));
    }
  }
}

/**
 * Verificar configuração atual
 */
function checkCurrentConfig() {
  const config = supabaseUtils.loadConfig();
  const hasCredentials = supabaseUtils.hasCredentials();
  
  console.log(chalk.blue.bold('\n⚙️  Configuração Atual:\n'));
  
  if (config) {
    console.log(chalk.green('✅ Arquivo de configuração encontrado'));
    console.log(chalk.gray(`   - Localização: ${path.join(process.cwd(), '.env.local')}`));
    
    if (config.supabase?.url) {
      console.log(chalk.gray(`   - Supabase URL: ${config.supabase.url}`));
    }
    
    if (config.supabase?.serviceKey) {
      console.log(chalk.gray('   - Service Key: Configurada'));
    }
    
    if (config.supabase?.anonKey) {
      console.log(chalk.gray('   - Anon Key: Configurada'));
    }
  } else {
    console.log(chalk.yellow('⚠️  Arquivo de configuração não encontrado'));
    console.log(chalk.gray('   - Configure o arquivo .env.local na raiz do projeto'));
  }
  
  if (hasCredentials) {
    console.log(chalk.green('✅ Credenciais configuradas'));
  } else {
    console.log(chalk.yellow('⚠️  Credenciais não configuradas'));
    console.log(chalk.gray('   - Configure SUPABASE_URL e SUPABASE_ANON_KEY'));
  }
}

/**
 * Informações de diagnóstico completo
 */
function showDiagnostics() {
  showBetaBanner();
  showPrerequisitesStatus();
  checkCurrentConfig();
  showLicenseInfo();
}

/**
 * Exportar todos os módulos
 */
module.exports = {
  // Informações do pacote
  packageInfo,
  
  // Comandos
  commands: {
    backup: backupCommand,
    restore: restoreCommand,
    check: checkCommand,
    import: importCommand
  },
  
  // Utilitários
  utils: {
    supabase: supabaseUtils,
    validation: validationUtils
  },
  
  // Funções de utilidade
  showBetaBanner,
  showLicenseInfo,
  showQuickHelp,
  checkPrerequisites,
  showPrerequisitesStatus,
  checkCurrentConfig,
  showDiagnostics
};
