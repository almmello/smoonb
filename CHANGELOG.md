# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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

[1.0.4]: https://github.com/almmello/smoonb/releases/tag/v1.0.4
