import { buildAutomationStatus } from '../src/automation-status.js';
import { loadProjectEnv } from '../src/project-env.js';

loadProjectEnv(process.cwd(), {
  overrideKeys: ['CORTEX_BASE_URL'],
});

const status = await buildAutomationStatus({
  cwd: process.cwd(),
});

console.log(JSON.stringify(status, null, 2));
