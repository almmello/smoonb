const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const readline = require('readline');
const { spawn } = require('child_process');
const { t } = require('../../../i18n');
const { parseDatabaseUrl } = require('../utils');

const DUMP_SIZE_FACTOR_DEFAULT = 1.4;
const BAR_WIDTH = 24;
const EMA_ALPHA = 0.25;
const ETA_MIN_TICKS = 4;
const ESTIMATE_TIMEOUT_MS = 10000;

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Estima tamanho total do cluster (soma dos bancos) via SQL. Timeout 10s; falha = null (fallback sem estimativa).
 * @returns {Promise<number|null>} bytes ou null
 */
async function estimateClusterBytes({ postgresImage, username, password, host, port }) {
  const query = "SELECT COALESCE(sum(pg_database_size(datname)),0) FROM pg_database WHERE datistemplate = false;";
  const args = [
    'run', '--rm', '--network', 'host',
    '-e', `PGPASSWORD=${password}`,
    postgresImage, 'psql',
    '-h', host, '-p', port, '-U', username, '-d', 'postgres',
    '-t', '-A', '-c', query
  ];
  return new Promise((resolve) => {
    const proc = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let done = false;
    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      try { proc.kill('SIGKILL'); } catch { }
      resolve(null); // timeout: seguir sem estimativa
    }, ESTIMATE_TIMEOUT_MS);
    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.on('close', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      if (code !== 0) {
        resolve(null);
        return;
      }
      const trimmed = stdout.trim();
      const bytes = parseInt(trimmed, 10);
      if (Number.isNaN(bytes) || bytes < 0) {
        resolve(null);
        return;
      }
      resolve(bytes);
    });
    proc.on('error', () => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

/**
 * Monta uma linha de progresso: barra opcional + tamanho, tempo, velocidade, ETA (quando estimado).
 * percent/etaSeconds null = modo indeterminado (sem % nem ETA).
 */
function renderProgressLine({ percent, width, sizeBytes, elapsedMs, speedBps, etaSeconds, estimated, getT }) {
  const sizeStr = formatBytes(sizeBytes);
  const elapsedStr = formatDuration(elapsedMs);
  const speedStr = formatBytes(Math.max(0, speedBps)) + '/s';
  let bar = '';
  if (estimated && percent != null && percent >= 0) {
    const filled = Math.round((percent / 100) * width);
    const n = Math.min(filled, width);
    bar = `[${'#'.repeat(n)}${'-'.repeat(width - n)}] ${Math.min(99, Math.floor(percent))}% (~) `;
  } else {
    bar = '     … ';
  }
  let etaStr = '';
  if (estimated && etaSeconds != null && etaSeconds > 0) {
    const etaLabel = getT ? getT('backup.steps.database.progress.eta') : 'ETA';
    etaStr = ` | ${etaLabel} ~${formatDuration(etaSeconds * 1000)}`;
  }
  return `     ${bar}| ${sizeStr} | ${elapsedStr} | ${speedStr}${etaStr}`;
}

/**
 * Etapa 2: Backup Database via pg_dumpall Docker (idêntico ao Dashboard)
 * Com feedback de progresso: tamanho do arquivo, velocidade e tempo decorrido.
 * Usa exclusivamente context.postgresMajor (fonte única; sem redetecção).
 */
module.exports = async ({ databaseUrl, backupDir, postgresMajor: contextMajor }) => {
  try {
    const getT = global.smoonbI18n?.t || t;
    if (contextMajor == null) {
      throw new Error(getT('backup.steps.postgresVersion.postgresMajorValidationFailed'));
    }
    const postgresMajor = contextMajor;
    const postgresImage = `postgres:${postgresMajor}`;

    console.log(chalk.white(`   - ${getT('backup.steps.database.creating')}`));

    const parsed = parseDatabaseUrl(databaseUrl);
    if (!parsed) {
      throw new Error(getT('error.databaseUrlInvalidSimple'));
    }
    const { username, password, host, port } = parsed;

    console.log(chalk.white(`   - ${getT('backup.steps.database.postgresImage', { image: postgresImage, major: postgresMajor })}`));

    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    const fileName = `db_cluster-${day}-${month}-${year}@${hours}-${minutes}-${seconds}.backup`;
    const backupDirAbs = path.resolve(backupDir);
    const outputPath = path.join(backupDirAbs, fileName);

    // Estimativa opcional: tamanho do cluster * fator (dump lógico costuma ser maior). Falha = sem %/ETA.
    let expectedBytes = null;
    try {
      const clusterBytes = await estimateClusterBytes({ postgresImage, username, password, host, port });
      if (clusterBytes != null && clusterBytes > 0) {
        const factor = parseFloat(process.env.SMOONB_DUMP_SIZE_FACTOR || '', 10) || DUMP_SIZE_FACTOR_DEFAULT;
        expectedBytes = Math.floor(clusterBytes * factor);
      }
    } catch {
      expectedBytes = null;
    }

    const dockerArgs = [
      'run', '--rm', '--network', 'host',
      '-v', `${backupDirAbs}:/host`,
      '-e', `PGPASSWORD=${password}`,
      postgresImage, 'pg_dumpall',
      '-h', host,
      '-p', port,
      '-U', username,
      '-f', `/host/${fileName}`
    ];

    console.log(chalk.white(`   - ${getT('backup.steps.database.executing')}`));

    const startTime = Date.now();
    let lastSize = 0;
    let lastTime = startTime;
    let ticker = null;
    let tickCount = 0;
    let smoothedSpeed = 0;
    const useTty = Boolean(process.stdout.isTTY);
    let lastProgressLine = '';

    const runDump = () => new Promise((resolve, reject) => {
      const proc = spawn('docker', dockerArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

      proc.stderr.on('data', (chunk) => {
        process.stderr.write(chunk);
        if (useTty && lastProgressLine) {
          readline.cursorTo(process.stdout, 0);
          process.stdout.write(lastProgressLine);
        }
      });

      const pollFile = async () => {
        if (!(await exists(outputPath))) return;
        const stat = await fs.stat(outputPath).catch(() => null);
        if (!stat) return;
        tickCount++;
        const currentSize = stat.size;
        const now = Date.now();
        const elapsed = now - startTime;
        const deltaTime = (now - lastTime) / 1000;
        const speed = deltaTime > 0 ? (currentSize - lastSize) / deltaTime : 0;
        if (speed > 0) {
          smoothedSpeed = tickCount === 1 ? speed : EMA_ALPHA * speed + (1 - EMA_ALPHA) * smoothedSpeed;
        }
        lastSize = currentSize;
        lastTime = now;

        const estimated = expectedBytes != null && expectedBytes > 0;
        let percent = null;
        let etaSeconds = null;
        if (estimated) {
          percent = Math.min(99, Math.floor((currentSize / expectedBytes) * 100));
          if (smoothedSpeed > 0 && currentSize < expectedBytes && tickCount >= ETA_MIN_TICKS) {
            etaSeconds = (expectedBytes - currentSize) / smoothedSpeed;
          }
        }

        const line = renderProgressLine({
          percent,
          width: BAR_WIDTH,
          sizeBytes: currentSize,
          elapsedMs: elapsed,
          speedBps: smoothedSpeed || speed,
          etaSeconds,
          estimated,
          getT
        });
        lastProgressLine = line;

        if (useTty) {
          readline.clearLine(process.stdout, 0);
          readline.cursorTo(process.stdout, 0);
          process.stdout.write(chalk.white(line));
        } else if (tickCount % 30 === 1 && elapsed >= 15000) {
          process.stdout.write(chalk.white(line) + '\n');
        }
      };

      ticker = setInterval(pollFile, 500);

      proc.on('close', async (code) => {
        if (ticker) {
          clearInterval(ticker);
          ticker = null;
        }
        if (useTty) {
          readline.clearLine(process.stdout, 0);
          readline.cursorTo(process.stdout, 0);
        }
        if (code !== 0) {
          reject(new Error(`pg_dumpall exited with code ${code}`));
          return;
        }
        // Sucesso: mostrar 100% uma vez (estimativa) com tamanho final real
        if (expectedBytes != null && expectedBytes > 0) {
          let finalSize = lastSize;
          try {
            const stat = await fs.stat(outputPath).catch(() => null);
            if (stat) finalSize = stat.size;
          } catch { }
          const finalLine = renderProgressLine({
            percent: 100,
            width: BAR_WIDTH,
            sizeBytes: finalSize,
            elapsedMs: Date.now() - startTime,
            speedBps: smoothedSpeed,
            etaSeconds: null,
            estimated: true,
            getT
          });
          process.stdout.write(chalk.white(finalLine) + '\n');
        }
        if (useTty) {
          readline.cursorTo(process.stdout, 0);
        }
        resolve();
      });

      proc.on('error', (err) => {
        if (ticker) clearInterval(ticker);
        reject(err);
      });
    });

    await runDump();

    const gzipArgs = [
      'run', '--rm',
      '-v', `${backupDirAbs}:/host`,
      postgresImage, 'gzip', `/host/${fileName}`
    ];

    const gzipStart = Date.now();
    let gzipTicker = null;
    const finalFileName = `${fileName}.gz`;
    const gzipOutputPath = path.join(backupDirAbs, finalFileName);

    const runGzip = () => new Promise((resolve, reject) => {
      const proc = spawn('docker', gzipArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

      proc.stderr.on('data', (chunk) => process.stderr.write(chunk));

      const pollGzip = async () => {
        if (!(await exists(gzipOutputPath))) return;
        const stat = await fs.stat(gzipOutputPath).catch(() => null);
        if (!stat) return;
        const size = stat.size;
        const elapsed = Date.now() - gzipStart;
        if (process.stdout.isTTY) {
          readline.clearLine(process.stdout, 0);
          readline.cursorTo(process.stdout, 0);
        }
        process.stdout.write(`     📦 ${formatBytes(size)} | ${formatDuration(elapsed)}`);
        if (process.stdout.isTTY) process.stdout.write('\r');
      };

      gzipTicker = setInterval(pollGzip, 300);

      proc.on('close', (code) => {
        if (gzipTicker) {
          clearInterval(gzipTicker);
          gzipTicker = null;
        }
        if (process.stdout.isTTY) {
          readline.clearLine(process.stdout, 0);
          readline.cursorTo(process.stdout, 0);
        }
        if (code !== 0) {
          reject(new Error(`gzip exited with code ${code}`));
        } else {
          resolve();
        }
      });

      proc.on('error', (err) => {
        if (gzipTicker) clearInterval(gzipTicker);
        reject(err);
      });
    });

    await runGzip();

    const stats = await fs.stat(path.join(backupDir, finalFileName));
    const sizeKB = (stats.size / 1024).toFixed(1);

    console.log(chalk.green(`     ✅ Database backup: ${finalFileName} (${sizeKB} KB)`));

    return { success: true, size: sizeKB, fileName: finalFileName };
  } catch (error) {
    const getT = global.smoonbI18n?.t || t;
    console.log(chalk.yellow(`     ⚠️ ${getT('backup.steps.database.error', { message: error.message })}`));
    if (error.message && error.message.includes('pg_dumpall')) {
      console.log(chalk.yellow(`     💡 ${getT('backup.steps.database.versionMismatch')}`));
    }
    return { success: false };
  }
};
