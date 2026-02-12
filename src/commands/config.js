const chalk = require('chalk');
const fs = require('fs').promises;
const path = require('path');
const { showBetaBanner } = require('../utils/banner');
const { t } = require('../i18n');
const ui = require('../utils/cliUi');

// Exportar FUNÇÃO em vez de objeto Command
module.exports = async (options) => {
  showBetaBanner();
  
  const getT = global.smoonbI18n?.t || t;
  console.log(chalk.cyan.bold(`⚙️  ${getT('config.title')}\n`));

  try {
    const configPath = path.join(process.cwd(), '.smoonbrc');

    if (options.init) {
      await initializeConfig(configPath);
    } else if (options.show) {
      await showConfig(configPath);
    } else {
      console.log(chalk.yellow(`💡 ${getT('config.options')}`));
      ui.hint(`  ${getT('config.initOption')}`);
      ui.hint(`  ${getT('config.showOption')}`);
    }

  } catch (error) {
    const getT = global.smoonbI18n?.t || t;
    console.error(chalk.red(`❌ ${getT('config.error')}`), error.message);
    process.exit(1);
  }
};

// Inicializar configuração
async function initializeConfig(configPath) {
  const getT = global.smoonbI18n?.t || t;
  console.log(chalk.blue(`🔧 ${getT('config.init')}`));

  const defaultConfig = {
    supabase: {
      projectId: 'your-project-id-here',
      url: 'https://your-project-id.supabase.co',
      serviceKey: 'your-service-key-here',
      anonKey: 'your-anon-key-here',
      databaseUrl: 'postgresql://postgres:[password]@db.your-project-id.supabase.co:5432/postgres',
      accessToken: 'your-personal-access-token-here'
    },
    backup: {
      includeFunctions: true,
      includeStorage: true,
      includeAuth: true,
      includeRealtime: true,
      outputDir: './backups'
    },
    restore: {
      cleanRestore: true,
      verifyAfterRestore: true
    }
  };

  try {
    const getT = global.smoonbI18n?.t || t;
    await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(chalk.green(`✅ ${getT('config.fileCreated', { path: '.smoonbrc' })}`));
    console.log(chalk.yellow('\n📝 Próximos passos:'));
    ui.hint('  1. Edite .smoonbrc com suas credenciais Supabase');
    ui.hint('  2. Substitua os valores placeholder pelos reais');
    ui.hint('  3. Execute: npx smoonb backup');
  } catch (error) {
    const getT = global.smoonbI18n?.t || t;
    throw new Error(`${getT('config.error')}: ${error.message}`);
  }
}

// Mostrar configuração atual
async function showConfig(configPath) {
  const getT = global.smoonbI18n?.t || t;
  console.log(chalk.blue(`📋 ${getT('config.show')}`));

  try {
    const configContent = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configContent);

    console.log(chalk.green('✅ Arquivo de configuração encontrado'));
    ui.hint(`   - Localização: ${configPath}`);
    
    if (config.supabase?.projectId && config.supabase.projectId !== 'your-project-id-here') {
      ui.hint(`   - Project ID: ${config.supabase.projectId}`);
    } else {
      console.log(chalk.yellow('   - Project ID: Não configurado'));
    }
    
    if (config.supabase?.url && config.supabase.url !== 'https://your-project-id.supabase.co') {
      ui.hint(`   - Supabase URL: ${config.supabase.url}`);
    } else {
      console.log(chalk.yellow('   - Supabase URL: Não configurado'));
    }
    
    if (config.supabase?.serviceKey && config.supabase.serviceKey !== 'your-service-key-here') {
      ui.hint('   - Service Key: Configurada');
    } else {
      console.log(chalk.yellow('   - Service Key: Não configurada'));
    }
    
    if (config.supabase?.anonKey && config.supabase.anonKey !== 'your-anon-key-here') {
      ui.hint('   - Anon Key: Configurada');
    } else {
      console.log(chalk.yellow('   - Anon Key: Não configurada'));
    }
    
    if (config.supabase?.databaseUrl && !config.supabase.databaseUrl.includes('[password]')) {
      ui.hint('   - Database URL: Configurada');
    } else {
      console.log(chalk.yellow('   - Database URL: Não configurada'));
    }
    
    if (config.supabase?.accessToken && config.supabase.accessToken !== 'your-personal-access-token-here') {
      ui.hint('   - Access Token: Configurado');
    } else {
      console.log(chalk.yellow('   - Access Token: Não configurado (obrigatório para Management API)'));
    }

    console.log(chalk.blue('\n📊 Configurações de backup:'));
    ui.hint(`   - Output Dir: ${config.backup?.outputDir || './backups'}`);
    ui.hint(`   - Include Functions: ${config.backup?.includeFunctions || true}`);
    ui.hint(`   - Include Storage: ${config.backup?.includeStorage || true}`);
    ui.hint(`   - Include Auth: ${config.backup?.includeAuth || true}`);
    ui.hint(`   - Include Realtime: ${config.backup?.includeRealtime || true}`);

    console.log(chalk.blue('\n🔄 Configurações de restore:'));
    ui.hint(`   - Clean Restore: ${config.restore?.cleanRestore || true}`);
    ui.hint(`   - Verify After Restore: ${config.restore?.verifyAfterRestore || true}`);

  } catch (error) {
    const getT = global.smoonbI18n?.t || t;
    if (error.code === 'ENOENT') {
      console.log(chalk.yellow(`⚠️  ${getT('config.fileNotFound', { path: configPath })}`));
      ui.hint('   - Use: npx smoonb config --init');
    } else {
      throw new Error(`${getT('config.error')}: ${error.message}`);
    }
  }
}