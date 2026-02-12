const fs = require('fs');
const path = require('path');

/**
 * Códigos de locale suportados
 */
const SUPPORTED_LOCALES = ['en', 'pt-BR'];

/**
 * Aliases de locale (normalização)
 */
const LOCALE_ALIASES = {
  'en-US': 'en',
  'en_US': 'en',
  'pt': 'pt-BR',
  'pt_BR': 'pt-BR',
  'pt-BR': 'pt-BR'
};

/**
 * Cache de catálogos carregados
 */
const catalogCache = {};

/**
 * Normalizar código de locale
 * @param {string} locale - Código de locale a normalizar
 * @returns {string} - Código normalizado ou null se inválido
 */
function normalizeLocale(locale) {
  if (!locale || typeof locale !== 'string') {
    return null;
  }

  // Normalizar separadores (underscore/hífen)
  const normalized = locale.replace('_', '-');

  // Verificar se é um alias conhecido
  if (LOCALE_ALIASES[normalized]) {
    return LOCALE_ALIASES[normalized];
  }

  // Verificar se é um locale suportado diretamente
  if (SUPPORTED_LOCALES.includes(normalized)) {
    return normalized;
  }

  // Tentar extrair código base (ex: pt-BR.UTF-8 -> pt-BR)
  const baseLocale = normalized.split('.')[0].split('-')[0];
  if (baseLocale === 'en') {
    return 'en';
  }
  if (baseLocale === 'pt') {
    return 'pt-BR';
  }

  return null;
}

/**
 * Detectar locale do sistema
 * @param {NodeJS.ProcessEnv} env - Variáveis de ambiente
 * @returns {string|null} - Código de locale ou null
 */
function detectSystemLocale(env) {
  // Verificar LANG, LC_ALL, LC_MESSAGES (ordem de precedência)
  const localeVars = ['LANG', 'LC_ALL', 'LC_MESSAGES'];
  
  for (const varName of localeVars) {
    if (env[varName]) {
      const normalized = normalizeLocale(env[varName]);
      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
}

/**
 * Detectar locale baseado em argumentos CLI, .env.local, env e sistema
 * @param {string[]} argv - Argumentos da linha de comando
 * @param {NodeJS.ProcessEnv} env - Variáveis de ambiente
 * @returns {string} - Código de locale (padrão: 'en')
 */
function detectLocale(_argv = [], env = process.env) {
  // 1. Verificar SMOONB_LANG do .env.local (síncrono para evitar problemas de inicialização)
  try {
    const envLocalPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envLocalPath)) {
      const envContent = fs.readFileSync(envLocalPath, 'utf8');
      const envLines = envContent.replace(/\r\n/g, '\n').split('\n');
      for (const line of envLines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = line.indexOf('=');
        if (eqIndex === -1) continue;
        const key = line.slice(0, eqIndex).trim();
        if (key === 'SMOONB_LANG') {
          let value = line.slice(eqIndex + 1).trim();
          // Remove optional quotes
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          const normalized = normalizeLocale(value);
          if (normalized) {
            return normalized;
          }
        }
      }
    }
  } catch {
    // Ignorar erros ao ler .env.local (pode não existir ainda)
  }

  // 2. Verificar variável de ambiente SMOONB_LANG
  if (env.SMOONB_LANG) {
    const normalized = normalizeLocale(env.SMOONB_LANG);
    if (normalized) {
      return normalized;
    }
  }

  // 3. Verificar locale do sistema
  const systemLocale = detectSystemLocale(env);
  if (systemLocale) {
    return systemLocale;
  }

  // 4. Fallback para inglês
  return 'en';
}

/**
 * Carregar catálogo de traduções
 * @param {string} locale - Código de locale
 * @returns {Object} - Catálogo de traduções
 */
function loadCatalog(locale) {
  // Validar locale
  const normalized = normalizeLocale(locale) || 'en';
  
  // Verificar cache
  if (catalogCache[normalized]) {
    return catalogCache[normalized];
  }

  // Caminho do arquivo de locale
  const localePath = path.join(__dirname, 'locales', `${normalized}.json`);

  // Carregar catálogo
  let catalog = {};
  try {
    if (fs.existsSync(localePath)) {
      const content = fs.readFileSync(localePath, 'utf8');
      catalog = JSON.parse(content);
    }
  } catch (error) {
    console.error(`Erro ao carregar catálogo ${normalized}:`, error.message);
  }

  // Sempre carregar fallback (en) para chaves ausentes
  if (normalized !== 'en') {
    const fallbackPath = path.join(__dirname, 'locales', 'en.json');
    try {
      if (fs.existsSync(fallbackPath)) {
        const fallbackContent = fs.readFileSync(fallbackPath, 'utf8');
        const fallbackCatalog = JSON.parse(fallbackContent);
        // Mesclar com fallback (catálogo atual tem prioridade)
        catalog = { ...fallbackCatalog, ...catalog };
      }
    } catch (error) {
      console.error('Erro ao carregar catálogo fallback (en):', error.message);
    }
  }

  // Armazenar no cache
  catalogCache[normalized] = catalog;

  return catalog;
}

/**
 * Função de tradução
 * @param {string} id - ID da chave de tradução
 * @param {Record<string, string|number>} vars - Variáveis para substituição
 * @param {string} locale - Locale a usar (opcional, usa o atual se não fornecido)
 * @returns {string} - Texto traduzido
 */
function t(id, vars = {}, locale = null) {
  // Determinar locale a usar
  const catalog = locale ? loadCatalog(locale) : (global.smoonbI18n?.catalog || loadCatalog('en'));

  // Buscar tradução
  let translation = catalog[id] || id;

  // Substituir placeholders nomeados (ex: {name}, {path})
  if (typeof translation === 'string' && Object.keys(vars).length > 0) {
    translation = translation.replace(/{(\w+)}/g, (match, key) => {
      return vars[key] !== undefined ? String(vars[key]) : match;
    });
  }

  return translation;
}

/**
 * Inicializar i18n com locale detectado
 * @param {string[]} argv - Argumentos da linha de comando
 * @param {NodeJS.ProcessEnv} env - Variáveis de ambiente
 * @returns {Object} - Objeto com locale, catalog e função t
 */
function initI18n(argv = process.argv, env = process.env) {
  const locale = detectLocale(argv, env);
  const catalog = loadCatalog(locale);

  // Armazenar globalmente para acesso fácil
  global.smoonbI18n = {
    locale,
    catalog,
    t: (id, vars) => t(id, vars, locale)
  };

  return global.smoonbI18n;
}

module.exports = {
  detectLocale,
  loadCatalog,
  t,
  initI18n,
  SUPPORTED_LOCALES,
  normalizeLocale
};

