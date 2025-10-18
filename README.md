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

- ✅ **Database PostgreSQL** (roles, schema, data)
- ✅ **Edge Functions** (código local)
- ✅ **Auth Settings** (configurações de autenticação)
- ✅ **Storage Objects** (buckets e metadados)
- ✅ **Realtime Settings** (publicações e configurações)
- ✅ **Inventário Completo** (extensões, políticas RLS, etc.)

## 🚀 Instalação

```bash
# Instalar localmente no projeto
npm install smoonb

# Usar com npx
npx smoonb --help
```

## 📋 Pré-requisitos

### 1. Supabase CLI
```bash
npm install -g supabase
```

### 2. PostgreSQL (psql)
- **Windows**: https://www.postgresql.org/download/windows/
- **macOS**: `brew install postgresql`
- **Linux**: `sudo apt-get install postgresql-client`

## ⚙️ Configuração

### 1. Inicializar configuração
```bash
npx smoonb config --init
```

### 2. Editar `.smoonbrc`
```json
{
  "supabase": {
    "projectId": "seu-project-id",
    "url": "https://seu-project-id.supabase.co",
    "serviceKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "anonKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "databaseUrl": "postgresql://postgres:[senha]@db.seu-project-id.supabase.co:5432/postgres"
  },
  "backup": {
    "includeFunctions": true,
    "includeStorage": true,
    "includeAuth": true,
    "includeRealtime": true,
    "outputDir": "./backups"
  },
  "restore": {
    "cleanRestore": true,
    "verifyAfterRestore": true
  }
}
```

### 3. Obter credenciais no Dashboard Supabase

1. **Project ID**: Settings → General → Reference ID
2. **URL**: Settings → API → Project URL
3. **Keys**: Settings → API → Project API keys
4. **Database URL**: Settings → Database → Connection string

## 🎯 Uso

### Backup Completo
```bash
npx smoonb backup
```

**Resultado:**
```
backups/backup-2024-01-15T10-30-45-123Z/
├── backup-manifest.json
├── roles.sql
├── schema.sql
├── data.sql
├── inventory/
│   ├── extensions.json
│   ├── tables.json
│   ├── policies.json
│   ├── realtime.json
│   └── storage.json
└── functions/
    └── [código das Edge Functions locais]
```

### Restauração Interativa
```bash
npx smoonb restore
```

**Processo interativo:**
1. Lista todos os backups disponíveis
2. Permite seleção numerada do backup desejado
3. Verifica se database está vazia (clean restore)
4. Executa `roles.sql` (roles e permissões)
5. Executa `schema.sql` (estrutura das tabelas)
6. Executa `data.sql` (dados com COPY)

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
| `npx smoonb backup` | Backup completo usando Supabase CLI |
| `npx smoonb restore` | Restauração interativa usando psql |
| `npx smoonb check` | Verificação de integridade |
| `npx smoonb functions` | Gerenciar Edge Functions |
| `npx smoonb config` | Configurar credenciais |

## 🏗️ Arquitetura Técnica

### Backup Strategy
- **Database**: `supabase db dump` → `roles.sql`, `schema.sql`, `data.sql`
- **Inventário**: Queries SQL + Supabase API para metadados
- **Edge Functions**: Cópia do código local (`supabase/functions/`)

### Restore Strategy
- **Clean Restore**: Verifica database vazia antes de restaurar
- **Ordem**: roles → schema → data (com transação única para dados)
- **Verificação**: Checklist automático pós-restore

### Multiplataforma
- **Windows/macOS/Linux**: Detecção automática de binários
- **Cross-platform**: Usa `fs.promises.cp`, `path.join`, `spawn`
- **Sem dependências específicas**: Funciona em qualquer SO

## 📊 Fluxo Recomendado

```bash
# 1. Backup do projeto origem
npx smoonb backup

# 2. Criar novo projeto Supabase
# (via Dashboard ou Supabase CLI)

# 3. Configurar .smoonbrc com credenciais do novo projeto
npx smoonb config --init

# 4. Restaurar backup (modo interativo)
npx smoonb restore

# 5. Verificar integridade
npx smoonb check

# 6. Deploy Edge Functions (se necessário)
npx smoonb functions push
```

## 🐛 Troubleshooting

### Supabase CLI não encontrado
```bash
npm install -g supabase
```

### psql não encontrado
- **Windows**: Instalar PostgreSQL
- **macOS**: `brew install postgresql`
- **Linux**: `sudo apt-get install postgresql-client`

### Database URL incorreta
- Verificar senha na URL de conexão
- Usar Connection string do Dashboard Supabase
- Testar conexão: `psql "sua-database-url" -c "SELECT 1"`

## 📝 Licença

**Versões 0.x.x**: Uso gratuito (experimental)
**Versões 1.0.0+**: Licença comercial (anúncio com 90 dias de antecedência)

## 🤝 Contribuição

Contribuições são bem-vindas! Este é um projeto experimental e precisamos de feedback da comunidade.

## ☕ Apoie o Projeto

Se este projeto for útil para você, considere comprar um café:
[Compre um café](https://pag.ae/7Yj8QjQjQ)

---

**Desenvolvido por:** Goalmoon Tecnologia LTDA  
**Website:** https://goalmoon.com  
**GitHub:** https://github.com/almmello/smoonb