# PRJ-cortex MVP Readiness

最近更新：2026-04-21

## P0 状态矩阵

### 🟢 已基本收口

- `执行内核`：`projects / commands / decisions / runs / checkpoints / outbox / receipts` 已稳定在 SQLite 真相源上。
- `memory 三层 + 治理字段`：`memory_items / memory_sources` 已落库，candidate / durable / review_state 已接通。
- `inbox 动作队列`：`inbox_items` 已支持 `queue / object_type / action_type / risk_level`。
- `comment + suggestion + accept/reject`：suggestion / memory / inbox / decision 已支持结构化评论 direct action，不再只停留在对象 API。
- `connect onboarding`：已从脚本注册升级成统一 Connect API，支持 list / detail / create / verify。
- `会话型 agent 接入`：已支持把同机其他 Codex 会话注册成 `codex_resume` worker，`agent-dark-luxury-itinerary` 已完成本地 connect health check；后续不再用“只回复 online”的空转 probe 打断会话。
- `red IM push 机制`：协议、对象、outbox、receipt、red decision alert 都已存在。
- `本地红灯唤醒`：已新增 `local_notification` 通道，支持 macOS 系统通知直推，不再依赖胖虎代理。
- `本地常驻托管`：已补 `launchd` 安装 / 状态 / 卸载脚本，可在本机登录态下自动 ensure Cortex 栈。
- `真实 Notion 评论回流`：已在目标 Notion 页面验证评论可入队、路由、执行并回帖；当前正切换到 `Notion Custom Agents` 主路径。

### 🟡 还差最后一层产品化 / 运行态

- `Connect 接入体验`：现在是 backend API + 文档，已经够支撑 MVP 接入；更完整的 Native 页面不再作为 P0 阻塞项。
- `memory freshness / revalidation`：对象模型有位置，但还没真正跑起来。
- `更自然的评论语义理解`：现在 direct action 主要依赖结构化指令，不做自然语言宽匹配。
- `Notion Custom Agents 真机联调`：代码主路径已开始切换，但还需要在 Notion 工作区里把 Custom Agent trigger / tool connection 真正挂上。

### 🔴 仍然卡住上线判断

- `统一 automation 运行态` 还需要完成一次真实 `launchd + local_notification` 长稳验证，确认重启 / 异常恢复都正常。

## 一句话结论

Cortex 现在已经不是“从零开始”的概念稿了。
代码骨架、协议、测试、SQLite 真相源、多 agent 路由、Notion 评论回流、handoff + receipt 都已经做出来了。
但它也还不是可上线状态。
最关键的历史红灯已经调整了方向：
不再把企业 IM 当成 P0 的唯一唤醒方式，而是改成“本地 Cortex + 本地系统通知”。
当前剩下的核心问题已经从“网络拓扑打不通”收敛成“本地运行态要不要足够稳，以及 Notion Custom Agents 真机联调是否收口”。

## 当前真实状态

### ✅ 已完成

- 数据底座已经成型：`projects / task_briefs / commands / decision_requests / runs / checkpoints / outbox / agent_receipts`
- 多 agent 路由已经成型：`agent-router / agent-notion-worker / agent-pm / agent-architect / agent-evaluator / agent-panghu`
- Notion 评论回流链路已经成型：
  - 评论扫描入队
  - owner_agent 路由
  - discussion 回帖
  - review / execution / index / memory 同步
- 外部 agent 接入协议已经成型：
  - 同步 webhook 模式
  - `handoff + receipt` 双向回执模式
- 自动化决策分级已经进协议：
  - `green / yellow / red`
  - `red` 触发本地系统通知，等待人工拍板
  - `yellow` 同步进文档 review，等待异步评论
  - `green` 直接推进，并把结果同步进文档
- Notion 异步协作主路径已经收口为：`Notion Custom Agents -> Cortex APIs / tools -> 本地真相源`
- `notion-loop` 已降级成 legacy fallback，不再作为默认主路径
- 本地测试是健康的：
  - `npm test` 122 / 122 通过
  - `npm run executor:smoke` 通过，已覆盖 `agent-router -> agent-pm / agent-architect`

### ✅ 已有真实数据沉淀

- SQLite 当前已有：
  - `11` 个 project
  - `13` 条 task brief
  - `66` 条 command
  - `14` 条 decision request
  - `27` 条 run
  - `26` 条 checkpoint
  - `26` 条 outbox
  - `14` 条 agent receipt
- 说明这套系统不是空壳。
  已经真实走过多轮命令、回执、checkpoint 和 outbox 发送。

### ⚠️ 已验证过，但还不算上线能力

- IM handoff / receipt 做过多轮 live smoke
- 数据里能看到：
  - `19` 条 outbox 已 sent
  - `3` 条 outbox failed
  - `14` 条 agent receipt 已落库
  - 最近几条 receipt 说明胖虎侧确实做过 delivery / result 回写
- 新方案里，本地 `osascript` 系统通知已单机 smoke 成功，`local-notifier` 已接入 outbox ack
- `launchd` 已完成一次真实自恢复验证：手动停掉整套自动化进程后，约 20 秒内自动拉起并恢复 `/health`
- 真实 Notion 评论闭环已经在目标页面验证通过：
  - 评论扫描入队
  - `agent-router` 正常 claim
  - 下游 worker 执行
  - discussion 成功回帖
- 但 `launchd` 的更长时间运行还没做足够长时间验证，所以现在仍然先算“已接通、待压测”

### ❌ 现在还没完成

- 还没完成一轮更长时间的“launchd 安装后自动拉起 -> 本地红灯通知 -> Notion Custom Agent / 评论继续执行 -> 多次异常后的持续恢复”长期验证
- 其他 agent 虽然已经可以按协议接入，但“跨工程接入后马上可长期运行”的金路径还没打磨成真正可复制的 SOP
- 还缺至少 1 个其他工程真实 agent 的灰度接入验证，用来确认 Connect / 路由 / receipt / 回帖全链路在新项目里可复制

## 当前接入口径

- `现在可以开始灰度接入`：可以先让 `1-2` 个其他工程 agent 接入 Cortex 协作。
- `现在还不建议直接全量铺开`：因为常驻长稳、跨工程 SOP、最小可观测性还差最后一轮收口。
- 建议顺序：
  - 先接一个真实其他工程 agent 做灰度
  - 跑满一轮 `command -> route -> execute -> receipt/reply`
  - 再决定是否扩到更多 agent / 更多工程

## 结论：红灯问题是否已经解决

如果问题还是“企业 IM 拓扑有没有完全收口”，答案仍然是否。

但如果问题换成“红灯决策能不能在本机快速唤醒你”，答案已经变成：

- **可以**
- **而且不再依赖胖虎 / tunnel / 云端 OpenClaw**

所以 P0 的红灯唤醒链路已经从“未完成”升级成“本地可用，待长稳验证”。

## MVP 产品范围

这次 MVP 不该再继续发散。
应该只收下面这 5 件事。

### 1. 多 agent 共享工程空间

- 所有 agent 共用同一个 project
- 共用同一套 SQLite 真相源
- 共用 commands / runs / checkpoints / decisions / receipts

### 2. 显式任务简报 + 隐式 memory 继承

- 每次任务先有 `Why / Context / What`
- 共享 memory 独立维护
- 新 agent 接手时能继承稳定协作偏好和历史上下文

### 3. 决策分级执行

- `green`：直接做，只记记录
- `yellow`：写进文档 review，等待异步评论后继续
- `red`：立刻 push 到本地系统通知，等待拍板

### 4. Notion 作为异步 review 面板

- 文档正文承载内容
- 评论承载任务和反馈
- agent 扫描评论后执行下一步
- 执行结果回帖到原 discussion

### 5. 外部 agent 接入协议

- 其他工程里的 agent 可以注册成 Cortex worker
- 支持两种模式：
  - 同步 webhook 完成
  - `handoff + receipt` 异步回执

### 6. 明确不纳入 P0 的内容

- 不做 Native 前台 UI / Decision Center
- 不把 Connect 页面产品化成可视控制台
- 不把自然语言评论理解做到开放式 assistant 级别

## 距离上线还差哪些 P0 To Do

### P0-1 锁定唯一本地唤醒拓扑

目标：
只保留一条正式链路。
不再同时保留“胖虎代理 / tunnel / 远端 poller / 临时 HTTP sender”多套说法。

验收：

- 选定唯一部署拓扑：`本地 Cortex -> outbox -> local-notifier -> macOS system notification`
- 写成一份 1 页 SOP
- `red` 决策可以稳定弹本地通知
- 同一条命令不会重复提醒

### P0-2 把 Cortex 跑成常驻服务

目标：
不是“今天手动起得来”，而是“掉了能发现，能重启，状态可见”。

验收：

- `automation:start / status / stop / ensure` 可用
- `cortex-server / notion-loop / executor workers / local-notifier` 纳入统一生命周期
- `/health` 可访问
- 进程异常退出后可恢复
- `launchd` 安装后可登录即启动

### P0-3 跑通最终形态的评论闭环

目标：
不是本地单测通过。
而是最终目标环境里，真实 Notion 评论可以闭环。

验收：

- 真实评论进入 command queue
- 路由到正确 agent
- agent 执行
- 原 discussion 收到 reply
- 如需继续执行，能产生下一条真实 action，而不只是模板回复

### P0-4 收口外部 agent 接入 SOP

目标：
让其他工程 agent 真能接进来，而不是只看文档猜怎么接。

验收：

- 至少 1 个非胖虎 agent 成功接入
- 完成一次真实 command -> execute -> receipt -> reply
- onboarding 文档控制在 1 份
- 注册、路由、回执、排障都有明确步骤

### P0-5 加最小可观测性

目标：
出了问题能知道卡在哪，不再靠手动翻很多日志猜。

验收：

- 至少能看到：
  - 当前运行进程
  - 最近失败 command
  - 最近 failed outbox
  - 最近 red / yellow decision
  - 最近 receipt
- 失败路径能分清：
  - 没入队
  - 没 claim
  - webhook 失败
  - IM 发送失败
  - receipt 未回写
  - Notion 回帖失败

## 现在不该继续扩的内容

这些可以做，但不该挡住 MVP：

- 更复杂的 planner / generator / evaluator 三 agent 编排
- 自动 memory curator
- 更丰富的 dashboard 美化
- 更复杂的角色体系和 mention 规则
- 更多 Notion 镜像页面

## 我对当前拖沓的责任判断

问题不在“完全没做”。
问题在于我前面把三件事混着推进了：

- 协议设计
- 本地能力实现
- 真实部署闭环

结果是：

- 代码越来越多
- 文档越来越多
- live 路径却没有尽早压缩到唯一主线

这是项目负责人的问题。
该更早把目标收窄成：

- 先固定一条 IM 推送链路
- 再固定一条评论闭环链路
- 再做其他 agent 接入

## 当前建议的收口顺序

1. 先收 `P0-1 IM 唯一拓扑`
2. 再收 `P0-2 常驻运行态`
3. 然后收 `P0-3 真实评论闭环`
4. 最后收 `P0-4 外部 agent SOP`

完成这四步，Cortex 才能算 MVP 可上线。
