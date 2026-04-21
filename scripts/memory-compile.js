import { loadProjectEnv } from '../src/project-env.js';
import { compileMemoryHub } from '../src/memory-hub.js';

loadProjectEnv(process.cwd());

const result = compileMemoryHub({
  cwd: process.cwd(),
  dbPath: process.env.CORTEX_DB_PATH,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      paths: result.paths,
      stats: result.stats,
    },
    null,
    2,
  ),
);
