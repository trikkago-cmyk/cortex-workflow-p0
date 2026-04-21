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

async function main() {
  const sandboxDir = mkdtempSync(join(tmpdir(), 'cortex-local-e2e-'));
  const dbPath = join(sandboxDir, 'cortex.db');
  const sentFile = join(sandboxDir, 'panghu-sent.jsonl');
  const baseUrl = 'http://127.0.0.1:19103';

  const server = spawn('node', ['src/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: '19103',
      CORTEX_DB_PATH: dbPath,
    },
    stdio: 'inherit',
  });

  try {
    await waitForHealth(baseUrl);

    const brief = await postJson(baseUrl, '/task-briefs', {
      project_id: 'PRJ-cortex',
      title: 'Cortex P0 执行内核',
      why: '需要先把执行中枢内核跑通，再把 Notion review 面板和多 agent 协作接回主链路。',
      context: '当前 OpenClaw 企业 IM 对话流已跑通，Cortex 已具备命令、决策、出站 outbox 与 SQLite 持久化。',
      what: '交付可本地联调的 P0 服务，验证 IM 入站、红灯推送、胖虎轮询 ack 和幂等行为。',
      owner_agent: 'agent-router',
      session_id: 'your-user@corp',
      target_type: 'milestone',
      target_id: 'M-20260324-p0',
    });

    const message = await postJson(baseUrl, '/webhook/im-message', {
      project_id: 'PRJ-cortex',
      target_type: 'milestone',
      target_id: 'M-20260324-p0',
      text: '继续推进胖虎轮询联调',
      session_id: 'your-user@corp',
      message_id: 'msg-e2e-001',
      user_id: 'your-user@corp',
    });

    const decision = await postJson(baseUrl, '/decisions', {
      project_id: 'PRJ-cortex',
      signal_level: 'red',
      question: '是否切换到新的召回链路？',
      options: ['保持现状', '切换新链路'],
      recommendation: '建议切换新链路，避免下游实现继续漂移。',
      why_now: '当前节点已经没有其他安全可推进工作。',
      impact_scope: 'cross_module',
      downstream_contamination: true,
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
      const deadline = Date.now() + 8000;
      let outbox = await getJson(baseUrl, '/outbox');

      while (Date.now() < deadline && outbox.pending.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        outbox = await getJson(baseUrl, '/outbox');
      }

      if (outbox.pending.length > 0) {
        throw new Error('Outbox still has pending messages after polling window');
      }

      const commands = await getJson(baseUrl, '/commands?project_id=PRJ-cortex');
      const briefs = await getJson(baseUrl, '/task-briefs?project_id=PRJ-cortex');
      const syncDecisions = await getJson(baseUrl, '/sync-decisions?project_id=PRJ-cortex');
      const sentMessages = readFileSync(sentFile, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));

      console.log('\n=== LOCAL E2E SUMMARY ===');
      console.log(JSON.stringify(
        {
          briefId: brief.brief.brief_id,
          commandId: message.commandId,
          decisionId: decision.decision.decision_id,
          briefs: briefs.briefs.length,
          commands: commands.commands.length,
          redDecisions: syncDecisions.decisions.length,
          sentMessages: sentMessages.length,
          lastSentPreview: sentMessages.at(-1)?.text,
        },
        null,
        2,
      ));
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
