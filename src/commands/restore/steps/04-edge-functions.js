const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const { execSync } = require('child_process');
const { copyDirectoryRecursive } = require('../utils');
const { t } = require('../../../i18n');

/**
 * Etapa 4: Restaurar Edge Functions via supabase functions deploy
 */
module.exports = async ({ backupPath, targetProject }) => {
  try {
    const getT = global.smoonbI18n?.t || t;
    const edgeFunctionsDir = path.join(backupPath, 'edge-functions');
    
    if (!await fs.access(edgeFunctionsDir).then(() => true).catch(() => false)) {
      console.log(chalk.yellow(`   ⚠️  ${getT('restore.steps.edgeFunctions.notFound')}`));
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
      console.log(chalk.yellow(`   ⚠️  ${getT('restore.steps.edgeFunctions.notFound')}`));
      return { success: false, functions_count: 0, success_count: 0 };
    }
    
    console.log(chalk.white(`   - ${getT('restore.steps.edgeFunctions.found', { count: functions.length })}`));
    
    // COPIAR Edge Functions de backups/backup-XXX/edge-functions para supabase/functions
    const supabaseFunctionsDir = path.join(process.cwd(), 'supabase', 'functions');
    
    // Criar diretório supabase/functions se não existir
    await fs.mkdir(supabaseFunctionsDir, { recursive: true });
    
    // Limpar supabase/functions antes de copiar (necessário para garantir ambiente limpo)
    console.log(chalk.cyan(`   - ${getT('restore.steps.edgeFunctions.cleaningBefore')}`));
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
      
      console.log(chalk.white(`   - ${getT('restore.steps.edgeFunctions.copying', { funcName })}`));
      
      // Copiar recursivamente
      await copyDirectoryRecursive(backupFuncPath, targetFuncPath);
    }
    
    console.log(chalk.white(`   - ${getT('restore.steps.edgeFunctions.linking', { projectId: targetProject.targetProjectId })}`));
    
    // Linkar com o projeto destino
    try {
      execSync(`supabase link --project-ref ${targetProject.targetProjectId}`, {
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 10000,
        env: { ...process.env, SUPABASE_ACCESS_TOKEN: targetProject.targetAccessToken || '' }
      });
    } catch {
      console.log(chalk.yellow(`   ⚠️  ${getT('restore.steps.edgeFunctions.linkMayExist')}`));
    }
    
    // Deploy das Edge Functions
    let successCount = 0;
    for (const funcName of functions) {
      console.log(chalk.white(`   - ${getT('restore.steps.edgeFunctions.deploying', { funcName })}`));
      
      try {
        execSync(`supabase functions deploy ${funcName}`, {
          cwd: process.cwd(),
          stdio: 'pipe',
          encoding: 'utf8',
          timeout: 120000,
          env: { ...process.env, SUPABASE_ACCESS_TOKEN: targetProject.targetAccessToken || '' }
        });
        
        console.log(chalk.green(`   ✅ ${getT('restore.steps.edgeFunctions.deployed', { funcName })}`));
        successCount++;
      } catch (deployError) {
        console.log(chalk.yellow(`   ⚠️  ${getT('restore.steps.edgeFunctions.deployFailed', { funcName, message: deployError.message })}`));
      }
    }
    
    // Limpar supabase/functions após deploy (arquivos temporários não são mais necessários)
    console.log(chalk.cyan(`   - ${getT('restore.steps.edgeFunctions.cleaningAfter')}`));
    try {
      await fs.rm(supabaseFunctionsDir, { recursive: true, force: true });
    } catch {
      // Ignorar erro de limpeza
    }
    
    console.log(chalk.green(`   ✅ ${getT('restore.steps.edgeFunctions.success')}`));
    
    return {
      success: true,
      functions_count: functions.length,
      success_count: successCount
    };
    
  } catch (error) {
    const getT = global.smoonbI18n?.t || t;
    console.error(chalk.red(`   ❌ ${getT('restore.steps.edgeFunctions.error', { message: error.message })}`));
    throw error;
  }
};

