import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ensureProjectWorkspace,
  isLegacyProjectWorkspace,
  projectSlug,
  resolveProjectWorkspacePaths,
} from '../src/project-workspace.js';

test('project workspace uses legacy paths for PRJ-cortex', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-project-workspace-'));
  const paths = resolveProjectWorkspacePaths({
    cwd,
    projectId: 'PRJ-cortex',
    env: {},
  });

  assert.equal(isLegacyProjectWorkspace('PRJ-cortex'), true);
  assert.equal(paths.executionDocPath, join(cwd, 'docs', 'prj-cortex-execution-doc.md'));
  assert.equal(paths.memoryPath, join(cwd, 'docs', 'collaboration-memory.md'));
});

test('ensureProjectWorkspace creates per-project files for non-legacy projects', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-project-workspace-'));
  const paths = ensureProjectWorkspace({
    cwd,
    projectId: 'PRJ-dark-luxury-itinerary',
    projectName: 'Dark Luxury Itinerary',
  });

  assert.equal(projectSlug('PRJ-dark-luxury-itinerary'), 'prj-dark-luxury-itinerary');
  assert.equal(existsSync(paths.executionDocPath), true);
  assert.equal(existsSync(paths.memoryPath), true);
  assert.match(readFileSync(paths.executionDocPath, 'utf8'), /Dark Luxury Itinerary 执行文档/);
  assert.match(readFileSync(paths.memoryPath, 'utf8'), /Dark Luxury Itinerary 协作记忆/);
});
