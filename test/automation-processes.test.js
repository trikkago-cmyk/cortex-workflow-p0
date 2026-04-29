import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStore } from '../src/store.js';
import {
  customAgentMcpEnabled,
  defaultRuntimeDir,
  listManagedProcessNames,
  listManagedStackWatchFiles,
  panghuPollerShouldRun,
} from '../src/automation-processes.js';
import { notionCollaborationMode } from '../src/notion-collaboration-mode.js';

test('listManagedProcessNames only includes active runtime processes', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-automation-processes-'));
  mkdirSync(join(cwd, 'docs'), { recursive: true });
  mkdirSync(defaultRuntimeDir(cwd), { recursive: true });

  writeFileSync(
    join(cwd, 'docs', 'agent-registry.json'),
    JSON.stringify(
      {
        defaults: {
          project_id: 'PRJ-cortex',
          source: 'notion_comment',
          mode: 'webhook',
        },
        agents: [
          {
            agent_name: 'agent-router',
            handler_kind: 'router',
            owner_agent: null,
            only_unassigned: true,
          },
          {
            agent_name: 'agent-custom',
            handler_kind: 'shared_actions',
            owner_agent: 'agent-custom',
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );

  writeFileSync(join(defaultRuntimeDir(cwd), 'executor-worker-agent-legacy.pid'), '123\n', 'utf8');

  const names = listManagedProcessNames({
    cwd,
    runtimeDir: defaultRuntimeDir(cwd),
  });

  assert.deepEqual(names, [
    'cortex-custom-agent-mcp',
    'cortex-server',
    'executor-multi-agent-handler',
    'executor-worker-agent-custom',
    'executor-worker-agent-legacy',
    'executor-worker-agent-router',
  ]);
});

test('customAgentMcpEnabled is on by default and can be disabled explicitly', () => {
  assert.equal(customAgentMcpEnabled({}), true);
  assert.equal(customAgentMcpEnabled({ CORTEX_MCP_ENABLE: '1' }), true);
  assert.equal(customAgentMcpEnabled({ CORTEX_MCP_ENABLE: '0' }), false);
  assert.equal(customAgentMcpEnabled({ CORTEX_MCP_ENABLE: 'false' }), false);
});

test('panghuPollerShouldRun requires a real sender by default', () => {
  assert.equal(
    panghuPollerShouldRun({
      PANGHU_POLL_ENABLE: '1',
      PANGHU_SEND_MODE: 'stdout',
    }),
    false,
  );

  assert.equal(
    panghuPollerShouldRun({
      PANGHU_POLL_ENABLE: '1',
      PANGHU_SEND_MODE: 'stdout',
      PANGHU_ALLOW_DRY_RUN: '1',
    }),
    true,
  );

  assert.equal(
    panghuPollerShouldRun({
      PANGHU_POLL_ENABLE: '1',
      PANGHU_SEND_MODE: 'http',
      PANGHU_SEND_URL: 'http://example.com/send',
    }),
    true,
  );
});

test('listManagedProcessNames includes local-notifier when a project uses local_notification', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-automation-local-'));
  mkdirSync(join(cwd, 'db'), { recursive: true });
  const store = createStore({
    dbPath: join(cwd, 'db', 'cortex.db'),
  });
  store.ensureProject({
    projectId: 'PRJ-cortex',
    name: 'Cortex',
    notificationChannel: 'local_notification',
  });
  store.close();

  const names = listManagedProcessNames({ cwd });

  assert.ok(names.includes('local-notifier'));
});

test('listManagedStackWatchFiles includes runtime code and config, but not execution docs', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-automation-watch-'));
  mkdirSync(join(cwd, 'src'), { recursive: true });
  mkdirSync(join(cwd, 'scripts'), { recursive: true });
  mkdirSync(join(cwd, 'docs', 'projects'), { recursive: true });

  writeFileSync(join(cwd, 'src', 'server.js'), 'export default {};\n', 'utf8');
  writeFileSync(join(cwd, 'scripts', 'automation-ensure.js'), 'console.log("ok");\n', 'utf8');
  writeFileSync(join(cwd, 'package.json'), '{"name":"watch-test"}\n', 'utf8');
  writeFileSync(join(cwd, 'docs', 'agent-registry.json'), '{}\n', 'utf8');
  writeFileSync(join(cwd, 'docs', 'executor-workers.json'), '{}\n', 'utf8');
  writeFileSync(join(cwd, 'docs', 'executor-routing.json'), '{}\n', 'utf8');
  writeFileSync(join(cwd, 'docs', 'notion-routing.json'), '{}\n', 'utf8');
  writeFileSync(join(cwd, '.env.local'), 'FOO=bar\n', 'utf8');
  writeFileSync(join(cwd, 'docs', 'projects', 'execution.md'), '# runtime doc\n', 'utf8');

  const files = listManagedStackWatchFiles({ cwd });

  assert.match(files.join('\n'), /src\/server\.js/);
  assert.match(files.join('\n'), /scripts\/automation-ensure\.js/);
  assert.match(files.join('\n'), /package\.json/);
  assert.match(files.join('\n'), /docs\/agent-registry\.json/);
  assert.match(files.join('\n'), /docs\/executor-workers\.json/);
  assert.match(files.join('\n'), /docs\/executor-routing\.json/);
  assert.match(files.join('\n'), /docs\/notion-routing\.json/);
  assert.match(files.join('\n'), /\.env\.local/);
  assert.doesNotMatch(files.join('\n'), /docs\/projects\/execution\.md/);
});

test('notion collaboration is fixed to custom_agent and never enables comment polling', () => {
  assert.equal(notionCollaborationMode({}), 'custom_agent');
  assert.equal(notionCollaborationMode({ NOTION_COLLAB_MODE: 'legacy_polling' }), 'custom_agent');
});
