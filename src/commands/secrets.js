/**
 * Comando de gerenciamento de secrets do Supabase
 * Export/import sem commitar no git
 */

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

/**
 * Gerenciamento de secrets do Supabase
 * Resolve o problema: secrets sensíveis não devem ser commitados
 */
async function secretsCommand(options) {
  console.log(chalk.red.bold('🚀 smoonb v0.0.1 - EXPERIMENTAL VERSION'));
  console.log(chalk.red.bold('⚠️  VERSÃO EXPERIMENTAL - NUNCA TESTADA EM PRODUÇÃO!'));
  console.log(chalk.red.bold('🚨 USE POR SUA CONTA E RISCO - Pode causar perda de dados!'));
  console.log(chalk.red.bold('❌ NÃO NOS RESPONSABILIZAMOS por qualquer perda de dados!\n'));
  
  console.log(chalk.cyan.bold('🔐 Gerenciamento de secrets do Supabase...\n'));

  try {
    const args = process.argv.slice(3); // Remover 'smoonb', 'secrets'
    
    if (args.length === 0) {
      showSecretsHelp();
      return;
    }

    const action = args[0];

    switch (action) {
      case 'export':
        await exportSecrets(options);
        break;
      case 'import':
        await importSecrets(options);
        break;
      case 'list':
        await listSecrets(options);
        break;
      case 'validate':
        await validateSecrets(options);
        break;
      default:
        console.error(chalk.red.bold('❌ Ação não reconhecida:'), action);
        showSecretsHelp();
        process.exit(1);
    }

  } catch (error) {
    console.error(chalk.red.bold('❌ Erro durante o gerenciamento de secrets:'), error.message);
    process.exit(1);
  }
}

/**
 * Exportar secrets para arquivo temporário (gitignored)
 */
async function exportSecrets(options) {
  console.log(chalk.blue.bold('📤 Exportando secrets...\n'));

  try {
    // Procurar arquivos de configuração com secrets
    const envFiles = [
      '.env',
      '.env.local',
      '.env.production',
      '.env.development'
    ];

    const secrets = {};
    let foundSecrets = false;

    for (const envFile of envFiles) {
      if (fs.existsSync(envFile)) {
        console.log(chalk.gray(`   - Lendo ${envFile}...`));
        
        const envContent = await fs.promises.readFile(envFile, 'utf8');
        const lines = envContent.split('\n');
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine && !trimmedLine.startsWith('#')) {
            const [key, ...valueParts] = trimmedLine.split('=');
            if (key && valueParts.length > 0) {
              const value = valueParts.join('=');
              secrets[key.trim()] = value.trim();
              foundSecrets = true;
            }
          }
        }
      }
    }

    if (!foundSecrets) {
      console.log(chalk.yellow('⚠️  Nenhum secret encontrado nos arquivos .env'));
      console.log(chalk.gray('   - Verifique se existem arquivos .env no projeto'));
      return;
    }

    // Criar arquivo de secrets temporário (gitignored)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const secretsFile = `smoonb-secrets-${timestamp}.env`;
    
    let secretsContent = `# smoonb Secrets Export - ${new Date().toISOString()}\n`;
    secretsContent += `# ⚠️  NÃO COMMITE ESTE ARQUIVO! ⚠️\n`;
    secretsContent += `# Este arquivo contém secrets sensíveis\n\n`;

    for (const [key, value] of Object.entries(secrets)) {
      secretsContent += `${key}=${value}\n`;
    }

    await fs.promises.writeFile(secretsFile, secretsContent);

    console.log(chalk.green('✅ Secrets exportados com sucesso!'));
    console.log(chalk.blue('📁 Arquivo:'), secretsFile);
    console.log(chalk.blue('🔢 Secrets encontrados:'), Object.keys(secrets).length);
    console.log(chalk.yellow('\n⚠️  IMPORTANTE: NÃO commite este arquivo!'));
    console.log(chalk.yellow('💡 Use "smoonb secrets import" para importar em outro projeto'));

    // Adicionar ao .gitignore se não estiver lá
    await ensureGitignore(secretsFile);

  } catch (error) {
    console.error(chalk.red.bold('❌ Erro durante export de secrets:'), error.message);
    throw error;
  }
}

/**
 * Importar secrets de arquivo temporário
 */
async function importSecrets(options) {
  console.log(chalk.blue.bold('📥 Importando secrets...\n'));

  try {
    // Procurar arquivo de secrets mais recente
    const secretsFiles = fs.readdirSync('.')
      .filter(file => file.startsWith('smoonb-secrets-') && file.endsWith('.env'))
      .sort()
      .reverse();

    if (secretsFiles.length === 0) {
      console.error(chalk.red.bold('❌ Nenhum arquivo de secrets encontrado'));
      console.log(chalk.yellow('💡 Use "smoonb secrets export" primeiro'));
      process.exit(1);
    }

    const secretsFile = secretsFiles[0];
    console.log(chalk.gray(`   - Usando arquivo: ${secretsFile}`));

    // Ler arquivo de secrets
    const secretsContent = await fs.promises.readFile(secretsFile, 'utf8');
    const lines = secretsContent.split('\n');

    const secrets = {};
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=');
          secrets[key.trim()] = value.trim();
        }
      }
    }

    if (Object.keys(secrets).length === 0) {
      console.log(chalk.yellow('⚠️  Nenhum secret válido encontrado no arquivo'));
      return;
    }

    // Criar/atualizar .env.local
    const envLocalPath = '.env.local';
    let envLocalContent = `# smoonb Import - ${new Date().toISOString()}\n`;
    envLocalContent += `# Secrets importados automaticamente\n\n`;

    for (const [key, value] of Object.entries(secrets)) {
      envLocalContent += `${key}=${value}\n`;
    }

    await fs.promises.writeFile(envLocalPath, envLocalContent);

    console.log(chalk.green('✅ Secrets importados com sucesso!'));
    console.log(chalk.blue('📁 Arquivo:'), envLocalPath);
    console.log(chalk.blue('🔢 Secrets importados:'), Object.keys(secrets).length);
    console.log(chalk.yellow('\n💡 Os secrets foram salvos em .env.local (gitignored)'));

  } catch (error) {
    console.error(chalk.red.bold('❌ Erro durante import de secrets:'), error.message);
    throw error;
  }
}

/**
 * Listar secrets encontrados (sem mostrar valores)
 */
async function listSecrets(options) {
  console.log(chalk.blue.bold('📋 Listando secrets encontrados...\n'));

  try {
    const envFiles = [
      '.env',
      '.env.local',
      '.env.production',
      '.env.development'
    ];

    const allSecrets = new Set();
    let foundFiles = 0;

    for (const envFile of envFiles) {
      if (fs.existsSync(envFile)) {
        foundFiles++;
        console.log(chalk.gray(`   - ${envFile}:`));
        
        const envContent = await fs.promises.readFile(envFile, 'utf8');
        const lines = envContent.split('\n');
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine && !trimmedLine.startsWith('#')) {
            const [key] = trimmedLine.split('=');
            if (key) {
              allSecrets.add(key.trim());
              console.log(chalk.gray(`     • ${key.trim()}`));
            }
          }
        }
        console.log();
      }
    }

    if (foundFiles === 0) {
      console.log(chalk.yellow('⚠️  Nenhum arquivo .env encontrado'));
      return;
    }

    console.log(chalk.green('✅ Resumo:'));
    console.log(chalk.blue('📁 Arquivos analisados:'), foundFiles);
    console.log(chalk.blue('🔢 Secrets únicos encontrados:'), allSecrets.size);

  } catch (error) {
    console.error(chalk.red.bold('❌ Erro durante listagem de secrets:'), error.message);
    throw error;
  }
}

/**
 * Validar secrets (verificar se estão configurados)
 */
async function validateSecrets(options) {
  console.log(chalk.blue.bold('🔍 Validando secrets...\n'));

  try {
    const requiredSecrets = [
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY'
    ];

    const envFiles = [
      '.env',
      '.env.local',
      '.env.production',
      '.env.development'
    ];

    const foundSecrets = new Set();
    let foundFiles = 0;

    // Coletar todos os secrets
    for (const envFile of envFiles) {
      if (fs.existsSync(envFile)) {
        foundFiles++;
        const envContent = await fs.promises.readFile(envFile, 'utf8');
        const lines = envContent.split('\n');
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine && !trimmedLine.startsWith('#')) {
            const [key] = trimmedLine.split('=');
            if (key) {
              foundSecrets.add(key.trim());
            }
          }
        }
      }
    }

    // Validar secrets obrigatórios
    console.log(chalk.gray('   - Verificando secrets obrigatórios:'));
    let allValid = true;

    for (const secret of requiredSecrets) {
      if (foundSecrets.has(secret)) {
        console.log(chalk.green(`     ✅ ${secret}`));
      } else {
        console.log(chalk.red(`     ❌ ${secret} - NÃO ENCONTRADO`));
        allValid = false;
      }
    }

    console.log(chalk.green('\n✅ Validação concluída!'));
    console.log(chalk.blue('📁 Arquivos analisados:'), foundFiles);
    console.log(chalk.blue('🔢 Secrets encontrados:'), foundSecrets.size);
    
    if (allValid) {
      console.log(chalk.green('🎉 Todos os secrets obrigatórios estão configurados!'));
    } else {
      console.log(chalk.yellow('⚠️  Alguns secrets obrigatórios estão faltando'));
      console.log(chalk.yellow('💡 Use "smoonb config --init" para configurar'));
    }

  } catch (error) {
    console.error(chalk.red.bold('❌ Erro durante validação de secrets:'), error.message);
    throw error;
  }
}

/**
 * Mostrar ajuda do comando secrets
 */
function showSecretsHelp() {
  console.log(chalk.cyan.bold('🔐 Comandos de Secrets disponíveis:\n'));
  console.log(chalk.cyan('  export'), chalk.gray('  - Exportar secrets para arquivo temporário'));
  console.log(chalk.cyan('  import'), chalk.gray('  - Importar secrets de arquivo temporário'));
  console.log(chalk.cyan('  list'), chalk.gray('   - Listar secrets encontrados (sem valores)'));
  console.log(chalk.cyan('  validate'), chalk.gray(' - Validar secrets obrigatórios'));
  console.log(chalk.yellow('\n💡 Exemplos:'));
  console.log(chalk.gray('  smoonb secrets export'));
  console.log(chalk.gray('  smoonb secrets import'));
  console.log(chalk.gray('  smoonb secrets list'));
  console.log(chalk.gray('  smoonb secrets validate'));
}

/**
 * Garantir que arquivo está no .gitignore
 */
async function ensureGitignore(filename) {
  try {
    const gitignorePath = '.gitignore';
    let gitignoreContent = '';

    if (fs.existsSync(gitignorePath)) {
      gitignoreContent = await fs.promises.readFile(gitignorePath, 'utf8');
    }

    // Verificar se já está no .gitignore
    if (!gitignoreContent.includes(filename)) {
      gitignoreContent += `\n# smoonb secrets files\n${filename}\n`;
      await fs.promises.writeFile(gitignorePath, gitignoreContent);
      console.log(chalk.gray(`   - Arquivo ${filename} adicionado ao .gitignore`));
    }
  } catch (error) {
    console.log(chalk.yellow('⚠️  Não foi possível atualizar .gitignore:'), error.message);
  }
}

module.exports = secretsCommand;
