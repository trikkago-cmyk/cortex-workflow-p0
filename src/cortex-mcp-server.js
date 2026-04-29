import { fileURLToPath, pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import * as z from 'zod/v4';

const DEFAULT_CORTEX_BASE_URL = 'http://127.0.0.1:19100';
const DEFAULT_PROJECT_ID = 'PRJ-cortex';
const DEFAULT_MCP_PORT = 19101;
const DEFAULT_MCP_HOST = '127.0.0.1';

class CortexHttpError extends Error {
  constructor(message, { status, payload, url }) {
    super(message);
    this.name = 'CortexHttpError';
    this.status = status;
    this.payload = payload;
    this.url = url;
  }
}

function compactObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeBaseUrl(baseUrl = DEFAULT_CORTEX_BASE_URL) {
  return String(baseUrl || DEFAULT_CORTEX_BASE_URL).replace(/\/+$/, '');
}

export function createJsonToolResult(payload, { isError = false } = {}) {
  return {
    isError,
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

export async function requestCortexJson({ baseUrl = DEFAULT_CORTEX_BASE_URL, path, method = 'GET', body }) {
  const url = new URL(path, `${normalizeBaseUrl(baseUrl)}/`);
  const headers = {
    Accept: 'application/json',
  };
  const request = {
    method,
    headers,
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    request.body = JSON.stringify(compactObject(body));
  }

  const response = await fetch(url, request);
  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    throw new CortexHttpError(`Cortex API returned HTTP ${response.status}`, {
      status: response.status,
      payload,
      url: url.toString(),
    });
  }

  return payload;
}

async function runTool(handler) {
  try {
    return createJsonToolResult(await handler());
  } catch (error) {
    const payload = {
      ok: false,
      error: error.message,
      status: error.status || null,
      url: error.url || null,
      payload: error.payload || null,
    };
    return createJsonToolResult(payload, { isError: true });
  }
}

const createdBySchema = z
  .object({
    id: z.string().optional(),
    type: z.string().optional(),
    name: z.string().optional(),
  })
  .passthrough()
  .optional();

const decisionContextSchema = z
  .object({
    question: z.string().optional(),
    context: z.string().optional(),
    options: z.array(z.string()).optional(),
    recommendation: z.string().optional(),
    recommended_option: z.string().optional(),
    recommendedOption: z.string().optional(),
    why_now: z.string().optional(),
    whyNow: z.string().optional(),
    impact_scope: z.string().optional(),
    impactScope: z.string().optional(),
    irreversible: z.boolean().optional(),
    downstream_contamination: z.boolean().optional(),
    downstreamContamination: z.boolean().optional(),
    evidence_refs: z.array(z.string()).optional(),
    requested_human_action: z.string().optional(),
    requestedHumanAction: z.string().optional(),
    due_at: z.string().optional(),
    dueAt: z.string().optional(),
    signal_level: z.enum(['green', 'yellow', 'red']).optional(),
    signalLevel: z.enum(['green', 'yellow', 'red']).optional(),
  })
  .passthrough()
  .optional();

export function createCortexToolHandlers({ baseUrl = DEFAULT_CORTEX_BASE_URL } = {}) {
  const resolvedBaseUrl = normalizeBaseUrl(baseUrl);

  return {
    getCortexContext(args = {}) {
      const projectId = args.project_id || DEFAULT_PROJECT_ID;
      return requestCortexJson({
        baseUrl: resolvedBaseUrl,
        path: `/notion/custom-agent/context?project_id=${encodeURIComponent(projectId)}`,
      });
    },

    ingestNotionComment(args = {}) {
      return requestCortexJson({
        baseUrl: resolvedBaseUrl,
        path: '/webhook/notion-custom-agent',
        method: 'POST',
        body: {
          ...args,
          project_id: args.project_id || DEFAULT_PROJECT_ID,
        },
      });
    },

    claimNextCommand(args = {}) {
      return requestCortexJson({
        baseUrl: resolvedBaseUrl,
        path: '/commands/claim-next',
        method: 'POST',
        body: {
          ...args,
          project_id: args.project_id || DEFAULT_PROJECT_ID,
        },
      });
    },

    submitAgentReceipt(args = {}) {
      return requestCortexJson({
        baseUrl: resolvedBaseUrl,
        path: '/webhook/agent-receipt',
        method: 'POST',
        body: {
          ...args,
          project_id: args.project_id || DEFAULT_PROJECT_ID,
        },
      });
    },
  };
}

export function createCortexMcpServer({ baseUrl = DEFAULT_CORTEX_BASE_URL } = {}) {
  const handlers = createCortexToolHandlers({ baseUrl });
  const server = new McpServer(
    {
      name: 'cortex-custom-agent',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.registerTool(
    'get_cortex_context',
    {
      description:
        'Read the current Cortex project collaboration context, async contract, decision policy, scope guard, and memory/project status for a Notion Custom Agent.',
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe(`Cortex project id. Defaults to ${DEFAULT_PROJECT_ID}.`),
      },
    },
    async (args) => runTool(() => handlers.getCortexContext(args)),
  );

  server.registerTool(
    'ingest_notion_comment',
    {
      description:
        'Send a Notion page/comment event into Cortex. Cortex will return command, decision_request, or ignored with loop/scope guard details.',
      inputSchema: {
        project_id: z.string().optional().describe(`Cortex project id. Defaults to ${DEFAULT_PROJECT_ID}.`),
        page_id: z.string().describe('Notion page id where the event happened.'),
        discussion_id: z.string().describe('Notion discussion id for the comment thread.'),
        comment_id: z.string().describe('Notion comment id. Use a stable id for idempotency.'),
        body: z.string().describe('Human instruction or review comment body.'),
        target_type: z.string().optional().describe('Optional target type, for example page_comment or block_comment.'),
        target_id: z.string().optional().describe('Optional Notion block/page id for the exact target.'),
        context_quote: z.string().optional().describe('Relevant quoted page text around the comment.'),
        anchor_block_id: z.string().optional().describe('Optional Notion block id anchoring the discussion.'),
        invoked_agent: z.string().optional().describe('Notion Custom Agent display name, for example Cortex Router.'),
        owner_agent: z.string().optional().describe('Cortex owner agent to assign the command/decision to.'),
        route_to: z.string().optional().describe('Alias for owner_agent when the human routes to a specific agent.'),
        source_url: z.string().optional().describe('Stable Notion source URL for traceability.'),
        self_authored: z.boolean().optional().describe('Set true for agent-authored comments to prevent feedback loops.'),
        page_ancestry_ids: z.array(z.string()).optional().describe('Ancestor page ids for project scope validation.'),
        created_by: createdBySchema.describe('Notion actor metadata when available.'),
        actor_id: z.string().optional().describe('Notion actor id when available.'),
        invoked_agent_actor_id: z.string().optional().describe('Notion actor id for this Custom Agent when available.'),
        signal_level: z.enum(['green', 'yellow', 'red']).optional().describe('Optional explicit decision level.'),
        signalLevel: z.enum(['green', 'yellow', 'red']).optional().describe('CamelCase alias for signal_level.'),
        question: z.string().optional().describe('Decision question when this event should create a decision request.'),
        options: z.array(z.string()).optional().describe('Decision options.'),
        recommendation: z.string().optional().describe('Agent recommendation for the decision.'),
        recommended_option: z.string().optional().describe('Recommended option id/text.'),
        why_now: z.string().optional().describe('Why this decision is needed now.'),
        impact_scope: z.string().optional().describe('Impact scope, for example module or cross_module.'),
        irreversible: z.boolean().optional().describe('Whether the choice is hard to reverse.'),
        downstream_contamination: z.boolean().optional().describe('Whether a wrong choice may pollute downstream work.'),
        evidence_refs: z.array(z.string()).optional().describe('Evidence references for review/audit.'),
        requested_human_action: z.string().optional().describe('What the human should decide or confirm.'),
        due_at: z.string().optional().describe('Optional decision due date/time.'),
        decision_context: decisionContextSchema.describe('Structured yellow/red decision context.'),
      },
    },
    async (args) => runTool(() => handlers.ingestNotionComment(args)),
  );

  server.registerTool(
    'claim_next_command',
    {
      description:
        'Let a Notion Custom Agent or downstream agent claim the next Cortex command assigned to it, then continue execution.',
      inputSchema: {
        project_id: z.string().optional().describe(`Cortex project id. Defaults to ${DEFAULT_PROJECT_ID}.`),
        agent_name: z.string().describe('Agent name claiming work, for example agent-router.'),
        owner_agent: z.string().optional().describe('Only claim commands owned by this Cortex agent.'),
        source: z.string().optional().describe('Optional command source filter.'),
        target_type: z.string().optional().describe('Optional target type filter.'),
        channel: z.string().optional().describe('Optional channel filter.'),
        include_unassigned: z.boolean().optional().describe('Allow claiming unassigned commands.'),
        only_unassigned: z.boolean().optional().describe('Only claim unassigned commands.'),
      },
    },
    async (args) => runTool(() => handlers.claimNextCommand(args)),
  );

  server.registerTool(
    'submit_agent_receipt',
    {
      description:
        'Submit progress, completion, failure, or red/yellow signal receipt for a Cortex command. Cortex stores the receipt and may create decisions/checkpoints.',
      inputSchema: {
        project_id: z.string().optional().describe(`Cortex project id. Defaults to ${DEFAULT_PROJECT_ID}.`),
        command_id: z.string().describe('Cortex command id.'),
        agent_name: z.string().describe('Agent submitting the receipt.'),
        status: z
          .enum(['delivered', 'completed', 'failed', 'acknowledged', 'read'])
          .describe('Receipt status.'),
        receipt_type: z.enum(['result', 'status_update', 'alert', 'heartbeat']).optional(),
        summary: z.string().optional().describe('Short summary.'),
        result_summary: z.string().optional().describe('Human-readable result summary.'),
        details: z.string().optional().describe('Optional detailed notes.'),
        next_step: z.string().optional().describe('Optional next step.'),
        reply_text: z.string().optional().describe('Suggested Notion discussion reply text.'),
        signal: z.enum(['green', 'yellow', 'red']).optional().describe('Optional signal level.'),
        signal_level: z.enum(['green', 'yellow', 'red']).optional().describe('Optional signal level alias.'),
        channel: z.string().optional().describe('Optional reply/notification channel if Cortex cannot infer it.'),
        target: z.string().optional().describe('Optional reply/notification target if Cortex cannot infer it.'),
        idempotency_key: z.string().optional().describe('Stable key to prevent duplicate receipts.'),
        payload: z.record(z.string(), z.unknown()).optional().describe('Additional structured payload.'),
        decision_context: decisionContextSchema.describe('Structured context for yellow/red follow-up decisions.'),
      },
    },
    async (args) => runTool(() => handlers.submitAgentReceipt(args)),
  );

  return server;
}

export function createCortexMcpApp({
  baseUrl = process.env.CORTEX_BASE_URL || DEFAULT_CORTEX_BASE_URL,
  host = process.env.CORTEX_MCP_HOST || DEFAULT_MCP_HOST,
  allowedHosts = parseList(process.env.CORTEX_MCP_ALLOWED_HOSTS),
  bearerToken = process.env.CORTEX_MCP_BEARER_TOKEN || '',
} = {}) {
  const appOptions = {
    host,
  };

  if (allowedHosts.length > 0) {
    appOptions.allowedHosts = allowedHosts;
  }

  const app = createMcpExpressApp(appOptions);

  app.use((req, res, next) => {
    if (!bearerToken) {
      next();
      return;
    }

    const expected = `Bearer ${bearerToken}`;
    if (req.header('authorization') === expected) {
      next();
      return;
    }

    res.status(401).json({
      ok: false,
      error: 'Unauthorized',
    });
  });

  app.get('/health', (_req, res) => {
    res.status(200).json({
      ok: true,
      service: 'cortex-custom-agent-mcp',
      cortex_base_url: normalizeBaseUrl(baseUrl),
      mcp_endpoint: '/mcp',
    });
  });

  app.post('/mcp', async (req, res) => {
    const server = createCortexMcpServer({ baseUrl });

    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);

      res.on('close', () => {
        transport.close();
        server.close();
      });
    } catch (error) {
      console.error('Error handling Cortex MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  app.get('/mcp', (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed. Use Streamable HTTP JSON-RPC POST requests.',
      },
      id: null,
    });
  });

  app.delete('/mcp', (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    });
  });

  return app;
}

export function startCortexMcpServer({
  port = Number(process.env.CORTEX_MCP_PORT || DEFAULT_MCP_PORT),
  host = process.env.CORTEX_MCP_HOST || DEFAULT_MCP_HOST,
  baseUrl = process.env.CORTEX_BASE_URL || DEFAULT_CORTEX_BASE_URL,
  bearerToken = process.env.CORTEX_MCP_BEARER_TOKEN || '',
} = {}) {
  const app = createCortexMcpApp({ baseUrl, host, bearerToken });
  const server = app.listen(port, host, (error) => {
    if (error) {
      console.error('Failed to start Cortex MCP server:', error);
      process.exit(1);
    }
    console.log(`Cortex Custom Agent MCP listening on http://${host}:${port}/mcp`);
    console.log(`Forwarding tools to Cortex API at ${normalizeBaseUrl(baseUrl)}`);
  });

  return { app, server };
}

const entrypoint = process.argv[1] ? pathToFileURL(fileURLToPath(pathToFileURL(process.argv[1]))).href : '';

if (entrypoint && import.meta.url === entrypoint) {
  const runtime = startCortexMcpServer();

  process.on('SIGINT', () => {
    runtime.server.close(() => process.exit(0));
  });
}
