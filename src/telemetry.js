/**
 * Telemetria best-effort: não bloqueia execução.
 * Só envia se SMOONB_TELEMETRY_ENABLED !== 'false'.
 * Usa o mesmo installationId que a validação de licença (src/utils/installationId.js).
 */
const path = require('path');
const https = require('https');
const { APP_CONFIG } = require('./config/appConfig');
const { getOrCreateInstallationId } = require('./utils/installationId');

/**
 * Envia evento de telemetria em background (não bloqueia).
 * @param {object} opts
 * @param {boolean} opts.enabled - se false, não envia
 * @param {string} opts.command - ex: 'backup', 'restore'
 * @param {number} opts.durationMs
 * @param {boolean} opts.success
 * @param {string} [opts.errorCode] - código genérico em falha
 */
function sendTelemetry(opts) {
  const { enabled, command, durationMs, success, errorCode } = opts;
  if (enabled === false) return;

  const url = `${APP_CONFIG.telemetryUrl}/v1/telemetry`;
  let packageVersion = '0.0.0';
  try {
    const pkg = require(path.join(__dirname, '..', 'package.json'));
    if (pkg && pkg.version) packageVersion = pkg.version;
  } catch {
    // ignore
  }

  getOrCreateInstallationId()
    .then((installationId) => {
      const body = {
        installationId,
        command,
        durationMs,
        success: !!success,
        cliVersion: packageVersion,
        platform: process.platform,
        arch: process.arch
      };
      if (errorCode) body.errorCode = errorCode;

      const bodyStr = JSON.stringify(body);
      const u = new URL(url);
      const options = {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          'User-Agent': `smoonb-cli/${packageVersion}`
        }
      };
      const req = https.request(options, () => {});
      req.on('error', () => {});
      req.setTimeout(5000, () => {
        req.destroy();
      });
      req.write(bodyStr);
      req.end();
    })
    .catch(() => {});
}

module.exports = { getOrCreateInstallationId, sendTelemetry };
