import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCustomAgentSetupBundle,
  normalizePublicMcpUrl,
  redactToken,
} from '../src/custom-agent-setup-bundle.js';

test('normalizePublicMcpUrl only accepts https URLs', () => {
  assert.equal(normalizePublicMcpUrl('https://example.com/mcp'), 'https://example.com/mcp');
  assert.equal(normalizePublicMcpUrl('http://127.0.0.1:19101/mcp'), null);
  assert.equal(normalizePublicMcpUrl(''), null);
});

test('redactToken keeps only preview fragments', () => {
  assert.equal(redactToken('abcdef1234567890'), 'abcdef...567890');
});

test('buildCustomAgentSetupBundle reports action_required when public MCP URL is missing', () => {
  const bundle = buildCustomAgentSetupBundle({
    projectId: 'PRJ-cortex',
    project: {
      root_page_url: 'https://www.notion.so/34a359ec3ad4805fba9ed8e669018c0d',
    },
    localMcpHealth: {
      ok: true,
      service: 'cortex-custom-agent-mcp',
      mcp_endpoint: '/mcp',
    },
    cortexContext: {
      ok: true,
      collaboration_mode: 'custom_agent',
      async_contract: {
        scope_guard: {
          configured_page_ids: ['34a359ec3ad4805fba9ed8e669018c0d'],
        },
      },
    },
    publicMcpUrl: '',
    bearerToken: 'abcdef1234567890',
    allowedHosts: ['localhost'],
  });

  assert.equal(bundle.ok, false);
  assert.equal(bundle.status, 'action_required');
  assert.ok(bundle.blockers.includes('public_mcp_url_missing'));
  assert.equal(bundle.auth.required, true);
});

test('buildCustomAgentSetupBundle reports ready_for_notion_setup when local runtime and public URL are ready', () => {
  const bundle = buildCustomAgentSetupBundle({
    projectId: 'PRJ-cortex',
    project: {
      root_page_url: 'https://www.notion.so/34a359ec3ad4805fba9ed8e669018c0d',
      notion_memory_page_id: '34b359ec-3ad4-81c0-b00b-c1183b91c8e9',
    },
    localMcpHealth: {
      ok: true,
      service: 'cortex-custom-agent-mcp',
      mcp_endpoint: '/mcp',
    },
    cortexContext: {
      ok: true,
      collaboration_mode: 'custom_agent',
      async_contract: {
        scope_guard: {
          configured_page_ids: ['34a359ec3ad4805fba9ed8e669018c0d'],
        },
      },
    },
    publicMcpUrl: 'https://example.com/mcp',
    bearerToken: '',
    allowedHosts: [],
  });

  assert.equal(bundle.ok, true);
  assert.equal(bundle.status, 'ready_for_notion_setup');
  assert.equal(bundle.public_mcp_url, 'https://example.com/mcp');
  assert.equal(bundle.auth.required, false);
});
