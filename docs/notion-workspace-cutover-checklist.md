# Notion Workspace Cutover Checklist

最近更新：2026-05-09

适用场景：

- `PRJ-cortex` 要切到一个新的 Notion workspace 或新的根页面
- 目标是同时打通：
  - `Codex MCP OAuth` 读页面
  - `NOTION_API_KEY` 写页面
  - `Custom Agent + MCP` 评论协作

当前目标页示例：

- `https://www.notion.so/Cortex-35beb0c2e3f780309d79ddb2bd3c44b6?source=copy_link`

## 先认清 3 条独立链路

### 1. Codex MCP OAuth

用途：

- 让我在当前会话里直接读 Notion 页面
- 对应验证方式：`notion_fetch <page-url>`

### 2. Token-based Notion API

用途：

- 跑 `notion:bootstrap`
- 跑 `memory:notion-sync`
- 跑 `execution:notion-sync`
- 跑 `notion:sync-all`

对应验证方式：

```bash
npm run notion:diagnose -- "<page-url>"
```

### 3. Notion Custom Agent + Cortex MCP

用途：

- 在 Notion 页面里直接 `@Cortex`
- 评论触发 `get_cortex_context / ingest_notion_comment / claim_next_command / submit_agent_receipt`

对应验证方式：

```bash
npm run agent:setup-bundle -- --project PRJ-cortex --target-page-url "<page-url>"
```

## 当前已知真实状态

按 2026-05-09 当前仓库与运行态：

- `19100` Cortex runtime 正常
- `19101` Cortex Custom Agent MCP 已可本机启动
- `Custom Agent` 仓库链路已基本 ready，`PRJ-cortex` 的 project scope 已切到新根页
- `CORTEX_MCP_PUBLIC_URL` 当前已切到 `https://8250ceced2bf93.lhr.life/mcp`
- 已确认 `loca.lt` 这条旧 tunnel 会把 Notion Custom Agent 的 SSE 握手打成 `408 Request Timeout`
- 已确认新的 `localhost.run / *.lhr.life` 地址可以正常返回 `200 text/event-stream`
- `npm run agent:setup-bundle -- --project PRJ-cortex --target-page-url "<page-url>"` 当前会返回：
  - `status = ready_for_notion_setup`
  - `blockers = []`
  - `target_page.in_project_scope = true`
- 新目标页当前对两条 Notion 权限链都不可见：
  - `npm run notion:diagnose -- "<page-url>"` 返回 `page_not_shared`
  - 这只会卡住可选的 token-based mirroring，不会改变 `Custom Agent + MCP` 仍是主路径的判断
- `codex mcp login notion` 这条 OAuth 链今天已再次实机确认：
  - 授权页里如果选错到 `Sijia Yu's Notion Free Plan`，后续会一直像“授权过了但还是不通”
  - 这次已切换到 `rholland411’s Space (Business Trial)`
  - 浏览器显示 `Authentication complete` 后，当前运行中的 Codex 会话不一定立即热重载
  - 如果随后 `notion_fetch` 仍报 `Auth required`，先把它视作“会话未刷新”，优先重启 Codex / 新开线程验证
- `/workspace` 首页现在已经有 `Notion 协作接入` 面板：
  - 会直接显示 `Custom Agent 主路径已就绪 / token-based mirror 需单独授权`
  - 并明确提醒：这里的“已就绪”只覆盖 Cortex 本地前置条件，不等于当前 Notion workspace 已经能直接 `@Cortex`
  - 也会把 `线程来源` 摊开给人看，方便核对当前任务是不是从真实的 Notion discussion 进入

## Cutover 顺序

### Step 1：先确认主路径和镜像路径

如果你现在只想打通 `Custom Agent` 主路径，最少只需要确认两件事：

1. 目标 workspace 已开启 Custom MCP servers，且 `Cortex` 这个 Custom Agent 有编辑权限
2. 目标页已经被纳入 `PRJ-cortex` 的 project scope

如果你还想保留本地 mirror / bootstrap / sync 脚本，再额外补 token-based integration 权限：

1. 对 `NOTION_API_KEY` 对应的 integration（当前报错里名字是 `codex`）
   - 打开目标页
   - `Add connections`
   - 把这个 integration 加到目标页或它的父页面
2. 对 `Codex MCP OAuth`
   - 确认当前连接的是正确 workspace
   - 确认目标页对这个连接可见

验收：

- `npm run agent:setup-bundle -- --project PRJ-cortex --target-page-url "<page-url>"` 不再出现 `target_page_out_of_scope`
- 如果要保留 mirror 脚本，再继续看 `npm run notion:diagnose -- "<page-url>"` 里的 `explicit_target.accessible = true`

### Step 2：确认公网 MCP URL 仍然可用

Notion Custom Agent 不能连 `127.0.0.1:19101`，需要公网 HTTPS 地址。

当前已满足：

- `CORTEX_MCP_PUBLIC_URL=https://8250ceced2bf93.lhr.life/mcp`
- `CORTEX_MCP_BEARER_TOKEN` 已配置
- Notion 里连接 MCP 时带上：
  - `Authorization: Bearer <CORTEX_MCP_BEARER_TOKEN>`

这一步现在的重点不是“有没有 URL”，而是确认 tunnel 还活着、Notion UI 里填写的也是这条 URL。

这轮新增的一个关键排障结论是：

- `GET /mcp` 的 SSE 握手现在已经由 Cortex MCP server 原生支持
- 如果 Notion UI 仍报 `SSE error: Non-200 status code (408)`，优先怀疑公网 tunnel，而不是 Cortex MCP 代码本身
- 当前已证实：
  - 本地直连 `http://127.0.0.1:19101/mcp` 返回 `200 text/event-stream`
  - `https://tricky-paws-sit.loca.lt/mcp` 返回 `408`
  - `https://8250ceced2bf93.lhr.life/mcp` 返回 `200 text/event-stream`

所以后续如果临时域名失效，优先换新的 `localhost.run / *.lhr.life` 地址，再同步更新：

- `.env.local` 里的 `CORTEX_MCP_PUBLIC_URL`
- `.env.local` 里的 `CORTEX_MCP_ALLOWED_HOSTS`
- Notion UI 里的 Custom MCP URL

验收：

```bash
npm run agent:setup-bundle -- --project PRJ-cortex --target-page-url "<page-url>"
```

输出应保持：

- `status = ready_for_notion_setup`
- `blockers = []`

### Step 3：把新页面树写进 `PRJ-cortex`

就算权限补好了，如果 `target_page_out_of_scope` 还在，评论进入 Cortex 后仍会被挡在 scope guard 外。

推荐直接跑：

```bash
npm run notion:bootstrap -- "<page-url>"
```

它会在目标页下创建新的：

- 工作台页
- 协作记忆页
- 执行文档页

并自动回写：

- `project.root_page_url`
- `project.notion_parent_page_id`
- `project.notion_review_page_id`
- `project.notion_memory_page_id`
- `project.notion_scan_page_id`

如果你不想自动创建，也可以手动更新项目配置：

```bash
ROOT_PAGE_URL="<page-url>" \
NOTION_PARENT_PAGE_ID="<page-id>" \
PROJECT_ID=PRJ-cortex \
npm run project:upsert
```

但这种方式通常还需要你自己补 review / memory / execution 三个 page id。

### Step 4：重新生成接入包

```bash
npm run agent:setup-bundle -- --project PRJ-cortex --target-page-url "<page-url>"
```

理想状态：

- `local_mcp.ok = true`
- `cortex_context.ok = true`
- `target_page.in_project_scope = true`
- `blockers = []`
- 剩余工作只落在 Notion UI 侧手工动作

### Step 5：在 Notion UI 里挂 `Cortex`

按 [docs/notion-custom-agent-router-checklist.md](/Users/yusijua/Desktop/cortex-workflow-p0/docs/notion-custom-agent-router-checklist.md) 配：

- Agent 名称：`Cortex`
- Triggers：
  - `The agent is mentioned in a page or comment`
  - `A comment is added to a page`
- MCP Connection：
  - URL：`https://8250ceced2bf93.lhr.life/mcp`
  - Header：`Authorization: Bearer <CORTEX_MCP_BEARER_TOKEN>`
- Tools：
  - `get_cortex_context`
  - `ingest_notion_comment`
  - `claim_next_command`
  - `submit_agent_receipt`

这一步是主路径的最后人工动作。

注意：

- 这里是在给 `Cortex` Custom Agent 挂 MCP connection
- 不是在回退旧的 `@Cortex Router + 轮询` 方案
- 也不是在要求你先打通 token-based integration 才能 `@Cortex`

### Step 6：跑一条真实 green comment

建议第一条先用低风险指令，例如：

> @Cortex 把当前页面里的待办整理一下并继续推进

验收：

- Notion discussion 触发 agent
- Cortex 写入 `command`
- 后续能看到 `run / checkpoint / receipt`

## 最后一轮验收

1. `npm run agent:setup-bundle -- --project PRJ-cortex --target-page-url "<page-url>"` 返回 `ready_for_notion_setup`
2. 在目标页真实 `@Cortex` 一次，验证 comment -> command -> receipt
3. `/workspace` 的 `Notion 协作接入` 面板显示 `Custom Agent 主路径已就绪`
4. 如果需要保留镜像脚本，再单独补：
   - `notion_fetch <page-url>` 成功
   - `npm run notion:diagnose -- "<page-url>"` 成功
5. 如需做独立 UAT，再跑：
   - `npm run agent:live-uat -- --template-project PRJ-cortex --project PRJ-cortex-live-uat-<timestamp> --agent agent-live-uat-runtime`
