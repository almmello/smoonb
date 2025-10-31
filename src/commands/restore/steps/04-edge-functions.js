const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const { execSync } = require('child_process');
const { copyDirectoryRecursive } = require('../utils');

/**
 * Etapa 4: Restaurar Edge Functions via supabase functions deploy
 */
module.exports = async ({ backupPath, targetProject }) => {
  try {
    const edgeFunctionsDir = path.join(backupPath, 'edge-functions');
    
    if (!await fs.access(edgeFunctionsDir).then(() => true).catch(() => false)) {
      console.log(chalk.yellow('   ⚠️  Nenhuma Edge Function encontrada no backup'));
      return { success: false, functions_count: 0, success_count: 0 };
    }
    
    const items = await fs.readdir(edgeFunctionsDir);
    const functions = [];
    
    for (const item of items) {
      const itemPath = path.join(edgeFunctionsDir, item);
      const stats = await fs.stat(itemPath);
      if (stats.isDirectory()) {
        functions.push(item);
      }
    }
    
    if (functions.length === 0) {
      console.log(chalk.yellow('   ⚠️  Nenhuma Edge Function encontrada no backup'));
      return { success: false, functions_count: 0, success_count: 0 };
    }
    
    console.log(chalk.gray(`   - Encontradas ${functions.length} Edge Function(s)`));
    
    // COPIAR Edge Functions de backups/backup-XXX/edge-functions para supabase/functions
    const supabaseFunctionsDir = path.join(process.cwd(), 'supabase', 'functions');
    
    // Criar diretório supabase/functions se não existir
    await fs.mkdir(supabaseFunctionsDir, { recursive: true });
    
    // Limpar supabase/functions antes de copiar
    console.log(chalk.gray('   - Limpando supabase/functions...'));
    try {
      await fs.rm(supabaseFunctionsDir, { recursive: true, force: true });
      await fs.mkdir(supabaseFunctionsDir, { recursive: true });
    } catch {
      // Ignorar erro de limpeza se não existir
    }
    
    // Copiar cada Edge Function para supabase/functions
    for (const funcName of functions) {
      const backupFuncPath = path.join(edgeFunctionsDir, funcName);
      const targetFuncPath = path.join(supabaseFunctionsDir, funcName);
      
      console.log(chalk.gray(`   - Copiando ${funcName} para supabase/functions...`));
      
      // Copiar recursivamente
      await copyDirectoryRecursive(backupFuncPath, targetFuncPath);
    }
    
    console.log(chalk.gray(`   - Linkando com projeto ${targetProject.targetProjectId}...`));
    
    // Linkar com o projeto destino
    try {
      execSync(`supabase link --project-ref ${targetProject.targetProjectId}`, {
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 10000,
        env: { ...process.env, SUPABASE_ACCESS_TOKEN: targetProject.targetAccessToken || '' }
      });
    } catch {
      console.log(chalk.yellow('   ⚠️  Link pode já existir, continuando...'));
    }
    
    // Deploy das Edge Functions
    let successCount = 0;
    for (const funcName of functions) {
      console.log(chalk.gray(`   - Deployando ${funcName}...`));
      
      try {
        execSync(`supabase functions deploy ${funcName}`, {
          cwd: process.cwd(),
          stdio: 'pipe',
          encoding: 'utf8',
          timeout: 120000,
          env: { ...process.env, SUPABASE_ACCESS_TOKEN: targetProject.targetAccessToken || '' }
        });
        
        console.log(chalk.green(`   ✅ ${funcName} deployada com sucesso!`));
        successCount++;
      } catch (deployError) {
        console.log(chalk.yellow(`   ⚠️  ${funcName} - deploy falhou: ${deployError.message}`));
      }
    }
    
    // Limpar supabase/functions após deploy
    console.log(chalk.gray('   - Limpando supabase/functions após deploy...'));
    try {
      await fs.rm(supabaseFunctionsDir, { recursive: true, force: true });
    } catch {
      // Ignorar erro de limpeza
    }
    
    console.log(chalk.green('   ✅ Edge Functions restauradas com sucesso!'));
    
    return {
      success: true,
      functions_count: functions.length,
      success_count: successCount
    };
    
  } catch (error) {
    console.error(chalk.red(`   ❌ Erro ao restaurar Edge Functions: ${error.message}`));
    throw error;
  }
};

