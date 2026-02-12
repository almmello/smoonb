const https = require('https');
const inquirer = require('inquirer');
const path = require('path');
const { readEnvFile, writeEnvFile } = require('../../../utils/env');
const { APP_CONFIG } = require('../../../config/appConfig');
const { t } = require('../../../i18n');
const ui = require('../../../utils/cliUi');
const { getOrCreateInstallationId, maskInstallationId } = require('../../../utils/installationId');
const {
  createCorrelationId,
  maskSecret,
  safeStringifyHeaders,
  truncateBody,
  sanitizeResponseParsedForBundle,
  classifyRequestError,
  buildSupportBundle,
  formatBundleForTerminal,
  BODY_TRUNCATE_BYTES_BUNDLE
} = require('../../../utils/supportDiagnostics');

const LICENSE_KEY_ENV = 'SMOONB_LICENSE_KEY';
const REQUEST_TIMEOUT_MS = 15000;
const ENDPOINT_PATH = '/v1/license/validate';

function maskLicense(key) {
  if (!key || typeof key !== 'string') return '***';
  const s = key.trim();
  if (s.length <= 10) return '***';
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
}

/**
 * POST com https; retorna statusCode, headers, body (parsed), rawBody (string).
 */
function httpsPost(url, body, headers, timeoutMs) {
  const u = new URL(url);
  const bodyStr = JSON.stringify(body);
  const opts = {
    hostname: u.hostname,
    port: u.port || 443,
    path: u.pathname + u.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
      ...headers
    }
  };
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (chunk) => { chunks.push(chunk); });
      res.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        let bodyParsed = {};
        try {
          bodyParsed = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          bodyParsed = {};
        }
        resolve({
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          headers: res.headers,
          body: bodyParsed,
          rawBody
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      const e = new Error('Request timeout');
      e.code = 'ETIMEDOUT';
      reject(e);
    });
    req.write(bodyStr);
    req.end();
  });
}

/**
 * Exibe erro estruturado + instruções de suporte + bundle (pronto para colar).
 * Usa ui (sem gray/dim) para legibilidade em Windows e copy/paste.
 * @param {Function} getT
 * @param {string} appUrl - APP_CONFIG.appUrl
 * @param {object} opts
 */
function printLicenseValidationError(getT, appUrl, opts) {
  const {
    correlationId,
    kind,
    httpStatus,
    httpStatusText,
    endpoint,
    fullUrl,
    timeoutMs,
    licenseMasked,
    version,
    responseHeaders,
    responseBodyTruncated,
    err
  } = opts;

  const bundleParams = {
    correlationId,
    product: 'smoonb CLI',
    version,
    timestamp: new Date().toISOString(),
    os: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    command: `smoonb ${opts.command || 'backup'}`,
    licenseMasked: licenseMasked || '***',
    apiBaseUrl: fullUrl ? fullUrl.replace(/\/[^/]*$/, '') : APP_CONFIG.apiBaseUrl,
    endpoint: endpoint || ENDPOINT_PATH,
    timeoutMs,
    telemetryEnabled: (process.env.SMOONB_TELEMETRY_ENABLED !== 'false').toString(),
    installationIdMasked: opts.installationIdMasked
  };

  if (httpStatus != null) {
    bundleParams.httpStatus = httpStatus;
    bundleParams.httpStatusText = httpStatusText || '';
    bundleParams.responseHeaders = responseHeaders;
    bundleParams.responseBodyRaw = responseBodyTruncated || undefined;
  }
  if (err) {
    bundleParams.errorName = err.name;
    bundleParams.errorMessage = (err.message || '').replace(/\r?\n/g, ' ');
    bundleParams.errorCode = err.code;
    bundleParams.errno = err.errno;
    if (process.env.SMOONB_DEBUG === 'true') {
      bundleParams.stack = err.stack;
    }
  }

  const bundleText = buildSupportBundle(bundleParams);
  const typeKey = kind === 'http' ? 'license.error.typeHttp'
    : kind === 'tls' ? 'license.error.typeTls'
      : kind === 'parse' ? 'license.error.typeParse'
        : 'license.error.typeNetwork';

  ui.errorBold(`\n❌ ${getT('license.error.title')}\n`);
  ui.info(`   ${getT('license.error.whatHappened')}`);
  ui.info(`   ${getT(typeKey)}`);
  if (kind === 'network' || kind === 'tls') {
    ui.hint(`   ${getT('license.error.testConnectivity', { url: APP_CONFIG.healthCheckUrl || appUrl + '/api/health' })}`);
  }
  if (httpStatus != null) {
    ui.info(`   ${getT('license.error.status', { status: `${httpStatus} ${(httpStatusText || '').trim()}` })}`);
  }
  if (endpoint || fullUrl) {
    ui.info(`   ${getT('license.error.endpoint', { endpoint: fullUrl || endpoint })}`);
  }
  ui.info(`   ${getT('license.error.correlationId', { id: correlationId })}\n`);

  ui.link(`   ${getT('license.error.howToHelp')}`);
  ui.info(`   ${getT('license.error.supportStep1', { url: appUrl })}`);
  ui.info(`   ${getT('license.error.supportStep2')}`);
  ui.info(`   ${getT('license.error.supportStep3')}`);
  ui.info(`   ${getT('license.error.supportStep4')}`);
  ui.info(`   ${getT('license.error.supportStep5')}\n`);

  ui.block(formatBundleForTerminal(bundleText));
  ui.info('');
  ui.link(`   ${getT('license.error.visit', { url: appUrl })}\n`);
  ui.hint(`   ${getT('license.error.subjectSuggestion', { id: correlationId })}`);
  ui.hint(`   ${getT('license.error.messageSuggestion')}\n`);
}

/**
 * Exibe falha quando servidor retorna allow === false (reason literal + CTA + bundle).
 * Se reason/reasonCode === LICENSE_ALREADY_BOUND, exibe mensagem específica de revogar e gerar nova.
 */
function printLicenseDeniedByServer(getT, appUrl, opts) {
  const {
    correlationId,
    correlationIdEchoed,
    reason,
    reasonCode,
    fullUrl,
    rawBody,
    resBody,
    licenseMasked,
    version,
    command,
    installationIdMasked
  } = opts;
  const displayId = correlationIdEchoed || correlationId;
  const responseBodyRaw = rawBody ? truncateBody(rawBody, BODY_TRUNCATE_BYTES_BUNDLE) : '';
  const responseParsed = sanitizeResponseParsedForBundle(resBody);
  const isAlreadyBound = (reasonCode && String(reasonCode).toUpperCase() === 'LICENSE_ALREADY_BOUND') ||
    (reason && String(reason).toUpperCase() === 'LICENSE_ALREADY_BOUND');

  ui.errorBold(`\n❌ ${getT('license.denied.title')}\n`);
  if (isAlreadyBound) {
    ui.info(`   ${getT('license.denied.alreadyBound')}`);
    ui.info(`   ${getT('license.denied.alreadyBoundAction', { url: appUrl })}`);
  } else {
    ui.info(`   ${getT('license.denied.reason', { reason: reason || 'No reason provided' })}`);
  }
  ui.info(`   ${getT('license.denied.correlationId', { id: displayId })}\n`);
  ui.link(`   ${getT('license.error.howToHelp')}`);
  ui.info(`   ${getT('license.error.supportStep1', { url: appUrl })}`);
  ui.info(`   ${getT('license.error.supportStep2')}`);
  ui.info(`   ${getT('license.error.supportStep3')}`);
  ui.info(`   ${getT('license.error.supportStep4')}`);
  ui.info(`   ${getT('license.error.supportStep5')}\n`);

  const bundleParams = {
    correlationId: displayId,
    product: 'smoonb CLI',
    version,
    timestamp: new Date().toISOString(),
    os: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    command: `smoonb ${command || 'backup'}`,
    licenseMasked: licenseMasked || '***',
    apiBaseUrl: fullUrl ? fullUrl.replace(/\/[^/]*$/, '') : APP_CONFIG.apiBaseUrl,
    endpoint: ENDPOINT_PATH,
    timeoutMs: REQUEST_TIMEOUT_MS,
    telemetryEnabled: (process.env.SMOONB_TELEMETRY_ENABLED !== 'false').toString(),
    httpStatus: 200,
    httpStatusText: 'OK',
    responseBodyRaw: responseBodyRaw || undefined,
    responseParsed: responseParsed !== '(none)' ? responseParsed : undefined,
    correlationIdEchoed: correlationIdEchoed && correlationIdEchoed !== correlationId ? correlationIdEchoed : undefined,
    installationIdMasked: installationIdMasked || undefined,
    reason: reason != null ? String(reason) : (reasonCode != null ? String(reasonCode) : undefined)
  };
  const bundleText = buildSupportBundle(bundleParams);
  ui.block(formatBundleForTerminal(bundleText));
  ui.info('');
  ui.link(`   ${getT('license.error.visit', { url: appUrl })}\n`);
  ui.hint(`   ${getT('license.error.subjectSuggestion', { id: displayId })}`);
  ui.hint(`   ${getT('license.error.messageSuggestion')}\n`);
}

/**
 * Step 00: Validação de licença via backend.
 * Roda antes de todos os outros steps.
 * Resolve SMOONB_LICENSE_KEY: env > .env.local > prompt. Persiste se prompt.
 * Sem cache local; falha de rede/servidor = abortar.
 * @param {{ envPath: string, command: string }} options
 * @returns {Promise<{ license: object, smoonbToken: string }>}
 */
module.exports = async (options) => {
  const getT = global.smoonbI18n?.t || t;
  const envPath = options.envPath || path.join(process.cwd(), '.env.local');
  const command = options.command || 'backup';
  const appUrl = APP_CONFIG.appUrl;
  const fullUrl = `${APP_CONFIG.apiBaseUrl}${ENDPOINT_PATH}`;

  let licenseKey = (process.env[LICENSE_KEY_ENV] || '').toString().trim();
  if (!licenseKey) {
    const currentEnv = await readEnvFile(envPath);
    licenseKey = (currentEnv[LICENSE_KEY_ENV] || '').toString().trim();
  }
  if (!licenseKey) {
    const { licenseKey: prompted } = await inquirer.prompt([{
      type: 'input',
      name: 'licenseKey',
      message: getT('license.promptPaste'),
      prefix: ''
    }]);
    licenseKey = (prompted || '').toString().trim();
    if (!licenseKey) {
      ui.error(`❌ ${getT('license.required')}`);
      ui.link(`   ${appUrl}`);
      process.exit(1);
    }
    const currentEnv = await readEnvFile(envPath);
    await writeEnvFile(envPath, { ...currentEnv, [LICENSE_KEY_ENV]: licenseKey });
  }

  let cliVersion = '0.0.0';
  try {
    cliVersion = require('../../../../package.json').version;
  } catch {
    // ignore
  }

  let installationId;
  try {
    installationId = await getOrCreateInstallationId();
  } catch (err) {
    ui.error(`❌ ${getT('license.error.title')}`);
    ui.info(`   ${getT('license.error.whatHappened')}`);
    ui.info(`   Could not create or read installation ID: ${(err && err.message) || err}`);
    ui.link(`   ${getT('license.error.visit', { url: appUrl })}`);
    process.exit(1);
  }

  const correlationId = createCorrelationId();
  const body = {
    licenseKey,
    installationId,
    correlationId,
    cliVersion,
    command,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version
  };
  const requestHeaders = {
    'User-Agent': `smoonb-cli/${cliVersion}`,
    'x-correlation-id': correlationId
  };

  let response;
  try {
    response = await httpsPost(
      fullUrl,
      body,
      requestHeaders,
      REQUEST_TIMEOUT_MS
    );
  } catch (err) {
    const classification = classifyRequestError(err);
    if (classification.hintUser) {
      ui.warn(`   ${classification.hintUser}`);
    }
    printLicenseValidationError(getT, appUrl, {
      correlationId,
      kind: classification.kind,
      endpoint: ENDPOINT_PATH,
      fullUrl,
      timeoutMs: REQUEST_TIMEOUT_MS,
      licenseMasked: maskSecret(licenseKey),
      version: cliVersion,
      command,
      installationIdMasked: installationId ? maskInstallationId(installationId) : undefined,
      err
    });
    process.exit(1);
  }

  const { statusCode, statusMessage, headers, body: resBody, rawBody } = response;

  // Resposta 200 mas corpo inesperado (ex.: HTML em vez de JSON)
  const looksLikeJson = rawBody && rawBody.trim().startsWith('{');
  if (statusCode === 200 && !looksLikeJson && rawBody) {
    const displayCorrelationId = resBody.correlationId || correlationId;
    const responseHeadersStr = safeStringifyHeaders(headers);
    const responseBodyTruncated = truncateBody(rawBody);
    printLicenseValidationError(getT, appUrl, {
      correlationId: displayCorrelationId,
      kind: 'parse',
      endpoint: ENDPOINT_PATH,
      fullUrl,
      timeoutMs: REQUEST_TIMEOUT_MS,
      licenseMasked: maskSecret(licenseKey),
      version: cliVersion,
      command,
      installationIdMasked: installationId ? maskInstallationId(installationId) : undefined,
      responseHeaders: responseHeadersStr,
      responseBodyTruncated
    });
    process.exit(1);
  }

  if (statusCode !== 200) {
    const displayCorrelationId = resBody.correlationId || correlationId;
    const responseHeadersStr = safeStringifyHeaders(headers);
    const responseBodyRaw = rawBody ? truncateBody(rawBody, BODY_TRUNCATE_BYTES_BUNDLE) : '';
    printLicenseValidationError(getT, appUrl, {
      correlationId: displayCorrelationId,
      kind: 'http',
      httpStatus: statusCode,
      httpStatusText: statusMessage,
      endpoint: ENDPOINT_PATH,
      fullUrl,
      timeoutMs: REQUEST_TIMEOUT_MS,
      licenseMasked: maskSecret(licenseKey),
      version: cliVersion,
      command,
      installationIdMasked: installationId ? maskInstallationId(installationId) : undefined,
      responseHeaders: responseHeadersStr,
      responseBodyTruncated: responseBodyRaw
    });
    process.exit(1);
  }

  // allow como boolean robusto: true ou "true" -> true; resto -> false
  const allowRaw = resBody.allow;
  const allow = allowRaw === true || (typeof allowRaw === 'string' && allowRaw.toLowerCase() === 'true');

  if (allow === true) {
    // Nunca negar quando allow === true
    const status = resBody.status || '';
    if (status === 'trial') {
      ui.warn(`   ⚠️ ${getT('license.trialNotice')}`);
    }
    const license = {
      status: resBody.status,
      plan: resBody.plan,
      expiresAt: resBody.expiresAt,
      accountId: resBody.accountId,
      workspaceId: resBody.workspaceId
    };
    const smoonbToken = resBody.token || '';
    return { license, smoonbToken };
  }

  // allow === false: exibir reason do servidor literalmente + CTA + bundle
  const serverReason = resBody.reason != null ? String(resBody.reason) : 'No reason provided';
  const serverReasonCode = resBody.reasonCode != null ? String(resBody.reasonCode) : null;
  const correlationIdEchoed = resBody.correlationId || null;
  printLicenseDeniedByServer(getT, appUrl, {
    correlationId,
    correlationIdEchoed,
    reason: serverReason,
    reasonCode: serverReasonCode,
    fullUrl,
    rawBody,
    resBody,
    licenseMasked: maskSecret(licenseKey),
    version: cliVersion,
    command,
    installationIdMasked: installationId ? maskInstallationId(installationId) : undefined
  });
  process.exit(1);
};

module.exports.maskLicense = maskLicense;
