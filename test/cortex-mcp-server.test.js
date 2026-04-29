import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema, ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { createCortexServer } from '../src/server.js';
import { createCortexMcpApp, createCortexToolHandlers, normalizeBaseUrl } from '../src/cortex-mcp-server.js';

async function listen(serverOrApp, host = '127.0.0.1') {
  await new Promise((resolve) => serverOrApp.listen(0, host, resolve));
  return `http://${host}:${serverOrApp.address().port}`;
}

function parseToolJson(result) {
  assert.equal(result.content[0].type, 'text');
  return JSON.parse(result.content[0].text);
}

test('normalizes Cortex base URLs for MCP forwarding', () => {
  assert.equal(normalizeBaseUrl('http://127.0.0.1:19100///'), 'http://127.0.0.1:19100');
  assert.equal(normalizeBaseUrl(''), 'http://127.0.0.1:19100');
});

test('Cortex MCP handlers forward Custom Agent events into the existing Cortex API', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-mcp-handler-'));
  const cortex = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-27T09:00:00.000Z'),
  });

  const baseUrl = await listen(cortex.server);
  t.after(() => cortex.close());

  const handlers = createCortexToolHandlers({ baseUrl });
  const context = await handlers.getCortexContext({ project_id: 'PRJ-cortex' });

  assert.equal(context.ok, true);
  assert.equal(context.collaboration_mode, 'custom_agent');
  assert.equal(context.async_contract.ingress_webhook, '/webhook/notion-custom-agent');

  const green = await handlers.ingestNotionComment({
    project_id: 'PRJ-cortex',
    page_id: 'page-mcp-001',
    discussion_id: 'discussion-mcp-001',
    comment_id: 'comment-mcp-001',
    body: '@Cortex Router 请继续推进 Custom Agent MCP 接入。',
    invoked_agent: 'Cortex Router',
    owner_agent: 'agent-router',
    source_url: 'notion://page/page-mcp-001/discussion/discussion-mcp-001/comment/comment-mcp-001',
  });

  assert.equal(green.ok, true);
  assert.equal(green.workflow_path, 'command');
  assert.match(green.command_id, /^CMD-/);

  const claim = await handlers.claimNextCommand({
    project_id: 'PRJ-cortex',
    agent_name: 'agent-router',
    owner_agent: 'agent-router',
  });

  assert.equal(claim.ok, true);
  assert.equal(claim.command.command_id, green.command_id);
});

test('Cortex MCP Streamable HTTP server exposes Notion Custom Agent tools', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-mcp-http-'));
  const cortex = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-27T09:10:00.000Z'),
  });

  const cortexBaseUrl = await listen(cortex.server);
  t.after(() => cortex.close());

  const app = createCortexMcpApp({ baseUrl: cortexBaseUrl });
  const mcpServer = await new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
  t.after(() => mcpServer.close());

  const mcpUrl = new URL(`http://127.0.0.1:${mcpServer.address().port}/mcp`);
  const client = new Client(
    {
      name: 'cortex-mcp-test-client',
      version: '0.1.0',
    },
    {
      capabilities: {},
    },
  );
  const transport = new StreamableHTTPClientTransport(mcpUrl);
  t.after(async () => {
    await transport.close();
  });

  await client.connect(transport);

  const tools = await client.request({ method: 'tools/list', params: {} }, ListToolsResultSchema);
  assert.deepEqual(
    tools.tools.map((tool) => tool.name).sort(),
    ['claim_next_command', 'get_cortex_context', 'ingest_notion_comment', 'submit_agent_receipt'].sort(),
  );

  const contextResult = await client.request(
    {
      method: 'tools/call',
      params: {
        name: 'get_cortex_context',
        arguments: {
          project_id: 'PRJ-cortex',
        },
      },
    },
    CallToolResultSchema,
  );
  const context = parseToolJson(contextResult);

  assert.equal(context.ok, true);
  assert.equal(context.collaborationMode, 'custom_agent');

  const eventResult = await client.request(
    {
      method: 'tools/call',
      params: {
        name: 'ingest_notion_comment',
        arguments: {
          project_id: 'PRJ-cortex',
          page_id: 'page-mcp-002',
          discussion_id: 'discussion-mcp-002',
          comment_id: 'comment-mcp-002',
          body: '@Cortex Router 请把这条评论变成命令。',
          invoked_agent: 'Cortex Router',
          owner_agent: 'agent-router',
          source_url: 'notion://page/page-mcp-002/discussion/discussion-mcp-002/comment/comment-mcp-002',
        },
      },
    },
    CallToolResultSchema,
  );
  const event = parseToolJson(eventResult);

  assert.equal(event.ok, true);
  assert.equal(event.workflowPath, 'command');
  assert.match(event.commandId, /^CMD-/);
});

test('Cortex MCP server can require a bearer token before exposing tools', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-mcp-auth-'));
  const cortex = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
  });

  const cortexBaseUrl = await listen(cortex.server);
  t.after(() => cortex.close());

  const app = createCortexMcpApp({
    baseUrl: cortexBaseUrl,
    bearerToken: 'test-secret',
  });
  const mcpServer = await new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
  t.after(() => mcpServer.close());

  const baseUrl = `http://127.0.0.1:${mcpServer.address().port}`;
  const unauthorized = await fetch(`${baseUrl}/health`);
  assert.equal(unauthorized.status, 401);

  const authorized = await fetch(`${baseUrl}/health`, {
    headers: {
      Authorization: 'Bearer test-secret',
    },
  });
  assert.equal(authorized.status, 200);
  assert.equal((await authorized.json()).service, 'cortex-custom-agent-mcp');
});
