# Supa Moonbase (smoonb)

**Complete Supabase backup and migration tool**

Backup and restore: complete and simple, as it should be

> **Note on commercial access:** Supa Moonbase will require account validation before executing operations (login + subscription verification) in a future phase. In this version, there is no authentication implemented — this README only presents the legal/commercial basis. Operational use will be governed by the [Terms of Service](https://smoonb.com/terms) and [Privacy Policy](https://smoonb.com/privacy).

**Read this in other languages:** [Português (Brasil)](README.pt-BR.md)

**Developed by:** Goalmoon Tecnologia LTDA  
**Website:** https://smoonb.com  
**GitHub:** https://github.com/almmello/smoonb

## 🎯 Objective

**smoonb** solves the problem of existing tools that only backup the PostgreSQL database, ignoring critical Supabase components.

## 📦 Backup Components

smoonb performs a complete backup of all components of your Supabase project:

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

By continuing, you acknowledge and agree that Supa Moonbase (smoonb) is provided "AS IS" and "AS AVAILABLE", with no warranties of any kind—express, implied, or statutory—including but not limited to merchantability, fitness for a particular purpose, and non-infringement, to the maximum extent permitted by applicable law. Backup and restore operations inherently carry risk, environments vary widely, and we cannot foresee or validate all user setups. You are solely responsible for validating your own environment, keeping independent copies, and verifying results before relying on them in production. We build Supa Moonbase (smoonb) on public, auditable, open-source repositories to help people simplify their workflows, but this does not create any warranty, promise of support, or service-level commitment.

**Limitation of liability** — To the maximum extent permitted by law, Goalmoon Tecnologia LTDA, its contributors, and licensors will not be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages (including loss of data, interruption of business, or lost profits) arising from or related to the use of, inability to use, backup/restore operations performed by, or results produced by Supa Moonbase (smoonb). In any case, our aggregate liability for all claims relating to Supa Moonbase (smoonb) will not exceed the amount you paid for Supa Moonbase (smoonb) in the 12 months preceding the event. Nothing in this notice excludes or limits liability where such limits are prohibited by law, including (as applicable) for willful misconduct or gross negligence.

## 🚀 Installation

**⚠️ IMPORTANT: Install ONLY locally in the project!**

```bash
# ✅ CORRECT - Install locally in the project
npm install smoonb

# ✅ CORRECT - Use with npx
npx smoonb --help

# ❌ WRONG - DO NOT install globally
npm install -g smoonb  # ← This will be blocked!
```

### 🔄 Update to Latest Version

To update smoonb to the latest available version:

```bash
# Update in current project
npm install smoonb@latest
```

**⚠️ IMPORTANT:** smoonb must be installed locally in the project. Using without installing (e.g., `npx smoonb@latest`) is not allowed.

**💡 Why local only?**
- **🔒 Security**: Avoids version conflicts
- **📦 Isolation**: Each project uses its own version
- **🔄 Updates**: Granular control per project
- **🛡️ Stability**: Prevents breaking other projects

## 📋 Prerequisites

### 1. Docker Desktop (REQUIRED)
```bash
# Install Docker Desktop
# Windows/macOS: https://docs.docker.com/desktop/install/
# Linux: https://docs.docker.com/engine/install/

# Verify if it's running
docker --version
docker ps
```

**⚠️ IMPORTANT:** Docker is required for:
- Database backup via `pg_dumpall` (compatible with Supabase Dashboard)
- Compression of `.backup.gz` files
- Restoration of `.backup` and `.backup.gz` backups

### 2. Supabase CLI
```bash
npm install -g supabase
```

### 3. Supabase Personal Access Token
You need to obtain a Supabase personal access token to use the Management API:

1. Visit: https://supabase.com/dashboard/account/tokens
2. Click "Generate new token"
3. Copy the token (format: `sbp_...`)
4. Add to `.env.local` as `SUPABASE_ACCESS_TOKEN`

## ⚙️ Configuration

### Modern Method: `.env.local` (RECOMMENDED)

**smoonb** now uses `.env.local` for configuration, following industry standards. This makes the process simpler and more integrated with your workflow.

#### 1. Create or edit `.env.local` in the project root

```bash
# Create .env.local file
touch .env.local
```

#### 2. Add required environment variables

```env
# Supabase URLs and Keys
NEXT_PUBLIC_SUPABASE_URL=[your-supabase-url]
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-anon-key]
SUPABASE_SERVICE_ROLE_KEY=[your-service-role]

# Database Connection
SUPABASE_DB_URL=postgresql://postgres:[your-database-password]@db.[your-project-id].supabase.co:5432/postgres

# Project Identification
SUPABASE_PROJECT_ID=[your-project-id]

# Personal Access Token (REQUIRED for Management API)
SUPABASE_ACCESS_TOKEN=[your-access-token]

# Backup Directory (optional, default: ./backups)
SMOONB_OUTPUT_DIR=./backups
```

#### 3. Interactive Mapping

When running `backup` or `restore` for the first time, **smoonb** will:

1. **Read** your current `.env.local`
2. **Identify** the keys you already have
3. **Ask interactively** which keys correspond to the expected ones (if names are different)
4. **Add** missing keys if necessary
5. **Create automatic backup** of `.env.local` before any changes
6. **Save mapping** for future executions

**Mapping example:**
```
🔧 Mapping variable: NEXT_PUBLIC_SUPABASE_URL
Current value: https://abc123.supabase.co
Is this the correct value for the target project? (Y/n): Y
```

## 🌐 Internationalization (i18n)

**smoonb** supports multiple languages automatically. Currently supported languages are:

- **English (en)** - Default language
- **Portuguese (Brazil) (pt-BR)** - Full support

### Automatic Language Detection

Language is detected automatically in the following order of precedence:

1. **CLI flag `--lang`** (highest priority)
   ```bash
   npx smoonb --lang pt-BR backup
   npx smoonb --lang en restore
   ```

2. **Environment variable `SMOONB_LANG`**
   ```bash
   # Windows PowerShell
   $env:SMOONB_LANG="pt-BR"
   npx smoonb backup
   
   # Linux/macOS
   export SMOONB_LANG=pt-BR
   npx smoonb backup
   ```

3. **System locale** (LANG, LC_ALL, LC_MESSAGES)
   ```bash
   # smoonb automatically detects system locale
   # Example: LANG=pt_BR.UTF-8 → pt-BR
   # Example: LANG=en_US.UTF-8 → en
   ```

4. **Fallback to English (en)** if none of the above are detected

### Supported Languages and Aliases

smoonb accepts the following language codes:

- `en` or `en-US` → English
- `pt-BR`, `pt_BR` or `pt` → Portuguese (Brazil)

### Usage Examples

**Force Portuguese:**
```bash
npx smoonb --lang pt-BR backup
```

**Force English:**
```bash
npx smoonb --lang en restore
```

**Use environment variable:**
```bash
# Windows PowerShell
$env:SMOONB_LANG="pt-BR"
npx smoonb check

# Linux/macOS
export SMOONB_LANG=en
npx smoonb check
```

**Automatic system detection:**
```bash
# If system is configured with LANG=pt_BR.UTF-8
# smoonb will automatically use Portuguese
npx smoonb backup
```

### Important Notes

- **Machine outputs** (e.g., `--json` if implemented) are **not** translated; fields and keys remain in English
- If a translation key is missing in a language, the system automatically **falls back to English**
- Language is detected once at the start of execution and applied to all CLI messages

## 🎯 Usage

### Full Backup

```bash
npx smoonb backup
```

**Interactive backup flow:**

1. **Docker Validation** - Verifies if Docker is running
2. **Consent** - Asks permission to read/write `.env.local`
3. **Variable Mapping** - Maps your environment variables (first time)
4. **.env.local Backup** - Creates automatic backup before changes
5. **Component Selection** - Asks which components to include:
   - ⚡ Edge Functions (explanation about link reset and download)
   - 📦 Storage (explanation about full backup: file download + ZIP in Dashboard format)
   - 🔐 Auth Settings (explanation about configurations)
   - 🔄 Realtime Settings (explanation about interactive capture of 7 parameters)
   - 🗑️ Cleanup options (functions, .temp, migrations after backup)
6. **Configuration Summary** - Shows everything that will be done
7. **Final Confirmation** - Confirms before starting
8. **Step Execution:**
   - 📊 1/10 - Database Backup via `pg_dumpall` (Docker)
   - 📊 2/10 - Separate Database SQL (schema, data, roles)
   - 🔧 3/10 - Database Extensions and Settings Backup
   - 🔐 4/10 - Auth Settings Backup (if selected)
   - 🔄 5/10 - Realtime Settings Backup (if selected) - 7 parameters captured interactively
   - 📦 6/10 - Storage Backup (if selected) - Full file download + ZIP in Dashboard format
   - 👥 7/10 - Custom Roles Backup
   - ⚡ 8/10 - Edge Functions Backup (if selected)
   - 📁 9/10 - Supabase .temp Backup (if selected)
   - 📋 10/10 - Migrations Backup (if selected)

**Result:**
```
backups/backup-2025-10-31-09-37-54/
├── backup-manifest.json           # Manifest with metadata
├── db_cluster-31-10-2025@09-38-57.backup.gz  # Full backup (Dashboard compatible)
├── schema.sql                     # Database schema
├── data.sql                       # Data
├── roles.sql                      # PostgreSQL roles
├── database-settings-*.json       # Extensions and settings
├── auth-settings.json             # Auth configurations
├── realtime-settings.json         # Realtime configurations
├── storage/                       # Storage metadata
│   └── [bucket-name].json         # Metadata for each bucket
├── [project-id].storage.zip       # Full Storage backup (Dashboard format)
├── storage_temp/                  # Temporary structure (optional, can be removed)
│   └── [project-id]/              # Downloaded files structure
│       └── [bucket-name]/        # Files for each bucket
├── edge-functions/                # Downloaded Edge Functions
│   └── [function-name]/
├── supabase-temp/                 # Supabase CLI .temp files
├── migrations/                    # All migrations
└── env/
    ├── .env.local                 # .env.local backup
    └── env-map.json               # Variable mapping
```

### Interactive Restoration

**Restore existing backup:**
```bash
npx smoonb restore
```

**Import and restore directly from Dashboard:**
```bash
# Database only
npx smoonb restore --file "C:\Downloads\db_cluster-04-03-2024@14-16-59.backup.gz"

# Database and storage together
npx smoonb restore --file "backup.backup.gz" --storage "my-project.storage.zip"
```

**Interactive restore flow:**

1. **Docker Validation** - Verifies if Docker is running
2. **Terms of Use** - Displays and requests acceptance of terms
3. **Consent** - Asks permission to read/write `.env.local`
4. **Variable Mapping** - Maps variables to target project
5. **.env.local Backup** - Creates automatic backup
6. **Backup Selection** - Lists and allows choosing which backup to restore (skips if `--file` provided)
   - If `--file` is provided: automatically imports and auto-selects the backup
   - If `--storage` is provided along with `--file`: also imports the storage file
7. **Component Selection** - Asks which components to restore:
   - 📊 Database (always available)
   - ⚡ Edge Functions (if available in backup)
   - 🔐 Auth Settings (if available in backup)
   - 📦 Storage (if available in backup)
   - 🔧 Database Extensions and Settings (if available in backup)
   - 🔄 Realtime Settings (if available in backup)
8. **Detailed Summary** - Shows selected backup, target project and components
9. **Final Confirmation** - Confirms before starting
10. **Restore Execution:**
    - 📊 Database - Restores via `psql` (supports `.backup.gz` and `.backup`)
    - ⚡ Edge Functions - Copies and deploys to target project
    - 🔐 Auth Settings - Displays configurations for manual application
    - 📦 Storage - Restores buckets and files from ZIP (if available) or displays information for manual migration
    - 🔧 Database Settings - Restores extensions and settings via SQL
    - 🔄 Realtime Settings - Displays configurations for manual application

**Supported file formats:**
- ✅ `.backup.gz` (compressed) - Automatically decompresses before restoring
- ✅ `.backup` (uncompressed) - Restores directly

**When to use `--file`:**
- Automatically imports backup file before restoring
- Eliminates backup selection step
- If `--storage` provided, also imports storage file
- Useful for restoring backups downloaded directly from Supabase Dashboard

### Import Backup from Supabase Dashboard

If you downloaded a backup directly from the Supabase Dashboard (`.backup.gz` format), you can import it to the format expected by smoonb. The command also supports optionally importing storage files (`.storage.zip`).

**Import database only:**
```bash
npx smoonb import --file "full/path/to/db_cluster-04-03-2024@14-16-59.backup.gz"
```

**Import database and storage together:**
```bash
npx smoonb import --file "backup.backup.gz" --storage "my-project.storage.zip"
```

**What the command does:**
1. Reads the `.backup.gz` file from Dashboard (required)
2. If provided, reads the `.storage.zip` file from Dashboard (optional)
3. Extracts information from backup file name (date and time)
4. Creates a backup folder in expected format (`backup-YYYY-MM-DD-HH-MM-SS`)
5. Copies backup file to created folder
6. If provided, copies storage file to same folder
7. Makes backup ready to be found by `restore` command

**Complete example - Database only (using import + restore):**
```bash
# 1. Download backup from Supabase Dashboard
#    File: db_cluster-04-03-2024@14-16-59.backup.gz

# 2. Import the file
npx smoonb import --file "C:\Downloads\db_cluster-04-03-2024@14-16-59.backup.gz"

# 3. Restore the imported backup
npx smoonb restore
# The imported backup will appear in the list of available backups
```

**Complete example - Database only (using restore directly):**
```bash
# 1. Download backup from Supabase Dashboard
#    File: db_cluster-04-03-2024@14-16-59.backup.gz

# 2. Import and restore directly (skips backup selection)
npx smoonb restore --file "C:\Downloads\db_cluster-04-03-2024@14-16-59.backup.gz"
```

**Complete example - Database and Storage (using import + restore):**
```bash
# 1. Download backup and storage from Supabase Dashboard
#    Files: 
#    - db_cluster-04-03-2024@14-16-59.backup.gz
#    - my-project.storage.zip

# 2. Import both files
npx smoonb import --file "C:\Downloads\db_cluster-04-03-2024@14-16-59.backup.gz" --storage "C:\Downloads\my-project.storage.zip"

# 3. Restore the imported backup
npx smoonb restore
# The imported backup will appear in the list of available backups
```

**Complete example - Database and Storage (using restore directly):**
```bash
# 1. Download backup and storage from Supabase Dashboard
#    Files: 
#    - db_cluster-04-03-2024@14-16-59.backup.gz
#    - my-project.storage.zip

# 2. Import and restore directly (skips backup selection)
npx smoonb restore --file "C:\Downloads\db_cluster-04-03-2024@14-16-59.backup.gz" --storage "C:\Downloads\my-project.storage.zip"
```

**Important:**
- Backup file is **required** and must be in Dashboard format: `db_cluster-DD-MM-YYYY@HH-MM-SS.backup.gz`
- Storage file is **optional** and must be in format: `*.storage.zip`
- Storage depends on a backup, but backup does not depend on storage
- Both files will be copied to the same backup folder
- Path can be absolute or relative
- Command will automatically create necessary folder structure

**Difference between `import` and `restore --file`:**
- `import`: Only imports the file and creates backup structure. You need to run `restore` afterwards.
- `restore --file`: Automatically imports the file and starts the restoration process, skipping the backup selection step.

### Post-Restore Verification

```bash
npx smoonb check
```

**Verifies:**
- ✅ Database connection
- ✅ Installed extensions
- ✅ Created tables
- ✅ RLS policies
- ✅ Realtime publications
- ✅ Storage buckets


## 🔧 Available Commands

| Command | Description |
|---------|-------------|
| `npx smoonb backup` | Full interactive backup using Docker |
| `npx smoonb restore` | Interactive restoration using psql (Docker) |
| `npx smoonb restore --file <path> [--storage <path>]` | Import and restore directly .backup.gz file and optionally .storage.zip from Dashboard |
| `npx smoonb import --file <path> [--storage <path>]` | Import .backup.gz file and optionally .storage.zip from Supabase Dashboard |
| `npx smoonb check` | Post-restore integrity verification |

## 🏗️ Technical Architecture

### Modular Structure

The code has been refactored to a **modular architecture** with independent steps:

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
- **Main Backup**: `pg_dumpall` via Docker (identical to Dashboard)
  - File: `db_cluster-XX-XX-XXXX@XX-XX-XX.backup.gz`
  - Compatible with restoration via Supabase Dashboard
- **Separate Backup**: SQL in separate files via Supabase CLI
  - `schema.sql` - Table structure
  - `data.sql` - Data (COPY statements)
  - `roles.sql` - Roles and permissions

#### Edge Functions
- **Automatic Download**: Via Supabase CLI `supabase functions download`
- **Link Reset**: Ensures clean link with project before download
- **Complete Backup**: Full code of each function

#### Migrations
- **Automatic Download**: Via `supabase migration fetch`
- **Link Reset**: Ensures clean link with project
- **Complete Backup**: All server migrations

#### Storage
- **Complete Backup**: Download of all files from all buckets
- **Temporary Structure**: Creates `storage_temp/project-id/bucket-name/files...` inside backupDir
- **ZIP in Dashboard Format**: Creates `{project-id}.storage.zip` with structure `project-id/bucket-name/files...`
- **Restore Compatible**: Created ZIP is compatible with restore process (same format as Dashboard)
- **Interactive Question**: After creating ZIP, asks if you want to clean temporary structure
- **Fallback**: If Supabase credentials are not available, backs up metadata only
- **Management API**: Uses Personal Access Token to list buckets and objects
- **Supabase Client**: Uses Service Role Key for file downloads

#### Auth, Realtime
- **Management API**: Uses Personal Access Token
- **JSON Export**: Configurations exported as JSON
- **Realtime Settings**: Interactive capture of 7 parameters:
  1. Enable Realtime service
  2. Allow public access
  3. Database connection pool size
  4. Max concurrent clients
  5. Max events per second
  6. Max presence events per second
  7. Max payload size in KB
- **Manual for some**: Some settings need to be applied manually for security

### Restore Strategy

#### Database
- **Format Support**:
  - `.backup.gz` - Automatically decompresses via Docker
  - `.backup` - Restores directly via `psql` (Docker)
- **Clean Restore**: Can overwrite existing data (with confirmation)

#### Edge Functions
- **Clean Deploy**: Cleans `supabase/functions` before deploy
- **Link Reset**: Ensures correct link with target project
- **Automatic Deploy**: Uses `supabase functions deploy`

#### Other Components
- **Database Settings**: Restores via SQL
- **Storage**: Restores buckets and files from ZIP (if available) or displays information for manual configuration
- **Auth/Realtime**: Displays information for manual configuration in Dashboard

### Cross-Platform

- **Windows/macOS/Linux**: Automatic binary detection
- **Cross-platform**: Uses `fs.promises.cp`, `path.join`, Docker
- **Docker for Everything**: Backup, restore and compression via Docker (ensures consistency)

## 📊 Recommended Flow

```bash
# 1. Configure .env.local (first time)
# Edit .env.local with your source project credentials

# 2. Backup source project
npx smoonb backup
# - Maps variables interactively (first time)
# - Selects components for backup
# - Executes full backup

# 3. Create new Supabase project
# (via Dashboard or Supabase CLI)

# 4. Edit .env.local with new project credentials
# Update variables to point to target project

# 5. Restore backup (interactive mode)
npx smoonb restore
# - Selects desired backup
# - Selects components to restore
# - Executes restoration

# 6. Verify integrity
npx smoonb check

# 7. Apply manual configurations (if necessary)
# - Auth Settings: Dashboard → Authentication → Settings
# - Realtime: Dashboard → Database → Replication
# Note: Storage is automatically restored from ZIP if available
```

## 🎨 User Experience

### Multi-Language Interface

All interactions are **automatically translated** based on system locale or `--lang` flag:
- Clear and direct questions
- Explanations before each process
- Detailed summaries before confirming
- Confirmations with `(Y/n)` or `(y/N)` in English, `(S/n)` or `(s/N)` in Portuguese

### Intelligent Variable Mapping

- **Automatic Detection**: If key already exists with expected name, skips selection
- **Add Option**: Allows adding new keys if they don't exist
- **Value Validation**: Confirms values before saving
- **Automatic Backup**: Always creates backup of `.env.local` before changes

### Guided Process

- **Prior Validation**: Verifies Docker before starting
- **Contextual Explanations**: Explains each process before asking
- **Final Summary**: Shows everything that will be done before executing
- **Visual Feedback**: Colors and icons for better experience

## 🐛 Troubleshooting

### Docker not found or not running
```bash
# Verify if Docker is installed
docker --version

# Verify if Docker Desktop is running
docker ps

# If not, start Docker Desktop
# Windows/macOS: Open Docker Desktop application
# Linux: sudo systemctl start docker
```

### Supabase CLI not found
```bash
npm install -g supabase
```

### Invalid or missing Personal Access Token

1. Verify if `SUPABASE_ACCESS_TOKEN` is in `.env.local`
2. Generate new token: https://supabase.com/dashboard/account/tokens
3. Update `.env.local` with new token

### Incorrect Database URL
- Verify password in connection URL
- Use Connection string from Supabase Dashboard (Settings → Database)
- Test connection: `psql "your-database-url" -c "SELECT 1"`

### .backup.gz file cannot be restored

smoonb automatically supports:
- ✅ `.backup.gz` - Decompresses via Docker before restoring
- ✅ `.backup` - Restores directly

If there are problems:
1. Verify if Docker is running
2. Verify file permissions
3. Verify disk space

### Error downloading Edge Functions

1. Verify if `SUPABASE_ACCESS_TOKEN` is configured
2. Verify if project is linked: `supabase link`
3. Verify if functions exist on server

### Error downloading Migrations

1. Verify if `SUPABASE_ACCESS_TOKEN` is configured
2. Verify if project is linked: `supabase link`
3. Verify if there are migrations on server

## 🔒 Security

- **Automatic Backup**: Always creates backup of `.env.local` before changes
- **Local Mapping**: Variable mapping saved only locally
- **No Sensitive Data**: No sensitive data is sent outside your environment
- **Isolated Docker**: Database operations via Docker (isolation)

## 💼 Access Model and Subscription

Supa Moonbase code is provided under MIT license (see `LICENSE`). In a future phase, CLI execution will be linked to a per-account subscription, allowing use associated with a valid account. Account validation will occur before any sensitive operations (e.g., backup and restore).

Until validation is active, the tool can be used without login.

Learn more at [Pricing](https://smoonb.com/pricing) and [Commercial FAQ](https://smoonb.com/faq).

## 🎁 Grandfathering (concept)

Accounts created during the initial commercial availability period may maintain differentiated access conditions while they remain active. The goal is to recognize early users. Specific details will be in the [Terms of Service](https://smoonb.com/terms) and [Pricing](https://smoonb.com/pricing).

## 🔒 Privacy and LGPD (summary)

Supa Moonbase adopts the data minimization principle. When account validation is active, we will only process information strictly necessary for access control and billing (e.g., account identifier and contact). Purposes, legal bases and data subject rights will be described in the [Privacy Policy](https://smoonb.com/privacy).

## 📋 Terms of Service and Brand Usage

The code license (MIT) does not replace the Terms of Service that will govern per-account operational access and subscription validation.

"Supa Moonbase" and visual identity elements are trademarks of Goalmoon Tecnologia Ltda.; brand and branding assets usage is restricted, as per [Terms of Service](https://smoonb.com/terms).

## ❓ Commercial FAQ

**Why subscription if the code is MIT?**

> The code remains open for audit and contributions. Operational access will be conditioned to account validation, as per Terms of Service.

**What does grandfathering mean?**

> Accounts from the initial period may maintain differentiated conditions while active; details will be in the Terms.



## 📝 License

Supa Moonbase code is provided under MIT license. See [LICENSE](LICENSE) for the full license text. A Portuguese translation is available in [LICENSE.pt-BR.md](LICENSE.pt-BR.md) for convenience only.

## 🤝 Contributing

Contributions are welcome! This is an experimental project and we need community feedback.


---

**Developed by:** Goalmoon Tecnologia LTDA  
**Website:** https://smoonb.com  
**GitHub:** https://github.com/almmello/smoonb
