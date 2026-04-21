import { spawnSync } from 'node:child_process';
import { loadProjectEnv } from '../src/project-env.js';

loadProjectEnv(process.cwd());

const baseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const explicitProjectId = String(process.env.PROJECT_ID || '').trim();

const steps = [
  { name: 'review', args: ['scripts/notion-sync-review.js'] },
  { name: 'execution', args: ['scripts/notion-sync-execution-doc.js'] },
  { name: 'project-index', args: ['scripts/notion-sync-project-index.js'] },
];

async function fetchProjectIds() {
  if (explicitProjectId) {
    return [explicitProjectId];
  }

  const response = await fetch(`${baseUrl}/projects`);
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to load projects from ${baseUrl}/projects`);
  }

  const projectIds = (payload.projects || [])
    .filter(
      (project) =>
        project?.project_id &&
        (project.notion_review_page_id ||
          project.notion_memory_page_id ||
          project.notion_scan_page_id ||
          project.root_page_url),
    )
    .map((project) => String(project.project_id).trim())
    .filter(Boolean);

  return projectIds.length > 0 ? projectIds : ['PRJ-cortex'];
}

const projectIds = await fetchProjectIds();
const results = [];

for (const projectId of projectIds) {
  const projectResult = {
    projectId,
    ok: true,
    steps: [],
  };

  for (const step of steps) {
    const result = spawnSync(process.execPath, step.args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PROJECT_ID: projectId,
      },
      stdio: 'inherit',
    });

    projectResult.steps.push({
      name: step.name,
      ok: result.status === 0,
      status: result.status || 0,
    });

    if (result.status !== 0) {
      projectResult.ok = false;
      break;
    }
  }

  results.push(projectResult);
}

const failedProjects = results.filter((result) => !result.ok).map((result) => result.projectId);

console.log(
  JSON.stringify(
    {
      ok: failedProjects.length === 0,
      projectIds,
      failedProjects,
      results,
    },
    null,
    2,
  ),
);

if (failedProjects.length > 0) {
  process.exitCode = 1;
}
