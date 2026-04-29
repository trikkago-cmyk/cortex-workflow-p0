# PRJ-cortex 执行文档

## 2026-04-27 Custom Agent MCP 门面已落地并启动

- 当前任务：把 `Notion Custom Agent` 的异步评论入口从“文档里的 REST 设想”推进成 Notion 可挂载的 MCP 工具入口。
- 核心进展：1）已新增 `src/cortex-mcp-server.js`，暴露 `get_cortex_context / ingest_notion_comment / claim_next_command / submit_agent_receipt` 四个 MCP tools。2）已新增 `npm run mcp:server` 与 `npm run notion:custom-agent-mcp`。3）`automation:start/status/stop` 已纳管 `cortex-custom-agent-mcp`。4）当前本机进程已启动在 `http://127.0.0.1:19101/mcp`，`GET /health` 返回 `service=cortex-custom-agent-mcp`。5）本机 MCP client 已能列出 4 个工具并成功调用 `get_cortex_context` 读取 `PRJ-cortex` 上下文。6）临时公网 endpoint `https://gentle-windows-doubt.loca.lt/mcp` 已通过 MCP client 验证。7）MCP server 已支持可选 `CORTEX_MCP_BEARER_TOKEN` 鉴权。8）完整测试已通过，`npm test = 166 / 166`。
- 本轮新增完成：新增 `test/cortex-mcp-server.test.js`，并更新 `docs/notion-custom-agent-router-checklist.md`、`docs/notion-custom-agents-collaboration.md`、`docs/notion-custom-agent-live-uat.md`，同步更新 Notion 页面 `自定义智能体协作` 与 `Router 配置清单`。
- 🔴 红灯：无新的系统级红灯。当前阻塞不是 Cortex 侧代码，而是 Notion Custom Agent 需要配置公网 HTTPS MCP endpoint；Notion 云端不能直接访问本机 `127.0.0.1`。
- 🟡 黄灯：还没在 Notion UI 真机跑 `green / yellow / red / self-loop / scope / receipt` 六个场景。
- 🟢 已推进：Custom Agent 接入从“需要直接打 Cortex REST”改成“Notion Agent -> MCP tools -> Cortex REST 内核”，方向已经和 Custom Agent 机制对齐。
- 下一步：1）在 Notion Custom Agent 里添加 MCP server：`https://gentle-windows-doubt.loca.lt/mcp`；2）跑六场景真机验收；3）如果临时 tunnel 不稳定，再换长期固定 relay。

## 2026-04-27 Notion MCP 已重新连通，工作台净化视图已生效

- 当前任务：恢复 Notion MCP 到当前 `Cortex` workspace，并把本地 `/dashboard` 的运行快照从“真实数据 + smoke 残留混合显示”收口成默认净化视图。
- 核心进展：1）已完成 `codex mcp login notion`，当前 Codex 会话已能直接 fetch 新的 `Cortex` 根页面与子页面。2）`/dashboard` 已新增 `data_hygiene` 与 `include_synthetic` 机制，默认隐藏 smoke / 验收残留，只在需要时切换到完整原始视图。3）本地运行时已确认处于 `NOTION_COLLAB_MODE=custom_agent`，不再走 `notion-loop` 作为主路径。4）工作台、记忆页、执行页、自定义智能体协作页的 Notion 页面已重新进入可同步状态。5）当前全量测试已通过，`npm test` 为 `161 / 161` 通过。
- 本轮新增完成：更新 `src/task-dashboard.js`、`test/task-dashboard.test.js`，并补充 `docs/red-yellow-green-operating-sop.md`、`docs/notion-custom-agent-live-uat.md` 作为当前异步协作与决策分流的主参考文档。
- 🔴 红灯：无新的系统级红灯。当前剩余阻塞已经从“MCP 授权失败”收敛为“要在 Notion 侧继续完成 Custom Agent trigger / tool 的真机配置与联调”。
- 🟡 黄灯：Notion MCP 已连通，但 `Notion Custom Agent` 的页面触发、self-loop guard、scope guard、receipt 回显还需要在目标工作区继续做一次真实联调。
- 🟢 已推进：Notion 授权已恢复；运行快照默认不再混入测试残留；后续同步与联调可以直接在当前 workspace 继续推进。
- 下一步：1）把本地主文档重新镜像到当前 Notion workspace；2）更新 Cortex 工作台各模块状态；3）开始跑 `green / yellow / red + receipt` 的 Custom Agent 真机验收。

## 2026-04-21 Notion Custom Agents 已成为异步协作主路径

- 当前任务：把 Cortex 的 Notion 异步协作从“评论轮询”改成“Notion Custom Agents 原生触发”，让 `@mention` / comment trigger 成为主入口。
- 核心进展：1）已新增 `docs/notion-custom-agents-collaboration.md`，明确 `Custom Agents` 为主路径，旧的 `notion-loop` 已退出默认 runtime。2）Cortex server 已补 `GET /notion/custom-agent/context`，可直接给 Notion agent 提供项目 review / 协作契约。3）Cortex server 已补 `POST /webhook/notion-custom-agent`，可作为 Notion agent 的事件入口。4）automation 与 dev stack 已默认切到 `custom_agent` 模式，不再拉起评论轮询。5）相关测试已补齐，确保默认模式不再依赖 `notion-loop`。
- 本轮新增完成：新增 `src/notion-collaboration-mode.js`、`src/notion-comment-pages.js`，并更新 `src/server.js`、`scripts/automation-start.js`、`scripts/dev-stack.js`、`src/automation-processes.js`、`README.md`、`package.json`、相关测试与文档。
- 🔴 红灯：Notion 工作区里还要做一次真机配置，把 Custom Agent trigger / tools 真正挂上去。
- 🟡 黄灯：legacy polling 还保留兼容层，后续要逐步删掉或只在灰度期保留。
- 🟢 已推进：Cortex 的异步协作主路径已经从“被动轮询评论”切换到“Notion 原生 agent 触发 + Cortex API/tooling”。
- 下一步：1）在 Notion 工作区配置 Cortex Router Custom Agent；2）把 agent trigger 跑通；3）再做一次长稳 smoke，验证 comment -> agent -> Cortex -> reply 的新闭环。

## 2026-04-15 已切换为多项目独立文档同步

- 当前任务：把 Cortex 从“单项目大文档同步”切到“每个项目独立文档、独立页集、独立 notion loop”的结构，避免不同工程继续互相污染。
- 当前进展：主项目已切到新的活跃 Notion 工作台 / 协作记忆 / 执行文档；`Dark Luxury Itinerary` 已拆成独立项目并拥有独立页集与独立 worker 路由。
- 🔴 红灯：无
- 🟡 黄灯：`PRJ-cortex` 的历史摘要与旧 checkpoint 仍需继续清理，避免旧误归档信息长期残留在主项目索引里。
- 🟢 已推进：已补项目级工作区解析、项目列表 API、多项目 notion loop 启动、多项目全量同步容错，以及 Notion 建页分批写入。
- 决策状态：🔴 无；🟡 `PRJ-cortex` 仍有历史误归档待逐步清理；🟢 新增项目已开始按独立文档模型运行。
- 下一步：继续按独立项目模型接入其他工程 agent，并逐步清理 `PRJ-cortex` 内遗留的历史误归档记录。

## 2026-04-14 本地红灯通知 + launchd 常驻托管已接通

- 当前任务：把 P0 最卡的“红灯快速唤醒你”从外部 IM / tunnel 依赖切回本地能力，并把 Cortex 运行态变成这台 Mac 上可自启动、可自恢复的服务。
- 核心进展：1）已经正式接入 `local_notification` 通道，红灯决策可直接走 macOS 系统通知，不再依赖胖虎代理。2）补了 `launchd:install / launchd:status / launchd:uninstall`，本地登录态下可定时执行 `automation:ensure`，持续兜底 `cortex-server / executor workers / local-notifier`。3）`automation:status / automation:stop` 已补项目 `.env.local` 自动加载，不会再出现明明本地通知已配置、状态脚本却看不见的错觉。4）`red-decision` 脚本已经适配本地通知通道，本地模式下不再强行要求 `session_id`。5）新增 `local:red-smoke`，可直接验证 `red decision -> outbox -> local-notifier -> sent` 的闭环。6）已完成真实验收：`automation:stop` 后等待约 20 秒，`launchd` 自动把整套栈重新拉起；恢复后再次触发红灯 smoke 仍然成功送达。
- 本轮新增完成：新增 `src/launchd.js`、`scripts/launchd-install.js`、`scripts/launchd-status.js`、`scripts/launchd-uninstall.js`、`scripts/local-red-alert-smoke.js`，并同步更新 `README`、`.env.local`、`agent-registry` 与测试。
- 🔴 红灯：无。`systemd` 在当前这台 `macOS 15.5` 机器上不可用，所以本轮已经直接改用本地原生 `launchd`，不再停在错误前提上空转。
- 🟡 黄灯：短周期恢复已经验过，但还差更长时间的 `launchd` 稳定性观察，确认跨多轮异常退出后的恢复都稳定。
- 🟢 已推进：P0 的红灯唤醒路径已经从“网络拓扑不稳定”收敛成“本地系统通知可用”；常驻运行态也从手动启动升级成可安装的本地托管模式。
- 下一步：1）本地安装 `launchd` 并做真实 smoke；2）验证 Notion 评论继续回流执行；3）继续收口其他 agent 的接入 SOP。

## 2026-04-14 评论 Direct Action 已接通到 Cortex 内核

- 当前任务：把 `comment + suggestion + accept/reject` 从“对象和 API 已存在”推进到“Notion 评论里能直接触发 action”。
- 核心进展：1）`agent-notion-worker` 已能识别结构化评论指令，直接执行 `suggestion accept/reject`、`memory accept/reject/followup`、`inbox resolve/snooze/archive/reopen`、`decision approve/improve/resolve/archive/retry`。2）`GET /inbox` 已支持 `source_ref` 过滤，direct action 后可以顺手收掉关联 review item，不再只改对象状态、却把 inbox 悬空。3）`executor-worker` 已兼容 `snake_case / camelCase` 结果字段，避免 handler 明明执行成功，却因为字段风格不一致而丢失完成摘要。4）多 agent executor 里的 shared action handler 也已绑定正确的 `fetchImpl / cortexBaseUrl`，不再误打默认 `19100`。5）已补端到端测试：`Notion comment -> router-owned command -> shared action -> Cortex object state update -> checkpoint / docs`。
- 本轮新增完成：薄改 `src/executor-command-actions.js`、`src/executor-worker.js`、`src/executor-multi-agent-handler.js`、`src/store.js`、`src/server.js`，并补齐 `test/executor-command-actions.test.js`。
- 🔴 红灯：无。
- 🟡 黄灯：当前 direct action 仍然依赖结构化评论指令，例如 `[suggestion-accept: SUG-xxx]`；更自然语言的评论语义理解先不放进 P0。
- 🟢 已推进：P0 里“文档交互升级成 comment + suggestion + accept/reject”这块已经不再只是 backend object，而是真能从评论线程直接打到执行内核。
- 下一步：1）整理 P0 完成度清单；2）把 freshness / revalidation 放进下一轮；3）回到剩余唯一红灯，继续收 IM 唯一拓扑与常驻运行态。

## 2026-04-14 Connect / Onboarding 已产品化成统一 API

- 当前任务：把 P0 里最后一块还停留在“脚本 + JSON 配置”的 `Connect / onboarding` 收口成真正可调用的产品接口。
- 核心进展：1）新增了统一 `connect-api` 控制层，不再要求使用者直接理解三份配置文件。2）Cortex server 已接入 `GET /connect/agents`、`GET /connect/agents/:agent`、`POST /connect/agents`、`POST /connect/agents/:agent/verify`。3）onboarding 继续复用现有 `agent-registry / notion-routing / executor-routing` 作为 operational truth，没有为 P0 再引入第二套真相源。4）verify 已支持两层校验：配置一致性校验、可选的同源 `/health` 网络校验。5）外部接入文档已补充 API 用法，后续可以直接从 Connect 视角接 agent，而不是只靠 CLI 和记忆。
- 本轮新增完成：落地 `src/connect-api.js`，薄改 `src/server.js` 与 `src/agent-onboarding.js`，补齐 `test/connect-api.test.js`，并完成一轮 API smoke。
- 🔴 红灯：无。
- 🟡 黄灯：当前 Connect 还是 backend API + 文档形态，真正的 Native Connect 页面还没做；另外 verify 默认探测同源 `/health`，更复杂的多服务探活策略放到 P1。
- 🟢 已推进：P0 要求里的 “新增 connect onboarding 基础页” 已先以统一 API / 基础控制面产品化，不再停留在脚本注册层。
- 下一步：1）把 candidate memory review 真正接回 Notion comment action；2）补 freshness / revalidation；3）整理一版 P0 完成度清单，明确哪些已经可交付、哪些进入 P1。

## 2026-04-14 Memory Pipeline 已落 extractor 与首批 candidate 投影

- 当前任务：把 `memory` 从“概念上分三层”推进到“原材料怎么进、怎么提炼、怎么治理”的完整沉淀流程。
- 核心进展：1）已经明确 `Raw Materials` 不是 memory，本身只是原始输入。2）memory 真正分成 `Candidate Memory` 和 `Durable Memory` 两个阶段，再叠加 `Base Memory / Timeline / Knowledge` 三个 layer。3）治理外壳也明确了：`memory_sources / inbox_items / suggestions / review_state / freshness / confidence`。4）已经把从 raw material 到 durable memory 的流程写清：`Raw Material -> Atomic Claim -> Candidate Memory -> Review -> Durable Memory`。5）也补清楚了哪些情况下不该沉淀 memory。6）第一版规则化提炼器已经落地，支持从 `comment / checkpoint / approved decision / failed receipt / suggestion outcome` 提 candidate。7）首批 candidate memory 自动投影已接通：`passed checkpoint`、`approved decision`、`accepted/rejected suggestion`。
- 本轮新增完成：新增 [docs/cortex-vnext-memory-pipeline.md](./cortex-vnext-memory-pipeline.md)，并落地 `src/memory-extractor.js` 与对应测试。
- 🔴 红灯：无。
- 🟡 黄灯：现在 extractor 还是第一版启发式规则，还没接 `comment repeated >= 2`、`confidence decay`、`freshness revalidation`。
- 🟢 已推进：memory 已经从“能存”推进到“知道该存什么、不该存什么、怎么升级成长期资产”，并且已经开始自动长出 candidate。
- 下一步：1）补 comment 重复检测和更强 extractor；2）把 candidate memory review 和 Notion comment workflow 接起来；3）补 freshness / revalidation 机制。

## 2026-04-13 Harness Phase 1 已接入首批 Projector

- 当前任务：把 Cortex 从“有执行链路的自动化项目”推进成“有 Harness 骨架的多 agent 协作系统”。
- 核心进展：1）Harness 架构已经正式写清，不再把 Cortex 理解成评论同步器，而是定义成 `Harness Runtime`。2）Phase 1 的新对象已经真实落库：`memory_items / memory_sources / inbox_items / suggestions`。3）最小 backend API 已接入：`/memory`、`/inbox`、`/suggestions`，并支持 memory review、inbox action、suggestion accept/reject。4）现有 `commands / decisions / checkpoints / task_briefs` 也补了投影统计字段。5）首批安全 projector 已接通：`notion comment -> triage`、`red/yellow decision -> decide`、`agent receipt -> review`。6）已补一组不依赖监听端口的 Phase 1 单测，确认 memory source 回填、inbox 投影、suggestion 生命周期、projector 三条自动路由都能跑。
- 本轮新增完成：新增 [docs/cortex-vnext-harness-architecture.md](./cortex-vnext-harness-architecture.md)，并完成 `store / engine / server / projector` 的第一轮 Harness 化落地。
- 🔴 红灯：无。当前这轮是 Phase 1 backend 增量，不涉及不可逆架构分叉。
- 🟡 黄灯：目前只接了最安全的三条 projector，`checkpoint -> candidate knowledge`、`approved decision -> candidate memory`、`suggestion -> review/decide` 还没自动化。
- 🟢 已推进：已经从“方案文档”进入“可运行骨架 + 首批自动投影”阶段，不再只是讨论 memory / inbox / suggestion。
- 下一步：1）继续补 projector，把 checkpoint / approved decision / suggestion 自动投影到 candidate memory 和 review queue；2）把 suggestion 接到真实 Notion comment review；3）补 Connect / Onboarding 的 agent profile 和 heartbeat 观测。

## 2026-04-13 vNext 框架收敛

- 当前任务：从“P0 执行链路打通”切到“Cortex vNext 产品框架收敛”，明确执行内核、memory 治理、review inbox、agent connect 的分层关系。
- 核心进展：1）已经确认 vNext 不推翻现有 Cortex 执行内核，而是在上面补产品层。2）memory 正式升级成三层：`Base Memory / Timeline / Knowledge`。3）review 正式从“长文档汇报”转向“Inbox 队列处理”，且 Inbox 一级分类改成按人类动作分：`待判断 / 待审阅 / 待处理`。4）文档协同正式从“reply”升级成 `comment + suggestion + accept/reject`。5）agent 接入正式从“协议文档”升级成 `Connect / Onboarding` 产品模块。6）完整框架已写入 [docs/cortex-vnext-product-framework.md](./cortex-vnext-product-framework.md)。
- 本轮新增完成：产出 vNext 产品框架文档，明确四层结构、memory 数据模型、Inbox 动作分类、文档协同语义、connect 设计和 Phase 0-3 路线。
- 🔴 红灯：无。当前是产品框架收敛，不涉及不可逆技术选型。
- 🟡 黄灯：vNext 的前台形态先做 Notion adapter 增量增强，还是直接补一套 Native UI，还没最终收口。
- 🟢 已推进：方向已经稳定，不再把 Cortex 定义成“Notion 自动化脚本集合”，而是明确成“执行内核 + memory 治理 + review inbox + agent connect”的协作系统。
- 下一步：1）把 vNext 框架拆成 P0 / P1 / P2 需求包；2）定义新增 schema：`memory_items / memory_sources / inbox_items / suggestions`；3）决定第一阶段先走 Notion 增强版还是 Native UI 最小版。

## 2026-04-13 Phase 1 动作拆解

- 当前任务：把 vNext 的 Phase 1 收敛成真正可执行的 backend 增强计划，明确先做 schema、projector、API、Notion adapter，暂不做大前台。
- 核心进展：1）Phase 1 已经明确为“新对象模型接入现有 Cortex”，不是直接开做 Native UI。2）需要新增的核心对象已经锁定：`memory_items / memory_sources / inbox_items / suggestions`。3）需要新增的胶水层也锁定了：把 `comment / decision / result / checkpoint` 自动投影成 inbox 和 memory。4）最小 API 范围也已锁定：`/memory`、`/inbox`、`/suggestions`。5）Notion 在 Phase 1 的身份明确降成“外部文档入口”，不再承担主内核。6）candidate memory 的触发事件也已锁定：人类稳定偏好、关键决策拍板、已验证执行模式、事故复盘、accepted/rejected suggestion、验收口径变化、新接入协议验证通过、人工显式提升。7）完整动作清单已写入 [docs/cortex-vnext-phase1-plan.md](./cortex-vnext-phase1-plan.md)。
- 本轮新增完成：产出一份 Phase 1 专项计划，覆盖 6 个关键动作、candidate memory 触发规则、推荐执行顺序、最小验收和关键风险。
- 🔴 红灯：无。当前仍是产品和架构拆解，不涉及不可逆实现。
- 🟡 黄灯：Suggestion 在 Phase 1 是先做 Cortex 内部结构化对象，还是同时要求 Notion 侧也有更强表达能力，后面实现时还需要看适配成本。
- 🟢 已推进：Phase 1 已经从“框架概念”推进成“可按顺序实现的工程清单”。
- 下一步：1）先设计 `store.js` migration；2）再补 projector 规则；3）最后再补 API 与测试。

## 2026-04-13 状态审计

- 当前任务：收口 Cortex MVP，不再继续扩散实验路径；优先完成 IM 正式推送链路、常驻运行态、Notion 评论闭环。
- 核心进展：1）代码和协议骨架已经基本齐了，`npm test` 当前 `103/103` 通过。2）SQLite 里已有真实 `commands / decisions / runs / checkpoints / outbox / receipts` 数据，不是空壳。3）但当前自动化运行态并不在线，`automation:status` 显示核心进程都不是 running，`/health` 也不可用。4）所以 Cortex 目前仍然是“能力已做出、闭环未上线”的状态，不应继续按“IM 已打通”对外表述。5）更完整的上线缺口见 [docs/prj-cortex-mvp-readiness.md](./prj-cortex-mvp-readiness.md)。
- 本轮新增完成：新增一份 `MVP Readiness` 文档，明确区分已完成能力、已验证但未产品化能力、上线前必须完成的 P0 To Do。
- 🔴 红灯：IM 推送正式链路仍未收口成单一、稳定、常驻、可运维的部署拓扑。
- 🟡 黄灯：Notion 评论闭环与外部 agent 接入协议都已有代码和测试，但仍缺最终目标环境下的长期运行验证。
- 🟢 已推进：完成仓库级状态审计；补齐 MVP 范围、验收边界和上线缺口；停止把“代码存在”误报为“已上线”。
- 下一步：1）锁定唯一 IM 拓扑；2）把 `cortex-server / panghu-poller / executor workers` 拉成统一常驻服务；3）用真实 Notion 评论跑一次最终闭环验证。

- 当前任务：把 Cortex server 迁到胖虎同侧网络运行，结束“我本机临时 server + tunnel”这条不稳定测试链路。
- 核心进展：方向已经收敛。1）这轮验证说明长期正确方案不是继续修本机 tunnel，而是把 Cortex server 迁到你那边可被胖虎本地直连的环境。2）原因已经很明确：你那台机器出不了公网，DNS 解析外部域名失败，所以远端 poller 无法稳定访问我这边的 quick tunnel；反过来我这边也无法稳定访问你本地 `send-hi` 回环地址。3）因此当前的网络拓扑下，真正稳定的链路只有“Cortex server 和胖虎 poller 在同侧网络，本地 `127.0.0.1:19100` 直连”。4）作为收尾动作，我已经把遗留测试消息 `id=14`、`id=15` 标记为 `sent`，当前本地 outbox 已清空，不再留 pending 噪声。5）本地 `panghu-poller` 也已关闭，避免再抢消费远端要验证的 outbox。
- 本轮新增完成：确认选择 `A` 作为正式方向；完成 `B` 的清理，把 `id=14`、`id=15` 收口为 `sent`；验证当前本地 outbox `pending_count=0`；关闭本地 poller，避免和你那边的执行链路冲突。
- 🔴 红灯：无
- 🟡 黄灯：正式迁移还没做，所以当前这份本机 Cortex 仍然只是开发态，不适合作为胖虎长期消费端。
- 🟢 已推进：临时 tunnel 路径已经证伪；正式部署方向已经锁定；遗留测试消息和 outbox 噪声已清掉；本地 poller 已关闭，不再干扰后续迁移。
- 下一步：1）把 Cortex server 迁到胖虎同侧机器；2）迁移后让胖虎直接轮询本地 `http://127.0.0.1:19100/outbox`；3）再做一次 fresh live handoff 验证真发 Hi 与 ack。
- 最近同步：由同步脚本按上海时间写入
- 评论方式：请直接对具体段落划词评论。任务写在评论里，不写进正文。
- Notion 展示：顶部固定导航，最新同步记录倒序置顶，旧记录自然下沉。
