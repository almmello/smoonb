# smoonb

**Complete Supabase backup and migration tool**

## ⚠️ EXPERIMENTAL VERSION - NÃO TESTADA - USE POR SUA CONTA E RISCO

**🚨 AVISO IMPORTANTE:**
- Este software **NUNCA** foi testado em produção
- **USE POR SUA CONTA E RISCO** - Pode causar perda irreparável de dados
- **NÃO NOS RESPONSABILIZAMOS** por qualquer perda de dados
- **NENHUM SUPORTE** é oferecido nesta fase - apenas aceitamos contribuições

**Desenvolvido por:** Goalmoon Tecnologia LTDA (https://goalmoon.com)

## 🎯 Objetivo

O **smoonb** resolve o problema das ferramentas existentes que fazem backup apenas da database PostgreSQL, ignorando componentes críticos do Supabase:

- ✅ **Database PostgreSQL** (backup completo via `pg_dumpall`, idêntico ao Dashboard)
- ✅ **Database SQL Separado** (schema, data, roles em arquivos separados para troubleshooting)
- ✅ **Database Extensions and Settings** (extensões PostgreSQL e configurações)
- ✅ **Edge Functions** (download automático do servidor)
- ✅ **Auth Settings** (configurações de autenticação via Management API)
- ✅ **Storage Buckets** (metadados e configurações via Management API)
- ✅ **Realtime Settings** (publicações e configurações capturadas interativamente)
- ✅ **Custom Roles** (roles personalizados do PostgreSQL)
- ✅ **Supabase .temp** (arquivos temporários do Supabase CLI)
- ✅ **Migrations** (todas as migrations do projeto via `supabase migration fetch`)

## 🚀 Instalação

**⚠️ IMPORTANTE: Instale APENAS localmente no projeto!**

```bash
# ✅ CORRETO - Instalar localmente no projeto
npm install smoonb

# ✅ CORRETO - Usar com npx
npx smoonb --help

# ❌ ERRADO - NÃO instalar globalmente
npm install -g smoonb  # ← Isso será bloqueado!
```

**💡 Por que apenas local?**
- **🔒 Segurança**: Evita conflitos de versão
- **📦 Isolamento**: Cada projeto usa sua versão
- **🔄 Atualizações**: Controle granular por projeto
- **🛡️ Estabilidade**: Evita quebras em outros projetos

## 📋 Pré-requisitos

### 1. Docker Desktop (OBRIGATÓRIO)
```bash
# Instalar Docker Desktop
# Windows/macOS: https://docs.docker.com/desktop/install/
# Linux: https://docs.docker.com/engine/install/

# Verificar se está rodando
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

### 3. Personal Access Token do Supabase
É necessário obter um token de acesso pessoal do Supabase para usar a Management API:

1. Acesse: https://supabase.com/dashboard/account/tokens
2. Clique em "Generate new token"
3. Copie o token (formato: `sbp_...`)
4. Adicione ao `.env.local` como `SUPABASE_ACCESS_TOKEN`

## ⚙️ Configuração

### Método Moderno: `.env.local` (RECOMENDADO)

O **smoonb** agora usa `.env.local` para configuração, seguindo o padrão da indústria. Isso torna o processo mais simples e integrado ao seu fluxo de trabalho.

#### 1. Criar ou editar `.env.local` na raiz do projeto

```bash
# Criar arquivo .env.local
touch .env.local
```

#### 2. Adicionar as variáveis de ambiente necessárias

```env
# URLs e Chaves do Supabase
NEXT_PUBLIC_SUPABASE_URL=https://seu-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Database Connection
SUPABASE_DB_URL=postgresql://postgres:[senha]@db.seu-project-id.supabase.co:5432/postgres

# Identificação do Projeto
SUPABASE_PROJECT_ID=seu-project-id

# Personal Access Token (OBRIGATÓRIO para Management API)
SUPABASE_ACCESS_TOKEN=sbp_1234567890abcdef1234567890abcdef

# Diretório de Backups (opcional, padrão: ./backups)
SMOONB_OUTPUT_DIR=./backups
```

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

### Método Legado: `.smoonbrc` (DEPRECADO)

⚠️ **Nota:** O arquivo `.smoonbrc` ainda é suportado para compatibilidade, mas é **recomendado migrar para `.env.local`**.

```bash
npx smoonb config --init
```

## 🎯 Uso

### Backup Completo

```bash
npx smoonb backup
```

**Fluxo interativo do backup:**

1. **Validação Docker** - Verifica se o Docker está rodando
2. **Consentimento** - Pede permissão para ler/escrever `.env.local`
3. **Mapeamento de Variáveis** - Mapeia suas variáveis de ambiente (primeira vez)
4. **Backup do .env.local** - Cria backup automático antes de alterações
5. **Seleção de Componentes** - Pergunta quais componentes incluir:
   - ⚡ Edge Functions (explicação sobre reset de link e download)
   - 📦 Storage (explicação sobre metadados)
   - 🔐 Auth Settings (explicação sobre configurações)
   - 🔄 Realtime Settings (explicação sobre captura interativa)
   - 🗑️ Opções de limpeza (functions, .temp, migrations após backup)
6. **Resumo de Configurações** - Mostra tudo que será feito
7. **Confirmação Final** - Confirma antes de iniciar
8. **Execução das Etapas:**
   - 📊 1/11 - Backup Database via `pg_dumpall` (Docker)
   - 📊 2/11 - Backup Database SQL separado (schema, data, roles)
   - 🔧 3/11 - Backup Database Extensions and Settings
   - 🔐 4/11 - Backup Auth Settings (se selecionado)
   - 🔄 5/11 - Backup Realtime Settings (se selecionado)
   - 📦 6/11 - Backup Storage (se selecionado)
   - 👥 7/11 - Backup Custom Roles
   - ⚡ 8/11 - Backup Edge Functions (se selecionado)
   - 📁 9/11 - Backup Supabase .temp
   - 📋 10/11 - Backup Migrations

**Resultado:**
```
backups/backup-2025-10-31-09-37-54/
├── backup-manifest.json           # Manifesto com metadados
├── db_cluster-31-10-2025@09-38-57.backup.gz  # Backup completo (Dashboard compatible)
├── schema.sql                     # Schema do banco
├── data.sql                       # Dados
├── roles.sql                      # Roles do PostgreSQL
├── database-settings-*.json       # Extensões e configurações
├── auth-settings.json             # Configurações de Auth
├── realtime-settings.json         # Configurações de Realtime
├── storage/                       # Metadados de Storage
├── edge-functions/                # Edge Functions baixadas
│   └── [nome-da-function]/
├── supabase-temp/                 # Arquivos .temp do Supabase CLI
├── migrations/                    # Todas as migrations
└── env/
    ├── .env.local                 # Backup do .env.local
    └── env-map.json               # Mapeamento de variáveis
```

### Restauração Interativa

```bash
npx smoonb restore
```

**Fluxo interativo do restore:**

1. **Validação Docker** - Verifica se o Docker está rodando
2. **Consentimento** - Pede permissão para ler/escrever `.env.local`
3. **Mapeamento de Variáveis** - Mapeia variáveis para o projeto de destino
4. **Backup do .env.local** - Cria backup automático
5. **Seleção de Backup** - Lista e permite escolher qual backup restaurar
6. **Seleção de Componentes** - Pergunta quais componentes restaurar:
   - 📊 Database (sempre disponível)
   - ⚡ Edge Functions (se disponível no backup)
   - 🔐 Auth Settings (se disponível no backup)
   - 📦 Storage (se disponível no backup)
   - 🔧 Database Extensions and Settings (se disponível no backup)
   - 🔄 Realtime Settings (se disponível no backup)
7. **Resumo Detalhado** - Mostra backup selecionado, projeto destino e componentes
8. **Confirmação Final** - Confirma antes de iniciar
9. **Execução da Restauração:**
   - 📊 Database - Restaura via `psql` (suporta `.backup.gz` e `.backup`)
   - ⚡ Edge Functions - Copia e faz deploy no projeto destino
   - 🔐 Auth Settings - Exibe configurações para aplicação manual
   - 📦 Storage - Exibe informações para migração manual
   - 🔧 Database Settings - Restaura extensões e configurações via SQL
   - 🔄 Realtime Settings - Exibe configurações para aplicação manual

**Formato de arquivos suportados:**
- ✅ `.backup.gz` (compactado) - Descompacta automaticamente antes de restaurar
- ✅ `.backup` (descompactado) - Restaura diretamente

### Verificação Pós-Restore

```bash
npx smoonb check
```

**Verifica:**
- ✅ Conexão com database
- ✅ Extensões instaladas
- ✅ Tabelas criadas
- ✅ Políticas RLS
- ✅ Publicações Realtime
- ✅ Buckets de Storage

### Edge Functions

```bash
# Listar functions
npx smoonb functions list

# Deploy functions
npx smoonb functions push
```

## 🔧 Comandos Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npx smoonb backup` | Backup completo interativo usando Docker |
| `npx smoonb restore` | Restauração interativa usando psql (Docker) |
| `npx smoonb check` | Verificação de integridade pós-restore |
| `npx smoonb functions` | Gerenciar Edge Functions |
| `npx smoonb config` | Configurar credenciais (legado) |

## 🏗️ Arquitetura Técnica

### Estrutura Modular

O código foi refatorado para uma **arquitetura modular** com etapas independentes:

#### Backup (`src/commands/backup/`)
```
backup/
├── index.js                    # Orquestrador principal
├── utils.js                    # Utilitários específicos
└── steps/
    ├── 00-docker-validation.js # Validação Docker
    ├── 01-database.js          # Backup via pg_dumpall
    ├── 02-database-separated.js # SQL separado
    ├── 03-database-settings.js # Extensões e settings
    ├── 04-auth-settings.js     # Auth via API
    ├── 05-realtime-settings.js # Realtime interativo
    ├── 06-storage.js           # Storage via API
    ├── 07-custom-roles.js      # Custom roles
    ├── 08-edge-functions.js    # Edge Functions
    ├── 09-supabase-temp.js     # Supabase .temp
    └── 10-migrations.js        # Migrations
```

#### Restore (`src/commands/restore/`)
```
restore/
├── index.js                    # Orquestrador principal
├── utils.js                    # Utilitários específicos
└── steps/
    ├── 00-backup-selection.js  # Seleção de backup
    ├── 01-components-selection.js # Seleção de componentes
    ├── 02-confirmation.js      # Confirmação (legacy)
    ├── 03-database.js          # Restauração database
    ├── 04-edge-functions.js    # Deploy Edge Functions
    ├── 05-auth-settings.js     # Exibe Auth settings
    ├── 06-storage.js           # Exibe Storage info
    ├── 07-database-settings.js # Restaura settings
    └── 08-realtime-settings.js # Exibe Realtime settings
```

### Backup Strategy

#### Database
- **Backup Principal**: `pg_dumpall` via Docker (idêntico ao Dashboard)
  - Arquivo: `db_cluster-XX-XX-XXXX@XX-XX-XX.backup.gz`
  - Compatível com restauração via Dashboard do Supabase
- **Backup Separado**: SQL em arquivos distintos via Supabase CLI
  - `schema.sql` - Estrutura das tabelas
  - `data.sql` - Dados (COPY statements)
  - `roles.sql` - Roles e permissões

#### Edge Functions
- **Download Automático**: Via Supabase CLI `supabase functions download`
- **Reset de Link**: Garante link limpo com o projeto antes do download
- **Backup Completo**: Código completo de cada function

#### Migrations
- **Download Automático**: Via `supabase migration fetch`
- **Reset de Link**: Garante link limpo com o projeto
- **Backup Completo**: Todas as migrations do servidor

#### Auth, Storage, Realtime
- **Management API**: Usa Personal Access Token
- **JSON Export**: Configurações exportadas como JSON
- **Manual para alguns**: Alguns settings precisam ser aplicados manualmente por segurança

### Restore Strategy

#### Database
- **Suporte a Formatos**:
  - `.backup.gz` - Descompacta automaticamente via Docker
  - `.backup` - Restaura diretamente via `psql` (Docker)
- **Clean Restore**: Pode sobrescrever dados existentes (com confirmação)

#### Edge Functions
- **Clean Deploy**: Limpa `supabase/functions` antes do deploy
- **Reset de Link**: Garante link correto com projeto destino
- **Deploy Automático**: Usa `supabase functions deploy`

#### Outros Componentes
- **Database Settings**: Restaura via SQL
- **Auth/Storage/Realtime**: Exibe informações para configuração manual no Dashboard

### Multiplataforma

- **Windows/macOS/Linux**: Detecção automática de binários
- **Cross-platform**: Usa `fs.promises.cp`, `path.join`, Docker
- **Docker para Tudo**: Backup, restore e compressão via Docker (garante consistência)

## 📊 Fluxo Recomendado

```bash
# 1. Configurar .env.local (primeira vez)
# Edite .env.local com suas credenciais do projeto origem

# 2. Backup do projeto origem
npx smoonb backup
# - Mapeia variáveis interativamente (primeira vez)
# - Seleciona componentes para backup
# - Executa backup completo

# 3. Criar novo projeto Supabase
# (via Dashboard ou Supabase CLI)

# 4. Editar .env.local com credenciais do novo projeto
# Atualize as variáveis para apontar ao projeto destino

# 5. Restaurar backup (modo interativo)
npx smoonb restore
# - Seleciona backup desejado
# - Seleciona componentes para restaurar
# - Executa restauração

# 6. Verificar integridade
npx smoonb check

# 7. Aplicar configurações manuais
# - Auth Settings: Dashboard → Authentication → Settings
# - Storage: Dashboard → Storage → Buckets
# - Realtime: Dashboard → Database → Replication
```

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

## 🐛 Troubleshooting

### Docker não encontrado ou não está rodando
```bash
# Verificar se Docker está instalado
docker --version

# Verificar se Docker Desktop está rodando
docker ps

# Se não estiver, iniciar Docker Desktop
# Windows/macOS: Abrir aplicativo Docker Desktop
# Linux: sudo systemctl start docker
```

### Supabase CLI não encontrado
```bash
npm install -g supabase
```

### Personal Access Token inválido ou ausente

1. Verificar se `SUPABASE_ACCESS_TOKEN` está no `.env.local`
2. Gerar novo token: https://supabase.com/dashboard/account/tokens
3. Atualizar `.env.local` com o novo token

### Database URL incorreta
- Verificar senha na URL de conexão
- Usar Connection string do Dashboard Supabase (Settings → Database)
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

## 📝 Licença

**Versões 0.x.x**: Uso gratuito (experimental)  
**Versões 1.0.0+**: Licença comercial (anúncio com 90 dias de antecedência)

Veja [LICENSE.md](LICENSE.md) para mais detalhes.

## 🤝 Contribuição

Contribuições são bem-vindas! Este é um projeto experimental e precisamos de feedback da comunidade.

## 📚 Versão

**Versão Atual:** 0.0.48

## ☕ Apoie o Projeto

Se este projeto for útil para você, considere comprar um café:  
[Compre um café](https://pag.ae/7Yj8QjQjQ)

---

**Desenvolvido por:** Goalmoon Tecnologia LTDA  
**Website:** https://goalmoon.com  
**GitHub:** https://github.com/almmello/smoonb
