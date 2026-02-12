/**
 * Utilitários para conexão e operações com Supabase
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

/**
 * Cliente Supabase configurado
 */
let supabaseClient = null;

/**
 * Encontrar caminho do pg_dump no Windows
 */
function findPgDumpPath() {
  // Tentar configuração personalizada primeiro
  const config = loadConfig();
  if (config?.backup?.pgDumpPath && fs.existsSync(config.backup.pgDumpPath)) {
    return config.backup.pgDumpPath;
  }
  
  // Detecção automática no Windows
  const possiblePaths = [
    'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\14\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\13\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\12\\bin\\pg_dump.exe',
    'pg_dump' // Fallback para PATH
  ];
  
  for (const pgPath of possiblePaths) {
    try {
      if (pgPath === 'pg_dump') {
        // Testar se está no PATH
        execSync('pg_dump --version', { stdio: 'pipe' });
        return pgPath;
      } else if (fs.existsSync(pgPath)) {
        return pgPath;
      }
    } catch {
      // Continuar para o próximo caminho
      continue;
    }
  }
  
  throw new Error('pg_dump não encontrado. Instale o PostgreSQL ou configure pgDumpPath no .smoonbrc');
}

/**
 * Inicializar cliente Supabase
 */
function initSupabaseClient() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios');
    }

    supabaseClient = createClient(supabaseUrl, supabaseKey);
    return supabaseClient;
  } catch (error) {
    throw new Error(`Erro ao inicializar cliente Supabase: ${error.message}`);
  }
}

/**
 * Obter cliente Supabase (inicializa se necessário)
 */
function getSupabaseClient() {
  if (!supabaseClient) {
    return initSupabaseClient();
  }
  return supabaseClient;
}

/**
 * Carregar configuração do arquivo .smoonbrc
 */
function loadConfig() {
  // Primeiro tentar no diretório do projeto atual
  const projectConfigPath = path.join(process.cwd(), '.smoonbrc');
  
  try {
    if (fs.existsSync(projectConfigPath)) {
      const configContent = fs.readFileSync(projectConfigPath, 'utf8');
      return JSON.parse(configContent);
    }
  } catch (error) {
    console.warn('Erro ao carregar configuração do projeto:', error.message);
  }
  
  // Fallback: tentar no diretório home
  const homeConfigPath = path.join(os.homedir(), '.smoonbrc');
  
  try {
    if (fs.existsSync(homeConfigPath)) {
      const configContent = fs.readFileSync(homeConfigPath, 'utf8');
      return JSON.parse(configContent);
    }
  } catch (error) {
    console.warn('Erro ao carregar configuração do home:', error.message);
  }
  
  return null;
}

/**
 * Salvar configuração no arquivo .smoonbrc
 */
function saveConfig(config) {
  // Salvar no diretório do projeto atual
  const projectConfigPath = path.join(process.cwd(), '.smoonbrc');
  
  try {
    fs.writeFileSync(projectConfigPath, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('Erro ao salvar configuração:', error.message);
    return false;
  }
}

/**
 * Obter Project ID do Supabase
 */
function getProjectId() {
  // Tentar variável de ambiente primeiro
  if (process.env.SUPABASE_PROJECT_ID) {
    return process.env.SUPABASE_PROJECT_ID;
  }
  
  // Tentar configuração
  const config = loadConfig();
  if (config?.supabase?.projectId && 
      config.supabase.projectId.trim() !== '' && 
      config.supabase.projectId !== 'your-project-id-here') {
    return config.supabase.projectId;
  }
  
  return null;
}

/**
 * Obter URL de conexão da database
 */
function getDatabaseUrl(projectId = null) {
  // Tentar variável de ambiente primeiro
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  
  // Tentar configuração
  const config = loadConfig();
  if (config?.supabase?.databaseUrl && 
      config.supabase.databaseUrl.trim() !== '' && 
      !config.supabase.databaseUrl.includes('your-project') &&
      !config.supabase.databaseUrl.includes('[password]')) {
    return config.supabase.databaseUrl;
  }
  
  // Se projectId foi fornecido, usar URL padrão
  if (projectId) {
    return `postgresql://postgres:[password]@db.${projectId}.supabase.co:5432/postgres`;
  }
  
  return null;
}

/**
 * Obter URL do projeto Supabase
 */
function getSupabaseUrl(projectId) {
  // Tentar variável de ambiente primeiro
  if (process.env.SUPABASE_URL) {
    return process.env.SUPABASE_URL;
  }
  
  // Tentar configuração
  const config = loadConfig();
  if (config?.supabase?.url) {
    return config.supabase.url;
  }
  
  // URL padrão
  return `https://${projectId}.supabase.co`;
}

/**
 * Obter service key do Supabase
 */
function getServiceKey() {
  // Tentar variável de ambiente primeiro
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
  
  // Tentar configuração
  const config = loadConfig();
  if (config?.supabase?.serviceKey) {
    return config.supabase.serviceKey;
  }
  
  return null;
}

/**
 * Obter anon key do Supabase
 */
function getAnonKey() {
  // Tentar variável de ambiente primeiro
  if (process.env.SUPABASE_ANON_KEY) {
    return process.env.SUPABASE_ANON_KEY;
  }
  
  // Tentar configuração
  const config = loadConfig();
  if (config?.supabase?.anonKey) {
    return config.supabase.anonKey;
  }
  
  return null;
}

/**
 * Verificar se credenciais estão configuradas
 */
function hasCredentials() {
  return !!(getSupabaseUrl() && (getServiceKey() || getAnonKey()));
}

/**
 * Testar conexão com Supabase
 */
async function testConnection() {
  try {
    const client = getSupabaseClient();
    
    // Tentar uma operação simples
    const { error: testError } = await client.from('_smoonb_test').select('*').limit(1);
    
    if (testError && testError.code !== 'PGRST116') { // PGRST116 = tabela não existe (esperado)
      throw testError;
    }
    
    return { success: true, message: 'Conexão estabelecida com sucesso' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * Obter informações do projeto
 */
async function getProjectInfo(projectId) {
  try {
    getSupabaseClient(); // Garantir que cliente está disponível
    
    // TODO: Implementar busca real de informações do projeto
    // Por enquanto, retornar informações básicas
    return {
      id: projectId,
      url: getSupabaseUrl(projectId),
      status: 'active',
      region: 'unknown',
      created_at: new Date().toISOString()
    };
  } catch (error) {
    throw new Error(`Erro ao obter informações do projeto: ${error.message}`);
  }
}

/**
 * Listar tabelas da database
 */
async function listTables() {
  const client = getSupabaseClient();
  try {
    
    // Usar RPC para listar tabelas
    const { data, error } = await client.rpc('get_tables');
    
    if (error) {
      throw error;
    }
    
    return data || [];
  } catch {
    // Fallback: tentar query direta
    try {
      const { data, error } = await client
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public');
      
      if (error) {
        throw error;
      }
      
      return data?.map(row => row.table_name) || [];
    } catch (fallbackError) {
      throw new Error(`Erro ao listar tabelas: ${fallbackError.message}`);
    }
  }
}

/**
 * Listar extensões instaladas
 */
async function listExtensions() {
  const client = getSupabaseClient();
  try {
    
    // Usar RPC para listar extensões
    const { data, error } = await client.rpc('get_extensions');
    
    if (error) {
      throw error;
    }
    
    return data || [];
  } catch {
    // Fallback: tentar query direta
    try {
      const { data, error } = await client
        .from('pg_extension')
        .select('extname');
      
      if (error) {
        throw error;
      }
      
      return data?.map(row => row.extname) || [];
    } catch (fallbackError) {
      throw new Error(`Erro ao listar extensões: ${fallbackError.message}`);
    }
  }
}

/**
 * Obter configurações de Auth
 */
async function getAuthSettings() {
  try {
    getSupabaseClient(); // Garantir que cliente está disponível
    
    // TODO: Implementar busca real de configurações de Auth
    // Por enquanto, retornar estrutura básica
    return {
      providers: [],
      policies: [],
      settings: {
        enable_signup: true,
        enable_email_confirmations: true
      }
    };
  } catch (error) {
    throw new Error(`Erro ao obter configurações de Auth: ${error.message}`);
  }
}

/**
 * Obter configurações de Storage
 */
async function getStorageSettings() {
  try {
    const client = getSupabaseClient();
    
    // Listar buckets
    const { data: buckets, error: bucketsError } = await client.storage.listBuckets();
    
    if (bucketsError) {
      throw bucketsError;
    }
    
    // Para cada bucket, listar objetos
    const bucketsWithObjects = [];
    for (const bucket of buckets) {
      const { data: objects } = await client.storage
        .from(bucket.name)
        .list();
      
      bucketsWithObjects.push({
        ...bucket,
        objects: objects || []
      });
    }
    
    return {
      buckets: bucketsWithObjects,
      total_buckets: buckets.length,
      total_objects: bucketsWithObjects.reduce((sum, bucket) => sum + bucket.objects.length, 0)
    };
  } catch (error) {
    throw new Error(`Erro ao obter configurações de Storage: ${error.message}`);
  }
}

/**
 * Obter configurações de Realtime
 */
async function getRealtimeSettings() {
  try {
    getSupabaseClient(); // Garantir que cliente está disponível
    
    // TODO: Implementar busca real de configurações de Realtime
    // Por enquanto, retornar estrutura básica
    return {
      enabled: true,
      channels: [],
      settings: {
        max_channels_per_client: 100,
        max_events_per_second: 100
      }
    };
  } catch (error) {
    throw new Error(`Erro ao obter configurações de Realtime: ${error.message}`);
  }
}

module.exports = {
  initSupabaseClient,
  getSupabaseClient,
  loadConfig,
  saveConfig,
  getProjectId,
  getDatabaseUrl,
  getSupabaseUrl,
  getServiceKey,
  getAnonKey,
  hasCredentials,
  testConnection,
  getProjectInfo,
  listTables,
  listExtensions,
  getAuthSettings,
  getStorageSettings,
  getRealtimeSettings,
  findPgDumpPath
};
