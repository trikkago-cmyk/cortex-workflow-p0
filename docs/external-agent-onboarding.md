# 外部 Agent 接入 Cortex

目标：

- 让其他工程里的 agent 复用同一套 `Notion 评论 -> Cortex -> agent 执行 -> 原 discussion 回帖` 工作流
- 支持长任务用 `handoff + receipt` 双向回执，不要求所有 agent 都同步阻塞执行
- 不手改多份 JSON
- 接入动作尽量收敛成一次注册

## Connect API

除了脚本注册，现在也可以直接走 Cortex 的 Connect API。

### 1. 查看当前已接入 agent

```bash
curl http://127.0.0.1:19100/connect/agents
```

查看单个 agent：

```bash
curl http://127.0.0.1:19100/connect/agents/agent-panghu
```

返回里会带：

- `aliases`
- `status`
- `issues / warnings`
- `registry_route / executor_route / effective_route`

### 2. 通过 API 做 onboarding

```bash
curl -X POST http://127.0.0.1:19100/connect/agents \
  -H 'Content-Type: application/json' \
  -d '{
    "agent_name": "agent-search",
    "aliases": ["search", "insight"],
    "webhook_url": "http://127.0.0.1:4010/handle",
    "webhook_token": "token-123",
    "project_id": "PRJ-cortex",
    "source": "notion_comment",
    "mode": "webhook"
  }'
```

这条请求会同时更新：

- `docs/agent-registry.json`
- `docs/notion-routing.json`
- `docs/executor-routing.json`

### 3. 校验接入状态

只做配置校验：

```bash
curl -X POST http://127.0.0.1:19100/connect/agents/agent-search/verify \
  -H 'Content-Type: application/json' \
  -d '{"network": false}'
```

连同健康检查一起校验：

```bash
curl -X POST http://127.0.0.1:19100/connect/agents/agent-search/verify \
  -H 'Content-Type: application/json' \
  -d '{"network": true}'
```

默认会尝试探测同源 `/health`。
如果你的 webhook 不在同一个服务上，可以显式传：

```json
{
  "network": true,
  "health_url": "http://127.0.0.1:4010/health"
}
```

## 最小接入条件

外部 agent 至少要满足两件事：

- 能接收一条 webhook 命令
- 能按 Cortex 约定回写 `status / reply_text / result_summary`

推荐分两种模式接入。

## 模式 A：同步 webhook 模式

适合：

- 任务能在一次 HTTP 请求里很快做完
- handler 可以同步返回结果
- 不需要先转交到企业 IM 或别的外部系统

当前最小输入协议：

```json
{
  "agent_name": "agent-search",
  "project_id": "PRJ-cortex",
  "command": {
    "command_id": "CMD-20260401-001",
    "instruction": "@search 帮我整理竞品资料",
    "source": "notion_comment",
    "owner_agent": "agent-search",
    "source_url": "notion://page/..."
  }
}
```

当前最小输出协议：

```json
{
  "ok": true,
  "status": "done",
  "reply_text": "已处理，这一轮竞品整理已开始。",
  "result_summary": "agent-search accepted command and started execution"
}
```

语义：

- Cortex 会把这次返回直接视为命令完成
- 如果原命令来自 Notion 评论，`reply_text` 会直接回到原 discussion

## 模式 B：handoff + receipt 双向回执模式

适合：

- agent 实际运行在企业 IM、外部工作流或长期任务系统里
- 当前 HTTP 请求只负责“接单 / 转交”，不能代表真正完成
- 希望先把任务发出去，完成后再异步回写结果

推荐做法：

1. 把 agent 注册到 Cortex
2. 让 Cortex 先把任务转成交接消息
3. 外部 agent 完成后，再调用 `POST /webhook/agent-receipt`

胖虎就是这个模式。

注册示例：

```bash
npm run agent:register -- \
  --agent agent-panghu \
  --alias panghu,胖虎 \
  --webhook http://127.0.0.1:19100/webhook/codex-message
```

当 worker 把命令投给上面的 webhook 时，Cortex 会自动进入 handoff bridge 模式，并返回：

```json
{
  "ok": true,
  "status": "done",
  "reply_text": "已转交给 agent-panghu，后续由企业 IM 侧继续执行。",
  "result_summary": "forwarded command CMD-20260402-008 via codex-message bridge",
  "callback_url": "http://127.0.0.1:19100/webhook/agent-receipt"
}
```

同时，发给企业 IM 的 outbox payload 里会带：

```json
{
  "kind": "external_agent_handoff",
  "handoff_agent": "agent-panghu",
  "command_id": "CMD-20260402-008",
  "project_id": "PRJ-cortex",
  "source": "notion_comment",
  "source_url": "notion://page/xxx?discussionId=yyy",
  "callback_url": "http://127.0.0.1:19100/webhook/agent-receipt"
}
```

外部 agent 完成后，回执示例：

```bash
npm run agent:receipt -- \
  --command CMD-20260402-008 \
  --agent agent-panghu \
  --status completed \
  --type result \
  --signal green \
  --channel hiredcity \
  --target your-target@example.com \
  --idempotency panghu-CMD-20260402-008-result-001 \
  --payload-json '{"summary":"胖虎已完成企业 IM 侧执行，并返回处理结果。"}' \
  --summary "胖虎已完成企业 IM 侧执行，并返回处理结果。" \
  --reply "胖虎已完成这条任务，结果已回写到 Cortex。" \
  --next "如果需要，可以继续派发下一条任务给胖虎。"
```

如果外部 agent 更适合“少拼字段、少组 payload”的接法，也可以直接发轻量回执：

```bash
curl -X POST http://127.0.0.1:19100/webhook/agent-receipt \
  -H 'Content-Type: application/json' \
  -d '{
    "commandId": "CMD-20260402-044",
    "agentName": "agent-panghu",
    "status": "success",
    "receiptType": "result",
    "summary": "外部 agent 已完成当前任务",
    "details": "处理了 2 条记录",
    "metrics": {"processed_count": 2, "success_count": 2},
    "signalLevel": "green",
    "channel": "hiredcity",
    "target": "your-target@example.com",
    "sessionId": "your-target@example.com",
    "idempotencyKey": "agent-panghu-CMD-20260402-044-result-001"
  }'
```

这条轻量格式已经在 live `19100` 环境真机验证通过。

如果外部 agent 本身已经拿到了完整 handoff payload，也可以直接调用：

```bash
npm run agent:complete -- \
  --handoff-json '{"callback_url":"http://127.0.0.1:19100/webhook/agent-receipt","command_id":"CMD-20260402-008","project_id":"PRJ-cortex","target":"your-target@example.com"}' \
  --agent agent-panghu \
  --signal green \
  --summary "胖虎已完成企业 IM 侧执行" \
  --details "处理了 2 条记录" \
  --metrics-json '{"processed_count":2,"success_count":2}'
```

如果外部 agent 已经拿到了 handoff payload 里的 `callback_url`，也可以直接复用仓库内置 hook：

```bash
CALLBACK_URL="$PAYLOAD_CALLBACK_URL" \
PROJECT_ID="$PAYLOAD_PROJECT_ID" \
TARGET="$PAYLOAD_TARGET" \
SESSION_ID="$PAYLOAD_TARGET" \
AGENT_NAME="agent-panghu" \
bash hooks/task-complete.sh \
  "$PAYLOAD_COMMAND_ID" \
  green \
  "胖虎已完成企业 IM 侧执行" \
  "处理了 2 条记录" \
  '{"processed_count":2,"success_count":2}'
```

这条路径的好处是：

- 不需要外部 agent 自己拼 `/webhook/agent-receipt`
- handoff 指向哪个 Cortex 环境，就回写到哪个环境
- 更适合多环境、多项目同时跑

补充：

- 如果不是默认本地 `19100`，要在 bridge 请求里显式传 `callback_base_url`
- 或者给 Cortex 进程配置 `CORTEX_BASE_URL`
- 否则 handoff 里的 `callback_url` 会默认落到 `http://127.0.0.1:19100/webhook/agent-receipt`

回执效果：

- 新增 1 条 `agent_receipts` 持久化记录
- 更新原 command 的 `result_summary`
- 更新 `receipt_count / last_receipt_at`
- 新增 1 条 checkpoint
- 如果原任务来自 Notion 评论，自动回到原 discussion
- 如果 `signal=red` 且 payload 里带 `decision_context`，自动升级成 red decision

## 一键注册

```bash
npm run agent:register -- \
  --agent agent-search \
  --alias search \
  --webhook http://127.0.0.1:4010/handle
```

这条命令会同时更新：

- `docs/agent-registry.json`
- `docs/notion-routing.json`
- `docs/executor-routing.json`

注册完成后：

- 你可以在 Notion 评论里直接写 `@search`
- automation 重启后会自动拉起 `executor-worker-agent-search`
- 该 worker 会把命令转发到你配置的 webhook
- 如果是双向回执模式，真正完成结果要靠 `POST /webhook/agent-receipt` 收口

## 多别名

```bash
npm run agent:register -- \
  --agent agent-search \
  --alias search,insight,competitive \
  --webhook http://127.0.0.1:4010/handle
```

## 带 token 的 webhook

```bash
npm run agent:register -- \
  --agent agent-search \
  --alias search \
  --webhook http://127.0.0.1:4010/handle \
  --token your-bearer-token
```

## 注册后生效

```bash
npm run automation:ensure
```

如果 stack 没起，它会补拉。
如果 stack 掉了，它会补拉。
如果 `cortex-server` 活着但不健康，它会整栈重启。

## 当前边界

- 外部 agent 接入后，评论路由、Commands、回帖、Review 收口都能复用
- 同步 webhook 模式更简单，适合短任务
- `handoff + receipt` 模式更适合企业 IM / 长任务 / 多系统协作
- 如果要支持更复杂的角色语义，例如专属 `planner / evaluator` 自动产出结构化 checkpoint，需要 agent 自己在 webhook handler 里遵守这套结果协议，或继续扩展 Cortex 内建 handler
