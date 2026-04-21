import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const DEFAULT_SYNC_PREFERENCES = {
  reviewPage: {
    showSummaryNav: true,
    onlyReportNewCheckpoint: true,
  },
  executionPage: {
    showSummaryNav: false,
    onlyReportNewCheckpoint: true,
  },
  commentActions: {
    suppressFeedbackOnlySync: true,
  },
};

export function defaultSyncPreferencesFile(cwd = process.cwd()) {
  return resolve(cwd, 'docs', 'notion-sync-preferences.json');
}

export function loadSyncPreferences(filePath = defaultSyncPreferencesFile()) {
  if (!existsSync(filePath)) {
    return structuredClone(DEFAULT_SYNC_PREFERENCES);
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    return {
      reviewPage: {
        ...DEFAULT_SYNC_PREFERENCES.reviewPage,
        ...(parsed.reviewPage || {}),
      },
      executionPage: {
        ...DEFAULT_SYNC_PREFERENCES.executionPage,
        ...(parsed.executionPage || {}),
      },
      commentActions: {
        ...DEFAULT_SYNC_PREFERENCES.commentActions,
        ...(parsed.commentActions || {}),
      },
    };
  } catch {
    return structuredClone(DEFAULT_SYNC_PREFERENCES);
  }
}

export function saveSyncPreferences(preferences, filePath = defaultSyncPreferencesFile()) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(preferences, null, 2)}\n`, 'utf8');
  return preferences;
}

export function updateSyncPreferences(mutator, filePath = defaultSyncPreferencesFile()) {
  const current = loadSyncPreferences(filePath);
  const next = mutator(structuredClone(current)) || current;
  return saveSyncPreferences(next, filePath);
}
