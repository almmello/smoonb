// Supabase SMTP passwords are write-only. The GET response is not a
// transferable credential, even when it looks like an ordinary string.
// https://github.com/supabase/supabase/blob/master/apps/studio/components/interfaces/Auth/SmtpForm/SmtpForm.tsx
function authSnapshot(settings) {
  const { smtp_pass: smtpPass, ...readable } = settings;
  return {
    settings: readable,
    secrets: {
      smtp_pass: {
        exportable: false,
        requires_input: Boolean(smtpPass || settings.smtp_host),
      },
    },
  };
}

function isMasked(value) {
  return (
    typeof value === 'string' && /^(\*{3,}|[•●]{3,}|\[redacted\])$/i.test(value)
  );
}

module.exports = { authSnapshot, isMasked };
