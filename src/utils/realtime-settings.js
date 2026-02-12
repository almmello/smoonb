const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');
const { t } = require('../i18n');

/**
 * Captura configurações de Realtime Settings interativamente
 * @param {string} projectId - ID do projeto Supabase
 * @param {string} backupDir - Diretório do backup atual
 * @param {boolean} skipInteractive - Se deve pular a etapa interativa
 * @returns {Promise<Object>} Configurações capturadas
 */
async function captureRealtimeSettings(projectId, backupDir, skipInteractive = false) {
  const settingsFile = path.join(backupDir, 'realtime-settings.json');
  const dashboardUrl = `https://supabase.com/dashboard/project/${projectId}/realtime/settings`;
  
  const previous = await getPreviousRealtimeSettings(backupDir);
  const previousSettings = previous ? previous.settings : null;
  const previousBackupName = previous ? previous.backupName : null;

  const getT = global.smoonbI18n?.t || t;

  if (skipInteractive && previousSettings) {
    console.log(`📋 ${getT('utils.realtime.copying')}`);
    await fs.writeFile(settingsFile, JSON.stringify(previousSettings, null, 2));
    return { settings: previousSettings, source: 'reused', reusedFrom: previousBackupName };
  }

  if (previousSettings && !skipInteractive) {
    const shouldReuse = await askToReusePreviousSettings();
    if (shouldReuse) {
      console.log(`📋 ${getT('utils.realtime.reusing')}`);
      await fs.writeFile(settingsFile, JSON.stringify(previousSettings, null, 2));
      return { settings: previousSettings, source: 'reused', reusedFrom: previousBackupName };
    }
  }

  // Capturar configurações interativamente
  console.log(`\n🔧 ${getT('utils.realtime.configTitle')}`);
  console.log(getT('utils.realtime.separator'));
  console.log(`📱 ${getT('utils.realtime.access', { url: dashboardUrl })}`);
  console.log(`📝 ${getT('utils.realtime.note')}\n`);

  const settings = await captureSettingsInteractively(projectId, previousSettings);

  await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2));
  console.log(`\n✅ ${getT('utils.realtime.saved')}`);

  return { settings, source: 'interactive' };
}

/**
 * Busca configurações de backup anterior
 * @param {string} backupDir - Diretório do backup atual
 * @returns {Promise<{ settings: Object, backupName: string }|null>} Configurações anteriores e nome do backup, ou null
 */
async function getPreviousRealtimeSettings(backupDir) {
  try {
    const backupsDir = path.dirname(backupDir);
    const entries = await fs.readdir(backupsDir, { withFileTypes: true });
    const backupDirs = entries
      .filter(entry => entry.isDirectory() && entry.name.startsWith('backup-'))
      .map(entry => entry.name)
      .sort()
      .reverse();

    for (const backupName of backupDirs) {
      const settingsPath = path.join(backupsDir, backupName, 'realtime-settings.json');
      try {
        const content = await fs.readFile(settingsPath, 'utf8');
        const settings = JSON.parse(content);
        if (settings.realtime_settings && settings.realtime_settings.settings) {
          return { settings, backupName };
        }
      } catch {
        continue;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Pergunta se deve reutilizar configurações anteriores
 * @returns {Promise<boolean>} true se deve reutilizar
 */
async function askToReusePreviousSettings() {
  const getT = global.smoonbI18n?.t || t;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(`🔄 ${getT('utils.realtime.previousFound')}\n   ${getT('utils.realtime.reuse')} (S/n): `, (answer) => {
      rl.close();
      const shouldReuse = !answer.toLowerCase().startsWith('n');
      resolve(shouldReuse);
    });
  });
}

/**
 * Captura configurações interativamente via perguntas
 * @param {string} projectId - ID do projeto Supabase
 * @param {Object} previousSettings - Configurações anteriores para usar como padrão
 * @returns {Promise<Object>} Configurações capturadas
 */
async function captureSettingsInteractively(projectId, previousSettings) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const askQuestion = (question, defaultValue) => {
    return new Promise((resolve) => {
      rl.question(`${question} [${defaultValue}]: `, (answer) => {
        resolve(answer.trim() || defaultValue);
      });
    });
  };
  
  const getT = global.smoonbI18n?.t || t;
  
  try {
    console.log(`📋 ${getT('utils.realtime.questions')}\n`);
    
    // Valores padrão baseados na imagem ou configurações anteriores
    const defaults = previousSettings?.realtime_settings?.settings || {
      enable_realtime_service: { value: true },
      allow_public_access: { value: true },
      database_connection_pool_size: { value: 2 },
      max_concurrent_clients: { value: 200 },
      max_events_per_second: { value: 100 },
      max_presence_events_per_second: { value: 100 },
      max_payload_size_kb: { value: 100 }
    };
    
    const enableRealtime = await askQuestion(
      '1. Enable Realtime service (true/false):',
      defaults.enable_realtime_service?.value ?? true
    );
    
    const allowPublicAccess = await askQuestion(
      '2. Allow public access (true/false):',
      defaults.allow_public_access.value
    );
    
    const poolSize = await askQuestion(
      '3. Database connection pool size:',
      defaults.database_connection_pool_size.value
    );
    
    const maxClients = await askQuestion(
      '4. Max concurrent clients:',
      defaults.max_concurrent_clients.value
    );
    
    const maxEvents = await askQuestion(
      '5. Max events per second:',
      defaults.max_events_per_second.value
    );
    
    const maxPresenceEvents = await askQuestion(
      '6. Max presence events per second:',
      defaults.max_presence_events_per_second?.value ?? 100
    );
    
    const maxPayloadSize = await askQuestion(
      '7. Max payload size in KB:',
      defaults.max_payload_size_kb?.value ?? 100
    );
    
    const settings = {
      realtime_settings: {
        note: "Configurações de Realtime Settings capturadas interativamente",
        dashboard_url: `https://supabase.com/dashboard/project/${projectId}/realtime/settings`,
        captured_at: new Date().toISOString(),
        settings: {
          enable_realtime_service: {
            label: "Enable Realtime service",
            description: "If disabled, no clients will be able to connect and new connections will be rejected",
            value: enableRealtime === 'true' || enableRealtime === true
          },
          allow_public_access: {
            label: "Allow public access",
            description: "If disabled, only private channels will be allowed",
            value: allowPublicAccess === 'true' || allowPublicAccess === true
          },
          database_connection_pool_size: {
            label: "Database connection pool size",
            description: "Realtime Authorization uses this database pool to check client access",
            value: parseInt(poolSize)
          },
          max_concurrent_clients: {
            label: "Max concurrent clients", 
            description: "Sets maximum number of concurrent clients that can connect to your Realtime service",
            value: parseInt(maxClients)
          },
          max_events_per_second: {
            label: "Max events per second",
            description: "Sets maximum number of events per second that can be sent to your Realtime service",
            value: parseInt(maxEvents)
          },
          max_presence_events_per_second: {
            label: "Max presence events per second",
            description: "Sets maximum number of presence events per second",
            value: parseInt(maxPresenceEvents)
          },
          max_payload_size_kb: {
            label: "Max payload size in KB",
            description: "Sets maximum payload size in KB",
            value: parseInt(maxPayloadSize)
          }
        },
        restore_instructions: {
          url: `https://supabase.com/dashboard/project/${projectId}/realtime/settings`,
          steps: [
            "1. Acesse a URL acima",
            "2. Configure 'Enable Realtime service' conforme o valor em settings.enable_realtime_service.value",
            "3. Configure 'Allow public access' conforme o valor em settings.allow_public_access.value",
            "4. Configure 'Database connection pool size' conforme o valor em settings.database_connection_pool_size.value",
            "5. Configure 'Max concurrent clients' conforme o valor em settings.max_concurrent_clients.value", 
            "6. Configure 'Max events per second' conforme o valor em settings.max_events_per_second.value",
            "7. Configure 'Max presence events per second' conforme o valor em settings.max_presence_events_per_second.value",
            "8. Configure 'Max payload size in KB' conforme o valor em settings.max_payload_size_kb.value",
            "9. Clique em 'Save changes'"
          ]
        }
      }
    };
    
    return settings;
    
  } finally {
    rl.close();
  }
}

module.exports = {
  captureRealtimeSettings
};
