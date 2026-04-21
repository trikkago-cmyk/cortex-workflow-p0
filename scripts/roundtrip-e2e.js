import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

async function waitForHealth(baseUrl, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Timed out waiting for ${baseUrl}/health`);
}

async function postJson(baseUrl, pathname, payload) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok || body.ok === false) {
    throw new Error(`POST ${pathname} failed: ${JSON.stringify(body)}`);
  }
  return body;
}

async function getJson(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const body = await response.json();
  if (!response.ok || body.ok === false) {
    throw new Error(`GET ${pathname} failed: ${JSON.stringify(body)}`);
  }
  return body;
}

async function waitUntil(baseUrl, predicate, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate(baseUrl);
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error('Timed out waiting for expected state');
}

async function main() {
  const sandboxDir = mkdtempSync(join(tmpdir(), 'cortex-roundtrip-e2e-'));
  const dbPath = join(sandboxDir, 'cortex.db');
  const sentFile = join(sandboxDir, 'panghu-sent.jsonl');
  const baseUrl = 'http://127.0.0.1:19104';

  const server = spawn('node', ['src/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: '19104',
      CORTEX_DB_PATH: dbPath,
    },
    stdio: 'inherit',
  });

  try {
    await waitForHealth(baseUrl);

    const decision = await postJson(baseUrl, '/decisions', {
      project_id: 'PRJ-cortex',
      signal_level: 'red',
      question: '是否按推荐方案继续推进 Cortex P0？',
      options: ['approve_1', 'stop'],
      recommendation: '建议 approve_1，继续推进 round-trip 联调。',
      why_now: '当前可以直接验证红灯消息出站后再入站的完整链路。',
      impact_scope: 'module',
      session_id: 'your-user@corp',
    });

    const poller = spawn('node', ['src/panghu-poller.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CORTEX_BASE_URL: baseUrl,
        PANGHU_SEND_MODE: 'file',
        PANGHU_SEND_FILE: sentFile,
        PANGHU_POLL_INTERVAL_MS: '250',
      },
      stdio: 'inherit',
    });

    try {
      await waitUntil(baseUrl, async (currentBaseUrl) => {
        const outbox = await getJson(currentBaseUrl, '/outbox');
        return outbox.pending.length === 0 ? outbox : null;
      });

      const sentMessages = readFileSync(sentFile, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));

      if (sentMessages.length === 0) {
        throw new Error('Expected panghu to send at least one red alert message');
      }

      const reply = await postJson(baseUrl, '/webhook/im-action', {
        project_id: 'PRJ-cortex',
        target_type: 'decision',
        target_id: decision.decision.decision_id,
        action: 'approve_1',
        instruction: '按推荐方案继续推进',
        session_id: 'your-user@corp',
        message_id: 'msg-roundtrip-approve-001',
        user_id: 'your-user@corp',
      });

      await postJson(baseUrl, '/commands/claim', {
        command_id: reply.commandId,
        agent_name: 'agent-router',
      });

      await postJson(baseUrl, '/commands/start', {
        command_id: reply.commandId,
        agent_name: 'agent-router',
      });

      const completed = await postJson(baseUrl, '/commands/complete', {
        command_id: reply.commandId,
        agent_name: 'agent-router',
        result_summary: '已收到 approve_1，按推荐方案继续推进。',
      });

      const commands = await getJson(baseUrl, '/commands?project_id=PRJ-cortex');

      console.log('\n=== ROUNDTRIP E2E SUMMARY ===');
      console.log(
        JSON.stringify(
          {
            decisionId: decision.decision.decision_id,
            sentMessages: sentMessages.length,
            replyCommandId: reply.commandId,
            replyCommandStatus: completed.command.status,
            latestCommandSource: commands.commands[0]?.source,
            latestCommandTargetId: commands.commands[0]?.target_id,
          },
          null,
          2,
        ),
      );
    } finally {
      poller.kill('SIGTERM');
      await once(poller, 'exit').catch(() => {});
    }
  } finally {
    server.kill('SIGTERM');
    await once(server, 'exit').catch(() => {});
    rmSync(sandboxDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
