const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const AdmZip = require('adm-zip');
const { createClient } = require('@supabase/supabase-js');
const { ensureDir, writeJson } = require('../../../utils/fsx');
const { confirm } = require('../../../utils/prompt');

/**
 * Etapa 6: Backup Storage via Supabase API
 * Agora faz backup completo: metadados + download de todos os arquivos + ZIP no padrão do Dashboard
 */
module.exports = async ({ projectId, accessToken, backupDir, supabaseUrl, supabaseServiceKey }) => {
  try {
    const storageDir = path.join(backupDir, 'storage');
    await ensureDir(storageDir);

    console.log(chalk.white('   - Listando buckets de Storage via Management API...'));
    
    // Usar fetch direto para Management API com Personal Access Token
    const storageResponse = await fetch(`https://api.supabase.com/v1/projects/${projectId}/storage/buckets`, {
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!storageResponse.ok) {
      console.log(chalk.yellow(`     ⚠️ Erro ao listar buckets: ${storageResponse.status} ${storageResponse.statusText}`));
      return { success: false, buckets: [] };
    }

    const buckets = await storageResponse.json();

    if (!buckets || buckets.length === 0) {
      console.log(chalk.white('   - Nenhum bucket encontrado'));
      await writeJson(path.join(storageDir, 'README.md'), {
        message: 'Nenhum bucket de Storage encontrado neste projeto'
      });
      return { success: true, buckets: [] };
    }

    console.log(chalk.white(`   - Encontrados ${buckets.length} buckets`));

    // Validar credenciais do Supabase para download de arquivos
    if (!supabaseUrl || !supabaseServiceKey) {
      console.log(chalk.yellow('   ⚠️  Credenciais do Supabase não disponíveis. Fazendo backup apenas de metadados...'));
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
        console.log(chalk.white(`   - Processando bucket: ${bucket.name}`));
        
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
        console.log(chalk.white(`     - Listando arquivos do bucket ${bucket.name}...`));
        const allFiles = await listAllFilesRecursively(supabase, bucket.name, '');
        
        let filesDownloaded = 0;
        if (allFiles.length > 0) {
          console.log(chalk.white(`     - Baixando ${allFiles.length} arquivo(s) do bucket ${bucket.name}...`));
          
          for (const filePath of allFiles) {
            try {
              // Baixar arquivo do Storage
              const { data: fileData, error: downloadError } = await supabase.storage
                .from(bucket.name)
                .download(filePath);

              if (downloadError) {
                console.log(chalk.yellow(`       ⚠️  Erro ao baixar ${filePath}: ${downloadError.message}`));
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
                console.log(chalk.white(`       - Baixados ${filesDownloaded}/${allFiles.length} arquivo(s)...`));
              }
            } catch (fileError) {
              console.log(chalk.yellow(`       ⚠️  Erro ao processar arquivo ${filePath}: ${fileError.message}`));
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

        console.log(chalk.green(`     ✅ Bucket ${bucket.name}: ${filesDownloaded}/${allFiles.length} arquivo(s) baixado(s)`));
      } catch (error) {
        console.log(chalk.yellow(`     ⚠️ Erro ao processar bucket ${bucket.name}: ${error.message}`));
      }
    }

    // Criar ZIP no padrão do Dashboard: {project-id}.storage.zip
    console.log(chalk.white('\n   - Criando arquivo ZIP no padrão do Dashboard...'));
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
    
    console.log(chalk.green(`   ✅ Arquivo ZIP criado: ${zipFileName} (${zipSizeMB} MB)`));

    // Perguntar ao usuário se deseja limpar a estrutura temporária
    const tempDirName = path.basename(tempStorageDir);
    const shouldCleanup = await confirm(`   Deseja limpar ${tempDirName} após o backup`, false);
    
    if (shouldCleanup) {
      console.log(chalk.white(`   - Limpando estrutura temporária...`));
      try {
        await fs.rm(tempStorageDir, { recursive: true, force: true });
        console.log(chalk.green(`   ✅ Estrutura temporária removida`));
      } catch (cleanupError) {
        console.log(chalk.yellow(`   ⚠️  Erro ao limpar estrutura temporária: ${cleanupError.message}`));
      }
    } else {
      console.log(chalk.white(`   ℹ️  Estrutura temporária mantida em: ${path.relative(process.cwd(), tempStorageDir)}`));
    }

    console.log(chalk.green(`✅ Storage backupado: ${processedBuckets.length} buckets, ${totalFilesDownloaded} arquivo(s) baixado(s)`));
    return { 
      success: true, 
      buckets: processedBuckets,
      zipFile: zipFileName,
      zipSizeMB: zipSizeMB,
      totalFiles: totalFilesDownloaded,
      tempDirCleaned: shouldCleanup
    };
  } catch (error) {
    console.log(chalk.yellow(`⚠️ Erro no backup do Storage: ${error.message}`));
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
  
  try {
    // Listar arquivos e pastas no caminho atual
    const { data: items, error } = await supabase.storage
      .from(bucketName)
      .list(folderPath, {
        limit: 1000,
        sortBy: { column: 'name', order: 'asc' }
      });

    if (error) {
      console.log(chalk.yellow(`       ⚠️  Erro ao listar ${folderPath || 'raiz'}: ${error.message}`));
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
    console.log(chalk.yellow(`       ⚠️  Erro ao processar ${folderPath || 'raiz'}: ${error.message}`));
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

