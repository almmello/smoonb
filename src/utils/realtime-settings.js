const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');

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
  
  // Tentar ler configurações de backup anterior
  const previousSettings = await getPreviousRealtimeSettings(backupDir);
  
  if (skipInteractive && previousSettings) {
    console.log('📋 Copiando Realtime Settings do backup anterior...');
    await fs.writeFile(settingsFile, JSON.stringify(previousSettings, null, 2));
    return previousSettings;
  }
  
  if (previousSettings && !skipInteractive) {
    const shouldReuse = await askToReusePreviousSettings();
    if (shouldReuse) {
      console.log('📋 Reutilizando configurações de Realtime Settings do backup anterior...');
      await fs.writeFile(settingsFile, JSON.stringify(previousSettings, null, 2));
      return previousSettings;
    }
  }
  
  // Capturar configurações interativamente
  console.log('\n🔧 Configurações de Realtime Settings');
  console.log('═'.repeat(50));
  console.log(`📱 Acesse: ${dashboardUrl}`);
  console.log('📝 Anote os valores dos 4 parâmetros abaixo:\n');
  
  const settings = await captureSettingsInteractively(projectId, previousSettings);
  
  // Salvar configurações
  await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2));
  console.log('\n✅ Configurações de Realtime Settings salvas!');
  
  return settings;
}

/**
 * Busca configurações de backup anterior
 * @param {string} backupDir - Diretório do backup atual
 * @returns {Promise<Object|null>} Configurações anteriores ou null
 */
async function getPreviousRealtimeSettings(backupDir) {
  try {
    // Buscar em backups anteriores
    const backupsDir = path.dirname(backupDir);
    const entries = await fs.readdir(backupsDir, { withFileTypes: true });
    const backupDirs = entries
      .filter(entry => entry.isDirectory() && entry.name.startsWith('backup-'))
      .map(entry => entry.name)
      .sort()
      .reverse(); // Mais recente primeiro
    
    for (const backupName of backupDirs) {
      const settingsPath = path.join(backupsDir, backupName, 'realtime-settings.json');
      try {
        const content = await fs.readFile(settingsPath, 'utf8');
        const settings = JSON.parse(content);
        if (settings.realtime_settings && settings.realtime_settings.settings) {
          return settings;
        }
      } catch {
        // Continuar para próximo backup
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
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question('🔄 Foi identificada uma gravação anterior de Realtime Settings.\n   Deseja reutilizar as configurações anteriores? (S/n): ', (answer) => {
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
  
  try {
    console.log('📋 Responda as perguntas abaixo (pressione Enter para usar o valor padrão):\n');
    
    // Valores padrão baseados na imagem ou configurações anteriores
    const defaults = previousSettings?.realtime_settings?.settings || {
      allow_public_access: { value: true },
      database_connection_pool_size: { value: 2 },
      max_concurrent_clients: { value: 200 },
      max_events_per_second: { value: 100 }
    };
    
    const allowPublicAccess = await askQuestion(
      '1. Allow public access (true/false):',
      defaults.allow_public_access.value
    );
    
    const poolSize = await askQuestion(
      '2. Database connection pool size:',
      defaults.database_connection_pool_size.value
    );
    
    const maxClients = await askQuestion(
      '3. Max concurrent clients:',
      defaults.max_concurrent_clients.value
    );
    
    const maxEvents = await askQuestion(
      '4. Max events per second:',
      defaults.max_events_per_second.value
    );
    
    const settings = {
      realtime_settings: {
        note: "Configurações de Realtime Settings capturadas interativamente",
        dashboard_url: `https://supabase.com/dashboard/project/${projectId}/realtime/settings`,
        captured_at: new Date().toISOString(),
        settings: {
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
          }
        },
        restore_instructions: {
          url: `https://supabase.com/dashboard/project/${projectId}/realtime/settings`,
          steps: [
            "1. Acesse a URL acima",
            "2. Configure 'Allow public access' conforme o valor em settings.allow_public_access.value",
            "3. Configure 'Database connection pool size' conforme o valor em settings.database_connection_pool_size.value",
            "4. Configure 'Max concurrent clients' conforme o valor em settings.max_concurrent_clients.value", 
            "5. Configure 'Max events per second' conforme o valor em settings.max_events_per_second.value",
            "6. Clique em 'Save changes'"
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
