# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.10] - 2026-10-10

### Fixed

- When a Realtime PATCH succeeds but capacity limits remain different, show the backup and destination values and offer an explicit choice to retain the destination limits. Record accepted differences instead of failing with field names only or claiming an identical restore.
- Retry readback without repeating PATCH, then re-read all selected Realtime settings after consent. Security switches, connection pools, invalid values, API failures and concurrent configuration changes remain failures.
- Record refused quota differences in the failure report; allow a retry selecting only Realtime without repeating Database, Auth or Storage. Non-interactive runs never silently accept differences.
- Preserve SMTP verification limits in combined reports and show completion with notes when any selected component has accepted differences or unverified secrets.
- Replace obsolete manual-configuration messages in the English and Portuguese Auth/Realtime summaries.

### Tests

- Cover legacy and API snapshots, delayed readback, consent and rejection, non-interactive execution, strict security validation, concurrent changes, secret-safe errors, partial reports and Realtime-only retries.

## [1.0.9] - 2026-10-10

### Fixed

- Treat SMTP passwords as write-only credentials. Never replay the protected SMTP value returned by the Management API from a legacy backup as the provider password.
- Ask for the real SMTP password with hidden input before restoring any selected components. Fail before remote mutations if it is missing. Keep the entered password in memory only.
- Verify readable Auth settings independently from password submission. Continue after the API accepts the supplied password, but report `applied_with_unverified_secrets` and require an authentication email test instead of claiming password or email-delivery verification.
- Omit the protected SMTP value from new Auth snapshots and explicitly record that the provider password is required during restore. Existing backups remain usable.

### Recovery from 1.0.8

- If restore stopped at `Configuration verification failed: smtp_pass`, inspect its `report.json`. When Database and Edge Functions are already verified, run restore with those two components disabled and select Auth, Storage, Database Settings and Realtime as needed. Supply the real provider SMTP password when prompted; no new backup or destination project is required for this specific failure.

### Tests

- Cover legacy/new snapshots, hidden input, missing-password preflight, protected-value rejection, HTTP failures, readable-setting mismatches, partial verification reporting and continuation without reloading the database.

## [1.0.8] - 2026-10-10

### Fixed

- Restore application and Auth data from the existing full dump in one checked transaction. Fail on SQL errors; compare restored columns and validate foreign keys before commit, including pre-existing Auth constraints.
- Remove extra destination object grants before replaying source ACLs, preventing unintended anonymous/authenticated access to restricted functions and tables.
- Apply and verify Auth configuration through the Management API, including SMTP and redirect configuration.
- Remap source Supabase hostnames in application data and text objects when selected; preserve unrelated IDs and paths.
- Recover Storage MIME types, cache directives, ownership and user metadata from the full dump even when legacy Storage JSON inventories are empty. Validate ZIP inventory, count empty buckets, and verify every uploaded file by download and SHA-256.
- Use isolated temporary workspaces for Edge Function backup and deployment; preserve local modified sources and compressed backup archives. Address npm CLI shims on Windows without shell interpolation.
- Persist stage results and failures; never report unsuccessful or unverified components as restored.

### Changed

- Apply and verify Realtime snapshots through the API; capture fresh Realtime settings for new backups instead of reusing interactive recordings.
- Verify database settings and fail explicitly for incompatible platform settings rather than silently skipping them.
- Require Node.js 20 or later. A new, empty destination is required for the database restore; platform-managed schemas and administrator defaults remain destination-managed.
- Preserve Function JWT configuration in new backups. Legacy backups default to requiring JWT.

### Tests

- Add regression coverage for configuration readback, failure reporting, URL mapping, archive preservation, isolated Functions, and PostgreSQL arrays.
- Add an opt-in Docker test of the actual restore step with cyclic references, Auth identities, broad destination defaults, invalid-data rollback, populated-target refusal and Storage metadata/content verification (mock HTTP, real PostgreSQL).

---

## [1.0.7] - 2026-10-10

### Fixed

- Consolidate known PostgreSQL circular foreign-key warnings during separate SQL data export. Explain that export completion is distinct from restore validation, list affected tables, and verify the Supabase replica-role prologue before describing it.
- Preserve original circular-FK diagnostics and prologue detection in the backup manifest; keep unrelated warnings, errors, and failed-export diagnostics visible.
- Mark separate SQL backup incomplete when any of schema, data, or roles fails, instead of treating one exported file as full success.
- Clear progress timers on subprocess errors, drain stdout, and avoid terminal control output when stdout is redirected.

### Added

- Regression tests for chunked diagnostics, translations, missing protection, partial exports and subprocess failures.
- Opt-in Docker integration test using synthetic cyclic references, real Supabase CLI exports, successful protected/full restores and failing unprotected/unprivileged controls.
- English and Portuguese restore guidance; release checks now run tests and lint before the build.

---

## [1.0.6] - 2026-02-21

### Changed

- **Storage backup (step 6) — robustness and feedback:**
  - Added `withTimeout` helper: each Storage `.list()` call times out after 30s; each file `.download()` times out after 2 minutes.
  - Added `withRetry` helper: up to 3 attempts with exponential backoff (2s → 4s → 8s) on both listing and download failures.
  - Inline progress during file listing: live `\r`-updated line shows the current folder being scanned and the running file count (`→ Scanning bucket/folder (N found)`). No more silent hangs.
  - After listing completes, a summary line shows the total files found.
  - Retry warnings show attempt number, failure reason and next retry delay.
  - Download failures after all retries are counted as `filesSkipped` and reported in the bucket summary.
  - Bucket summary now distinguishes between full success and partial success with skips.

---

## [1.0.5] - 2026-02-21

### Added

- **Flexible Supabase CLI version check** – Instead of requiring the exact latest version, smoonb now accepts any CLI version that is at most 1 minor behind the latest (same major). The minimum accepted version is computed as `major.(minor_latest - 1).0` at runtime from the npm registry. Special case: if `minor_latest === 0`, only the same major.minor is accepted.
- **`--skip-supabase-version-check` flag** – New opt-in flag for both `backup` and `restore` commands. When set, the Supabase CLI version check is skipped entirely and a warning is displayed. Useful when package managers (e.g. Scoop on Windows) lag behind on updates and the user wants to proceed at their own risk.

### Changed

- Error message for outdated Supabase CLI now shows the computed minimum accepted version (`minVersion`) and the current latest, instead of only the latest.
- README (EN and PT-BR): updated Supabase CLI prerequisites section with the new version policy, added examples with `--skip-supabase-version-check`, updated commands table and troubleshooting section.
- i18n strings (`en.json`, `pt-BR.json`): removed specific version number references in favour of evergreen language ("always use the latest version").

---

## [1.0.4] - 2025-01-29

### Changed

- Release 1.0.4 – Build and lint verification.

---

## [1.0.3] - 2025-01-29

### Added

- **License binding by installation** – One license is bound to a single installation (machine). On first use, the license is linked to a persistent `installationId` and cannot be moved. To use smoonb on another machine, revoke the license in the desktop app and generate a new one.
- **Installation ID** – Generated and stored on first run via `env-paths` (Windows: `%APPDATA%/smoonb-nodejs/Config`, macOS/Linux: `~/.config/smoonb-nodejs`). File: `config.json` with `installationId` (uuid v4) and `createdAt`. Never stores the license key.
- **Validation payload** – License validation now sends `installationId` and `cliVersion` with `licenseKey` and `correlationId`.

### Changed

- **LICENSE_ALREADY_BOUND** – When the server returns this reason, the CLI shows a clear message: "This license is already linked to another machine and cannot be moved" and instructs to revoke and generate a new license at https://www.smoonb.com.
- **Diagnostic bundle** – Includes masked `InstallationId` (e.g. `2f3a…91bc`) and server `Reason` (or reason code) on validation failure; HTTP status and response body (truncated) on network/HTTP errors.
- **Telemetry** – Uses the same `installationId` as license validation (shared util); removed duplicate persistence in `~/.smoonb/installation-id`.

### Fixed

- No offline cache: if validation fails (network or backend), the CLI does not run and shows the full diagnostic bundle.

---

---

[1.0.7]: https://github.com/almmello/smoonb/releases/tag/v1.0.7
[1.0.6]: https://github.com/almmello/smoonb/releases/tag/v1.0.6
[1.0.5]: https://github.com/almmello/smoonb/releases/tag/v1.0.5
[1.0.4]: https://github.com/almmello/smoonb/releases/tag/v1.0.4
