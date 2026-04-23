# Notion Custom Agent Router Checklist

最近更新：2026-04-23

## 目标

这份文档只做一件事：

- 把 `docs/notion-custom-agents-collaboration.md` 里的 `Phase 1 Router Agent` 落成一份可执行的 Notion 侧配置清单和联调 checklist

P0 目标不是在 Notion 里搭一个完整 agent team。

P0 目标是先把这条主链路打通：

1. 人在 Notion 页面或 discussion 里 `@Cortex Router`
2. `Cortex Router` 读取上下文并调用 Cortex API
3. Cortex 决定进入 `command` / `decision_request` / `ignored`
4. 后续执行与回执继续围绕同一个 discussion 展开

## P0 最小接入面

当前只需要这 4 个东西：

1. 一个 Notion Custom Agent
   - 名称：`Cortex Router`
2. 两个触发器
   - `The agent is mentioned in a page or comment`
   - `A comment is added to a page`
3. 两个核心接口
   - `GET /notion/custom-agent/context`
   - `POST /webhook/notion-custom-agent`
4. 一个固定项目 id
   - `PRJ-cortex`

P0 不要求：

- 在 Notion 里暴露多个 Custom Agents
- 在 Notion 里直接维护 durable memory
- 用 legacy integration token 主动把本地文档镜像回 Notion

## Cortex 侧前置条件

在配置 Notion Custom Agent 之前，先确认 Cortex 本地服务已经准备好。

### 1. 服务可访问

- Cortex API 本地可访问
- 至少能请求：
  - `GET /notion/custom-agent/context?project_id=PRJ-cortex`
  - `POST /webhook/notion-custom-agent`

### 2. 项目页面范围已配置

建议至少配置一个项目根页面 id，否则 page scope guard 无法生效。

可配置的项目页面字段：

- `root_page_url`
- `notion_parent_page_id`
- `notion_review_page_id`
- `notion_memory_page_id`
- `notion_scan_page_id`

推荐做法：

- 至少配置 `root_page_url` 或 `notion_parent_page_id`
- 如果 review / memory / scan 页面也是这个项目树的一部分，也一起配置

### 3. 默认模式是 Custom Agent

当前默认路径应该是：

- `NOTION_COLLAB_MODE=custom_agent`
- 不依赖 `NOTION_API_KEY`
- 不默认启动 `notion-loop`

只有在你明确做 legacy 兼容时，才需要：

- `NOTION_WRITE_MODE=legacy_api`

## Notion 侧配置清单

### 1. 创建 Agent

在 Notion 里创建一个新的 `Custom Agent`：

- Name: `Cortex Router`
- Role: Router / triage / async collaboration entrypoint

### 2. 打开触发器

打开这两个触发器：

- `The agent is mentioned in a page or comment`
- `A comment is added to a page`

原因：

- mention trigger 负责显式拉起 Cortex
- comment trigger 负责异步读评持续推进

### 3. 给 Agent 的系统职责

不要把它定义成“什么都做的大总管”，只定义成路由器。

推荐职责：

1. 读取当前 page、block、discussion、comment 上下文
2. 调 `GET /notion/custom-agent/context?project_id=PRJ-cortex`
3. 判断当前事件是 `green` / `yellow` / `red`
4. 调 `POST /webhook/notion-custom-agent` 把事件写回 Cortex
5. 根据 Cortex 返回结果决定：
   - `command`：继续执行或等待下游 agent
   - `decision_request`：在 Notion 里说明已进入 review / decision
   - `ignored`：不继续推进，避免误触发

### 4. 给 Agent 的系统 Prompt

下面这段可以作为 Phase 1 的直接起点：

```text
You are Cortex Router, the single async collaboration entrypoint for Cortex in Notion.

Your job:
1. Read the current page, discussion, and comment context.
2. Fetch project context from GET /notion/custom-agent/context?project_id=PRJ-cortex.
3. Classify the event as green, yellow, or red.
4. POST the event to /webhook/notion-custom-agent.
5. Continue collaboration in the same Notion discussion when the event is green or yellow.
6. Stop execution escalation when the event is red and let Cortex trigger the human notification path.

Rules:
- Cortex local Markdown + SQLite is the source of truth.
- Notion is the async collaboration surface, not the durable truth store.
- Do not silently skip red-risk decisions.
- Prefer explicit owner_agent or route_to when the user intent already implies a role.
- Pass self_authored=true for agent-written comments when possible.
- Pass page_ancestry_ids when the comment happens on a project child page.
```

### 5. 给 Agent 的工具边界

Phase 1 只开放最小工具集：

- `GET /notion/custom-agent/context`
- `POST /webhook/notion-custom-agent`
- `POST /commands/claim-next`
- `POST /webhook/agent-receipt`

如果 Notion 侧工具管理支持备注，请写清：

- `context` 只负责读项目态
- `webhook/notion-custom-agent` 只负责写入事件
- `claim-next` 和 `agent-receipt` 是下游执行链路，不是 Router 每次都要直接调用

## 事件载荷模板

### 最小可用载荷

```json
{
  "project_id": "PRJ-cortex",
  "page_id": "notion-page-id",
  "discussion_id": "notion-discussion-id",
  "comment_id": "notion-comment-id",
  "body": "human instruction or review comment",
  "invoked_agent": "Cortex Router",
  "owner_agent": "agent-router",
  "source_url": "notion://page/notion-page-id/discussion/notion-discussion-id/comment/notion-comment-id"
}
```

### 推荐生产载荷

```json
{
  "project_id": "PRJ-cortex",
  "page_id": "notion-page-id",
  "target_type": "page_comment",
  "target_id": "notion-block-or-page-id",
  "discussion_id": "notion-discussion-id",
  "comment_id": "notion-comment-id",
  "body": "human instruction or review comment",
  "context_quote": "the paragraph or task sentence around the comment",
  "anchor_block_id": "optional notion block id",
  "invoked_agent": "Cortex Router",
  "owner_agent": "agent-router",
  "route_to": "agent-pm",
  "source_url": "notion://page/notion-page-id/discussion/notion-discussion-id/comment/notion-comment-id",
  "self_authored": false,
  "page_ancestry_ids": ["ancestor-page-id", "project-parent-page-id"],
  "created_by": {
    "id": "notion-user-id",
    "type": "person_or_bot",
    "name": "comment author"
  },
  "invoked_agent_actor_id": "notion-user-id-of-cortex-router"
}
```

## Cortex 返回语义

### 1. 普通执行

当 Cortex 接收为普通执行事件时，典型返回是：

```json
{
  "ok": true,
  "workflow_path": "command",
  "command_id": "CMD-...",
  "owner_agent": "agent-router"
}
```

含义：

- 这条 comment 已经成功落成 command
- 后续可由 Router 自己继续，或由下游 executor claim

### 2. Yellow / Red 决策流

当 Cortex 识别为需要 review / decision 时，典型返回是：

```json
{
  "ok": true,
  "workflow_path": "decision_request",
  "decision_id": "DEC-...",
  "signal_level": "yellow"
}
```

或者：

```json
{
  "ok": true,
  "workflow_path": "decision_request",
  "decision_id": "DEC-...",
  "signal_level": "red",
  "outbox_queued": true
}
```

含义：

- `yellow`：进入 review / clarification 流
- `red`：进入人工拍板流，并触发本地系统通知

### 3. 被保护性忽略

以下两种情况 Cortex 会显式忽略：

1. 自己回复自己

```json
{
  "ok": true,
  "skipped": true,
  "skip_reason": "self_authored_comment",
  "workflow_path": "ignored"
}
```

2. 评论不在当前项目页面范围内

```json
{
  "ok": true,
  "skipped": true,
  "skip_reason": "out_of_scope_page",
  "workflow_path": "ignored"
}
```

## 联调 Checklist

不要直接冲全链路，按下面顺序一项项验。

### Step 1. Context 接口可读

请求：

```bash
curl "<CORTEX_BASE_URL>/notion/custom-agent/context?project_id=PRJ-cortex"
```

预期：

- `collaboration_mode=custom_agent`
- `async_contract.ingress_webhook=/webhook/notion-custom-agent`
- `async_contract.loop_guard.ignore_self_comments=true`
- 如果项目已配置页面范围：
  - `async_contract.scope_guard.enforce_known_project_pages=true`
  - `async_contract.scope_guard.configured_page_ids` 非空

### Step 2. 固定 payload 可写入

手动发一个 green 风格 payload：

```bash
curl -X POST "<CORTEX_BASE_URL>/webhook/notion-custom-agent" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "PRJ-cortex",
    "page_id": "11111111-1111-1111-1111-111111111111",
    "discussion_id": "discussion-001",
    "comment_id": "comment-001",
    "body": "整理当前 P0 阻塞并继续推进",
    "invoked_agent": "Cortex Router",
    "owner_agent": "agent-router",
    "source_url": "notion://page/11111111111111111111111111111111/discussion/discussion-001/comment/comment-001"
  }'
```

预期：

- `ok=true`
- `workflow_path=command`
- 返回 `command_id`

### Step 3. 验证 self-loop guard

再发一条 agent 自己写的评论：

```bash
curl -X POST "<CORTEX_BASE_URL>/webhook/notion-custom-agent" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "PRJ-cortex",
    "page_id": "11111111-1111-1111-1111-111111111111",
    "discussion_id": "discussion-002",
    "comment_id": "comment-002",
    "body": "这是 Router 自己补充的说明。",
    "invoked_agent": "Cortex Router",
    "self_authored": true,
    "source_url": "notion://page/11111111111111111111111111111111/discussion/discussion-002/comment/comment-002"
  }'
```

预期：

- `skipped=true`
- `skip_reason=self_authored_comment`
- `workflow_path=ignored`

### Step 4. 验证页面范围保护

前提：

- 你已经给 `PRJ-cortex` 配过 `root_page_url` 或 `notion_parent_page_id`

发送一个完全无关页面的 payload：

预期：

- `skipped=true`
- `skip_reason=out_of_scope_page`

然后再发送一个子页面事件，并带上：

- `page_ancestry_ids`

预期：

- 能正常通过
- `workflow_path=command`

### Step 5. Yellow / Red 分流

在 Notion 里做两种真实评论测试：

- yellow case：
  - 评论一个需要澄清但不应该立刻 push 人的事项
- red case：
  - 评论一个高风险、不可自动拍板的事项

预期：

- yellow：
  - `workflow_path=decision_request`
  - `signal_level=yellow`
- red：
  - `workflow_path=decision_request`
  - `signal_level=red`
  - `outbox_queued=true`

### Step 6. Receipt 回流

模拟执行器完成任务后回调：

```bash
curl -X POST "<CORTEX_BASE_URL>/webhook/agent-receipt" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "PRJ-cortex",
    "command_id": "CMD-EXAMPLE",
    "status": "completed",
    "summary": "已完成本轮执行并写回结果。"
  }'
```

预期：

- command 关闭
- receipt 记录成功
- Notion discussion 可以继续承接下一轮评论

## 常见问题

### 1. `skip_reason=self_authored_comment`

说明：

- Router 自己写的评论再次触发了自己

处理：

- 优先传 `self_authored=true`
- 或补 `created_by.id` 和 `invoked_agent_actor_id`

### 2. `skip_reason=out_of_scope_page`

说明：

- 当前 comment 不在 Cortex 已知项目页面树内

处理：

- 检查项目是否已配置 `root_page_url` / `notion_parent_page_id`
- 如果 comment 在项目子页面，补 `page_ancestry_ids`

### 3. Notion 连接报 `401 unauthorized`

说明：

- 现在真正需要通的是 `Notion Custom Agent + MCP`
- 不是把问题绕回旧的 `NOTION_API_KEY` integration

处理：

- 重新确认当前 Codex / Notion MCP OAuth 选中的 workspace
- 先验证能否读取目标 page
- 不要先去修 legacy token，避免又回到错误路线

### 4. 为什么 comment 进来了但没有继续执行

可能原因：

- Router 只写入了事件，但后续 executor 没有 claim
- 当前事件被判成 `yellow` 或 `red`
- 当前 comment 被范围保护或防回环保护忽略

建议先看 Cortex 返回：

- `workflow_path`
- `signal_level`
- `skip_reason`

## 当前建议

P0 先做到这 3 件事就够：

1. 让 `Cortex Router` 成为 Notion 里的唯一入口
2. 让 `self-loop guard` 和 `page scope guard` 同时生效
3. 让 `green / yellow / red` 的返回语义在 Notion 侧可观测

后面如果要继续增强，再补：

- 更细的 `route_to -> owner_agent` 策略
- Router 在 discussion 里的回复模板
- 人类 review comment 到下一轮 command 的自动承接策略
