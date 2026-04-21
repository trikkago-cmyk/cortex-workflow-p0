# Notion Custom Agents Async Collaboration

最近更新：2026-04-21

## 结论

`Notion Custom Agents` 是 Cortex 在 Notion 内异步协作的正式主路径。  
旧的 `notion-loop` 评论轮询只保留为 `legacy fallback`，不再作为默认运行模式。

## 目标形态

用户旅程：

1. 你在 Notion 页面或评论中直接 `@Cortex Router`
2. `Notion Custom Agent` 被原生触发
3. Custom Agent 直接调用 Cortex API / MCP 工具获取上下文与写入动作
4. Cortex 落库 `command / decision / checkpoint / memory`
5. 需要回复时，由 Custom Agent 直接回到当前 Notion discussion
6. 红灯事项由 Cortex 继续走本地系统通知

## Cortex 侧职责

- 真相源：本地 Markdown + SQLite
- 执行内核：`commands / decisions / runs / checkpoints / outbox / receipts`
- 记忆治理：`memory_items / memory_sources / review_state`
- 红灯通知：`local_notification`
- 结构化上下文：`GET /project-review` 与 `GET /notion/custom-agent/context`
- Notion agent 事件入口：`POST /webhook/notion-custom-agent`

## Notion 侧职责

- 原生触发：`@mention agent` / `comment added`
- 原生对话：在页面和 discussion 内与 agent 交互
- 原生执行：agent 在 Notion 内决定是否继续、追问、回帖

## 迁移原则

- `notion-loop` 不再默认启动
- `NOTION_COLLAB_MODE=custom_agent` 作为默认模式
- 只有显式 `legacy_polling` 才启动评论轮询
- 现有 `/webhook/notion-comment` 保留兼容，不作为主入口

## P0 落地范围

- 先用一个 `Cortex Router` Custom Agent 收口主协作入口
- 先保留 Cortex 现有 `agent-router / agent-pm / agent-architect / agent-evaluator / agent-notion-worker`
- 先不做多 Custom Agents 编排
- 先不做开放式自然语言 agent orchestration

## 建议的 Custom Agent 配置

触发器：

- `The agent is mentioned in a page or comment`
- `A comment is added to a page`

系统职责：

- 读取当前页面与评论上下文
- 调用 Cortex context 接口获取项目状态
- 判断是 `green / yellow / red`
- 对 `green / yellow` 在 Notion 内继续推进
- 对 `red` 调用 Cortex 决策接口，由 Cortex 发送本地系统通知

## 兼容说明

以下能力继续保留，但降级为兼容层：

- `scripts/notion-loop.js`
- `scripts/notion-comment-smoke.js`
- `/webhook/notion-comment`
- `docs/notion-routing.json`
