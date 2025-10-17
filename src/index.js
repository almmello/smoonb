/**
 * smoonb - Complete Supabase backup and migration tool
 * Entry point principal e exports dos módulos
 * 
 * Versão: 0.1.0-beta (FREE BETA PERIOD)
 */

const chalk = require('chalk');

// Exportar comandos
const backupCommand = require('./commands/backup');
const restoreCommand = require('./commands/restore');
const secretsCommand = require('./commands/secrets');
const functionsCommand = require('./commands/functions');
const checkCommand = require('./commands/check');
const configCommand = require('./commands/config');

// Exportar utilitários
const supabaseUtils = require('./utils/supabase');
const validationUtils = require('./utils/validation');

/**
 * Informações do pacote
 */
const packageInfo = {
  name: 'smoonb',
  version: '0.0.1',
  description: 'Complete Supabase backup and migration tool - EXPERIMENTAL VERSION - USE AT YOUR OWN RISK',
  author: 'Goalmoon Tecnologia LTDA <https://goalmoon.com>',
  license: 'SEE LICENSE IN LICENSE.md'
};

/**
 * Banner da versão experimental
 */
function showBetaBanner() {
  console.log(chalk.red.bold(`
╔══════════════════════════════════════════════════════════════╗
║                    🚀 smoonb v0.0.1                        ║
║                                                              ║
║              ⚠️  EXPERIMENTAL VERSION - NÃO TESTADA!        ║
║                                                              ║
║  🚨 AVISO: Este software NUNCA foi testado em produção!     ║
║  ⚠️  USE POR SUA CONTA E RISCO - Pode causar perda de dados ║
║  ❌ NÃO NOS RESPONSABILIZAMOS por qualquer perda de dados   ║
║                                                              ║
║  A primeira ferramenta CLI completa para backup e migração  ║
║  de projetos Supabase. Resolve o problema de backup        ║
║  incompleto das ferramentas existentes.                     ║
║                                                              ║
║  ✅ Database PostgreSQL + Edge Functions + Auth Settings     ║
║  ✅ Storage Objects + Realtime Settings + Metadados          ║
║                                                              ║
║  🏢 Desenvolvido por: Goalmoon Tecnologia LTDA              ║
║  🌐 Website: https://goalmoon.com                           ║
║  📖 Documentação: https://github.com/almmello/smoonb       ║
║  🐛 Issues: https://github.com/almmello/smoonb/issues      ║
╚══════════════════════════════════════════════════════════════╝
`));
}

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
  console.log(chalk.cyan.bold(`
🚀 COMANDOS PRINCIPAIS:

📊 Backup completo:
   smoonb backup                    # Usa projectId da configuração
   smoonb backup --project-id <id>  # Especifica projectId

🔄 Restauração completa:
   smoonb restore --backup-dir <dir>                    # Usa projectId da configuração
   smoonb restore --project-id <id> --backup-dir <dir>  # Especifica projectId

🔐 Gerenciamento de secrets:
   smoonb secrets export
   smoonb secrets import

⚡ Edge Functions:
   smoonb functions push
   smoonb functions list

🔍 Verificação pós-restore:
   smoonb check                    # Usa projectId da configuração
   smoonb check --project-id <id>  # Especifica projectId

⚙️  Configuração:
   smoonb config --init           # Criar arquivo de configuração
   smoonb config --show           # Mostrar configuração atual

📋 CONFIGURAÇÃO AUTOMÁTICA:
   smoonb config --init           # Cria ~/.smoonbrc com projectId, URLs, etc.
   # Edite o arquivo com suas credenciais Supabase
   smoonb backup                  # Funciona sem --project-id!

📝 EXEMPLO DE CONFIGURAÇÃO (.smoonbrc):
   {
     "supabase": {
       "projectId": "abc123def456",
       "url": "https://abc123def456.supabase.co",
       "serviceKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
       "anonKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
       "databaseUrl": "postgresql://postgres:[senha]@db.abc123def456.supabase.co:5432/postgres"
     }
   }

🔧 COMO CONFIGURAR:
   1. smoonb config --init
   2. Edite ~/.smoonbrc com suas credenciais
   3. smoonb backup (funciona automaticamente!)
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
  } catch (error) {
    prerequisites.npm = { installed: false, version: null };
  }

  // Verificar Supabase CLI
  try {
    const { execSync } = require('child_process');
    const supabaseVersion = execSync('supabase --version', { encoding: 'utf8' }).trim();
    prerequisites.supabase_cli = { installed: true, version: supabaseVersion };
  } catch (error) {
    prerequisites.supabase_cli = { installed: false, version: null };
  }

  // Verificar pg_dump
  try {
    const { execSync } = require('child_process');
    const pgDumpVersion = execSync('pg_dump --version', { encoding: 'utf8' }).trim();
    prerequisites.pg_dump = { installed: true, version: pgDumpVersion };
  } catch (error) {
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
    console.log(chalk.gray(`   - Localização: ${require('os').homedir()}/.smoonbrc`));
    
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
    console.log(chalk.gray('   - Use: smoonb config --init'));
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
    secrets: secretsCommand,
    functions: functionsCommand,
    check: checkCommand,
    config: configCommand
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
