const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');
const { t } = require('../../i18n');
const { remapServiceUrls } = require('./dump');
const { isMasked } = require('../../utils/auth-secrets');

async function prepareAuth(
  { backupPath, targetProject, remapUrls = true },
  {
    prompt = (questions) => inquirer.prompt(questions),
    interactive = Boolean(process.stdin.isTTY),
    log = console.log,
  } = {},
) {
  const getT = global.smoonbI18n?.t || t;
  const backup = JSON.parse(
    fs.readFileSync(path.join(backupPath, 'auth-settings.json'), 'utf8'),
  );
  const settings =
    backup.settings?.auth_url_config ||
    backup.settings ||
    backup.auth_url_config;
  if (!settings || !Object.keys(settings).length)
    throw new Error('Auth configuration missing from backup');
  // Never replay an opaque value from a legacy backup as a password.
  const { smtp_pass: stored, ...readable } = settings;
  const desired = remapUrls
    ? JSON.parse(
        remapServiceUrls(
          JSON.stringify(readable),
          backup.project_id,
          targetProject.targetProjectId,
        ),
      )
    : readable;
  const needsPassword = Boolean(
    stored || settings.smtp_host || backup.secrets?.smtp_pass?.requires_input,
  );
  const writeOnly = {};
  if (needsPassword) {
    log(getT('restore.smtp.explanation'));
    if (!interactive) throw new Error(getT('restore.smtp.interactiveRequired'));
    const validate = (value) =>
      typeof value === 'string' &&
      value.trim().length > 0 &&
      !isMasked(value) &&
      value !== stored;
    const answer = await prompt([
      {
        type: 'password',
        name: 'smtpPassword',
        mask: '*',
        message: getT('restore.smtp.password'),
        validate: (value) => validate(value) || getT('restore.smtp.required'),
      },
    ]);
    if (!validate(answer.smtpPassword))
      throw new Error(getT('restore.smtp.required'));
    writeOnly.smtp_pass = answer.smtpPassword;
  }
  return { desired, writeOnly };
}

module.exports = { prepareAuth };
