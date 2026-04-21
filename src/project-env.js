import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function looksLikePlaceholder(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return true;
  }

  return (
    /^你的[_-]/.test(text) ||
    /^your[_-]/i.test(text) ||
    /placeholder/i.test(text) ||
    /your_(?:db|database|token|secret|integration)/i.test(text)
  );
}

function hasNonAsciiOrWhitespace(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return true;
  }

  return /[\u0100-\u{10FFFF}]|\s/u.test(text);
}

function parseEnvFile(content) {
  const entries = {};
  for (const line of String(content || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const normalized = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const separatorIndex = normalized.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    let value = normalized.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      entries[key] = value;
    }
  }

  return entries;
}

export function loadProjectEnv(cwd = process.cwd(), options = {}) {
  const files = [resolve(cwd, '.env.local'), resolve(cwd, '.env')];
  const overrideKeys = new Set(
    Array.isArray(options.overrideKeys)
      ? options.overrideKeys.map((key) => String(key || '').trim()).filter(Boolean)
      : [],
  );
  const loaded = [];

  for (const filePath of files) {
    if (!existsSync(filePath)) {
      continue;
    }

    const entries = parseEnvFile(readFileSync(filePath, 'utf8'));
    for (const [key, value] of Object.entries(entries)) {
      const existingValue = process.env[key];
      if (
        overrideKeys.has(key) ||
        !Object.prototype.hasOwnProperty.call(process.env, key) ||
        looksLikePlaceholder(existingValue) ||
        (hasNonAsciiOrWhitespace(existingValue) && !hasNonAsciiOrWhitespace(value))
      ) {
        process.env[key] = value;
      }
    }

    loaded.push(filePath);
  }

  return loaded;
}

export function envLooksLikePlaceholder(key) {
  return looksLikePlaceholder(process.env[key]);
}
