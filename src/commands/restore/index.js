const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const inquirer = require('inquirer');
const { readEnvFile, writeEnvFile, backupEnvFile } = require('../../utils/env');
const { saveEnvMap } = require('../../utils/envMap');
const { mapEnvVariablesInteractively } = require('../../interactive/envMapper');
const { showBetaBanner } = require('../../utils/banner');
const { listValidBackups, showRestoreSummary } = require('./utils');

// Importar todas as etapas
const step00BackupSelection = require('./steps/00-backup-selection');
const step01ComponentsSelection = require('./steps/01-components-selection');
const step02Confirmation = require('./steps/02-confirmation');
const step03Database = require('./steps/03-database');
const step04EdgeFunctions = require('./steps/04-edge-functions');
const step05AuthSettings = require('./steps/05-auth-settings');
const step06Storage = require('./steps/06-storage');
const step07DatabaseSettings = require('./steps/07-database-settings');
const step08RealtimeSettings = require('./steps/08-realtime-settings');

module.exports = async (_options) => {
  showBetaBanner();
  
  try {
    // Consentimento para leitura e escrita do .env.local
    console.log(chalk.yellow('⚠️  O smoonb irá ler e escrever o arquivo .env.local localmente.'));
    console.log(chalk.yellow('   Um backup automático do .env.local será criado antes de qualquer alteração.'));
    const consent = await inquirer.prompt([{ type: 'confirm', name: 'ok', message: 'Você consente em prosseguir (S/n):', default: true }]);
    if (!consent.ok) {
      console.log(chalk.red('🚫 Operação cancelada pelo usuário.'));
      process.exit(1);
    }

    // Preparar diretório de processo restore-YYYY-...
    const rootBackupsDir = path.join(process.cwd(), 'backups');
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}`;
    const processDir = path.join(rootBackupsDir, `restore-${ts}`);
    fs.mkdirSync(path.join(processDir, 'env'), { recursive: true });

    // Backup do .env.local
    const envPath = path.join(process.cwd(), '.env.local');
    const envBackupPath = path.join(processDir, 'env', '.env.local');
    await backupEnvFile(envPath, envBackupPath);
    console.log(chalk.blue(`📁 Backup do .env.local: ${path.relative(process.cwd(), envBackupPath)}`));

    // Leitura e mapeamento interativo
    const currentEnv = await readEnvFile(envPath);
    const expectedKeys = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_DB_URL',
      'SUPABASE_PROJECT_ID',
      'SUPABASE_ACCESS_TOKEN',
      'SMOONB_OUTPUT_DIR'
    ];
    const { finalEnv, dePara } = await mapEnvVariablesInteractively(currentEnv, expectedKeys);
    await writeEnvFile(envPath, finalEnv);
    await saveEnvMap(dePara, path.join(processDir, 'env', 'env-map.json'));
    console.log(chalk.green('✅ .env.local atualizado com sucesso. Nenhuma chave renomeada; valores sincronizados.'));

    // Resolver valores esperados a partir do de-para
    function getValue(expectedKey) {
      const clientKey = Object.keys(dePara).find(k => dePara[k] === expectedKey);
      return clientKey ? finalEnv[clientKey] : '';
    }

    // Construir targetProject a partir do .env.local mapeado
    const targetProject = {
      targetProjectId: getValue('SUPABASE_PROJECT_ID'),
      targetUrl: getValue('NEXT_PUBLIC_SUPABASE_URL'),
      targetAnonKey: getValue('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      targetServiceKey: getValue('SUPABASE_SERVICE_ROLE_KEY'),
      targetDatabaseUrl: getValue('SUPABASE_DB_URL'),
      targetAccessToken: getValue('SUPABASE_ACCESS_TOKEN')
    };
    
    console.log(chalk.blue(`📁 Buscando backups em: ${getValue('SMOONB_OUTPUT_DIR') || './backups'}`));
    
    // 1. Listar backups válidos (.backup.gz)
    const validBackups = await listValidBackups(getValue('SMOONB_OUTPUT_DIR') || './backups');
    
    if (validBackups.length === 0) {
      console.error(chalk.red('❌ Nenhum backup válido encontrado'));
      console.log(chalk.yellow('💡 Execute primeiro: npx smoonb backup'));
      process.exit(1);
    }
    
    // 2. Selecionar backup interativamente
    const selectedBackup = await step00BackupSelection(validBackups);
    
    // 3. Perguntar quais componentes restaurar
    const components = await step01ComponentsSelection(selectedBackup.path);
    
    // Validar que pelo menos um componente foi selecionado
    if (!Object.values(components).some(Boolean)) {
      console.error(chalk.red('\n❌ Nenhum componente selecionado para restauração!'));
      process.exit(1);
    }
    
    // 4. Mostrar resumo
    showRestoreSummary(selectedBackup, components, targetProject);
    
    // 5. Confirmar execução
    const confirmed = await step02Confirmation();
    if (!confirmed) {
      console.log(chalk.yellow('Restauração cancelada.'));
      process.exit(0);
    }
    
    // 6. Executar restauração
    console.log(chalk.blue('\n🚀 Iniciando restauração...'));
    
    // 6.1 Database (se selecionado)
    if (components.database) {
      await step03Database({
        backupFilePath: path.join(selectedBackup.path, selectedBackup.backupFile),
        targetDatabaseUrl: targetProject.targetDatabaseUrl
      });
    }
    
    // 6.2 Edge Functions (se selecionado)
    if (components.edgeFunctions) {
      await step04EdgeFunctions({
        backupPath: selectedBackup.path,
        targetProject
      });
    }
    
    // 6.3 Auth Settings (se selecionado)
    if (components.authSettings) {
      await step05AuthSettings({
        backupPath: selectedBackup.path,
        targetProject
      });
    }
    
    // 6.4 Storage Buckets (se selecionado)
    if (components.storage) {
      await step06Storage({
        backupPath: selectedBackup.path
      });
    }
    
    // 6.5 Database Settings (se selecionado)
    if (components.databaseSettings) {
      await step07DatabaseSettings({
        backupPath: selectedBackup.path,
        targetProject
      });
    }
    
    // 6.6 Realtime Settings (se selecionado)
    if (components.realtimeSettings) {
      await step08RealtimeSettings({
        backupPath: selectedBackup.path,
        targetProject
      });
    }
    
    // report.json de restauração
    const report = {
      process: 'restore',
      created_at: new Date().toISOString(),
      target_project_id: targetProject.targetProjectId,
      assets: {
        env: path.join(processDir, 'env', '.env.local'),
        env_map: path.join(processDir, 'env', 'env-map.json')
      },
      components: components,
      notes: [
        'supabase/functions limpo antes e depois do deploy (se Edge Functions selecionado)'
      ]
    };
    try {
      fs.writeFileSync(path.join(processDir, 'report.json'), JSON.stringify(report, null, 2));
    } catch {
      // silencioso
    }

    console.log(chalk.green('\n🎉 Restauração completa finalizada!'));
    
  } catch (error) {
    console.error(chalk.red(`❌ Erro na restauração: ${error.message}`));
    process.exit(1);
  }
};

