const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const { ensureDir, writeJson } = require('../../../utils/fsx');
const { extractPasswordFromDbUrl, ensureCleanLink } = require('../../../utils/supabaseLink');
const { cleanDir } = require('../../../utils/fsExtra');
const { t } = require('../../../i18n');

/**
 * Etapa 8: Backup Edge Functions via Docker (reset link + limpeza opcional)
 */
module.exports = async (context) => {
  const { projectId, accessToken, databaseUrl, backupDir } = context;
  try {
    const functionsDir = path.join(backupDir, 'edge-functions');
    await ensureDir(functionsDir);

    // Reset de link ao projeto de ORIGEM
    const dbPassword = extractPasswordFromDbUrl(databaseUrl);
    await ensureCleanLink(projectId, accessToken, dbPassword);

    // Preparar diretório supabase/functions (criar se não existir, mas não limpar ainda)
    const supabaseFunctionsDir = path.join(process.cwd(), 'supabase', 'functions');
    
    // Verificar flag de limpeza antes do backup
    const shouldCleanAfter = context?.cleanupFlags?.cleanFunctions || false;
    
    // Registrar funções que já existiam ANTES do processo (para preservar se necessário)
    let existingFunctionsBefore = [];
    try {
      const existingItems = await fs.readdir(supabaseFunctionsDir);
      for (const item of existingItems) {
        const itemPath = path.join(supabaseFunctionsDir, item);
        const stats = await fs.stat(itemPath);
        if (stats.isDirectory()) {
          existingFunctionsBefore.push(item);
        }
      }
    } catch {
      // Diretório não existe, tudo bem
      existingFunctionsBefore = [];
    }
    
    // Se o usuário escolheu limpar APÓS, podemos limpar ANTES também para garantir ambiente limpo
    // Mas se escolheu NÃO limpar, preservamos o que já existe
    const getT = global.smoonbI18n?.t || t;
    
    if (shouldCleanAfter) {
      // Limpar antes se o usuário escolheu limpar após (garante ambiente limpo)
      await cleanDir(supabaseFunctionsDir);
      console.log(chalk.white(`   - ${getT('backup.steps.functions.cleanBefore')}`));
    } else {
      // Apenas garantir que o diretório existe
      await fs.mkdir(supabaseFunctionsDir, { recursive: true });
      if (existingFunctionsBefore.length > 0) {
        console.log(chalk.white(`   - ${getT('backup.steps.functions.preserving', { count: existingFunctionsBefore.length })}`));
      } else {
        console.log(chalk.white(`   - ${getT('backup.steps.functions.prepared')}`));
      }
    }

    console.log(chalk.white(`   - ${getT('backup.steps.functions.listing')}`));
    
    // Usar fetch direto para Management API com Personal Access Token
    const functionsResponse = await fetch(`https://api.supabase.com/v1/projects/${projectId}/functions`, {
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!functionsResponse.ok) {
      console.log(chalk.yellow(`     ⚠️ ${getT('backup.steps.functions.listError', { status: functionsResponse.status, statusText: functionsResponse.statusText })}`));
      return { success: false, reason: 'api_error', functions: [] };
    }

    const functions = await functionsResponse.json();
    
    if (!functions || functions.length === 0) {
      console.log(chalk.white(`   - ${getT('backup.steps.functions.noneFound')}`));
      await writeJson(path.join(functionsDir, 'README.md'), {
        message: getT('backup.steps.functions.noFunctionsMessage')
      });
      return { success: true, reason: 'no_functions', functions: [] };
    }

    console.log(chalk.white(`   - Encontradas ${functions.length} Edge Function(s)`));
    
    const downloadedFunctions = [];
    let successCount = 0;
    let errorCount = 0;
    const totalFuncs = functions.length;
    const stepStart = Date.now();

    // Baixar cada Edge Function via Supabase CLI
    // Nota: O CLI ignora o cwd e sempre baixa para supabase/functions
    for (let idx = 0; idx < functions.length; idx++) {
      const func = functions[idx];
      const current = idx + 1;
      const elapsed = Math.floor((Date.now() - stepStart) / 1000);
      try {
        console.log(chalk.white(`   - Baixando ${current}/${totalFuncs}: ${func.name}... (${elapsed}s)`));
        
        // Criar diretório da função NO BACKUP
        const functionTargetDir = path.join(functionsDir, func.name);
        await ensureDir(functionTargetDir);
        
        // Diretório temporário onde o supabase CLI irá baixar (supabase/functions)
        const tempDownloadDir = path.join(process.cwd(), 'supabase', 'functions', func.name);
        
        // Baixar Edge Function via Supabase CLI (sempre vai para supabase/functions)
        const { execSync } = require('child_process');
        
        execSync(`supabase functions download ${func.name}`, {
          timeout: 60000,
          stdio: 'pipe'
        });
        
        // COPIAR arquivos de supabase/functions para o backup
        try {
          const stat = await fs.stat(tempDownloadDir);
          if (stat.isDirectory()) {
            const files = await fs.readdir(tempDownloadDir);
            for (const file of files) {
              const srcPath = path.join(tempDownloadDir, file);
              const dstPath = path.join(functionTargetDir, file);
              
              const fileStats = await fs.stat(srcPath);
              if (fileStats.isDirectory()) {
                // Copiar diretórios recursivamente
                await fs.cp(srcPath, dstPath, { recursive: true });
              } else {
                // Copiar arquivos
                await fs.copyFile(srcPath, dstPath);
              }
            }
          }
        } catch {
          // Arquivos não foram baixados, continuar
          console.log(chalk.yellow(`     ⚠️ Nenhum arquivo encontrado em ${tempDownloadDir}`));
        }
        
        // Limpar função baixada temporariamente APENAS se o usuário escolheu limpar após
        // Se não escolheu, preservar (pode ser que já existisse antes)
        if (shouldCleanAfter) {
          try {
            await fs.rm(tempDownloadDir, { recursive: true, force: true });
          } catch {
            // Ignorar erro de limpeza
          }
        }
        // Se shouldCleanAfter = false, manter a função baixada (e qualquer função que já existia)
        
        console.log(chalk.green(`     ✅ ${func.name} baixada com sucesso`));
        successCount++;
        
        downloadedFunctions.push({
          name: func.name,
          slug: func.name,
          version: func.version || 'unknown',
          files: await fs.readdir(functionTargetDir).catch(() => [])
        });
        
      } catch (error) {
        console.log(chalk.yellow(`     ⚠️ ${getT('backup.steps.functions.downloadError', { funcName: func.name, message: error.message })}`));
        errorCount++;
      }
    }
    
    console.log(chalk.green(`📊 Backup de Edge Functions concluído:`));
    console.log(chalk.green(`   ✅ Sucessos: ${successCount}`));
    console.log(chalk.green(`   ❌ Erros: ${errorCount}`));
    
    // Limpar pasta supabase/functions APÓS o backup apenas se o usuário escolheu
    // Nota: shouldCleanAfter já foi definido acima
    if (shouldCleanAfter) {
      await cleanDir(supabaseFunctionsDir);
      console.log(chalk.white(`   - ${getT('backup.steps.functions.cleanAfter')}`));
    } else {
      // Preservar tudo: tanto as funções que já existiam quanto as que foram baixadas
      // As funções baixadas não foram removidas individualmente (linha acima foi ajustada)
      console.log(chalk.white(`   - ${getT('backup.steps.functions.preserved')}`));
    }
    
    return { 
      success: true, 
      reason: 'success',
      functions: downloadedFunctions,
      functions_count: functions.length,
      success_count: successCount,
      error_count: errorCount,
      method: 'docker'
    };

  } catch (error) {
    const getT = global.smoonbI18n?.t || t;
    console.log(chalk.yellow(`   ⚠️ ${getT('backup.steps.functions.error', { message: error.message })}`));
    console.log('⏭️  Continuando com outros componentes...');
    return { success: false, reason: 'download_error', error: error.message, functions: [] };
  }
};

