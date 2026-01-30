const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const { t } = require('../../../i18n');

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
 * Etapa 1: Backup Database via pg_dumpall Docker (idêntico ao Dashboard)
 * Com feedback de progresso: tamanho do arquivo, velocidade e tempo decorrido.
 */
module.exports = async ({ databaseUrl, backupDir }) => {
  try {
    const getT = global.smoonbI18n?.t || t;
    console.log(chalk.white(`   - ${getT('backup.steps.database.creating')}`));

    const urlMatch = databaseUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);

    if (!urlMatch) {
      const getT = global.smoonbI18n?.t || t;
      throw new Error(getT('error.databaseUrlInvalidSimple'));
    }

    const [, username, password, host, port] = urlMatch;

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

    const dockerArgs = [
      'run', '--rm', '--network', 'host',
      '-v', `${backupDirAbs}:/host`,
      '-e', `PGPASSWORD=${password}`,
      'postgres:17', 'pg_dumpall',
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

    const runDump = () => new Promise((resolve, reject) => {
      const proc = spawn('docker', dockerArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

      proc.stderr.on('data', (chunk) => process.stderr.write(chunk));

      const pollFile = async () => {
        if (!(await exists(outputPath))) return;
        const stat = await fs.stat(outputPath).catch(() => null);
        if (!stat) return;
        const size = stat.size;
        const elapsed = Date.now() - startTime;
        const deltaTime = (Date.now() - lastTime) / 1000;
        const speed = deltaTime > 0 ? (size - lastSize) / deltaTime : 0;
        lastSize = size;
        lastTime = Date.now();
        const line = `     📦 ${formatBytes(size)} | ${formatDuration(elapsed)} | ${formatBytes(speed)}/s`;
        process.stdout.write(`\r${line}`);
      };

      ticker = setInterval(pollFile, 500);

      proc.on('close', (code) => {
        if (ticker) {
          clearInterval(ticker);
          ticker = null;
        }
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
        if (code !== 0) {
          reject(new Error(`pg_dumpall exited with code ${code}`));
        } else {
          resolve();
        }
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
      'postgres:17', 'gzip', `/host/${fileName}`
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
        process.stdout.write(`\r     📦 ${formatBytes(size)} | ${formatDuration(elapsed)}\r`);
      };

      gzipTicker = setInterval(pollGzip, 300);

      proc.on('close', (code) => {
        if (gzipTicker) {
          clearInterval(gzipTicker);
          gzipTicker = null;
        }
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
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
    return { success: false };
  }
};
