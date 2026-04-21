import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { onboardExternalAgent } from '../src/agent-onboarding.js';

test('onboardExternalAgent updates registry, notion routing, and executor routing together', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-agent-onboarding-'));
  const agentRegistryFile = join(cwd, 'agent-registry.json');
  const notionRoutingFile = join(cwd, 'notion-routing.json');
  const executorRoutingFile = join(cwd, 'executor-routing.json');

  const result = onboardExternalAgent({
    agentRegistryFile,
    notionRoutingFile,
    executorRoutingFile,
    agentName: 'agent-search',
    aliases: ['search', '@insight'],
    webhookUrl: 'http://127.0.0.1:4010/handle',
    webhookToken: 'token-123',
    extraEnv: {
      CODEX_SESSION_ID: 'session-123',
    },
  });

  assert.equal(result.agentName, 'agent-search');
  assert.deepEqual(result.aliases, ['search', 'insight']);

  const registry = JSON.parse(readFileSync(agentRegistryFile, 'utf8'));
  assert.equal(registry.agents.length, 1);
  assert.equal(registry.agents[0].agent_name, 'agent-search');
  assert.equal(registry.agents[0].owner_agent, 'agent-search');
  assert.equal(registry.agents[0].webhook_url, 'http://127.0.0.1:4010/handle');
  assert.equal(registry.agents[0].extra_env.CODEX_SESSION_ID, 'session-123');

  const notionRouting = JSON.parse(readFileSync(notionRoutingFile, 'utf8'));
  assert.equal(notionRouting.aliases.search, 'agent-search');
  assert.equal(notionRouting.aliases.insight, 'agent-search');

  const executorRouting = JSON.parse(readFileSync(executorRoutingFile, 'utf8'));
  assert.equal(executorRouting.agents['agent-search'].url, 'http://127.0.0.1:4010/handle');
  assert.equal(executorRouting.agents['agent-search'].token, 'token-123');
});
