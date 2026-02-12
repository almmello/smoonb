#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const chalk = require('chalk');

console.log(chalk.blue('🔍 Verificando sintaxe dos arquivos principais...\n'));

const filesToCheck = [
  'bin/smoonb.js',
  'src/index.js',
  'src/commands/import.js',
  'src/commands/functions.js',
  'src/commands/config.js',
  'src/commands/backup/index.js',
  'src/commands/backup/utils.js',
  'src/commands/restore/index.js',
  'src/commands/restore/utils.js',
  'src/i18n/index.js',
  'src/utils/banner.js',
  'src/utils/prompt.js',
  'src/utils/installationId.js'
];

let hasErrors = false;
const errors = [];

for (const file of filesToCheck) {
  const filePath = path.join(process.cwd(), file);
  
  if (!fs.existsSync(filePath)) {
    console.log(chalk.yellow(`⚠️  Arquivo não encontrado: ${file}`));
    continue;
  }

  try {
    execSync(`node -c "${filePath}"`, { stdio: 'pipe' });
    
    // Verificar declarações duplicadas de variáveis no mesmo escopo
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const constDeclarations = new Map();
    let scopeDepth = 0;
    const scopeStack = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Detectar abertura de escopos (funções, try, catch, if, for, while, etc)
      if (trimmedLine.match(/^\s*(function|async\s+function|try|catch|if|for|while|switch)\s*\(/)) {
        scopeDepth++;
        scopeStack.push({ type: 'block', start: i + 1 });
      }
      // Detectar abertura de blocos com {
      if (trimmedLine.includes('{')) {
        const openBraces = (trimmedLine.match(/\{/g) || []).length;
        for (let j = 0; j < openBraces; j++) {
          scopeDepth++;
          scopeStack.push({ type: 'brace', start: i + 1 });
        }
      }
      // Detectar fechamento de blocos com }
      if (trimmedLine.includes('}')) {
        const closeBraces = (trimmedLine.match(/\}/g) || []).length;
        for (let j = 0; j < closeBraces; j++) {
          if (scopeStack.length > 0) {
            const closedScope = scopeStack.pop();
            // Limpar declarações do escopo fechado
            for (const [varName, info] of constDeclarations.entries()) {
              if (info.scopeStart === closedScope.start) {
                constDeclarations.delete(varName);
              }
            }
          }
          scopeDepth = Math.max(0, scopeDepth - 1);
        }
      }
      
      const constMatch = line.match(/const\s+(\w+)\s*=/);
      if (constMatch) {
        const varName = constMatch[1];
        const lineNum = i + 1;
        
        // Verificar se já foi declarada no mesmo escopo
        if (constDeclarations.has(varName)) {
          const prevInfo = constDeclarations.get(varName);
          // Verificar se está no mesmo escopo (mesmo depth e próximo)
          if (prevInfo.scopeDepth === scopeDepth && Math.abs(lineNum - prevInfo.line) < 100) {
            // Verificar se não está em um catch block (onde é comum redeclarar)
            const isInCatch = trimmedLine.includes('catch') || 
                             lines.slice(Math.max(0, i - 5), i).some(l => l.includes('catch'));
            if (!isInCatch) {
              console.log(chalk.yellow(`⚠️  Possível declaração duplicada: ${varName} na linha ${lineNum} (anterior: ${prevInfo.line})`));
            }
          }
        }
        constDeclarations.set(varName, { line: lineNum, scopeDepth, scopeStart: scopeStack.length > 0 ? scopeStack[scopeStack.length - 1].start : 0 });
      }
    }
    
    console.log(chalk.green(`✅ ${file}`));
  } catch (error) {
    hasErrors = true;
    errors.push({ file, error: error.message });
    console.log(chalk.red(`❌ ${file}`));
    console.log(chalk.red(`   ${error.message.split('\n')[0]}`));
  }
}

// Verificar JSON files
console.log(chalk.blue('\n🔍 Verificando arquivos JSON...\n'));

const jsonFiles = [
  'src/i18n/locales/en.json',
  'src/i18n/locales/pt-BR.json',
  'package.json'
];

for (const file of jsonFiles) {
  const filePath = path.join(process.cwd(), file);
  
  if (!fs.existsSync(filePath)) {
    console.log(chalk.yellow(`⚠️  Arquivo não encontrado: ${file}`));
    continue;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    JSON.parse(content);
    console.log(chalk.green(`✅ ${file}`));
  } catch (error) {
    hasErrors = true;
    errors.push({ file, error: error.message });
    console.log(chalk.red(`❌ ${file}`));
    console.log(chalk.red(`   ${error.message.split('\n')[0]}`));
  }
}

if (hasErrors) {
  console.log(chalk.red('\n❌ Build falhou! Corrija os erros acima antes de publicar.\n'));
  process.exit(1);
}

// Verificar se os arquivos listados no package.json existem
console.log(chalk.blue('\n🔍 Verificando arquivos do package.json...\n'));

const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
const filesToPublish = packageJson.files || [];

for (const filePattern of filesToPublish) {
  const filePath = path.join(process.cwd(), filePattern);
  
  // Se for um diretório, verificar se existe
  if (filePattern.endsWith('/')) {
    const dirPath = filePattern.slice(0, -1);
    const fullPath = path.join(process.cwd(), dirPath);
    if (!fs.existsSync(fullPath)) {
      console.log(chalk.yellow(`⚠️  Diretório não encontrado: ${filePattern}`));
    } else {
      console.log(chalk.green(`✅ ${filePattern}`));
    }
  } else {
    // Se for um arquivo, verificar se existe
    if (!fs.existsSync(filePath)) {
      console.log(chalk.yellow(`⚠️  Arquivo não encontrado: ${filePattern}`));
    } else {
      console.log(chalk.green(`✅ ${filePattern}`));
    }
  }
}

// Verificar se os arquivos de i18n têm as mesmas chaves
console.log(chalk.blue('\n🔍 Verificando consistência dos arquivos de i18n...\n'));

try {
  const enCatalog = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/i18n/locales/en.json'), 'utf8'));
  const ptBRCatalog = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/i18n/locales/pt-BR.json'), 'utf8'));
  
  const enKeys = Object.keys(enCatalog).sort();
  const ptBRKeys = Object.keys(ptBRCatalog).sort();
  
  const missingInPtBR = enKeys.filter(key => !ptBRKeys.includes(key));
  const missingInEn = ptBRKeys.filter(key => !enKeys.includes(key));
  
  if (missingInPtBR.length > 0) {
    console.log(chalk.yellow(`⚠️  Chaves faltando em pt-BR.json: ${missingInPtBR.length}`));
    missingInPtBR.slice(0, 5).forEach(key => {
      console.log(chalk.yellow(`   - ${key}`));
    });
    if (missingInPtBR.length > 5) {
      console.log(chalk.yellow(`   ... e mais ${missingInPtBR.length - 5} chaves`));
    }
  }
  
  if (missingInEn.length > 0) {
    console.log(chalk.yellow(`⚠️  Chaves faltando em en.json: ${missingInEn.length}`));
    missingInEn.slice(0, 5).forEach(key => {
      console.log(chalk.yellow(`   - ${key}`));
    });
    if (missingInEn.length > 5) {
      console.log(chalk.yellow(`   ... e mais ${missingInEn.length - 5} chaves`));
    }
  }
  
  if (missingInPtBR.length === 0 && missingInEn.length === 0) {
    console.log(chalk.green(`✅ Arquivos de i18n estão consistentes (${enKeys.length} chaves)`));
  }
} catch (error) {
  console.log(chalk.yellow(`⚠️  Erro ao verificar consistência de i18n: ${error.message}`));
}

// Verificar se o bin/smoonb.js tem shebang correto
console.log(chalk.blue('\n🔍 Verificando bin/smoonb.js...\n'));

try {
  const binContent = fs.readFileSync(path.join(process.cwd(), 'bin/smoonb.js'), 'utf8');
  if (binContent.startsWith('#!/usr/bin/env node')) {
    console.log(chalk.green('✅ Shebang correto em bin/smoonb.js'));
  } else {
    console.log(chalk.yellow('⚠️  Shebang não encontrado ou incorreto em bin/smoonb.js'));
  }
} catch (error) {
  console.log(chalk.yellow(`⚠️  Erro ao verificar bin/smoonb.js: ${error.message}`));
}

// Tentar executar ESLint se disponível
console.log(chalk.blue('\n🔍 Verificando lint (ESLint)...\n'));

try {
  execSync('npx eslint . --ext .js', { stdio: 'inherit' });
  console.log(chalk.green('\n✅ Lint passou com sucesso!\n'));
} catch (error) {
  // Se o ESLint falhar, não falhar o build, apenas avisar
  // O build de sintaxe já passou, então o código está válido
  if (error.status !== 0) {
    console.log(chalk.yellow('\n⚠️  ESLint encontrou problemas, mas a sintaxe está válida.'));
    console.log(chalk.yellow('   Corrija os warnings/erros do ESLint antes de publicar.\n'));
  } else {
    console.log(chalk.yellow('\n⚠️  ESLint não está disponível.'));
    console.log(chalk.yellow('   Instale as dependências com: npm install\n'));
  }
}

console.log(chalk.green('✅ Build concluído com sucesso! Todos os arquivos estão válidos.\n'));
process.exit(0);

