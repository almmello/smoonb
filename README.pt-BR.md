# Supa Moonbase (smoonb)

**Ferramenta completa de backup e migração do Supabase**

Backup e restauração: completo e simples, como deveria ser

> **Produto comercial.** É necessário ter **licença ativa** e **assinatura válida** (ou estar em período de trial) para usar o smoonb. [www.smoonb.com/#price](https://www.smoonb.com/#price). O uso é regido pelos [Termos de Serviço](https://www.smoonb.com/terms) e pela [Política de Privacidade](https://www.smoonb.com/privacy). Não assumimos responsabilidade por danos causados pelo smoonb; os avisos legais abaixo permanecem válidos.

**Leia em outro idioma:** [English](README.md)

**Desenvolvido por:** Goalmoon Tecnologia LTDA  
**Website:** https://www.smoonb.com  
**GitHub:** https://github.com/almmello/smoonb

## 🎯 Objetivo

O **smoonb** resolve o problema das ferramentas existentes que fazem backup apenas da database PostgreSQL, ignorando componentes críticos do Supabase.

## 📦 Componentes de Backup

O smoonb faz backup completo de todos os componentes do seu projeto Supabase:

- ✅ **Database PostgreSQL** (backup completo via `pg_dumpall` + SQL separados, idêntico ao Dashboard)
- ✅ **Database Extensions and Settings** (extensões PostgreSQL e configurações)
- ✅ **Custom Roles** (roles personalizados do PostgreSQL)
- ✅ **Edge Functions** (download automático do servidor)
- ✅ **Auth Settings** (configurações de autenticação via Management API)
- ✅ **Storage Buckets** (backup completo: metadados, configurações e todos os arquivos via Management API + Supabase Client, cria ZIP no padrão do Dashboard)
- ✅ **Realtime Settings** (7 parâmetros capturados interativamente)
- ✅ **Supabase .temp** (arquivos temporários do Supabase CLI)
- ✅ **Migrations** (todas as migrations do projeto via `supabase migration fetch`)

## ⚠️ Universal Disclaimer / Aviso Legal Universal

Ao continuar, você reconhece e concorda que o Supa Moonbase (smoonb) é fornecido "NO ESTADO EM QUE SE ENCONTRA" ("AS IS") e "CONFORME DISPONIBILIDADE" ("AS AVAILABLE"), sem garantias de qualquer natureza—expressas, implícitas ou legais—incluindo, sem limitação, garantias de comercialização, adequação a um fim específico e não violação, na máxima extensão permitida pela lei aplicável. Operações de backup e restauração envolvem riscos inerentes, os ambientes variam amplamente e não podemos prever ou validar todas as configurações dos usuários. Você é o único responsável por validar seu próprio ambiente, manter cópias independentes e verificar os resultados antes de utilizá-los em produção. Construímos o Supa Moonbase (smoonb) com repositórios públicos, auditáveis e de código aberto para ajudar pessoas a simplificar seus fluxos de trabalho, mas isso não cria qualquer garantia, promessa de suporte ou compromisso de nível de serviço.

**Limitação de responsabilidade** — Na máxima extensão permitida por lei, a Goalmoon Tecnologia LTDA, seus contribuidores e licenciadores não serão responsáveis por quaisquer danos indiretos, incidentais, especiais, consequentes, exemplares ou punitivos (incluindo perda de dados, interrupção de negócios ou lucros cessantes) decorrentes ou relacionados ao uso, incapacidade de uso, operações de backup/restauração realizadas por, ou resultados produzidos pelo Supa Moonbase (smoonb).

## 🚀 Instalação

**⚠️ IMPORTANTE: Instale APENAS localmente no projeto!**

**Instalar localmente no projeto:**
```bash
npm install smoonb
```

**Usar com npx:**
```bash
npx smoonb --help
```

**Não instalar globalmente** (será bloqueado):
```bash
npm install -g smoonb
```

### 🔄 Atualizar para a Última Versão

Para atualizar o smoonb para a versão mais recente disponível, execute no projeto atual:

```bash
npm install smoonb@latest
```

**⚠️ IMPORTANTE:** O smoonb deve ser instalado localmente no projeto. Não é permitido usar sem instalar (ex.: `npx smoonb@latest`).

**💡 Por que apenas local?**
- **🔒 Segurança**: Evita conflitos de versão
- **📦 Isolamento**: Cada projeto usa sua versão
- **🔄 Atualizações**: Controle granular por projeto
- **🛡️ Estabilidade**: Evita quebras em outros projetos

## 📋 Pré-requisitos

### 1. Docker Desktop (OBRIGATÓRIO)

Instale pelo [Docker Desktop](https://docs.docker.com/desktop/install/) (Windows/macOS) ou [Docker Engine](https://docs.docker.com/engine/install/) (Linux). Depois verifique se está rodando:

```bash
docker --version
docker ps
```

**⚠️ IMPORTANTE:** O Docker é necessário para:
- Backup da database via `pg_dumpall` (compatível com Dashboard do Supabase)
- Compressão de arquivos `.backup.gz`
- Restauração de backups `.backup` e `.backup.gz`

### 2. Supabase CLI
```bash
npm install -g supabase
```

**Política de versão:** o smoonb aceita qualquer versão do Supabase CLI que esteja **no máximo 1 minor atrás da latest** (mesma major). Recomendamos sempre usar a versão mais recente. Versões muito antigas são bloqueadas com mensagem de erro.

Se o seu gerenciador de pacotes (ex.: **Scoop** no Windows) instala com atraso e você quer avançar mesmo assim, use a flag `--skip-supabase-version-check` (veja a seção de uso abaixo).

Para atualizar o Supabase CLI: [Atualizando o Supabase CLI](https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli).

### 3. Personal Access Token do Supabase
É necessário obter um token de acesso pessoal do Supabase para usar a Management API:

1. Acesse: https://supabase.com/dashboard/account/tokens
2. Clique em "Generate new token"
3. Copie o token (formato: `sbp_...`)
4. Adicione ao `.env.local` como `SUPABASE_ACCESS_TOKEN`

### 4. Chave de licença (OBRIGATÓRIA para backup e restore)
O **smoonb** exige uma licença válida para executar backup e restore:

1. Obtenha sua licença no app desktop em https://www.smoonb.com
2. Defina no ambiente ou no `.env.local`: `SMOONB_LICENSE_KEY=[sua-chave-de-licença]`
3. A licença é validada no início de cada execução (step 00); não há cache. Se a validação falhar (rede/servidor), o CLI aborta. A licença **não** aparece no wizard de mapeamento de variáveis (já foi validada antes).

## ⚙️ Configuração

### Método Moderno: `.env.local` (RECOMENDADO)

O **smoonb** agora usa `.env.local` para configuração, seguindo o padrão da indústria. Isso torna o processo mais simples e integrado ao seu fluxo de trabalho.

#### 1. Criar ou editar `.env.local` na raiz do projeto

```bash
touch .env.local
```

#### 2. Adicionar as variáveis de ambiente necessárias

```env
SMOONB_LICENSE_KEY=[sua-chave-de-licença]
NEXT_PUBLIC_SUPABASE_URL=[sua-supabase-url]
NEXT_PUBLIC_SUPABASE_ANON_KEY=[sua-anon-key]
SUPABASE_SERVICE_ROLE_KEY=[sua-service-role]
SUPABASE_DB_URL=postgresql://postgres:[sua-database-password]@db.[seu-project-id].supabase.co:5432/postgres
SUPABASE_PROJECT_ID=[seu-project-id]
SUPABASE_ACCESS_TOKEN=[seu-access-token]
SUPABASE_POSTGRES_MAJOR=17
SMOONB_TELEMETRY_ENABLED=true
SMOONB_OUTPUT_DIR=./backups
```

Obrigatórias: `SMOONB_LICENSE_KEY` (app desktop em [smoonb.com](https://www.smoonb.com)), `SUPABASE_POSTGRES_MAJOR` (ex.: 17; veja no Dashboard → Project Settings → Infrastructure → Service Versions). Opcionais: `SMOONB_TELEMETRY_ENABLED`, `SMOONB_OUTPUT_DIR` (padrão `./backups`).

#### 3. Mapeamento Interativo

Ao executar `backup` ou `restore` pela primeira vez, o **smoonb** irá:

1. **Ler** seu `.env.local` atual
2. **Identificar** as chaves que você já tem
3. **Perguntar interativamente** quais chaves correspondem às esperadas (se os nomes forem diferentes)
4. **Adicionar** chaves faltantes se necessário
5. **Criar backup** automático do `.env.local` antes de qualquer alteração
6. **Salvar mapeamento** para futuras execuções

**Exemplo de mapeamento:**
```
🔧 Mapeando variável: NEXT_PUBLIC_SUPABASE_URL
Valor atual: https://abc123.supabase.co
Este é o valor correto do projeto alvo? (S/n): S
```

## 🌐 Internacionalização (i18n)

O **smoonb** suporta múltiplos idiomas automaticamente. Atualmente, os idiomas suportados são:

- **Inglês (en)** - Idioma padrão
- **Português do Brasil (pt-BR)** - Suporte completo

### Detecção Automática de Idioma

O idioma é detectado automaticamente na seguinte ordem de precedência:

1. **Variável de ambiente `SMOONB_LANG`** (no `.env.local` ou no ambiente)
2. **Locale do sistema** (LANG, LC_ALL, LC_MESSAGES). Exemplo: `LANG=pt_BR.UTF-8` → pt-BR
3. **Fallback para inglês (en)** se nenhum dos anteriores for detectado

### Idiomas Suportados e Aliases

- `en` ou `en-US` → Inglês
- `pt-BR`, `pt_BR` ou `pt` → Português do Brasil

### Notas Importantes

- **Saídas "máquina"** (ex.: `--json` se implementado) **não** são traduzidas; campos e chaves permanecem em inglês
- Se uma chave de tradução estiver ausente em um idioma, o sistema faz **fallback automático para inglês**
- O idioma é detectado uma vez no início da execução e aplicado a todas as mensagens do CLI

## 🎯 Uso

### Backup Completo

```bash
npx smoonb backup
```

**Opções disponíveis:**

| Flag | Descrição |
|------|-----------|
| `--skip-supabase-version-check` | Pula a checagem de versão do Supabase CLI. Use quando seu gerenciador de pacotes (ex.: Scoop) instala com atraso. Um aviso é exibido e o usuário assume o risco. |

**Exemplo com a flag:**
```bash
npx smoonb backup --skip-supabase-version-check
```

**Fluxo interativo do backup:**

1. **Termo de uso** - Exibe e solicita aceitação dos termos
2. **Validação de licença** - Valida `SMOONB_LICENSE_KEY` (env ou prompt); sem cache; aborta se a validação falhar
3. **Validação Docker** - Verifica se o Docker está rodando
4. **Consentimento** - Pede permissão para ler/escrever `.env.local`
5. **Mapeamento de variáveis** - Mapeia suas variáveis de ambiente (primeira vez; a licença não entra no wizard—já validada)
6. **Backup do .env.local** - Cria backup automático antes de alterações
7. **Seleção de componentes** - Pergunta quais componentes incluir:
   - ⚡ Edge Functions (explicação sobre reset de link e download)
   - 📦 Storage (explicação sobre backup completo: download de arquivos + ZIP no padrão do Dashboard)
   - 🔐 Auth Settings (explicação sobre configurações)
   - 🔄 Realtime Settings (explicação sobre captura interativa de 7 parâmetros)
   - 🗑️ Opções de limpeza (functions, .temp, migrations após backup)
8. **Resumo de configurações** - Mostra tudo que será feito
9. **Confirmação final** - Confirma antes de iniciar
10. **Execução das etapas:**
   - 📊 1/10 - Backup Database via `pg_dumpall` (Docker)
   - 📊 2/10 - Backup Database SQL separado (schema, dados, roles)
   - 🔧 3/10 - Backup Database Extensions and Settings
   - 🔐 4/10 - Backup Auth Settings (se selecionado)
   - 🔄 5/10 - Backup Realtime Settings (se selecionado) - 7 parâmetros capturados interativamente
   - 📦 6/10 - Backup Storage (se selecionado) - Download completo de arquivos + ZIP no padrão do Dashboard
   - 👥 7/10 - Backup Custom Roles
   - ⚡ 8/10 - Backup Edge Functions (se selecionado)
   - 📁 9/10 - Backup Supabase .temp (se selecionado)
   - 📋 10/10 - Backup Migrations (se selecionado)

**Resultado:** Uma pasta `backups/backup-YYYY-MM-DD-HH-MM-SS/` contendo, por exemplo:

```
backups/backup-2025-10-31-09-37-54/
├── backup-manifest.json
├── db_cluster-31-10-2025@09-38-57.backup.gz
├── schema.sql
├── data.sql
├── roles.sql
├── database-settings-*.json
├── auth-settings.json
├── realtime-settings.json
├── storage/
│   └── [bucket-name].json
├── [project-id].storage.zip
├── storage_temp/
│   └── [project-id]/
│       └── [bucket-name]/
├── edge-functions/
│   └── [nome-da-function]/
├── supabase-temp/
├── migrations/
└── env/
    ├── .env.local
    └── env-map.json
```

### Restauração Interativa

**Restaurar backup existente:**
```bash
npx smoonb restore
```

**Opções disponíveis:**

| Flag | Descrição |
|------|-----------|
| `--skip-supabase-version-check` | Pula a checagem de versão do Supabase CLI. Use quando seu gerenciador de pacotes (ex.: Scoop) instala com atraso. Um aviso é exibido e o usuário assume o risco. |

**Exemplo com a flag:**
```bash
npx smoonb restore --skip-supabase-version-check
```

**Fluxo interativo do restore:**

1. **Termo de uso** - Exibe e solicita aceitação dos termos
2. **Validação de licença** - Valida `SMOONB_LICENSE_KEY` (env ou prompt); aborta se a validação falhar
3. **Validação Docker** - Verifica se o Docker está rodando
4. **Consentimento** - Pede permissão para ler/escrever `.env.local`
5. **Mapeamento de variáveis** - Mapeia variáveis para o projeto de destino (inclui `SUPABASE_POSTGRES_MAJOR`)
6. **Backup do .env.local** - Cria backup automático
7. **Seleção de backup** - Lista e permite escolher qual backup restaurar
8. **Seleção de componentes** - Pergunta quais componentes restaurar:
   - 📊 Database (sempre disponível)
   - ⚡ Edge Functions (se disponível no backup)
   - 🔐 Auth Settings (se disponível no backup)
   - 📦 Storage (se disponível no backup)
   - 🔧 Database Extensions and Settings (se disponível no backup)
   - 🔄 Realtime Settings (se disponível no backup)
9. **Resumo detalhado** - Mostra backup selecionado, projeto destino e componentes
10. **Confirmação final** - Confirma antes de iniciar
11. **Aviso** - Explica que erros durante a restauração são esperados; link para [documentação de restore do Dashboard Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase/dashboard-restore); aguardar o fim do processo e testar o resultado antes de aceitar para prosseguir
12. **Execução da restauração:**
    - 📊 Database - Restaura via `psql` (suporta `.backup.gz` e `.backup`)
    - ⚡ Edge Functions - Copia e faz deploy no projeto destino
    - 🔐 Auth Settings - Exibe configurações para aplicação manual
    - 📦 Storage - Restaura buckets e arquivos do ZIP (se disponível) ou exibe informações para migração manual
    - 🔧 Database Settings - Restaura extensões e configurações via SQL
    - 🔄 Realtime Settings - Exibe configurações para aplicação manual

**Formato de arquivos suportados:**
- ✅ `.backup.gz` (compactado) - Descompacta automaticamente antes de restaurar
- ✅ `.backup` (descompactado) - Restaura diretamente

### Importar Backup do Dashboard do Supabase

Se você baixou um backup diretamente do Dashboard do Supabase (formato `.backup.gz`), você pode importá-lo para o formato esperado pelo smoonb. O comando também suporta importar arquivos de storage (`.storage.zip`) opcionalmente.

**Importar apenas database:**
```bash
npx smoonb import --file "caminho/completo/para/db_cluster-04-03-2024@14-16-59.backup.gz"
```

**Importar database e storage juntos:**
```bash
npx smoonb import --file "backup.backup.gz" --storage "meu-projeto.storage.zip"
```

**O que o comando faz:**
1. Lê o arquivo `.backup.gz` do Dashboard (obrigatório)
2. Se fornecido, lê o arquivo `.storage.zip` do Dashboard (opcional)
3. Extrai informações do nome do arquivo de backup (data e hora)
4. Cria uma pasta de backup no formato esperado (`backup-YYYY-MM-DD-HH-MM-SS`)
5. Copia o arquivo de backup para a pasta criada
6. Se fornecido, copia o arquivo de storage para a mesma pasta
7. Deixa o backup pronto para ser encontrado pelo comando `restore`

**Exemplo completo - Apenas database (usando import + restore):**

1. Baixe o backup do Dashboard do Supabase (ex.: `db_cluster-04-03-2024@14-16-59.backup.gz`).
2. Importe o arquivo e depois restaure:

```bash
npx smoonb import --file "C:\Downloads\db_cluster-04-03-2024@14-16-59.backup.gz"
npx smoonb restore
```

O backup importado aparecerá na lista de backups disponíveis.

**Exemplo completo - Database e Storage (usando import + restore):**

1. Baixe backup e storage do Dashboard do Supabase (ex.: `db_cluster-04-03-2024@14-16-59.backup.gz` e `meu-projeto.storage.zip`).
2. Importe ambos os arquivos e depois restaure:

```bash
npx smoonb import --file "C:\Downloads\db_cluster-04-03-2024@14-16-59.backup.gz" --storage "C:\Downloads\meu-projeto.storage.zip"
npx smoonb restore
```

O backup importado aparecerá na lista de backups disponíveis.

**Importante:**
- O arquivo de backup é **obrigatório** e deve estar no formato do Dashboard: `db_cluster-DD-MM-YYYY@HH-MM-SS.backup.gz`
- O arquivo de storage é **opcional** e deve estar no formato: `*.storage.zip`
- O storage depende de um backup, mas o backup não depende do storage
- Ambos os arquivos serão copiados para a mesma pasta de backup
- O caminho pode ser absoluto ou relativo
- O comando criará a estrutura de pastas necessária automaticamente

Após executar `import`, execute `restore` para escolher o backup importado na lista e restaurar.

## 🔧 Comandos Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npx smoonb backup` | Backup completo interativo usando Docker |
| `npx smoonb backup --skip-supabase-version-check` | Backup pulando a checagem de versão do Supabase CLI |
| `npx smoonb restore` | Restauração interativa usando psql (Docker) |
| `npx smoonb restore --skip-supabase-version-check` | Restore pulando a checagem de versão do Supabase CLI |
| `npx smoonb import --file <path> [--storage <path>]` | Importar arquivo .backup.gz e opcionalmente .storage.zip do Dashboard do Supabase |

## 🏗️ Arquitetura Técnica

### Estrutura Modular

O código foi refatorado para uma **arquitetura modular** com etapas independentes:

#### Backup (`src/commands/backup/`)
```
backup/
├── index.js
├── utils.js
└── steps/
    ├── 00-license.js
    ├── 01-docker-validation.js
    ├── 02-database.js
    ├── 03-database-separated.js
    ├── 04-database-settings.js
    ├── 05-auth-settings.js
    ├── 06-realtime-settings.js
    ├── 07-storage.js
    ├── 08-custom-roles.js
    ├── 09-edge-functions.js
    ├── 10-supabase-temp.js
    └── 11-migrations.js
```

#### Restore (`src/commands/restore/`)
A validação de licença (mesmo step do backup, `00-license.js` em backup/steps) roda no início. Em seguida:
```
restore/
├── index.js
├── utils.js
└── steps/
    ├── 00-backup-selection.js
    ├── 01-components-selection.js
    ├── 02-confirmation.js
    ├── 03-database.js
    ├── 04-edge-functions.js
    ├── 05-auth-settings.js
    ├── 06-storage.js
    ├── 07-database-settings.js
    └── 08-realtime-settings.js
```

### Estratégia de Backup

#### Database
- **Backup Principal**: `pg_dumpall` via Docker (idêntico ao Dashboard)
  - Arquivo: `db_cluster-XX-XX-XXXX@XX-XX-XX.backup.gz`
  - Compatível com restauração via Dashboard do Supabase
- **Backup Separado**: SQL em arquivos distintos via Supabase CLI
  - `schema.sql` - Estrutura das tabelas
  - `data.sql` - Dados (comandos COPY)
  - `roles.sql` - Roles e permissões

#### Edge Functions
- **Download Automático**: Via Supabase CLI `supabase functions download`
- **Reset de Link**: Garante link limpo com o projeto antes do download
- **Backup Completo**: Código completo de cada function

#### Migrations
- **Download Automático**: Via `supabase migration fetch`
- **Reset de Link**: Garante link limpo com o projeto
- **Backup Completo**: Todas as migrations do servidor

#### Storage
- **Backup Completo**: Download de todos os arquivos de todos os buckets
- **Estrutura Temporária**: Cria `storage_temp/project-id/bucket-name/arquivos...` dentro do backupDir
- **ZIP no Padrão Dashboard**: Cria `{project-id}.storage.zip` com estrutura `project-id/bucket-name/arquivos...`
- **Compatível com Restore**: O ZIP criado é compatível com o processo de restore (mesmo formato do Dashboard)
- **Pergunta Interativa**: Após criar o ZIP, pergunta se deseja limpar a estrutura temporária
- **Fallback**: Se não houver credenciais do Supabase, faz backup apenas de metadados
- **Management API**: Usa Personal Access Token para listar buckets e objetos
- **Supabase Client**: Usa Service Role Key para download de arquivos

#### Auth, Realtime
- **Management API**: Usa Personal Access Token
- **JSON Export**: Configurações exportadas como JSON
- **Realtime Settings**: Captura interativa de 7 parâmetros:
  1. Habilitar serviço Realtime
  2. Permitir acesso público
  3. Tamanho do pool de conexões do database
  4. Máximo de clientes simultâneos
  5. Máximo de eventos por segundo
  6. Máximo de eventos de presença por segundo
  7. Tamanho máximo do payload em KB
- **Manual para alguns**: Alguns settings precisam ser aplicados manualmente por segurança

### Estratégia de Restauração

#### Database
- **Suporte a Formatos**:
  - `.backup.gz` - Descompacta automaticamente via Docker
  - `.backup` - Restaura diretamente via `psql` (Docker)
- **Restauração Limpa**: Pode sobrescrever dados existentes (com confirmação)

#### Edge Functions
- **Deploy Limpo**: Limpa `supabase/functions` antes do deploy
- **Reset de Link**: Garante link correto com projeto destino
- **Deploy Automático**: Usa `supabase functions deploy`

#### Outros Componentes
- **Database Settings**: Restaura via SQL
- **Storage**: Restaura buckets e arquivos do ZIP (se disponível) ou exibe informações para configuração manual
- **Auth/Realtime**: Exibe informações para configuração manual no Dashboard

### Multiplataforma

- **Windows/macOS/Linux**: Detecção automática de binários
- **Multiplataforma**: Usa `fs.promises.cp`, `path.join`, Docker
- **Docker para Tudo**: Backup, restore e compressão via Docker (garante consistência)

## 📊 Fluxo Recomendado

1. **Configurar `.env.local`** (primeira vez) com as credenciais do projeto origem.
2. **Backup do projeto origem:**
   ```bash
   npx smoonb backup
   ```
   (Mapeia variáveis interativamente na primeira vez, seleciona componentes, executa backup completo.)
3. **Criar novo projeto Supabase** (via Dashboard ou Supabase CLI).
4. **Editar `.env.local`** com as credenciais do novo projeto (apontar variáveis para o projeto destino).
5. **Restaurar backup** (modo interativo):
   ```bash
   npx smoonb restore
   ```
   (Seleciona backup desejado, componentes a restaurar, executa restauração.)
6. **Aplicar configurações manuais** se necessário: Auth Settings (Dashboard → Authentication → Settings), Realtime (Dashboard → Database → Replication). O Storage é restaurado automaticamente do ZIP quando disponível.

## 🎨 Experiência do Usuário

### Interface em Português

Todas as interações são em **Português do Brasil**:
- Perguntas claras e diretas
- Explicações antes de cada processo
- Resumos detalhados antes de confirmar
- Confirmações com `(S/n)` ou `(s/N)` em português

### Mapeamento Inteligente de Variáveis

- **Detecção Automática**: Se a chave já existe com o nome esperado, pula a seleção
- **Opção de Adicionar**: Permite adicionar novas chaves se não existirem
- **Validação de Valores**: Confirma valores antes de salvar
- **Backup Automático**: Sempre cria backup do `.env.local` antes de alterações

### Processo Guiado

- **Validação Prévia**: Verifica Docker antes de começar
- **Explicações Contextuais**: Explica cada processo antes de perguntar
- **Resumo Final**: Mostra tudo que será feito antes de executar
- **Feedback Visual**: Cores e ícones para melhor experiência

## 🐛 Solução de Problemas

### Avisos de chaves estrangeiras circulares na exportação dos dados

Tabelas podem referenciar umas às outras ou a si mesmas. O PostgreSQL avisa que um dump **somente de dados** nem sempre pode ser restaurado com a verificação normal de chaves estrangeiras. Esse aviso isolado não significa falha na exportação: confira o resultado do comando e o manifesto do backup.

O smoonb agrupa esses avisos conhecidos, lista as tabelas envolvidas e registra os diagnósticos originais em `backup-manifest.json`, em `components.database_separated.warnings`. Outros avisos e erros continuam visíveis. Se schema, dados ou roles falharem, esse componente será marcado como incompleto.

Atualmente, o Supabase CLI coloca `SET session_replication_role = replica;` no início de `data.sql`. O smoonb verifica a primeira linha antes de informar sua presença. Isso **não valida a restauração**: a role de destino precisa ter permissão para alterar essa configuração. Restaure o schema antes dos dados e interrompa ao encontrar erros SQL. Para uma restauração controlada em destino separado e adequado, siga o [guia de backup/restauração do Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore):

```bash
psql --dbname "$TARGET_DB_URL" --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command 'SET session_replication_role = replica' --file data.sql
```

A configuração afeta essa conexão de restauração; não altera o banco de origem. Confira contagens e referências no destino restaurado antes de depender do backup. Não remova chaves estrangeiras da aplicação para silenciar os avisos. O `.backup.gz` principal é um dump completo do cluster; os SQL separados são arquivos adicionais.

### Verificações de desenvolvimento

Use Node.js 22 para as verificações de desenvolvimento: `npm test`, `npm run lint` e `npm run build`. O teste explícito `npm run test:docker` exige Docker, imagem `postgres:17` e Supabase CLI. Ele cria somente dados fictícios em um PostgreSQL descartável próprio, testa restaurações com e sem proteção e remove esse contêiner ao terminar. Não usa credenciais do projeto nem banco remoto.


### Docker não encontrado ou não está rodando

Verifique se o Docker está instalado e em execução:

```bash
docker --version
docker ps
```

Se não estiver, inicie o Docker Desktop (Windows/macOS) ou execute `sudo systemctl start docker` (Linux).

### Supabase CLI não encontrado
```bash
npm install -g supabase
```

### Supabase CLI desatualizado (abaixo da versão mínima aceita)

O smoonb aceita versões até **1 minor atrás da latest**. Se sua versão instalada estiver abaixo desse limite, você verá uma mensagem como:

```
❌ Supabase CLI X.Y.Z está abaixo da versão mínima aceita (X.W.0). Versão latest: X.V.Z. Atualize para pelo menos a versão X.W.0.
```

**Opção 1 — Atualizar o Supabase CLI:**
```bash
npm install -g supabase@latest   # instalação global
npm install supabase@latest       # instalação local/projeto
```

**Opção 2 — Pular a checagem (temporariamente, risco do usuário):**
```bash
npx smoonb backup --skip-supabase-version-check
npx smoonb restore --skip-supabase-version-check
```

> **Nota para usuários de Scoop (Windows):** o repositório do Scoop pode levar alguns dias para atualizar após um release. Use `--skip-supabase-version-check` até que o Scoop disponibilize a versão atualizada.

### Personal Access Token inválido ou ausente

1. Verificar se `SUPABASE_ACCESS_TOKEN` está no `.env.local`
2. Gerar novo token: https://supabase.com/dashboard/account/tokens
3. Atualizar `.env.local` com o novo token

### Database URL incorreta
- Verificar senha na URL de conexão
- Usar string de conexão do Dashboard Supabase (Settings → Database)
- Testar conexão: `psql "sua-database-url" -c "SELECT 1"`

### Arquivo .backup.gz não pode ser restaurado

O smoonb suporta automaticamente:
- ✅ `.backup.gz` - Descompacta via Docker antes de restaurar
- ✅ `.backup` - Restaura diretamente

Se houver problemas:
1. Verificar se Docker está rodando
2. Verificar permissões do arquivo
3. Verificar espaço em disco

### Erro ao baixar Edge Functions

1. Verificar se `SUPABASE_ACCESS_TOKEN` está configurado
2. Verificar se o projeto está linkado: `supabase link`
3. Verificar se as functions existem no servidor

### Erro ao baixar Migrations

1. Verificar se `SUPABASE_ACCESS_TOKEN` está configurado
2. Verificar se o projeto está linkado: `supabase link`
3. Verificar se há migrations no servidor

## 🔒 Segurança

- **Backup Automático**: Sempre cria backup do `.env.local` antes de alterações
- **Mapeamento Local**: Mapeamento de variáveis salvo apenas localmente
- **Sem Dados Sensíveis**: Nenhum dado sensível é enviado para fora do seu ambiente
- **Docker Isolado**: Operações de database via Docker (isolamento)

## 💼 Acesso e assinatura

O código do Supa Moonbase é disponibilizado sob licença MIT (ver `LICENSE`). Para usar o smoonb é obrigatório ter **licença ativa** e **assinatura válida**, ou estar em **período de trial**. A validação da licença ocorre no início do backup e do restore; sem licença e assinatura válidas (ou trial), o CLI não executa essas operações.

[smoonb.com/#price](https://www.smoonb.com/#price).

## 🔒 Privacidade e LGPD (resumo)

O Supa Moonbase adota o princípio de minimização de dados. Tratamos apenas as informações estritamente necessárias para controle de acesso e faturamento (por exemplo, identificador de conta e contato). Os propósitos, bases legais e direitos do titular estão descritos na [Política de Privacidade](https://www.smoonb.com/privacy).

## 📋 Termos de Serviço e uso de marca

A licença de código (MIT) não substitui os [Termos de Serviço](https://www.smoonb.com/terms) que regem o acesso operacional e a validação de assinatura.

"Supa Moonbase" e elementos de identidade visual são marcas da Goalmoon Tecnologia Ltda.; o uso de marca e assets de branding é restrito, conforme os [Termos de Serviço](https://www.smoonb.com/terms).

[FAQ](https://www.smoonb.com/#faq).

## 📝 Licença

O código do Supa Moonbase é disponibilizado sob licença MIT. Veja [LICENSE](LICENSE) para o texto completo da licença. Uma tradução em português está disponível em [LICENSE.pt-BR.md](LICENSE.pt-BR.md) apenas para conveniência.

## 🤝 Contribuição

Contribuições são bem-vindas. [www.smoonb.com/#price](https://www.smoonb.com/#price).


---

**Desenvolvido por:** Goalmoon Tecnologia LTDA  
**Website:** https://www.smoonb.com  
**GitHub:** https://github.com/almmello/smoonb
