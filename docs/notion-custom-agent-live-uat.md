# Notion Custom Agent 真机验收清单

最近更新：2026-04-29

## 当前结论

`Cortex` 侧主路径已经切到：

- `Notion Custom Agent + MCP`
- `POST /webhook/notion-custom-agent`
- `receipt / checkpoint / docs_only`

当前状态已经从 “MCP 鉴权失败” 升级为：

- `Notion MCP 已重新连通`
- 当前 Codex 会话已经可以 fetch 你的 `Cortex` 根页和子页
- Cortex 侧已新增 `cortex-custom-agent-mcp` 工具门面
- 已新增 `npm run agent:live-uat`，可以对当前 Cortex runtime 直接跑一轮 6 场景 live UAT
- 接下来真正剩下的是 `Notion UI trigger / tool connection / in-thread reply` 的最后人工挂接，而不是 OAuth 本身

## 2026-04-29 当前结论

这轮要把状态说准确：

- `Cortex API / MCP / receipt` 这一段真机联调已经收口
- `Notion UI 内真正由 Custom Agent 被 mention 后自己回帖` 这一段，还需要在目标 workspace 手动完成最后挂接

也就是说：

- 不能再说 “Cortex 侧还没准备好”
- 但也不能夸大成 “Notion 端所有真实交互已经全自动完成”

## 最新真实证据

### 1. Cortex 侧 live UAT 已通过

已在当前主 runtime 上执行：

```bash
npm run agent:live-uat -- \
  --template-project PRJ-cortex \
  --project PRJ-cortex-live-uat-20260429 \
  --agent agent-live-uat-runtime
```

结果：

- `6 / 6` 场景全部通过
- `green_command` 生成 `CMD-20260429-004`
- `yellow_decision` 生成 `DR-20260429-001`
- `red_decision` 生成 `DR-20260429-002`，且 `outbox_queued=true`
- `self_loop_guard` 返回 `skip_reason=self_authored_comment`
- `scope_guard` 返回 `skip_reason=out_of_scope_page`
- `receipt_writeback` 成功把 command 收口为 `done`，并生成 `RCP-20260429-002` 与 `CP-20260429-002`
- red 验收残留已自动清理：`archived_outbox_count=1`，`remaining_pending_count=0`

### 2. 短周期 soak 已通过

已在当前主 runtime 上执行：

```bash
npm run runtime:soak -- --project PRJ-cortex --iterations 2 --interval-ms 500 --samples 1
```

结果：

- `status = ready`
- `steady_ready = true`
- `2 / 2` 次连续 readiness 都是 `ready`
- `10` 个正式受管进程全部 running
- `launchd` 当前 `installed + loaded`
- `pending_outbox = 0`
- `open_red_decisions = 0`

## 已有真实证据

下面这些不是单测临时库，而是当前运行主库里的历史真实记录：

- `2026-04-15`
  - 多条 `source=notion_comment` 的 command 已入队并完成
  - 如：
    - “其他agent要如何接入？ @codex”
    - “确定能正常接收评论并执行吗？”
    - “真实通道要怎么配呢？@cortex”
- 同日已有对应 checkpoint
  - `PM 跟进：真实通道要怎么配呢？@cortex`
  - `已切换为多项目独立文档同步`

这说明：

- Notion 评论进入 Cortex
- 路由到下游 agent
- agent 继续执行
- checkpoint 被落库

这条链以前真实跑通过。

## 已解决的 blocker

### 1. Notion MCP 鉴权失效

这个问题已经解决。

当前已经确认：

- 能 fetch 当前项目页
- 能 fetch 当前执行页
- 能 fetch 当前自定义智能体协作页和工作台结构

### 2. 所以这轮该怎么定义“已完成”

更准确的状态是：

- `Cortex 侧 live UAT 已完成`
- `历史真实评论闭环存在`
- `当前 Notion MCP 已连通`
- `Notion Custom Agent UI 侧最后挂接仍待完成`

## 自动验收命令

### 1. 短周期运行态 soak

```bash
npm run runtime:soak -- --project PRJ-cortex --iterations 6 --interval-ms 60000 --samples 1
```

用途：

- 连续多轮采样 `runtime:readiness`
- 自动汇总 `ready / warning / blocking` 变化
- 适合看 `launchd + local_notification + worker pool` 是否稳定

### 2. Cortex 侧 live UAT

```bash
npm run agent:live-uat -- \
  --template-project PRJ-cortex \
  --project PRJ-cortex-live-uat-<timestamp> \
  --agent agent-live-uat-runtime
```

用途：

- 直接验证 `Notion Custom Agent` 六场景 contract
- 自动创建临时项目，不污染主项目
- 自动归档 red 场景产生的临时 outbox

## 真机验收目标

只要把下面 6 个场景在你当前工作区里跑通，这条主链路就算正式收口：

1. `green` 评论继续执行
2. `yellow` 评论进入 review 等待异步评论
3. `red` 评论触发本地通知并停下
4. self-loop guard 生效
5. page scope guard 生效
6. receipt / checkpoint 能回显到当前 discussion

## 验收前置条件

### Cortex 侧

- `cortex-server` 在线
- `executor-worker-*` 在线
- `local-notifier` 在线
- `NOTION_COLLAB_MODE=custom_agent`
- `cortex-custom-agent-mcp` 在线
- MCP endpoint 已通过公网 HTTPS 暴露给 Notion

### Notion 侧

- 已创建 `Cortex Router` Custom Agent
- 已打开：
  - `The agent is mentioned in a page or comment`
  - `A comment is added to a page`
- 已接通最小工具集：
  - `get_cortex_context`
  - `ingest_notion_comment`
  - `claim_next_command`
  - `submit_agent_receipt`

### MCP 侧

- Notion MCP：当前 Codex 会话能直接读取 `Cortex` workspace 页面
- Cortex Custom Agent MCP：`GET /health` 返回 `service=cortex-custom-agent-mcp`
- Notion Custom Agent：能看到并调用 `get_cortex_context`

## 6 个验收场景

### 场景 1：Green

评论示例：

> @Cortex Router 把当前 P0 阻塞整理后继续推进

预期：

- `ingest_notion_comment` 返回 `workflow_path=command`
- 生成 `command_id`
- 后续产生 `run / checkpoint`
- discussion 里出现继续推进的回显

### 场景 2：Yellow

评论示例：

> 这段结构我不太确定，先给个建议再继续

预期：

- 生成 `decision_request` 或 review item
- `signal_level=yellow`
- 不触发本地高优先级通知
- discussion 进入等待下一轮异步评论的状态

### 场景 3：Red

评论示例：

> 直接覆盖现在这套正式结构，按新方案全改

预期：

- 生成 `decision_request`
- `signal_level=red`
- `outbox_queued=true`
- 本地 `local_notification` 被触发
- 执行不会继续往下派发

### 场景 4：Self Loop Guard

前提：

- Custom Agent 在 Notion 里自己回了一条评论

要求 payload 带：

- `self_authored=true`

或：

- `created_by.id`
- `invoked_agent_actor_id`

预期：

- Cortex 返回 `workflow_path=ignored`
- `skip_reason=self_authored_comment`
- 不创建新 command

### 场景 5：Page Scope Guard

前提：

- 评论出现在项目子页面

要求 payload 带：

- `page_ancestry_ids`

预期：

- 如果 ancestry 落在项目树内：接受
- 如果不在项目树内：`out_of_scope_page`

### 场景 6：Receipt 回显

前提：

- 下游 agent 完成任务并调用 `submit_agent_receipt`

预期：

- `command.status -> done`
- `checkpoint` 新增
- `reply_id = null`
- `notion_feedback_mode = docs_only`
- Notion 侧 agent 基于最新 `receipt / checkpoint` 回显到当前 discussion

## 每轮验收要抓的证据

每跑一条场景，都要至少留 4 类证据：

1. Notion 评论原文
2. Cortex API 返回
3. `command / decision / checkpoint / receipt` 查询结果
4. 当前 discussion 的最终回显结果

## 现在立即执行的顺序

既然 Notion MCP 已经重新连通，接下来按下面顺序跑：

1. `notion_fetch` 根页，确认能读
2. `notion_fetch` 执行页，确认能读
3. 启动 `npm run mcp:server`
4. 将 `19101` 暴露为公网 HTTPS MCP endpoint
5. 在 Notion Custom Agent 里连接这个 MCP endpoint
6. 场景 1 `green`
7. 场景 2 `yellow`
8. 场景 3 `red`
9. 场景 4 `self-loop`
10. 场景 5 `scope`
11. 场景 6 `receipt`
12. 把验收结果写回本地执行文档

## 验收完成标准

如果要把“当前 workspace 已完全真机验收完成”这句话说满，仍需同时满足下面 4 条：

1. `green / yellow / red` 三条主分支都实测通过
2. self-loop guard 和 scope guard 都实测通过
3. 下游 receipt / checkpoint 回显真实出现
4. 这轮证据已经写回本地 canonical doc

当前第 `1` 和第 `4` 条，Cortex 侧已经满足。  
还差的是第 `2/3` 条在 Notion UI 里的最后人工挂接与真实 discussion 回帖。
