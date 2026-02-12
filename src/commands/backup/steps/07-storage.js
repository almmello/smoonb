const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const AdmZip = require('adm-zip');
const { createClient } = require('@supabase/supabase-js');
const { ensureDir, writeJson } = require('../../../utils/fsx');
const { confirm } = require('../../../utils/prompt');
const { t } = require('../../../i18n');

/**
 * Etapa 6: Backup Storage via Supabase API
 * Agora faz backup completo: metadados + download de todos os arquivos + ZIP no padrão do Dashboard
 */
module.exports = async ({ projectId, accessToken, backupDir, supabaseUrl, supabaseServiceKey }) => {
  try {
    const getT = global.smoonbI18n?.t || t;
    const storageDir = path.join(backupDir, 'storage');
    await ensureDir(storageDir);

    console.log(chalk.white(`   - ${getT('backup.steps.storage.listing')}`));
    
    // Usar fetch direto para Management API com Personal Access Token
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

    // Validar credenciais do Supabase para download de arquivos
    if (!supabaseUrl || !supabaseServiceKey) {
      console.log(chalk.yellow(`   ⚠️  ${getT('backup.steps.storage.credentialsNotAvailable')}`));
      return await backupMetadataOnly(buckets, storageDir, projectId, accessToken);
    }

    // Criar cliente Supabase para download de arquivos
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Criar estrutura temporária para armazenar arquivos baixados
    const tempStorageDir = path.join(backupDir, 'storage_temp');
    await ensureDir(tempStorageDir);
    
    // Criar estrutura: storage_temp/project-id/bucket-name/arquivos...
    const projectStorageDir = path.join(tempStorageDir, projectId);
    await ensureDir(projectStorageDir);

    const processedBuckets = [];
    let totalFilesDownloaded = 0;

    for (const bucket of buckets || []) {
      try {
        console.log(chalk.white(`   - ${getT('backup.steps.storage.processing', { bucketName: bucket.name })}`));
        
        // Listar objetos do bucket via Management API com Personal Access Token
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

        // Salvar informações do bucket
        const bucketPath = path.join(storageDir, `${bucket.name}.json`);
        await writeJson(bucketPath, bucketInfo);

        // Baixar todos os arquivos do bucket
        const bucketDir = path.join(projectStorageDir, bucket.name);
        await ensureDir(bucketDir);
        
        // Listar todos os arquivos recursivamente usando Supabase client
        console.log(chalk.white(`     - ${getT('backup.steps.storage.listingFiles', { bucketName: bucket.name })}`));
        const allFiles = await listAllFilesRecursively(supabase, bucket.name, '');
        
        let filesDownloaded = 0;
        if (allFiles.length > 0) {
          console.log(chalk.white(`     - ${getT('backup.steps.storage.downloading', { count: allFiles.length, bucketName: bucket.name })}`));
          
          for (const filePath of allFiles) {
            try {
              // Baixar arquivo do Storage
              const { data: fileData, error: downloadError } = await supabase.storage
                .from(bucket.name)
                .download(filePath);

              if (downloadError) {
                console.log(chalk.yellow(`       ⚠️  ${getT('backup.steps.storage.downloadError', { path: filePath, message: downloadError.message })}`));
                continue;
              }

              // Criar estrutura de pastas local se necessário
              const localFilePath = path.join(bucketDir, filePath);
              const localFileDir = path.dirname(localFilePath);
              await ensureDir(localFileDir);

              // Salvar arquivo localmente
              const arrayBuffer = await fileData.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              await fs.writeFile(localFilePath, buffer);
              filesDownloaded++;

              // Mostrar progresso a cada 10 arquivos ou se for o último
              if (filesDownloaded % 10 === 0 || filesDownloaded === allFiles.length) {
                console.log(chalk.white(`       - ${getT('backup.steps.storage.downloaded', { current: filesDownloaded, total: allFiles.length })}`));
              }
            } catch (fileError) {
              console.log(chalk.yellow(`       ⚠️  ${getT('backup.steps.storage.processFileError', { path: filePath, message: fileError.message })}`));
            }
          }
        }

        totalFilesDownloaded += filesDownloaded;
        processedBuckets.push({
          name: bucket.name,
          objectCount: objects?.length || 0,
          filesDownloaded: filesDownloaded,
          totalFiles: allFiles.length
        });

        console.log(chalk.green(`     ✅ ${getT('backup.steps.storage.bucketDone', { bucketName: bucket.name, downloaded: filesDownloaded, total: allFiles.length })}`));
      } catch (error) {
        console.log(chalk.yellow(`     ⚠️ ${getT('backup.steps.storage.processBucketError', { bucketName: bucket.name, message: error.message })}`));
      }
    }

    // Criar ZIP no padrão do Dashboard: {project-id}.storage.zip
    console.log(chalk.white(`\n   - ${getT('backup.steps.storage.creatingZip')}`));
    const zipFileName = `${projectId}.storage.zip`;
    const zipFilePath = path.join(backupDir, zipFileName);
    
    const zip = new AdmZip();
    
    // Adicionar toda a estrutura de pastas ao ZIP
    // Estrutura: project-id/bucket-name/arquivos...
    await addDirectoryToZip(zip, projectStorageDir, projectId);
    
    // Salvar ZIP
    zip.writeZip(zipFilePath);
    const zipStats = await fs.stat(zipFilePath);
    const zipSizeMB = (zipStats.size / (1024 * 1024)).toFixed(2);
    
    console.log(chalk.green(`   ✅ ${getT('backup.steps.storage.zipCreated', { fileName: zipFileName, size: zipSizeMB })}`));

    // Perguntar ao usuário se deseja limpar a estrutura temporária
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
      zipSizeMB: zipSizeMB,
      totalFiles: totalFilesDownloaded,
      tempDirCleaned: shouldCleanup
    };
  } catch (error) {
    const getT = global.smoonbI18n?.t || t;
    console.log(chalk.yellow(`⚠️ ${getT('backup.steps.storage.error', { message: error.message })}`));
    return { success: false, buckets: [] };
  }
};

/**
 * Backup apenas de metadados (fallback quando não há credenciais do Supabase)
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

      processedBuckets.push({
        name: bucket.name,
        objectCount: objects?.length || 0
      });

      console.log(chalk.green(`     ✅ Bucket ${bucket.name}: ${objects?.length || 0} objetos`));
    } catch (error) {
      console.log(chalk.yellow(`     ⚠️ Erro ao processar bucket ${bucket.name}: ${error.message}`));
    }
  }

  console.log(chalk.green(`✅ Storage backupado (apenas metadados): ${processedBuckets.length} buckets`));
  return { success: true, buckets: processedBuckets };
}

/**
 * Lista todos os arquivos recursivamente de um bucket do Storage
 */
async function listAllFilesRecursively(supabase, bucketName, folderPath = '') {
  const allFiles = [];
  const getT = global.smoonbI18n?.t || t;
  
  try {
    // Listar arquivos e pastas no caminho atual
    const { data: items, error } = await supabase.storage
      .from(bucketName)
      .list(folderPath, {
        limit: 1000,
        sortBy: { column: 'name', order: 'asc' }
      });

    if (error) {
      console.log(chalk.yellow(`       ⚠️  ${getT('backup.steps.storage.listError', { path: folderPath || 'raiz', message: error.message })}`));
      return allFiles;
    }

    if (!items || items.length === 0) {
      return allFiles;
    }

    for (const item of items) {
      const itemPath = folderPath ? `${folderPath}/${item.name}` : item.name;
      
      if (item.id === null) {
        // É uma pasta, listar recursivamente
        const subFiles = await listAllFilesRecursively(supabase, bucketName, itemPath);
        allFiles.push(...subFiles);
      } else {
        // É um arquivo
        allFiles.push(itemPath);
      }
    }
  } catch (error) {
    console.log(chalk.yellow(`       ⚠️  ${getT('backup.steps.storage.processError', { path: folderPath || 'raiz', message: error.message })}`));
  }

  return allFiles;
}

/**
 * Adiciona um diretório recursivamente ao ZIP mantendo a estrutura de pastas
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

