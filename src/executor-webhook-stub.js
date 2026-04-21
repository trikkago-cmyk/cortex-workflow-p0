import http from 'node:http';
import { createExecutorActionHandler } from './executor-command-actions.js';

function compact(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizeInstruction(text, maxLength = 80) {
  const normalized = compact(text);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

export function buildExecutorStubResult({ agentName, command }) {
  const instruction = summarizeInstruction(command?.instruction);
  const parsedAction = String(command?.parsed_action || '').trim().toLowerCase();
  const source = String(command?.source || '').trim();
  const targetName = agentName || 'agent';

  const actionLabel = (() => {
    if (parsedAction === 'continue') return '已继续推进';
    if (parsedAction === 'improve') return '已按评论调整';
    if (parsedAction === 'retry') return '已重新执行';
    if (parsedAction === 'stop') return '已停止当前步骤';
    return '已接收并处理';
  })();

  const resultSummary = `${targetName} handled ${source || 'command'}: ${instruction || 'empty instruction'}`;
  if (source !== 'notion_comment') {
    return {
      ok: true,
      status: 'done',
      result_summary: resultSummary,
    };
  }

  return {
    ok: true,
    status: 'done',
    reply_text: `${actionLabel}。当前处理点：${instruction || '未提供指令正文'}。`,
    result_summary: resultSummary,
  };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

export function createExecutorWebhookStub(options = {}) {
  const logger = options.logger || console;
  const actionHandler =
    options.actionExecutor ||
    (options.enableActions || process.env.EXECUTOR_ACTION_ENABLE === '1'
      ? createExecutorActionHandler({
          cwd: options.cwd || process.cwd(),
          env: options.env,
          syncPreferencesFile: options.syncPreferencesFile || process.env.NOTION_SYNC_PREFERENCES_FILE,
        })
      : null);

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        return sendJson(res, 200, { ok: true, service: 'executor-webhook-stub' });
      }

      if (req.method === 'POST' && req.url === '/handle') {
        const body = await readJsonBody(req);
        const result =
          (actionHandler
            ? await actionHandler({
                agentName: body.agent_name,
                projectId: body.project_id,
                command: body.command || {},
              })
            : null) ||
          buildExecutorStubResult({
            agentName: body.agent_name,
            command: body.command || {},
          });
        logger.info?.(
          `[executor-stub] handled ${body.command?.command_id || 'unknown-command'} for ${body.agent_name || 'unknown-agent'}`,
        );
        return sendJson(res, 200, result);
      }

      return sendJson(res, 404, { ok: false, error: 'not_found' });
    } catch (error) {
      logger.error?.('[executor-stub] request failed', error);
      return sendJson(res, 500, {
        ok: false,
        error: String(error?.message || error),
      });
    }
  });

  return {
    server,
    close() {
      return new Promise((resolvePromise, rejectPromise) => {
        server.close((error) => {
          if (error) {
            rejectPromise(error);
            return;
          }
          resolvePromise();
        });
      });
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.EXECUTOR_WEBHOOK_PORT || 3010);
  const host = process.env.EXECUTOR_WEBHOOK_HOST || '127.0.0.1';
  const app = createExecutorWebhookStub();

  app.server.listen(port, host, () => {
    console.log(`executor-webhook-stub listening on http://${host}:${port}`);
  });

  process.on('SIGINT', async () => {
    await app.close().catch(() => {});
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await app.close().catch(() => {});
    process.exit(0);
  });
}
