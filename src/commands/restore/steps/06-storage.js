const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const AdmZip = require('adm-zip');
const { createClient } = require('@supabase/supabase-js');

/**
 * Etapa 6: Restaurar Storage Buckets e arquivos
 * Processo baseado no script oficial do Supabase Storage Migration
 * Segue exatamente o processo descrito no notebook oficial do Supabase
 */
module.exports = async ({ backupPath, targetProject }) => {
  
  try {
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
          console.log(chalk.yellow('   ⚠️  Nenhum bucket de Storage encontrado no backup'));
          return { success: false, buckets_count: 0 };
        }
        
        console.log(chalk.yellow('\n   ⚠️  Arquivo .storage.zip não encontrado'));
        console.log(chalk.white('   ℹ️  Apenas metadados dos buckets foram encontrados'));
        console.log(chalk.white('   ℹ️  Para restaurar os arquivos, é necessário o arquivo .storage.zip do Dashboard'));
        console.log(chalk.green(`\n   ✅ ${buckets.length} bucket(s) encontrado(s) no backup (apenas metadados)`));
        buckets.forEach(bucket => {
          console.log(chalk.white(`   - ${bucket.name} (${bucket.public ? 'público' : 'privado'})`));
        });
        
        return { success: true, buckets_count: buckets.length, files_restored: false };
      } catch {
        console.log(chalk.yellow('   ⚠️  Nenhum bucket de Storage encontrado no backup'));
        return { success: false, buckets_count: 0 };
      }
    }
    
    // 3. Selecionar o primeiro arquivo .storage.zip encontrado
    const storageZipFile = path.join(backupPath, storageZipFiles[0]);
    console.log(chalk.white(`   - Arquivo de storage encontrado: ${storageZipFiles[0]}`));
    
    // 4. Validar credenciais do projeto destino
    if (!targetProject.targetProjectId || !targetProject.targetAccessToken) {
      throw new Error('Credenciais do projeto destino não configuradas. É necessário SUPABASE_PROJECT_ID e SUPABASE_ACCESS_TOKEN');
    }
    
    if (!targetProject.targetUrl || !targetProject.targetServiceKey) {
      throw new Error('Credenciais do Supabase não configuradas. É necessário NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
    }
    
    // 4.1 Obter project ID do projeto origem e validar substituição
    if (sourceProjectId && sourceProjectId !== targetProject.targetProjectId) {
      console.log(chalk.cyan(`   🔄 Substituindo Project ID: ${sourceProjectId} → ${targetProject.targetProjectId}`));
    } else if (!sourceProjectId) {
      console.log(chalk.yellow('   ⚠️  Project ID do projeto origem não encontrado no manifest. Continuando sem substituição...'));
    }
    
    // 5. Extrair arquivo ZIP
    console.log(chalk.white('   - Extraindo arquivo .storage.zip...'));
    const extractDir = path.join(backupPath, 'storage_extracted');
    
    try {
      await fs.mkdir(extractDir, { recursive: true });
    } catch {
      // Diretório pode já existir
    }
    
    const zip = new AdmZip(storageZipFile);
    zip.extractAllTo(extractDir, true);
    console.log(chalk.green('   ✅ Arquivo extraído com sucesso'));
    
    // 5.1 Substituir Project ID antigo pelo novo nos diretórios e arquivos extraídos
    // O Supabase pode incluir o project ID nos caminhos dentro do ZIP
    if (sourceProjectId && sourceProjectId !== targetProject.targetProjectId) {
      console.log(chalk.white('   - Substituindo referências ao Project ID antigo nos arquivos extraídos...'));
      await replaceProjectIdInExtractedFiles(extractDir, sourceProjectId, targetProject.targetProjectId);
      console.log(chalk.green('   ✅ Substituição de Project ID concluída'));
    }
    
    // 6. Ler estrutura de diretórios extraídos
    // O formato do .storage.zip do Supabase pode ter duas estruturas:
    // Estrutura 1 (direta): bucket-name/file1.jpg
    // Estrutura 2 (com Project ID): project-id/bucket-name/file1.jpg
    // Após a substituição do Project ID, a estrutura 2 fica: project-id-novo/bucket-name/file1.jpg
    const extractedContents = await fs.readdir(extractDir);
    const bucketDirs = [];

    // Verificar se a pasta raiz é o Project ID (antigo ou novo)
    // Se for, as subpastas são os buckets reais
    let rootDir = null;
    if (extractedContents.length === 1) {
      const firstItem = extractedContents[0];
      const firstItemPath = path.join(extractDir, firstItem);
      const firstItemStats = await fs.stat(firstItemPath);
      
      if (firstItemStats.isDirectory()) {
        // Verificar se o nome da pasta raiz corresponde ao Project ID antigo OU novo
        // Isso pode acontecer se a pasta raiz original era o Project ID antigo
        // e pode ou não ter sido renomeada para o Project ID novo pela função replaceProjectIdInExtractedFiles
        const isProjectId = 
          (sourceProjectId && firstItem === sourceProjectId) || 
          (firstItem === targetProject.targetProjectId);
        
        if (isProjectId) {
          // Verificar se contém subpastas (buckets reais)
          const subContents = await fs.readdir(firstItemPath);
          const hasSubDirs = subContents.some(item => {
            const itemPath = path.join(firstItemPath, item);
            try {
              const stats = fs.statSync(itemPath);
              return stats.isDirectory();
            } catch {
              return false;
            }
          });
          
          if (hasSubDirs) {
            // A pasta raiz é um wrapper do Project ID - buscar buckets nas subpastas
            rootDir = firstItem;
            console.log(chalk.white(`   - Detectada pasta raiz com Project ID: ${firstItem}`));
            console.log(chalk.white(`   - Buscando buckets nas subpastas...`));
          }
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
      console.log(chalk.yellow('   ⚠️  Nenhum bucket encontrado no arquivo .storage.zip'));
      return { success: false, buckets_count: 0 };
    }
    
    console.log(chalk.white(`   - Encontrados ${bucketDirs.length} bucket(s) no arquivo ZIP`));
    
    // 7. Criar cliente Supabase para o projeto destino
    const supabase = createClient(targetProject.targetUrl, targetProject.targetServiceKey);
    
    // 8. Processar cada bucket
    let successCount = 0;
    let totalFilesUploaded = 0;
    
    for (const bucketInfo of bucketDirs) {
      const bucketName = bucketInfo.name;
      const bucketPath = bucketInfo.path;
      
      try {
        console.log(chalk.white(`\n   - Processando bucket: ${bucketName}`));
        
        // 8.1 Obter metadados do bucket do backup (se disponíveis)
        const bucketMeta = bucketMetadata[bucketName] || {
          public: false,
          file_size_limit: null,
          allowed_mime_types: null
        };
        
        // 8.2 Verificar se bucket já existe, se não, criar com configurações corretas
        const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();
        
        if (listError) {
          throw new Error(`Erro ao listar buckets: ${listError.message}`);
        }
        
        const existingBucket = existingBuckets?.find(b => b.name === bucketName);
        const bucketExists = !!existingBucket;
        
        if (!bucketExists) {
          // Criar bucket via Management API com configurações do backup
          console.log(chalk.white(`     - Criando bucket ${bucketName}...`));
          console.log(chalk.white(`       Configurações: ${bucketMeta.public ? 'público' : 'privado'}, limite: ${bucketMeta.file_size_limit || 'sem limite'}, tipos: ${bucketMeta.allowed_mime_types?.join(', ') || 'todos'}`));
          
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
            throw new Error(`Erro ao criar bucket: ${createResponse.status} ${errorText}`);
          }
          
          console.log(chalk.green(`     ✅ Bucket ${bucketName} criado com configurações do backup`));
        } else {
          // Bucket já existe - verificar e atualizar configurações se necessário
          console.log(chalk.white(`     - Bucket ${bucketName} já existe`));
          
          const needsUpdate = 
            existingBucket.public !== bucketMeta.public ||
            existingBucket.file_size_limit !== bucketMeta.file_size_limit ||
            JSON.stringify(existingBucket.allowed_mime_types || []) !== JSON.stringify(bucketMeta.allowed_mime_types || []);
          
          if (needsUpdate) {
            console.log(chalk.white(`     - Atualizando configurações do bucket para corresponder ao backup...`));
            
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
              console.log(chalk.yellow(`       ⚠️  Não foi possível atualizar configurações: ${errorText}`));
            } else {
              console.log(chalk.green(`       ✅ Configurações do bucket atualizadas`));
            }
          } else {
            console.log(chalk.white(`     - Configurações do bucket já estão corretas`));
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
        console.log(chalk.white(`     - Encontrados ${filesToUpload.length} arquivo(s) para upload`));
        
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
              console.log(chalk.yellow(`       ⚠️  Erro ao fazer upload de ${storagePath}: ${uploadError.message}`));
            } else {
              filesUploaded++;
              if (filesToUpload.length <= 10 || filesUploaded % Math.ceil(filesToUpload.length / 10) === 0) {
                const metaInfo = objectMeta ? ' (metadados preservados)' : '';
                console.log(chalk.white(`       - Upload: ${storagePath}${metaInfo}`));
              }
            }
          } catch (fileError) {
            console.log(chalk.yellow(`       ⚠️  Erro ao processar arquivo ${file.storagePath}: ${fileError.message}`));
          }
        }
        
        console.log(chalk.green(`     ✅ Bucket ${bucketName}: ${filesUploaded}/${filesToUpload.length} arquivo(s) enviado(s)`));
        successCount++;
        totalFilesUploaded += filesUploaded;
        
      } catch (bucketError) {
        console.log(chalk.red(`     ❌ Erro ao processar bucket ${bucketName}: ${bucketError.message}`));
      }
    }
    
    // 9. Limpar diretório de extração
    try {
      await fs.rm(extractDir, { recursive: true, force: true });
    } catch {
      // Ignorar erro de limpeza
    }
    
    console.log(chalk.green(`\n   ✅ Restauração de Storage concluída: ${successCount}/${bucketDirs.length} bucket(s) processado(s), ${totalFilesUploaded} arquivo(s) enviado(s)`));
    
    return {
      success: true,
      buckets_count: successCount,
      files_restored: true,
      total_files: totalFilesUploaded
    };
    
  } catch (error) {
    console.error(chalk.red(`   ❌ Erro ao processar Storage: ${error.message}`));
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
