/** @jest-environment node */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const readProjectFile = (filePath) =>
  readFileSync(resolve(process.cwd(), filePath), 'utf8');

describe('local Supabase recovery email configuration', () => {
  it('sends the six-digit recovery token used by the password reset screen', () => {
    const config = readProjectFile('supabase/config.toml');
    const template = readProjectFile('supabase/templates/recovery.html');

    expect(config).toMatch(/\[auth\.email\]\s+otp_length = 6\s+otp_expiry = 3600/);
    expect(config).toMatch(
      /\[auth\.email\.template\.recovery\][\s\S]*?content_path = "\.\/supabase\/templates\/recovery\.html"/
    );
    expect(template).toContain('{{ .Token }}');
    expect(template).toContain('6-digit code');
  });
});
