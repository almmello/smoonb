const chalk = require('chalk');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { showBetaBanner } = require('../index');

// Exportar FUNÇÃO em vez de objeto Command
module.exports = async (options) => {
  showBetaBanner();
  
  console.log(chalk.cyan.bold('⚙️  Configuração do smoonb...\n'));

  try {
    const configPath = path.join(process.cwd(), '.smoonbrc');

    if (options.init) {
      await initializeConfig(configPath);
    } else if (options.show) {
      await showConfig(configPath);
    } else {
      console.log(chalk.yellow('💡 Opções disponíveis:'));
      console.log(chalk.gray('  --init    Inicializar configuração'));
      console.log(chalk.gray('  --show    Mostrar configuração atual'));
    }

  } catch (error) {
    console.error(chalk.red('❌ Erro na configuração:'), error.message);
    process.exit(1);
  }
};

// Inicializar configuração
async function initializeConfig(configPath) {
  console.log(chalk.blue('🔧 Inicializando configuração...'));

  const defaultConfig = {
    supabase: {
      projectId: 'your-project-id-here',
      url: 'https://your-project-id.supabase.co',
      serviceKey: 'your-service-key-here',
      anonKey: 'your-anon-key-here',
      databaseUrl: 'postgresql://postgres:[password]@db.your-project-id.supabase.co:5432/postgres'
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
    await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(chalk.green('✅ Arquivo de configuração criado: .smoonbrc'));
    console.log(chalk.yellow('\n📝 Próximos passos:'));
    console.log(chalk.gray('  1. Edite .smoonbrc com suas credenciais Supabase'));
    console.log(chalk.gray('  2. Substitua os valores placeholder pelos reais'));
    console.log(chalk.gray('  3. Execute: npx smoonb backup'));
  } catch (error) {
    throw new Error(`Falha ao criar arquivo de configuração: ${error.message}`);
  }
}

// Mostrar configuração atual
async function showConfig(configPath) {
  console.log(chalk.blue('📋 Configuração atual:'));

  try {
    const configContent = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configContent);

    console.log(chalk.green('✅ Arquivo de configuração encontrado'));
    console.log(chalk.gray(`   - Localização: ${configPath}`));
    
    if (config.supabase?.projectId && config.supabase.projectId !== 'your-project-id-here') {
      console.log(chalk.gray(`   - Project ID: ${config.supabase.projectId}`));
    } else {
      console.log(chalk.yellow('   - Project ID: Não configurado'));
    }
    
    if (config.supabase?.url && config.supabase.url !== 'https://your-project-id.supabase.co') {
      console.log(chalk.gray(`   - Supabase URL: ${config.supabase.url}`));
    } else {
      console.log(chalk.yellow('   - Supabase URL: Não configurado'));
    }
    
    if (config.supabase?.serviceKey && config.supabase.serviceKey !== 'your-service-key-here') {
      console.log(chalk.gray('   - Service Key: Configurada'));
    } else {
      console.log(chalk.yellow('   - Service Key: Não configurada'));
    }
    
    if (config.supabase?.anonKey && config.supabase.anonKey !== 'your-anon-key-here') {
      console.log(chalk.gray('   - Anon Key: Configurada'));
    } else {
      console.log(chalk.yellow('   - Anon Key: Não configurada'));
    }
    
    if (config.supabase?.databaseUrl && !config.supabase.databaseUrl.includes('[password]')) {
      console.log(chalk.gray('   - Database URL: Configurada'));
    } else {
      console.log(chalk.yellow('   - Database URL: Não configurada'));
    }

    console.log(chalk.blue('\n📊 Configurações de backup:'));
    console.log(chalk.gray(`   - Output Dir: ${config.backup?.outputDir || './backups'}`));
    console.log(chalk.gray(`   - Include Functions: ${config.backup?.includeFunctions || true}`));
    console.log(chalk.gray(`   - Include Storage: ${config.backup?.includeStorage || true}`));
    console.log(chalk.gray(`   - Include Auth: ${config.backup?.includeAuth || true}`));
    console.log(chalk.gray(`   - Include Realtime: ${config.backup?.includeRealtime || true}`));

    console.log(chalk.blue('\n🔄 Configurações de restore:'));
    console.log(chalk.gray(`   - Clean Restore: ${config.restore?.cleanRestore || true}`));
    console.log(chalk.gray(`   - Verify After Restore: ${config.restore?.verifyAfterRestore || true}`));

  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(chalk.yellow('⚠️  Arquivo de configuração não encontrado'));
      console.log(chalk.gray('   - Use: npx smoonb config --init'));
    } else {
      throw new Error(`Falha ao ler arquivo de configuração: ${error.message}`);
    }
  }
}