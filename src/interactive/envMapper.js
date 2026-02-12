const inquirer = require('inquirer');
const chalk = require('chalk');
const { confirm } = require('../utils/prompt');
const { t } = require('../i18n');
const ui = require('../utils/cliUi');

let _printedSupabasePostgresMajorHint = false;

function printSupabasePostgresMajorHintOnce(getT) {
  if (_printedSupabasePostgresMajorHint) return;
  _printedSupabasePostgresMajorHint = true;
  ui.link(`   ℹ️ ${getT('env.supabasePostgresMajor.hintTitle')}`);
  ui.info(`      ${getT('env.supabasePostgresMajor.hintPath')}`);
  ui.hint(`      ${getT('env.supabasePostgresMajor.hintBody')}`);
}

async function mapEnvVariablesInteractively(env, expectedKeys) {
  _printedSupabasePostgresMajorHint = false;
  const finalEnv = { ...env };
  const dePara = {};

  const allKeys = Object.keys(env);
  let projectId = null;

  // Função auxiliar para obter Project ID já mapeado
  function getProjectId() {
    if (projectId) return projectId;
    // Tentar encontrar Project ID já mapeado
    const projectIdKey = Object.keys(dePara).find(k => dePara[k] === 'SUPABASE_PROJECT_ID');
    if (projectIdKey && finalEnv[projectIdKey]) {
      projectId = finalEnv[projectIdKey];
      return projectId;
    }
    // Tentar encontrar no env original
    const originalKey = Object.keys(env).find(k => k === 'SUPABASE_PROJECT_ID' || env[k]?.match(/^[a-z]{20}$/));
    if (originalKey && env[originalKey]) {
      projectId = env[originalKey];
      return projectId;
    }
    return null;
  }

  // Função para obter instruções e links específicos para cada variável
  function getVariableInstructions(expected, currentProjectId) {
    const instructions = {
      'SUPABASE_PROJECT_ID': {
        notFound: 'Não foi encontrada uma entrada para a variável SUPABASE_PROJECT_ID.',
        help: 'Encontre em: Dashboard -> Project Settings -> General -> General Settings -> Project ID',
        link: null
      },
      'NEXT_PUBLIC_SUPABASE_URL': {
        notFound: 'Não foi encontrada uma entrada para a variável NEXT_PUBLIC_SUPABASE_URL.',
        help: currentProjectId 
          ? `https://supabase.com/dashboard/project/${currentProjectId}/settings/api`
          : 'Dashboard -> Project Settings -> API -> Project URL',
        link: currentProjectId ? `https://supabase.com/dashboard/project/${currentProjectId}/settings/api` : null
      },
      'NEXT_PUBLIC_SUPABASE_ANON_KEY': {
        notFound: 'Não foi encontrada uma entrada para a variável NEXT_PUBLIC_SUPABASE_ANON_KEY.',
        help: currentProjectId
          ? `https://supabase.com/dashboard/project/${currentProjectId}/settings/api-keys`
          : 'Dashboard -> Project Settings -> API -> API Keys -> anon public',
        link: currentProjectId ? `https://supabase.com/dashboard/project/${currentProjectId}/settings/api-keys` : null
      },
      'SUPABASE_SERVICE_ROLE_KEY': {
        notFound: 'Não foi encontrada uma entrada para a variável SUPABASE_SERVICE_ROLE_KEY.',
        help: currentProjectId
          ? `https://supabase.com/dashboard/project/${currentProjectId}/settings/api-keys`
          : 'Dashboard -> Project Settings -> API -> API Keys -> service_role secret',
        link: currentProjectId ? `https://supabase.com/dashboard/project/${currentProjectId}/settings/api-keys` : null
      },
      'SUPABASE_DB_URL': {
        notFound: 'Não foi encontrada uma entrada para a variável SUPABASE_DB_URL.',
        help: currentProjectId
          ? `Formato: postgresql://postgres:[DATABASE_PASSWORD]@db.${currentProjectId}.supabase.co:5432/postgres\nPara resetar senha: https://supabase.com/dashboard/project/${currentProjectId}/database/settings`
          : 'Formato: postgresql://postgres:[DATABASE_PASSWORD]@db.[PROJECT_ID].supabase.co:5432/postgres\nPara resetar senha: Dashboard -> Project Settings -> Database -> Database Settings',
        link: currentProjectId ? `https://supabase.com/dashboard/project/${currentProjectId}/database/settings` : null
      },
      'SUPABASE_ACCESS_TOKEN': {
        notFound: 'Não foi encontrada uma entrada para a variável SUPABASE_ACCESS_TOKEN.',
        help: 'https://supabase.com/dashboard/account/tokens',
        link: 'https://supabase.com/dashboard/account/tokens'
      },
      'SMOONB_OUTPUT_DIR': {
        notFound: 'Não foi encontrada uma entrada para a variável SMOONB_OUTPUT_DIR.',
        help: 'Diretório padrão para armazenar backups',
        link: null,
        default: './backups'
      },
      'SUPABASE_POSTGRES_MAJOR': {
        notFound: '',
        help: '',
        link: null
      },
      'SMOONB_LICENSE_KEY': {
        notFound: '',
        help: '',
        link: null
      },
      'SMOONB_TELEMETRY_ENABLED': {
        notFound: '',
        help: '',
        link: null,
        default: 'true'
      }
    };

    return instructions[expected] || {
      notFound: `Não foi encontrada uma entrada para a variável ${expected}.`,
      help: '',
      link: null
    };
  }

  const getT = global.smoonbI18n?.t || t;

  function maskLicenseKey(value) {
    if (value == null || typeof value !== 'string') return '***';
    const t = value.trim();
    if (t.length <= 10) return '***';
    return `${t.slice(0, 6)}...${t.slice(-4)}`;
  }

  for (const expected of expectedKeys) {
    console.log(chalk.blue(`\n🔧 ${getT('env.mapping.title', { variable: expected })}`));
    if (expected === 'SUPABASE_POSTGRES_MAJOR') {
      printSupabasePostgresMajorHintOnce(getT);
    }

    let clientKey = undefined;

    // Se existir chave exatamente igual, pular seleção e ir direto para confirmação
    if (Object.prototype.hasOwnProperty.call(finalEnv, expected)) {
      clientKey = expected;
    } else if (allKeys.length > 0) {
      // Só mostrar seleção se houver chaves disponíveis no env
      const choices = [
        ...allKeys.map((k, idx) => ({ name: `${idx + 1}. ${k}`, value: k })),
        new inquirer.Separator(),
        { name: getT('env.mapping.addNew'), value: '__ADD_NEW__' }
      ];

      const { chosen } = await inquirer.prompt([{
        type: 'list',
        name: 'chosen',
        message: getT('env.mapping.selectKey', { expected }),
        choices,
        loop: false,
        prefix: ''
      }]);

      clientKey = chosen;
      if (chosen === '__ADD_NEW__') {
        clientKey = expected;
        if (Object.prototype.hasOwnProperty.call(finalEnv, clientKey)) {
          // Evitar colisão: gerar sufixo incremental
          let i = 2;
          while (Object.prototype.hasOwnProperty.call(finalEnv, `${clientKey}_${i}`)) i++;
          clientKey = `${clientKey}_${i}`;
        }
        finalEnv[clientKey] = '';
      }
    } else {
      // Se não há chaves no env, criar nova chave diretamente
      clientKey = expected;
      finalEnv[clientKey] = '';
    }

    const currentValue = finalEnv[clientKey] ?? '';
    const currentProjectId = getProjectId();
    const instructions = getVariableInstructions(expected, currentProjectId);
    if (expected === 'SMOONB_LICENSE_KEY' && instructions.help === '') {
      ui.hint(`   ${getT('env.licenseKey.help')}`);
    }
    if (expected === 'SMOONB_TELEMETRY_ENABLED' && instructions.help === '') {
      ui.hint(`   ${getT('env.telemetry.help')}`);
    }

    // Se não tem valor, mostrar mensagem específica e pular confirmação
    if (!currentValue) {
      console.log(chalk.yellow(getT('env.mapping.notFound', { variable: expected })));
      if (expected === 'SUPABASE_POSTGRES_MAJOR') {
        printSupabasePostgresMajorHintOnce(getT);
      } else if (instructions.help) {
        // Se o help contém link (https://), mostrar como link
        if (instructions.help.includes('https://')) {
          console.log(chalk.cyan(`🔗 ${instructions.help}`));
        } else {
          console.log(chalk.white(instructions.help));
          // Se há link separado e o help não contém link, mostrar link separado
          if (instructions.link && !instructions.help.includes('https://')) {
            console.log(chalk.cyan(`🔗 ${instructions.link}`));
          }
        }
      } else if (instructions.link) {
        console.log(chalk.cyan(`🔗 ${instructions.link}`));
      }
    } else {
      // Se tem valor, perguntar se está correto (mascarar licença na exibição)
      const displayValue = expected === 'SMOONB_LICENSE_KEY' ? maskLicenseKey(currentValue) : currentValue;
      const isCorrect = await confirm(`${getT('env.mapping.currentValue', { value: displayValue })}\n${getT('env.mapping.isCorrect')}`, true);
      if (isCorrect) {
        finalEnv[clientKey] = currentValue;
        if (expected === 'SUPABASE_PROJECT_ID') {
          projectId = currentValue;
        }
        if (dePara[clientKey] && dePara[clientKey] !== expected) {
          throw new Error(`Duplicidade de mapeamento detectada para ${clientKey}`);
        }
        dePara[clientKey] = expected;
        continue;
      }
    }

    // Solicitar novo valor
    let valueToWrite = '';
    if (expected === 'SMOONB_OUTPUT_DIR') {
      const { newValue } = await inquirer.prompt([{
        type: 'input',
        name: 'newValue',
        message: `Confirme o novo valor para ${expected}:`,
        default: instructions.default || './backups',
        prefix: ''
      }]);
      valueToWrite = newValue || instructions.default || './backups';
    } else if (expected === 'SMOONB_TELEMETRY_ENABLED') {
      const { newValue } = await inquirer.prompt([{
        type: 'input',
        name: 'newValue',
        message: `Valor para ${expected} (true/false):`,
        default: instructions.default || 'true',
        prefix: ''
      }]);
      valueToWrite = newValue || instructions.default || 'true';
    } else {
      const { newValue } = await inquirer.prompt([{
        type: 'input',
        name: 'newValue',
        message: expected === 'SMOONB_LICENSE_KEY' ? getT('license.promptPaste') : `Cole o novo valor para ${expected}:`,
        prefix: ''
      }]);
      valueToWrite = newValue || '';
    }

    // Validar valor obrigatório (exceto SMOONB_OUTPUT_DIR e SMOONB_TELEMETRY_ENABLED que têm default)
    if (!valueToWrite && expected !== 'SMOONB_OUTPUT_DIR' && expected !== 'SMOONB_TELEMETRY_ENABLED') {
      const { newValueRequired } = await inquirer.prompt([{
        type: 'input',
        name: 'newValueRequired',
        message: `Valor obrigatório. Informe valor para ${expected}:`,
        prefix: ''
      }]);
      valueToWrite = newValueRequired || '';
    }

    finalEnv[clientKey] = valueToWrite || (expected === 'SMOONB_OUTPUT_DIR' ? './backups' : expected === 'SMOONB_TELEMETRY_ENABLED' ? 'true' : '');
    if (expected === 'SUPABASE_PROJECT_ID') {
      projectId = valueToWrite;
    }
    if (dePara[clientKey] && dePara[clientKey] !== expected) {
      throw new Error(`Duplicidade de mapeamento detectada para ${clientKey}`);
    }
    dePara[clientKey] = expected;
  }

  // Após processar todas as variáveis, perguntar sobre idioma padrão se SMOONB_OUTPUT_DIR foi processado
  const outputDirProcessed = Object.values(dePara).includes('SMOONB_OUTPUT_DIR');
  if (outputDirProcessed) {
    const currentLang = finalEnv.SMOONB_LANG || '';
    const { normalizeLocale } = require('../i18n');
    
    const langChoices = [
      { name: getT('env.language.english'), value: 'en' },
      { name: getT('env.language.portuguese'), value: 'pt-BR' }
    ];

    const defaultLang = currentLang ? normalizeLocale(currentLang) || 'en' : 'en';
    const defaultIndex = langChoices.findIndex(c => c.value === defaultLang);

    const { selectedLang } = await inquirer.prompt([{
      type: 'list',
      name: 'selectedLang',
      message: getT('env.language.selectDefault'),
      choices: langChoices,
      default: defaultIndex >= 0 ? defaultIndex : 0,
      loop: false,
      prefix: ''
    }]);

    finalEnv.SMOONB_LANG = selectedLang;
    console.log(chalk.green(`✅ ${getT('env.language.saved', { lang: selectedLang })}`));
    console.log(chalk.yellow(`💡 ${getT('env.language.note')}`));
  }

  return { finalEnv, dePara };
}

async function askComponentsFlags() {
  const getT = global.smoonbI18n?.t || t;
  
  // Explicação sobre Edge Functions
  console.log(chalk.cyan(`\n⚡ ${getT('backup.components.edgeFunctions.title')}`));
  console.log(chalk.white(`   ${getT('backup.components.edgeFunctions.description1')}`));
  console.log(chalk.white(`   ${getT('backup.components.edgeFunctions.description2')}`));
  console.log(chalk.white(`   ${getT('backup.components.edgeFunctions.description3')}\n`));

  const includeFunctions = await confirm(getT('backup.components.edgeFunctions.include'), true);
  
  // Pergunta de limpeza de functions imediatamente após
  let cleanFunctions = false;
  if (includeFunctions) {
    cleanFunctions = await confirm(getT('backup.components.edgeFunctions.cleanup'), false);
  }

  // Explicação sobre .temp
  console.log(chalk.cyan(`\n📁 ${getT('backup.components.temp.title')}`));
  console.log(chalk.white(`   ${getT('backup.components.temp.description1')}`));
  console.log(chalk.white(`   ${getT('backup.components.temp.description2')}\n`));

  const includeTemp = await confirm(getT('backup.components.temp.include'), true);
  
  // Pergunta de limpeza de .temp imediatamente após
  let cleanTemp = false;
  if (includeTemp) {
    cleanTemp = await confirm(getT('backup.components.temp.cleanup'), false);
  }

  // Explicação sobre Migrations
  console.log(chalk.cyan(`\n📋 ${getT('backup.components.migrations.title')}`));
  console.log(chalk.white(`   ${getT('backup.components.migrations.description1')}`));
  console.log(chalk.white(`   ${getT('backup.components.migrations.description2')}`));
  console.log(chalk.white(`   ${getT('backup.components.migrations.description3')}\n`));

  const includeMigrations = await confirm(getT('backup.components.migrations.include'), true);
  
  // Pergunta de limpeza de migrations imediatamente após
  let cleanMigrations = false;
  if (includeMigrations) {
    cleanMigrations = await confirm(getT('backup.components.migrations.cleanup'), false);
  }

  // Continuar com outras perguntas
  const includeStorage = await confirm(getT('backup.components.storage.include'), true);
  const includeAuth = await confirm(getT('backup.components.auth.include'), true);
  const includeRealtime = await confirm(getT('backup.components.realtime.include'), true);

  return {
    includeFunctions,
    includeStorage,
    includeAuth,
    includeRealtime,
    includeTemp,
    includeMigrations,
    cleanFunctions,
    cleanTemp,
    cleanMigrations
  };
}

module.exports = {
  mapEnvVariablesInteractively,
  askComponentsFlags,
  printSupabasePostgresMajorHintOnce
};


