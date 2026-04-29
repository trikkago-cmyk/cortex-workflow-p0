import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function normalizeProjectId(projectId) {
  const value = String(projectId || '').trim();
  return value || 'PRJ-cortex';
}

function normalizeProjectName(projectName, projectId) {
  const value = String(projectName || '').trim();
  return value || normalizeProjectId(projectId);
}

export function projectSlug(projectId) {
  return normalizeProjectId(projectId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isLegacyProjectWorkspace(projectId) {
  return normalizeProjectId(projectId) === 'PRJ-cortex';
}

export function projectWorkspaceDir(cwd = process.cwd(), projectId) {
  return resolve(cwd, 'docs', 'projects', projectSlug(projectId));
}

export function resolveProjectWorkspacePaths({ cwd = process.cwd(), projectId, env = process.env } = {}) {
  const normalizedProjectId = normalizeProjectId(projectId || env.PROJECT_ID);
  const workspaceDir = projectWorkspaceDir(cwd, normalizedProjectId);
  const legacy = isLegacyProjectWorkspace(normalizedProjectId);

  return {
    projectId: normalizedProjectId,
    workspaceDir,
    memoryPath:
      env.MEMORY_PATH ||
      (legacy ? resolve(cwd, 'docs', 'collaboration-memory.md') : resolve(workspaceDir, 'memory.md')),
    executionDocPath:
      env.EXECUTION_DOC_PATH ||
      (legacy ? resolve(cwd, 'docs', 'prj-cortex-execution-doc.md') : resolve(workspaceDir, 'execution.md')),
    statePath:
      env.NOTION_LOOP_STATE_PATH ||
      resolve(cwd, 'tmp', `${projectSlug(normalizedProjectId)}-notion-loop-state.json`),
    syncPreferencesFile:
      env.NOTION_SYNC_PREFERENCES_FILE || resolve(cwd, 'docs', 'notion-sync-preferences.json'),
  };
}

export function defaultExecutionDocMarkdown({ projectId, projectName } = {}) {
  const resolvedProjectId = normalizeProjectId(projectId);
  const resolvedProjectName = normalizeProjectName(projectName, resolvedProjectId);

  return `# ${resolvedProjectName} 执行文档

- 当前任务：待同步
- 核心进展：待同步
- 最近同步：未同步（上海时间）

**风险举手**

🔴 红灯：无
🟡 黄灯：无
🟢 已推进：无

**下一步**

- 待同步

**评论约定**

- 直接对具体段落或具体条目划词评论
- 默认把评论视作执行反馈，而不是闲聊
- 若需指定 agent，可用 \`@agent\` / \`@别名\`

`;
}

export function defaultMemoryMarkdown({ projectId, projectName } = {}) {
  const resolvedProjectId = normalizeProjectId(projectId);
  const resolvedProjectName = normalizeProjectName(projectName, resolvedProjectId);

  return `# ${resolvedProjectName} 协作记忆

## Base Memory（基础记忆）

- 暂无稳定记忆。

## Timeline（时间线）

- 项目已初始化，等待首个稳定 checkpoint。

## Knowledge（知识）

- 暂无沉淀知识。

`;
}

export function ensureProjectWorkspace({ cwd = process.cwd(), projectId, projectName } = {}) {
  const paths = resolveProjectWorkspacePaths({ cwd, projectId });

  if (!isLegacyProjectWorkspace(paths.projectId)) {
    mkdirSync(paths.workspaceDir, { recursive: true });
  }

  if (!existsSync(paths.executionDocPath)) {
    writeFileSync(
      paths.executionDocPath,
      defaultExecutionDocMarkdown({
        projectId: paths.projectId,
        projectName,
      }),
      'utf8',
    );
  }

  if (!existsSync(paths.memoryPath)) {
    writeFileSync(
      paths.memoryPath,
      defaultMemoryMarkdown({
        projectId: paths.projectId,
        projectName,
      }),
      'utf8',
    );
  }

  return paths;
}
