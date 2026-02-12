/**
 * Suporte: bundle de diagnóstico para chamados (license validation e outros).
 * Nunca incluir licença completa, tokens ou credenciais.
 */
const crypto = require('crypto');

const ALLOWLIST_HEADERS = ['content-type', 'server', 'cf-ray', 'x-request-id'];
const BODY_TRUNCATE_BYTES = 2048;
const BODY_TRUNCATE_BYTES_BUNDLE = 4096;

function createCorrelationId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Mascara valor sensível: primeiros 4 + últimos 4 (ex: P5MA…6RTS).
 * @param {string} value
 * @returns {string}
 */
function maskSecret(value) {
  if (value == null || typeof value !== 'string') return '***';
  const s = value.trim();
  if (s.length <= 8) return '***';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

/**
 * Headers em allowlist, formatados para o bundle.
 * @param {Record<string, string>|object} headers - objeto ou IncomingMessage.headers
 * @returns {string}
 */
function safeStringifyHeaders(headers) {
  if (!headers || typeof headers !== 'object') return '';
  const lines = [];
  const allow = ALLOWLIST_HEADERS;
  const lower = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v == null) continue;
    lower[k.toLowerCase()] = String(v).replace(/\r?\n/g, ' ').trim();
  }
  for (const name of allow) {
    const v = lower[name];
    if (v) lines.push(`${name}: ${v}`);
  }
  return lines.join('\n') || '(none)';
}

/**
 * Trunca string/buffer para no máximo maxBytes (default 2KB).
 * @param {string|Buffer} input
 * @param {number} maxBytes
 * @returns {string}
 */
function truncateBody(input, maxBytes = BODY_TRUNCATE_BYTES) {
  if (input == null) return '';
  const str = Buffer.isBuffer(input) ? input.toString('utf8') : String(input);
  const buf = Buffer.from(str, 'utf8');
  if (buf.length <= maxBytes) return str;
  return buf.slice(0, maxBytes).toString('utf8') + '\n...[truncated]';
}

/** Campos permitidos no ResponseParsed do bundle (sem tokens/sensíveis). */
const RESPONSE_PARSED_KEYS = ['allow', 'reason', 'reasonCode', 'periodEnd', 'trialEndsAt', 'remainingThisMonth', 'correlationId'];

/**
 * Extrai objeto sanitizado da resposta para o bundle (allow, reason, periodEnd, trialEndsAt, remainingThisMonth, correlationId).
 * @param {object} parsed - resBody
 * @returns {string} JSON string ou "(none)"
 */
function sanitizeResponseParsedForBundle(parsed) {
  if (!parsed || typeof parsed !== 'object') return '(none)';
  const out = {};
  for (const key of RESPONSE_PARSED_KEYS) {
    if (Object.prototype.hasOwnProperty.call(parsed, key)) {
      out[key] = parsed[key];
    }
  }
  if (Object.keys(out).length === 0) return '(none)';
  try {
    return JSON.stringify(out);
  } catch {
    return '(none)';
  }
}

/**
 * Classifica erro de request (rede/TLS/timeout).
 * @param {Error} err
 * @returns {{ kind: 'network'|'tls'|'parse'|'unknown', code?: string, errno?: number, hintUser?: string, hintDev?: string }}
 */
function classifyRequestError(err) {
  if (!err || !(err instanceof Error)) {
    return { kind: 'unknown', hintUser: 'An unexpected error occurred.', hintDev: String(err) };
  }
  const code = err.code || err.errno;
  const errno = err.errno;

  const tlsCodes = [
    'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT',
    'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_CRL',
    'ERR_TLS_CERT_ALTNAME_INVALID', 'EPROTO'
  ];
  if (code && tlsCodes.some(c => String(code).includes(c))) {
    return {
      kind: 'tls',
      code: String(code),
      errno,
      hintUser: 'TLS handshake failed or certificate chain issue. Check system time and corporate proxy.',
      hintDev: err.message || String(code)
    };
  }

  switch (code) {
    case 'ENOTFOUND':
    case 'ETIMEDOUT':
    case 'ECONNREFUSED':
    case 'ECONNRESET':
    case 'ENETUNREACH':
    case 'EAI_AGAIN':
      return {
        kind: 'network',
        code: String(code),
        errno,
        hintUser: code === 'ENOTFOUND' ? 'DNS could not resolve the API host.' : (code === 'ETIMEDOUT' ? 'Request timed out.' : 'Connection failed or was reset.'),
        hintDev: err.message || String(code)
      };
    default:
      if (err.message && (err.message.includes('timeout') || err.message.includes('Timeout'))) {
        return {
          kind: 'network',
          code: 'ETIMEDOUT',
          hintUser: 'Request timed out.',
          hintDev: err.message
        };
      }
      return {
        kind: 'network',
        code: code ? String(code) : undefined,
        errno,
        hintUser: 'Network or connection error. Check your connection and try again.',
        hintDev: err.message || String(err)
      };
  }
}

/**
 * Monta o texto do Support Diagnostic Bundle (pronto para colar no chamado).
 * @param {object} params
 * @param {string} params.correlationId
 * @param {string} params.product
 * @param {string} params.version
 * @param {string} params.timestamp - ISO
 * @param {string} params.os - process.platform
 * @param {string} params.arch
 * @param {string} params.nodeVersion
 * @param {string} params.command - ex: smoonb backup
 * @param {string} params.licenseMasked - já mascarada
 * @param {string} params.apiBaseUrl
 * @param {string} params.endpoint - path ex: /v1/license/validate
 * @param {number} params.timeoutMs
 * @param {number} [params.httpStatus]
 * @param {string} [params.httpStatusText]
 * @param {string} [params.responseHeaders]
 * @param {string} [params.responseBodyTruncated]
 * @param {string} [params.errorName]
 * @param {string} [params.errorMessage]
 * @param {string} [params.errorCode]
 * @param {number} [params.errno]
 * @param {string} [params.stack] - só se SMOONB_DEBUG
 * @param {string} [params.telemetryEnabled] - true/false
 * @param {string} [params.installationIdMasked] - masked installation id (e.g. 2f3a…91bc)
 * @param {string} [params.reason] - server reason/code when allow:false
 */
function buildSupportBundle(params) {
  const p = params;
  const lines = [
    `Product: ${p.product || 'smoonb CLI'}`,
    `Version: ${p.version || '0.0.0'}`,
    `Timestamp: ${p.timestamp || new Date().toISOString()}`,
    `CorrelationId: ${p.correlationId || 'n/a'}`,
    `OS: ${p.os || process.platform} ${p.arch || process.arch}`,
    `Node: ${p.nodeVersion || process.version}`,
    `Command: ${p.command || 'smoonb'}`,
    `License: ${p.licenseMasked || '***'}`,
    `API: ${p.apiBaseUrl || ''}`,
    `Endpoint: ${p.endpoint || ''}`,
    `TimeoutMs: ${p.timeoutMs ?? ''}`,
    `TelemetryEnabled: ${p.telemetryEnabled ?? ''}`
  ];

  if (p.installationIdMasked != null) {
    lines.push(`InstallationId: ${p.installationIdMasked}`);
  }
  if (p.reason != null) {
    lines.push(`Reason: ${p.reason}`);
  }

  if (p.httpStatus != null) {
    lines.push(`HttpStatus: ${p.httpStatus} ${(p.httpStatusText || '').trim()}`);
  }
  if (p.correlationIdEchoed != null && p.correlationIdEchoed !== p.correlationId) {
    lines.push(`CorrelationIdEchoed: ${p.correlationIdEchoed}`);
  }
  if (p.responseHeaders) {
    lines.push('ResponseHeaders:', p.responseHeaders);
  }
  if (p.responseBodyRaw != null) {
    lines.push('ResponseBodyRaw:', p.responseBodyRaw);
  } else if (p.responseBodyTruncated) {
    lines.push('ResponseBody(Truncated):', p.responseBodyTruncated);
  }
  if (p.responseParsed != null) {
    lines.push('ResponseParsed:', p.responseParsed);
  }
  if (p.errorName || p.errorMessage) {
    lines.push(`Error: name: ${p.errorName || ''} message: ${p.errorMessage || ''}`);
  }
  if (p.errorCode != null) {
    lines.push(`ErrorCode: ${p.errorCode}`);
  }
  if (p.errno != null) {
    lines.push(`Errno: ${p.errno}`);
  }
  if (p.stack) {
    lines.push('Stack:', p.stack);
  }

  return lines.join('\n');
}

/**
 * Envolve o bundle entre marcadores para copiar/colar.
 */
function formatBundleForTerminal(bundleText) {
  return [
    '--- BEGIN SUPPORT DIAGNOSTIC BUNDLE ---',
    bundleText,
    '--- END SUPPORT DIAGNOSTIC BUNDLE ---'
  ].join('\n');
}

module.exports = {
  createCorrelationId,
  maskSecret,
  safeStringifyHeaders,
  truncateBody,
  sanitizeResponseParsedForBundle,
  classifyRequestError,
  buildSupportBundle,
  formatBundleForTerminal,
  BODY_TRUNCATE_BYTES,
  BODY_TRUNCATE_BYTES_BUNDLE
};
