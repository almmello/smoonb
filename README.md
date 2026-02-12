# Supa Moonbase (smoonb)

**Complete Supabase backup and migration tool**

Backup and restore: complete and simple, as it should be

> **Commercial product.** You need an **active license** and a **valid subscription** (or be on a trial period) to use smoonb. [www.smoonb.com/#price](https://www.smoonb.com/#price). Use is governed by the [Terms of Service](https://www.smoonb.com/terms) and [Privacy Policy](https://www.smoonb.com/privacy). We do not assume any liability for damage caused by smoonb; the legal disclaimers below remain in effect.

**Read this in other languages:** [Português (Brasil)](README.pt-BR.md)

**Developed by:** Goalmoon Tecnologia LTDA  
**Website:** https://www.smoonb.com  
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

## ⚠️ Universal Disclaimer / Legal Notice

By continuing, you acknowledge and agree that Supa Moonbase (smoonb) is provided "AS IS" and "AS AVAILABLE", with no warranties of any kind—express, implied, or statutory—including but not limited to merchantability, fitness for a particular purpose, and non-infringement, to the maximum extent permitted by applicable law. Backup and restore operations inherently carry risk, environments vary widely, and we cannot foresee or validate all user setups. You are solely responsible for validating your own environment, keeping independent copies, and verifying results before relying on them in production. We build Supa Moonbase (smoonb) on public, auditable, open-source repositories to help people simplify their workflows, but this does not create any warranty, promise of support, or service-level commitment.

**Limitation of liability** — To the maximum extent permitted by law, Goalmoon Tecnologia LTDA, its contributors, and licensors will not be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages (including loss of data, interruption of business, or lost profits) arising from or related to the use of, inability to use, backup/restore operations performed by, or results produced by Supa Moonbase (smoonb).

## 🚀 Installation

**⚠️ IMPORTANT: Install ONLY locally in the project!**

**Install locally in the project:**
```bash
npm install smoonb
```

**Use with npx:**
```bash
npx smoonb --help
```

**Do not install globally** (blocked):
```bash
npm install -g smoonb
```

### 🔄 Update to Latest Version

To update smoonb to the latest available version, run in the current project:

```bash
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

Install from [Docker Desktop](https://docs.docker.com/desktop/install/) (Windows/macOS) or [Docker Engine](https://docs.docker.com/engine/install/) (Linux). Then verify it is running:

```bash
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

We recommend **Supabase CLI v2.72 or newer** for new features and bug fixes. To update: [Updating the Supabase CLI](https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli).

### 3. Supabase Personal Access Token
You need to obtain a Supabase personal access token to use the Management API:

1. Visit: https://supabase.com/dashboard/account/tokens
2. Click "Generate new token"
3. Copy the token (format: `sbp_...`)
4. Add to `.env.local` as `SUPABASE_ACCESS_TOKEN`

### 4. License Key (REQUIRED for backup and restore)
**smoonb** requires a valid license to run backup and restore:

1. Get your license from the desktop app at https://www.smoonb.com
2. Set in environment or `.env.local`: `SMOONB_LICENSE_KEY=[your-license-key]`
3. License is validated at the start of each run (step 00); no caching. If validation fails (network/server), the CLI aborts. The license is **not** shown in the interactive variable-mapping wizard (it is already validated before that).

## ⚙️ Configuration

### Modern Method: `.env.local` (RECOMMENDED)

**smoonb** now uses `.env.local` for configuration, following industry standards. This makes the process simpler and more integrated with your workflow.

#### 1. Create or edit `.env.local` in the project root

```bash
touch .env.local
```

#### 2. Add required environment variables

```env
SMOONB_LICENSE_KEY=[your-license-key]
NEXT_PUBLIC_SUPABASE_URL=[your-supabase-url]
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-anon-key]
SUPABASE_SERVICE_ROLE_KEY=[your-service-role]
SUPABASE_DB_URL=postgresql://postgres:[your-database-password]@db.[your-project-id].supabase.co:5432/postgres
SUPABASE_PROJECT_ID=[your-project-id]
SUPABASE_ACCESS_TOKEN=[your-access-token]
SUPABASE_POSTGRES_MAJOR=17
SMOONB_TELEMETRY_ENABLED=true
SMOONB_OUTPUT_DIR=./backups
```

Required: `SMOONB_LICENSE_KEY` (from [www.smoonb.com](https://www.smoonb.com) desktop app), `SUPABASE_POSTGRES_MAJOR` (e.g. 17; see Dashboard → Project Settings → Infrastructure → Service Versions). Optional: `SMOONB_TELEMETRY_ENABLED`, `SMOONB_OUTPUT_DIR` (default `./backups`).

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

1. **Environment variable `SMOONB_LANG`** (in `.env.local` or in the environment)
2. **System locale** (LANG, LC_ALL, LC_MESSAGES). Example: `LANG=pt_BR.UTF-8` → pt-BR
3. **Fallback to English (en)** if none of the above are detected

### Supported Languages and Aliases

- `en` or `en-US` → English
- `pt-BR`, `pt_BR` or `pt` → Portuguese (Brazil)

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

1. **Terms of use** - Displays and requests acceptance of terms
2. **License validation** - Validates `SMOONB_LICENSE_KEY` (env or prompt); no cache; aborts if validation fails
3. **Docker validation** - Verifies if Docker is running
4. **Consent** - Asks permission to read/write `.env.local`
5. **Variable mapping** - Maps your environment variables (first time; license is not in the wizard—already validated)
6. **.env.local backup** - Creates automatic backup before changes
7. **Component selection** - Asks which components to include:
   - ⚡ Edge Functions (explanation about link reset and download)
   - 📦 Storage (explanation about full backup: file download + ZIP in Dashboard format)
   - 🔐 Auth Settings (explanation about configurations)
   - 🔄 Realtime Settings (explanation about interactive capture of 7 parameters)
   - 🗑️ Cleanup options (functions, .temp, migrations after backup)
8. **Configuration summary** - Shows everything that will be done
9. **Final confirmation** - Confirms before starting
10. **Step execution:**
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

**Result:** A folder `backups/backup-YYYY-MM-DD-HH-MM-SS/` containing for example:

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
│   └── [function-name]/
├── supabase-temp/
├── migrations/
└── env/
    ├── .env.local
    └── env-map.json
```

### Interactive Restoration

**Restore existing backup:**
```bash
npx smoonb restore
```

**Interactive restore flow:**

1. **Terms of use** - Displays and requests acceptance of terms
2. **License validation** - Validates `SMOONB_LICENSE_KEY` (env or prompt); aborts if validation fails
3. **Docker validation** - Verifies if Docker is running
4. **Consent** - Asks permission to read/write `.env.local`
5. **Variable mapping** - Maps variables to target project (includes `SUPABASE_POSTGRES_MAJOR`)
6. **.env.local backup** - Creates automatic backup
7. **Backup selection** - Lists and allows choosing which backup to restore
8. **Component selection** - Asks which components to restore:
   - 📊 Database (always available)
   - ⚡ Edge Functions (if available in backup)
   - 🔐 Auth Settings (if available in backup)
   - 📦 Storage (if available in backup)
   - 🔧 Database Extensions and Settings (if available in backup)
   - 🔄 Realtime Settings (if available in backup)
9. **Detailed summary** - Shows selected backup, target project and components
10. **Final confirmation** - Confirms before starting
11. **Disclaimer** - Explains that errors during restore are expected; link to [Supabase Dashboard Restore docs](https://supabase.com/docs/guides/platform/migrating-within-supabase/dashboard-restore); you should wait for the process to finish and then test the result before accepting to proceed
12. **Restore execution:**
    - 📊 Database - Restores via `psql` (supports `.backup.gz` and `.backup`)
    - ⚡ Edge Functions - Copies and deploys to target project
    - 🔐 Auth Settings - Displays configurations for manual application
    - 📦 Storage - Restores buckets and files from ZIP (if available) or displays information for manual migration
    - 🔧 Database Settings - Restores extensions and settings via SQL
    - 🔄 Realtime Settings - Displays configurations for manual application

**Supported file formats:**
- ✅ `.backup.gz` (compressed) - Automatically decompresses before restoring
- ✅ `.backup` (uncompressed) - Restores directly

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

1. Download backup from Supabase Dashboard (e.g. `db_cluster-04-03-2024@14-16-59.backup.gz`).
2. Import the file, then restore:

```bash
npx smoonb import --file "C:\Downloads\db_cluster-04-03-2024@14-16-59.backup.gz"
npx smoonb restore
```

The imported backup will appear in the list of available backups.

**Complete example - Database and Storage (using import + restore):**

1. Download backup and storage from Supabase Dashboard (e.g. `db_cluster-04-03-2024@14-16-59.backup.gz` and `my-project.storage.zip`).
2. Import both files, then restore:

```bash
npx smoonb import --file "C:\Downloads\db_cluster-04-03-2024@14-16-59.backup.gz" --storage "C:\Downloads\my-project.storage.zip"
npx smoonb restore
```

The imported backup will appear in the list of available backups.

**Important:**
- Backup file is **required** and must be in Dashboard format: `db_cluster-DD-MM-YYYY@HH-MM-SS.backup.gz`
- Storage file is **optional** and must be in format: `*.storage.zip`
- Storage depends on a backup, but backup does not depend on storage
- Both files will be copied to the same backup folder
- Path can be absolute or relative
- Command will automatically create necessary folder structure

After running `import`, run `restore` to choose the imported backup from the list and restore it.

## 🔧 Available Commands

| Command | Description |
|---------|-------------|
| `npx smoonb backup` | Full interactive backup using Docker |
| `npx smoonb restore` | Interactive restoration using psql (Docker) |
| `npx smoonb import --file <path> [--storage <path>]` | Import .backup.gz file and optionally .storage.zip from Supabase Dashboard |

## 🏗️ Technical Architecture

### Modular Structure

The code has been refactored to a **modular architecture** with independent steps:

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
License validation (same as backup, `00-license.js` from backup steps) runs at start. Then:
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

1. **Configure `.env.local`** (first time) with your source project credentials.
2. **Backup source project:**
   ```bash
   npx smoonb backup
   ```
   (Maps variables interactively on first run, selects components, executes full backup.)
3. **Create new Supabase project** (via Dashboard or Supabase CLI).
4. **Edit `.env.local`** with new project credentials (point variables to target project).
5. **Restore backup** (interactive mode):
   ```bash
   npx smoonb restore
   ```
   (Select desired backup, select components, execute restoration.)
6. **Apply manual configurations** if necessary: Auth Settings (Dashboard → Authentication → Settings), Realtime (Dashboard → Database → Replication). Storage is restored automatically from ZIP when available.

## 🎨 User Experience

### Multi-Language Interface

All interactions are **automatically translated** based on system locale or `SMOONB_LANG`:
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

Verify Docker is installed and running:

```bash
docker --version
docker ps
```

If not, start Docker Desktop (Windows/macOS) or run `sudo systemctl start docker` (Linux).

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

## 💼 Access and subscription

Supa Moonbase code is provided under MIT license (see `LICENSE`). To use smoonb you must have an **active license** and a **valid subscription**, or be within a **trial period**. License validation runs at the start of backup and restore; without a valid license and subscription (or trial), the CLI will not run those operations.

[www.smoonb.com/#price](https://www.smoonb.com/#price).

## 🔒 Privacy and LGPD (summary)

Supa Moonbase adopts the data minimization principle. We process only the information strictly necessary for access control and billing (e.g., account identifier and contact). Purposes, legal bases and data subject rights are described in the [Privacy Policy](https://www.smoonb.com/privacy).

## 📋 Terms of Service and brand usage

The code license (MIT) does not replace the [Terms of Service](https://www.smoonb.com/terms) that govern operational access and subscription validation.

"Supa Moonbase" and visual identity elements are trademarks of Goalmoon Tecnologia Ltda.; use of brand and branding assets is restricted as per [Terms of Service](https://www.smoonb.com/terms).

[FAQ](https://www.smoonb.com/#faq).

## 📝 License

Supa Moonbase code is provided under MIT license. See [LICENSE](LICENSE) for the full license text. A Portuguese translation is available in [LICENSE.pt-BR.md](LICENSE.pt-BR.md) for convenience only.

## 🤝 Contributing

Contributions are welcome. [www.smoonb.com/#price](https://www.smoonb.com/#price).


---

**Developed by:** Goalmoon Tecnologia LTDA  
**Website:** https://www.smoonb.com  
**GitHub:** https://github.com/almmello/smoonb
