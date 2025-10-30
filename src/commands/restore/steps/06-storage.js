const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const inquirer = require('inquirer');

/**
 * Etapa 6: Restaurar Storage Buckets (interativo - exibir informações)
 */
module.exports = async ({ backupPath }) => {
  console.log(chalk.blue('\n📦 Restaurando Storage Buckets...'));
  
  try {
    const storageDir = path.join(backupPath, 'storage');
    
    if (!fs.existsSync(storageDir)) {
      console.log(chalk.yellow('   ⚠️  Nenhum bucket de Storage encontrado no backup'));
      return;
    }
    
    const manifestPath = path.join(backupPath, 'backup-manifest.json');
    let manifest = null;
    
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    }
    
    const buckets = manifest?.components?.storage?.buckets || [];
    
    if (buckets.length === 0) {
      console.log(chalk.gray('   ℹ️  Nenhum bucket para restaurar'));
      return;
    }
    
    console.log(chalk.green(`\n   ✅ ${buckets.length} bucket(s) encontrado(s) no backup`));
    buckets.forEach(bucket => {
      console.log(chalk.gray(`   - ${bucket.name} (${bucket.public ? 'público' : 'privado'})`));
    });
    
    const colabUrl = 'https://colab.research.google.com/github/PLyn/supabase-storage-migrate/blob/main/Supabase_Storage_migration.ipynb';
    
    console.log(chalk.yellow('\n   ⚠️  Migração de objetos de Storage requer processo manual'));
    console.log(chalk.cyan(`   ℹ️  Use o script do Google Colab: ${colabUrl}`));
    console.log(chalk.gray('\n   📋 Instruções:'));
    console.log(chalk.gray('   1. Execute o script no Google Colab'));
    console.log(chalk.gray('   2. Configure as credenciais dos projetos (origem e destino)'));
    console.log(chalk.gray('   3. Execute a migração'));
    
    await inquirer.prompt([{
      type: 'input',
      name: 'continue',
      message: 'Pressione Enter para continuar'
    }]);
    
  } catch (error) {
    console.error(chalk.red(`   ❌ Erro ao processar Storage: ${error.message}`));
  }
};

