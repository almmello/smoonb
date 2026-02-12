/**
 * Parâmetros internos do produto (não expostos em env do usuário).
 * Controlados apenas via atualização do CLI.
 * Base única: https://www.smoonb.com
 */
const APP_CONFIG = {
  apiBaseUrl: 'https://www.smoonb.com',
  appUrl: 'https://www.smoonb.com',
  telemetryUrl: 'https://www.smoonb.com',
  healthCheckUrl: 'https://www.smoonb.com/api/health'
};

module.exports = { APP_CONFIG };
