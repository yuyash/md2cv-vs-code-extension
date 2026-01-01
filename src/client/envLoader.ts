import * as fs from 'fs';
import * as path from 'path';

type EnvMap = Record<string, string>;

function unquote(value: string): string {
  if (value.length < 2) return value;
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value[value.length - 1] === quote) {
    const inner = value.slice(1, -1);
    if (quote === '"') {
      return inner
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
    return inner;
  }
  return value;
}

export function parseEnvFile(contents: string): EnvMap {
  const env: EnvMap = {};
  const lines = contents.replace(/^\uFEFF/, '').split(/\r?\n/);

  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) {
      line = line.slice(7).trim();
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2] ?? '';

    if (value && value[0] !== '"' && value[0] !== "'") {
      value = value.replace(/\s+#.*$/, '').trim();
    }

    env[key] = unquote(value);
  }

  return env;
}

export function withEnvFromFile<T>(filePath: string, fn: () => T): T {
  if (!filePath || !path.isAbsolute(filePath)) {
    return fn();
  }

  const envPath = path.join(path.dirname(filePath), '.env');
  if (!fs.existsSync(envPath)) {
    return fn();
  }

  const envData = parseEnvFile(fs.readFileSync(envPath, 'utf8'));
  const appliedKeys: string[] = [];

  for (const [key, value] of Object.entries(envData)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
      appliedKeys.push(key);
    }
  }

  try {
    return fn();
  } finally {
    for (const key of appliedKeys) {
      delete process.env[key];
    }
  }
}
