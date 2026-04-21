import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadProjectEnv } from '../src/project-env.js';

test('loadProjectEnv overrides broken non-ASCII env placeholders with project env values', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-project-env-'));
  writeFileSync(
    join(cwd, '.env.local'),
    ['NOTION_API_KEY=ntn_valid_token_123', 'NOTION_PROJECT_INDEX_DATABASE_ID=e33fca4a-f7dc-4d79-8c44-9a670a2fc83f'].join('\n'),
    'utf8',
  );

  const originalApiKey = process.env.NOTION_API_KEY;
  const originalDbId = process.env.NOTION_PROJECT_INDEX_DATABASE_ID;

  process.env.NOTION_API_KEY = '你的_notion_integration_secret';
  process.env.NOTION_PROJECT_INDEX_DATABASE_ID = 'your_database_id';

  try {
    loadProjectEnv(cwd);

    assert.equal(process.env.NOTION_API_KEY, 'ntn_valid_token_123');
    assert.equal(process.env.NOTION_PROJECT_INDEX_DATABASE_ID, 'e33fca4a-f7dc-4d79-8c44-9a670a2fc83f');
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.NOTION_API_KEY;
    } else {
      process.env.NOTION_API_KEY = originalApiKey;
    }

    if (originalDbId === undefined) {
      delete process.env.NOTION_PROJECT_INDEX_DATABASE_ID;
    } else {
      process.env.NOTION_PROJECT_INDEX_DATABASE_ID = originalDbId;
    }
  }
});

test('loadProjectEnv can force selected keys to use project env values', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-project-env-'));
  writeFileSync(
    join(cwd, '.env.local'),
    ['CORTEX_BASE_URL=http://127.0.0.1:19100', 'NOTION_API_KEY=ntn_valid_token_456'].join('\n'),
    'utf8',
  );

  const originalBaseUrl = process.env.CORTEX_BASE_URL;
  const originalApiKey = process.env.NOTION_API_KEY;

  process.env.CORTEX_BASE_URL = 'http://192.168.0.10:19100';
  process.env.NOTION_API_KEY = 'ntn_shell_token_should_stay';

  try {
    loadProjectEnv(cwd, {
      overrideKeys: ['CORTEX_BASE_URL'],
    });

    assert.equal(process.env.CORTEX_BASE_URL, 'http://127.0.0.1:19100');
    assert.equal(process.env.NOTION_API_KEY, 'ntn_shell_token_should_stay');
  } finally {
    if (originalBaseUrl === undefined) {
      delete process.env.CORTEX_BASE_URL;
    } else {
      process.env.CORTEX_BASE_URL = originalBaseUrl;
    }

    if (originalApiKey === undefined) {
      delete process.env.NOTION_API_KEY;
    } else {
      process.env.NOTION_API_KEY = originalApiKey;
    }
  }
});
