const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const AdmZip = require('adm-zip');
const { createClient } = require('@supabase/supabase-js');
const { ensureDir, writeJson } = require('../../../utils/fsx');
const { confirm } = require('../../../utils/prompt');
const { t } = require('../../../i18n');

const TIMEOUT_LIST_MS = 30_000;       // 30s por chamada de listagem
const TIMEOUT_DOWNLOAD_MS = 360_000;  // 2min por download de arquivo
const MAX_RETRIES = 7;
const RETRY_BASE_DELAY_MS = 2_000;    // backoff: 2s → 4s → 8s

/**
 * Executa uma promise com timeout. Lança Error se o tempo esgotar.
 * @param {Promise} promise
 * @param {number} ms
 * @returns {Promise}
 */
function withTimeout(promise, ms) {
  let id;
  const timer = new Promise((_, reject) => {
    id = setTimeout(() => reject(new Error(`Timeout (${ms / 1000}s)`)), ms);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(id));
}

/**
 * Executa fn() com retry automático e backoff exponencial.
 * @param {Function} fn - Fábrica de Promise (chamada a cada tentativa)
 * @param {number} maxAttempts
 * @param {number} baseDelayMs
 * @param {Function} [onRetry] - Callback(attempt, max, err, delayMs)
 */
async function withRetry(fn, maxAttempts = MAX_RETRIES, baseDelayMs = RETRY_BASE_DELAY_MS, onRetry) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        if (onRetry) onRetry(attempt, maxAttempts, err, delay);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Etapa 6: Backup Storage via Supabase API
 * Backup completo: metadados + download de todos os arquivos + ZIP no padrão do Dashboard
 */
module.exports = async ({ projectId, accessToken, backupDir, supabaseUrl, supabaseServiceKey }) => {
  try {
    const getT = global.smoonbI18n?.t || t;
    const storageDir = path.join(backupDir, 'storage');
    await ensureDir(storageDir);

    console.log(chalk.white(`   - ${getT('backup.steps.storage.listing')}`));

    const storageResponse = await fetch(`https://api.supabase.com/v1/projects/${projectId}/storage/buckets`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!storageResponse.ok) {
      console.log(chalk.yellow(`     ⚠️ ${getT('backup.steps.storage.listBucketsError', { status: storageResponse.status, statusText: storageResponse.statusText })}`));
      return { success: false, buckets: [] };
    }

    const buckets = await storageResponse.json();

    if (!buckets || buckets.length === 0) {
      console.log(chalk.white(`   - ${getT('backup.steps.storage.noBuckets')}`));
      await writeJson(path.join(storageDir, 'README.md'), {
        message: getT('backup.steps.storage.noBucketsMessage')
      });
      return { success: true, buckets: [] };
    }

    console.log(chalk.white(`   - ${getT('backup.steps.storage.found', { count: buckets.length })}`));

    if (!supabaseUrl || !supabaseServiceKey) {
      console.log(chalk.yellow(`   ⚠️  ${getT('backup.steps.storage.credentialsNotAvailable')}`));
      return await backupMetadataOnly(buckets, storageDir, projectId, accessToken);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const tempStorageDir = path.join(backupDir, 'storage_temp');
    await ensureDir(tempStorageDir);

    const projectStorageDir = path.join(tempStorageDir, projectId);
    await ensureDir(projectStorageDir);

    const processedBuckets = [];
    let totalFilesDownloaded = 0;

    for (const bucket of buckets || []) {
      try {
        console.log(chalk.white(`   - ${getT('backup.steps.storage.processing', { bucketName: bucket.name })}`));

        const objectsResponse = await fetch(`https://api.supabase.com/v1/projects/${projectId}/storage/buckets/${bucket.name}/objects`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        let objects = [];
        if (objectsResponse.ok) {
          objects = await objectsResponse.json();
        }

        const bucketInfo = {
          id: bucket.id,
          name: bucket.name,
          public: bucket.public,
          file_size_limit: bucket.file_size_limit,
          allowed_mime_types: bucket.allowed_mime_types,
          objects: objects || []
        };

        const bucketPath = path.join(storageDir, `${bucket.name}.json`);
        await writeJson(bucketPath, bucketInfo);

        const bucketDir = path.join(projectStorageDir, bucket.name);
        await ensureDir(bucketDir);

        // ── Listagem com progresso inline ──────────────────────────────
        console.log(chalk.white(`     - ${getT('backup.steps.storage.listingFiles', { bucketName: bucket.name })}`));
        const counter = { total: 0 };
        let allFiles = [];
        let listingFailed = false;

        try {
          allFiles = await listAllFilesRecursively(supabase, bucket.name, '', counter, getT);
        } catch (listErr) {
          listingFailed = true;
          console.log(chalk.yellow(`     ⚠️  ${getT('backup.steps.storage.listFailed', { bucketName: bucket.name, message: listErr.message })}`));
        } finally {
          // Encerra a linha de progresso (\r) iniciada por listAllFilesRecursively
          process.stdout.write('\n');
        }

        if (!listingFailed) {
          console.log(chalk.white(`     - ${getT('backup.steps.storage.totalFound', { count: allFiles.length })}`));
        }

        // ── Download com retry ──────────────────────────────────────────
        let filesDownloaded = 0;
        let filesSkipped = 0;

        if (allFiles.length > 0) {
          console.log(chalk.white(`     - ${getT('backup.steps.storage.downloading', { count: allFiles.length, bucketName: bucket.name })}`));

          for (const filePath of allFiles) {
            try {
              let fileData = null;
              let downloadError = null;

              await withRetry(
                async () => {
                  const result = await withTimeout(
                    supabase.storage.from(bucket.name).download(filePath),
                    TIMEOUT_DOWNLOAD_MS
                  );
                  // Erros estruturais do Supabase (ex.: 404) não devem ser retentados
                  if (result.error) {
                    downloadError = result.error;
                    fileData = null;
                  } else {
                    fileData = result.data;
                    downloadError = null;
                  }
                },
                MAX_RETRIES,
                RETRY_BASE_DELAY_MS,
                (attempt, max, err, delay) => {
                  console.log(chalk.yellow(`       ⚠️  ${getT('backup.steps.storage.downloadRetry', { path: filePath, attempt, max, delay: delay / 1000 })}`));
                }
              );

              if (downloadError) {
                filesSkipped++;
                console.log(chalk.yellow(`       ⚠️  ${getT('backup.steps.storage.downloadError', { path: filePath, message: downloadError.message })}`));
                continue;
              }

              const localFilePath = path.join(bucketDir, filePath);
              await ensureDir(path.dirname(localFilePath));

              const buffer = Buffer.from(await fileData.arrayBuffer());
              await fs.writeFile(localFilePath, buffer);
              filesDownloaded++;

              if (filesDownloaded % 10 === 0 || filesDownloaded === allFiles.length) {
                console.log(chalk.white(`       - ${getT('backup.steps.storage.downloaded', { current: filesDownloaded, total: allFiles.length })}`));
              }
            } catch (fileError) {
              filesSkipped++;
              console.log(chalk.yellow(`       ⚠️  ${getT('backup.steps.storage.downloadFailed', { path: filePath, message: fileError.message })}`));
            }
          }
        }

        totalFilesDownloaded += filesDownloaded;
        processedBuckets.push({
          name: bucket.name,
          objectCount: objects?.length || 0,
          filesDownloaded,
          filesSkipped,
          totalFiles: allFiles.length
        });

        if (filesSkipped > 0) {
          console.log(chalk.yellow(`     ⚠️  ${getT('backup.steps.storage.bucketDoneWithSkips', { bucketName: bucket.name, downloaded: filesDownloaded, skipped: filesSkipped, total: allFiles.length })}`));
        } else {
          console.log(chalk.green(`     ✅ ${getT('backup.steps.storage.bucketDone', { bucketName: bucket.name, downloaded: filesDownloaded, total: allFiles.length })}`));
        }
      } catch (error) {
        console.log(chalk.yellow(`     ⚠️ ${getT('backup.steps.storage.processBucketError', { bucketName: bucket.name, message: error.message })}`));
      }
    }

    // ── Criar ZIP no padrão do Dashboard ───────────────────────────────
    console.log(chalk.white(`\n   - ${getT('backup.steps.storage.creatingZip')}`));
    const zipFileName = `${projectId}.storage.zip`;
    const zipFilePath = path.join(backupDir, zipFileName);

    const zip = new AdmZip();
    await addDirectoryToZip(zip, projectStorageDir, projectId);
    zip.writeZip(zipFilePath);
    const zipStats = await fs.stat(zipFilePath);
    const zipSizeMB = (zipStats.size / (1024 * 1024)).toFixed(2);

    console.log(chalk.green(`   ✅ ${getT('backup.steps.storage.zipCreated', { fileName: zipFileName, size: zipSizeMB })}`));

    const shouldCleanup = await confirm(`   ${getT('backup.steps.storage.cleanup')}`, false);

    if (shouldCleanup) {
      console.log(chalk.white(`   - ${getT('backup.steps.storage.cleanupRemoving')}`));
      try {
        await fs.rm(tempStorageDir, { recursive: true, force: true });
        console.log(chalk.green(`   ✅ ${getT('backup.steps.storage.cleanupRemoved')}`));
      } catch (cleanupError) {
        console.log(chalk.yellow(`   ⚠️  ${getT('backup.steps.storage.cleanupError', { message: cleanupError.message })}`));
      }
    } else {
      console.log(chalk.white(`   ℹ️  ${getT('backup.steps.storage.tempKept', { path: path.relative(process.cwd(), tempStorageDir) })}`));
    }

    console.log(chalk.green(`✅ ${getT('backup.steps.storage.done', { buckets: processedBuckets.length, files: totalFilesDownloaded })}`));
    return {
      success: true,
      buckets: processedBuckets,
      zipFile: zipFileName,
      zipSizeMB,
      totalFiles: totalFilesDownloaded,
      tempDirCleaned: shouldCleanup
    };
  } catch (error) {
    const getT = global.smoonbI18n?.t || t;
    console.log(chalk.yellow(`⚠️ ${getT('backup.steps.storage.error', { message: error.message })}`));
    return { success: false, buckets: [] };
  }
};

// ── Funções auxiliares ────────────────────────────────────────────────────────

/**
 * Backup apenas de metadados (fallback sem credenciais Supabase)
 */
async function backupMetadataOnly(buckets, storageDir, projectId, accessToken) {
  const processedBuckets = [];

  for (const bucket of buckets || []) {
    try {
      console.log(chalk.white(`   - Processando bucket: ${bucket.name}`));

      const objectsResponse = await fetch(`https://api.supabase.com/v1/projects/${projectId}/storage/buckets/${bucket.name}/objects`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      let objects = [];
      if (objectsResponse.ok) {
        objects = await objectsResponse.json();
      }

      const bucketInfo = {
        id: bucket.id,
        name: bucket.name,
        public: bucket.public,
        file_size_limit: bucket.file_size_limit,
        allowed_mime_types: bucket.allowed_mime_types,
        objects: objects || []
      };

      const bucketPath = path.join(storageDir, `${bucket.name}.json`);
      await writeJson(bucketPath, bucketInfo);

      processedBuckets.push({ name: bucket.name, objectCount: objects?.length || 0 });
      console.log(chalk.green(`     ✅ Bucket ${bucket.name}: ${objects?.length || 0} objetos`));
    } catch (error) {
      console.log(chalk.yellow(`     ⚠️ Erro ao processar bucket ${bucket.name}: ${error.message}`));
    }
  }

  console.log(chalk.green(`✅ Storage backupado (apenas metadados): ${processedBuckets.length} buckets`));
  return { success: true, buckets: processedBuckets };
}

/**
 * Lista recursivamente todos os arquivos de um bucket com:
 * - progresso inline via \r (pasta atual + total encontrado)
 * - timeout por chamada (TIMEOUT_LIST_MS)
 * - retry com backoff exponencial (MAX_RETRIES)
 *
 * O CALLER é responsável por emitir \n após o retorno para encerrar a linha \r.
 *
 * @param {object} supabase
 * @param {string} bucketName
 * @param {string} folderPath
 * @param {{ total: number }} counter - Contador compartilhado entre chamadas recursivas
 * @param {Function} getT - Função de tradução
 * @returns {Promise<string[]>}
 */
async function listAllFilesRecursively(supabase, bucketName, folderPath = '', counter = { total: 0 }, getT) {
  const allFiles = [];
  const label = folderPath ? `${bucketName}/${folderPath}` : `${bucketName}/`;
  const displayLabel = label.length > 55 ? `...${label.slice(-52)}` : label;

  // Progresso inline: mostra pasta atual + arquivos encontrados até agora
  process.stdout.write(
    chalk.gray(`\r       → ${getT('backup.steps.storage.scanningFolder', { path: displayLabel, count: counter.total })}          `)
  );

  let result;
  try {
    result = await withRetry(
      () => withTimeout(
        supabase.storage.from(bucketName).list(folderPath, {
          limit: 1000,
          sortBy: { column: 'name', order: 'asc' }
        }),
        TIMEOUT_LIST_MS
      ),
      MAX_RETRIES,
      RETRY_BASE_DELAY_MS,
      (attempt, max, err, delay) => {
        // Encerra linha \r antes de imprimir o aviso
        process.stdout.write('\n');
        console.log(chalk.yellow(`       ⚠️  ${getT('backup.steps.storage.listRetry', { path: displayLabel, attempt, max, delay: delay / 1000, message: err.message })}`));
      }
    );
  } catch (err) {
    // Esgotou as tentativas — propaga para o caller lidar
    throw err;
  }

  const { data: items, error } = result;

  if (error) {
    process.stdout.write('\n');
    console.log(chalk.yellow(`       ⚠️  ${getT('backup.steps.storage.listError', { path: label, message: error.message })}`));
    return allFiles;
  }

  if (!items || items.length === 0) {
    return allFiles;
  }

  for (const item of items) {
    const itemPath = folderPath ? `${folderPath}/${item.name}` : item.name;

    if (item.id === null) {
      // Pasta — listar recursivamente
      const subFiles = await listAllFilesRecursively(supabase, bucketName, itemPath, counter, getT);
      allFiles.push(...subFiles);
    } else {
      // Arquivo
      allFiles.push(itemPath);
      counter.total++;
      // Atualizar display com novo total
      const dl = label.length > 55 ? `...${label.slice(-52)}` : label;
      process.stdout.write(
        chalk.gray(`\r       → ${getT('backup.steps.storage.scanningFolder', { path: dl, count: counter.total })}          `)
      );
    }
  }

  return allFiles;
}

/**
 * Adiciona diretório recursivamente ao ZIP mantendo estrutura de pastas
 */
async function addDirectoryToZip(zip, dirPath, basePath = '') {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const zipPath = basePath ? `${basePath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      await addDirectoryToZip(zip, fullPath, zipPath);
    } else {
      const fileContent = await fs.readFile(fullPath);
      zip.addFile(zipPath, fileContent);
    }
  }
}
