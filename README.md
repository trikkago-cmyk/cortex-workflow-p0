# Cortex Workflow P0

独立于原桌游应用的多 agent / Notion 工作流原型。

这份原型只做一件事：

- 先把 P0 的机器闭环跑通。

当前覆盖：

- 方向对齐阶段的 `Why / Context / What` task brief 入库与查询
- 长程任务 `runs / checkpoints` 入库与查询
- 当前兼容的本地共享 memory 基线：`docs/collaboration-memory.md`
- Memory Compiler v2 架构说明：`docs/cortex-vnext-memory-compiler-architecture.md`
- Memory Extraction 规划：`docs/cortex-vnext-memory-extraction-plan.md`
- 项目级 Notion review panel snapshot / markdown 渲染
- 项目级默认通知路由配置：`notification_channel / notification_target`
- 项目级 Notion review 配置：`notion_review_page_id / notion_parent_page_id`
- 项目级 Notion memory 配置：`notion_memory_page_id`
- 项目级 Notion comment scan 配置：`notion_scan_page_id`
- Notion Custom Agents 主路径说明：`docs/notion-custom-agents-collaboration.md`
- Notion 评论回流入队：`/webhook/notion-comment`
- Notion Custom Agent 事件入口：`/webhook/notion-custom-agent`
- Notion Custom Agent 上下文接口：`/notion/custom-agent/context`
- Codex 可直接写入出站消息：`/webhook/codex-message`
- 企业 IM 指令入队
- 企业 IM 对决策的 `approve / improve / retry / stop` 会同步回写 decision 状态
- 本地 macOS 红灯提醒支持 `立即查看`，可直接跳转到对应 Codex 对话线程
- agent 可按筛选条件轮询并 `claim-next`
- 常驻 `executor worker` 可自动 claim / execute / reply / complete
- `executor worker` 支持按 `agent_name` 路由到不同 webhook handler
- `agent-router` 可把未分配评论二次派单成子 command，并交给 `agent-pm / agent-architect / agent-notion-worker`
- `agent-evaluator` 已接入，负责质量 / 评测 / 异常类评论路由
- 真实 `executor-multi-agent-handler` 已接入，支持 router / pm / architect / evaluator / notion-worker 五类 handler
- 仓内 `panghu-poller` 现在会在发送 handoff 后自动 POST delivery receipt 到 `payload.callback_url`
- multi-agent handler 执行时会自动写 run / checkpoint，review 面板优先展示 checkpoint
- `notion-loop` 仅作为 legacy fallback，可自动做：review sync、memory sync、execution doc sync、项目索引 sync、评论扫描入队
- agent 可直接回复 Notion discussion，并同步收口 command
- Notion 评论支持 `owner_agent` 路由；既不依赖 `@mention`，也兼容 `@mention`
- 评论路由支持四层优先级：评论前缀 > `@mention` 别名 > block/page 路由规则 > 默认 router
- review / execution / project index 的同步默认保留历史，但展示顺序改为倒序：最新在上，旧记录下沉
- review / execution 页面会保留顶部导航区，先看目录，再看最新进展
- review / execution 文档默认采用周会式结构：`当前任务`、`🟢 核心进展`、`风险举手`、`重点 To Do`
- 支持人工收口旧 decision / command，避免 review 面板残留历史脏状态
- `source + idempotency_key` 去重
- command claim / executing / done / ack
- SQLite 持久化，server 重启不丢状态
- HTTP 路由：`/task-briefs`、`/webhook/*`、`/decisions`、`/outbox`、`/commands`
- 执行契约门禁检查
- Notion 评论按“评论 / 回复事件”粒度入队
- 红灯决策告警载荷生成
- `signal_level` 与旧版 `blocking_level` 的兼容归一化

## 目录

- `PROTOCOL.md`
- `src/store.js`
- `src/engine.js`
- `src/server.js`
- `src/panghu-poller.js`
- `src/notion-review-sync.js`
- `src/notion-project-index-sync.js`
- `src/outbox.js`
- `src/adapter.js`
- `src/workflow-engine.js`
- `test/workflow-engine.test.js`
- `test/server.test.js`
- `test/panghu-poller.test.js`
- `test/review-panel.test.js`
- `test/notion-review-sync.test.js`
- `scripts/dev-stack.js`
- `scripts/im-send.js`
- `scripts/im-action.js`
- `scripts/red-decision.js`
- `scripts/local-e2e.js`
- `scripts/roundtrip-e2e.js`
- `scripts/render-review.js`
- `scripts/notion-create-review-page.js`
- `scripts/notion-sync-review.js`
- `scripts/notion-bootstrap.js`
- `scripts/codex-message.js`
- `scripts/claim-next.js`
- `scripts/command-status.js`
- `scripts/decision-status.js`
- `scripts/project-upsert.js`
- `scripts/memory-sync.js`
- `scripts/notion-loop.js`
- `scripts/notion-reply.js`
- `scripts/notion-comment-smoke.js`
- `scripts/notion-sync-execution-doc.js`
- `scripts/notion-sync-project-index.js`
- `src/comment-routing.js`
- `src/executor-worker.js`
- `src/executor-routing.js`
- `src/executor-multi-agent-handler.js`
- `src/executor-webhook-stub.js`
- `docs/notion-routing.json`
- `docs/executor-routing.json`

## 运行

```bash
cd /path/to/cortex-workflow-p0
npm start
```

一键拉起 Cortex + 胖虎本地轮询（legacy）：

```bash
npm run dev:stack
```

如果环境里有 `NOTION_API_KEY`，且显式选择 `NOTION_COLLAB_MODE=legacy_polling`，`dev:stack` 才会自动一起拉起 `notion:loop`。

如果要跑完整协作骨架，默认只需要三条进程：

```bash
npm start
PANGHU_SEND_MODE=http PANGHU_SEND_URL=http://your-im-gateway npm run panghu:poll
NOTION_API_KEY=secret_xxx npm run notion:loop:legacy
```

如果要把 Notion 评论队列自动执行掉，再加一条 executor worker：

```bash
AGENT_NAME=agent-notion-worker \
SOURCE=notion_comment \
NOTION_API_KEY=secret_xxx \
EXECUTOR_MODE=echo \
npm run executor:worker
```

如果要跑真实多 agent handler + 常驻 worker 池，直接用自动化启动器：

```bash
NOTION_API_KEY=ntn_xxx \
NOTION_PROJECT_INDEX_DATABASE_ID=your_db_id \
NOTIFICATION_CHANNEL=hiredcity \
NOTIFICATION_TARGET=your-target@example.com \
npm run automation:start
```

如果你这台机器就是本地 macOS，红灯唤醒现在可以直接走系统通知，不再依赖胖虎 / tunnel：

```bash
LOCAL_NOTIFICATION_ENABLE=1 \
NOTIFICATION_CHANNEL=local_notification \
CORTEX_DEFAULT_CHANNEL=local_notification \
PANGHU_POLL_ENABLE=0 \
npm run automation:start
```

这会额外拉起 `local-notifier`，把 `red decision` 从 outbox 直接投递到 macOS 通知中心。

要把它做成本地开机自启，用 `launchd`，不要用 `systemd`：

```bash
npm run launchd:install
npm run launchd:status
```

`launchd` 安装后会每 15 秒跑一次 `automation:ensure`。
也就是说：

- 登录后自动拉起 Cortex 自动化栈
- 核心进程挂掉后自动补拉
- 配置仍然从项目 `.env.local` / `.env` 读取

如果胖虎真实发送端不在本机，而是在 Red Lobbi / 另一台机器上暴露 HTTP 端点，优先直接切 `http sender`：

```bash
NOTION_API_KEY=ntn_xxx \
NOTION_PROJECT_INDEX_DATABASE_ID=your_db_id \
NOTIFICATION_CHANNEL=hiredcity \
NOTIFICATION_TARGET=your-target@example.com \
PANGHU_SEND_MODE=http \
PANGHU_SEND_URL=http://<red-lobbi-host>:<port>/send-hi \
PANGHU_SEND_TOKEN=your-token \
npm run automation:start
```

或者直接用仓内启动脚本：

```bash
bash scripts/start-red-lobbi-http.sh http://<red-lobbi-host>:<port>/send-hi your-token
```

默认保护：

- `automation:start` 现在默认要求 `panghu-poller` 使用真实 sender
- 如果 `PANGHU_SEND_MODE=stdout|file`，会直接跳过 `panghu-poller`，不会假装“已送达企业 IM”
- 只有两种情况会真的拉起常驻 `panghu-poller`
  - 配了 `PANGHU_SEND_MODE=http` 且有 `PANGHU_SEND_URL`
  - 配了 `PANGHU_SEND_MODE=command` 且有 `PANGHU_SEND_COMMAND`
- 如果你只是本地 smoke，才显式加：

```bash
PANGHU_ALLOW_DRY_RUN=1 npm run automation:start
```

这会起：

- `executor-multi-agent-handler`
- `notion-loop`
- `executor-worker-agent-router`
- `executor-worker-agent-notion-worker`
- `executor-worker-agent-pm`
- `executor-worker-agent-architect`

如果要直接造一条真实 handoff 做 live 验证：

```bash
CORTEX_BASE_URL=http://192.168.0.10:19100 \
CHANNEL=hiredcity \
SESSION_ID=your-target@example.com \
npm run handoff:live -- "请接手这条 live 验证任务，发出后自动回写 delivery receipt"
```

如果要直接看 live handoff 卡在哪一层：

```bash
CORTEX_SERVER_URL=http://127.0.0.1:19100 \
PROJECT_ID=PRJ-cortex-e2e-live \
COMMAND_ID=CMD-20260403-018 \
npm run live:status
```

查看状态：

```bash
npm run automation:status
```

`automation:status` 里会直接显示 `panghu-poller` 的 sender 状态，方便判断当前是 `real sender` 还是 `dry-run`。

如果只是临时托底，才用本地 stub：

```bash
npm run executor:stub
```

默认监听：

```bash
http://127.0.0.1:19100
```

测试：

```bash
npm test
```

真实多 agent 执行链路 live smoke：

```bash
npm run executor:smoke
```

把 review / execution / project index 一次性同步到 Notion：

```bash
NOTION_API_KEY=ntn_xxx NOTION_PROJECT_INDEX_DATABASE_ID=your_db_id npm run notion:sync-all
```

项目索引默认按 checkpoint 去重。
如果当前任务 / 核心进展 / 风险状态 / 下一步没有形成新 checkpoint，`project-index:notion-sync` 会直接跳过，不再新增一行。

如果历史里已经堆出了连续重复 checkpoint，可以直接清理：

```bash
NOTION_API_KEY=ntn_xxx NOTION_PROJECT_INDEX_DATABASE_ID=your_db_id npm run project-index:dedupe
```

如果想自定义数据库位置：

```bash
CORTEX_DB_PATH=/tmp/cortex.db npm start
```

启动胖虎本地轮询：

```bash
cd /path/to/cortex-workflow-p0
PANGHU_SEND_MODE=stdout npm run panghu:poll
```

这条命令仍然允许本地 dry-run。
只有当你显式设置 `PANGHU_REQUIRE_REAL_SENDER=1` 时，`stdout/file` 才会被拒绝。

如果想把“发送结果”落成文件而不是直接打印：

```bash
PANGHU_SEND_MODE=file PANGHU_SEND_FILE=/tmp/panghu-messages.jsonl npm run panghu:poll
```

如果你已经有企业 IM 网关 HTTP 入口，可以直接让胖虎用 `http` 模式发送：

```bash
PANGHU_SEND_MODE=http \
PANGHU_SEND_URL=http://127.0.0.1:3000/panghu/send \
PANGHU_SEND_TOKEN=your-token \
npm run panghu:poll
```

如果这个发送入口其实挂在 Red Lobbi，而不是本机 QClaw/OpenClaw，推荐直接复用同一套 `http sender`，不要再把本地 CLI 当成真实发送端：

```bash
bash scripts/start-red-lobbi-http.sh http://<red-lobbi-host>:<port>/send-hi your-token
```

Codex 直接发一条普通消息到 HiredCity：

```bash
TARGET=your-target@example.com PRIORITY=normal npm run codex:message -- "🟢 普通消息内容"
```

Codex 直接发一条紧急消息到 HiredCity：

```bash
TARGET=your-target@example.com PRIORITY=urgent npm run codex:message -- "🔴 红灯决策需拍板"
```

模拟一条企业 IM 文本消息：

```bash
npm run im:send -- "继续推进胖虎联调"
```

直接造一个红灯决策，观察胖虎 push：

```bash
npm run red:decision -- "是否切换到新的召回链路？" "建议切换，避免下游实现继续漂移。"
```

如果当前默认通知通道是 `local_notification`，这条命令会直接弹本地系统通知，不再要求显式 `session_id`。

如果你只是想验证本地红灯链路已经闭环：

```bash
npm run local:red-smoke
```

如果想直接看 outbox 已发历史，而不是只看 pending：

```bash
curl 'http://127.0.0.1:19100/outbox?status=sent&limit=5'
curl 'http://127.0.0.1:19100/outbox?status=sent&session_id=cli-red@local&limit=5'
```

本地一键闭环联调：

```bash
npm run e2e:local
```

模拟一条企业 IM 按钮 / 动作回流：

```bash
TARGET_ID=DR-20260324-001 npm run im:action -- approve_1 "按推荐方案继续推进"
```

跑一遍“红灯推送 -> 胖虎发送 -> 用户动作回流 -> agent 执行完成”的 round-trip：

```bash
npm run e2e:roundtrip
```

更新项目的 Notion root page 和 review 窗口：

```bash
curl -X POST http://127.0.0.1:19100/projects/upsert \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "PRJ-cortex",
    "root_page_url": "https://www.notion.so/project/cortex-review-page",
    "review_window_note": "每天 11:30 / 18:30 review",
    "notification_channel": "hiredcity",
    "notification_target": "your-target@example.com",
    "notion_parent_page_id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  }'
```

也可以直接用脚本：

```bash
PROJECT_ID=PRJ-cortex \
NOTIFICATION_CHANNEL=hiredcity \
NOTIFICATION_TARGET=your-target@example.com \
NOTION_MEMORY_PAGE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
NOTION_SCAN_PAGE_ID=yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy \
npm run project:upsert
```

项目级默认路由配好后，Codex 普通消息和红灯告警都可以直接复用，不用每次重复传 `channel / target`。
如果要创建红灯决策：

- 企业 IM 通道下，必须提供显式 `session_id`，或者先在项目配置里写好 `notification_target`
- 本地系统通知通道下，不要求 `session_id`

此时 Codex 直接发消息可以只传正文：

```bash
PROJECT_ID=PRJ-cortex PRIORITY=normal npm run codex:message -- "🟢 普通消息内容"
PROJECT_ID=PRJ-cortex PRIORITY=urgent npm run codex:message -- "🔴 红灯决策需拍板"
```

如果要临时覆盖项目默认路由，依然可以显式指定：

```bash
CHANNEL=hiredcity TARGET=your-target@example.com PRIORITY=urgent \
npm run codex:message -- "🔴 临时目标红灯告警"
```

如果要手动把旧红灯或旧命令收口，可以直接调状态更新接口：

```bash
curl -X POST http://127.0.0.1:19100/decisions/update-status \
  -H 'Content-Type: application/json' \
  -d '{
    "decision_id": "DR-20260324-001",
    "status": "archived"
  }'

curl -X POST http://127.0.0.1:19100/commands/update-status \
  -H 'Content-Type: application/json' \
  -d '{
    "command_id": "CMD-20260324-001",
    "status": "done",
    "result_summary": "历史命令已确认完成"
  }'
```

也可以直接用脚本：

```bash
npm run decision:status -- DR-20260324-001 archived
npm run command:status -- CMD-20260324-001 done "历史命令已确认完成"
```

外部 agent 如果要从队列里直接领下一条 Notion 评论任务：

```bash
AGENT_NAME=agent-notion-worker SOURCE=notion_comment npm run command:claim-next
```

如果要让某个 agent 只领分配给自己的评论任务：

```bash
AGENT_NAME=agent-pm SOURCE=notion_comment OWNER_AGENT=agent-pm npm run command:claim-next
```

如果要让 router agent 只捞“还没分配 owner_agent”的评论：

```bash
AGENT_NAME=agent-router SOURCE=notion_comment ONLY_UNASSIGNED=1 npm run command:claim-next
```

外部 agent 如果已经拿到了 Cortex handoff payload，也可以直接把结果回写回来：

```bash
npm run agent:complete -- \
  --handoff-json '{"callback_url":"http://127.0.0.1:19100/webhook/agent-receipt","command_id":"CMD-20260402-008","project_id":"PRJ-cortex","target":"your-target@example.com"}' \
  --agent agent-panghu \
  --signal green \
  --summary "胖虎已完成企业 IM 侧执行" \
  --details "处理了 2 条记录" \
  --metrics-json '{"processed_count":2,"success_count":2}'
```

如果外部 agent 更适合 shell hook，也可以直接吃 handoff payload 里的 `callback_url`：

```bash
CALLBACK_URL="$PAYLOAD_CALLBACK_URL" \
PROJECT_ID="$PAYLOAD_PROJECT_ID" \
TARGET="$PAYLOAD_TARGET" \
SESSION_ID="$PAYLOAD_TARGET" \
bash hooks/task-complete.sh \
  "$PAYLOAD_COMMAND_ID" \
  green \
  "胖虎已完成企业 IM 侧执行" \
  "处理了 2 条记录" \
  '{"processed_count":2,"success_count":2}'
```

## 多 agent Notion 评论路由

不要把 `@agent` 当成主协议。

更稳的做法是把“谁该领这条评论”做成独立路由层：

1. 评论前缀显式指定

```text
[agent: agent-pm] 请把这段 PRD 再收紧
[to: agent-architect] 这一段架构边界再明确
```

2. 路由规则文件隐式指定  
`docs/notion-routing.json` 支持两级映射：

- `blocks.{block_id} -> owner_agent`
- `pages.{page_id} -> owner_agent`

3. 默认 router 兜底  
如果评论既没有显式前缀，也没有命中 block/page 规则，就交给默认 `agent-router`。

当前优先级：

- 评论前缀
- `@mention` 别名
- block 路由
- page 路由
- default router

这样用户在 Notion 里不需要 `@` 某个 agent，只需要：

- 把评论留在某个 agent 负责的执行文档 / block 下
- 或者用 `[agent: xxx]` 前缀显式指定
- 或者直接写 `@codex` / `@pm` / `@architect`

然后对应 agent 轮询自己队列即可。

`docs/notion-routing.json` 现在支持四类配置：

- `aliases.{mention} -> owner_agent`
- `blocks.{block_id} -> owner_agent`
- `pages.{page_id} -> owner_agent`
- `defaults.notion_comment -> owner_agent`

例如：

```json
{
  "aliases": {
    "codex": "agent-notion-worker",
    "pm": "agent-pm"
  },
  "pages": {
    "32d0483f-51e8-8159-9471-f6939fdb68f9": "agent-notion-worker"
  },
  "defaults": {
    "notion_comment": "agent-router"
  }
}
```

## 常驻 Executor Worker

`executor worker` 是多 agent 自动执行层。

它的循环很简单：

1. `claim-next`
2. `start`
3. 调 handler 执行
4. 如果是 Notion comment 且 handler 返回 `reply_text`，就回复同一条 discussion
5. `complete` 或 `failed`

支持两种模式：

- `EXECUTOR_MODE=echo`
- `EXECUTOR_MODE=webhook`
- `EXECUTOR_ROUTING_FILE=./docs/executor-routing.json`

`echo` 适合本地联调：

```bash
AGENT_NAME=agent-notion-worker \
SOURCE=notion_comment \
NOTION_API_KEY=secret_xxx \
EXECUTOR_MODE=echo \
npm run executor:worker
```

`webhook` 适合把命令真正交给外部 agent handler：

```bash
AGENT_NAME=agent-pm \
SOURCE=notion_comment \
OWNER_AGENT=agent-pm \
INCLUDE_UNASSIGNED=1 \
NOTION_API_KEY=secret_xxx \
EXECUTOR_MODE=webhook \
EXECUTOR_ROUTING_FILE=./docs/executor-routing.json \
npm run executor:worker
```

`docs/executor-routing.json` 示例：

```json
{
  "default": {
    "url": "http://127.0.0.1:3010/handle"
  },
  "agents": {
    "agent-notion-worker": {
      "url": "http://127.0.0.1:3010/handle"
    },
    "agent-pm": {
      "url": "http://127.0.0.1:3020/handle",
      "token": "pm-token"
    }
  }
}
```

路由优先级：

- 先匹配 `agents.{agent_name}`
- 再回落到 `default`
- 如果都没有，再回落到 `EXECUTOR_WEBHOOK_URL / EXECUTOR_WEBHOOK_TOKEN`

webhook handler 会收到：

```json
{
  "agent_name": "agent-pm",
  "project_id": "PRJ-cortex",
  "command": {
    "command_id": "CMD-20260325-001",
    "instruction": "请把这段 PRD 再收紧",
    "source": "notion_comment",
    "owner_agent": "agent-pm"
  }
}
```

如果要直接拉起真实多 agent handler + worker 池：

```bash
NOTION_API_KEY=secret_xxx \
NOTION_PROJECT_INDEX_DATABASE_ID=e33fca4a-f7dc-4d79-8c44-9a670a2fc83f \
NOTIFICATION_CHANNEL=hiredcity \
NOTIFICATION_TARGET=your-target@example.com \
npm run automation:start
```

这会同时起：

- `executor-multi-agent-handler`
- `notion-loop`
- `executor-worker-agent-router`
- `executor-worker-agent-notion-worker`
- `executor-worker-agent-pm`
- `executor-worker-agent-architect`

默认会读取 [docs/executor-routing.json](./docs/executor-routing.json)。
其中 router 会处理未分配评论，并通过 `POST /commands/derive` 生成下游子 command。

如果你只是做最小联调，仍然可以先起本地 stub 托底：

```bash
npm run executor:stub
```

如果要直接起多 agent 常驻 worker 池：

```bash
NOTION_API_KEY=secret_xxx \
NOTION_PROJECT_INDEX_DATABASE_ID=e33fca4a-f7dc-4d79-8c44-9a670a2fc83f \
EXECUTOR_ENABLE=1 \
EXECUTOR_POOL_ENABLE=1 \
EXECUTOR_POOL_FILE=./docs/executor-workers.json \
npm run dev:stack
```

`docs/executor-workers.json` 示例：

```json
{
  "defaults": {
    "project_id": "PRJ-cortex",
    "source": "notion_comment",
    "mode": "webhook",
    "poll_interval_ms": 3000,
    "routing_file": "./docs/executor-routing.json"
  },
  "workers": [
    {
      "agent_name": "agent-router",
      "owner_agent": null,
      "only_unassigned": true
    },
    {
      "agent_name": "agent-notion-worker",
      "owner_agent": "agent-notion-worker"
    },
    {
      "agent_name": "agent-pm",
      "owner_agent": "agent-pm"
    }
  ]
}
```

语义：

- `agent-router` 只捞 `owner_agent IS NULL` 的未分配评论
- 其他 worker 只捞自己 `owner_agent` 对应的队列
- routing file 决定每个 agent 命中哪个外部 handler

handler 只需要返回：

```json
{
  "ok": true,
  "status": "done",
  "reply_text": "已处理，我把这一段重新压缩了。",
  "result_summary": "PRD 段落已收紧并回复评论"
}
```

如果要一键验证 “Notion discussion -> Cortex command -> agent reply -> command done” 的闭环：

```bash
NOTION_API_KEY=secret_xxx PROJECT_ID=PRJ-cortex npm run notion:smoke
```

这个 smoke 会创建一条 page-level comment，再显式 ingest 成 `notion_comment` command。
这样做是因为常驻 `notion:loop` 会主动跳过 integration 自己写的评论，避免 agent 自己和自己来回对话。

模拟一条 Notion 评论回流：

```bash
curl -X POST http://127.0.0.1:19100/webhook/notion-comment \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "PRJ-cortex",
    "target_type": "milestone",
    "target_id": "M-20260324-review",
    "page_id": "page-001",
    "discussion_id": "discussion-001",
    "comment_id": "comment-001",
    "body": "[improve: 把红灯事项摘要再压短一点]",
    "context_quote": "旧摘要太长",
    "anchor_block_id": "block-001"
  }'
```

把项目状态渲染成一份可同步到 Notion 的 review markdown：

```bash
npm run review:render
```

如果已经有 Notion API key 和一个专用 review page，可以直接推送：

```bash
NOTION_API_KEY=secret_xxx \
NOTION_REVIEW_PAGE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
npm run review:notion-sync
```

如果 `project.notion_review_page_id` 已经通过 `/projects/upsert` 写入，上面可以省略 `NOTION_REVIEW_PAGE_ID`。

如果还没有专用 review page，可以先在一个 parent page 下自动创建：

```bash
NOTION_API_KEY=secret_xxx \
NOTION_PARENT_PAGE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
npm run review:notion-create-page
```

如果 `project.notion_parent_page_id` 已经写入，上面也可以省略 `NOTION_PARENT_PAGE_ID`。创建成功后，脚本会自动把新的 `notion_review_page_id` 回写到项目配置。

如果你只有一个父页面 / sandbox 页面，希望我直接在下面建完整协作结构：

```bash
NOTION_API_KEY=secret_xxx \
PROJECT_ID=PRJ-cortex \
npm run notion:bootstrap -- "https://www.notion.so/your-parent-page"
```

它会自动创建 3 个子页面：

- `Review Panel`
- `Collaboration Memory`
- `Comment Workspace`

并把它们的 page id 回写到 `PRJ-cortex` 项目配置里。

把本地共享 memory 同步到 Notion memory page：

```bash
NOTION_API_KEY=secret_xxx \
NOTION_MEMORY_PAGE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
npm run memory:notion-sync
```

如果 `project.notion_memory_page_id` 已经写入，上面也可以省略 `NOTION_MEMORY_PAGE_ID`。

启动 Notion 自动循环：

```bash
NOTION_API_KEY=secret_xxx \
PROJECT_ID=PRJ-cortex \
LOOP_INTERVAL_MS=60000 \
npm run notion:loop -- --once
```

如果 memory 页面很大，先保主链路可用，可以临时跳过 memory 同步：

```bash
SKIP_MEMORY_SYNC=1 \
NOTION_API_KEY=secret_xxx \
NOTION_PROJECT_INDEX_DATABASE_ID=e33fca4a-f7dc-4d79-8c44-9a670a2fc83f \
npm run notion:loop -- --once
```

这个 loop 会做五件事：

- 把总览面板静默同步到 dedicated review page
- 把本地 collaboration memory 静默同步到 dedicated memory page
- 把当前执行文档静默同步到 dedicated execution doc page
- 把项目入口写入项目索引表，沉淀根页面 / 总览页 / 执行文档 / 协作记忆四个入口
- 扫描 `notion_scan_page_id` 下的评论，把新评论入队成 `notion_comment` commands

注意：

- `notion_scan_page_id` 应该指向稳定的执行文档 / milestone 文档根页
- 不要把总览页和执行文档页设成同一页
- 总览页回答“是否脱轨 / 现在做到哪 / 哪些点需要你拍板”
- 执行文档页承接具体 milestone 内容，供段落级评论交互
- 正文承载内容本身；反馈、修改意见和下一步任务写在 Notion comment / discussion 里
- agent 轮询扫描的是 Notion 评论，不是正文里的“待办指令”
- 如果希望 loop 自动维护项目索引，再补一个 `NOTION_PROJECT_INDEX_DATABASE_ID`
- 如果 memory 页面过大导致同步慢，可以先加 `SKIP_MEMORY_SYNC=1` 保评论扫描和 append 历史链路继续在线
- Review page 需要单写者同步；不要并发跑 `notion:loop` 和 `review:notion-sync`
- Notion API 偶发 `ECONNRESET / 429` 时，同步层会自动重试，不需要手工重跑第一时间介入

把当前 milestone 执行文档同步到 Notion：

```bash
NOTION_API_KEY=secret_xxx \
PROJECT_ID=PRJ-cortex \
npm run execution:notion-sync
```

把项目入口同步到项目索引数据库：

```bash
NOTION_API_KEY=secret_xxx \
PROJECT_ID=PRJ-cortex \
NOTION_PROJECT_INDEX_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
npm run project-index:notion-sync
```

agent 处理完一条 Notion 评论任务后，可以直接回复原 discussion：

```bash
NOTION_API_KEY=secret_xxx \
npm run notion:reply -- CMD-20260324-002 "已按你的评论修改，新的版本已经同步。"
```

直接创建一份方向对齐任务简报：

```bash
curl -X POST http://127.0.0.1:19100/task-briefs \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "PRJ-cortex",
    "title": "Cortex P0 执行内核",
    "why": "先把执行中枢内核跑通，避免方案只停留在文档层。",
    "context": "OpenClaw 企业 IM 已跑通，本地 Cortex 已具备 SQLite 持久化和 outbox。",
    "what": "交付可本地联调的服务，验证 IM 入站、红灯推送和胖虎 ack。"
  }'
```

仅跑 smoke：

```bash
npm run smoke
```

## 这版为什么单独放目录

- 不影响原有桌游应用的依赖和构建链
- 可以先独立验证规则，再决定接到企业 IM、Notion API 还是正式服务端
- 后面如果要拆成独立服务，迁移成本最低
