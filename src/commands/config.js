/**
 * Comando de configuração do smoonb
 */

const chalk = require('chalk');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

async function configCommand(options) {
  console.log(chalk.red.bold('🚀 smoonb v0.0.1 - EXPERIMENTAL VERSION'));
  console.log(chalk.red.bold('⚠️  VERSÃO EXPERIMENTAL - NUNCA TESTADA EM PRODUÇÃO!'));
  console.log(chalk.red.bold('🚨 USE POR SUA CONTA E RISCO - Pode causar perda de dados!'));
  console.log(chalk.red.bold('❌ NÃO NOS RESPONSABILIZAMOS por qualquer perda de dados!\n'));
  
  console.log(chalk.cyan.bold('⚙️  Configuração do smoonb...\n'));

  try {
    const configPath = path.join(os.homedir(), '.smoonbrc');

    if (options.init) {
      // Inicializar configuração
      const defaultConfig = {
        supabase: {
          projectId: '',
          url: '',
          serviceKey: '',
          anonKey: '',
          databaseUrl: ''
        },
        backup: {
          includeFunctions: true,
          includeStorage: true,
          includeAuth: true,
          includeRealtime: true,
          outputDir: './backups'
        },
        restore: {
          cleanRestore: false,
          verifyAfterRestore: true
        }
      };

      await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
      console.log(chalk.green('✅ Arquivo de configuração criado:'), configPath);
      console.log(chalk.yellow('💡 Edite o arquivo para configurar suas credenciais Supabase'));

    } else if (options.show) {
      // Mostrar configuração atual
      try {
        const configContent = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(configContent);
        
        console.log(chalk.green('📋 Configuração atual:'));
        console.log(chalk.blue('📁 Arquivo:'), configPath);
        console.log(chalk.gray(JSON.stringify(config, null, 2)));

      } catch (error) {
        console.log(chalk.yellow('⚠️  Arquivo de configuração não encontrado'));
        console.log(chalk.yellow('💡 Use'), chalk.cyan('smoonb config --init'), chalk.yellow('para criar a configuração'));
      }

    } else {
      // Mostrar ajuda
      console.log(chalk.yellow('💡 Opções disponíveis:'));
      console.log(chalk.cyan('  --init'), chalk.gray('  Inicializar arquivo de configuração'));
      console.log(chalk.cyan('  --show'), chalk.gray('  Mostrar configuração atual'));
      console.log(chalk.blue('\n📁 Arquivo de configuração:'), configPath);
    }

  } catch (error) {
    console.error(chalk.red.bold('❌ Erro durante a configuração:'), error.message);
    process.exit(1);
  }
}

module.exports = configCommand;
