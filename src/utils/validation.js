/**
 * Utilitários de validação para inputs e configurações
 */

const chalk = require('chalk');

/**
 * Validar Project ID do Supabase
 */
function validateProjectId(projectId) {
  if (!projectId) {
    return { valid: false, error: 'Project ID é obrigatório' };
  }

  // Project ID deve ter formato específico (ex: abc123def456)
  const projectIdRegex = /^[a-z0-9]{20}$/;
  if (!projectIdRegex.test(projectId)) {
    return { 
      valid: false, 
      error: 'Project ID deve ter 20 caracteres alfanuméricos (ex: abc123def456)' 
    };
  }

  return { valid: true };
}

/**
 * Validar URL do Supabase
 */
function validateSupabaseUrl(url) {
  if (!url) {
    return { valid: false, error: 'URL do Supabase é obrigatória' };
  }

  try {
    const parsedUrl = new URL(url);
    
    // Deve ser HTTPS
    if (parsedUrl.protocol !== 'https:') {
      return { valid: false, error: 'URL deve usar HTTPS' };
    }

    // Deve ter formato correto
    if (!parsedUrl.hostname.includes('.supabase.co')) {
      return { valid: false, error: 'URL deve ser um domínio Supabase válido' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'URL inválida' };
  }
}

/**
 * Validar Service Key do Supabase
 */
function validateServiceKey(serviceKey) {
  if (!serviceKey) {
    return { valid: false, error: 'Service Key é obrigatória' };
  }

  // Service Key deve ter formato específico
  const serviceKeyRegex = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  if (!serviceKeyRegex.test(serviceKey)) {
    return { valid: false, error: 'Service Key deve ser um JWT válido' };
  }

  return { valid: true };
}

/**
 * Validar Anon Key do Supabase
 */
function validateAnonKey(anonKey) {
  if (!anonKey) {
    return { valid: false, error: 'Anon Key é obrigatória' };
  }

  // Anon Key deve ter formato específico
  const anonKeyRegex = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  if (!anonKeyRegex.test(anonKey)) {
    return { valid: false, error: 'Anon Key deve ser um JWT válido' };
  }

  return { valid: true };
}

/**
 * Validar URL de conexão da database
 */
function validateDatabaseUrl(dbUrl) {
  if (!dbUrl) {
    return { valid: false, error: 'URL da database é obrigatória' };
  }

  try {
    const parsedUrl = new URL(dbUrl);
    
    // Deve ser PostgreSQL
    if (parsedUrl.protocol !== 'postgresql:') {
      return { valid: false, error: 'URL deve usar protocolo postgresql:' };
    }

    // Deve ter host, port e database
    if (!parsedUrl.hostname || !parsedUrl.port || !parsedUrl.pathname.slice(1)) {
      return { valid: false, error: 'URL deve incluir host, porta e nome da database' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'URL da database inválida' };
  }
}

/**
 * Validar diretório de backup
 */
function validateBackupDir(backupDir) {
  if (!backupDir) {
    return { valid: false, error: 'Diretório de backup é obrigatório' };
  }

  // Deve ser um caminho válido
  if (typeof backupDir !== 'string' || backupDir.trim().length === 0) {
    return { valid: false, error: 'Diretório de backup deve ser uma string válida' };
  }

  // Não deve conter caracteres perigosos
  const dangerousChars = /[<>:"|?*\x00-\x1f]/;
  if (dangerousChars.test(backupDir)) {
    return { valid: false, error: 'Diretório contém caracteres inválidos' };
  }

  return { valid: true };
}

/**
 * Validar configuração completa
 */
function validateConfig(config) {
  const errors = [];

  // Validar Supabase URL
  if (config.supabase?.url) {
    const urlValidation = validateSupabaseUrl(config.supabase.url);
    if (!urlValidation.valid) {
      errors.push(`Supabase URL: ${urlValidation.error}`);
    }
  }

  // Validar Service Key
  if (config.supabase?.serviceKey) {
    const serviceKeyValidation = validateServiceKey(config.supabase.serviceKey);
    if (!serviceKeyValidation.valid) {
      errors.push(`Service Key: ${serviceKeyValidation.error}`);
    }
  }

  // Validar Anon Key
  if (config.supabase?.anonKey) {
    const anonKeyValidation = validateAnonKey(config.supabase.anonKey);
    if (!anonKeyValidation.valid) {
      errors.push(`Anon Key: ${anonKeyValidation.error}`);
    }
  }

  // Validar Database URL
  if (config.supabase?.databaseUrl) {
    const dbUrlValidation = validateDatabaseUrl(config.supabase.databaseUrl);
    if (!dbUrlValidation.valid) {
      errors.push(`Database URL: ${dbUrlValidation.error}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validar opções de backup
 */
function validateBackupOptions(options) {
  const errors = [];

  // Project ID é obrigatório
  const projectIdValidation = validateProjectId(options.projectId);
  if (!projectIdValidation.valid) {
    errors.push(projectIdValidation.error);
  }

  // Output dir é obrigatório
  const outputDirValidation = validateBackupDir(options.output);
  if (!outputDirValidation.valid) {
    errors.push(outputDirValidation.error);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validar opções de restore
 */
function validateRestoreOptions(options) {
  const errors = [];

  // Project ID é obrigatório
  const projectIdValidation = validateProjectId(options.projectId);
  if (!projectIdValidation.valid) {
    errors.push(projectIdValidation.error);
  }

  // Backup dir é obrigatório
  const backupDirValidation = validateBackupDir(options.backupDir);
  if (!backupDirValidation.valid) {
    errors.push(backupDirValidation.error);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validar arquivo de secrets
 */
function validateSecretsFile(filePath) {
  if (!filePath) {
    return { valid: false, error: 'Caminho do arquivo de secrets é obrigatório' };
  }

  // Deve ser um arquivo .env
  if (!filePath.endsWith('.env')) {
    return { valid: false, error: 'Arquivo deve ter extensão .env' };
  }

  return { valid: true };
}

/**
 * Validar nome de Edge Function
 */
function validateFunctionName(functionName) {
  if (!functionName) {
    return { valid: false, error: 'Nome da function é obrigatório' };
  }

  // Deve seguir convenções de nomenclatura
  const functionNameRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
  if (!functionNameRegex.test(functionName)) {
    return { 
      valid: false, 
      error: 'Nome da function deve conter apenas letras minúsculas, números e hífens' 
    };
  }

  // Não deve ser muito longo
  if (functionName.length > 50) {
    return { valid: false, error: 'Nome da function não pode ter mais de 50 caracteres' };
  }

  return { valid: true };
}

/**
 * Validar arquivo de manifesto de backup
 */
function validateBackupManifest(manifest) {
  const errors = [];

  if (!manifest) {
    return { valid: false, errors: ['Manifesto é obrigatório'] };
  }

  // Deve ter timestamp
  if (!manifest.timestamp) {
    errors.push('Timestamp é obrigatório');
  }

  // Deve ter projectId
  if (!manifest.projectId) {
    errors.push('Project ID é obrigatório');
  } else {
    const projectIdValidation = validateProjectId(manifest.projectId);
    if (!projectIdValidation.valid) {
      errors.push(`Project ID: ${projectIdValidation.error}`);
    }
  }

  // Deve ter version
  if (!manifest.version) {
    errors.push('Versão é obrigatória');
  }

  // Deve ter components
  if (!manifest.components) {
    errors.push('Componentes são obrigatórios');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Mostrar erros de validação formatados
 */
function showValidationErrors(errors, context = 'Validação') {
  if (errors.length === 0) {
    return;
  }

  console.error(chalk.red.bold(`❌ ${context} falhou:`));
  errors.forEach(error => {
    console.error(chalk.red(`   - ${error}`));
  });
}

/**
 * Validar e mostrar resultado
 */
function validateAndShow(validationResult, context = 'Validação') {
  if (!validationResult.valid) {
    showValidationErrors(validationResult.errors, context);
    return false;
  }
  return true;
}

module.exports = {
  validateProjectId,
  validateSupabaseUrl,
  validateServiceKey,
  validateAnonKey,
  validateDatabaseUrl,
  validateBackupDir,
  validateConfig,
  validateBackupOptions,
  validateRestoreOptions,
  validateSecretsFile,
  validateFunctionName,
  validateBackupManifest,
  showValidationErrors,
  validateAndShow
};
