import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const baseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const projectId = process.env.PROJECT_ID || 'PRJ-cortex';
const outputPath = process.env.OUTPUT_PATH || resolve(process.cwd(), 'tmp', `${projectId.toLowerCase()}-review.md`);

const response = await fetch(`${baseUrl}/project-review?project_id=${encodeURIComponent(projectId)}`);
const body = await response.json();

if (!response.ok || body.ok === false) {
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, body.markdown, 'utf8');

console.log(
  JSON.stringify(
    {
      ok: true,
      projectId,
      outputPath,
      redDecisions: body.summary.red_decisions.length,
      yellowDecisions: body.summary.yellow_decisions.length,
      activeCommands: body.summary.active_commands.length,
    },
    null,
    2,
  ),
);
