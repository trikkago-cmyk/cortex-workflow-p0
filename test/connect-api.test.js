import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getConnectAgent, listConnectAgents, onboardConnectAgent, verifyConnectAgent } from '../src/connect-api.js';

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

test('listConnectAgents merges registry aliases and executor route state', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-connect-api-list-'));
  const agentRegistryFile = join(cwd, 'agent-registry.json');
  const notionRoutingFile = join(cwd, 'notion-routing.json');
  const executorRoutingFile = join(cwd, 'executor-routing.json');

  writeJson(agentRegistryFile, {
    defaults: {
      project_id: 'PRJ-cortex',
    },
    agents: [
      {
        agent_name: 'agent-panghu',
        handler_kind: 'external_webhook',
        webhook_url: 'http://127.0.0.1:4010/webhook',
        owner_agent: 'agent-panghu',
      },
    ],
  });
  writeJson(notionRoutingFile, {
    aliases: {
      panghu: 'agent-panghu',
      胖虎: 'agent-panghu',
    },
  });
  writeJson(executorRoutingFile, {
    agents: {
      'agent-panghu': {
        url: 'http://127.0.0.1:4010/webhook',
      },
    },
  });

  const result = listConnectAgents({
    agentRegistryFile,
    notionRoutingFile,
    executorRoutingFile,
  });

  assert.equal(result.agents.length, 1);
  assert.equal(result.agents[0].agentName, 'agent-panghu');
  assert.deepEqual(new Set(result.agents[0].aliases), new Set(['panghu', '胖虎']));
  assert.equal(result.agents[0].effectiveRoute?.url, 'http://127.0.0.1:4010/webhook');
  assert.equal(result.agents[0].status, 'ready');
});

test('onboardConnectAgent writes all three config files and returns connect snapshot', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-connect-api-create-'));
  const agentRegistryFile = join(cwd, 'agent-registry.json');
  const notionRoutingFile = join(cwd, 'notion-routing.json');
  const executorRoutingFile = join(cwd, 'executor-routing.json');

  const result = onboardConnectAgent(
    {
      agent_name: 'agent-search',
      aliases: ['search', '@insight'],
      webhook_url: 'http://127.0.0.1:4020/handle',
      webhook_token: 'secret-token',
      target_type: 'page',
      channel: 'notion',
    },
    {
      agentRegistryFile,
      notionRoutingFile,
      executorRoutingFile,
    },
  );

  assert.equal(result.agent.agentName, 'agent-search');
  assert.deepEqual(result.agent.aliases, ['insight', 'search']);
  assert.equal(result.agent.targetType, 'page');
  assert.equal(result.agent.channel, 'notion');
  assert.equal(result.agent.webhookTokenConfigured, true);

  const detail = getConnectAgent('agent-search', {
    agentRegistryFile,
    notionRoutingFile,
    executorRoutingFile,
  });
  assert.equal(detail.agent.status, 'ready');
  assert.equal(detail.agent.effectiveRoute?.url, 'http://127.0.0.1:4020/handle');
});

test('onboardConnectAgent supports codex resume metadata in extra env', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-connect-api-codex-resume-'));
  const agentRegistryFile = join(cwd, 'agent-registry.json');
  const notionRoutingFile = join(cwd, 'notion-routing.json');
  const executorRoutingFile = join(cwd, 'executor-routing.json');

  const result = onboardConnectAgent(
    {
      agent_name: 'agent-dark-luxury-itinerary',
      aliases: ['darkluxury', '路书'],
      webhook_url: 'http://127.0.0.1:3010/handle/agent-dark-luxury-itinerary',
      handler_kind: 'codex_resume',
      codex_session_id: '019d4ce1-a379-7c72-8edd-9c62e566014a',
      codex_thread_name: 'Dark Luxury Travel Itinerary',
    },
    {
      agentRegistryFile,
      notionRoutingFile,
      executorRoutingFile,
    },
  );

  assert.equal(result.agent.agentName, 'agent-dark-luxury-itinerary');
  assert.equal(result.agent.handlerKind, 'codex_resume');
  assert.equal(result.agent.codexSessionId, '019d4ce1-a379-7c72-8edd-9c62e566014a');
  assert.equal(result.agent.codexThreadName, 'Dark Luxury Travel Itinerary');
  assert.deepEqual(new Set(result.agent.aliases), new Set(['darkluxury', '路书']));
  assert.equal(result.agent.status, 'ready');
});

test('verifyConnectAgent can perform network health check', async (t) => {
  const healthServer = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false }));
  });

  await new Promise((resolve) => healthServer.listen(0, '127.0.0.1', resolve));
  t.after(() => healthServer.close());

  const port = healthServer.address().port;
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-connect-api-verify-'));
  const agentRegistryFile = join(cwd, 'agent-registry.json');
  const notionRoutingFile = join(cwd, 'notion-routing.json');
  const executorRoutingFile = join(cwd, 'executor-routing.json');

  writeJson(agentRegistryFile, {
    defaults: {},
    agents: [
      {
        agent_name: 'agent-health',
        handler_kind: 'external_webhook',
        webhook_url: `http://127.0.0.1:${port}/handle`,
      },
    ],
  });
  writeJson(notionRoutingFile, {
    aliases: {
      health: 'agent-health',
    },
  });
  writeJson(executorRoutingFile, {
    agents: {
      'agent-health': {
        url: `http://127.0.0.1:${port}/handle`,
      },
    },
  });

  const result = await verifyConnectAgent('agent-health', {
    agentRegistryFile,
    notionRoutingFile,
    executorRoutingFile,
    network: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.healthUrl, `http://127.0.0.1:${port}/health`);
  assert.equal(result.checks.find((item) => item.name === 'network_health')?.status, 'pass');
});
