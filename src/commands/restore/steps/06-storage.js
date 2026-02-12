const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const AdmZip = require('adm-zip');
const { createClient } = require('@supabase/supabase-js');
const { t } = require('../../../i18n');

/**
 * Etapa 6: Restaurar Storage Buckets e arquivos
 * Processo baseado no script oficial do Supabase Storage Migration
 * Segue exatamente o processo descrito no notebook oficial do Supabase
 */
module.exports = async ({ backupPath, targetProject }) => {
  
  try {
    const getT = global.smoonbI18n?.t || t;
    // 1. Verificar se existe arquivo .storage.zip na pasta do backup
    const storageZipFiles = await fs.readdir(backupPath).then(files => 
      files.filter(f => f.endsWith('.storage.zip'))
    );
    
    // 2. Carregar metadados dos buckets do backup (se existirem)
    const storageDir = path.join(backupPath, 'storage');
    const manifestPath = path.join(backupPath, 'backup-manifest.json');
    const bucketMetadata = {};
    let manifest = null;
    let sourceProjectId = null;
    
    try {
      const manifestContent = await fs.readFile(manifestPath, 'utf8');
      manifest = JSON.parse(manifestContent);
      
      // Obter project ID do projeto origem do manifest
      sourceProjectId = manifest?.project_id || null;
      
      // Carregar metadados dos buckets do manifest
      const buckets = manifest?.components?.storage?.buckets || [];
      for (const bucket of buckets) {
        bucketMetadata[bucket.name] = {
          public: bucket.public || false,
          file_size_limit: bucket.file_size_limit || null,
          allowed_mime_types: bucket.allowed_mime_types || null
        };
      }
      
      // Também tentar carregar dos arquivos JSON individuais (backup mais detalhado)
      try {
        const storageFiles = await fs.readdir(storageDir);
        for (const file of storageFiles) {
          if (file.endsWith('.json') && file !== 'README.md') {
            const bucketName = file.replace('.json', '');
            try {
              const bucketInfoPath = path.join(storageDir, file);
              const bucketInfoContent = await fs.readFile(bucketInfoPath, 'utf8');
              const bucketInfo = JSON.parse(bucketInfoContent);
              
              // Usar metadados dos arquivos JSON se disponíveis (mais completo)
              // Incluir objetos para preservar metadados dos arquivos (contentType, cacheControl)
              bucketMetadata[bucketName] = {
                public: bucketInfo.public !== undefined ? bucketInfo.public : false,
                file_size_limit: bucketInfo.file_size_limit || null,
                allowed_mime_types: bucketInfo.allowed_mime_types || null,
                objects: bucketInfo.objects || [] // Metadados dos objetos para preservar contentType e cacheControl
              };
            } catch {
              // Ignorar arquivos JSON inválidos
            }
          }
        }
      } catch {
        // Pasta storage pode não existir, continuar
      }
    } catch {
      // Manifest pode não existir, continuar sem metadados
    }
    
    if (storageZipFiles.length === 0) {
      // Verificar se existe pasta storage com metadados (backup antigo)
      try {
        await fs.access(storageDir);
        const buckets = manifest?.components?.storage?.buckets || [];
        
        if (buckets.length === 0) {
          console.log(chalk.yellow(`   ⚠️  ${getT('restore.steps.storage.noBuckets')}`));
          return { success: false, buckets_count: 0 };
        }
        
        console.log(chalk.yellow(`\n   ⚠️  ${getT('restore.steps.storage.zipNotFound')}`));
        console.log(chalk.white(`   ℹ️  ${getT('restore.steps.storage.metadataOnly')}`));
        console.log(chalk.white(`   ℹ️  ${getT('restore.steps.storage.zipRequired')}`));
        console.log(chalk.green(`\n   ✅ ${getT('restore.steps.storage.bucketsFoundMetadata', { count: buckets.length })}`));
        buckets.forEach(bucket => {
          const visibility = bucket.public ? getT('restore.steps.storage.public') : getT('restore.steps.storage.private');
          console.log(chalk.white(`   - ${getT('restore.steps.storage.bucketInfo', { name: bucket.name, visibility })}`));
        });
        
        return { success: true, buckets_count: buckets.length, files_restored: false };
      } catch {
        console.log(chalk.yellow(`   ⚠️  ${getT('restore.steps.storage.noBucketsInBackup')}`));
        return { success: false, buckets_count: 0 };
      }
    }
    
    // 3. Selecionar o primeiro arquivo .storage.zip encontrado
    const storageZipFile = path.join(backupPath, storageZipFiles[0]);
    const storageZipBaseName = path.basename(storageZipFiles[0], '.storage.zip');
    console.log(chalk.white(`   - ${getT('restore.steps.storage.fileFound', { fileName: storageZipFiles[0] })}`));
    
    // 4. Validar credenciais do projeto destino
    if (!targetProject.targetProjectId || !targetProject.targetAccessToken) {
      const getT = global.smoonbI18n?.t || t;
      throw new Error(getT('error.storageCredentialsNotConfigured'));
    }
    
    if (!targetProject.targetUrl || !targetProject.targetServiceKey) {
      throw new Error(getT('error.supabaseCredentialsNotConfigured'));
    }
    
    // 4.1 Obter project ID do projeto origem e validar substituição
    if (sourceProjectId && sourceProjectId !== targetProject.targetProjectId) {
      console.log(chalk.cyan(`   🔄 ${getT('restore.steps.storage.replacingProjectId', { source: sourceProjectId, target: targetProject.targetProjectId })}`));
    } else if (!sourceProjectId) {
      console.log(chalk.yellow(`   ⚠️  ${getT('restore.steps.storage.projectIdNotFound')}`));
    }
    
    // 5. Extrair arquivo ZIP
    console.log(chalk.white(`   - ${getT('restore.steps.storage.extracting')}`));
    const extractDir = path.join(backupPath, 'storage_extracted');
    
    try {
      await fs.mkdir(extractDir, { recursive: true });
    } catch {
      // Diretório pode já existir
    }
    
    const zip = new AdmZip(storageZipFile);
    zip.extractAllTo(extractDir, true);
    console.log(chalk.green(`   ✅ ${getT('restore.steps.storage.extracted')}`));
    
    // 5.1 Substituir Project ID antigo pelo novo nos diretórios e arquivos extraídos
    // O Supabase pode incluir o project ID nos caminhos dentro do ZIP
    if (sourceProjectId && sourceProjectId !== targetProject.targetProjectId) {
      console.log(chalk.white(`   - ${getT('restore.steps.storage.replacing')}`));
      await replaceProjectIdInExtractedFiles(extractDir, sourceProjectId, targetProject.targetProjectId);
      console.log(chalk.green(`   ✅ ${getT('restore.steps.storage.replaced')}`));
    }
    
    // 6. Ler estrutura de diretórios extraídos
    // O formato do .storage.zip do Supabase pode ter duas estruturas:
    // Estrutura 1 (direta): bucket-name/file1.jpg
    // Estrutura 2 (com Project ID): project-id/bucket-name/file1.jpg
    // Após a substituição do Project ID, a estrutura 2 fica: project-id-novo/bucket-name/file1.jpg
    const extractedContents = await fs.readdir(extractDir);
    const bucketDirs = [];

    // Verificar se a pasta raiz é o Project ID (antigo ou novo)
    // Se for, as subpastas são os buckets reais - NUNCA tratar a pasta raiz como bucket
    let rootDir = null;
    if (extractedContents.length === 1) {
      const firstItem = extractedContents[0];
      const firstItemPath = path.join(extractDir, firstItem);
      const firstItemStats = await fs.stat(firstItemPath);

      if (firstItemStats.isDirectory()) {
        // Verificar se o nome da pasta raiz corresponde ao Project ID antigo OU novo
        const matchesSourceProjectId = sourceProjectId && firstItem === sourceProjectId;
        const matchesTargetProjectId = firstItem === targetProject.targetProjectId;
        const matchesZipFileName = firstItem === storageZipBaseName;
        const matchesProjectIdPattern = isLikelyProjectId(firstItem);

        const isProjectId =
          matchesSourceProjectId ||
          matchesTargetProjectId ||
          matchesZipFileName ||
          matchesProjectIdPattern;

        if (isProjectId) {
          // A pasta raiz é um wrapper do Project ID - SEMPRE buscar buckets nas subpastas
          rootDir = firstItem;
          const reasons = [];
          if (matchesSourceProjectId) reasons.push('manifest');
          if (matchesTargetProjectId) reasons.push('projeto destino');
          if (matchesZipFileName) reasons.push('nome do arquivo ZIP');
          if (matchesProjectIdPattern) reasons.push('formato de Project ID');
          const reasonText = reasons.length ? ` (${reasons.join(', ')})` : '';
          console.log(chalk.white(`   - ${getT('restore.steps.storage.detectedProjectId', { projectId: firstItem, reason: reasonText })}`));
          console.log(chalk.white(`   - ${getT('restore.steps.storage.searchingBuckets')}`));
        }
      }
    }

    if (rootDir) {
      // Estrutura com Project ID: project-id/bucket-name/...
      // Listar subpastas dentro da pasta do Project ID - essas são os buckets reais
      const projectIdPath = path.join(extractDir, rootDir);
      const subContents = await fs.readdir(projectIdPath);
      
      for (const item of subContents) {
        const itemPath = path.join(projectIdPath, item);
        const stats = await fs.stat(itemPath);
        if (stats.isDirectory()) {
          bucketDirs.push({
            name: item,
            path: itemPath
          });
        }
      }
      
      // Se não encontrou buckets nas subpastas, avisar e retornar erro
      if (bucketDirs.length === 0) {
        console.log(chalk.red(`   ❌ ${getT('restore.steps.storage.noBucketsInSubfolders', { rootDir })}`));
        console.log(chalk.red(`   ❌ ${getT('restore.steps.storage.rootIsProjectId')}`));
        return { success: false, buckets_count: 0 };
      }
    } else {
      // Estrutura direta: bucket-name/...
      // As pastas raiz são os buckets
      for (const item of extractedContents) {
        const itemPath = path.join(extractDir, item);
        const stats = await fs.stat(itemPath);
        if (stats.isDirectory()) {
          bucketDirs.push({
            name: item,
            path: itemPath
          });
        }
      }
    }
    
    if (bucketDirs.length === 0) {
      console.log(chalk.yellow(`   ⚠️  ${getT('restore.steps.storage.noBucketsInZip')}`));
      return { success: false, buckets_count: 0 };
    }
    
    console.log(chalk.white(`   - ${getT('restore.steps.storage.bucketsFoundInZip', { count: bucketDirs.length })}`));
    
    // 7. Criar cliente Supabase para o projeto destino
    const supabase = createClient(targetProject.targetUrl, targetProject.targetServiceKey);
    
    // 8. Processar cada bucket
    let successCount = 0;
    let totalFilesUploaded = 0;
    
    for (const bucketInfo of bucketDirs) {
      const bucketName = bucketInfo.name;
      const bucketPath = bucketInfo.path;
      
      try {
        console.log(chalk.white(`\n   - ${getT('restore.steps.storage.processingBucket', { bucketName })}`));
        
        // 8.1 Obter metadados do bucket do backup (se disponíveis)
        const bucketMeta = bucketMetadata[bucketName] || {
          public: false,
          file_size_limit: null,
          allowed_mime_types: null
        };
        
        // 8.2 Verificar se bucket já existe, se não, criar com configurações corretas
        const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();
        
        if (listError) {
          throw new Error(getT('restore.steps.edgeFunctions.listBucketsError', { message: listError.message }));
        }
        
        const existingBucket = existingBuckets?.find(b => b.name === bucketName);
        const bucketExists = !!existingBucket;
        
        if (!bucketExists) {
          // Criar bucket via Management API com configurações do backup
          console.log(chalk.white(`     - ${getT('restore.steps.storage.creatingBucket', { bucketName })}`));
          const visibility = bucketMeta.public ? getT('restore.steps.storage.public') : getT('restore.steps.storage.private');
          const limit = bucketMeta.file_size_limit || getT('restore.steps.storage.noLimit');
          const types = bucketMeta.allowed_mime_types?.join(', ') || getT('restore.steps.storage.allTypes');
          console.log(chalk.white(`       ${getT('restore.steps.storage.bucketConfig', { visibility, limit, types })}`));
          
          const createResponse = await fetch(
            `https://api.supabase.com/v1/projects/${targetProject.targetProjectId}/storage/buckets`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${targetProject.targetAccessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                name: bucketName,
                public: bucketMeta.public,
                file_size_limit: bucketMeta.file_size_limit,
                allowed_mime_types: bucketMeta.allowed_mime_types
              })
            }
          );
          
          if (!createResponse.ok) {
            const errorText = await createResponse.text();
            throw new Error(getT('restore.steps.edgeFunctions.createBucketError', { status: createResponse.status, errorText }));
          }
          
          console.log(chalk.green(`     ✅ ${getT('restore.steps.storage.bucketCreated', { bucketName })}`));
        } else {
          // Bucket já existe - verificar e atualizar configurações se necessário
          console.log(chalk.white(`     - ${getT('restore.steps.storage.bucketExists', { bucketName })}`));
          
          const needsUpdate = 
            existingBucket.public !== bucketMeta.public ||
            existingBucket.file_size_limit !== bucketMeta.file_size_limit ||
            JSON.stringify(existingBucket.allowed_mime_types || []) !== JSON.stringify(bucketMeta.allowed_mime_types || []);
          
          if (needsUpdate) {
            console.log(chalk.white(`     - ${getT('restore.steps.storage.updating')}`));
            
            const updateResponse = await fetch(
              `https://api.supabase.com/v1/projects/${targetProject.targetProjectId}/storage/buckets/${bucketName}`,
              {
                method: 'PATCH',
                headers: {
                  'Authorization': `Bearer ${targetProject.targetAccessToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  public: bucketMeta.public,
                  file_size_limit: bucketMeta.file_size_limit,
                  allowed_mime_types: bucketMeta.allowed_mime_types
                })
              }
            );
            
            if (!updateResponse.ok) {
              const errorText = await updateResponse.text();
              console.log(chalk.yellow(`       ⚠️  ${getT('restore.steps.storage.updateError', { errorText })}`));
            } else {
              console.log(chalk.green(`       ✅ ${getT('restore.steps.storage.bucketUpdated')}`));
            }
          } else {
            console.log(chalk.white(`     - ${getT('restore.steps.storage.bucketConfigCorrect')}`));
          }
        }
        
        // 8.3 Listar todos os arquivos do bucket recursivamente
        async function getAllFiles(dir, basePath = '') {
          const files = [];
          const entries = await fs.readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            // Substituir project ID antigo pelo novo no caminho relativo
            let relativePath = path.join(basePath, entry.name).replace(/\\/g, '/');
            if (sourceProjectId && sourceProjectId !== targetProject.targetProjectId) {
              relativePath = relativePath.replace(new RegExp(sourceProjectId, 'g'), targetProject.targetProjectId);
            }
            
            if (entry.isDirectory()) {
              const subFiles = await getAllFiles(fullPath, relativePath);
              files.push(...subFiles);
            } else {
              files.push({
                localPath: fullPath,
                storagePath: relativePath
              });
            }
          }
          
          return files;
        }
        
        const filesToUpload = await getAllFiles(bucketPath);
        console.log(chalk.white(`     - ${getT('restore.steps.storage.filesFoundForUpload', { count: filesToUpload.length })}`));
        
        // 8.4 Fazer upload de cada arquivo
        // Criar mapa de metadados dos objetos do backup (se disponível)
        // A Management API pode retornar objetos com diferentes estruturas
        const objectsMetadata = {};
        if (bucketMeta.objects && Array.isArray(bucketMeta.objects)) {
          for (const obj of bucketMeta.objects) {
            // Normalizar o caminho para comparação (remover barras iniciais e normalizar)
            // A API pode retornar 'name' ou 'path' ou 'id'
            const objPath = obj.name || obj.path || obj.id || '';
            const normalizedPath = objPath.replace(/^\/+/, '').replace(/\\/g, '/');
            if (normalizedPath) {
              objectsMetadata[normalizedPath] = obj;
            }
          }
        }
        
        let filesUploaded = 0;
        for (const file of filesToUpload) {
          try {
            const fileContent = await fs.readFile(file.localPath);
            const fileName = path.basename(file.localPath);
            
            // Usar o caminho relativo como path no storage
            const storagePath = file.storagePath;
            
            // Buscar metadados do objeto no backup (se disponível)
            // Normalizar caminho para comparação (remover barras iniciais e normalizar separadores)
            const normalizedStoragePath = storagePath.replace(/^\/+/, '').replace(/\\/g, '/');
            const objectMeta = objectsMetadata[normalizedStoragePath];
            
            // Extrair metadados do objeto (a estrutura pode variar)
            // A Management API pode retornar metadata.mimetype, metadata.contentType, ou metadata diretamente
            let contentType = getContentType(fileName);
            let cacheControl = undefined;
            
            if (objectMeta) {
              // Tentar diferentes estruturas possíveis de metadados
              const metadata = objectMeta.metadata || objectMeta;
              contentType = metadata?.mimetype || 
                           metadata?.contentType || 
                           metadata?.mime_type ||
                           objectMeta.mimetype ||
                           objectMeta.contentType ||
                           getContentType(fileName);
              
              cacheControl = metadata?.cacheControl || 
                            metadata?.cache_control ||
                            objectMeta.cacheControl ||
                            objectMeta.cache_control ||
                            undefined;
            }
            
            // Preparar opções de upload seguindo o script oficial do Supabase
            // Preservar contentType e cacheControl quando disponíveis
            const uploadOptions = {
              upsert: true, // Sobrescrever se já existir
              contentType: contentType
            };
            
            // Adicionar cacheControl apenas se estiver definido
            if (cacheControl) {
              uploadOptions.cacheControl = cacheControl;
            }
            
            const { error: uploadError } = await supabase.storage
              .from(bucketName)
              .upload(storagePath, fileContent, uploadOptions);
            
            if (uploadError) {
              console.log(chalk.yellow(`       ⚠️  ${getT('restore.steps.storage.uploadError', { path: storagePath, message: uploadError.message })}`));
            } else {
              filesUploaded++;
              if (filesToUpload.length <= 10 || filesUploaded % Math.ceil(filesToUpload.length / 10) === 0) {
                const metaInfo = objectMeta ? ` ${getT('restore.steps.storage.metadataPreserved')}` : '';
                console.log(chalk.white(`       - ${getT('restore.steps.storage.uploadProgress', { path: storagePath, metaInfo })}`));
              }
            }
          } catch (fileError) {
            console.log(chalk.yellow(`       ⚠️  ${getT('restore.steps.storage.fileError', { path: file.storagePath, message: fileError.message })}`));
          }
        }
        
        console.log(chalk.green(`     ✅ ${getT('restore.steps.storage.bucketDone', { bucketName, uploaded: filesUploaded, total: filesToUpload.length })}`));
        successCount++;
        totalFilesUploaded += filesUploaded;
        
      } catch (bucketError) {
        console.log(chalk.red(`     ❌ ${getT('restore.steps.storage.bucketError', { bucketName, message: bucketError.message })}`));
      }
    }
    
    // 9. Limpar diretório de extração
    try {
      await fs.rm(extractDir, { recursive: true, force: true });
    } catch {
      // Ignorar erro de limpeza
    }
    
    console.log(chalk.green(`\n   ✅ ${getT('restore.steps.storage.restoreComplete', { success: successCount, total: bucketDirs.length, files: totalFilesUploaded })}`));
    
    return {
      success: true,
      buckets_count: successCount,
      files_restored: true,
      total_files: totalFilesUploaded
    };
    
  } catch (error) {
    const getT = global.smoonbI18n?.t || t;
    console.error(chalk.red(`   ❌ ${getT('restore.steps.storage.error', { message: error.message })}`));
    throw error;
  }
};

/**
 * Substitui o Project ID antigo pelo novo em arquivos extraídos
 * Processa recursivamente todos os arquivos e diretórios
 * IMPORTANTE: Processa primeiro os filhos, depois renomeia o diretório atual
 * para evitar problemas com caminhos que mudam durante o processamento
 */
async function replaceProjectIdInExtractedFiles(dir, oldProjectId, newProjectId) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  // Primeiro, processar recursivamente todos os filhos (arquivos e subdiretórios)
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Processar recursivamente o subdiretório ANTES de renomeá-lo
      await replaceProjectIdInExtractedFiles(entryPath, oldProjectId, newProjectId);
    } else {
      // Processar arquivos: substituir project ID no conteúdo (se for texto) e no nome
      // Renomear arquivo se contiver o project ID antigo
      if (entry.name.includes(oldProjectId)) {
        const newName = entry.name.replace(new RegExp(oldProjectId, 'g'), newProjectId);
        if (newName !== entry.name) {
          const newPath = path.join(dir, newName);
          try {
            await fs.rename(entryPath, newPath);
          } catch {
            // Ignorar erros de renomeação (pode já ter sido renomeado)
          }
        }
      }
      
      // Substituir project ID no conteúdo de arquivos de texto
      // Verificar extensões comuns de arquivos de texto
      const textExtensions = ['.json', '.txt', '.md', '.html', '.css', '.js', '.xml', '.yaml', '.yml'];
      const ext = path.extname(entry.name).toLowerCase();
      
      if (textExtensions.includes(ext)) {
        try {
          const content = await fs.readFile(entryPath, 'utf8');
          if (content.includes(oldProjectId)) {
            const newContent = content.replace(new RegExp(oldProjectId, 'g'), newProjectId);
            await fs.writeFile(entryPath, newContent, 'utf8');
          }
        } catch {
          // Ignorar erros ao processar arquivos (pode ser binário ou sem permissão)
        }
      }
    }
  }
  
  // Depois de processar todos os filhos, renomear o diretório atual se necessário
  // Ler novamente os diretórios para pegar os nomes atualizados
  const updatedEntries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of updatedEntries) {
    if (entry.isDirectory() && entry.name.includes(oldProjectId)) {
      const entryPath = path.join(dir, entry.name);
      const newName = entry.name.replace(new RegExp(oldProjectId, 'g'), newProjectId);
      if (newName !== entry.name) {
        const newPath = path.join(dir, newName);
        try {
          await fs.rename(entryPath, newPath);
        } catch {
          // Ignorar erros de renomeação (pode já ter sido renomeado)
        }
      }
    }
  }
}

/**
 * Determina o content-type baseado na extensão do arquivo
 */
function getContentType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const contentTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.zip': 'application/zip',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg'
  };
  
  return contentTypes[ext] || 'application/octet-stream';
}

function isLikelyProjectId(name) {
  if (!name || typeof name !== 'string') {
    return false;
  }

  // Project IDs do Supabase são normalmente strings de 20 caracteres alfanuméricos minúsculos
  return /^[a-z0-9]{20}$/.test(name);
}
