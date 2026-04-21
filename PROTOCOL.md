# Cortex P0 交互协议 v0.4

这份文档是 `cortex-workflow-p0` 当前的对接真相源。

目标只有一个：

- 先把企业 IM ↔ Cortex Server ↔ SQLite 的 P0 闭环跑通

当前不再把 Notion mirror 作为 P0 主链路的一部分。P0 的机器真相以本地 SQLite 为准；Notion 只保留为后续 review 面板能力。

---

## 0. 运行边界

- Cortex server 运行在 `http://127.0.0.1:19100`
- 胖虎是网关 agent，负责企业 IM 与 Cortex server 的中转
- 所有状态持久化在 SQLite，server 重启不丢状态
- 所有“可执行指令”必须先落为 Commands 记录，再被 agent claim
- 所有“主动通知”必须先落为 outbox 记录，再由胖虎发送
- 项目 review 面板由 Cortex 基于 SQLite 真相源实时渲染；Notion 只负责展示和评论交互
- Notion 中的 review / execution / index 更新默认保留历史，不做整页覆盖式重写
- 展示顺序默认倒序：最新记录在上，旧记录自然下沉
- review / execution 页面顶部保留固定导航 scaffold，避免新记录把目录顶掉
- review / execution 文档默认采用周会式结构：`当前任务`、`🟢 核心进展`、`风险举手`、`重点 To Do`
- 外部长期执行 agent 支持 `handoff + receipt` 双向回执模式：先转交，再异步回执结果
- 仓内 `panghu-poller` 默认会在 handoff 发送成功后自动补一条 `status=delivered` 的 delivery receipt
- `automation:start` 默认只会拉起“真实 sender”版本的 `panghu-poller`；若当前只是 `stdout/file` dry-run，会直接跳过，不把 dry-run ack 误当成真实企业 IM 送达

---

## 1. 规范术语

### 1.1 决策信号

P0 的规范字段是 `signal_level`：

- `green`: 低风险且不阻塞，直接做，只写本地状态
- `yellow`: 阻塞但不紧急，先挂起当前节点，继续做别的，只写本地状态
- `red`: 阻塞且紧急，或高风险异常，必须立即推送到企业 IM

### 1.2 旧字段兼容

为了兼容仍在使用旧术语的网关或脚本，P0 接受旧字段 `blocking_level`，并按下面规则归一化：

- `Sync -> red`
- `Async -> yellow`

兼容规则：

- 入站请求可以传 `signal_level` 或 `blocking_level`
- 服务端内部统一归一化为 `signal_level`
- 如需兼容旧调用方，响应里可以保留 `blocking_level` 映射值
- 同一条 red 决策若因重试再次命中幂等键，不得重复写出站消息

### 1.3 指令正文

入站文本消息使用 `text`，服务端落库时统一写入 Commands 的 `instruction` 字段。

---

## 2. 数据对象约定

### 2.1 Commands

Commands 是唯一可执行入口。

关键字段：

- `command_id`
- `project_id`
- `target_type`
- `target_id`
- `parsed_action`
- `instruction`
- `source`
- `status`
- `claimed_by`
- `ack`
- `channel_session_id`
- `channel_message_id`
- `operator_id`
- `idempotency_key`

### 2.2 Decision Requests

Decision Requests 只承载需要显式记录的黄灯/红灯事项。

关键字段：

- `decision_id`
- `project_id`
- `signal_level`
- `status`
- `question`
- `options`
- `recommendation`
- `why_now`
- `impact_scope`
- `irreversible`
- `downstream_contamination`
- `escalate_after`
- `idempotency_key`

建议：

- `green` 一般不需要单独创建 Decision Request
- `yellow` 默认 `status=proposed`
- `red` 默认 `status=needs_review`

### 2.3 Task Briefs

Task Briefs 是方向对齐阶段的正式对象。

目标：

- 把任务的 `Why / Context / What` 显式持久化
- 让人类先对齐方向，再进入细节执行阶段
- 为后续 review、multi-agent 继承和 memory 引用提供稳定入口

关键字段：

- `brief_id`
- `project_id`
- `title`
- `why`
- `context`
- `what`
- `status`
- `owner_agent`
- `source`
- `channel_session_id`
- `target_type`
- `target_id`
- `idempotency_key`

当前建议：

- 新建 brief 默认 `status=draft`
- 方向确认后，后续可演进为 `aligned`
- 同一任务简报的幂等判断以 `project_id + idempotency_key` 为准

### 2.4 Outbox

Outbox 是唯一主动发消息出口。

关键字段：

- `id`
- `channel`
- `session_id`
- `chat_id`
- `text`
- `priority`
- `payload`
- `status`
- `created_at`
- `sent_at`
- `error`

状态最小集合：

- `pending`
- `sent`
- `failed`

优先级：

- `urgent`
- `normal`

---

## 3. 入站协议

## 3.1 任务简报入站

`POST /task-briefs`

`Content-Type: application/json`

请求体：

```json
{
  "project_id": "PRJ-cortex",
  "title": "Cortex P0 执行内核",
  "why": "先把执行中枢内核跑通，避免方案只停留在文档层。",
  "context": "企业 IM 已跑通，当前已有 Commands / Decisions / Outbox / SQLite。",
  "what": "交付可本地联调的执行中枢服务，验证 IM 入站、红灯推送和胖虎 ack。",
  "status": "draft",
  "owner_agent": "agent-router",
  "session_id": "your-user@corp",
  "target_type": "milestone",
  "target_id": "M-20260324-p0"
}
```

字段要求：

- `why` 必填
- `context` 必填
- `what` 必填
- `title` 可选，不传时服务端会从 `what` 自动生成摘要标题

响应：

```json
{
  "ok": true,
  "isDuplicate": false,
  "brief": {
    "brief_id": "TB-20260324-001",
    "project_id": "PRJ-cortex",
    "title": "Cortex P0 执行内核",
    "why": "...",
    "context": "...",
    "what": "...",
    "status": "draft"
  }
}
```

## 3.2 文本消息入站

`POST /webhook/im-message`

`Content-Type: application/json`

请求体：

```json
{
  "project_id": "PRJ-cortex",
  "target_type": "milestone",
  "target_id": "M-20260323-p0",
  "text": "继续推进 P0 数据流梳理",
  "session_id": "your-user@...",
  "message_id": "msg_xxx",
  "user_id": "your-user@..."
}
```

字段要求：

- `text` 必填
- `session_id` 必填
- `message_id` 必填
- `project_id` 可选，默认 `PRJ-cortex`
- `target_type` / `target_id` 可选

服务端归一化：

- `text -> instruction`
- `session_id -> channel_session_id`
- `message_id -> channel_message_id`
- `source = openclaw_im_message`
- `channel = enterprise_im`
- `idempotency_key = im_message:<session_id>:<message_id>`

响应：

```json
{
  "ok": true,
  "commandId": "CMD-20260323-001",
  "isDuplicate": false
}
```

## 3.3 卡片 / 按钮动作入站

`POST /webhook/im-action`

`Content-Type: application/json`

请求体：

```json
{
  "project_id": "PRJ-cortex",
  "target_type": "decision",
  "target_id": "DR-20260323-001",
  "action": "approve_1",
  "instruction": "按推荐方案推进",
  "session_id": "your-user@...",
  "message_id": "msg_btn_xxx",
  "user_id": "your-user@..."
}
```

字段要求：

- `action` 必填
- `session_id` 必填
- `message_id` 必填

服务端归一化：

- `source = openclaw_im_action`
- `channel = enterprise_im`
- `event_key = action`
- `instruction = instruction || action`
- `idempotency_key = im_action:<message_id>:<action>`
- 若 `target_type=decision` 且 `target_id` 存在，会同步更新对应 Decision Request 的状态
- 状态映射：
  - `approve* / continue -> approved`
  - `improve* / clarify -> changes_requested`
  - `retry -> retry_requested`
  - `stop -> stopped`

响应：

```json
{
  "ok": true,
  "commandId": "CMD-20260323-002",
  "isDuplicate": false
}
```

## 3.4 幂等规则

- 同一份 task brief 不得重复生成多条 Task Brief 记录
- 同一条文本消息不得重复生成多条 Commands
- 同一条按钮动作不得重复生成多条 Commands
- Task Brief 的幂等判断以 `project_id + idempotency_key` 为准
- Commands 的幂等判断以 `source + idempotency_key` 为准

## 3.5 Notion 评论入站

`POST /webhook/notion-comment`

`Content-Type: application/json`

请求体：

```json
{
  "project_id": "PRJ-cortex",
  "target_type": "milestone",
  "target_id": "M-20260324-review",
  "page_id": "page-001",
  "discussion_id": "discussion-001",
  "comment_id": "comment-001",
  "body": "@codex [improve: 把红灯事项摘要再压短一点]",
  "owner_agent": "agent-notion-worker",
  "context_quote": "旧摘要太长",
  "anchor_block_id": "block-001",
  "source_url": "https://www.notion.so/..."
}
```

字段要求：

- `page_id` 必填
- `discussion_id` 必填
- `comment_id` 必填
- `body` 必填
- `owner_agent` 可选；如果调用方已经完成路由判断，可以直接显式传入

服务端归一化：

- `source = notion_comment`
- `channel = notion`
- `instruction` 会自动剥掉 `[improve: ...]` 这类前缀，只保留真实指令
- `idempotency_key = comment:<discussion_id>:<comment_id>`

### 3.5.1 Notion 评论路由优先级

如果评论来自 Notion 自动扫描链路，推荐先在扫描侧完成路由判断，再调用 `/webhook/notion-comment`。

当前约定的优先级：

1. 评论前缀：`[agent: agent-pm]` / `[to: agent-architect]`
2. `@mention` 别名：`@codex` / `@pm`
3. block 路由规则
4. page 路由规则
5. 默认 router

推荐把别名配置到 `docs/notion-routing.json`：

```json
{
  "aliases": {
    "codex": "agent-notion-worker",
    "pm": "agent-pm",
    "architect": "agent-architect"
  }
}
```

响应：

```json
{
  "ok": true,
  "commandId": "CMD-20260324-001",
  "isDuplicate": false
}
```

## 3.6 项目配置入站

`POST /projects/upsert`

用于给项目写入 review / 通知默认配置，让项目自身成为路由真相源。

请求体：

```json
{
  "project_id": "PRJ-cortex",
  "root_page_url": "https://www.notion.so/project/cortex-review-page",
  "review_window_note": "每天 11:30 / 18:30 review",
  "notification_channel": "hiredcity",
  "notification_target": "your-target@example.com",
  "notion_review_page_id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "notion_parent_page_id": "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"
}
```

字段说明：

- `notification_channel` / `notification_target`: 项目默认企业 IM 通知路由
- `notion_review_page_id`: 项目 review 面板对应的 Notion page
- `notion_parent_page_id`: 自动创建 review page 时使用的父页面
- `notion_memory_page_id`: 本地 collaboration memory 对应的 Notion page
- `notion_scan_page_id`: agent 轮询评论的稳定项目文档根页
- 以上字段都可选，但一旦配置，后续 Codex 消息和红灯告警都可以直接复用

## 3.7 Codex 消息入站

`POST /webhook/codex-message`

`Content-Type: application/json`

请求体：

```json
{
  "project_id": "PRJ-cortex",
  "text": "🔴 红灯决策需拍板",
  "priority": "urgent"
}
```

字段要求：

- `text` 必填
- `channel` 可选；不传时回退到 `project.notification_channel`，再回退到服务默认 channel
- `target` 可选；不传时回退到 `project.notification_target`
- `priority` 可选：`normal | urgent`，默认 `normal`

服务端行为：

- 直接写入 outbox，不经过 commands
- `target` 映射到 outbox 的 `session_id`
- 若请求体未传 `channel / target`，则优先使用项目默认路由
- `priority=urgent` 会在胖虎轮询时优先出队

响应：

```json
{
  "ok": true,
  "project_id": "PRJ-cortex",
  "outbox_id": 12,
  "priority": "urgent",
  "status": "pending"
}
```

### 3.7.1 外部 agent handoff bridge

如果请求体里包含 `command` 对象，`/webhook/codex-message` 会进入 handoff bridge 模式。

请求体：

```json
{
  "agent_name": "agent-panghu",
  "project_id": "PRJ-cortex",
  "channel": "hiredcity",
  "target": "your-target@example.com",
  "priority": "normal",
  "command": {
    "command_id": "CMD-20260402-008",
    "project_id": "PRJ-cortex",
    "instruction": "@胖虎 帮我接手这个任务，完成后把结果回写到这条评论里。",
    "source": "notion_comment",
    "source_url": "notion://page/xxx?discussionId=yyy",
    "owner_agent": "agent-panghu"
  }
}
```

服务端行为：

- 自动生成一条企业 IM 可读的 handoff 文本
- 写入一条 outbox `pending` 消息
- 在 outbox `payload` 中附带回执所需元信息
- 同步返回 `reply_text / result_summary`，用于当前 worker 收口

当前 payload 约定：

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

响应：

```json
{
  "ok": true,
  "status": "done",
  "reply_text": "已转交给 agent-panghu，后续由企业 IM 侧继续执行。",
  "result_summary": "forwarded command CMD-20260402-008 via codex-message bridge",
  "project_id": "PRJ-cortex",
  "outbox_id": 32,
  "priority": "normal",
  "status_code": "pending",
  "callback_url": "http://127.0.0.1:19100/webhook/agent-receipt"
}
```

语义：

- 这一步只表示“已成功转交”
- 真正执行完成，要由外部 agent 再调 `POST /webhook/agent-receipt`

## 3.8 外部 Agent 回执入站

`POST /webhook/agent-receipt`

`Content-Type: application/json`

请求体：

```json
{
  "command_id": "CMD-20260402-008",
  "agent_name": "agent-panghu",
  "status": "completed",
  "receipt_type": "result",
  "session_id": "your-target@example.com",
  "channel": "hiredcity",
  "target": "your-target@example.com",
  "payload": {
    "summary": "胖虎已完成企业 IM 侧执行，并返回处理结果。"
  },
  "signal": "green",
  "result_summary": "胖虎已完成企业 IM 侧执行，并返回处理结果。",
  "reply_text": "胖虎已完成这条任务，结果已回写到 Cortex。",
  "next_step": "如果需要，可以继续派发下一条任务给胖虎。",
  "quality_grade": "pass",
  "anomaly_level": "low",
  "idempotency_key": "panghu-CMD-20260402-008-result-001"
}
```

字段要求：

- `command_id` 必填
- `agent_name` 必填
- `status` 推荐显式传；规范值为 `delivered | completed | failed | acknowledged | read`
- `receipt_type` 推荐显式传；规范值为 `result | status_update | alert | heartbeat`
- `channel / target` 推荐显式传；不传时服务端会尽量从 command 或 project 默认路由补齐
- `signal` 或 `signal_level` 可选；不传时服务端会按 status / receipt_type 推断
- `reply_text` 可选；仅当原命令来源是 `notion_comment` 且能解析到 discussion 时，才会自动回帖
- `idempotency_key` 强烈建议传；服务端会按它做 receipt 去重

服务端行为：

- 记录 1 条 `agent_receipts` 持久化记录
- 更新原 command 的 `status / result_summary / ack / receipt_count / last_receipt_at`
- 生成 1 条 checkpoint，作为执行留痕
- 若满足 Notion 评论条件，则自动回到原 discussion
- 若 `signal=red` 且 payload 里带 `decision_context`，会自动升级成 red decision 并走 outbox 告警
- 若传 `idempotency_key`，重复请求会直接返回 `already_recorded`

响应：

```json
{
  "ok": true,
  "receipt_id": "RCP-20260402-001",
  "command_id": "CMD-20260402-008",
  "command_status": "done",
  "recorded_at": 1775116800,
  "receipt_count": 1,
  "receipt": {
    "receipt_id": "RCP-20260402-001",
    "status": "completed",
    "receipt_type": "result",
    "signal": "green"
  },
  "command": {
    "command_id": "CMD-20260402-008",
    "status": "done",
    "ack": "ack:CMD-20260402-008",
    "result_summary": "胖虎已完成企业 IM 侧执行，并返回处理结果。",
    "receipt_count": 1
  },
  "checkpoint": {
    "checkpoint_id": "CP-20260402-001",
    "signal_level": "green",
    "stage": "execute",
    "status": "passed"
  },
  "reply_id": "3360483f-51e8-81e1-92a0-001d8617dbe5"
}
```

幂等命中响应：

```json
{
  "ok": true,
  "receipt_id": "RCP-20260402-001",
  "command_id": "CMD-20260402-008",
  "status": "already_recorded",
  "recorded_at": 1775116800,
  "idempotency_key": "panghu-CMD-20260402-008-result-001"
}
```

## 3.9 Receipt 查询接口

`GET /receipts?command_id=CMD-20260402-008`

或：

`GET /receipts?project_id=PRJ-cortex&status=failed&limit=20`

响应：

```json
{
  "ok": true,
  "receipts": [
    {
      "receipt_id": "RCP-20260402-001",
      "command_id": "CMD-20260402-008",
      "status": "completed",
      "receipt_type": "result",
      "signal": "green",
      "channel": "hiredcity",
      "target": "your-target@example.com",
      "created_at": 1775116800
    }
  ]
}
```

---

## 4. 出站协议

P0 中 Cortex 不直接发企业 IM，而是统一写入 outbox。

链路：

- Cortex 写入 outbox，状态为 `pending`
- 胖虎轮询 `/outbox`
- 胖虎调用企业 IM SDK 发送
- 发送成功后回调 `/outbox/ack`
- 发送失败后回调 `/outbox/fail`

出队顺序：

- `urgent` 优先于 `normal`
- 同优先级内按 `created_at ASC`

胖虎本地实现建议：

- 轮询器进程独立运行
- 先用 `stdout` 或 `file` sender 跑通
- 真接企业 IM 时，只替换发送器，不改 Cortex 协议

当前发送器模式：

- `stdout`: 调试输出
- `file`: 写 jsonl 文件，便于本地联调
- `command`: 调用本地命令，适合接已有 OpenClaw / 企业 IM 发送脚本
- `http`: POST 到一个网关 URL，适合接已有企业 IM 服务

## 4.1 查询待发送消息

`GET /outbox`

如果要查已发送或失败历史：

`GET /outbox?status=sent&limit=20`

或：

`GET /outbox?status=failed&session_id=your-target@example.com&limit=20`

响应：

```json
{
  "ok": true,
  "pending": [
    {
      "id": 1,
      "channel": "hiredcity",
      "session_id": "your-target@example.com",
      "chat_id": null,
      "text": "消息内容...",
      "priority": "urgent",
      "payload": {
        "kind": "external_agent_handoff",
        "command_id": "CMD-20260402-008",
        "callback_url": "http://127.0.0.1:19100/webhook/agent-receipt"
      },
      "created_at": 1711183200
    }
  ],
  "stats": [
    {
      "status": "pending",
      "count": 3
    },
    {
      "status": "sent",
      "count": 10
    }
  ],
  "messages": [
    {
      "id": 5,
      "channel": "hiredcity",
      "session_id": "cli-red@local",
      "chat_id": null,
      "text": "🔴 需要你拍板 ...",
      "priority": "urgent",
      "status": "sent"
    }
  ]
}
```

说明：

- 不带查询参数时，`pending` 仍是主返回字段，兼容现有轮询器
- 带 `status` 或 `session_id` 查询时，会额外返回 `messages`
- `messages` 按最新优先返回，便于直接看最近已发/失败历史

## 4.2 标记消息已发送

`POST /outbox/ack`

```json
{
  "id": 1
}
```

响应：

```json
{
  "ok": true,
  "id": 1,
  "status": "sent"
}
```

## 4.3 标记消息发送失败

`POST /outbox/fail`

```json
{
  "id": 1,
  "error": "网络超时"
}
```

响应：

```json
{
  "ok": true,
  "id": 1,
  "status": "failed"
}
```

## 4.4 Handoff payload 约定

当 outbox 消息来自外部 agent handoff bridge 时，胖虎或其他网关不应只读取 `text`，还应同时透传 `payload`。

最低要求：

- 把 `payload.command_id` 带到外部执行侧，作为后续回执主键
- 把 `payload.callback_url` 带到外部执行侧，作为标准回调入口
- 发送成功后照常调用 `/outbox/ack`
- 外部执行真正完成时，再单独调用 `payload.callback_url`

这意味着：

- outbox `ack` 只代表“消息已送达企业 IM”
- `agent-receipt` 才代表“任务执行结果已回到 Cortex”

---

## 5. 决策协议

## 5.1 创建决策请求

`POST /decisions`

`Content-Type: application/json`

规范请求体：

```json
{
  "project_id": "PRJ-cortex",
  "signal_level": "red",
  "question": "是否切换 hybrid 召回？",
  "options": ["保持 dense", "切换 hybrid"],
  "recommendation": "建议切换，原因...",
  "why_now": "继续拖延会影响下游评测与实现路径",
  "impact_scope": "cross_module",
  "irreversible": false,
  "downstream_contamination": true,
  "session_id": "your-user@..."
}
```

兼容请求体：

```json
{
  "project_id": "PRJ-cortex",
  "blocking_level": "Sync",
  "question": "是否切换 hybrid 召回？",
  "recommendation": "建议切换，原因...",
  "impact_scope": "cross_module"
}
```

服务端行为：

- 若收到 `blocking_level`，先归一化为 `signal_level`
- 写入一条 Decision Request
- 若 `signal_level=red`，同时写入一条 outbox `pending` 消息
- red 消息路由优先取本次请求的 `session_id / channel`，否则回退到项目默认 `notification_target / notification_channel`
- 若 `signal_level=red` 且既没有显式 `session_id`，也没有项目默认 `notification_target`，请求直接报错，避免静默漏告警
- 若 `signal_level=yellow`，只落库，不主动推送

响应：

```json
{
  "ok": true,
  "decision": {
    "decision_id": "DR-20260323-001",
    "signal_level": "red",
    "blocking_level": "Sync",
    "status": "needs_review",
    "question": "是否切换 hybrid 召回？",
    "recommendation": "建议切换，原因..."
  },
  "_redAlert": {
    "type": "red_alert",
    "projectId": "PRJ-cortex",
    "decisionId": "DR-20260323-001",
    "question": "是否切换 hybrid 召回？",
    "recommendation": "建议切换，原因...",
    "impact": "cross_module",
    "urgency": "high"
  }
}
```

约束：

- `_redAlert` 只是同步调用方的便捷返回
- 真正的发送以 outbox 为准

## 5.2 更新决策状态

`POST /decisions/update-status`

用于人工收口或后台对账，把旧红灯 / 黄灯从 review 面板里移出。

请求体：

```json
{
  "decision_id": "DR-20260324-001",
  "status": "archived"
}
```

当前支持的 decision 状态：

- `proposed`
- `needs_review`
- `approved`
- `changes_requested`
- `retry_requested`
- `stopped`
- `resolved`
- `archived`

响应：

```json
{
  "ok": true,
  "decision": {
    "decision_id": "DR-20260324-001",
    "status": "archived"
  }
}
```

## 5.3 查询待处理决策

规范接口：

`GET /decisions?project_id=PRJ-cortex&signal_level=red&status=needs_review`

建议响应：

```json
{
  "ok": true,
  "decisions": [
    {
      "decision_id": "DR-20260323-001",
      "signal_level": "red",
      "question": "是否切换 hybrid 召回？",
      "recommendation": "建议切换，原因..."
    }
  ]
}
```

兼容别名：

- `GET /sync-decisions?project_id=PRJ-cortex`

兼容说明：

- 旧网关如果已经依赖 `/sync-decisions`，P0 可以保留该路由
- 但新实现统一走 `signal_level=red` 的查询语义

## 5.4 红灯消息格式

当创建红灯决策后，胖虎发送给用户的消息建议格式：

```text
🔴 需要你拍板

项目：PRJ-cortex
决策：是否切换 hybrid 召回？
推荐：建议切换，原因...
影响：cross_module

回复 approve_1 / approve_2 / improve <说明> / stop
```

约束：

- 必须能被 `/webhook/im-action` 或 `/webhook/im-message` 重新吃回系统
- 如果是结构化卡片，按钮值要直接对应 `action`
- 如果是纯文本，就使用固定可解析命令

---

## 6. 命令与状态查询

## 6.1 列出任务简报

`GET /task-briefs?project_id=PRJ-cortex`

响应：

```json
{
  "ok": true,
  "briefs": [
    {
      "brief_id": "TB-20260324-001",
      "title": "Cortex P0 执行内核",
      "status": "draft",
      "why": "...",
      "context": "...",
      "what": "..."
    }
  ]
}
```

## 6.2 项目 Review 面板

`GET /project-review?project_id=PRJ-cortex`

响应：

```json
{
  "ok": true,
  "project": {
    "project_id": "PRJ-cortex",
    "root_page_url": "https://www.notion.so/project/cortex-review-page"
  },
  "summary": {
    "latest_brief": {},
    "next_steps": ["有 1 个红灯事项需要立即拍板。"],
    "red_decisions": [],
    "yellow_decisions": [],
    "active_commands": [],
    "notion_commands": []
  },
  "markdown": "# Cortex Review Panel\n..."
}
```

说明：

- 这是给 Notion review 页面和本地 review 渲染用的统一快照接口
- `markdown` 是可直接写入本地文件或进一步同步到 Notion 的文本版本
- `summary` 保留结构化字段，方便后续接更细的同步器

## 6.3 列出命令历史

`GET /commands?project_id=PRJ-cortex`

可选过滤参数：

- `command_id`
- `status`
- `source`
- `target_type`
- `parsed_action`
- `limit`

响应：

```json
{
  "ok": true,
  "commands": [
    {
      "command_id": "CMD-20260323-001",
      "status": "done",
      "parsed_action": "improve",
      "instruction": "把验收标准改成可观测指标",
      "ack": "ack:CMD-20260323-001"
    }
  ]
}
```

## 6.4 命令生命周期辅助接口

这些接口不是给最终用户直接调用的，而是给 agent / worker / 本地联调用。

### 领取命令

`POST /commands/claim`

```json
{
  "command_id": "CMD-20260323-001",
  "agent_name": "agent-router"
}
```

### 领取下一条符合条件的新命令

`POST /commands/claim-next`

```json
{
  "project_id": "PRJ-cortex",
  "source": "notion_comment",
  "owner_agent": "agent-notion-worker",
  "agent_name": "agent-notion-worker"
}
```

说明：

- 会按 `created_at ASC` 领取最早的 `status=new` 命令
- 常见用法是只轮询自己关心的来源，例如 `source=notion_comment`
- 如果传了 `owner_agent`，只领取路由到该 agent 的命令
- 如果传 `include_unassigned=true`，会同时领取 `owner_agent IS NULL` 的命令
- 如果传 `only_unassigned=true`，只领取尚未分配 owner 的命令
- 如果当前没有符合条件的新命令，返回 `command: null`

### 开始执行

`POST /commands/start`

```json
{
  "command_id": "CMD-20260323-001",
  "agent_name": "agent-router"
}
```

### 完成命令

`POST /commands/complete`

```json
{
  "command_id": "CMD-20260323-001",
  "agent_name": "agent-router",
  "result_summary": "P0 数据流已落库并完成 ack 闭环。"
}
```

响应统一：

```json
{
  "ok": true,
  "command": {
    "command_id": "CMD-20260323-001",
    "status": "done",
    "ack": "ack:CMD-20260323-001"
  }
}
```

## 6.5 人工更新命令状态

`POST /commands/update-status`

用于人工收口旧命令、后台修正状态，或者把遗留 `new / claimed / executing` 命令移出 active queue。

请求体：

```json
{
  "command_id": "CMD-20260324-001",
  "status": "done",
  "result_summary": "历史命令已确认完成"
}
```

当前支持的 command 状态：

- `new`
- `claimed`
- `executing`
- `done`
- `failed`
- `cancelled`
- `archived`

说明：

- 若状态更新为 `done` 且未显式传 `ack`，服务端会自动补 `ack:<command_id>`

响应：

```json
{
  "ok": true,
  "command": {
    "command_id": "CMD-20260324-001",
    "status": "done",
    "ack": "ack:CMD-20260324-001"
  }
}
```

## 6.6 常驻 Executor Worker 协议

`executor worker` 是长期运行的自动执行层。

标准循环：

1. `POST /commands/claim-next`
2. `POST /commands/start`
3. 调外部 handler 执行
4. 如果当前命令是 `source=notion_comment` 且 handler 返回 `reply_text`，回复同一条 Notion discussion
5. `POST /commands/complete` 或 `POST /commands/update-status(status=failed)`

推荐环境变量：

- `AGENT_NAME`
- `PROJECT_ID`
- `SOURCE`
- `OWNER_AGENT`
- `EXECUTOR_MODE=echo|webhook`
- `EXECUTOR_ROUTING_FILE`
- `EXECUTOR_WEBHOOK_URL`
- `EXECUTOR_WEBHOOK_TOKEN`
- `NOTION_API_KEY`
- `INCLUDE_UNASSIGNED=1` 或 `EXECUTOR_INCLUDE_UNASSIGNED=1`

如果要起多 agent 常驻 worker 池，再加：

- `EXECUTOR_POOL_ENABLE=1`
- `EXECUTOR_POOL_FILE=./docs/executor-workers.json`

路由优先级：

1. `EXECUTOR_ROUTING_FILE` 里的 `agents.{agent_name}`
2. `EXECUTOR_ROUTING_FILE` 里的 `default`
3. `EXECUTOR_WEBHOOK_URL / EXECUTOR_WEBHOOK_TOKEN`

推荐把多 agent handler 写进 `EXECUTOR_ROUTING_FILE`，只把 `EXECUTOR_WEBHOOK_URL` 留作单路由兜底。

### worker 池配置

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

- `agent-router` 专门处理未分配评论
- 其他 worker 处理各自 `owner_agent` 队列
- `dev:stack` 在 `EXECUTOR_POOL_ENABLE=1` 时会一次性起完整 worker 池

推荐直接起真实多 agent handler：

```bash
NOTION_API_KEY=ntn_xxx \
NOTION_PROJECT_INDEX_DATABASE_ID=your_db_id \
NOTIFICATION_CHANNEL=hiredcity \
NOTIFICATION_TARGET=your-target@example.com \
npm run automation:start
```

如果胖虎真实发送端部署在 Red Lobbi，而不是当前这台 Cortex 机器，本协议推荐直接用 `http sender` 对接 Red Lobbi 暴露的发送端点：

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

仓内也提供了等价启动脚本：

```bash
bash scripts/start-red-lobbi-http.sh http://<red-lobbi-host>:<port>/send-hi your-token
```

这会起：

- `executor-multi-agent-handler`
- `panghu-poller`
- `notion-loop`
- `executor-worker-agent-router`
- `executor-worker-agent-notion-worker`
- `executor-worker-agent-pm`
- `executor-worker-agent-architect`

其中：

- `agent-router` 会认领未分配评论，并通过 `POST /commands/derive` 二次派单
- `agent-pm` 会把评论沉淀成 `why / context / what` task brief
- `agent-architect` 会把高风险架构评论沉淀成 decision，并沿红灯路由 push
- `agent-notion-worker` 负责 sync / memory / execution / project-index 这类直接动作

如果 stack 已经起过，后续更推荐用：

```bash
npm run automation:ensure
```

语义：

- 某个进程掉了就补拉
- `cortex-server` 活着但不健康就整栈重启
- 常见用法是被 cron / 常驻 supervisor 定时调用

如果要接一个新的外部 agent，不必手改多份 JSON，可以直接注册：

```bash
npm run agent:register -- \
  --agent agent-search \
  --alias search \
  --webhook http://127.0.0.1:4010/handle
```

这会同时更新：

- `docs/agent-registry.json`
- `docs/notion-routing.json`
- `docs/executor-routing.json`

如果当前只想做最小联调，也可以先用本地 stub 托底：

```bash
npm run executor:stub
```

stub 只会提供：

- `GET /health`
- `POST /handle`

返回固定的 `status / reply_text / result_summary`，用于把自动执行链路先跑通。

本地直接运行：

```bash
AGENT_NAME=agent-notion-worker \
SOURCE=notion_comment \
NOTION_API_KEY=secret_xxx \
EXECUTOR_MODE=echo \
npm run executor:worker
```

### webhook handler 输入协议

当 `EXECUTOR_MODE=webhook` 时，worker 会把命令转发给外部 handler：

```json
{
  "agent_name": "agent-pm",
  "project_id": "PRJ-cortex",
  "command": {
    "command_id": "CMD-20260325-001",
    "project_id": "PRJ-cortex",
    "instruction": "请把这段 PRD 再收紧",
    "source": "notion_comment",
    "owner_agent": "agent-pm",
    "source_url": "notion://page/..."
  }
}
```

### webhook handler 输出协议

```json
{
  "ok": true,
  "status": "done",
  "reply_text": "已处理，我把这一段重新压缩了。",
  "result_summary": "PRD 段落已收紧并回复评论"
}
```

说明：

- `status` 当前最小支持 `done` / `failed`
- `reply_text` 只在 `notion_comment` 命令上使用
- `result_summary` 会写回 Commands，作为 review 与审计摘要

### 长任务推荐：handoff + receipt

如果 agent 无法在一次 webhook 调用里完成任务，推荐走双向回执模式：

1. worker 先把命令转交给外部 agent
2. 外部 agent 返回“已接单”或由 bridge 代为返回
3. Cortex 继续推进，不阻塞当前 worker
4. 外部 agent 完成后，再调 `POST /webhook/agent-receipt`

示例：

```bash
npm run agent:receipt -- \
  --command CMD-20260402-008 \
  --agent agent-panghu \
  --status done \
  --signal green \
  --summary "胖虎已完成企业 IM 侧执行，并返回处理结果。" \
  --reply "胖虎已完成这条任务，结果已回写到 Cortex。" \
  --next "如果需要，可以继续派发下一条任务给胖虎。"
```

## 6.7 健康检查

`GET /health`

响应：

```json
{
  "ok": true,
  "service": "cortex-p0"
}
```

---

## 7. 执行门禁

P0 的命令流跑通后，真正进入执行前仍然要遵守 Milestone 门禁。

最小门禁：

- `contract_status=approved`
- `contract_url` 非空
- `approved_by` 非空
- `approved_at` 非空

语义要求：

- `contract_url` 指向一份 `Why / Context / What` 简报
- 未满足门禁时，agent 只能探索和准备，不能推进不可逆步骤

---

## 8. 快速接入示例

```javascript
async function notifyCortex(text, sessionId, messageId) {
  const resp = await fetch('http://127.0.0.1:19100/webhook/im-message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: 'PRJ-cortex',
      text,
      session_id: sessionId,
      message_id: messageId,
      user_id: sessionId
    })
  });

  return resp.json();
}

async function createRedDecision(question, recommendation, sessionId) {
  const resp = await fetch('http://127.0.0.1:19100/decisions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: 'PRJ-cortex',
      signal_level: 'red',
      question,
      recommendation,
      impact_scope: 'cross_module',
      session_id: sessionId
    })
  });

  return resp.json();
}

async function claimNextNotionCommand(agentName) {
  const resp = await fetch('http://127.0.0.1:19100/commands/claim-next', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: 'PRJ-cortex',
      source: 'notion_comment',
      owner_agent: agentName,
      agent_name: agentName
    })
  });

  return resp.json();
}

async function pollOutboxAndSend() {
  const resp = await fetch('http://127.0.0.1:19100/outbox');
  const data = await resp.json();

  for (const msg of data.pending) {
    try {
      await yourImSdk.send(msg.session_id, msg.text, { payload: msg.payload });

      await fetch('http://127.0.0.1:19100/outbox/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: msg.id })
      });
    } catch (error) {
      await fetch('http://127.0.0.1:19100/outbox/fail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: msg.id, error: String(error) })
      });
    }
  }
}
```

### 外部 agent 回执示例

```javascript
async function reportAgentReceipt() {
  const resp = await fetch('http://127.0.0.1:19100/webhook/agent-receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      command_id: 'CMD-20260402-008',
      agent_name: 'agent-panghu',
      status: 'done',
      signal_level: 'green',
      result_summary: '胖虎已完成企业 IM 侧执行，并返回处理结果。',
      reply_text: '胖虎已完成这条任务，结果已回写到 Cortex。'
    })
  });

  return resp.json();
}
```

### 胖虎轮询器本地运行

```bash
cd /path/to/cortex-workflow-p0

# 直接打印“发送消息”
PANGHU_SEND_MODE=stdout npm run panghu:poll

# 或写入文件，方便本地验收
PANGHU_SEND_MODE=file \
PANGHU_SEND_FILE=/tmp/panghu-messages.jsonl \
npm run panghu:poll
```

### 本地一键联调

```bash
cd /path/to/cortex-workflow-p0
npm run e2e:local
```

### 本地开发入口

```bash
# 一键拉起 server + panghu poller
npm run dev:stack

# 模拟发一条 IM 文本消息
npm run im:send -- "继续推进胖虎联调"

# 直接造一条红灯决策
npm run red:decision -- "是否切换到新的召回链路？" "建议切换，避免下游实现继续漂移。"
```

### Notion 自动循环

```bash
cd /path/to/cortex-workflow-p0

NOTION_API_KEY=secret_xxx \
PROJECT_ID=PRJ-cortex \
LOOP_INTERVAL_MS=60000 \
npm run notion:loop
```

职责：

- 把 yellow / green 进展静默同步到 `notion_review_page_id`
- 把本地 collaboration memory 静默同步到 `notion_memory_page_id`
- 扫描 `notion_scan_page_id` 下的新评论，并入队成 `source=notion_comment` 的 commands

### 常驻 Executor Worker

```bash
cd /path/to/cortex-workflow-p0

AGENT_NAME=agent-notion-worker \
SOURCE=notion_comment \
NOTION_API_KEY=secret_xxx \
EXECUTOR_MODE=echo \
npm run executor:worker
```

如果要接真实 agent handler：

```bash
cd /path/to/cortex-workflow-p0

AGENT_NAME=agent-pm \
SOURCE=notion_comment \
OWNER_AGENT=agent-pm \
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

如果只是本地把整套自动执行跑起来：

```bash
NOTION_API_KEY=secret_xxx \
NOTION_PROJECT_INDEX_DATABASE_ID=e33fca4a-f7dc-4d79-8c44-9a670a2fc83f \
EXECUTOR_ENABLE=1 \
EXECUTOR_MODE=webhook \
EXECUTOR_AGENT_NAME=agent-notion-worker \
EXECUTOR_OWNER_AGENT=agent-notion-worker \
npm run dev:stack
```

注意：

- `notion_scan_page_id` 应该是稳定的项目文档根页
- 不要把它配置成会被整体重写的 review snapshot page

---

## 9. 错误码

- `200`: 成功
- `400`: 参数错误
- `404`: 接口不存在
- `500`: 服务内部错误

业务错误统一：

```json
{
  "ok": false,
  "error": "错误描述"
}
```

---

## 10. P0 验收

P0 至少满足下面四条：

- 企业 IM 发 1 条文本消息后，Commands 中出现 1 条新记录
- 同一 `message_id` 重放不会生成重复命令
- red 决策创建后，同时出现 1 条 Decision Request 和 1 条 outbox `pending` 消息
- 命令可被 claim -> executing -> done，并写回 `ack:CMD-...`
- 外部 agent handoff 后，能通过 `POST /webhook/agent-receipt` 回写结果，并在原 Notion discussion 留痕
