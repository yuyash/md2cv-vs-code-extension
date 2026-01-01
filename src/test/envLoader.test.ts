import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { parseEnvFile, withEnvFromFile } from '../client/envLoader';

const originalEnv = { ...process.env };

const ENV_KEYS = ['NAME', 'EMAIL_ADDRESS', 'PHONE_NUMBER'];

beforeEach(() => {
  process.env = { ...originalEnv };
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('envLoader', () => {
  it('parses .env content with quotes and comments', () => {
    const parsed = parseEnvFile(`
# comment
NAME="Env User"
EMAIL_ADDRESS=env@example.com # inline
EMPTY=
export PHONE_NUMBER='000-000-0000'
`);

    expect(parsed.NAME).toBe('Env User');
    expect(parsed.EMAIL_ADDRESS).toBe('env@example.com');
    expect(parsed.EMPTY).toBe('');
    expect(parsed.PHONE_NUMBER).toBe('000-000-0000');
  });

  it('loads .env values temporarily for a file path', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md2cv-env-'));
    const envPath = path.join(tmpDir, '.env');
    const docPath = path.join(tmpDir, 'cv.md');

    fs.writeFileSync(envPath, 'NAME=Env User\nEMAIL_ADDRESS=env@example.com\n');
    fs.writeFileSync(docPath, '# CV\n');

    const value = withEnvFromFile(docPath, () => process.env.NAME);
    expect(value).toBe('Env User');
    expect(process.env.NAME).toBeUndefined();

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('does not override existing environment variables', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md2cv-env-'));
    const envPath = path.join(tmpDir, '.env');
    const docPath = path.join(tmpDir, 'cv.md');

    process.env.NAME = 'Existing User';
    fs.writeFileSync(envPath, 'NAME=Env User\n');
    fs.writeFileSync(docPath, '# CV\n');

    const value = withEnvFromFile(docPath, () => process.env.NAME);
    expect(value).toBe('Existing User');
    expect(process.env.NAME).toBe('Existing User');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
