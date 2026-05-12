# PRJ-cortex MVP 就绪度

最近更新：2026-05-09

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
- `运行态体检`：已新增 `runtime:readiness`，可统一检查 `automation /health / launchd / failed command / failed outbox / pending outbox / receipt / red decision`。
- `运行态误报收口`：`runtime:readiness` 现在会把 `launchd + /health` 已覆盖的 `cortex-server` 识别成健康，不再因为 `server-direct` 保活而把 runtime 误判成阻塞。
- `短周期 soak`：已新增 `runtime:soak`，可把多轮 readiness 观察收口成一份可复跑的 soak 报告。
- `真实 Notion 评论回流`：已在目标 Notion 页面验证评论可入队、路由、执行并形成 checkpoint / 文档收口；当前正切换到 `Notion Custom Agents` 主路径。
- `Custom Agent MCP 门面`：已新增 `cortex-custom-agent-mcp`，Notion 侧可通过 `get_cortex_context / ingest_notion_comment / claim_next_command / submit_agent_receipt` 四个工具接入 Cortex 内核。
- `Custom Agent 接入包`：`agent:setup-bundle` 现已能返回 `ready_for_notion_setup`；`PRJ-cortex` 的 page scope 已切到新的 `35beb0c2e3f780309d79ddb2bd3c44b6` 根页，公开名称也已统一为 `Cortex`。
- `外部 Agent 灰度验收`：已新增 `agent:onboarding-smoke`，同步 webhook 和 `handoff + receipt` 两条路径都能一键验。
- `Custom Agent 六场景 live UAT`：已新增 `agent:live-uat`，可在真实 Cortex runtime 上直接验证 `green / yellow / red / self-loop / scope / receipt`，并自动清理临时 red outbox。
- `workspace 三栏协作页`：`/workspace/docs/:documentId` 与 `/workspace/threads/:threadId` 已接上真实执行现场，评论线程现在能直接展示 triage 状态、流转统计、后续派生动作，并原地触发 `resolve / snooze / archive / reopen`。
- `评论派生执行回执`：worker 现在会把 `continue / improve / retry / stop` 这类评论动作统一沉淀成 `agent receipt + checkpoint`，不再只是把 command 粗暴标记为 `done`。
- `workspace 首页任务可视化`：任务卡已直接展示 `当前节点 / 执行链 / 最近回执 / 回执摘要`，并可从首页进入真实线程执行现场；当任务进入等待拍板或停滞时，首页还会补充 `卡点原因 / 推荐动作`，不用再靠翻日志判断 agent 为什么停住、下一步该怎么处理。
- `workspace 首页透明降噪`：attention 视图现在会自动合并“同线程、同标题、同状态”的 brief-only 重复卡，同时保留 thread 视图的真实任务数，并在卡片上明确标出 `同线程任务 / 已合并相近卡`。
- `workspace 历史线程降噪`：默认首页会隐藏 `低特异度 + 陈旧已完成` 的历史线程，但仍保留 raw count，并允许通过 `include_residual=1` 显式回看全部历史线程。
- `workspace 假执行中纠偏`：对长时间没有新 `run / receipt / checkpoint` 更新的任务，工作台会直接降为 `待回看`，避免旧线程继续伪装成还在实时运行。
- `workspace 历史待回看降噪`：对 `低特异度 + 长时间待回看` 的旧 brief / decision 线程，默认首页也会折叠进历史层，让聚焦视图只保留当前 concrete 协作线程。
- `workspace 线程协作输入`：线程右栏现在可以直接提交新的执行指令，并原地升级成黄灯 / 红灯决策请求，不必跳回 Notion 或旧对话窗口补一条评论。
- `triage 评论重进执行链`：原本只停在 `inbox_only` 的模糊评论，现在可以在评论卡片上补一句明确指令，再直接派生成新的命令继续跑，不需要先去别处补评论。
- `triage 评论升级决策`：对同一张模糊评论卡片，现在也可以直接补一句说明后挂黄灯或发红灯，让“问题评论”不再卡在待分流状态。
- `workspace 线程原始任务明细`：线程页里的子任务卡现在会直接展示 `当前节点 / 执行链 / 最近更新 / 任务标识`，同线程下的多个近似 brief 不再长得一模一样。
- `workspace 线程执行摘要增强`：多子任务线程的右栏摘要现在会直接展示 `当前活跃子任务 / 子任务分布`，不用再先翻完整卡片列表才能判断哪条子任务在跑。
- `workspace 线程卡点解释增强`：线程页 `执行摘要` 现在会在 `待回看 / 等待拍板` 状态下直接前置 `卡点原因 / 推荐动作`；如果是红灯决策，还会继续展示 `为什么现在处理 / 影响范围 / 证据`。
- `workspace 线程流转对齐增强`：`任务流转` 卡片现在会优先聚焦当前活跃子任务；如果活跃子任务暂时还没有评论链路，也会明确标注“当前展示的是线程最近评论链”，避免把旧评论误看成当前主执行链。
- `workspace 线程目录前置聚焦`：左侧线程目录和线程头现在会直接显示 `当前聚焦`，让人不打开完整右栏摘要，也能先知道每条线程当前是哪一个子任务在推进。
- `workspace 评论卡任务映射增强`：评论线程卡现在会直接标出 `关联子任务 / 与当前聚焦关系`，同时线程头也会显示 `队列概览`，把 comment、task、thread 三层关系直接前置到页面里。
- `workspace 评论优先级与跳转增强`：评论卡会把 `当前聚焦子任务` 相关评论自动排在前面，并提供 `跳到关联子任务` 入口，减少人在评论堆里手动找主执行链的成本。
- `workspace 任务卡评论反链增强`：线程内任务卡现在会直接显示 `最近评论 / 挂载关系 / 打开关联评论`。如果当前活跃子任务还没有直接评论链路，会诚实标记 `基于当前聚焦推断`，不再要求人从评论区单向反查任务。
- `workspace 首页执行 Checklist`：总览页现在会直接显示当前执行闭环、推进规则和验收条件。即使不进入本地文档，也能先看到 Cortex 正在按什么顺序推进、哪些已经收口、下一步准备做什么。
- `workspace 恢复线索透明化`：首页现在会同时显示“当前仍需恢复的具体线程”和“历史层已折叠的待回看 / 已完成数量”，默认聚焦当前可恢复线程，但不会把历史执行证据悄悄抹掉。
- `workspace 线程侧 Checklist 引导`：进入 `/workspace/docs/:documentId` 或 `/workspace/threads/:threadId` 后，右栏也会直接显示同一份执行 Checklist，人在任务现场仍能看到当前主闭环、验收条件和已完成 / 进行中 / 待执行分布。
- `workspace Checklist 深链接`：Checklist 现在不再只是摘要文案，已经能一键跳到 `线程目录 / 评论线程 / 快速拍板 / 协作输入 / 线程治理` 对应现场。
- `workspace 评论队列总览`：线程右栏在评论卡片上方新增一层评论队列摘要，直接告诉人当前最需要处理的是待分流评论、已接回执行评论、被拦截评论，还是已经进入历史层的评论，避免继续逐张卡扫状态。
- `workspace 文档导航与即时预览`：中间文档区现在会直接显示 `文档导航`，并把 `# / ## / ###` 标题与独立节标题投影成可点击导航；编辑时预览会即时刷新，同时明确提示当前有未保存修改。
- `workspace 线程治理可视化`：首页现在会直接展示 `稳定线程 / 主视图泛化线程 / 历史层待治理` 三类数量，并把剩余 `command / brief / decision` 级线程展开成治理卡片，明确说明它为什么仍留在主视图、为什么被折叠进历史层，以及可以跳去哪个线程现场继续处理。
- `workspace 线程来源可见性`：首页任务卡与治理卡现在会直接显示 `线程来源`，把 `Notion 讨论 / 会话线程 / 显式线程键 / 各类回退来源` 摊开给人看，thread identity 治理不再只靠猜。

### 🟡 还差最后一层产品化 / 运行态收口

- `Connect 接入体验`：现在是 backend API + 文档，已经够支撑 MVP 接入；更完整的 Native 页面不再作为 P0 阻塞项。
- `memory freshness / revalidation`：对象模型有位置，但还没真正跑起来。
- `更自然的评论语义理解`：现在 direct action 主要依赖结构化指令，不做自然语言宽匹配。
- `Notion Custom Agents 真机联调`：Cortex 侧 MCP / API / receipt contract 已经 live 验过；Notion UI 里仍需配置公网 HTTPS MCP endpoint，并完成 trigger / tool connection / discussion reply 的最后人工挂接。
- `Notion token mirror`：新的 workspace 目前仍然没有把目标页共享给 token-based integration，`notion:diagnose` 依旧是 `page_not_shared`；这条链路现在只算可选镜像，不再阻塞 `Custom Agent + MCP` 主路径。

### 🔴 仍然卡住上线判断

- `统一 automation 运行态` 还需要完成一次真实 `launchd + local_notification` 长稳验证，确认重启 / 异常恢复都正常。
- `Codex 自动唤醒线程` 已从单一 app heartbeat 升级成“双层兜底”
  - 第一层：Codex app 内 thread-bound heartbeat
  - 第二层：本机 `launchd` 定时检查 thread 是否 stale，再用 `codex exec resume` 做外部唤醒
  - 这已经明显提高了持续推进的稳定性，但仍需更长时间 soak 才能把它从“可用”升级成“可信赖”
- `19100` 本地 runtime 已恢复并再次 live 验证
- `GET /health` 正常
- `GET /workspace`、`GET /workspace/docs/execution`、`GET /workspace/threads/:threadId` 都已返回真实 HTML
- `GET /workspace?project_id=PRJ-cortex` live HTML 已确认包含 `当前节点 / 执行链 / 最近回执 / 回执摘要 / 进入执行现场`
- `GET /workspace/data?project_id=PRJ-cortex` live 数据已确认当前默认聚焦视图为 `任务总数 = 8（raw 22）`、`活跃线程 = 7（raw 20）`、`系统处理中 = 2`、`最近完成 = 6`；其中 `2 / 2` 的处理中任务都是 concrete 线程上的真实 `待回看`，另有 `13` 条低特异度历史线程被折叠进显式展开层，且进行中任务里 `尚未形成可见执行节点 = 0`
- `workspace` 首页当前节点已把 brief 状态汉化为 `草稿中 / 已对齐 / 执行中 / 已完成`，不再直接暴露 `draft / aligned` 这类内部态
- 当前 live `PRJ-cortex` 已确认首页存在 `1` 组同线程相近卡合并提示，重复 PM brief 不再在 attention 视图里重复占位。
- 当前 live `PRJ-cortex` 已确认同一 PM 线程页会直接展示 `TB-20260331-005 / TB-20260331-004 / TB-20260331-003` 等任务标识，thread 视图已经能区分原始子任务。
- 当前 live `PRJ-cortex` 已确认 PM 线程右栏会直接显示 `TB-20260331-004 · 处理中 · 任务简报 · 草稿中（另有 1 个子任务并行）`，以及完整 `子任务分布`。
- 当前 live `PRJ-cortex` 已确认真实 Notion 线程页出现 `打开关联评论 / 最近评论 / 挂载关系`，任务卡可以直接回跳评论。
- 当前 live `PRJ-cortex` 已确认 `/workspace` 首页出现 `执行 Checklist / 当前主闭环 / 推进规则 / 验收条件`。
- 当前 live `PRJ-cortex` 已确认 `/workspace` 首页出现 `当前仍需恢复 2 条具体线程` 与 `历史层已折叠 6 条待回看 / 7 条已完成`。
- 当前 live `PRJ-cortex` 已确认真实线程页出现 `执行 Checklist / 当前主闭环 / 验收条件 / 4 / 5 个闭环已收口`，当前前台主引导已把焦点切到 `thread_key / thread_label 收口`。
- 当前 live `PRJ-cortex` 已确认真实线程页出现 `当前最需要处理的是 1 条待分流评论 / 1 待分流 / 0 已接回执行 / 0 已拦截 / 28 历史层`。
- 当前 live `PRJ-cortex` 已确认执行文档页出现 `文档导航 / 风险举手 / 评论约定`。
- 当前 live `PRJ-cortex` 没有待拍板卡，因此首页暂未自然出现 `卡点原因 / 推荐动作`；这条分支已由 `/workspace` 回归测试覆盖并通过。
- 当前前台协作工作台主路径已经不只是测试壳子

## 一句话结论

Cortex 现在已经不是“从零开始”的概念稿了。
代码骨架、协议、测试、SQLite 真相源、多 agent 路由、Notion 评论回流、handoff + receipt 都已经做出来了。
但它也还不是可上线状态。
最关键的历史红灯已经调整了方向：
不再把企业 IM 当成 P0 的唯一唤醒方式，而是改成“本地 Cortex + 本地系统通知”。
当前剩下的核心问题已经从“网络拓扑打不通”收敛成“小时级以上的长稳 soak 还要继续拉长，以及 Notion Custom Agent 在目标 workspace 内的最后 UI 挂接是否收口”。

## 2026-04-27 新增真实进展

- `Notion MCP` 已重新连通，当前 Codex 会话已经可以直接 fetch 当前 `Cortex` 根页与子页面。
- `/dashboard` 已切到默认净化视图，真实运行态数据与 smoke / 验收残留不再混在一起展示。
- `cortex-custom-agent-mcp` 已本机启动，MCP client 已验证可列出 4 个 tools 并调用 `get_cortex_context`。
- 当前测试基线已提升到 `npm test = 179 / 179` 通过。

## 2026-04-29 新增真实进展

- `npm run runtime:readiness -- --samples 1` 已在本机执行，当前结果是：
  - `/health` 正常
  - 新接 smoke agent 后，`runtime:readiness` 第一时间识别出缺失 worker，不会把“已注册但未补拉”误判成健康
  - 执行 `npm run automation:ensure` 后新增 worker 已被自动补拉，说明接入后的运行态补齐机制是通的
  - 清理临时 smoke agent 配置后，当前已回到 `10` 个正式受管进程全部 running 的干净基线
  - `launchd` 已 installed + loaded
  - 已新增 `runtime:cleanup`，并在本机把历史 `failed command / failed outbox / pending outbox / open red decision` 全部归档清理
  - 当前 `npm run runtime:readiness -- --samples 2 --interval-ms 500` 已回到 `status = ready`
- `npm run runtime:soak -- --project PRJ-cortex --iterations 2 --interval-ms 500 --samples 1` 已在本机执行，当前结果是：
  - `status = ready`
  - `steady_ready = true`
  - `2 / 2` 次连续采样都为 `ready`
  - `10` 个正式受管进程全部 running
  - `launchd = installed + loaded`
  - `pending_outbox = 0`
  - `open_red_decisions = 0`
- `node --test test/runtime-readiness.test.js test/external-agent-onboarding-smoke.test.js` 已通过。
- `npm run agent:onboarding-smoke -- --mode handoff ...` 已在本机 live 跑通：
  - Connect onboarding 成功
  - worker claim / execute 成功
  - handoff outbox 成功生成
  - `/webhook/agent-receipt` 成功回写
  - receipt / checkpoint 已落库
- `npm run agent:live-uat -- --template-project PRJ-cortex --project PRJ-cortex-live-uat-20260429 --agent agent-live-uat-runtime` 已在本机 live 跑通：
  - `green / yellow / red / self-loop / scope / receipt` 共 `6 / 6` 场景通过
  - red 场景产生的临时 outbox 已自动归档
  - `remaining_pending_count = 0`

## 当前真实状态

### ✅ 已完成

- 数据底座已经成型：`projects / task_briefs / commands / decision_requests / runs / checkpoints / outbox / agent_receipts`
- 多 agent 路由已经成型：`agent-router / agent-notion-worker / agent-pm / agent-architect / agent-evaluator / agent-panghu`
- Notion 评论回流链路已经成型：
  - 评论扫描入队
  - owner_agent 路由
  - checkpoint / 文档收口
  - review / execution / index / memory 同步
- 外部 agent 接入协议已经成型：
  - 同步 webhook 模式
  - `handoff + receipt` 双向回执模式
- 自动化决策分级已经进协议：
  - `green / yellow / red`
  - `red` 触发本地系统通知，等待人工拍板
  - `yellow` 同步进文档 review，等待异步评论
  - `green` 直接推进，并把结果同步进文档
- Notion 异步协作主路径已经收口为：`Notion Custom Agents -> MCP tools -> Cortex API -> 本地真相源`
- `notion-loop` 已退出默认 runtime，不再作为并行主路径维护
- 本地测试是健康的：
  - `npm test` 179 / 179 通过
  - `npm run executor:smoke` 通过，已覆盖 `agent-router -> agent-pm / agent-architect`
  - `node --test test/cortex-mcp-server.test.js test/automation-processes.test.js test/notion-custom-agent-api.test.js` 通过，已覆盖 Custom Agent MCP 门面
  - `node --test test/runtime-readiness.test.js test/external-agent-onboarding-smoke.test.js` 通过，已覆盖运行态体检与外部 agent onboarding smoke
  - `node --test test/outbox-archive.test.js test/runtime-backlog-cleanup.test.js` 通过，已覆盖 backlog cleanup 与 outbox archive
  - `npm run runtime:readiness -- --samples 2 --interval-ms 500` 当前返回 `ready`

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
  - `8` 条历史 outbox 已 archived
  - `0` 条 outbox failed
  - `0` 条 outbox pending
  - `14` 条 agent receipt 已落库
  - 最近几条 receipt 说明胖虎侧确实做过 delivery / result 回写
- 新方案里，本地 `osascript` 系统通知已单机 smoke 成功，`local-notifier` 已接入 outbox ack
- `launchd` 已完成一次真实自恢复验证：手动停掉整套自动化进程后，约 20 秒内自动拉起并恢复 `/health`
- 真实 Notion 评论闭环已经在目标页面验证通过：
  - 评论扫描入队
  - `agent-router` 正常 claim
  - 下游 worker 执行
  - checkpoint 成功落库
- `runtime:readiness` 已把运行态检查收敛成固定命令，不再需要手翻多份日志
- `agent:onboarding-smoke` 已把外部接入金路径收敛成固定命令，不再需要手搓多步联调
- `agent:live-uat` 已把 Custom Agent 六场景 contract 收敛成固定命令，不再需要手搓多条 webhook / receipt payload
- 但 `launchd` 的更长时间运行还没做足够长时间验证，所以现在仍然先算“已接通、待长稳 soak”

### ❌ 现在还没完成

- 还没完成一轮更长时间的“launchd 安装后自动拉起 -> 本地红灯通知 -> Notion Custom Agent / 评论继续执行 -> 多次异常后的持续恢复”长期验证
- 还没完成“其他真实工程 agent 持续保活数天”的运行观察；但接入 SOP 和 smoke 命令已经具备

## 当前接入口径

- `现在可以开始灰度接入`：可以先让 `1-2` 个其他工程 agent 接入 Cortex 协作。
- `现在还不建议直接全量铺开`：因为常驻长稳、跨工程 SOP、最小可观测性还差最后一轮收口。
- `现在还不建议直接全量铺开`：因为小时级以上长稳 soak 和 Notion Custom Agent 的最后 UI 挂接还没做完。
- 建议顺序：
  - 先接一个真实其他工程 agent 做灰度
  - 跑满一轮 `command -> route -> execute -> receipt/reply`
  - 再决定是否扩到更多 agent / 更多工程

## 当前执行参考文档

- 红黄绿灯最终执行口径：
  - [docs/red-yellow-green-operating-sop.md](./red-yellow-green-operating-sop.md)
- Notion Custom Agent 真机验收清单：
  - [docs/notion-custom-agent-live-uat.md](./notion-custom-agent-live-uat.md)

## 结论：红灯问题是否已经解决

如果问题还是“企业 IM 拓扑有没有完全收口”，答案仍然是否。

但如果问题换成“红灯决策能不能在本机快速唤醒你”，答案已经变成：

- **可以**
- **而且不再依赖胖虎 / tunnel / 云端 OpenClaw**

所以 P0 的红灯唤醒链路已经从“未完成”升级成“本地可用，待长稳验证”。

## MVP 产品范围

这次 MVP 不该再继续发散。
应该只收下面这 5 件事。

### 1. 多智能体共享工程空间

- 所有 agent 共用同一个 project
- 共用同一套 SQLite 真相源
- 共用 commands / runs / checkpoints / decisions / receipts

### 2. 显式任务简报 + 隐式记忆继承

- 每次任务先有 `Why / Context / What`
- 共享 memory 独立维护
- 新 agent 接手时能继承稳定协作偏好和历史上下文

### 3. 决策分级执行

- `green`：直接做，只记记录
- `yellow`：写进文档 review，等待异步评论后继续
- `red`：立刻 push 到本地系统通知，等待拍板

### 4. Notion 作为异步审阅面板

- 文档正文承载内容
- 评论承载任务和反馈
- agent 扫描评论后执行下一步
- 执行结果沉淀到文档与 checkpoint

### 5. 外部智能体接入协议

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
- `cortex-server / executor workers / local-notifier` 纳入统一生命周期
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
- 当前 discussion 或 canonical doc 能看到结果回显
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
  - 文档镜像/协作面未刷新

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
