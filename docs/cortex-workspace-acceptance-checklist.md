# Cortex Workspace P0 验收清单

最近更新：2026-05-11

## 2026-05-11 workspace 首屏任务看板已改成 RetroUI 风格

- 已完成：`src/task-dashboard.js` 的 `/workspace` 首屏现在直接展示 `红灯待拍板 / 系统处理中 / 已完成` 三列任务板，不再把任务状态埋在后面的工程治理说明里。
- 已完成：任务卡默认压缩为 `信号 / 状态 / 标题 / 下一步 / 负责人 / 更新时间 / 线程`，执行证据、checkpoint、当前节点和 checklist 关系收到 `证据和上下文` 折叠区，保留审计信息但不压垮首屏可读性。
- 已完成：视觉语言已对齐 RetroUI 方向：粗黑描边、硬阴影、浅黄/浅红/浅绿列底、黄色主按钮和紧凑卡片。
- 已完成：这轮没有改路由、schema 或任务状态模型；`data-workspace-task-card`、`data-workspace-card-body-context="workspace-task-card"` 等既有 selector contract 继续保留。
- 已完成：`node --check src/task-dashboard.js` 已通过；`npm test -- --test-name-pattern="workspace html renders dual views and key attention lanes|workspace data projects waiting, running, and completed tasks into one board model"` 已通过，当前测试输出 `47 / 47` 全绿。
- 已完成：已用 Playwright 在临时端口和 live `19100` 各做一次首屏验证；live `19100` 页面确认 `.hero-board-preview` 可见，首屏任务板包含 4 张任务卡。
- 已完成：`npm run automation:restart` 已把 live runtime 切到新版前台；最新状态为 live listener `19100 / pid 37010`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 当前备注：
  - 这轮先解决“用户一眼看不懂任务状态”的 P0 可用性问题，深层治理区仍保留在页面下方作为排查和审计入口
  - 下一步如果继续打磨，更值得看的是把红灯/黄灯/绿灯的动作入口进一步显式化为 approve / reject / request changes / block / continue，而不是继续依赖自然语言解释

## 2026-05-11 thread decision card / inbox actions 已补 shared inline action contract

- 已完成：`src/workspace-docs.js` 现在会在 thread scene 的 decision card 与 comment inbox action area 显式露出统一 contract，不再让这两块 thread 现场动作区继续停在匿名 note / button 结构。
- 已完成：decision card 新增并对齐后的稳定 selector 为：
  - `data-thread-inline-action-box="decision"`
  - `data-thread-inline-action-note="decision"`
  - `data-thread-inline-action-list="decision"`
  - `data-thread-inline-action-button="approved" | "changes_requested" | "retry_requested" | "stopped"`
- 已完成：comment inbox action area 新增并对齐后的稳定 selector 为：
  - `data-thread-inline-action-box="inbox"`
  - `data-thread-inline-action-list="inbox"`
  - `data-thread-inline-action-button="resolve" | "archive" | "snooze" | "reopen"`
- 已完成：这轮没有改 server route，也没有改 decision / inbox 行为本身；旧的 `data-decision-note / data-decision-action` 与 `data-inbox-action / data-inbox-id` 仍保留给现有 handler 使用，新增的是 shared inline action contract 层。
- 已完成：`test/workspace-docs.test.js` 已在 thread scene 主渲染场景里锁定 decision card 与 triage inbox action selector，并在 `open / resolved / snoozed / archived` 四种 inbox 状态下继续锁定新的 inbox contract。
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 已新增真实浏览器断言：live thread scene 里的 `decisionCard` 与 `commentThreadCard` 必须显式露出新的 decision / inbox action selector。
- 已完成：`rtk node --check src/workspace-docs.js`、`rtk node --check test/workspace-docs.test.js`、`rtk node --check scripts/workspace-execution-guide-live-uat.playwright.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过，`25 / 25` 全绿；定向 `rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 decision / inbox inline action contract；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 5226`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778465712527`，检查时间 `2026-05-11T02:15:16.345Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且 live thread scene 已开始直接命中新补的 decision / inbox action selector。
- 当前备注：
  - 这轮之后，thread scene 的高频动作区已经基本完成 selector contract 收口：workflow、compose、comment、decision、inbox 都开始共享同一层 thread inline action 语言
  - 后续更值得继续看的，会是这些 shared contract 是否要在 workspace 首页 attention / governance 入口继续做汇总展示，或者把相同 contract 用到其他还残留匿名 action 区的轻量卡片上

## 2026-05-11 thread workflow / compose / comment cards 已补 shared inline action contract

- 已完成：`src/workspace-docs.js` 现在会在 thread scene 的 workflow card、compose card 与 comment thread card 动作区显式露出统一 contract，不再让 execution doc / thread 现场继续停在匿名 textarea + buttons 结构。
- 已完成：workflow card 新增并对齐后的稳定 selector 为：
  - `data-thread-inline-action-box="workflow"`
  - `data-thread-inline-action-note="workflow"`
  - `data-thread-inline-action-list="workflow"`
  - `data-thread-inline-action-button="continue" | "improve" | "retry" | "stop"`
- 已完成：compose card 新增并对齐后的稳定 selector 为：
  - `data-thread-inline-action-box="compose"`
  - `data-thread-inline-action-note="compose"`
  - `data-thread-inline-action-list="compose"`
  - `data-thread-inline-action-button="comment" | "yellow" | "red"`
- 已完成：comment thread card 新增并对齐后的稳定 selector 为：
  - `data-thread-inline-action-box="comment"`
  - `data-thread-inline-action-note="comment"`
  - `data-thread-inline-action-list="comment-reply" | "comment-command" | "comment-promote"`
  - `data-thread-inline-action-button="comment" | "continue" | "improve" | "retry" | "stop" | "yellow" | "red"`
- 已完成：这轮没有改 server route，也没有改 thread comment / workflow / compose 行为本身；旧的 `data-workflow-note / data-workflow-action`、`data-compose-note / data-compose-mode`、`data-comment-reply-note / data-comment-reply-mode / data-comment-command-action / data-comment-promote-action / data-comment-escalate-mode` 仍保留给现有 handler 使用，新增的是 shared inline action contract 层。
- 已完成：`test/workspace-docs.test.js` 已在待拍板与已接回执行两类 thread scene 场景里锁定 workflow / compose / comment 三组 inline action selector，不再只验证 scene-card body / checklist relation。
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 已新增真实浏览器断言：live thread scene 里的 `threadWorkflowCard`、`composeCard` 与 `commentThreadCard` 必须显式露出新的 shared inline action selector。
- 已完成：`rtk node --check src/workspace-docs.js`、`rtk node --check test/workspace-docs.test.js`、`rtk node --check scripts/workspace-execution-guide-live-uat.playwright.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过，`25 / 25` 全绿；定向 `rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 thread inline action contract；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 98680`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778464880351`，检查时间 `2026-05-11T02:01:24.230Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且 live thread scene 已开始直接命中新补的 workflow / compose / comment action selector。
- 当前备注：
  - 这轮之后，thread scene 不再只是上半区 guidance 和 summary 可测，真正承接协作动作的 workflow / compose / comment 三个入口也开始拥有稳定 contract
  - 后续更值得继续看的，会是 decision card 与 inbox action area 是否也要继续并进到同一层 shared action contract，或者把这些 contract 在 workspace 首页 attention / governance 入口上继续汇总展示

## 2026-05-11 memory reviewer governance panels 已补 shared inline action contract

- 已完成：`src/workspace-docs.js` 现在会在 memory reviewer 的 candidate / suggestion 治理动作区显式露出统一 contract，不再让 docs/memory 现场继续停在匿名 textarea + button 结构。
- 已完成：candidate memory panel 新增并对齐后的稳定 selector 为：
  - `data-memory-inline-action-box="memory"`
  - `data-memory-inline-action-note="memory"`
  - `data-memory-inline-action-list="memory"`
  - `data-memory-inline-action-button="accepted" | "needs_followup" | "rejected" | "refresh"`
- 已完成：suggestion panel 新增并对齐后的稳定 selector 为：
  - `data-memory-inline-action-box="suggestion"`
  - `data-memory-inline-action-note="suggestion"`
  - `data-memory-inline-action-list="suggestion"`
  - `data-memory-inline-action-button="accept" | "reject"`
- 已完成：这轮没有改 server route，也没有改 reviewer / suggestion 行为本身；旧的 `data-memory-review-box / data-memory-review-note / data-memory-review-action / data-memory-reviewer-refresh` 与 `data-suggestion-review-box / data-suggestion-review-note / data-suggestion-review-action` 仍保留给现有 handler 使用，新增的是 shared inline action contract 层。
- 已完成：`test/workspace-docs.test.js` 已在 memory reviewer 场景里锁定 candidate / suggestion 两类治理卡的 `action-box / note / action-list / button` selector，不再只验证卡体正文和按钮文案。
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 已新增真实浏览器断言：live memory reviewer 首屏里的 candidate / suggestion 治理卡必须显式露出新的 shared inline action selector。
- 已完成：`rtk node --check src/workspace-docs.js`、`rtk node --check test/workspace-docs.test.js`、`rtk node --check scripts/workspace-execution-guide-live-uat.playwright.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过，`25 / 25` 全绿；定向 `rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 memory reviewer inline action contract；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 94925`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778464403069`，检查时间 `2026-05-11T01:53:26.498Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且 live memory reviewer 首屏已开始直接命中新补的治理动作 selector。
- 当前备注：
  - 这轮之后，docs/memory reviewer 不再只是卡体 body / meta / next-step 可测，真正承接 reviewer 决策的 textarea + CTA 区也开始拥有稳定 contract
  - 后续更值得继续看的，会是 thread scene 的 compose / comment action area 是否也要补同样的 note / action-list selector，而不是继续让首页与 memory reviewer 已收口、线程现场仍保留匿名 textarea + buttons

## 2026-05-11 homepage decision / comment cards 已补 shared inline action contract

- 已完成：`src/task-dashboard.js` 现在会在 homepage decision card 的动作区显式露出 `data-home-inline-action-box="decision"`、`data-home-inline-action-note="decision"`、`data-home-inline-action-list="decision"` 与 `data-home-inline-action-button="approved" | "changes_requested" | "retry_requested" | "stopped"`。
- 已完成：首页 comment card 的动作区也开始显式露出 `data-home-inline-action-box="comment"`、`data-home-inline-action-note="comment"`、`data-home-inline-action-list="comment"`，并为 `发送回复 / 继续执行 / 升黄灯 / 升红灯 / 要求修改 / 重新执行 / 停止任务` 补齐 `data-home-inline-action-button`。
- 已完成：这轮没有改 server route，也没有改首页动作行为本身；旧的 `data-home-decision-box / data-home-comment-box` 仍可继续被现有 handler 使用，新增的是 shared inline action contract 层。
- 已完成：`test/workspace-dashboard.test.js` 已在 homepage fallback 场景里锁定 `decision-focus-card` 与 `comment-workflow-card` 的 inline action selector，不再只验证 body-context / middle-context。
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 已新增真实浏览器断言：workspace 首页里的 `homeDecisionCard` 与 `homeCommentCard` 必须显式露出新的 action-box / note / action-list selector；comment 卡这轮也把 strict-mode 断言收紧成“shared selector 的首个按钮可见”，避免多个 action button 同时存在时被误判成失败。
- 已完成：`rtk node --check src/task-dashboard.js`、`rtk node --check test/workspace-dashboard.test.js`、`rtk node --check scripts/workspace-execution-guide-live-uat.playwright.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 homepage inline action contract；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 92293`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778464094457`，检查时间 `2026-05-11T01:48:18.313Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且首页 `homeDecisionCard / homeCommentCard` 已开始直接命中新补的 inline action selector。
- 当前备注：
  - 这轮之后，homepage 的协作入口不再只是卡体结构一致，动作区也开始拥有稳定 selector contract；decision / comment 两类直达动作终于和 memory governance 站到了相近层级
  - 后续更值得继续看的，会是 docs/memory reviewer action panel 和 thread scene compose / comment action area 是否也要补同样的 note / action-list selector，而不是继续让首页已收口、文档/线程现场仍保留匿名 textarea + buttons

## 2026-05-11 homepage memory-governance card 已补 meta-grid + action-box contract

- 已完成：`src/task-dashboard.js` 新增首页侧 `renderMetaGrid(...)` 与 `renderWorkflowNextSection(...)`，首页 `memory-governance-center` 的 home grid card 不再继续停在 relation + 自由 callout 结构。
- 已完成：这轮新增 / 对齐后的稳定 contract 重点为：
  - `data-meta-grid-context="home-memory-governance-card"`
  - `data-meta-grid-row="lifecycle" | "review-state" | "governance-node" | "current-judgment" | "reviewer-summary" | "evidence" | "freshness" | "evidence-delta" | "revalidation" | "human-review" | "source-anchor"`
  - `data-workflow-next-block="next-step"`
  - `data-home-memory-governance-meta-list`
  - `data-home-memory-governance-meta-item`
  - `data-home-governance-action-box="memory" | "suggestion"`
  - `data-home-governance-action-note="memory" | "suggestion"`
  - `data-home-governance-action-list="memory" | "suggestion"`
  - `data-home-governance-action-button="accepted" | "needs_followup" | "rejected" | "refresh-reviewer" | "accept" | "reject"`
- 已完成：首页记忆治理卡里的 `生命周期 / Review / 当前治理节点 / 当前判断 / Reviewer 建议 / 最近证据 / Freshness 体检 / 证据变化 / 重新校验建议 / 最近人工判断 / 最近 source 锚点` 现在都能直接按 meta-grid row key 定位；“这一步判断 / 下一步”也开始拥有稳定 `workflow-next` selector。
- 已完成：`renderCards(...)` 这轮还给首页记忆治理卡的 meta 列表补了 `data-home-memory-governance-meta-list / item`，同时把 memory 与 suggestion 两类首页直达治理动作补上统一 action-box selector。
- 已完成：`test/workspace-dashboard.test.js` 已在 homepage memory governance 场景里锁定新的 meta-grid / workflow-next / meta-list / action-box contract，并对 snake_case-only payload 继续断言 `reviewer-summary / source-anchor / action-box` 这些新 selector 真实存在。
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 已新增真实浏览器断言：workspace 首页里的 `homeGridCard` 必须显式命中 `data-meta-grid-context="home-memory-governance-card"`、`data-workflow-next-block="next-step"`、`data-home-memory-governance-meta-list` 与 `data-home-governance-action-box`。
- 已完成：`rtk node --check src/task-dashboard.js`、`rtk node --check test/workspace-dashboard.test.js`、`rtk node --check scripts/workspace-execution-guide-live-uat.playwright.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 homepage memory-governance card contract；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 89631`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778463776290`，检查时间 `2026-05-11T01:42:59.866Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且首页 `homeGridCard` 已开始直接命中新补的 meta-grid / workflow-next / action-box selector。
- 当前备注：
  - 这轮之后，首页 memory governance 不再只是“中枢 summary 很完整，但卡片里还是自由 callout”；真正承接治理动作的 home grid card 也开始拥有可定位、可验证的 detail grid、next-step 区和 action box
  - 后续更值得继续看的，会是 homepage decision / comment 两类 inline action box 是否也要收进同一层 action contract，或者 docs/memory reviewer action panel 是否也要补同样的 note / action-list selector

## 2026-05-11 memory-governance-card 已补 scene-card body + governance meta contract

- 已完成：`src/workspace-docs.js` 的 `renderMemoryGovernanceCard(...)` 现在会先构建 `governanceBodyBlocks`，再统一接回 `renderSceneCardBodyBlocks(...)`，不再让治理卡继续停在 relation + list / textarea 混合布局。
- 已完成：这轮新增 / 对齐后的稳定 contract 重点为：
  - `data-scene-card-body-context="memory-governance-card"`
  - `data-scene-card-body-middle="memory-governance-details"`
  - `data-meta-grid-context="memory-governance-card"`
  - `data-meta-grid-row="lifecycle" | "review-state" | "reviewer-summary" | "evidence" | "freshness" | "evidence-delta" | "revalidation" | "human-review" | "source-anchor"`
  - `data-memory-governance-meta-list`
  - `data-memory-governance-meta-item`
  - `data-workflow-next-block="next-step"`
- 已完成：治理卡里的 `生命周期 / Review / Reviewer 判断 / 最近证据 / Freshness 体检 / 证据变化 / 重新校验建议 / 最近人工判断 / 最近 source 锚点` 现在都能直接按 meta-grid row key 定位；原有 `normalizedCard.meta` 列表也开始显式暴露自己的 list / item selector。
- 已完成：`test/workspace-docs.test.js` 已在 memory reviewer 场景里锁定上述 governance-card body-context / middle / meta-grid / workflow-next / meta-list contract。
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 已新增真实浏览器断言：live memory reviewer 首屏里的 `governanceCardWithChecklist` 必须显式露出 `data-scene-card-body-context="memory-governance-card"`、`data-scene-card-body-middle-context="memory-governance-card"`、`data-meta-grid-context="memory-governance-card"`、`data-memory-governance-meta-list` 与 `data-workflow-next-block="next-step"`。
- 已完成：`rtk node --check src/workspace-docs.js`、`rtk node --check test/workspace-docs.test.js`、`rtk node --check scripts/workspace-execution-guide-live-uat.playwright.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过，`25 / 25` 全绿；定向 `rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 governance-card contract；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 82123`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778462843776`，检查时间 `2026-05-11T01:27:27.380Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且 live memory reviewer 首屏已开始直接命中新补的 governance-card body / meta / workflow-next selector。
- 已完成：这轮 restart 与 live UAT 按顺序执行后未再触发那次已知的 `ECONNREFUSED 127.0.0.1:19100` handover 窗口，说明当前本地执行 checklist 的顺序规避仍然有效。
- 当前备注：
  - 这轮之后，docs/memory reviewer 首屏不再只有上半区两张 reviewer 卡拥有稳定 contract；下方真正承接治理动作的 `memory-governance-card` 也开始拥有可定位、可验证的 body / meta / next-step 结构
  - 后续更值得继续看的，会是治理卡下方 action panel / textarea / CTA 是否也要继续收进同一层结构化 action contract，或者 homepage memory governance card 是否也要对齐同一套 body / meta-grid 路径

## 2026-05-11 memory reviewer focus / summary cards 已补 scene-card body + meta-grid contract

- 已完成：`src/workspace-docs.js` 的 `renderMemoryRightRail(...)` 现在会先构建 `memoryReviewerFocusBodyBlocks` 与 `memoryReviewerSummaryBodyBlocks`，并分别接回 `renderSceneCardBodyBlocks(...)`，不再让 reviewer 右栏两张核心卡继续停在 relation-only + 自由布局。
- 已完成：这轮新增 / 对齐后的稳定 contract 重点为：
  - `data-scene-card-body-context="memory-reviewer-focus-card" | "memory-reviewer-summary-card"`
  - `data-scene-card-body-middle="memory-reviewer-focus-details" | "memory-reviewer-summary-details"`
  - `data-meta-grid-context="memory-reviewer-focus-card" | "memory-reviewer-summary-card"`
  - `data-meta-grid-row="focus-title" | "focus-queue" | "focus-note" | "next-action" | "evidence"`
  - `data-meta-grid-row="focus-label" | "checklist-step" | "checklist-progress" | "evidence-delta" | "revalidation" | "checklist-focus" | "checkpoint-rule"`
  - `data-workflow-next-block="current-decision"`
- 已完成：焦点卡现在显式露出 `当前焦点 / 当前队列 / 当前说明 / 下一步 / 最近证据` 的 row-level selector；`Reviewer 摘要` 卡现在也显式露出 `当前判断` 和 `当前焦点 / 当前队列 / 与当前聚焦关系 / 关联闭环 / 执行清单 / 最近证据 / 证据变化 / 重新校验 / 当前主闭环 / 推进规则` 的 row-level selector。
- 已完成：`test/workspace-docs.test.js` 已在 memory reviewer 场景里锁定上述 body-context / middle / meta-grid / workflow-next contract。
- 已完成：这轮还把单测加严了一层：不再只用整页模糊匹配 `与当前闭环关系`，而是直接要求 `data-scene-card-body-context="memory-reviewer-focus-card" | "memory-reviewer-summary-card"` 自身命中这句 copy，避免目标卡改词时被整页其他文案掩盖。
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 已新增真实浏览器断言：live memory reviewer 首屏里的 `reviewerFocusCard` 与 `reviewerSummaryCard` 必须显式露出各自的 body-context / middle / meta-grid，并且 `reviewerSummaryCard` 还要命中 `data-workflow-next-block="current-decision"`。
- 已完成：`rtk node --check src/workspace-docs.js`、`rtk node --check test/workspace-docs.test.js`、`rtk node --check scripts/workspace-execution-guide-live-uat.playwright.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过，`25 / 25` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：browser UAT 这轮真实抓到一处 copy regression：我最初把两张卡的 relation 标题误收成了 `当前闭环关系`，导致 reviewer focus card 丢掉了既有 `与当前闭环关系` 语气；现已修回并同步加严单测。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 memory reviewer body contract；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 78869`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778462343479`，检查时间 `2026-05-11T01:19:06.850Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且 live memory reviewer 首屏已开始直接命中新补的 body / meta / workflow-next selector。
- 当前备注：
  - 这轮之后，memory reviewer 首屏不再只是“右栏两张卡能看到 checklist relation”；它们自己的内部 detail 也开始拥有稳定 body / meta 钩子
  - 后续更值得继续看的，会是下方 `memory-governance-card` 列表卡是否也要继续接到同一层 body / workflow-next / meta-grid，而不是继续停在 relation + list / textarea 混合布局

## 2026-05-11 memory reviewer 右栏四格摘要已共享 keyed stats renderer

- 已完成：`src/workspace-docs.js` 的 `renderMemoryRightRail(...)` 现在已切到共享 `renderThreadStatsGrid(...)`，docs/memory reviewer 右栏那组四格摘要不再继续手写匿名 `<div class="thread-stat">` 布局。
- 已完成：这轮新增 / 对齐后的稳定 contract 重点为：
  - `data-thread-stats-context="memory-reviewer-focus-card"`
  - `data-thread-stat="candidates" | "reviews" | "suggestions" | "actionable-total"`
  - `data-thread-stat-value`
  - `data-thread-stat-label`
- 已完成：`记忆候选 / Review 队列 / 相关 Suggestions / 待治理总数` 四个格子现在都能直接按 key 定位，而不再需要靠文案顺序或 class 名猜当前 summary 结构。
- 已完成：`test/workspace-docs.test.js` 已在 memory reviewer 场景里锁定 `data-thread-stats-context="memory-reviewer-focus-card"` 以及四个 keyed stat item。
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 已新增真实浏览器断言：live memory reviewer 首屏里的 `reviewerStats` 必须显式露出四个 keyed stat item，并且每个 item 都要命中自己的 `data-thread-stat-value`。
- 已完成：`rtk node --check src/workspace-docs.js`、`rtk node --check test/workspace-docs.test.js`、`rtk node --check scripts/workspace-execution-guide-live-uat.playwright.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过，`25 / 25` 全绿；定向 `rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 memory reviewer stats contract；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 72675`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778461575847`，检查时间 `2026-05-11T01:06:22.734Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且 live memory reviewer 首屏已开始直接命中新补的 keyed stats selector。
- 已完成：这轮重启后的首轮 UAT 同样先撞到一次 `ECONNREFUSED 127.0.0.1:19100`，但 `automation:status` 同时确认 listener 与 managed runtime 已健康；随后的同命令重跑即通过，所以这里继续记为 restart handover 窗口，不记为产品回归。
- 当前备注：
  - 这轮之后，docs/memory reviewer 右栏的四格摘要不再只是“看起来有四个数字”；自动化和前台都能直接按 key 定位 `记忆候选 / Review 队列 / 相关 Suggestions / 待治理总数`
  - 后续更值得继续看的，会是 `memory-reviewer-focus-card` / `memory-reviewer-summary-card` 内部正文是否也要继续接到 scene-card body / workflow-next / meta-grid contract，而不是继续停在 relation-only + 自由布局

## 2026-05-11 docs thread-stats 四格摘要已补显式 keyed contract

- 已完成：`src/workspace-docs.js` 新增 `renderThreadStatsGrid(...)`，docs execution thread 右栏这组四格摘要不再继续手写匿名 `<div class="thread-stat">` 布局。
- 已完成：这轮新增 / 对齐后的稳定 contract 重点为：
  - `data-thread-stats-context="thread-focus-card"`
  - `data-thread-stat="open-decisions" | "events" | "related-tasks" | "red-signals"`
  - `data-thread-stat-value`
  - `data-thread-stat-label`
- 已完成：`待拍板 / 线程事件 / 关联任务 / 红灯数量` 四个格子现在都能直接按 key 定位，而不再需要靠文案顺序或 class 名猜当前 summary 结构。
- 已完成：`test/workspace-docs.test.js` 已在待拍板与已接回执行两类线程场景里锁定 `data-thread-stats-context="thread-focus-card"` 以及四个 keyed stat item。
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 已新增真实浏览器断言：live thread scene 里的 `threadStats` 必须显式露出四个 keyed stat item，并且每个 item 都要命中自己的 `data-thread-stat-value`。
- 已完成：`rtk node --check src/workspace-docs.js`、`rtk node --check test/workspace-docs.test.js`、`rtk node --check scripts/workspace-execution-guide-live-uat.playwright.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过，`25 / 25` 全绿；定向 `rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 thread-stats contract；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 69444`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778461113960`，检查时间 `2026-05-11T00:58:37.574Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且 live thread scene 已开始直接命中新补的 thread-stats keyed selector。
- 已完成：这轮重启后的首轮 UAT 曾短暂命中过一次 `ECONNREFUSED 127.0.0.1:19100`，但 `automation:status` 同时确认 listener 与 managed runtime 都健康；随后的同命令重跑即通过，所以这里记为 restart handover 窗口，不记为产品回归。
- 当前备注：
  - 这轮之后，docs execution thread 右栏的四格摘要不再只是“看起来有四个数字”；自动化和前台都能直接按 key 定位 `待拍板 / 线程事件 / 关联任务 / 红灯数量`
  - 后续更值得继续看的，会是 memory reviewer 右栏那组同类 `thread-stats` 是否也要接到同一 renderer，而不是继续保留另一份匿名 four-cell 布局

## 2026-05-11 execution checklist progress / mini-grid 已补 scene-body + detail selector contract

- 已完成：`renderExecutionChecklistCard(...)` 现在已接回 `renderSceneCardBodyBlocks(...)`，不再让 execution checklist 卡只有 shared `thread-state`，却把进度、meta、KPI、remaining 和 mini-grid 留在匿名布局里。
- 已完成：这轮新增 / 对齐后的稳定 contract 重点为：
  - `data-scene-card-body-context="execution-checklist-card"`
  - `data-scene-card-body-middle="execution-checklist-details"`
  - `data-checklist-progress`
  - `data-checklist-progress-top`
  - `data-checklist-progress-label`
  - `data-checklist-progress-value`
  - `data-checklist-progress-bar`
  - `data-checklist-progress-fill`
  - `data-meta-grid-context="execution-checklist-card"`
  - `data-meta-grid-row="focus-title" | "focus-status" | "evidence" | "acceptance" | "checkpoint-rule" | "heartbeat-note"`
  - `data-checklist-kpis`
  - `data-checklist-kpi="completed" | "in-progress" | "pending"`
  - `data-checklist-context-links="focus" | "revisit" | "remaining"`
  - `data-checklist-context-link`
  - `data-checklist-context-item`
  - `data-checklist-mini-grid`
  - `data-checklist-mini-item`
  - `data-checklist-mini-status`
  - `data-checklist-mini-step`
  - `data-checklist-mini-label`
  - `data-checklist-mini-title`
  - `data-checklist-mini-summary`
  - `data-checklist-mini-evidence`
- 已完成：`renderMetaGrid(...)` 这轮继续复用前一轮的 `context + item.key` 能力，因此 execution checklist 的 `当前主闭环 / 当前焦点状态 / 最近证据 / 验收条件 / 推进规则 / 自动唤醒` 也都开始拥有稳定 row-level selector。
- 已完成：`test/workspace-docs.test.js` 已在待拍板与已接回执行两类线程场景里锁定：
  - `execution-checklist-card` 的 `body-context / middle`
  - `data-checklist-progress`
  - `data-meta-grid-context="execution-checklist-card"`
  - `data-meta-grid-row="focus-title" | "acceptance"`
  - `data-checklist-kpis`
  - `data-checklist-kpi="completed" | "in-progress"`
  - `data-checklist-mini-grid`
  - `data-checklist-mini-item`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 已新增真实浏览器断言：live thread scene 里的 `executionChecklistCard` 必须显式露出 `body-context / middle / progress / meta-grid / kpis / mini-grid`，不再只是验证状态 copy。
- 已完成：`rtk node --check src/workspace-docs.js`、`rtk node --check test/workspace-docs.test.js`、`rtk node --check scripts/workspace-execution-guide-live-uat.playwright.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过，`25 / 25` 全绿；定向 `rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 checklist detail contract；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 63623`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778460031910`，检查时间 `2026-05-11T00:40:35.829Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且 live thread scene 已开始直接命中新补的 execution checklist detail selector。
- 当前备注：
  - 这轮之后，execution checklist 不再只是“有 shared 状态文案的一张卡”；它内部的 progress / meta / KPI / mini-grid 也已经开始拥有稳定结构 contract
  - 后续更值得继续看的，会是 `thread-stats` 这类 still-local summary 结构是否也要继续收口，而不是继续停留在匿名 `thread-stat` 布局

## 2026-05-11 execution summary / source recovery 内部 detail 已补 scene-body / workflow-next contract

- 已完成：`execution-summary-card` 现在已接回 `renderSceneCardBodyBlocks(...)`，不再把 `卡点原因 / 需要你做什么 / 推荐动作 / meta-grid` 直接散落在卡片根节点。
- 已完成：`source-recovery` 现在也已接回 `renderSceneCardBodyBlocks(...)`，不再把 `证据说明 / 建议处理 / 建议来源 / 直接修补来源` 停留在匿名 `workflow-next` 布局。
- 已完成：这轮新增 / 对齐后的稳定 contract 重点为：
  - `data-scene-card-body-context="execution-summary-card" | "source-recovery"`
  - `data-scene-card-body-middle="execution-summary-details" | "source-recovery-details"`
  - `data-workflow-next-block="blocker-reason" | "requested-human-action" | "recommended-action" | "evidence-detail" | "cleanup-hint" | "suggestion-hint" | "source-repair"`
  - `data-meta-grid-context="execution-summary-card" | "source-recovery" | "source-recovery-suggestions"`
  - `data-meta-grid-row="current-node" | "why-now" | "impact-scope" | "evidence" | "residual-pattern" | "evidence-status" | "source-label" | "latest-checkpoint" | "checkpoint-summary"`
- 已完成：`renderMetaGrid(...)` 这轮已补 `context` 与 `item.key`，因此 execution summary / source recovery 的 detail rows 现在也有稳定 row-level selector，不再只能靠整张卡的全文命中。
- 已完成：`test/workspace-docs.test.js` 已分别锁定：
  - 通用 execution doc 场景下的 `execution-summary-card` `body-context / middle / blocker-reason / requested-human-action / meta-grid row=current-node`
  - waiting-decision 场景下的 `why-now / impact-scope / evidence` meta-grid row
  - source recovery 场景下的 `source-recovery-details`、`cleanup-hint / suggestion-hint / source-repair`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 已新增真实浏览器断言：live thread scene 里的 `executionSummaryCard` 必须显式露出 `body-context / middle / blocker-reason / requested-human-action / meta-grid-context`。
- 已完成：`rtk node --check src/workspace-docs.js`、`rtk node --check test/workspace-docs.test.js`、`rtk node --check scripts/workspace-execution-guide-live-uat.playwright.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过，`25 / 25` 全绿；定向 `rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 detail contract；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 60229`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778459429082`，检查时间 `2026-05-11T00:30:32.729Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且 live thread scene 已开始直接命中新补的 execution-summary detail contract。
- 当前备注：
  - 这轮之后，execution summary 与 source recovery 的内部 detail 不再只是“文案块存在”；它们也已经能通过 `scene-card body / workflow-next / meta-grid` 结构钩子稳定验证
  - 后续更值得继续看的，会是 `execution checklist` 的 progress / mini-grid 与 `thread stats` 这类 still-local summary 结构，是否也要继续收口到同一层 body/meta contract，而不是继续停留在匿名布局

## 2026-05-11 docs execution overview / compact cards 已补 shared context-block contract

- 已完成：`src/workspace-docs.js` 新增 `renderThreadStateSceneBlock(...)` 与 `renderChecklistRelationSceneBlock(...)`，不再让 docs execution 里的 overview / compact 卡一部分只能靠文本断言，另一部分才能走统一的结构 contract。
- 已完成：以下 thread-facing 卡现在都会显式挂出 shared state / relation context block：
  - `thread-focus-card`
  - `execution-summary-card`
  - `execution-checklist-card`
  - `source-recovery`
  - `compose-card`
  - `comment-summary-card`
  - `comment-filter-status`
  - `thread-event-summary-card`
  - `thread-event-card`
  - `thread-task-card`
- 已完成：这轮补齐 / 对齐后的稳定 contract 重点为：
  - `data-scene-card-context-block="thread-state"`
  - `data-scene-card-context-block="checklist-relation"`
  - `data-checklist-relation-context="execution-summary-card" | "comment-summary-card" | "comment-filter-status" | "thread-event-summary-card" | "compose-card" | "thread-focus-card" | "source-recovery" | "thread-event-card" | "thread-task-card"`
- 已完成：`test/workspace-docs.test.js` 现已同时锁定待拍板与已接回执行两类线程场景，明确要求上述 overview / compact 卡都命中 shared context-block contract，而不只是出现同一段状态 copy。
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 已升级成浏览器级断言：thread scene 里的 `threadFocus / executionChecklist / executionSummary / compose / commentSummary / commentFilterStatus / threadEventSummary / threadEventCard / threadTaskCard` 都必须带 `data-scene-card-context-block`。
- 已完成：`rtk node --check src/workspace-docs.js`、`rtk node --check test/workspace-docs.test.js`、`rtk node --check scripts/workspace-execution-guide-live-uat.playwright.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过，`25 / 25` 全绿；定向 `rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 context-block contract；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 55561`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778458518395`，检查时间 `2026-05-11T00:15:21.887Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且 live thread scene 已开始直接命中新补的 overview / compact card context-block selector。
- 当前备注：
  - 这轮之后，docs execution 的总览卡与 compact 卡不再只是“文案和 scene-card 接近”；它们也已经能被同一层 `thread-state / checklist-relation` selector contract 稳定验证
  - 后续更值得继续看的，会是 `execution summary` 内部的 `卡点原因 / 需要你做什么 / 为什么现在处理 / 影响范围 / 证据` 与 `source recovery` 细节块，是否也要继续收口到 scene-card body / workflow-next contract，而不是继续停在局部自由布局

## 2026-05-11 thread-group filter membership / filtered-reason 已补显式 contract

- 已完成：`src/task-dashboard.js` 新增 `buildThreadFilterLabelMap(...)`、`resolveThreadGroupFilterLabels(...)`、`buildThreadGroupFilterNote(...)`、`buildThreadGroupVisibilityReason(...)`，不再让 thread scene 只能知道 group 是 visible 还是 hidden，却不知道这条线程到底归在哪些筛选桶里、为什么当前会被过滤掉。
- 已完成：thread scene 这轮新增稳定 selector / state contract：
  - `data-thread-group-filter-note`
  - `data-thread-group-filter-membership`
  - `data-thread-group-visibility-reason`
- 已完成：thread-group headline 现在会显式露出 `当前归类：...`，让可见线程自己说明它落在哪些状态桶里；隐藏 group 也会继续通过 `data-thread-group-filter-membership` 与 `data-thread-group-visibility-reason` 说清楚当前筛选和隐藏原因。
- 已完成：服务端首屏与前台 `setThreadFilter(...)` 现在都会同步刷新这层 reason contract，不再出现 `active-filter` 已切换、但 reason 还停在旧筛选的问题。
- 已完成：这轮没有新增 route、schema 或持久化对象；只是把 thread-group 的 filter membership / filtered-reason 从隐式推断收成显式 contract。
- 已完成：`test/workspace-dashboard.test.js` 现已直接锁定：
  - `data-thread-group-filter-note`
  - `data-thread-group-filter-membership`
  - 默认 `all` 场景下的 `data-thread-group-visibility-reason="当前筛选是“全部”，这条线程默认展示。"`
  - `thread_filter=ready` 且首屏 `0 条线程` 场景下的 `data-thread-group-visibility-reason="当前筛选是“已接回执行”...暂时隐藏。"`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 已新增真实浏览器断言：
  - 每次切换 filter 后，所有 group 都会继续带 `data-thread-group-filter-membership`
  - 第一条 group 的 `data-thread-group-visibility-reason` 会和当前筛选 label 同步
  - seeded 主线程默认首屏会显式露出 `data-thread-group-filter-note` 与 `data-thread-group-filter-membership`
- 已完成：真实浏览器 UAT 中间抓到一次 live-only 缺口：inline script 的 visibility reason 还依赖未注入 helper，导致 `active-filter` 已切换但 reason 仍停在 `全部`；现已改成自包含逻辑并重新验绿。
- 已完成：`rtk node --check src/task-dashboard.js`、`rtk node --check test/workspace-dashboard.test.js`、`rtk node --check scripts/workspace-execution-guide-live-uat.playwright.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 membership / reason contract；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 45481`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778456665180`，检查时间 `2026-05-10T23:44:28.491Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且 live thread scene 已开始直接命中新补的 membership / filtered-reason contract。
- 当前备注：
  - 这轮之后，thread scene 不再只是“这条 group 看得见还是看不见”；它会显式告诉前台和自动化这条线程当前归类在哪些筛选桶里，以及为什么在当前筛选下被展示或暂时隐藏
  - visibility state、membership 和 filtered-reason 现在已经站到同一层 contract 上；后续更值得继续看的，会是这些状态是否要进一步转成更强的用户可操作解释，而不是回头再补 DOM 可见性猜测

## 2026-05-11 thread-group visibility 已补显式 state contract

- 已完成：`src/task-dashboard.js` 新增 `buildThreadGroupFilterKeys(...)`、`normalizeThreadGroupFilterKeys(...)`、`buildThreadGroupVisibilityState(...)`，不再让 thread scene 的 group 显隐只靠 `hidden` 和匿名 filter token 隐式推断。
- 已完成：`filterThreadGroupsForView(...)`、thread scene 服务端渲染和前台 `setThreadFilter(...)` 现在都复用同一套 visibility 判定，避免首屏 HTML、切换筛选和 guide 统计各自维护不同逻辑。
- 已完成：thread scene 这轮新增稳定 selector / state contract：
  - `data-thread-group-active-filter`
  - `data-thread-group-visibility`
- 已完成：服务端首屏现在会直接给每个 `data-thread-group` 标出“当前按哪档 filter 评估”以及“当前是 visible 还是 hidden”；前台切换 `all / triage / ready / red / active / completed` 时，这两个 state 也会同步刷新。
- 已完成：这轮没有新增 route、schema 或持久化对象；只是把 thread-group 显隐状态从隐式 `hidden` 收成显式 contract。
- 已完成：`test/workspace-dashboard.test.js` 现已直接锁定：
  - 默认 `all` 场景下 `data-thread-group-active-filter="all"` 与 `data-thread-group-visibility="visible"`
  - `thread_filter=ready` 且首屏 `0 条线程` 场景下，group 会直接命中 `data-thread-group-active-filter="ready"`、`data-thread-group-visibility="hidden"`，并继续带 `hidden`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 已新增 thread scene 真实断言：
  - 每次切换 filter 后，所有 group 都会同步命中对应的 `data-thread-group-active-filter`
  - `data-thread-group-visibility="visible|hidden"` 的数量会和真实可见 group 数严格对齐
  - seeded 主线程在默认 `all` 首屏会显式暴露 `active-filter=all` 与 `visibility=visible`
- 已完成：`rtk node --check src/task-dashboard.js`、`rtk node --check test/workspace-dashboard.test.js`、`rtk node --check scripts/workspace-execution-guide-live-uat.playwright.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 visibility contract；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 39446`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778456069425`，检查时间 `2026-05-10T23:34:32.742Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且 live thread scene 已开始直接命中新补的 thread-group visibility state contract。
- 当前备注：
  - 这轮之后，thread scene 不再只是“看 group 有没有被 `hidden`”；每个 group 自己会显式告诉前台和自动化当前按哪档筛选评估、现在是 visible 还是 hidden
  - thread-group headline、stats、nested task list、panel head、filter summary、empty-state、filter bar 和 visibility state 现在已经都开始站到稳定 contract 上；后续更值得继续看的，会是 group 为什么被过滤掉的解释是否还要补强，而不是回头再补匿名显隐判断

## 2026-05-11 thread view panel head / filter summary / empty-state 已补稳定 selector contract

- 已完成：`src/task-dashboard.js` 新增 `buildThreadFilterState(...)`、`buildThreadFilterEmptyCopy(...)`、`renderThreadPanelHead(...)`、`renderThreadFilterEmptyState(...)`，不再让 thread scene 只能靠按钮高亮和匿名空态猜当前筛选。
- 已完成：thread view 这轮新增稳定 selector contract：
  - `data-thread-panel-head`
  - `data-thread-panel-title`
  - `data-thread-panel-note`
  - `data-thread-filter-summary`
  - `data-thread-filter-summary-label`
  - `data-thread-filter-summary-count`
  - `data-thread-filter-empty`
  - `data-thread-filter-empty-label`
  - `data-thread-filter-empty-count`
  - `data-thread-filter-empty-copy`
- 已完成：这轮没有新增 route、schema 或持久化对象；只是把 thread scene 的 panel head / 当前筛选摘要 / filter-aware empty-state 收回 dedicated helper，并补出可验证的 selector contract。
- 已完成：thread scene 首次服务端渲染现在会直接吃回 `thread_filter`，让非命中的 `thread-group` 在 HTML 首屏就带 `hidden`，并让 `ready=0` 这类 pinned 场景首屏直接露出当前筛选空态，不再必须等前台 JS 跑起来才对齐。
- 已完成：`test/workspace-dashboard.test.js` 现已直接锁定：
  - `data-thread-panel-head / title / note`
  - `data-thread-filter-summary-label / count`
  - 默认 `all` 场景下 `data-thread-filter-empty` 仍带 `hidden`
  - `thread_filter=ready` 场景下的服务端首屏空态：`已接回执行 / 0 条线程 / 当前筛选下没有已接回执行线程`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 已新增 thread scene 真实断言：
  - panel head 首屏命中 `按线程`
  - 切换 `all / triage / ready / red / active / completed` 时，`data-thread-filter-summary-label / count` 会和当前可见线程数同步
  - 当当前筛选没有可见线程时，`data-thread-filter-empty` 会显式露出对应 label / count / copy
- 已完成：`rtk node --check src/task-dashboard.js`、`rtk node --check test/workspace-dashboard.test.js`、`rtk node --check scripts/workspace-execution-guide-live-uat.playwright.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 panel-head / empty-state contract；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 31833`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778455388538`，检查时间 `2026-05-10T23:23:12.079Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且 live thread scene 已开始直接命中新补的 panel head / summary / empty-state selector。
- 当前备注：
  - 这轮之后，thread scene 顶部已经不再只是“看哪颗按钮亮”；panel head 本身会显式告诉前台和自动化当前筛选和可见线程数
  - filter bar、panel head、当前筛选摘要和空态现在都已经开始站到稳定 selector 上；后续更值得继续看的，会是 thread scene 是否还要把 visible group state 或筛选说明再继续收成更强的 contract，而不是回头补匿名 copy

## 2026-05-11 thread view filter bar 已补稳定 selector contract

- 已完成：`src/task-dashboard.js` 新增 `renderThreadFilterBar(...)`，不再让 thread view 顶部筛选条继续只靠按钮文案和顺序隐式表达。
- 已完成：thread view 这轮新增稳定 selector contract：
  - `data-thread-filter-bar`
  - `data-thread-filter-option`
  - `data-thread-filter-state`
  - `data-thread-filter-label`
  - `data-thread-filter-count`
- 已完成：这轮没有新增 route、schema 或持久化对象；只是把 thread scene 顶部 filter bar 收回 dedicated helper，并补出可验证的 selector contract 和 active-state 绑定。
- 已完成：`test/workspace-dashboard.test.js` 现已直接锁定：
  - `data-thread-filter="all"` 命中 `data-thread-filter-state="active"`
  - `data-thread-filter="triage"` / `data-thread-filter="completed"` 命中 `data-thread-filter-state="inactive"`
  - `data-thread-filter-label`
  - `data-thread-filter-count`
  - pinned `thread_filter=completed` 场景下 `completed` / `all` 的 active-state 切换
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 已新增 thread scene 真实断言：
  - `data-thread-filter-bar` 可见
  - `all / triage / ready / red / active / completed` 六个筛选按钮都命中 `data-thread-filter-label` 与 `data-thread-filter-count`
  - 点击 `triage / ready / red / active / completed` 后，会直接校验 `data-thread-filter-state` 在当前按钮与上一个按钮之间切换
- 已完成：`rtk node --check src/task-dashboard.js`、`rtk node --check test/workspace-dashboard.test.js`、`rtk node --check scripts/workspace-execution-guide-live-uat.playwright.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 filter contract；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 26465`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778454610539`，检查时间 `2026-05-10T23:10:13.854Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且 live thread scene 已开始直接命中新补的 filter bar selector 与 active-state。
- 当前备注：
  - 这轮之后，thread view 的 filter bar 不再只是“看按钮文案猜当前状态”，而是开始显式暴露 label / count / active-state contract
  - `thread-group` 分组卡与顶部 filter bar 现在都已经开始站到稳定 selector 上；后续更值得继续看的，会是 thread scene panel head / filtered empty-state / 当前筛选摘要是否也要进一步补 contract，而不是继续只让筛选条和分组卡可测

## 2026-05-11 thread-group headline 区已补稳定 selector contract

- 已完成：`src/task-dashboard.js` 新增 `renderThreadGroupHeadline(...)`，不再让 thread view `thread-group` 左侧 headline / key / overview 继续直接散落在模板里。
- 已完成：`thread-group` 这轮新增稳定 selector contract：
  - `data-thread-group-copy`
  - `data-thread-group-title`
  - `data-thread-group-meta`
  - `data-thread-group-key`
  - `data-thread-group-updated`
  - `data-thread-group-overview`
- 已完成：这轮没有新增 route、schema 或持久化对象；只是把 thread-group 左侧 headline 区收回 dedicated helper，并补出可验证的 selector contract。
- 已完成：`test/workspace-dashboard.test.js` 现已直接锁定 `data-thread-group` 下的：
  - `data-thread-group-title`
  - `data-thread-group-key`
  - `data-thread-group-updated`
  - `data-thread-group-overview`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 已新增针对 seeded `threadKey` 对应 group 的真实断言：
  - `data-thread-group-title` 命中 seeded thread 标题
  - `data-thread-group-key` 命中 seeded `threadKey`
  - `data-thread-group-updated` 命中 `最近更新`
  - `data-thread-group-overview` 命中 `红灯 / 待分流评论 / 已接回执行评论` 之一
- 已完成：全量 `rtk node --test` 已通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 headline contract；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 18431`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778453762479`，检查时间 `2026-05-10T22:56:07.439Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且 live thread scene 已开始直接命中新补的 headline selector。
- 当前备注：
  - 这轮之后，thread view `thread-group` 的 headline、stats rail、nested task list 和 checklist body 都已经开始站到稳定 selector contract 上
  - `thread-group` 分组卡目前已经基本没有匿名主结构；后续更值得继续看的，是 thread view filter / panel 级协作入口是否也要进一步补 contract，而不是继续只靠静态 copy 和按钮顺序判断

## 2026-05-11 thread-group stats rail 已补稳定 selector contract

- 已完成：`src/task-dashboard.js` 新增 `buildThreadGroupStatItems(...)` 与 `renderThreadGroupStats(...)`，不再让 thread view `thread-group-stats` 继续作为匿名 pills 直接散落在模板里。
- 已完成：`thread-group` 这轮新增稳定 selector contract：
  - `data-thread-group-stats`
  - `data-thread-group-stat="focus"`
  - `data-thread-group-stat="step"`
  - `data-thread-group-stat="tasks"`
  - `data-thread-group-stat="active"`
  - `data-thread-group-stat="completed"`
  - `data-thread-group-stat="red"`
  - `data-thread-group-stat="triage"`
  - `data-thread-group-stat="ready"`
- 已完成：这轮没有新增 route、schema 或持久化对象；只是把 thread scene 右侧 stats rail 收回 dedicated helper，并补出可验证的 selector contract。
- 已完成：`test/workspace-dashboard.test.js` 现已直接锁定 `data-thread-group` 下的：
  - `data-thread-group-stats`
  - `data-thread-group-stat="tasks"`
  - `data-thread-group-stat="red"`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 这轮不再用“第一个带有闭环关系的 group”做模糊匹配，而是直接锁定 seeded `threadKey` 对应的 `thread-group`；并新增断言：
  - `data-thread-group-stats` 可见
  - `data-thread-group-stat="tasks"` 命中 `1 个任务`
  - `data-thread-group-stat="red"` 命中 `1 个红灯`
- 已完成：全量 `rtk node --test` 已通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 stats rail contract；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 11897`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778453195072`，检查时间 `2026-05-10T22:46:38.439Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且 thread scene 已开始直接命中新补的 stats rail selector。
- 当前备注：
  - 这轮之后，thread view `thread-group` 的 checklist body、nested task list 和 stats rail 都已经不再是匿名结构，三块都开始暴露稳定 selector contract
  - `thread-group` 左侧 headline / key / overview 文案仍然保留自由拼接，还没有独立 selector contract
  - 后续如果继续推进，更值得继续看的，是 thread-group headline 区是否也要补可定位 contract，进一步收口 thread scene 分组层的完整可测性

## 2026-05-11 thread-group 已把 nested task list 接回 shared middle slot

- 已完成：`src/task-dashboard.js` 的 thread view `thread-group` 不再把 nested `thread-task-list` 单独挂在 checklist body 外侧；现在改为通过 `renderWorkspaceCardBodyBlocks(...)` 的 `middleHtml` 收回 shared middle slot。
- 已完成：`thread-group` 这轮新增稳定 selector contract：
  - `data-workspace-card-body-middle-context="thread-group"`
  - `data-workspace-card-body-middle="thread-group-details"`
  - `data-thread-group-task-list`
- 已完成：这轮没有新增 route、schema 或持久化对象；只是把 thread view 分组里的 nested task list 收回 shared workspace-card body middle slot，并补出稳定 selector contract。
- 已完成：`test/workspace-dashboard.test.js` 现已直接锁定 `data-thread-group` 下的：
  - `data-workspace-card-body-middle-context="thread-group"`
  - `data-workspace-card-body-middle="thread-group-details"`
  - `data-thread-group-task-list`
  - nested `data-workspace-task-card`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 现已在真实 thread scene 里直接断言：
  - `data-workspace-card-body-middle-context="thread-group"` 可见
  - `data-thread-group-task-list` 下存在可见的 nested `data-workspace-task-card`
- 已完成：全量 `rtk node --test` 已通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 `thread-group` middle slot；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 6634`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778452764508`，检查时间 `2026-05-10T22:39:27.629Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且 thread scene 已开始直接命中新补的 `thread-group` middle selector 与 nested task list contract。
- 当前备注：
  - 这轮之后，thread view `thread-group` 不只是 checklist relation / guidance 进入 shared body，连 nested task list 也开始站到同一条 stable middle-slot path 上
  - `thread-group-stats` 右侧统计条仍然保留各自结构，还没有并进 shared middle-slot contract
  - 后续如果继续推进，更值得继续看的，是 thread scene 里的 stats rail 是否也要接回同一层可定位 contract，进一步统一 thread-group 的执行细节可见性

## 2026-05-11 thread-group 已接回 shared workspace-card body

- 已完成：`src/task-dashboard.js` 的 thread view `thread-group` header 不再各自手写 `checklist relation + checklist guidance`，现在改为通过 shared `renderWorkspaceCardBodyBlocks(...)` 输出。
- 已完成：`thread-group` 现在会稳定暴露：
  - `data-workspace-card-body-context="thread-group"`
- 已完成：这轮没有新增 route、schema 或持久化对象；只是把 thread view 分组头部的 checklist 主体收回 shared workspace-card body，并补出稳定 selector contract。
- 已完成：`test/workspace-dashboard.test.js` 现已直接锁定 `data-thread-group` 下的：
  - `与当前闭环关系`
  - `执行清单：4 / 5 已收口`
  - `data-workspace-card-body-context="thread-group"`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 现已在真实 thread scene 里直接断言：
  - 可见 `data-thread-group`
  - 可见 `与当前闭环关系`
  - 可见 `执行清单：`
  - 可见嵌套的 `data-workspace-card-body-context="thread-group"`
- 已完成：全量 `rtk node --test` 已通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 `thread-group` shared body；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 99696`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778452055290`，检查时间 `2026-05-10T22:27:38.681Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且 thread scene 已开始直接命中新补的 `thread-group` body selector。
- 当前备注：
  - 这轮之后，首页 `decision / comment / home-grid`、工作台 `workspace-task-card` 与 thread view `thread-group` 都已经开始站到稳定的 shared body contract 上
  - thread view 里 `thread-group-stats` 与下方 `thread-task-list` 仍然保留各自结构，还没有并进 shared middle-slot contract
  - 后续如果继续推进，更值得继续看的，是 thread scene 里分组统计区与任务列表是否也要接回同一层可定位 contract，进一步统一 workspace/thread checklist 可见性

## 2026-05-11 workspace-task-card 已接回 shared workspace-card body

- 已完成：`src/task-dashboard.js` 新增 `renderWorkspaceCardBodyBlocks(...)`，开始统一承接 workspace task card 的 checklist/panel 主体。
- 已完成：`renderWorkspaceTaskCard(...)` 不再各自手写：
  - `checklist relation`
  - `checklist guidance`
  - `workspace proof grid`
  - `next step`
  现在改为通过 shared `workspace-card body` 输出。
- 已完成：`workspace-task-card` 现在会稳定暴露：
  - `data-workspace-card-body-context="workspace-task-card"`
  - `data-workspace-card-body-middle-context="workspace-task-card"`
  - `data-workspace-card-body-middle="workspace-task-details"`
- 已完成：这轮 `middleHtml` 现在开始承接：
  - `卡点原因`
  - `当前节点`
  - `执行链`
  - `最近回执 / Checkpoint 摘要`
  - `推荐动作 / 下一步`
  因此工作台主任务卡不再只是“有 checklist 关系”，而是开始把执行证据和下一步一起挂进同一条 shared body path。
- 已完成：这轮没有新增 route、schema 或持久化对象；只是把 `workspace-task-card` 的 checklist/panel body 收回 shared helper，并补出稳定 selector contract。
- 已完成：`rtk node --check src/task-dashboard.js`、`rtk node --check test/workspace-dashboard.test.js`、`rtk node --check scripts/workspace-execution-guide-live-uat.playwright.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 `workspace-task-card` shared body；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 92763`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778451369695`，检查时间 `2026-05-10T22:16:13.734Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且 `workspace-task-card` 已开始直接命中新补的 shared body selector。
- 当前备注：
  - 这轮之后，首页 `decision / comment / home-grid` 与工作台 `workspace-task-card` 都已经开始站到稳定的 body contract 上
  - `thread-group` 仍然保留各自的 relation/guidance 拼接，还没有并进这条 workspace/home body 收口链
  - 后续如果继续推进，更值得继续看的，是 `thread-group` 是否也要接回同一层 checklist body contract，进一步统一 thread view 的 checklist 可见性
		
## 2026-05-11 homepage home-grid-card 已接回 shared home-card body

- 已完成：`src/task-dashboard.js` 的 `renderCards(...)` 现在开始复用 `renderHomeCardBodyBlocks(...)`，不再让 `home-grid-card` 继续各自手写：
  - `checklist relation`
  - `checklist guidance`
  - `memory governance signals`
- 已完成：`home-grid-card` 现在已接回 shared home-card body，并稳定暴露：
  - `data-home-card-body-context="home-grid-card"`
  - `data-home-card-body-middle-context="home-grid-card"`
  - `data-home-card-body-middle="home-grid-details"`
- 已完成：这轮 `middleHtml` 现在开始承接 `renderHomeMemoryGovernanceSignals(...)` 输出，因此 memory / suggestion / reviewer 类首页卡不再只是“卡里有执行清单上下文”，而是开始站到与 decision/comment 一致的 home-card body contract 上。
- 已完成：这轮没有新增 route、schema 或持久化对象；只是把首页 `home-grid-card` 的 body assembly 收回 shared helper，并补出稳定 selector contract。
- 已完成：`rtk node --check src/task-dashboard.js`、`rtk node --check test/workspace-dashboard.test.js`、`rtk node --check scripts/workspace-execution-guide-live-uat.playwright.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 `home-grid-card` shared body；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 87270`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778450743401`，检查时间 `2026-05-10T22:05:46.878Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且首页 `home-grid-card` 已开始直接命中新补的 shared body selector。
- 当前备注：
  - 这轮之后，首页 `decision / comment / home-grid` 三类 card 都已经开始站到同一层 `home-card body` contract 上
  - `workspace-task-card` 与 `thread-group` 仍然保留各自的 relation/guidance body 拼接，还没有并进这层 shared path
  - 后续如果继续推进，更值得继续看的，是 `workspace-task-card` 和 `thread-group` 是否也要并进同一层 body contract，进一步统一 checklist 可见性
		
## 2026-05-11 homepage home-card body helper 已开始同时服务 decision / comment 中枢卡

- 已完成：`src/task-dashboard.js` 新增 shared helper：
  - `renderHomeCardCallout(...)`
  - `renderHomeCardBodyBlocks(...)`
- 已完成：首页 `decision center` 与 `comment workflow center` 里的卡片 body 不再各自手写 `checklist relation + checklist guidance + judgment / action / proof` 组合，开始改走同一条 home-card body assembly。
- 已完成：shared home-card body 现在会稳定暴露：
  - `data-home-card-body-context`
  - `data-home-card-body-middle-context`
  - `data-home-card-body-middle`
- 已完成：当前已覆盖的首页卡片 context 为：
  - `data-home-card-body-context="decision-focus-card"`
  - `data-home-card-body-context="comment-workflow-card"`
- 已完成：这轮新增的 middle selector contract 为：
  - `data-home-card-body-middle-context="decision-focus-card"`
  - `data-home-card-body-middle="decision-focus-details"`
  - `data-home-card-body-middle-context="comment-workflow-card"`
  - `data-home-card-body-middle="comment-workflow-details"`
- 已完成：`renderHomeCardCallout(...)` 现在开始统一承接：
  - 首页决策卡的 `卡点原因 / 下一步`
  - 首页评论卡的 `当前判断 / 最近协同 / 建议动作 / 执行证据`
- 已完成：这轮没有新增 route、schema 或持久化对象；只是把首页中枢卡的 body assembly 收回 shared helper，并补出稳定 selector contract。
- 已完成：`rtk node --check src/task-dashboard.js`、`rtk node --check test/workspace-dashboard.test.js`、`rtk node --check scripts/workspace-execution-guide-live-uat.playwright.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 home-card body helper；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 83165`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778450308004`，检查时间 `2026-05-10T21:58:31.205Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且首页 decision / comment 卡已开始直接命中新补的 home-card body selector。
- 当前备注：
  - 这轮之后，首页执行清单上下文不再只是“卡里有文案”，而是开始站到一条可定位的 shared body contract 上
  - `memory` 类卡片当前仍然通过 `renderWorkspaceDecisionFocusList(...)` 共享 `decision-focus-card` 这条 body path，但还没有单独拆出自己的 context 命名
  - 后续如果继续推进，更值得继续看的，是首页 `memory governance` / `home grid` / `thread group` 这些卡是否也要并进同一层 home-card body contract
		
## 2026-05-11 docs scene-card body helper 已把 thread-workflow-card 接回 shared body，并保留中段顺序

- 已完成：`src/workspace-docs.js` 的 `renderSceneCardBodyBlocks(...)` 现在新增 `middleHtml` 与 `middleAttributes`，可以在 shared body 里稳定承接 context pair 与 workflow guidance 中间那段插槽内容，而不需要让卡片重新退回各写各的粘合逻辑。
- 已完成：shared body helper 现在会稳定暴露：
  - `data-scene-card-body-context`
  - `data-scene-card-body-middle-context`
  - `scene-card-body-middle`
- 已完成：`thread-workflow-card` 现已正式接回 `renderSceneCardBodyBlocks(...)`，并保留原有顺序不变：
  - 上半：`thread-state + checklist relation`
  - 中段：`workflow metrics / steps / meta`
  - 下半：`node guidance + next-action`
- 已完成：`thread-workflow-card` 这轮新增的稳定 selector contract 为：
  - `data-scene-card-body-context="thread-workflow-card"`
  - `data-scene-card-body-middle-context="thread-workflow-card"`
  - `data-scene-card-body-middle="thread-workflow-details"`
- 已完成：这次排查已经确认，上一轮 live HTML 仍然停在旧结构，不是因为 thread page 走错了渲染分支，而是因为 live `cortex-server` 进程启动时间早于本次 `src/workspace-docs.js` 改动时间；runtime 重启后，thread page 已真实吃到这版 shared body 输出。
- 已完成：这轮没有新增 route、schema 或持久化对象；只是把 `thread-workflow-card` 也接进 scene-card shared body，并补出中段插槽 contract。
- 已完成：`rtk node --check src/workspace-docs.js`、`rtk node --check test/workspace-docs.test.js`、`rtk node --check scripts/workspace-execution-guide-live-uat.playwright.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过，`25 / 25` 全绿；`rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 `thread-workflow-card` shared body；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 74726`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778449243270`，检查时间 `2026-05-10T21:40:46.444Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且 thread page 已开始直接命中新补的 `thread-workflow-card` body / middle selector。
- 当前备注：
  - 这轮之后，scene-card body helper 已不再只覆盖 decision / comment focus / comment thread，而是把 `thread-workflow-card` 也接回了同一条 shared body
  - `middleHtml` 现在已经证明可以承接“上下两半之间还有一段现场细节”的卡片，而不需要为了 shared helper 改动信息层次
  - 后续如果继续收口，更值得继续看的，是不是还有其他需要“中段插槽”的 scene-card 可以顺势并进同一条 body helper
		
## 2026-05-11 docs scene-card body helper 已开始同时服务 decision / comment focus / comment thread 卡片

- 已完成：`src/workspace-docs.js` 新增 shared helper `renderSceneCardBodyBlocks(...)`，开始统一承接 scene-card 里原本总是成对出现的两半：
  - `renderSceneCardContextBlocks(...)`
  - `renderSceneCardWorkflowBlocks(...)`
- 已完成：这条 shared helper 现在会稳定暴露 `data-scene-card-body-context`，当前已覆盖：
  - `decision-card`
  - `comment-thread-card`
  - `comment-focus-card`
  - `comment-focus-empty`
- 已完成：以下现场卡片现在开始共用同一条 body assembly，而不再继续由各卡分别串接 context helper + workflow helper：
  - decision card
  - comment thread card
  - comment focus card（含空态与非空态）
- 已完成：这轮特意没有把 `thread-workflow-card` 一起并进 body helper，因为它原本把 metrics / steps / meta 插在 context 和 workflow guidance 中间；当前先保持它的顺序不变，避免为了结构收口顺手改动卡片信息层次。
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 现在已开始在真实 thread page 上直接锁定：
  - `data-scene-card-body-context="decision-card"`
  - `data-scene-card-body-context="comment-thread-card"`
  - `data-scene-card-body-context="comment-focus-card"`
  避免这层 shared body contract 只在单测里存在、浏览器验收却继续只看 context / workflow 两半。
- 已完成：这轮没有新增 route、schema 或持久化对象；只是把相邻 scene-card 的 context + workflow 组合从“两条 helper 并排调用”再推进到 shared body helper + stable selector contract。
- 已完成：`rtk node --check src/workspace-docs.js`、`rtk node --check test/workspace-docs.test.js`、`rtk node --check scripts/workspace-execution-guide-live-uat.playwright.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过，`25 / 25` 全绿；`rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 scene-card body helper；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 67931`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778448492133`，检查时间 `2026-05-10T21:28:15.296Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且 thread page 已开始直接命中新补的 scene-card body selector。
- 当前备注：
  - 这轮之后，decision / comment focus / comment thread 卡片已经不再只是“共享 context 半边”和“共享 workflow 半边”，而是开始共享更完整的 body assembly
  - `thread-workflow-card` 仍然保留旧顺序，因此 body helper 目前是“选择性落地”，不是全量卡片一刀切
  - 后续如果继续收口，更值得继续看的，是 `thread-workflow-card` 是否需要先抽出中段 metrics / meta 的稳定结构，再决定要不要并进同一条 body helper

## 2026-05-11 docs scene-card workflow container 已开始同时服务 decision / comment / workflow 卡片

- 已完成：`src/workspace-docs.js` 新增 shared helper `renderSceneCardWorkflowBlocks(...)`，开始统一组装 scene-card 里的 workflow sections：
  - `assessment`
  - `evidence`
  - `node guidance`
  - `next-action / audit-trail` 等附加 block
- 已完成：新增 `pickWorkflowNodeGuidance(...)`，让 comment / workflow 现场卡片不再各自手工拷一遍：
  - `nodeLabel`
  - `nodeSummary`
  - `nodeAcceptance`
  - `nodeCheckpointRule`
  - `nodeEvidence`
  - `nodeAnchorLabel`
- 已完成：shared helper 现在会稳定暴露 `data-scene-card-workflow-context`，当前已覆盖：
  - `decision-card`
  - `comment-thread-card`
  - `comment-focus-card`
  - `comment-focus-empty`
  - `thread-workflow-card`
- 已完成：以下现场卡片现在开始共用同一条 workflow section assembly，而不再各自平铺 `assessment / evidence / node guidance / next-action`：
  - decision card
  - comment thread card
  - comment focus card（含空态与非空态）
  - thread workflow card
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 现在已开始在真实 thread page 上直接锁定：
  - `data-scene-card-workflow-context="decision-card"`
  - `data-scene-card-workflow-context="comment-thread-card"`
  - `data-scene-card-workflow-context="comment-focus-card"`
  - `data-scene-card-workflow-context="thread-workflow-card"`
  避免 workflow shared path 只在单测里存在、浏览器验收却继续只靠文案。
- 已完成：这轮没有新增 route、schema 或持久化对象；只是把 scene-card 的 workflow block assembly 从“共享 renderer，但各卡自己排序”再推进到 shared helper + stable selector contract。
- 已完成：`rtk node --check src/workspace-docs.js`、`rtk node --check test/workspace-docs.test.js`、`rtk node --check scripts/workspace-execution-guide-live-uat.playwright.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过，`25 / 25` 全绿；`rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 workflow container helper；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 58889`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778447510660`，检查时间 `2026-05-10T21:11:53.963Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且 thread page 已开始直接命中新补的 workflow container selector。
- 当前备注：
  - 这轮之后，scene-card workflow 这半边终于不再只是“底层 renderer 共享、上层顺序各写各的”，而是开始站到同一条 assembly helper 上
  - 但 context pair 和 workflow container 目前仍是两条 shared helper，并没有真正并成一个完整的 scene-card body renderer
  - 后续如果继续收口，更值得继续看的，是 `thread-state / checklist relation / assessment / evidence / acceptance / checkpoint / next-action` 是否该进一步合成为单一 scene-card body renderer

## 2026-05-11 docs scene-card context selector 已开始同时覆盖 thread-state 与 checklist relation

- 已完成：`src/workspace-docs.js` 的 `renderSceneCardContextBlocks(...)` 现在不只给 checklist relation 打标签，也会给 thread-state 这半边稳定暴露 `data-scene-card-context-block="thread-state"`。
- 已完成：`renderThreadStateGuidanceSections(...)` 的非 compact 分支现在开始复用 shared section renderer，不再手写三段 `<div class="workflow-next">`，并会稳定暴露：
  - `data-thread-state-guidance-context`
  - `data-thread-state-guidance-block="state"`
  - `data-thread-state-guidance-block="summary"`
  - `data-thread-state-guidance-block="action"`
- 已完成：以下 scene card 现在开始稳定共用完整的 context pair selector，而不再只有 checklist relation 那半边可盯：
  - decision card
  - comment thread card
  - comment focus card
  - thread workflow card
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 现在已开始在真实 thread page 上直接锁定：
  - `data-scene-card-context-block="thread-state"`
  - `data-thread-state-guidance-block="state" / "summary" / "action"`
  避免这层 contract 只在单测里存在、浏览器验收却继续只看文案。
- 已完成：这轮没有新增 route、schema 或持久化对象；只是把 scene-card context pair 的另一半也推进到 shared selector contract，并让 live UAT 开始直接盯这层结构。
- 已完成：`rtk node --check src/workspace-docs.js`、`rtk node --check test/workspace-docs.test.js`、`rtk node --check scripts/workspace-execution-guide-live-uat.playwright.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过，`25 / 25` 全绿；`rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 thread-state selector；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 52888`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778446957532`，检查时间 `2026-05-10T21:02:40.509Z`；homepage、execution doc、memory doc 与 thread scene 继续全绿，并且 thread page 已开始直接命中新补的 thread-state selector。
- 当前备注：
  - 这轮之后，scene-card context pair 的两半都已经开始暴露稳定 selector，不再是 checklist relation 可选、thread-state 只能靠文案猜
  - 但 scene-card 其余 workflow block 仍然是另一组 shared helper，尚未和 context pair 真正并成一条完整的 scene-card renderer
  - 后续如果继续收口，更值得继续看的，是 `thread-state / checklist relation / assessment / evidence / acceptance / checkpoint / next-action` 是否该进一步合成为同一条 scene-card body renderer

## 2026-05-11 docs scene-card context blocks 已开始同时服务 decision / comment / workflow 卡片

- 已完成：`src/workspace-docs.js` 新增 shared helper `renderSceneCardContextBlocks(...)`，把 scene card 里原本分散的两段上下文重新拉回同一条路径：
  - `renderThreadStateGuidanceSections(...)`
  - `renderChecklistRelationWithExecutionFallback(...)`
- 已完成：这条 shared helper 现在会稳定暴露 `data-scene-card-context-block="checklist-relation"`，让 frontend 与 live UAT 可以直接盯 scene-card context pair，而不是继续靠文案结构做弱匹配。
- 已完成：`renderChecklistRelationCallout(...)` 现在开始稳定暴露 `data-checklist-relation-context`，当前已覆盖：
  - `decision-card`
  - `comment-thread-card`
  - `comment-focus-card`
  - `thread-workflow-card`
- 已完成：以下现场卡片现在开始共用同一组 thread-state + checklist relation renderer，而不是各自 hand-write：
  - decision card
  - comment thread card
  - comment focus card（含空态与非空态分支）
  - thread workflow card
- 已完成：这轮没有新增 route、schema 或持久化对象；只是把 docs execution 里的 scene-card context pair 从局部分散 renderer 再推进到 shared helper + stable selector contract。
- 已完成：`rtk node --check src/workspace-docs.js` 与 `rtk node --check test/workspace-docs.test.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过，`25 / 25` 全绿；`rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 scene-card context helper；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 45826`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778446215162`，检查时间 `2026-05-10T20:50:18.232Z`；homepage、execution doc、memory doc 与 thread scene 的 execution guide 继续全绿，这轮 scene-card context blocks 已落在真实页面路径里。
- 当前备注：
  - 这轮之后，decision / comment / workflow 三类 scene card 不只 workflow renderer 开始共享，连 thread-state + checklist relation 这组 context pair 也回到了共享路径上
  - 但 `thread-state / checklist relation / workflow-next / workflow guidance` 目前仍是“两组 shared renderer 并排存在”，还不是一条完整的 scene-card renderer
  - 后续如果继续收口，更值得继续看的，是这四块 scene-card 语义是否该进一步合成更完整的 scene-card renderer，而不是现在只共享 workflow half 与 context pair 这两层

## 2026-05-11 docs workflow renderer 已开始同时服务 decision / comment / workflow 卡片

- 已完成：`src/workspace-docs.js` 新增两条 shared renderer：
  - `renderWorkflowGuidanceCallout(...)`
  - `renderWorkflowNextSection(...)`
- 已完成：`renderWorkflowNodeGuidanceSections(...)` 现在不只共用 shared guidance block data，也开始共用 shared renderer，并会稳定暴露：
  - `data-workflow-node-guidance-context`
  - `data-workflow-node-guidance-block`
- 已完成：以下现场卡片现在开始复用同一条 `workflow-next` renderer，并稳定暴露：
  - `data-workflow-next-context`
  - `data-workflow-next-block`
- 已完成：这轮已经接回 shared renderer 的 block 包括：
  - decision card 的 `assessment / evidence`
  - comment thread card 的 `assessment / evidence / next-action / audit-trail`
  - comment focus card 的 `assessment / next-action`
  - thread workflow card 的 `next-action`
  - node guidance 的 `display / acceptance / checkpoint-rule`
- 已完成：`test/workspace-docs.test.js` 现已直接锁定：
  - `data-decision-card`
  - `data-comment-thread-card`
  - `data-thread-workflow-card`
  下的 shared workflow renderer block selector，避免这些 scene card 再次漂回局部 hand-written 结构。
- 已完成：这轮没有新增 route、schema 或持久化对象；只是把 docs execution 里的 workflow renderer 从 shared block data 再推进到 shared renderer + stable selector contract。
- 已完成：`rtk node --check src/workspace-docs.js` 与 `rtk node --check test/workspace-docs.test.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过，`25 / 25` 全绿；`rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 shared workflow renderer；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 36183`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778445240526`，检查时间 `2026-05-10T20:34:03.544Z`；homepage、execution doc、memory doc 与 thread scene 的 execution guide 继续全绿，这轮 shared workflow renderer 已落在真实页面路径里。
- 当前备注：
  - 这轮之后，decision / comment / workflow 三类 scene card 已不再各自维护一套 workflow-next block HTML
  - 但 thread-state 正文 block 和 checklist relation callout 仍然保留各自 renderer
  - 后续如果继续收口，更值得继续看的，是 thread-state / checklist relation / workflow-next / workflow guidance 是否能进一步合成更完整的 scene-card renderer，而不是现在只共享 workflow renderer 这半层

## 2026-05-11 docs workflow-node guidance blocks 已开始同时服务 focus strip 与 node guidance

- 已完成：`src/workspace-docs.js` 新增 `buildWorkflowNodeGuidanceCards(...)`，把 workflow-node 的三块共享 guidance contract 收成同一组 blocks：
  - display
  - acceptance
  - checkpoint rule
- 已完成：`buildExecutionWorkflowNodeProofCards(...)` 现在直接复用这组 shared blocks，不再单独平铺：
  - `execution-workflow-node`
  - `execution-node-acceptance`
  - `execution-node-checkpoint-rule`
- 已完成：`renderWorkflowNodeGuidanceSections(...)` 现在也直接复用同一组 shared blocks，因此 docs node guidance 与 focus strip proof cards 已开始共用：
  - 节点标题 / 摘要
  - 挂载闭环 / 最近节点证据
  - 这一步验收
  - Checkpoint 规则
- 已完成：`test/workspace-docs.test.js` 现已直接锁定 `execution-node-acceptance` 与 `execution-node-checkpoint-rule` proof card body 必须回到 `focus_strip_workflow_guidance` 上的同一份 node guidance 字段，避免 focus strip 再次漂出平行 copy。
- 已完成：这轮没有新增 route、schema 或持久化对象；只是把 docs execution 里的 workflow-node contract 从 shared presenter 再推进到 shared guidance blocks。
- 已完成：`rtk node --check src/workspace-docs.js` 与 `rtk node --check test/workspace-docs.test.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过，`25 / 25` 全绿；`rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 shared guidance blocks；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 29809`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778444553459`，检查时间 `2026-05-10T20:22:36.993Z`；homepage、execution doc、memory doc 与 thread scene 的 execution guide 继续全绿，这轮 shared workflow-node guidance blocks 已落在真实页面路径里。
- 当前备注：
  - 这轮之后，focus strip 与 docs node guidance 已不再分别维护 acceptance / checkpoint 语义
  - 但两边仍然保留不同的最终 renderer：focus strip 继续走 proof card，docs thread / decision / comment / workflow 区块继续走 section renderer
  - 后续如果继续收口，更值得继续看的，是 comment / decision / workflow 三类现场卡片是否也该共享更完整的 workflow-node block renderer，而不是现在只共享 guidance block data

## 2026-05-11 docs workflow-node presenter 已开始同时服务 proof card 与 node guidance

- 已完成：`src/workspace-docs.js` 新增 `buildWorkflowNodePresenter(...)`，让以下两条路径开始共用同一份 workflow-node 展示组装：
  - `renderWorkflowNodeGuidanceSections(...)`
  - `buildExecutionWorkflowNodeProofCard(...)`
- 已完成：这条共享 presenter 现在统一负责节点展示里的：
  - `title`
  - `body`
  - `挂载闭环`
  - `最近节点证据`
- 已完成：`execution-workflow-node` proof card 现在不再单独维护节点标题、摘要、anchor 和 evidence 的局部组装；它只会在共享 node presenter 之上继续叠加：
  - `线程状态`
  - `状态说明`
  - `这一步处理`
- 已完成：`renderWorkflowNodeGuidanceSections(...)` 现在也不再独立维护节点标题/摘要/anchor/evidence 的 callout 组装，而是直接消费同一份 workflow-node presenter，再继续保留：
  - `这一步验收`
  - `Checkpoint 规则`
- 已完成：这轮没有新增 route、schema 或持久化对象；只是把 docs execution 里 workflow-node 的展示拼装进一步拉回共享 presenter。
- 已完成：`rtk node --check src/workspace-docs.js` 与 `rtk node --check test/workspace-docs.test.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过，`25 / 25` 全绿；`rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 15912`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778444026423`，检查时间 `2026-05-10T20:13:49.612Z`；homepage、execution doc、memory doc 与 thread scene 的 execution guide 继续全绿，这轮 workflow-node presenter 共享已落在真实页面路径里。
- 当前备注：
  - 这轮之后，`execution-workflow-node` proof card 与 `renderWorkflowNodeGuidanceSections(...)` 已经不再平行维护节点标题、摘要、挂载闭环和最近证据的组装
  - 但两者仍然保留不同的外围 UI 结构：proof card 继续服务 focus strip 的 thread-state 说明，node guidance 继续服务验收与 checkpoint 展示
  - 后续如果继续收口，更值得继续看的，是 acceptance / checkpoint / display blocks 是否也该共享更完整的 workflow-node renderer，而不是现在只共享 presenter

## 2026-05-11 docs focus strip workflow proof card 已共享标题与摘要 presenter

- 已完成：`src/workspace-docs.js` 新增 `buildExecutionWorkflowNodeProofCard(...)`，统一从 `workflowGuidance` 生成 `execution-workflow-node` proof card 的：
  - `title`
  - `body`
  - `progressItems`
- 已完成：这条 presenter 现在会继续复用：
  - `buildThreadStateGuidance(...)`
  - `buildThreadStateGuidanceProgressItems(...)`
  因此 `execution-workflow-node` proof card 的标题、摘要和状态条目都不再继续停留在 `buildExecutionFocusGuidanceModel(...)` 内部做局部 fallback 判断。
- 已完成：`test/workspace-docs.test.js` 现在会直接锁定 `execution_focus_guidance.proofCards` 里的 `execution-workflow-node` contract，明确要求命中：
  - `当前节点 · 拍板 · 红灯 / 待拍板`
  - 红灯节点摘要
  - `线程状态 / 状态说明 / 这一步处理`
- 已完成：这轮没有新增 route、schema 或持久化对象；只是把 docs focus strip workflow proof card 的标题/摘要组装也拉回共享 presenter。
- 已完成：`rtk node --check src/workspace-docs.js` 与 `rtk node --check test/workspace-docs.test.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过，`25 / 25` 全绿；`rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 proof card presenter；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 15912`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778442750809`，检查时间 `2026-05-10T19:52:34.495Z`；homepage、execution doc、memory doc 与 thread scene 的 execution guide 继续全绿，这轮 proof card presenter 已落在真实页面路径里。
- 当前备注：
  - 这轮之后，`execution-workflow-node` proof card 已不再在 `buildExecutionFocusGuidanceModel(...)` 内部单独维护标题/摘要 fallback
  - 后续如果继续收口，更值得继续看的，是 `execution-workflow-node` proof card 与 `renderWorkflowNodeGuidanceSections(...)` 仍分别维护节点标题、摘要、挂载闭环和最近证据的组装，是否也该进一步抽成同一份 workflow-node presenter

## 2026-05-11 docs focus strip workflow proof card 已共享 thread-state progress items

- 已完成：`src/workspace-docs.js` 的 `buildThreadStateGuidance(...)` 现已同时支持读取：
  - `stateLabel / stateSummary / stateAction`
  - `nodeStateLabel / nodeStateSummary / nodeStateAction`
- 已完成：新增 `buildThreadStateGuidanceProgressItems(...)`，统一输出：
  - `线程状态：...`
  - `状态说明：...`
  - `这一步处理：...`
- 已完成：`execution-focus-strip` 里的 `execution-workflow-node` proof card 现在不再手工拼这三条状态字符串，而是直接复用共享 progress item builder。
- 已完成：这轮没有新增 route、schema 或持久化对象；只是把 docs focus strip 最后一块 thread-state 局部字符串组装也拉回共享 presenter。
- 已完成：`test/workspace-docs.test.js` 已补 focus strip red / ready 场景回归，明确要求 `focusStrip` 命中：
  - `线程状态`
  - `状态说明`
  - `这一步处理`
- 已完成：`rtk node --check src/workspace-docs.js` 与 `rtk node --check test/workspace-docs.test.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过，`25 / 25` 全绿；`rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 focus strip；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 10413`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778442170156`，检查时间 `2026-05-10T19:42:53.480Z`；homepage、execution doc、memory doc 与 thread scene 的 execution guide 继续全绿，这轮 focus strip proof card 的共享状态条目已落在真实页面路径里。
- 当前备注：
  - 这轮之后，docs execution 从右栏 thread focus、深层 thread event / task 卡，到 focus strip workflow proof card，都已经不再保留独立的 thread-state 字符串拼装
  - 后续如果继续收口，更值得继续看的，是 `execution-workflow-node` proof card 与 `renderWorkflowNodeGuidanceSections(...)` 仍分别维护节点标题、摘要、挂载闭环和最近证据的组装，是否也该进一步抽成同一份 workflow-node presenter

## 2026-05-11 docs thread focus card 已切到共享 thread-state helper

- 已完成：docs execution 右栏 `data-thread-focus-card` 已不再手写三段 `<p>`：
  - `当前状态：...`
  - `状态说明：...`
  - `这一步处理：...`
- 已完成：这块状态区现在直接复用 `renderThreadStateGuidanceSections(threadPanel, { context: 'thread-focus-card' })`，因此 thread focus card 与 thread panel、focus strip、comment / decision / source recovery、workflow summary、thread event summary、compose、thread event、thread task 卡继续共用同一套 thread-state contract。
- 已完成：这轮没有新增 route、schema 或持久化对象；只是把 docs execution 右栏最后一块手写 thread-state 区也拉回共享 helper。
- 已完成：`test/workspace-docs.test.js` 已补 red / ready 场景回归，明确要求 `data-thread-focus-card` 命中：
  - `当前状态`
  - `状态说明`
  - `这一步处理`
- 已完成：`rtk node --check src/workspace-docs.js` 与 `rtk node --check test/workspace-docs.test.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过，`25 / 25` 全绿；`rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 thread focus card；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 4392`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778441502681`，检查时间 `2026-05-10T19:31:45.995Z`；homepage、execution doc、memory doc 与 thread scene 的 execution guide 继续全绿，这轮 thread focus card 的共享状态区已落在真实页面路径里。
- 当前备注：
  - 这轮之后，docs execution 从右栏 thread focus 到深层 thread event / task 卡，已经不再保留手写 thread-state 区块
  - 后续如果继续收口，更值得继续看的，是 `execution-workflow-node` proof card 的标题/摘要还在局部做 `当前节点 / 当前状态` fallback 组装，是否也该进一步抽成共享 presenter，而不是继续停留在 proof card 内部判断

## 2026-05-11 docs thread event / thread task cards 已补 compact thread-state callout

- 已完成：`src/workspace-docs.js` 的 `renderThreadStateGuidanceSections(threadPanel, options)` 现已支持 `compact` 模式，在深层卡片里统一输出一条紧凑状态 callout：
  - `线程状态 · {stateLabel}`
  - `stateSummary`
  - `这一步处理：{stateAction}`
- 已完成：docs execution 里的 `thread event` 卡与 `thread task` 卡现在都改为复用这条 compact helper，不再各自只讲 checklist relation 或局部摘要。
- 已完成：相关渲染调用现已显式传入 `threadPanel`，所以 `data-thread-event-card` 与 `data-thread-task-card` 会和 thread panel / focus strip 共享同一套 thread-state 文案。
- 已完成：这轮没有新增 route、schema 或持久化对象；只是把 docs execution 深层 per-item 卡片继续拉回同一套 thread-state contract。
- 已完成：`test/workspace-docs.test.js` 已新增 red / ready 场景回归，明确要求 `data-thread-event-card` 与 `data-thread-task-card` 都命中 compact thread-state copy。
- 已完成：`rtk node --check src/workspace-docs.js` 与 `rtk node --check test/workspace-docs.test.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过，`25 / 25` 全绿；`rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`270 / 270` 全绿。
- 已完成：`rtk npm run automation:restart` 已把 live runtime 切到这版 docs thread-state 卡片；最新 `rtk npm run automation:status` 已再次确认 live listener 为 `19100 / pid 99151`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`，当前 managed 进程 `10 / 10 running`。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778441178102`，检查时间 `2026-05-10T19:26:21.316Z`；homepage、execution doc、memory doc 与 thread scene 的 execution guide 继续全绿，这轮新增的 compact thread-state callout 已落在真实页面路径里。
- 当前备注：
  - 这轮之后，docs execution 的深层事件卡和任务卡不再只知道“这条项本身发生了什么”，也能继续解释当前线程正处在什么状态、下一步该怎么推进
  - 后续如果继续收口，更值得继续看的，是 `execution-workflow-node` proof card 的标题/摘要还在局部做 `当前节点 / 当前状态` fallback 组装，是否也该进一步抽成共享 presenter，而不是继续停留在 proof card 内部判断

## 2026-05-10 hero data hygiene strip 已复用共享 guidance renderer

- 已完成：`src/task-dashboard.js` 里 `#hero-data-hygiene-guidance` 现在已经改为直接复用 `renderCenterFocusGuidanceStrip(...)`。
- 已完成：hero strip 通过以下标题参数保持现有中文语义不变：
  - `nodeTitle: 当前治理焦点`
  - `summaryTitle: 当前判断`
  - `actionTitle: 这一步处理`
- 已完成：这轮之后，hero data hygiene 不只是共享 guidance model / payload contract / proof row / action links，而是连中心 strip renderer 也和其他 workspace 面板对齐。
- 已完成：这轮没有新增 route、schema 或持久化对象；只是把首页 hero panel 的最后一处 guidance renderer drift 再收掉一层。
- 已完成：`rtk node --check src/task-dashboard.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 已再次通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`269 / 269` 全绿。
- 已完成：`rtk npm run automation:restart` 已再次完成，当前 live listener 为 `19100 / pid 39399`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`；`rtk npm run automation:status` 也已再次确认当前 managed 进程 `10 / 10 running`，其中 `cortex-server.covered_by = listener_probe`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778424636882`，检查时间 `2026-05-10T14:50:39.994Z`；hero data hygiene strip 在 live 页面继续通过 execution guide 验收。
- 当前备注：
  - 这轮之后，hero data hygiene 不只是 payload-backed，也不再保留 hand-written guidance strip
  - 后续如果继续收口，更值得继续看的，是 hero 周围的专属 checklist / callout 布局还能否继续减少例外

## 2026-05-10 hero data hygiene guidance 已进入 payload contract

- 已完成：`buildHeroDataHygieneGuidance(...)` 现在已经切到共享的 `buildPanelGuidanceModel(...)`，不再单独手写 hero guidance object。
- 已完成：workspace payload 现在会稳定返回 `data_hygiene.focusGuidance`，并把 hero strip 所需的：
  - `progressLabel`
  - `proof*`
  - `actionLinks`
  - `checklistAcceptance`
  - `checklistCheckpointRule`
  一起挂进 payload。
- 已完成：首页 hero strip 现在会优先消费 `data_hygiene.focusGuidance`，并新增稳定 selector：
  - `data-hero-data-hygiene-guidance`
- 已完成：`test/workspace-dashboard.test.js` 已新增 payload 回归，明确要求 `workspace.body.data_hygiene.focusGuidance` 存在，并命中 `progressLabel / proofLabel / actionLinks / checklistAcceptance / checklistCheckpointRule`。
- 已完成：HTML 回归现在也要求首页命中 `data-hero-data-hygiene-guidance`。
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 现已改为通过 `[data-hero-data-hygiene-guidance]` 盯 hero strip。
- 已完成：`rtk node --check src/task-dashboard.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 已再次通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`269 / 269` 全绿。
- 已完成：`rtk npm run automation:restart` 已再次完成，当前 live listener 为 `19100 / pid 35676`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`；`rtk npm run automation:status` 也已再次确认当前 managed 进程 `10 / 10 running`，其中 `cortex-server.covered_by = listener_probe`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778424240630`，检查时间 `2026-05-10T14:44:04.434Z`；hero data hygiene guidance 已在 live 页面继续通过新的稳定 selector 验收。
- 当前备注：
  - 这轮之后，hero data hygiene 不再是唯一一个只在 HTML 临时拼 guidance 的首页面板
  - 后续如果继续收口，更值得继续看的，是 hero strip 是否也应该进一步复用共享 guidance renderer，而不只是共享 payload/model 层

## 2026-05-10 panel guidance 组装层已开始共享 base builder

- 已完成：`src/task-dashboard.js` 新增：
  - `buildPanelGuidanceModel(base, options)`
  - `normalizeGuidanceActionLinks(...)`
  用来统一组装 panel-level guidance 的公共字段：
  - `nodeLabel / nodeSummary / nodeAction / nodeEvidence`
  - `progressLabel / judgmentDetail / actionDetail`
  - `proof* / actionLinks`
  - `checklistAcceptance / checklistCheckpointRule`
- 已完成：以下 guidance builder 现在都改为先生成业务语义，再统一走 `buildPanelGuidanceModel(...)` 收口：
  - `buildThreadGovernanceGuidance(...)`
  - `buildThreadViewGuidance(...)`
  - `buildAttentionViewGuidance(...)`
  - `buildHomeCommentCenterGuidance(...)`
  - `buildHomeMemoryCenterGuidance(...)`
  - `buildHomeDecisionCenterGuidance(...)`
  - `buildNotionCollaborationGuidance(...)`
- 已完成：这轮没有新增 route、schema 或持久化对象；只是把已经落到前台的 guidance contract 往共享组装层继续推进。
- 已完成：`rtk node --check src/task-dashboard.js` 已通过。
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 已再次通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`269 / 269` 全绿。
- 已完成：`rtk npm run automation:restart` 已再次完成，当前 live listener 为 `19100 / pid 30279`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`；`rtk npm run automation:status` 也已再次确认当前 managed 进程 `10 / 10 running`，其中 `cortex-server.covered_by = listener_probe`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778423793253`，检查时间 `2026-05-10T14:36:36.268Z`；homepage、execution doc、memory doc 与 thread scene 的 execution guide contract 都继续通过 live 浏览器验收。
- 当前备注：
  - 这轮之后，不只是更多面板进入统一 guidance contract，连 guidance object 的公共组装层也开始共享了
  - 后续如果继续收口，更值得继续看的，是 hero data hygiene guidance 能否也并入同一条 base model builder

## 2026-05-10 homepage attention-view 已前置 panel-level guidance

- 已完成：`src/task-dashboard.js` 新增 `buildAttentionViewGuidance(attentionView, executionChecklist)`，会按：
  - `waiting_human[0]`
  - `in_progress[0]`
  - `completed[0]`
  的优先级挑当前焦点，并统一补出：
  - `nodeLabel`
  - `nodeSummary`
  - `nodeAction`
  - `nodeEvidence`
  - `progressLabel`
  - `judgmentDetail`
  - `actionDetail`
  - `proofLabel`
  - `proofHref`
  - `proofUpdatedAt`
  - `proofContextLabel`
  - `proofSourceHref`
  - `proofSourceLabel`
  - `actionLinks`
  - `checklistAcceptance`
  - `checklistCheckpointRule`
- 已完成：workspace payload 现在会稳定返回 `attentionView.focusGuidance`，attention panel 不再只是一张 summary 卡。
- 已完成：首页 `#attention-view` 现在稳定渲染：
  - `data-attention-view-guidance`
  - `最近证据`
  - proof row
  - action links
- 已完成：attention-view 在 live 页面里现在会继续暴露执行入口：
  - `进入拍板现场`
  - `进入执行现场`
  - `回看已完成现场`
- 已完成：`renderGuidanceProofRow(...)` 与 `renderGuidanceActionLinks(...)` 现已补上空态兜底；即使 attention panel 暂时没有焦点项，也不会再因为 `null` proof/action 记录触发首页 `400`。
- 已完成：`test/workspace-dashboard.test.js` 已新增 attention-view payload 与 HTML 回归，明确要求 `attentionView.focusGuidance` 存在，并要求首页命中 `data-attention-view-guidance`。
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`269 / 269` 全绿。
- 已完成：`rtk npm run automation:restart` 已再次完成，当前 live listener 为 `19100 / pid 25082`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`；`rtk npm run automation:status` 也已再次确认当前 managed 进程 `10 / 10 running`，其中 `cortex-server.covered_by = listener_probe`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778423320829`，检查时间 `2026-05-10T14:28:44.267Z`；homepage `#attention-view` 已在 live 页面真实命中 `data-attention-view-guidance / 最近证据 / 进入拍板现场 / 进入执行现场 / 回看已完成现场`。
- 当前备注：
  - 这轮之后，homepage 默认 attention panel 不再只是“数量播报器”，而是已经进入统一 panel-level guidance contract
  - 下一段更值得继续看的，是 hero / thread governance / attention-view / thread-view 能否继续共享更统一的 guidance model builder，而不只是共享渲染层

## 2026-05-10 thread-view guidance 已补齐动态证据与动作入口

- 已完成：`buildThreadViewGuidance(...)` 现在会为各过滤态直接补齐：
  - `proofLabel`
  - `proofHref`
  - `proofUpdatedAt`
  - `proofContextLabel`
  - `proofSourceHref`
  - `proofSourceLabel`
  - `actionLinks`
- 已完成：`renderGuidanceProofRow(...)` 与 `renderGuidanceActionLinks(...)` 现已支持 `bindingPrefix`，因此 thread-view 在浏览器端切过滤器时，除了 guidance strip 本身，也会一起刷新：
  - `最近证据`
  - `打开焦点线程`
  - `打开源位置`
  - 当前过滤态对应的动作链接
- 已完成：`#thread-view` 现在稳定渲染：
  - `data-thread-view-guidance-proof-row`
  - `data-thread-view-guidance-actions-links`
- 已完成：thread-view 各过滤态的动作语义已经补齐：
  - `进入评论分流现场`
  - `进入执行回流现场`
  - `打开待拍板线程`
  - `打开执行中线程`
  - `打开已完成线程`
  - 默认 `打开焦点线程`
- 已完成：`test/workspace-dashboard.test.js` 已新增 payload 与 HTML 回归，明确要求 thread-view guidance payload 带出 `proofLabel / proofHref / actionLinks`，并要求页面命中 `data-thread-view-guidance-proof-row / data-thread-view-guidance-proof-link / data-thread-view-guidance-actions-links`。
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`269 / 269` 全绿。
- 已完成：`rtk npm run automation:restart` 已再次完成，当前 live listener 为 `19100 / pid 18109`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`；`rtk npm run automation:status` 也已再次确认当前 managed 进程 `10 / 10 running`，其中 `cortex-server.covered_by = listener_probe`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778422643733`，检查时间 `2026-05-10T14:17:26.735Z`；thread-view 的 proof row 与 action links 已在 live filter 切换中通过。
- 当前备注：
  - 这轮之后，thread-view 不再只是“六档文案正确”，而是连证据行和动作入口也会跟着当前过滤态一起切换
  - 下一段更值得继续看的，是 hero / thread governance / thread-view 三块能否继续共享更统一的 guidance model builder，而不只是共享渲染层

## 2026-05-10 thread-view 六档过滤态 guidance 已全部收口

- 已完成：`src/task-dashboard.js` 新增 `buildThreadViewGuidanceByFilter(threadGroups, executionChecklist)`，统一生成：
  - `all`
  - `triage`
  - `ready`
  - `red`
  - `active`
  - `completed`
  六档 thread-view guidance，不再只覆盖三档。
- 已完成：`buildWorkspacePayload(...)` 与 `renderWorkspacePage(...)` 现在都统一复用这套 helper；`thread_view_guidance_by_filter` / `threadViewGuidanceByFilter` 已不再只吐 `all / triage / ready`。
- 已完成：`buildThreadViewGuidance(...)` 新增显式分支：
  - `执行中线程`
  - `已完成线程`
  让 `active / completed` 过滤态拥有各自的 `当前判断 / 下一步`，不再回退到 `all` 的默认说明。
- 已完成：`test/workspace-dashboard.test.js` 已新增断言，明确要求：
  - `threadViewGuidanceByFilter.red`
  - `threadViewGuidanceByFilter.active`
  - `threadViewGuidanceByFilter.completed`
  全部存在并输出对应标签。
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 已继续扩大真实浏览器覆盖；现在会依次点击：
  - `triage`
  - `ready`
  - `red`
  - `active`
  - `completed`
  并确认顶部 guidance 真实跟着切换。
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`269 / 269` 全绿。
- 已完成：`rtk npm run automation:restart` 已再次完成，当前 live listener 为 `19100 / pid 11768`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`；`rtk npm run automation:status` 也已再次确认当前 managed 进程 `10 / 10 running`，其中 `cortex-server.covered_by = listener_probe`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778421892147`，检查时间 `2026-05-10T14:04:55.207Z`；thread-view guidance 已在 `按线程 / triage / ready / red / active / completed` 六档下全部命中。
- 当前备注：
  - 这轮之后，thread-view 过滤条和 guidance strip 终于对齐成同一套状态机，不再出现“按钮是六档，说明只有三档”的断层
  - 下一段更值得继续看的，是 hero / thread governance / thread-view 三块能否进一步共享更统一的 guidance model 组装层，而不只是共享渲染层

## 2026-05-10 thread-view 指导条已按过滤态同步切换

- 已完成：`src/task-dashboard.js` 新增：
  - `filterThreadGroupsForView(threadGroups, filter)`
  - `buildThreadViewGuidance(threadGroups, filter, executionChecklist)`
- 已完成：workspace payload 现在会稳定返回：
  - `thread_view_guidance_by_filter`
  - `threadViewGuidanceByFilter`
  用于分别描述 `all / triage / ready` 三个过滤态的 thread-view guidance。
- 已完成：`#thread-view` 现在前置 `data-thread-view-guidance`，稳定显示：
  - `当前线程焦点`
  - `当前判断`
  - `下一步`
  - `验收条件`
  - `Checkpoint 规则`
- 已完成：前端新增 `threadViewGuidanceModels` 与 `renderThreadViewGuidance(filter)`，并在 `setThreadFilter(filter)` 中同步调用，所以点击 `全部 / triage / ready` 时 guidance strip 会和列表一起切换，而不是停在首屏初始态。
- 已完成：通用 `renderChecklistGuidanceBlocks(...)` 现已支持 `bindingPrefix`；thread-view guidance 的 `验收条件 / Checkpoint 规则` 因此也能在浏览器端切 filter 时实时刷新，而不是只有顶部三行变化。
- 已完成：thread-view guidance 的浏览器绑定现已补齐：
  - `data-thread-view-guidance-node-label`
  - `data-thread-view-guidance-node-evidence`
  - `data-thread-view-guidance-node-summary`
  - `data-thread-view-guidance-progress-label`
  - `data-thread-view-guidance-judgment-detail`
  - `data-thread-view-guidance-node-action`
  - `data-thread-view-guidance-action-detail`
  - `data-thread-view-guidance-acceptance-block`
  - `data-thread-view-guidance-acceptance`
  - `data-thread-view-guidance-checkpoint-block`
  - `data-thread-view-guidance-checkpoint`
- 已完成：`buildThreadViewGuidance(...)` 的空态节点标签 fallback 已从不自然的 `优先回看 线程` 收口为 `优先回看`。
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；全量 `rtk node --test` 已再次通过，`269 / 269` 全绿。
- 已完成：`rtk npm run workspace:execution-guide:uat` 已再次通过；最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778421487248`，检查时间 `2026-05-10T13:58:10.107Z`，并已真实覆盖 thread-view guidance 在 `按线程 / triage / ready` 三个过滤态下的切换。
- 已完成：当前 live runtime 继续健康，listener 为 `19100 / pid 5129`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`；`rtk npm run automation:status` 也已再次确认当前 managed 进程 `10 / 10 running`，其中 `cortex-server.covered_by = listener_probe`。
- 当前备注：
  - 这轮之后，thread-view 不再是 workspace 协作面里唯一一个切过滤器就丢掉 guidance 的视图
  - 下一段更值得继续看的，是 homepage hero / thread governance / thread-view 三块能否进一步共享更统一的 base guidance model，而不只是共享渲染层

## 2026-05-10 hero / thread governance 已共享 proof 与 actionLinks 结构

- 已完成：`src/task-dashboard.js` 新增共享 helper：
  - `renderGuidanceProofRow(...)`
  - `renderGuidanceActionLinks(...)`
- 已完成：homepage `#hero-data-hygiene-guidance` 已切到共享 helper 渲染 `proof*` 与 `actionLinks`，不再手写这两段证据/动作 HTML。
- 已完成：homepage `#thread-governance` 现在也会复用同一套证据/动作结构，稳定显示：
  - `最近证据`
  - `证据现场`
  - `打开证据现场`
  - `打开最近源位置`（如有）
  - `查看全部历史线程 / 切回聚焦视图 / 清除残留筛选`（按当前视图态出现）
- 已完成：`workspace.body.thread_identity_governance.focusGuidance` 现在在 payload 层就会补齐：
  - `proofLabel`
  - `proofHref`
  - `proofUpdatedAt`
  - `proofContextLabel`
  - `proofSourceHref`
  - `proofSourceLabel`
  - `actionLinks`
- 已完成：thread identity 已收口时，这块 guidance 也不会再因为健康空态而丢掉 proof 入口。
- 已完成：`test/workspace-dashboard.test.js` 现在会同时检查：
  - payload 中 `thread_identity_governance.focusGuidance.proof*`
  - homepage `#thread-governance` 命中 `最近证据 / 证据现场 / 打开证据现场`
  - 残留筛选态下继续命中 `清除残留筛选`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 的 homepage step 现在也必须真实检查 `#thread-governance` 命中这批证据与动作入口。
- 已完成：全量 `rtk node --test` 已通过，`269 / 269` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 98258`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：`rtk node scripts/automation-status.js` 刚再次确认当前 managed 进程 `10 / 10 running`，其中 `cortex-server.covered_by = listener_probe`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778420853549`，检查时间 `2026-05-10T13:47:36.421Z`；thread governance 面板已在 live homepage 命中共享 proof/action 结构。
- 当前备注：
  - 这轮之后，homepage hero 与 thread governance 至少已经共享同一层 evidence/action 渲染结构，不再各写一份相近 HTML
  - 下一段更值得继续看的，是两者是否还能进一步共享同一份 base guidance model，而不仅仅是共享渲染 helper

## 2026-05-10 homepage 线程治理面板也已并入统一 guidance contract

- 已完成：首页 `#thread-governance` 现在正式切到统一的 `renderCenterFocusGuidanceStrip(...)`，新增稳定 selector `data-thread-governance-guidance`，稳定显示：
  - `当前治理节点`
  - `当前判断`
  - `这一步处理`
  - `验收条件`
  - `治理规则`
- 已完成：`src/task-dashboard.js` 的 `buildThreadGovernanceGuidance(...)` 现在会接收 `executionChecklist`，把 thread identity 这一步的 `stepNumber / acceptance / progressLabel` 一起折进 guidance。
- 已完成：线程治理 guidance 现在会稳定补出：
  - `关联闭环：第 3 步`
  - `执行清单：4 / 5 已收口`
  - 主视图 / 历史层 / 稳定线程计数
- 已完成：当 `threadIdentityGovernance.items` 为空、线程身份已经收口时，payload 也不再退化成 `null`；首页会稳定显示“线程身份已收口”的空态 guidance，而不是健康时突然失声。
- 已完成：`workspace.body.thread_identity_governance` 现在会显式挂 `focusGuidance`，方便 payload 回归直接验证 thread governance strip。
- 已完成：`test/workspace-dashboard.test.js` 现在会同时检查：
  - `workspace.body.thread_identity_governance.focusGuidance`
  - homepage HTML 命中 `data-thread-governance-guidance`
  - 残留筛选态下继续命中 `当前治理节点 / 这一步处理 / 验收条件 / 治理规则`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 的 homepage step 现在也必须真实检查 `data-thread-governance-guidance` 已在 live 页面命中。
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；`rtk node --test test/workspace-docs.test.js` 已通过，`24 / 24` 全绿；全量 `rtk node --test` 已通过，`269 / 269` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 91182`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：`rtk node scripts/automation-status.js` 刚再次确认当前 managed 进程 `10 / 10 running`，其中 `cortex-server.covered_by = listener_probe`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778420137427`，检查时间 `2026-05-10T13:35:40.323Z`；线程治理 guidance strip 已在 live homepage 命中。
- 当前备注：
  - 这轮之后，homepage thread collaboration 不再保留一块独立拼装的治理说明，而是和其他核心中枢共享同一套 guidance contract
  - 下一段更值得继续看的，是 hero data hygiene guidance 与线程治理 strip 之间还能否继续收敛更多重复语义

## 2026-05-10 homepage runtime health 面板也已前置恢复 guidance

- 已完成：首页 `#runtime-health` 现在会在 runtime KPI 下继续前置 `data-runtime-health-guidance`，稳定显示：
  - `当前 runtime 节点`
  - `当前判断`
  - `这一步恢复`
- 已完成：`src/task-dashboard.js` 新增 `buildRuntimeHealthViewModel(payload, options = {})`，把 runtime payload 统一收成可复用的 guidance model，并让首屏 placeholder 与客户端 `renderRuntimeStatus(payload)` 共用同一套 view-model。
- 已完成：通用 `renderCenterFocusGuidanceStrip(...)` 这轮补了可选 `bindingPrefix`，runtime 面板直接复用现有 guidance strip 渲染 contract，没有新增 route、schema 或持久化对象。
- 已完成：`src/server.js` 的 `buildWorkspaceRuntimeStatusPayload(...)` 已修正 `covered_processes` 口径，只把 coverage reason 为 `health_probe` 的进程记成 `health probe 兜底`；`listener_probe` 恢复不再被误写成 health-probe 文案。
- 已完成：`test/workspace-dashboard.test.js` 现在会同时检查：
  - homepage HTML 命中 `data-runtime-health-guidance`
  - `workspace runtime status keeps listener-probe recovery distinct from health-probe coverage`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 的 homepage step 现在也必须真实检查 runtime guidance strip 已出现在 live 页面中。
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 已通过，`22 / 22` 全绿；`rtk node --test test/workspace-docs.test.js` 已通过，`24 / 24` 全绿；全量 `rtk node --test` 已通过，`269 / 269` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 85009`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：`rtk node scripts/automation-status.js` 刚再次确认当前 managed 进程 `10 / 10 running`，其中 `cortex-server.covered_by = listener_probe`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778419583858`，检查时间 `2026-05-10T13:26:26.728Z`，runtime guidance strip 已在 live homepage 命中。
- 当前备注：
  - 这轮之后，homepage runtime 面板不再只是报 `listener / pid / drift`，而是开始直接说“当前节点 / 当前判断 / 这一步恢复”
  - runtime panel 的首屏 gap 基本已经收口；下一段更值得继续看的，是其他仍然只会报 summary、还没前置 checkpoint 语言的 workspace 协作面板

## 2026-05-10 homepage Notion 协作接入也已前置节点级 guidance

- 已完成：首页 `#notion-collaboration` 现在会在 KPI 下继续前置 `data-notion-collaboration-guidance`，稳定显示：
  - `当前协作节点`
  - `当前判断`
  - `下一步`
  - `验收条件`
  - `Checkpoint 规则`
- 已完成：`src/task-dashboard.js` 新增 `buildNotionCollaborationGuidance(...)`，会直接复用现有 `summary / syncProbe / blockers / nextActions / targetPageUrl / tokenMirrorSummary`，拼出 Notion 协作的 panel-level guidance。
- 已完成：`buildWorkspaceNotionCollaboration(...)` 产出的 payload 现在会额外挂上 `focusGuidance`，方便首页渲染和回归直接钉住这层顶层摘要。
- 已完成：这轮继续没有新增后端协议；只是把 Notion 协作卡本身已有的 readiness、同步落点与人工动作再前移到 homepage 首屏。
- 已完成：`test/workspace-dashboard.test.js` 现在会同时检查：
  - `workspace.body.notion_collaboration.focusGuidance`
  - homepage HTML 命中 `data-notion-collaboration-guidance`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 的 homepage step 现在也必须真实检查 Notion 协作面板命中新加的节点级 guidance。
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 与 `rtk node --test test/workspace-docs.test.js` 均已通过；全量 `rtk node --test` 当前保持 `268 / 268` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 67522`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778417480655`，检查时间 `2026-05-10T12:51:23.423Z`；`rtk node scripts/automation-status.js` 也已再次确认 `10 / 10 running`。
- 当前备注：
  - 这轮之后，homepage 的 async document workflow 不再只有治理中枢会讲“当前节点 / 下一步”，`Notion 协作接入` 也开始共享同一层首屏语言
  - 后续如果继续补，更值得继续看的是 runtime / health 或其他首页汇总区里，是否还有只会报状态、不会直接说明“先做什么”的面板

## 2026-05-10 homepage 决策中枢也已前置节点级 guidance

- 已完成：首页 `#decision-center` 现在会在 checklist summary 下继续前置 `data-home-decision-center-guidance`，稳定显示：
  - `当前决策节点`
  - `当前判断`
  - `这一步拍板`
  - `验收条件`
  - `Checkpoint 规则`
- 已完成：`src/task-dashboard.js` 新增 `buildHomeDecisionCenterGuidance(...)`，会从 `redItems / yellowItems / memoryCandidates` 里挑当前最优先的一张 decision-center 卡，拼出 panel-level guidance。
- 已完成：`buildWorkspaceDecisionFocus(...)` 现在会额外返回 `focusGuidance`；decision 任务卡也同步补了 `currentNode / executionProof / threadSourceLabel`，让顶部 guidance 不需要再从 meta 文本里猜节点和证据。
- 已完成：这轮继续没有新增后端协议；只是把 decision 卡本身已有的 checklist / execution / recommendation 投影前移到 homepage 中枢顶部。
- 已完成：`test/workspace-dashboard.test.js` 现在会同时检查：
  - `workspace.body.decision_focus.focusGuidance`
  - homepage HTML 命中 `data-home-decision-center-guidance`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 的 homepage step 现在也必须真实检查 decision center 命中新加的节点级 guidance。
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 与 `rtk node --test test/workspace-docs.test.js` 均已通过；全量 `rtk node --test` 当前保持 `268 / 268` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 59511`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778416422950`，检查时间 `2026-05-10T12:33:45.981Z`；`rtk node scripts/automation-status.js` 也已再次确认 `10 / 10 running`。
- 当前备注：
  - 这轮之后，homepage `决策 / 评论 / 记忆` 三个中枢终于都共享同一层 panel-level node guidance
  - 下一步如果继续往前推，更值得看的就是 thread/docs/memory 之外，还有没有其他 homepage 汇总区仍然只会讲 summary、不会讲“这一步怎么过关”

## 2026-05-10 homepage comment / memory 中枢已前置节点级 guidance

- 已完成：首页 `#comment-workflow-center` 现在会在 checklist summary 下继续前置 `data-home-comment-center-guidance`，稳定显示：
  - `当前评论节点`
  - `当前判断`
  - `下一步`
  - `验收条件`
  - `Checkpoint 规则`
- 已完成：首页 `#memory-governance-center` 现在会在 checklist summary 下继续前置 `data-home-memory-center-guidance`，稳定显示：
  - `当前治理节点`
  - `当前判断`
  - `这一步判断`
  - `验收条件`
  - `Checkpoint 规则`
- 已完成：`src/task-dashboard.js` 新增 `buildHomeCommentCenterGuidance(...)`、`buildHomeMemoryCenterGuidance(...)` 与 `renderCenterFocusGuidanceStrip(...)`，会从当前最优先的一张 comment / memory 卡复用已有 proof、reviewer、next-step、checklist 字段，拼成 panel-level guidance。
- 已完成：`buildWorkspaceCommentWorkflowFocus(...)` 与 `buildWorkspaceMemoryGovernanceFocus(...)` 现在都会额外返回 `focusGuidance`；comment 卡还补了 `currentNode` 字段，让 homepage 顶部 guidance 不需要再从 meta 文本里猜节点名。
- 已完成：这轮继续没有新增后端协议；只是把 comment / memory 卡本身已有的 projection 再前移到 homepage 中枢顶部。
- 已完成：`test/workspace-dashboard.test.js` 现在会同时检查：
  - `workspace.body.comment_workflow.focusGuidance`
  - `workspace.body.memory_governance.focusGuidance`
  - homepage HTML 命中 `data-home-comment-center-guidance`
  - homepage HTML 命中 `data-home-memory-center-guidance`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 的 homepage step 现在也必须真实检查这两个 selector 命中新加的节点级 guidance。
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 与 `rtk node --test test/workspace-docs.test.js` 均已通过；全量 `rtk node --test` 当前保持 `268 / 268` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 55173`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778416069811`，检查时间 `2026-05-10T12:27:53.077Z`；`rtk node scripts/automation-status.js` 也已再次确认 `10 / 10 running`。
- 当前备注：
  - 这轮之后，homepage `评论回流中枢 / 记忆治理中枢` 终于不必先滚进列表卡，才能知道现在卡在哪个节点、该做什么判断
  - 这层仍然是 projection-only 聚焦摘要；后续如果要继续压实，可以再看 `决策中枢` 是否也要共享同等级的 panel-level node guidance

## 2026-05-10 thread workflow 卡进度行也已回退到 `focusChecklistProgressLabel`

- 已完成：`/workspace/docs/execution` 的 `任务流转` 卡现在也不再依赖完整 `focusChecklistProgressSummary` 才显示第二行进度；只要 workflow 自身带 `focusChecklistProgressLabel`，就会稳定露出 `执行清单：...`。
- 已完成：`src/workspace-docs.js` 的 `thread-workflow-card` 在调用 `renderChecklistRelationWithExecutionFallback(...)` 时，现已同步透传 `checklistProgressLabel: threadDetail.workflow.focusChecklistProgressLabel`。
- 已完成：`test/workspace-docs.test.js` 现在会直接用 `buildWorkspaceDocumentPayload(...) + renderWorkspaceDocumentPage(...)` 构造 thread 文档 payload，清空 `threadDetail.workflow.focusChecklistProgressSummary` 后，继续要求：
  - `id="thread-workflow-card" ... checklist-context-progress ... 执行清单：4 / 5 已收口`
  确保 fallback 真发生在 workflow 卡自身，而不是被全局 execution checklist 或其他 section 兜底。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已再次通过，`24 / 24` 全绿；全量 `rtk node --test` 已再次通过，`268 / 268` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 38754`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778414401457`，检查时间 `2026-05-10T12:00:04.241Z`；`rtk node scripts/automation-status.js` 也已再次确认 `10 / 10 running`。
- 当前备注：
  - 这轮之后，thread 执行现场最核心的 `任务流转` 卡也进入了“有 label 就必须显示进度”的统一 contract
  - 这层改动仍然是 projection-only fallback，后续如果想做 workflow analytics，应优先补 workflow 自身 summary 语义

## 2026-05-10 homepage 三大中枢 summary 进度行也已回退到 `progressLabel`

- 已完成：首页 `决策中枢 / 评论回流中枢 / 记忆治理中枢` 的 panel-level summary 现在也不再依赖完整 `checklistProgressSummary` 才显示第二行进度；只要 summary 带 `checklistProgressLabel`，就会稳定露出 `执行清单：...`。
- 已完成：`src/task-dashboard.js` 的 `buildFallbackCenterChecklistSummary(...)`、`buildCenterChecklistSummary(...)` 现在都会显式保留 `checklistProgressLabel`，`renderCenterChecklistSummaryCallout(...)` 则会在缺少 summary 文案时回退到 `执行清单：${progressLabel}`。
- 已完成：`test/workspace-dashboard.test.js` 现在会真实清空：
  - `decision_focus / comment_workflow / memory_governance` 自身的 `checklist_progress_summary`
  - 以及它们子卡片的 `progressLabel / progressSummary`
  然后继续要求三大中枢 summary 自身命中 `checklist-context-progress ... 执行清单：4 / 5 已收口`，确保 fallback 真发生在 panel-level summary，而不是被下方卡片兜底。
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 已再次通过，`21 / 21` 全绿；全量 `rtk node --test` 已再次通过，`268 / 268` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 32755`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778413779565`，检查时间 `2026-05-10T11:49:42.434Z`；`rtk node scripts/automation-status.js` 也已再次确认 `10 / 10 running`。
- 当前备注：
  - 这轮之后，homepage 不只是卡片级 checklist callout 稳定，三大中枢顶部 summary 也进入了“有 label 就必须显示进度”的统一 contract
  - 这层改动仍然是 projection-only fallback，后续如果想做更细的 panel analytics，应优先补 summary 源数据自身语义

## 2026-05-10 homepage checklist progress 行已回退到 `progressLabel`

- 已完成：首页 checklist callout 现在不再依赖完整 `checklistProgressSummary` 才显示第二行进度；只要卡片带 `checklistProgressLabel`，就会稳定露出 `执行清单：...`。
- 已完成：`src/task-dashboard.js` 的 `renderChecklistRelationCallout(...)` 现已和 `workspace-docs` 保持同一条 fallback 规则：没有 `checklistProgressSummary` 时，直接回退到 `执行清单：${progressLabel}`。
- 已完成：这层 helper 会同时覆盖 homepage attention 卡、决策/评论中枢卡、memory reviewer 首页网格卡、thread group 头，以及其他复用 `renderCards(...)` 的首页通用卡片。
- 已完成：`test/workspace-dashboard.test.js` 现在会真实清空部分卡片的 `checklist_progress_summary`，并继续要求：
  - `data-home-decision-focus-card ... checklist-context-progress ... 执行清单：4 / 5 已收口`
  - `data-home-grid-card ... checklist-context-progress ... 执行清单：4 / 5 已收口`
  - `data-thread-group ... checklist-context-progress ... 执行清单：4 / 5 已收口`
  确保这层 fallback 真发生在 callout 本身，而不是只在 meta 区兜底。
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 已再次通过，`21 / 21` 全绿；全量 `rtk node --test` 已再次通过，`268 / 268` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 29411`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778413477996`，检查时间 `2026-05-10T11:44:40.918Z`；`rtk node scripts/automation-status.js` 也已再次确认 `10 / 10 running`。
- 当前备注：
  - 这轮之后，homepage checklist callout 不只是“关系标题”稳定可见，连第二行 `执行清单：...` 也进入了“有 label 就必须可见”的统一 contract
  - 这层改动仍然是 projection-only fallback，后续如果想做更细的 panel/card analytics，应优先补卡片源数据自身 summary 语义

## 2026-05-10 homepage `renderCards(...)` 通用网格卡已补 checklist fallback

- 已完成：首页 `renderCards(...)` 产出的通用网格卡现在也会稳定显示 `与当前闭环关系`，不再因为 `focusNote` 为空就把整块 relation/progress callout 直接吞掉。
- 已完成：首页新增稳定 selector：`data-home-grid-card` 与 `data-home-grid-kind`，方便单测与 browser UAT 精确盯住通用首页网格卡的 checklist contract。
- 已完成：`src/task-dashboard.js` 里的 `renderCards(...)` 现在统一调用 `renderChecklistRelationCallout(card)`，会继续显示：
  - `与当前闭环关系 · ...`
  - `执行清单：4 / 5 已收口`
  即使卡片自己的 `focusNote` 暂时为空，也不会整块失声。
- 已完成：`test/workspace-dashboard.test.js` 现在会真实检查：
  - 清空部分 homepage 卡片的 `focusNote` 后重新 `renderWorkspacePage(...)`
  - 至少有一张 `data-home-grid-card` 仍继续命中 `与当前闭环关系 / 执行清单：4 / 5 已收口`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 当前也必须真实检查 homepage：
  - `data-home-grid-card ... 与当前闭环关系 / 执行清单：`
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 已再次通过，`21 / 21` 全绿；全量 `rtk node --test` 已再次通过，`268 / 268` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 25866`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778413161830`，检查时间 `2026-05-10T11:39:24.618Z`；`rtk node scripts/automation-status.js` 也已再次确认 `10 / 10 running`。
- 当前备注：
  - 这轮之后，homepage 从 panel 级 summary、attention/task/comment/thread-group 卡片，再到通用 grid-card，都已经进入 checklist context 的稳定可见范围
  - 这层改动仍然是 projection-only fallback，后续如果想做首页 grid-card analytics，应优先补卡片源数据自身 relation 字段

## 2026-05-10 homepage 任务卡 / 中枢卡 / thread group 头已统一 checklist fallback

- 已完成：首页 attention 任务卡、`决策中枢` 卡、`评论回流中枢` 卡，以及 thread group 头现在都通过统一 helper 稳定显示 `与当前闭环关系`，不再因为 `focusNote` 为空就把整块 relation/progress callout 直接吞掉。
- 已完成：首页新增稳定 selector：`data-workspace-task-card`、`data-home-decision-focus-card`、`data-home-comment-workflow-card`，方便单测与 browser UAT 精确盯住卡片级 checklist contract。
- 已完成：`src/task-dashboard.js` 现在新增统一的 `renderChecklistRelationCallout(...)` helper，首页卡片会继续显示：
  - `与当前闭环关系 · ...`
  - `执行清单：4 / 5 已收口`
  即使卡片自己的 `focusNote` 暂时为空，也不会整块失声。
- 已完成：`test/workspace-dashboard.test.js` 现在会真实检查：
  - 首页原始渲染继续命中 `与当前闭环关系 · 当前主闭环 / 优先回看`
  - 直接清空 `focusNote` 后重新 `renderWorkspacePage(...)`，`data-workspace-task-card`、`data-home-decision-focus-card`、`data-home-comment-workflow-card` 与 `data-thread-group` 仍然继续命中 `与当前闭环关系 / 执行清单：4 / 5 已收口`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 当前也必须真实检查 homepage：
  - `data-workspace-task-card ... 与当前闭环关系 / 执行清单：`
  - `data-home-decision-focus-card ... 与当前闭环关系 / 执行清单：`
  - `data-home-comment-workflow-card ... 与当前闭环关系 / 执行清单：`
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 已通过，`21 / 21` 全绿；定向 `rtk node --test test/workspace-docs.test.js` 也已通过；全量 `rtk node --test` 当前保持 `268 / 268` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 18310`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778412202917`，检查时间 `2026-05-10T11:23:25.848Z`；`rtk node scripts/automation-status.js` 也已再次确认 `10 / 10 running`。
- 当前备注：
  - 这轮之后，homepage 从 panel 级 summary 到 attention/task/comment/thread-group 卡片，都已经进入 checklist context 的稳定可见范围
  - 这层改动仍然是 projection-only fallback，后续如果想做首页 card-level analytics，应优先补卡片源数据自身 relation 字段

## 2026-05-10 memory reviewer 治理列表卡已补 checklist fallback

- 已完成：`/workspace/docs/memory` 的具体治理列表卡现在也会稳定显示 `与当前闭环关系`，不再只有 `memory-focus-strip`、右栏焦点卡和 `Reviewer 摘要` 知道当前主闭环。
- 已完成：memory reviewer 列表卡新增稳定 selector：`data-memory-governance-card`，并透出 `data-memory-kind`，方便单测与 browser UAT 精确校验 candidate / review / suggestion 列表卡继续命中 checklist 语义。
- 已完成：`renderMemoryGovernanceCard(...)` 已切到统一的 `renderChecklistRelationWithExecutionFallback(...)`，`renderMemoryGovernanceSection(...)` 也会继续把 `executionChecklist` 透传进每张治理卡。
- 已完成：`test/workspace-docs.test.js` 现在会真实检查：
  - `data-memory-governance-card ... 与当前闭环关系`
  - `data-memory-governance-card ... 执行清单：4 / 5 已收口`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 当前也必须真实检查 memory reviewer 页至少有一张 `data-memory-governance-card` 命中 `与当前闭环关系 / 执行清单：4 / 5 已收口`。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过；全量 `rtk node --test` 当前保持 `268 / 268` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 11438`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778411394800`，检查时间 `2026-05-10T11:10:01.385Z`；`rtk node scripts/automation-status.js` 也已再次确认 `10 / 10 running`。
- 当前备注：
  - 这轮之后，memory reviewer 页面从首屏 strip、右栏焦点、reviewer 摘要到治理列表卡，都已经进入 checklist context 的稳定可见范围
  - 这层改动仍然是 projection-only fallback，后续如果想做 memory queue analytics，应优先补 memory item 自身 relation 字段

## 2026-05-10 memory reviewer 右栏与摘要卡已补 checklist fallback

- 已完成：`/workspace/docs/memory` 的 `memory-focus-strip`、右栏焦点卡与 `Reviewer 摘要` 卡，现在都通过统一的 fallback helper 稳定显示 `与当前闭环关系`，不再因为 `focusItem` 自身 relation 缺口而出现左右两侧可见性不一致。
- 已完成：memory reviewer 右栏新增稳定 selector：`id="memory-reviewer-focus-card"` 与 `id="memory-reviewer-summary-card"`，方便单测与 browser UAT 精确校验这两张卡继续命中主闭环语义。
- 已完成：`test/workspace-docs.test.js` 现在会真实检查：
  - `id="memory-reviewer-focus-card" ... 与当前闭环关系`
  - `id="memory-reviewer-focus-card" ... 执行清单：4 / 5 已收口`
  - `id="memory-reviewer-summary-card" ... 与当前闭环关系`
  - `id="memory-reviewer-summary-card" ... 执行清单：4 / 5 已收口`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 当前也必须真实检查 memory reviewer 页：
  - `memory-focus-strip ... 与当前闭环关系 / 执行清单：4 / 5 已收口`
  - `memory-reviewer-focus-card ... 与当前闭环关系 / 执行清单：4 / 5 已收口`
  - `memory-reviewer-summary-card ... 与当前闭环关系 / 执行清单：4 / 5 已收口`
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过；全量 `rtk node --test` 当前保持 `268 / 268` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 7195`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778410984248`，检查时间 `2026-05-10T11:03:09.391Z`；`rtk node scripts/automation-status.js` 也已再次确认 `10 / 10 running`。
- 当前备注：
  - 这轮之后，memory reviewer 首屏从左侧执行引导到右栏焦点摘要，都已经进入 checklist context 的稳定可见范围
  - 这层改动仍然是 projection-only fallback，后续如果想做 memory queue analytics，应优先补 memory item 自身 relation 字段

## 2026-05-10 thread 任务流转卡已补 checklist fallback

- 已完成：thread 页 `id="thread-workflow-card"` 现在也会稳定显示 `与当前闭环关系`，不再因为 workflow 自身 relation 投影不完整而失声。
- 已完成：这张卡会继续直接露出 `执行清单：4 / 5 已收口`，让 thread 主执行链卡片在首屏就能把当前收口进度讲清楚。
- 已完成：`任务流转` 卡已经切到统一的 `renderChecklistRelationWithExecutionFallback(...)`，和 thread 标题区、事件总览、关联任务卡使用同一套 fallback 逻辑。
- 已完成：`test/workspace-docs.test.js` 现在会真实检查：
  - `id="thread-workflow-card" ... 与当前闭环关系`
  - `id="thread-workflow-card" ... 执行清单：4 / 5 已收口`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 当前也必须真实检查 thread 页 `thread-workflow-card` 命中 `与当前闭环关系 / 执行清单：4 / 5 已收口`。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过；全量 `rtk node --test` 当前保持 `268 / 268` 全绿。
- 已完成：最近一次代码上线后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 7195`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778410984248`，检查时间 `2026-05-10T11:03:09.391Z`；`rtk node scripts/automation-status.js` 也已再次确认 `10 / 10 running`。
- 当前备注：
  - 这轮记录补齐后，thread 首屏标题区、任务流转、事件总览、事件卡、关联任务卡的 checklist fallback 说明已经重新对齐
  - 这层改动仍然是 projection-only fallback，后续如果想做 workflow-level analytics，应优先补 workflow 自身 relation 字段

## 2026-05-10 thread 标题区与关联任务卡已补 checklist fallback

- 已完成：thread 页右栏标题区现在也会稳定显示 `当前闭环关系`，不再因为 threadPanel 自身 relation 缺口而失声。
- 已完成：`关联任务` 子任务卡现在也会稳定显示 `与当前闭环关系` 与 `执行清单：4 / 5 已收口`，不再只在 task 自身 relation 完整时才可见。
- 已完成：子任务卡现在新增 `data-thread-task-card` selector，方便单测和 browser UAT 精确校验 `关联任务` 区。
- 已完成：`test/workspace-docs.test.js` 现在会真实检查：
  - `thread-focus ... 当前闭环关系`
  - `thread-focus ... 执行清单：4 / 5 已收口`
  - `data-thread-task-card ... 与当前闭环关系`
  - `data-thread-task-card ... 执行清单：4 / 5 已收口`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 当前也必须真实检查 thread 页 `.thread-focus` 命中 `当前闭环关系 / 执行清单：4 / 5 已收口`，以及 `data-thread-task-card` 命中 `与当前闭环关系 / 执行清单：4 / 5 已收口`。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过；全量 `rtk node --test` 当前保持 `268 / 268` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 98845`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778410172477`，检查时间 `2026-05-10T10:49:35.307Z`；`rtk node scripts/automation-status.js` 也已再次确认 `10 / 10 running`。
- 当前备注：
  - 这轮之后，thread 页从标题区到子任务卡都已经进入 checklist context 的稳定可见范围
  - 这层改动仍然是 projection-only fallback，后续如果想做 task-level analytics，应优先补 task 自身 relation 字段

## 2026-05-10 thread 事件卡已补直接子任务 checklist relation

- 已完成：thread 页“直接绑定到子任务”的事件卡现在也会显示 `与当前闭环关系`，不再只有事件区总览卡知道当前闭环。
- 已完成：这批事件卡会继续直接露出 `执行清单：4 / 5 已收口`，并新增 `跳到关联子任务` 快捷入口。
- 已完成：这轮刻意没有给所有 event 卡统一塞 fallback 文案；只有能通过 `commandId / runId / decisionId / checkpointId` 直接命中子任务的事件，才会露 relation。
- 已完成：`test/workspace-docs.test.js` 现在会真实检查：
  - `data-thread-event-card ... 与当前闭环关系`
  - `data-thread-event-card ... 执行清单：4 / 5 已收口`
  - `data-thread-event-card ... 跳到关联子任务`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 当前也必须真实检查 thread 页至少存在一张 `data-thread-event-card` 命中 `与当前闭环关系`、`执行清单：4 / 5 已收口` 与 `跳到关联子任务`。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过；全量 `rtk node --test` 当前保持 `268 / 268` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 93603`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778409624331`，检查时间 `2026-05-10T10:40:27.101Z`；`rtk node scripts/automation-status.js` 也已再次确认 `10 / 10 running`。
- 当前备注：
  - 这轮之后，thread 页时间线里真正挂在子任务上的事件卡也已经进入 checklist context 可见范围
  - 这层改动仍然是 projection-only，后续如果想继续扩到 Inbox / Suggestion 事件，应先补稳定 task binding

## 2026-05-10 thread 线程事件总览已补 checklist relation / progress context

- 已完成：thread 页 `线程事件` section 现在新增 `thread-event-summary-card`，会先显示 `当前关联闭环`，不再让人一进入时间线就丢掉主闭环上下文。
- 已完成：这张总览卡会继续直接露出 `执行清单：4 / 5 已收口`，并前置 `命令 / Run / 回执 / Checkpoint / 决策 / Inbox` 的数量概览。
- 已完成：这轮刻意只补 section 级总览卡，没有给每条 event 卡单独加 checklist callout；目标是先把时间线入口补亮，而不是把事件列表做成重复噪音。
- 已完成：`test/workspace-docs.test.js` 现在会真实检查：
  - `id="thread-event-summary-card" ... 当前关联闭环`
  - `id="thread-event-summary-card" ... 执行清单：4 / 5 已收口`
  - `id="thread-event-summary-card" ... 命令`
  - `id="thread-event-summary-card" ... Checkpoint`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 当前也必须真实检查 thread 页 `thread-event-summary-card` 命中 `当前关联闭环`、`执行清单：4 / 5 已收口`、`命令` 与 `Checkpoint`。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过；全量 `rtk node --test` 当前保持 `268 / 268` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 88275`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778409034114`，检查时间 `2026-05-10T10:30:36.922Z`；`rtk node scripts/automation-status.js` 也已再次确认 `10 / 10 running`。
- 当前备注：
  - 这轮之后，thread 页时间线入口也已经进入 checklist context 可见范围
  - 这层改动仍然是 projection-only，可继续安全叠加到后续更细的事件审计语义上

## 2026-05-10 thread 评论筛选状态卡已补 checklist relation / progress context

- 已完成：thread 页 `comment-filter-status` 现在也会直接显示 `当前关联闭环`，不再只解释 `当前聚焦：待分流 / 已接回执行 / 已拦截 / 历史层`。
- 已完成：这张状态卡会继续直接露出 `执行清单：4 / 5 已收口`，让评论筛选条下方这一步也开始带整体收口进度。
- 已完成：这轮没有新增 comment filter 的持久化 relation 字段；仍然复用统一 helper，先吃线程 / 卡片已有 relation，不够时回退到当前主闭环 checklist。
- 已完成：`test/workspace-docs.test.js` 现在会真实检查：
  - `data-comment-filter-status ... 当前关联闭环`
  - `data-comment-filter-status ... 执行清单：4 / 5 已收口`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 当前也必须真实检查 thread 页 `data-comment-filter-status` 命中 `当前关联闭环` 与 `执行清单：4 / 5 已收口`。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过；全量 `rtk node --test` 当前保持 `268 / 268` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 82518`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778408387747`，检查时间 `2026-05-10T10:19:50.508Z`；`rtk node scripts/automation-status.js` 也已再次确认 `10 / 10 running`。
- 当前备注：
  - 这轮之后，thread 页评论筛选状态卡也已经进入 checklist context 可见范围
  - 这层改动仍然是 projection-only，可继续安全叠加到后面的首屏状态卡上
## 2026-05-10 thread 执行摘要卡已补 checklist relation / progress context

- 已完成：thread 页 `执行摘要` 卡现在也会直接显示 `当前关联闭环`，不再只靠顶部 focus strip 才能知道当前闭环挂在哪一步。
- 已完成：`执行摘要` 卡现在新增 `id="execution-summary-card"` 标记，方便单测和 browser UAT 精确校验这张首屏状态卡。
- 已完成：`来源修补` 卡也已接上同一套 checklist relation helper，checkpoint-backed brief residual 场景现在同样会直接露出 `当前关联闭环 / 执行清单：...`。
- 已完成：`test/workspace-docs.test.js` 现在会真实检查：
  - `id="execution-summary-card" ... 当前关联闭环`
  - `id="execution-summary-card" ... 执行清单：4 / 5 已收口`
  - `id="thread-source-recovery" ... 当前关联闭环`
  - `id="thread-source-recovery" ... 执行清单：4 / 5 已收口`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 当前也必须真实检查 thread 页 `execution-summary-card` 命中 `当前关联闭环` 与 `执行清单：4 / 5 已收口`。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过；全量 `rtk node --test` 当前保持 `268 / 268` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 76476`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778407704510`，检查时间 `2026-05-10T10:08:28.042Z`；`rtk node scripts/automation-status.js` 也已再次确认 `10 / 10 running`。
- 当前备注：
  - 这轮之后，thread 首屏最高频被看到的执行状态卡也已经带上 checklist context
  - 这层 helper 的目标是统一 fallback 逻辑，而不是额外引入一套 execution summary / source recovery 的持久化 relation 模型

## 2026-05-10 thread 协作输入与评论总览已补 checklist relation / progress context

- 已完成：thread 页 `协作输入` 面板现在也会直接显示 `当前关联闭环`，人在准备继续派发下一条协作动作前，不需要先退回顶部 focus strip。
- 已完成：thread 页 `评论线程总览` 卡现在也会直接显示 `当前关联闭环`，不再只是评论数量统计。
- 已完成：`src/workspace-docs.js` 现在新增统一 helper，把“先吃当前卡片 relation，不够时回退到当前主闭环 checklist”收成一套逻辑，供 compose / comment summary / decision / comment cards 共用。
- 已完成：`test/workspace-docs.test.js` 现在会真实检查：
  - `id="workspace-compose" ... 当前关联闭环`
  - `id="workspace-compose" ... 执行清单：4 / 5 已收口`
  - `comment-summary-card ... 当前关联闭环`
  - `comment-summary-card ... 执行清单：4 / 5 已收口`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 当前也必须真实检查 thread 页 `协作输入` 与 `评论线程总览` 都命中 `当前关联闭环` 与 `执行清单：4 / 5 已收口`。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过；全量 `rtk node --test` 当前保持 `268 / 268` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 71563`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778407162417`，检查时间 `2026-05-10T09:59:25.293Z`；`rtk node scripts/automation-status.js` 也已再次确认 `10 / 10 running`。
- 当前备注：
  - 这轮之后，thread 首屏真正的协作入口也已经带上 checklist 上下文，不再只是展示层卡片知道当前闭环
  - 这层 helper 的目标是统一 fallback 逻辑、减少后续回归面，而不是新增一套持久化 relation 模型

## 2026-05-10 thread 评论列表卡已补 checklist relation / progress fallback

- 已完成：thread 页普通 `评论线程卡` 现在也会直接显示 `与当前闭环关系`，不再只在 meta grid 里埋 `关联子任务 / 与当前聚焦关系`。
- 已完成：当 comment 自身已经带上 checklist relation 时，会优先吃 comment 自己的 relation；如果当前 relation 还没稳定挂到 task，也会回退到当前主闭环 checklist，至少继续露出 `第 N 步 / 执行清单：...`。
- 已完成：普通评论卡现在新增 `data-comment-thread-card` 标记，方便单测和 browser UAT 精确校验列表卡本身。
- 已完成：`test/workspace-docs.test.js` 现在会真实检查 `data-comment-thread-card ... 与当前闭环关系` 与 `data-comment-thread-card ... 执行清单：4 / 5 已收口`。
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 当前也必须真实检查 thread 页普通 `data-comment-thread-card` 命中 `与当前闭环关系` 与 `执行清单：4 / 5 已收口`。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过；全量 `rtk node --test` 当前保持 `268 / 268` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 65822`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778406535854`，检查时间 `2026-05-10T09:48:58.761Z`；`rtk node scripts/automation-status.js` 也已再次确认 `10 / 10 running`。
- 当前备注：
  - 这层 fallback 的目标不是伪造普通评论卡的持久化 relation，而是在 relation 尚未稳定时，仍然把主闭环进度继续带进评论列表现场
  - 这轮之后，thread 页普通 comment thread card 的 checklist 上下文也已经不再只依赖顶部聚焦卡才看得见

## 2026-05-10 thread 快速拍板卡已补 checklist relation / progress fallback

- 已完成：thread 页 `快速拍板` 决策卡现在也会直接显示 `与当前闭环关系`，不再只给 `当前判断 / 当前节点 / 这一步验收 / Checkpoint 规则`。
- 已完成：当 decision 自身已经带上 checklist relation 时，会优先吃 decision 自己的 relation；如果当前 relation 还没稳定挂到 task，也会回退到当前主闭环 checklist，至少继续露出 `第 N 步 / 执行清单：...`。
- 已完成：`test/workspace-docs.test.js` 现在会真实检查 `data-decision-card ... 与当前闭环关系` 与 `data-decision-card ... 执行清单：4 / 5 已收口`。
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 当前也必须真实检查 thread 页 `data-decision-card` 命中 `与当前闭环关系` 与 `执行清单：4 / 5 已收口`。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过；全量 `rtk node --test` 当前保持 `268 / 268` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 61997`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778406179892`，检查时间 `2026-05-10T09:43:02.707Z`；`rtk node scripts/automation-status.js` 也已再次确认 `10 / 10 running`。
- 当前备注：
  - 这层 fallback 的目标不是伪造 decision 的持久化 relation，而是在 relation 尚未稳定时，仍然把主闭环进度继续带进拍板现场
  - 这轮之后，thread 页 decision card 的 checklist 上下文也已经不再只依赖顶部 focus strip 才能看见

## 2026-05-10 thread 评论聚焦卡已补 checklist relation / progress fallback

- 已完成：thread 页 `当前评论节点` 聚焦卡现在也会直接显示 `与当前闭环关系`，不再只给 `当前判断 / 当前节点 / 这一步验收 / Checkpoint 规则`。
- 已完成：当 comment 自己已经绑定到具体 task/thread relation 时，会优先吃 comment 自身的 checklist relation；如果当前 relation 还不稳定，则会回退到当前主闭环 checklist，至少继续露出 `第 N 步 / 执行清单：...`。
- 已完成：`renderChecklistRelationCallout(...)` 现在在没有 `progressSummary` 时，也会回退到 `执行清单：${progressLabel}`，避免 thread 现场因为少一层 summary 字段就整块失声。
- 已完成：`test/workspace-docs.test.js` 现在会真实检查两类 comment focus 场景都命中：
  - `data-comment-focus-card ... 与当前闭环关系`
  - `data-comment-focus-card ... 执行清单：4 / 5 已收口`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 当前也必须真实检查 thread 页 `data-comment-focus-card` 命中 `与当前闭环关系` 与 `执行清单：4 / 5 已收口`。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 已通过；全量 `rtk node --test` 当前保持 `268 / 268` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 57110`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778405651681`，检查时间 `2026-05-10T09:34:14.439Z`；`rtk node scripts/automation-status.js` 也已再次确认 `10 / 10 running`。
- 当前备注：
  - 这层 fallback 的目标不是伪造 comment 的持久化 relation，而是在 relation 尚未稳定时，仍然把主闭环进度继续带进执行现场
  - 这轮之后，thread 页 comment focus card 的 checklist 上下文已经不再只依赖顶部 focus strip 才能看见

## 2026-05-10 首页跨中枢 feedback 文案统一到“首页动作已写回”

- 已完成：首页 `决策拍板 / 评论回流 / 记忆治理 / suggestion 治理` 的 success feedback 现在统一改成 `首页动作已写回 · ...` 前缀，不再混用 `首页拍板已写回 / 线程回复已写入 / 首页已标记继续补证据` 这类分裂口径。
- 已完成：这轮没有新增后端协议，也没有新增 schema；只复用现有 `action_feedback / action_feedback_tone` 流，并统一 homepage 的文案 builder。
- 已完成：`test/task-dashboard-feedback.test.js` 现在会真实检查：
  - `首页动作已写回 · 决策拍板`
  - `首页动作已写回 · 线程回复：...`
  - `首页动作已写回 · 记忆治理 · 标记继续补证据：...`
  - `首页动作已写回 · Suggestion 治理 · 转成 candidate memory`
- 已完成：`test/workspace-dashboard.test.js` 现在会继续真实检查刷新后的 homepage banner 仍然命中新 contract，而不是旧文案。
- 已完成：`scripts/workspace-home-feedback-live-uat.playwright.js` 也已同步到新 contract，并改成验证“刷新后的 success banner + 页面现场状态”，不再等待会被页面 `history.replaceState` 立即清掉的 `action_feedback` query 参数。
- 已完成：这条 live UAT 还额外帮我们抓到了一个只有真实点击才会暴露的前台问题：homepage 浏览器脚本最初漏注入 `buildWorkspaceFeedbackBase`，点击后会报 `buildWorkspaceFeedbackBase is not defined`；现已补齐。
- 已完成：定向 `rtk node --test test/task-dashboard-feedback.test.js`、`rtk node --test test/workspace-dashboard.test.js`、`rtk node --test test/workspace-docs.test.js` 均已通过；全量 `rtk node --test` 当前保持 `268 / 268` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 47323`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-home-feedback-1778404447695`，检查时间 `2026-05-10T09:14:09.632Z`；最近一次 execution guide 浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778404460442`，检查时间 `2026-05-10T09:14:23.114Z`；`rtk node scripts/automation-status.js` 也已再次确认 `10 / 10 running`。
- 当前备注：
  - homepage success feedback 现在已经是单一 contract，后续只需要继续扩展 action label，不应再新增新的前缀家族
  - 这轮再次证明 homepage 相关回归必须保留浏览器级验收，因为 query cleanup 和 helper 注入这类问题不会被纯 route/unit 测试看见

## 2026-05-10 首页三大中枢已前置 panel 级 checklist 摘要

- 已完成：首页 `#decision-center / #comment-workflow-center / #memory-governance-center` 现在都会先显示一条 panel 级 `当前关联闭环 ...` 摘要，不再只把 checklist relation 埋在卡片内部。
- 已完成：这条中枢级摘要会继续同时露出 `执行清单：...` progress 语义。
- 已完成：如果当前卡片本身已经带了 `focusLabel / focusNote / 闭环 N / M`，中枢级摘要会优先提炼它；如果真实首页 seed 暂时没有卡片带这层 label，则回退到当前主闭环 checklist context，避免首页因为个别卡缺 label 就整块失声。
- 已完成：这轮继续没有新增后端协议；只复用现有 checklist relation、focus summary 和 progress 字段。
- 已完成：`test/workspace-dashboard.test.js` 现在会真实检查：
  - `workspace.body.decision_focus.checklistHeadline`
  - `workspace.body.comment_workflow.checklistHeadline`
  - `workspace.body.memory_governance.checklistHeadline`
  - 首页 HTML scoped 命中 `当前关联闭环 · ...`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 当前也必须真实检查 homepage 的 `decision / comment / memory` 三个中枢都命中 `当前关联闭环` 与 `执行清单：`。
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 与 `rtk node --test test/workspace-docs.test.js` 均已通过；全量 `rtk node --test` 当前保持 `268 / 268` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 36459`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778403189720`，检查时间 `2026-05-10T08:53:12.569Z`；`rtk node scripts/automation-status.js` 也已再次确认 `10 / 10 running`。
- 当前备注：
  - 这层中枢级摘要的目标是让人先看懂“这块当前挂在哪个闭环”，再决定要不要逐张进入卡片
  - 这轮中途发现的唯一问题是 live runtime 没在最后一处代码修复后及时重启；重启后 UAT 已稳定通过

## 2026-05-10 首页 memory center 已补最近证据更新时间

- 已完成：`/workspace` 首页 `#memory-governance-center` 现在会在 `最近证据` 下继续显示 `更新于 ...`。
- 已完成：首页 memory governance 卡现在也会显式前置 `证据现场：记忆候选区|Review 队列|Suggestion 沉淀区|记忆治理现场`。
- 已完成：首页这层时间信号优先取最新 source 的 `createdAt`，没有最新 source 时再回退到 memory 的 `updatedAt / createdAt`。
- 已完成：这轮继续没有新增后端协议；只是把现有 memory/source freshness 字段前移到首页治理中枢。
- 已完成：`test/workspace-dashboard.test.js` 现在会真实检查 homepage `记忆治理中枢` scoped 命中：
  - `最近证据`
  - `更新于 2026-05-08 13:00:00Z`
  - `证据现场：记忆候选区|Review 队列|Suggestion 沉淀区`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 当前也必须真实检查 homepage `#memory-governance-center` 命中 `最近证据 / 更新于 / 证据现场`。
- 已完成：定向 `rtk node --test test/workspace-dashboard.test.js` 与 `rtk node --test test/workspace-docs.test.js` 均已通过；全量 `rtk node --test` 当前保持 `268 / 268` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 29103`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778402453986`，检查时间 `2026-05-10T08:40:56.736Z`；`rtk node scripts/automation-status.js` 也已再次确认 `10 / 10 running`。
- 当前备注：
  - homepage memory center 现在已经和 memory reviewer 首屏共享同一层 freshness 语言
  - 这轮暴露出来的唯一问题是 HTML fixture 时间断言写死成了 `12:00:00Z`；已按该测试自己的 `13:00:00Z` server clock 对齐，避免后续误判成渲染回退

## 2026-05-10 memory reviewer 首屏已补最近证据更新时间

- 已完成：`/workspace/docs/memory` 的 `#memory-focus-strip` 现在会在 `最近证据` 下继续显示 `更新于 ...`。
- 已完成：这层时间信号优先取最新 source 的 `createdAt`，没有最新 source 时再回退到 memory 的 `updatedAt / createdAt`。
- 已完成：这轮继续没有新增后端协议；只是把现有 memory/source 时间字段前移到首屏。
- 已完成：`test/workspace-docs.test.js` 现在会真实检查 memory reviewer 首屏命中 `更新于 2026-05-02 12:00:00Z`，避免后续有人把这层 freshness 时间感悄悄回退掉。
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 当前也必须真实检查 memory reviewer 首屏命中 `更新于`。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 与 `rtk node --test test/workspace-dashboard.test.js` 均已通过；全量 `rtk node --test` 当前保持 `268 / 268` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 19949`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778401295953`，检查时间 `2026-05-10T08:21:39.107Z`；restart 内置状态检查也已再次确认 `10 / 10 running`。
- 当前备注：
  - memory reviewer 首屏现在既有 `证据现场`，也有 proof freshness 时间感
  - 下一步更值得继续补的，是 homepage `memory-governance-center` 是否也要共享这层 `更新于 ...`，让首页不必进入 memory doc 才看得见 freshness

## 2026-05-10 memory reviewer 首屏已补证据现场与条件式来源入口

- 已完成：`/workspace/docs/memory` 的 `#memory-focus-strip` 现在也会前置 `证据现场：...`，不再只显示 `打开当前来源`。
- 已完成：memory reviewer 首屏当前会根据焦点 section 投影出稳定的 scene label：
  - `记忆候选区`
  - `Review 队列`
  - `Suggestion 沉淀区`
  - `记忆治理现场`
- 已完成：memory focus strip 现在会继续前置：
  - `打开证据现场`
  - `打开当前来源`
  - `打开当前主闭环`
- 已完成：这轮继续没有新增后端协议；只复用现有 `memoryPanel.focusItem.sectionAnchorId / link / focusSectionTitle`。
- 已完成：`test/workspace-docs.test.js` 现在会真实覆盖 memory reviewer 首屏命中：
  - `最近证据`
  - `证据现场：记忆候选区|Review 队列|Suggestion 沉淀区|记忆治理现场`
  - `打开证据现场`
  - `打开当前来源`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 当前也必须真实检查 memory reviewer 首屏命中同一套 proof/source 语义。
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 与 `rtk node --test test/workspace-dashboard.test.js` 均已通过；全量 `rtk node --test` 当前保持 `268 / 268` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 15000`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778400735084`，检查时间 `2026-05-10T08:12:17.969Z`；`rtk node scripts/automation-status.js` 也已再次确认 `10 / 10 running`。
- 当前备注：
  - memory reviewer 首屏现在已经和 homepage / execution doc / thread page 共享同一套 proof scene 语义
  - 下一步更值得继续补的是 reviewer 证据的更新时间，避免 memory 首屏的 `最近证据` 仍然只有摘要没有 freshness 时间感

## 2026-05-10 文档 / 线程首屏已补证据现场与条件源入口

- 已完成：`/workspace/docs/*` 与 `/workspace/threads/*` 的 `#execution-focus-strip` 现在都会继续前置 `证据现场：...`，不再只显示 `最近证据 + 打开证据现场`。
- 已完成：focus strip 现在会在已有稳定锚点时继续补出条件式 source-entry：
  - `打开最近源位置`
  - `打开待治理线程`
  - `打开源位置`
- 已完成：这轮继续没有新增后端协议；只复用现有 `executionChecklist.focusEvidenceContextLabel / focusEvidenceSourceHref / focusEvidenceSourceLabel`。
- 已完成：`test/workspace-docs.test.js` 现在会覆盖三类稳定页面场景：
  - 执行文档页首屏命中 `证据现场`
  - 红灯线程页首屏命中 `证据现场`
  - checkpoint-backed residual 线程页首屏命中 `证据现场 + 打开证据现场 + 打开最近源位置|打开待治理线程`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 当前也必须真实检查 doc/thread 首屏命中：
  - `最近证据`
  - `证据现场：历史层残留` 或 `证据现场：线程治理现场`
  - `打开证据现场`
  - `打开待治理线程` 或 `打开最近源位置` 或 `打开源位置`
- 已完成：定向 `rtk node --test test/workspace-docs.test.js` 与 `rtk node --test test/workspace-dashboard.test.js` 均已通过；全量 `rtk node --test` 当前保持 `268 / 268` 全绿。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 11030`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778400347689`，检查时间 `2026-05-10T08:05:50.323Z`；`rtk node scripts/automation-status.js` 也已再次确认 `10 / 10 running`。
- 当前备注：
  - `历史层残留` 与 `线程治理现场` 都是这条主闭环在不同入口上下文下的合法 scene label，不应被写死成单一路径
  - 这轮已经把 homepage hero 与 doc/thread 首屏的 proof 语言对齐；下一步更值得继续补的是 memory doc 是否也要共享同层级 source-entry 语义

## 2026-05-10 首页 hero proof 已补证据现场语义

- 已完成：homepage hero 顶部的 `最近证据` 区域现在会继续前置 `证据现场：...`，帮助人先理解 proof 入口对应的是哪类现场。
- 已完成：这层 `证据现场` 语义继续没有新增后端协议；只复用现有 checklist item id、evidence href 是否 thread-backed、以及 residual pattern 状态，前台推导出：
  - `线程执行现场`
  - `评论线程现场`
  - `历史层残留`
  - `线程治理现场`
  - `决策区`
  - `协作输入区`
- 已完成：当前 thread-identity 主闭环的稳定 browser seed 现在会真实命中 `证据现场：历史层残留`，并继续同时露出 `打开证据现场 / 打开待治理线程`。
- 已完成：`test/workspace-dashboard.test.js` 现在会同时检查：
  - `/workspace/data` 返回 `focusEvidenceContextLabel / item.evidenceContextLabel`
  - hero 条带 scoped 命中 `证据现场：`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 当前也必须真实检查 hero 条带命中 `证据现场：历史层残留`。
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 3628`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778399518659`，检查时间 `2026-05-10T07:52:01.261Z`。
- 定向回归：
  - `rtk node --test test/workspace-dashboard.test.js`
  - `rtk node --test`
  - `rtk npm run automation:restart`
  - `rtk npm run workspace:execution-guide:uat`
  - `rtk node scripts/automation-status.js`
- 当前备注：
  - 这层 `证据现场` 语义当前已经被单测和 live browser UAT 同时覆盖
  - 后续更值得继续补的，是让更多非 thread-identity 焦点也稳定命中更具体的 evidence type + source anchor 组合

## 2026-05-10 首页 hero proof 已补条件式 source 入口

- 已完成：homepage hero 顶部的 `最近证据` 区域现在会在已有代表性锚点时，继续补出 `打开最近源位置 / 打开待治理线程 / 打开源位置` 这类 source-entry。
- 已完成：这层 source-entry 继续没有新增后端协议；只复用现有 `executionChecklist.focusEvidence*`、task `primary_link / primaryLink`，以及 thread-identity residual pattern 的代表性 thread href。
- 已完成：hero 数据卫生条带、hero 主闭环速览、Checklist 卡里的 `最近证据` 区块，现在都共享同一套条件式 source-entry 投影。
- 已完成：`test/workspace-dashboard.test.js` 现在会 scoped 检查 hero 条带在可命中场景下包含：
  - `打开证据现场`
  - `打开最近源位置` 或 `打开待治理线程`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 现在也已经重新加回 source-entry 断言，并在稳定 seed 场景下真实检查 hero 条带命中：
  - `打开证据现场`
  - `打开待治理线程` 或 `打开源位置` 或 `打开最近源位置`
- 已完成：代码变更后已重新执行 `rtk npm run automation:restart`，当前 live listener 为 `19100 / pid 92236`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778398802723`，检查时间 `2026-05-10T07:40:05.845Z`。
- 定向回归：
  - `rtk node --test test/workspace-dashboard.test.js`
  - `rtk node --test`
  - `rtk npm run automation:restart`
  - `rtk npm run workspace:execution-guide:uat`
  - `rtk node scripts/automation-status.js`
- 当前备注：
  - source-entry 当前是“条件式增强”，不会在缺少稳定锚点时伪造链接
  - 现在单测和 live browser UAT 都已经覆盖到 source-entry 命中场景；剩余差异只在于某些真实项目焦点本身可能没有可用锚点

## 2026-05-10 首页 hero 治理条带已补最近证据摘要与 proof 入口

- 已完成：`#hero-data-hygiene-guidance` 现在会直接前置 `最近证据 / 打开证据现场`。
- 已完成：这层 proof 入口继续没有新增后端协议；只复用现有 `executionChecklist.focusEvidenceLabel / focusEvidenceHref / focusEvidenceUpdatedAt`。
- 已完成：homepage hero 条带当前已经同时覆盖六层首屏信息：
  - 当前在治理什么
  - 该去哪个现场处理
  - 它挂在哪一步闭环、整体进度到哪
  - 这一步的验收条件
  - 这一步对应的 Checkpoint 规则
  - 最近证据与 proof 入口
- 已完成：`test/workspace-dashboard.test.js` 现在会 scoped 检查 hero 条带本身命中：
  - `最近证据：`
  - `打开证据现场`
  - 对应的治理现场链接与闭环语义
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 的 homepage step 现在也必须真实检查 hero 条带命中 `最近证据： / 打开证据现场`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778396471417`，检查时间 `2026-05-10T07:01:13.998Z`。
- 定向回归：
  - `rtk node --test test/workspace-dashboard.test.js`
  - `rtk npm run workspace:execution-guide:uat`
- 当前备注：
  - hero 顶部这块现在已经从“治理说明”推进到“治理焦点 + 直达入口 + 闭环进度 + 过关标准 + proof 入口”五层合一
  - 后续更值得继续补的，是让 proof 入口进一步贴近具体 source anchor，减少进入现场后的二次定位

## 2026-05-10 首页 hero 治理条带已补验收条件与 Checkpoint 规则

- 已完成：`#hero-data-hygiene-guidance` 现在会直接把 `验收条件 / Checkpoint 规则` 一并前置到 hero 首屏。
- 已完成：这层验收语义继续没有新增后端协议；只复用现有 `executionChecklist.nextAcceptance / checkpointRule`。
- 已完成：homepage hero 条带当前已经同时覆盖五层首屏信息：
  - 当前在治理什么
  - 该去哪个现场处理
  - 它挂在哪一步闭环、整体进度到哪
  - 这一步的验收条件
  - 这一步对应的 Checkpoint 规则
- 已完成：`test/workspace-dashboard.test.js` 现在会 scoped 检查 hero 条带本身命中：
  - `验收条件`
  - `真实协作线程优先落到稳定 thread identity`
  - `Checkpoint 规则`
  - `每完成一段都要经过：实现 -> 测试 -> live probe -> 更新 checkpoint 文档。`
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 的 homepage step 现在也必须真实检查 hero 条带命中 `验收条件 / Checkpoint 规则`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778396471417`，检查时间 `2026-05-10T07:01:13.998Z`。
- 定向回归：
  - `rtk node --test test/workspace-dashboard.test.js`
  - `rtk npm run workspace:execution-guide:uat`
- 当前备注：
  - hero 顶部这块现在已经从“治理说明”推进到“治理焦点 + 直达入口 + 闭环进度 + 过关标准”四层合一
  - 这层首屏语义现在已经继续把最近证据摘要和 proof 入口一并前移

## 2026-05-10 首页 hero 治理条带已补闭环步数与进度语义

- 已完成：`#hero-data-hygiene-guidance` 现在会在 `当前判断` 下方直接补 `关联闭环：第 N 步` 与 `执行清单：X / Y 已收口` 这类进度语义。
- 已完成：这层 progress meta 继续没有新增后端协议；只复用现有 `executionChecklist.focusStepNumber / progressLabel / focusContextTitle`。
- 已完成：homepage hero 条带当前已经同时覆盖三层首屏信息：
  - 当前在治理什么
  - 该去哪个现场处理
  - 它挂在哪一步闭环、整体进度到哪
- 已完成：`test/workspace-dashboard.test.js` 现在会 scoped 检查 hero 条带本身命中：
  - `关联闭环：第 3 步`
  - `执行清单：4 / 5 已收口`
  - 对应的治理现场链接
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 的 homepage step 现在也必须真实检查 hero 条带命中 `关联闭环：第 3 步`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778395653092`，检查时间 `2026-05-10T06:47:40.638Z`。
- 定向回归：
  - `rtk node --test test/workspace-dashboard.test.js`
  - `rtk npm run workspace:execution-guide:uat`
- 当前备注：
  - hero 顶部这块现在已经从“治理说明”推进到“治理焦点 + 直达入口 + 闭环进度”三层合一
  - 这层进度语义现在已经继续和验收条件、Checkpoint 规则一起前移到首屏

## 2026-05-10 首页 hero 治理条带已补现场直达入口

- 已完成：`#hero-data-hygiene-guidance` 现在除了 `当前治理焦点 / 当前判断 / 这一步处理`，还会直接露出与当前状态对应的现场直达链接。
- 已完成：这层直达入口继续没有新增后端协议；只复用现有 `residualToggleUrl / clearResidualPatternUrl / thread-governance href / focus residual pattern href`。
- 已完成：首页 hero 条带当前会按场景去重显示：
  - `查看全部历史线程` 或 `切回聚焦视图`
  - `清除残留筛选`
  - `打开线程治理`
  - `查看当前残留模式`
- 已完成：`test/workspace-dashboard.test.js` 现在会 scoped 检查 `#hero-data-hygiene-guidance` 自身包含这些链接，不再只依赖页面别处碰巧也有同名入口。
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 的 homepage step 现在也必须真实检查 hero 条带命中 `查看全部历史线程` 与 `打开线程治理`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778395099071`，检查时间 `2026-05-10T06:38:21.825Z`。
- 定向回归：
  - `rtk node --test test/workspace-dashboard.test.js`
  - `rtk npm run workspace:execution-guide:uat`
- 当前备注：
  - homepage hero 顶部这块现在已经从“判断条带”推进到“判断 + 直达入口”并存
  - 后续更值得继续补的，是把 checklist progress context 也进一步压进同一块首屏区域

## 2026-05-10 首页 hero 顶部线程身份 / 数据卫生已前置治理焦点

- 已完成：首页 hero 顶部现在新增 `#hero-data-hygiene-guidance`，会直接前置 `当前治理焦点 / 当前判断 / 这一步处理`。
- 已完成：这层 hero guidance 继续没有新增后端协议；只复用现有 `dataHygiene + threadIdentityGovernance` 上的 `visible_recoverable_* / hidden_low_specificity_* / visible_low_specificity_* / concrete_thread_total / raw_low_specificity_thread_total / merged_attention_duplicates / patternGroups / focusedPattern`。
- 已完成：原先偏被动的 `线程身份 / 待恢复 / 历史层已折叠 / 相近卡合并` 播报，现在已经压成一个更行动化的治理条带，同时仍保留 `查看全部历史线程 / 清除残留筛选 / 查看完整原始视图` 这类切换入口。
- 已完成：`test/workspace-dashboard.test.js` 现在同时覆盖：
  - 默认 homepage 的主视图泛化线程分支
  - 默认隐藏历史残留的分支
  - 相近卡合并仍能继续透出治理依据
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 的 homepage step 现在也必须真实检查 `#hero-data-hygiene-guidance` 命中 `当前治理焦点 / 当前判断 / 这一步处理`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778394745393`，检查时间 `2026-05-10T06:32:28.101Z`。
- 定向回归：
  - `rtk node --test test/workspace-dashboard.test.js`
  - `rtk npm run workspace:execution-guide:uat`
- 当前备注：
  - homepage hero 顶部现在也开始共享“先判断什么、这一步怎么处理”的同一套前台语言
  - 后续更值得继续补的，是让这层 hero guidance 直接带更多 checklist / thread governance 的 focus context 与快捷跳转

## 2026-05-10 首页线程治理面板已前置清理判断

- 已完成：首页 `线程治理` 面板现在会在 KPI 下方先前置 `当前治理节点 / 当前判断 / 这一步处理 / 治理规则`。
- 已完成：这层 homepage guidance 继续没有新增后端协议；只复用现有 `threadIdentityGovernance.items / patternGroups / focusedPattern` 上已有的 `residualPatternLabel / reason / evidenceStatusLabel / evidenceDetail / cleanupHint / action / sourceLabel`。
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 现在会额外 seed 一条真实 `run-only` residual，并在 homepage step 里检查 `#thread-governance` 命中 `当前治理节点 / 当前判断 / 这一步处理 / 治理规则`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778393979848`，检查时间 `2026-05-10T06:19:42.532Z`。
- 定向回归：
  - `rtk node --test test/workspace-dashboard.test.js`
  - `rtk npm run workspace:execution-guide:uat`
- 当前备注：
  - homepage 里 `decision / comment / memory / thread governance` 四类中枢现在都已经开始共享“先判断什么、这一步怎么推进”的语言
  - 后续更值得继续补的，是 hero 顶部 `线程身份 / 数据卫生` 提示是否也要前置成更行动化的 guidance

## 2026-05-10 首页记忆治理中枢已前置判断 guidance

- 已完成：首页 `记忆治理中枢` 的 `记忆候选 / Review 队列 / 相关 Suggestions` 卡片现在都会直接前置 `当前治理节点 / 当前判断 / 这一步判断`。
- 已完成：这层 homepage guidance 仍然没有新增后端协议；只复用已有 `card.type / memoryStatusLabel / reviewStateLabel / reviewerRecommendationSummary / evidenceSummary / freshness / evidenceDelta / revalidation / nextStep / homeGovernanceHint`。
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 的 homepage step 现在必须真实检查 `#memory-governance-center` 命中 `当前治理节点 / 当前判断 / 这一步判断`。
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778393435366`，检查时间 `2026-05-10T06:10:37.944Z`。
- 定向回归：
  - `rtk node --test test/workspace-dashboard.test.js`
  - `rtk npm run workspace:execution-guide:uat`
- 当前备注：
  - homepage 的 decision / comment / memory 三个中枢现在都已经开始共享“先判断什么、这一步怎么拍板”的前台语言
  - 后续更值得继续补的，是 `thread identity / data hygiene` 一类治理面板是否也要前置同等级的判断 guidance

## 2026-05-10 comment / memory 细粒度节点摘要已前置

- 已完成：`评论线程` 区现在新增 `当前评论节点` 摘要卡，会直接复用当前筛选里第一张评论卡已有的 `当前节点 / 这一步验收 / Checkpoint 规则 / 下一步`。
- 已完成：`memory-focus-strip` 现在新增 `当前治理节点 / 这一步判断 / 治理规则`，并直接复用 focus item 已有的 reviewer / evidence / freshness / revalidation 信号。
- 已完成：这轮仍然没有新增后端协议；comment 侧只复用 `selectedFilter + commentThreads`，memory 侧只复用 `focusItem + executionChecklist`。
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 现在还必须真实检查：
  - memory 首屏命中 `当前治理节点 / 这一步判断`
  - thread 页命中新增加的 `当前评论节点` 摘要卡
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778392450046`，检查时间 `2026-05-10T05:54:12.658Z`。
- 定向回归：
  - `rtk node --test test/workspace-docs.test.js`
  - `rtk npm run workspace:execution-guide:uat`
- 当前备注：
  - execution / comment / memory 三类现场现在都已经开始共享“当前节点怎么过关”的前台语言
  - 后续更值得继续补的，是 homepage 中枢卡片是否也要把这层节点级判断继续前置

## 2026-05-10 execution doc / thread 首屏已前置节点级 workflow guidance

- 已完成：`execution-focus-strip` 现在不只复用首页 `当前执行引导`，还会在 execution doc 与 thread 首屏直接前置 `当前节点 / 这一步验收 / Checkpoint 规则`。
- 已完成：首屏节点引导当前按“决策优先、workflow 兜底”收口：
  - 如果线程存在 open red/yellow decision，首屏必须优先展示决策节点 guidance
  - 如果没有待拍板决策，首屏再回退到普通 workflow 节点 guidance
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 现在也必须真实检查：
  - execution doc 首屏命中 `当前执行引导 / 当前节点 / 这一步验收 / Checkpoint 规则`
  - thread 首屏命中 `当前执行引导 / 当前节点 / 这一步验收 / Checkpoint 规则`
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778391916325`，检查时间 `2026-05-10T05:45:18.888Z`。
- 定向回归：
  - `rtk node --test test/workspace-docs.test.js`
  - `rtk npm run workspace:execution-guide:uat`
- 当前备注：
  - 首屏执行引导现在已经从“先去哪”推进到“这一步怎么过关”
  - 后续更值得继续补的，是 comment / memory 更细粒度的子节点 guidance 是否也要像这层一样前置

## 2026-05-10 `当前执行引导` 已补真实浏览器首屏验收

- 已完成：新增 `scripts/workspace-execution-guide-live-uat.playwright.js`，会自己创建临时 `PRJ-cortex-live-browser-execution-guide-*` 项目，并在真实 `19100` 上连续检查 homepage、execution doc、memory reviewer、thread 四个入口的首屏执行引导。
- 已完成：`package.json` 现已新增 `workspace:execution-guide:uat`，可以直接复跑：
  - `rtk npm run workspace:execution-guide:uat`
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-execution-guide-1778391248299`，同一轮必须同时命中：
  - 首页 `当前执行引导 / 红灯拍板 / 评论分流 / 记忆治理`
  - execution doc 首屏 `当前执行引导 / 红灯拍板 / 评论分流`
  - memory reviewer 首屏 `当前执行引导 / 红灯拍板 / 记忆治理`
  - thread 首屏 `当前执行引导 / 红灯拍板 / 查看任务流转`
- 已完成：这条 live UAT 当前固定使用稳定 triage seed `为什么这个线程还没有继续跑？`，避免 comment 被自动路由成 `ready` 后，把浏览器验收误判成“评论分流入口消失”。
- 定向回归：
  - `rtk npm run workspace:execution-guide:uat`
- 当前备注：
  - doc / thread / memory 首屏复用首页执行引导这条主线已经有了真实浏览器验收
  - 后续更值得继续补的，是 node-level workflow guidance 是否也要像这套执行引导一样继续前置到首屏

## 2026-05-10 首页 comment / decision feedback 已补浏览器级真实点击验收

- 已完成：新增 `scripts/workspace-home-feedback-live-uat.playwright.js`，会自己临时造一个新的 `PRJ-cortex-live-browser-home-feedback-*` 项目，再在真实 `19100` 首页依次点击 `发送回复` 与 `允许继续`，不再只靠 server 侧集成回归推断前台是否真的闭环。
- 已完成：`package.json` 现已新增 `workspace:home-feedback:uat`，可以直接复跑：
  - `rtk npm run workspace:home-feedback:uat`
- 已完成：最近一次真实浏览器验收项目为 `PRJ-cortex-live-browser-home-feedback-1778388939937`，同一轮同时命中：
  - `首页动作已写回 · 线程回复：我先确认看到了这条评论，随后把执行结果补回当前线程。`
  - `最近事件：线程回复 · 已归档`
  - `首页动作已写回 · 决策拍板：先按首页这条指引继续推进。`
  - `当前没有红灯待拍板事项`
- 定向回归：
  - `rtk npm run workspace:home-feedback:uat`
- 当前备注：
  - 首页 feedback 这条链路的浏览器级缺口已经收口
  - 后续更该继续盯的，是 checklist 引导是否足够前置，以及 thread/document 协作面本身是否继续顺手

本轮新增验收点：

- `automation:stop` 在 `manual_stop` 模式下，现在必须同时做到三件事：写入 `automation-ensure.pause.json`、停止当前 repo listener、并显式 `bootout com.yusijua.cortex.server-direct`；不能再出现“主 stack 停了，但 15~20 秒后只复活一个 cortex-server”的假停止状态。
- `automation:ensure` 当前如果看到 active pause，必须直接返回 `action = paused`，而不是继续自愈；后台 ensure 不允许清掉 `manual_stop` pause。
- `automation:start` 现在必须区分 `manual` 与 `automation_ensure` 来源：manual start 要主动恢复 `server-direct` 并等待 `/health + 全部 managed 进程` ready 后再返回；后台 ensure 则不允许绕过 `manual_stop` pause。
- live runtime 现在必须能真实通过这条序列：`rtk node scripts/automation-stop.js -> sleep 17 -> rtk node scripts/automation-status.js -> rtk node scripts/automation-start.js -> rtk node scripts/automation-status.js`，并满足“停住时 `10 / 10` 全 down、恢复时一次 start 就回到 `10 / 10` running”。
- thread 页 `评论线程 triage` 卡里的 `标记已处理 / 稍后处理 / 归档 / 重新打开` 现在必须真正驱动 bucket 切换；不能只把 inbox item 状态写成 `resolved/open`，却仍让前台停在 `待分流`。
- live probe `PRJ-cortex-live-probe-thread-inbox-actions-1778381873889` 当前必须同时命中两段状态切换：`resolve` 之后页面进入 `历史层` 且默认筛到 `resolved`，`reopen` 之后页面回到 `待分流` 且重新露出 `resolve / snooze` 动作。
- live probe `PRJ-cortex-live-probe-thread-inbox-guidance-1778382290770` 当前必须继续命中两段状态引导：`snooze` 之后仍停在 `triage`，但 `当前判断 / 下一步` 要明确说明“已暂缓处理”；`archive` 之后进入 `resolved`，且 `当前判断 / 下一步` 要明确说明“已归档到历史层，可重新打开”。
- `/suggestions/:id/accept` 现在必须支持把 `review_note / review_actor` 带进新 candidate memory 的 source；接受 suggestion 之后不能只有 candidate 本体，没有 reviewer 判断痕迹。
- memory reviewer 页里的 `暂不沉淀` 现在必须显式走 `skip_memory_projection` 语义；reject suggestion 后不能再误长一条 candidate memory。
- live probe `PRJ-cortex-live-probe-memory-suggestion-note` 当前必须同时命中五个检查：`acceptProjectedCandidate / noteBackwrittenToSource / noteBackwrittenToEvidence / rejectSkippedProjection / finalMemoryCountIsOne`。
- `/workspace/docs/memory` 里的 `Suggestion` 卡现在也必须带原生治理动作：至少要有 `转成 candidate memory` 与 `暂不沉淀`，不能再只把 suggestion 当成只读列表。
- `Reviewer 摘要` 当前如果聚焦的是 suggestion，也必须直接露出同一套原生动作，不需要先滚回 section 列表区再处理。
- `POST /suggestions/:id/accept` 这条 server 路径现在必须被集成回归覆盖，并明确验证接受后会长出 `candidate / pending_accept` 的 memory。
- live probe `PRJ-cortex-live-probe-memory-suggestion-actions` 当前必须同时命中两步：接受前页面包含 `Suggestion 沉淀动作 / 转成 candidate memory / 暂不沉淀`；接受后同项目里出现新的 candidate memory。
- `/workspace/docs/memory` 里的 reviewer 卡现在必须直接显示 `Freshness 体检 / 证据变化 / 重新校验建议`，不能再只给 accept / reject / rerun 按钮，而不解释为什么现在值得拍板。
- `证据变化` 必须把当前 source / evidence 数量和上次 reviewer 快照对齐；当 reviewer 快照之后新增 source 时，要直接提示 `较上次 reviewer 新增 X 条 source / evidence`。
- `重新校验建议` 必须能区分至少四类状态：`建议先跑 reviewer / 建议重新校验 / 补证据后再重跑 / 当前结论可沿用`，而不是只有一个固定的 `重跑 reviewer` 按钮。
- live probe `PRJ-cortex-live-probe-memory-revalidation` 当前必须命中 `记忆 reviewer 现场 / Freshness 体检 / 证据变化 / 重新校验建议 / 重跑 reviewer / 待补证据` 这些 reviewer 治理信号。
- 首页 `记忆候选 / Review 队列` 卡现在还必须直接露出 `证据摘要`；如果最新 source 自带 `source_url`，同一张卡里还必须出现 `打开最近 source`，不需要先跳 `/workspace/docs/memory` 才知道依据在哪。
- live probe `PRJ-cortex-live-probe-home-memory-evidence-*` 当前必须同时命中：`证据摘要 / 打开最近 source / CP-home-memory-evidence-*`。
- 首页 memory / suggestion / comment / decision 动作现在还必须把成功反馈带过一次刷新；至少 `/workspace?...&action_feedback=...` 要能在首屏继续露出成功 banner，而不是刚点完就消失。
- 首页 memory reviewer 动作写入的 `review_note` 现在也必须在刷新后重新露出到同一张卡里；至少要能通过 `最近人工判断` 看见 `actor / review_state / note`。
- 首页 `决策中枢` 里的 `红灯待拍板 / 黄灯绕行中` 卡片现在必须直接显示 `与当前闭环关系 · <label>`；当卡属于 `当前主闭环 / 优先回看 / 历史层治理` 时，不进入线程也能先看懂它为什么值得当前处理。
- 首页 `评论回流中枢` 里的 `待分流评论 / 已接回执行` 卡片现在也必须直接显示同一组 relation copy，不能只解释评论状态，不解释它和当前 Checklist 焦点的关系。
- 评论回流中枢必须吃到已注解的 thread group 数据，而不是未注解的原始 `visibleThreadGroups`，否则 `thread_groups` 已有的 `checklist_focus_label / checklist_focus_note` 会在首页中枢丢失。
- live probe `PRJ-cortex-live-probe-center-focus` 现在必须能同时覆盖两类首页中枢卡：`决策中枢` 命中 `当前主闭环`，`评论回流中枢` 命中 `优先回看`。
- `thread_groups` 数据现在必须稳定带出 `checklist_focus_label / checklist_focus_note`，前台不能再靠运行时二次猜测线程和当前 Checklist 的关系。
- `/workspace/docs/:documentId` 与 `/workspace/threads/:threadId` 左侧线程目录现在必须直接显示 `与当前闭环关系 · <label>`；当前线程如果被标成 `优先回看 / 当前主闭环 / 历史层治理`，人不进入任务流也能先看懂它为什么值得现在处理。
- 三栏页右侧线程摘要现在也必须前置 `当前闭环关系` 说明；当前选中线程不需要再回首页 Checklist 或 thread card，才能知道自己挂在哪个闭环上。
- live probe `PRJ-cortex-live-probe-thread-focus` 现在必须同时覆盖 `/workspace/data` 和 `/workspace/docs/execution`：前者返回 `thread_groups.checklist_focus_label / checklist_focus_note`，后者在真实三栏页里渲染出这组 relation copy。
- `/workspace/docs/execution` 左侧线程目录、右侧线程焦点摘要、子任务卡，以及 `任务流转` 卡片，现在也必须继续显示 `闭环 X / Y` 与 `执行清单：A / B 已收口`，不能只把这层语义停在首页。
- live probe thread/document 现场现在至少要能证明两件事：`与当前闭环关系 · <label> · 闭环 X / Y` 已进入现场卡片，且同一卡片还能直接看到 `执行清单：A / B 已收口`。
- 线程页 `任务流转` 卡现在还必须直接显示 `当前节点 / 这一步验收 / Checkpoint 规则`，不能只告诉人“挂在哪个闭环”，却不解释“这个节点现在怎么过关”。
- `这一步验收` 必须同时保留节点级下一跳和 `对应闭环验收`；如果线程还没接上 comment chain，也要明确显示 `等待评论接入` 与首条证据要求，不能只给空态文案。
- 首页任务卡现在必须能显示它和当前 Checklist 焦点的关系；至少当任务属于 `优先回看` 线程时，要直接出现 `优先回看` 标记和 `与当前闭环关系` 说明。
- `/workspace/data` 返回的任务对象现在也必须带 `checklist_focus_label / checklist_focus_note` 这组投影字段，前台不需要自己重新推断它和 Checklist 的关系。
- 首页任务卡、线程分组头、`决策中枢 / 评论回流中枢 / 记忆治理中枢` 卡片现在还必须继续前置 `闭环 X / Y` 与 `执行清单：A / B 已收口`，不能只停留在 `当前主闭环 / 优先回看 / 历史层治理` 这种定性标签。
- `/workspace/data` 返回的 task / thread group / decision-focus item / comment-workflow item / memory governance card，现在也必须稳定带出 `checklist_step_label / checklist_step_title / checklist_progress_label / checklist_progress_note` 这组进度投影字段，前台不能再靠渲染时临时拼接。
- 顶部主闭环条带现在必须新增 `现场直达` 区块，至少包含 `查看任务流转`；如果当前线程存在评论链路或待拍板决策，还必须继续显示 `查看评论线程 · N 条 / 查看快速拍板 · N 条`。
- 文档页和线程页顶部现在都必须渲染 `execution-focus-strip`，并在首屏直接显示 `当前主闭环 / 下一条验收 / 最近证据`，不需要先滚到右栏 Checklist 卡。
- 文档页、线程页与 memory reviewer 页的首屏条带现在还必须复用首页同一套 `当前执行引导` 队列。
  - 当当前现场同时存在 `红灯待拍板 / 待分流评论 / 记忆治理 / 优先回看或优先清理` 时，首屏必须直接露出对应入口，不需要先退回首页。
- 顶部主闭环条带现在必须保留 `打开当前主闭环 / 打开证据现场` 这类直接执行入口，以及必要时的 `优先清理 / 优先回看` 上下文链接。
- 线程页 `快速拍板` 卡片现在必须直接显示 `当前判断 / 决策证据 / 查看任务流转`，不需要先读完整 meta grid，才能知道这条决策为什么卡住、该回哪段执行链。
- decision evidence preview 现在必须把 JSON-string evidence refs 解析成可读摘要，而不是把原始 JSON blob 直接渲染到线程页。
- 首页 `评论回流中枢` 的 `待分流评论 / 已接回执行` 卡片现在必须保留 `comment_filter=triage|ready`，并深链到真实线程页的 `#comment-threads` 落点。
- `已接回执行` 卡片现在必须直接显示 `执行证据`，至少能在首页看到 `命令 / Run / Checkpoint` 的最小闭环证明，而不是点进线程后再人工判断。

## 1. 这份清单的目的

这不是新的需求稿。

它只回答三个问题：

1. `/workspace` 这条 P0 主线现在到底完成了什么
2. 我们用什么方式验证它不是“只有页面壳子”
3. 接下来还剩哪些明确缺口

这次验收思路参考了 `superpowers` 那种“先收主路径，再用执行与验证闭环把结果钉死”的方式，但我们完全按 Cortex 自己的对象模型来落地：

- 先锁 `task -> thread -> run` 的投影关系
- 再落 `/workspace` 主入口
- 最后用测试和 live probe 验证

## 2. 当前已完成

### 2.1 `/workspace` 与执行现场入口已落地

已完成路由：

- `GET /workspace`
- `GET /workspace/data`
- `GET /workspace/docs/:documentId`
- `GET /workspace/threads/:threadId`

已完成能力：

- 同一批 `task` 的双视图切换
  - `按注意力`
  - `按线程`
- 顶部摘要卡
  - 活跃线程
  - 任务总数
  - 系统处理中
  - 等待许可
  - 疑似停滞
  - 已完成
  - 顶部摘要卡现在也都是快捷入口
    - `活跃线程 / 任务总数 / 系统处理中 / 等待许可 / 疑似停滞 / 已完成` 不再只是静态数字，而会直接把人带到对应视图或 Checklist 落点
- 任务代理投影
  - 从 `task_brief / command / run / decision / checkpoint / receipt` 合成首页任务卡
  - 每张卡片会直接显示 `当前节点 / 执行链 / 最近回执 / 回执摘要`，让人不进线程也能先判断任务有没有真实推进
  - 当任务卡在 `waiting_human / stalled` 时，首页会额外显示 `卡点原因 / 推荐动作`，让人先知道为什么卡住、建议怎么拍板
  - 对同线程同标题同状态的 brief-only 噪音卡，attention 视图会自动合并；thread 视图仍保留真实任务数，卡片也会直接显示 `同线程任务 / 已合并相近卡`
  - 对 `低特异度 + 陈旧已完成` 的历史线程，首页默认会透明隐藏；需要审计时可显式切到 `查看全部历史线程`，raw count 不会丢
  - 对 `低特异度 + 长时间待回看` 的历史线程，首页现在也会默认透明隐藏，避免旧 brief / decision 继续占住当前注意力位
- 线程分组
  - 使用 `thread_key / thread_label` 的持久化身份
  - 只有决策、还没落到 brief 的线程，也会以独立任务卡保留，不会被误并到别的任务
  - thread 详情页里的原始子任务卡现在会直接显示 `任务标识 / 当前节点 / 最近更新`，同线程多个 brief 时也能看清差别
  - 左侧线程目录和线程头现在也会直接显示 `当前聚焦`，不点进完整执行摘要也能先看到每条线程当前是哪一条子任务在推进
  - 线程目录与首页 thread cards 现在也会直接显示线程级 `待分流评论 / 已接回执行评论 / 红灯 / 已完成`
    - 不需要先打开线程详情，才能知道某条线程到底卡在 comment triage、红灯拍板，还是已经重新接回执行链
  - `按线程` 视图现在还会直接给出线程筛选条
    - 可一键切到 `待分流评论 / 已接回执行 / 红灯 / 进行中 / 已完成`
    - 不需要人工扫整屏线程卡，才能先收束到当前最需要看的那一类线程
- 页面自动刷新
  - 15 秒轮询刷新
  - 当前已保留 `view / thread_filter` URL 状态
    - 即使自动刷新，也不会把人从 `按线程 + 红灯` 这类聚焦上下文打回默认首页
  - 当前已保留 `comment_filter` URL 状态
    - 在文档页 / 线程页切到 `待分流 / 已接回执行 / 已拦截 / 历史层` 后，刷新和深链重进不会掉回默认评论桶
  - 当前已保留 `工作台 -> 线程/文档 -> 工作台` 导航上下文
    - 从首页点进执行现场、再返回工作台时，也不会丢失原本的 `view / thread_filter`
  - 当前已保留 `工作台 -> 文档 -> 线程` 的评论筛选上下文
    - 文档页和线程页内部的 `返回工作台 / 文档目录 / 线程目录 / 线程详情` 链接现在都会继续带上当前 `comment_filter`
- 首页执行引导
  - `/workspace` 现在会直接显示 `执行 Checklist`
  - 可直接看见 `当前主闭环 / 推进规则 / 验收条件`
- hero 顶部现在还会前置一条 `主闭环速览`
    - 一进页面就能先看到 `当前主闭环 / 第几步 / 当前状态 / 最近证据 / 打开当前主闭环`
    - 当 `thread identity` 已经把默认主视图收口到 0 条泛化线程、但历史层仍有 backlog 时，状态会明确写成 `主视图已收口`
  - hero 顶部现在还会补一排 `当前执行引导`
    - 当首页同时存在 `优先清理 / 红灯待拍板 / 待分流评论 / 记忆 review` 时，第一屏必须直接露出 `优先清理 / 红灯拍板 / 评论分流 / 记忆治理`
    - 不需要先切到中枢区或线程详情，才能知道这一轮最该先点进哪个现场
  - 同时标明每个闭环当前是 `已完成 / 进行中 / 待执行`
  - 每个闭环现在还会直接显示 `最近证据 / 更新时间 / 打开证据现场`
    - 不需要再回到长文档或脑补，才能知道“为什么这步算完成”或“现在到底卡在哪条证据上”
  - 现在还会同时显示“恢复线索”，诚实区分 `当前仍需恢复的具体线程` 和 `仅供审计回看的历史层`
  - 当当前主闭环是 `thread_key / thread_label 收口` 时，还会直接给出 `优先清理` 的残留模式入口
    - 例如 `Run-only 残留 · 5 条 / 陈旧 Brief 残留 · 5 条 / 已归档决策残留 · 2 条`
    - 不需要再先滚到治理面板，才能知道这轮先清哪几类残留
  - 当首页已经出现 `待回看` 线程时，Checklist 焦点卡还会直接给出 `优先回看` 入口
    - 例如 `PM 跟进：真实通道要怎么配呢？@cortex · 待回看`
    - 不需要再先去处理中列表里扫，才能知道这轮最该回看的具体线程是哪几条
- 首页决策聚焦
  - `/workspace` 现在已新增 `决策中枢`
  - 会把 `红灯待拍板 / 黄灯绕行中 / 记忆候选` 三列前置到首页
  - 红黄灯卡会直接摊开 `卡点原因 / 建议拍板或下一跳 / 当前节点 / 执行链 / 线程来源`
  - 记忆候选也会一起出现在同一块首页面板里，不需要再回旧版 dashboard 才能知道 checkpoint 后还有哪些 candidate 等待 review
- 首页评论回流聚焦
  - `/workspace` 现在已新增 `评论回流中枢`
  - 会把 `待分流评论 / 已接回执行 / 最近评论事件` 三列前置到首页
  - 待分流与已接回执行都会直接给出 `当前判断 / 建议动作 / 当前节点或最近评论 / 线程入口`
  - 首页卡片进入线程时现在会继续保留 `comment_filter=triage|ready`，并直接落到 `#comment-threads`
  - `已接回执行` 卡片现在还会直接露出 `执行证据`，先把 `命令 / Run / Checkpoint` 与最近 checkpoint 摘要摊开
  - 不需要再先进入单条线程，才能知道 comment workflow 是真的继续流动，还是只停在 triage
- 首页记忆治理聚焦
  - `/workspace` 现在已新增 `记忆治理中枢`
  - 会把 `记忆候选 / Review 队列 / 相关 Suggestions` 三列前置到首页
  - 这层直接复用现有 `candidate memory / memory review inbox / open suggestions` 投影，不额外再造后端对象
  - 三列卡片现在也必须直接显示 `与当前闭环关系 · <label>`；如果某条 candidate / review / suggestion 来自 `当前主闭环 / 优先回看 / 历史层治理`，人不离开首页也能先看懂这条 memory 为什么值得现在处理
  - 面板头部现在还能直接进入本地 `协作记忆` 文档，不需要先退回旧版 dashboard 再找 memory 现场
  - `记忆候选` 卡现在也必须直接露出 `首页直达治理`，至少能在首页完成 `接受为 durable / 继续补证据 / 拒绝沉淀 / 重跑 reviewer`
  - 带 `memory_id` 的 `Review 队列` 卡现在也必须复用同一套首页治理动作，不需要再先跳回 memory reviewer 文档
  - `相关 Suggestions` 卡现在也必须直接露出 `Suggestion 沉淀动作`，至少能在首页完成 `转成 candidate memory / 暂不沉淀`
  - `记忆候选 / Review 队列` 卡现在也必须直接露出 reviewer 解释层，至少在首页就能看见 `Reviewer 建议 / Freshness 体检 / 证据变化 / 重新校验建议`
  - 不需要再回旧版 dashboard，首页就能先看见 memory 候选、review 压力和 suggestion 沉淀入口
  - live probe `PRJ-cortex-live-probe-memory-relation` 当前必须能同时命中三类卡：
    - candidate card 命中 `优先回看`
    - review card 命中 `当前主闭环`
    - suggestion card 命中 `优先回看`
  - live probe `PRJ-cortex-live-probe-home-memory-actions-*` 当前还必须同时命中：
    - `data-home-memory-review-action="accepted|needs_followup|rejected"`
    - `data-home-memory-reviewer-refresh`
    - `data-home-suggestion-review-action="accept|reject"`
    - `首页直达治理`
    - `Suggestion 沉淀动作`
  - live probe `PRJ-cortex-live-probe-home-memory-signals-*` 当前还必须同时命中：
    - `Reviewer 建议`
    - `Freshness 体检`
    - `证据变化`
    - `重新校验建议`
- memory 文档页 reviewer 现场
  - `/workspace/docs/memory?project_id=<id>` 现在不能再只是“执行线程壳子套 memory 文档”
  - 左栏必须切成 `记忆治理目录`
  - 右栏必须切成 `记忆 reviewer 现场`
  - 至少要直接前置 `记忆候选 / Review 队列 / 相关 Suggestions`
- reviewer 现场也必须继续保留 `与当前闭环关系 · <label>` 这组 relation copy，而不是只在首页有解释
- `/workspace/docs/memory` 的 `记忆治理目录 / 记忆 reviewer 现场 / Reviewer 摘要 / 记忆卡片` 现在也必须继续显示 `闭环 X / Y` 与 `执行清单：A / B 已收口`，确保 memory 治理现场和首页使用的是同一套 checklist 进度口径。
  - live probe `PRJ-cortex-live-probe-memory-relation` 的真实 memory 文档页当前也必须命中 `记忆 reviewer 现场 / Review 队列 / 与当前闭环关系 · 当前主闭环 / 与当前闭环关系 · 优先回看`
- 首页协作接入面板
  - `/workspace` 现在会直接显示 `Notion 协作接入`
  - 同一块面板里会把 `Custom Agent 主路径` 和 `token-based mirror` 分开说明，不再把 `@Cortex` 与 integration 镜像混成一条链
  - 也会直接显示 `MCP 公网地址 / 目标根页 / 当前准备状态`，以及还剩哪些是 Notion UI 侧手工动作
  - 现在还会直接显示 `最近同步落点`
    - 包括最近一次真实写入的 Notion 页面标题、验证时间、验证来源和打开入口
    - 不需要再回到长文档里确认“到底有没有真的同步进去”
- 执行现场跳转
  - 首页任务卡现在可以进入内部 `/workspace/threads/:threadId`
  - 已有第一版三栏执行现场，包含文档目录 / 中间文档区 / 右侧线程区

### 2.2 单文档三栏页已经具备最小交互闭环

已新增：

- 本地 Markdown 直接保存
  - `POST /workspace/docs/:documentId/save`
  - 中间文档区已经可以直接编辑并写回 Cortex 本地 Markdown
  - 编辑区现在会即时刷新右侧预览，并明确提示“当前有未保存修改”
  - 保存后会同步刷新预览和文档导航，不需要手动重新打开页面
- 文档导航
  - 中间文档区现在会直接显示 `文档导航`
  - `# / ## / ###` 标题，以及 `**风险举手** / **下一步** / **评论约定**` 这类独立节标题，都会进入可点击导航
  - 不再只是一整块 Markdown 文本，已经开始具备内部文档编排感
- 线程内快速拍板
  - `POST /workspace/threads/:threadId/decision`
  - 右栏可以直接处理当前线程的红灯 / 黄灯决策
  - 决策卡片已经直接展开“为什么现在处理 / 需要你做什么 / 影响范围 / 证据 / 原始上下文”
- 线程事件时间线
  - 右栏会展示 command / decision / run / checkpoint / receipt / inbox / suggestion
- 评论到任务流转说明
  - 右栏新增“任务流转”卡片
  - 会解释最近一条 comment 是怎么变成 command、是否进入执行、有没有 run / receipt / checkpoint
  - 也会显示当前链路里命令 / run / 回执 / checkpoint 的数量，并可直接打开原始评论
  - 多子任务线程下，这张卡现在会优先对齐 `当前活跃子任务`；如果活跃子任务还没有评论链路，也会明确提示现在展示的是“线程最近评论”，不再让旧评论链伪装成当前主执行链
- 线程内协作输入
  - 右栏新增“协作输入”卡片
  - 可以直接在当前线程发起新的执行指令，默认走 comment -> command 链路
  - 也可以原地把一条新输入登记成 `yellow / red` 决策请求，不必跳回外部评论系统
- 评论线程 triage 面板
  - 右栏新增“评论线程”卡片区
  - 评论区顶部现在会先给一层“评论队列总览”，直接显示 `待分流 / 已接回执行 / 已拦截 / 历史层`
  - 不需要逐张扫评论卡，也能先知道当前线程最需要处理的是哪一类评论
  - 评论筛选条下方现在还会直接显示 `当前聚焦：哪一层 · N 条`
  - 同时解释这层为什么值得优先处理，减少切完筛选后还要自己判断 triage / ready / history 语义
  - 评论筛选现在会直接写回 `comment_filter`
    - 切换 bucket 后，当前 URL 和页面里的工作台 / 文档 / 线程链接都会同步更新，不再只是一次性的本地切换
  - 评论卡现在已支持 `发送回复`
    - 纯回复会走 `reply_only` 语义，不会被系统默认补成 `[continue]` 误触发执行
    - 纯回复会直接落到 `历史层 / 已记录回复`，只做线程留痕，不再新增一条 `待分流` 评论
    - 同一处输入框也能继续承接 `继续执行 / 要求修改 / 重新执行 / 停止任务` 与 triage 升级动作
    - 回复生成的新 command 会自动带上源评论标题/摘要，并把 `source_url` 锚回原评论卡
  - 每条 comment 会直接展示语义判定、执行策略、任务状态、triage 状态、判定原因和最近执行状态
  - 每张评论卡现在还会前置 `当前判断 / 执行证据`
    - 不需要先读完字段列表，才能知道这条评论是还停在 triage、已经接回执行，还是只进入历史层
    - ready 评论会直接露出 `命令 / Run / 回执 / Checkpoint` 的最小闭环证据，以及最近 checkpoint 摘要
  - 现在每条 comment 还会直接标出 `关联子任务 / 与当前聚焦关系`，不需要再靠 command id 去反推这条评论挂在哪个子任务上
  - 与 `当前聚焦子任务` 相关的 comment 会自动排在更前面，并且可以直接 `跳到关联子任务`
  - 评论卡链接区现在也会直接提供 `查看任务流转`
    - 可以从 comment 现场一跳回同线程的 `任务流转` 区域，减少在评论、子任务和执行摘要之间来回滚动
  - 线程内的任务卡现在也会反向显示 `最近评论 / 挂载关系 / 打开关联评论`，从任务和评论两边都能互相找到，不需要来回扫整页
  - 如果某个当前活跃子任务还没有直接评论链路，任务卡会明确标注 `基于当前聚焦推断`，不会把线程最近评论伪装成确定绑定
  - 现在还会直接展示这条 comment 真实带出了多少条 `command / run / checkpoint`，以及最近一次派生动作是什么
  - 对于可直接执行的 comment，现在还可以在卡片上原地触发 `继续执行 / 要求修改 / 重新执行 / 停止任务`
  - 对于最初只进入 triage 的 comment，现在也可以先补一句明确指令，再用 `补充后继续` 把它重新接回执行链路
  - 如果这条模糊评论本身其实是阻塞点，现在也可以直接在同一张卡片上 `补充后挂黄灯 / 补充后发红灯`
  - 这些评论动作现在会统一回写 `agent receipt + checkpoint`，线程右栏看到的不再只是命令状态，而是完整执行回执
  - 卡片上现在还能直接看到“最近回执 / 回执摘要 / 最近 Checkpoint / Checkpoint 摘要”，不必再翻完整事件流确认任务有没有真的往前推进
  - `inbox_only / reject` 这类未直接进入执行的评论，现在可以直接在三栏页里做 `标记已处理 / 稍后处理 / 归档 / 重新打开`
- 线程执行摘要
  - 右栏新增“执行摘要”卡片
  - 现在会一眼说明这个线程当前是 `自动推进中 / 黄灯绕行中 / 等待拍板 / 已完成`
  - 同时显示当前节点、负责人、最后动作和红黄绿分布，不需要先自己翻完整事件流
  - 当线程已经进入 `等待拍板 / 待回看` 时，摘要层现在也会直接前置 `卡点原因 / 推荐动作`
  - 如果当前线程是红灯决策，摘要层还会继续展示 `为什么现在处理 / 影响范围 / 证据`
  - 如果当前线程其实是 `Checkpoint 驱动 Brief` 残留，右栏现在还会额外出现 `来源修补提示`
    - 会直接解释为什么它还没回到稳定来源线程、最近 checkpoint 是什么、以及应该先补哪三步 `source / discussion` 线索
    - 现在也能在同一张卡里直接填写 `source_url / source_ref` 并点击 `保存来源线索`
    - 如果当前 primary brief 自己还能确认出评论链或 checkpoint 命令锚点，卡片也会直接带出建议的 `source_url / source_ref`
    - 这些建议值不是黑盒推断，而是优先来自当前 brief 已记录来源、该 brief 最近一条带 `command_id` 的 checkpoint，或其仍可确认的评论来源
    - 保存后会直接走 Cortex 本地 `task brief source repair -> thread identity backfill`，不需要再离开线程现场补数据
    - 如果这次修补让线程从 `brief:TB-...` 迁回更稳定的真实来源线程，页面也会自动跳到新的 canonical thread
  - 多子任务线程时，还会直接显示 `当前活跃子任务 / 子任务分布`，先在摘要层说明哪条子任务在推进、其余子任务分别处于什么状态
  - 线程头部现在也会直接显示 `队列概览`，让人不滚到卡片区就能先知道这个线程里有多少待拍板、待回看、处理中或已完成的子任务
  - 当 `command / run / checkpoint` 时间戳落在同一秒时，最后动作会优先展示更后置的执行节点，不再误报成最早那条命令
  - 新增“活跃度”判断，直接显示 `刚刚更新 / 近期活跃 / 黄灯绕行中 / 等待拍板 / 已收口 / 可能停滞`
  - 当项目还没有任何线程时，也会稳定显示“等待线程进入”的空状态，不会首开 400
- 线程右栏现在也直接挂同一份 `执行 Checklist`，人在任务现场就能看到 `当前主闭环 / 验收条件 / 已完成 / 进行中 / 待执行`，不必跳回首页
  - 线程右栏的 Checklist 也会同步展示 `最近证据`
    - 首页、线程页、文档页终于吃到的是同一套进度口径，而不是三套不同的解释

这意味着它已经不是“只读执行壳子”，而是一个可以：

- 改文档
- 看线程
- 拍板决策
- 处理评论 triage
- 判断 agent 是否真的接到下一步任务

的最小工作台。
### 2.3 状态机已经按 Cortex 语义收口

首页顶层列已经收成三类：

- `等我拍板`
- `系统处理中`
- `已完成`

同时保留任务内部语义：

- `decision_signal`
  - `red / yellow / green`
- `execution_status`
  - `waiting_human / in_progress / stalled / completed`

额外修正了一条很关键的判断：

- 当 `checkpoint = passed/completed`，且没有运行中的 `run` 时，工作台会把它视为更强证据
- 即使底层 `command` 状态没有及时切到 `done`，任务也不会继续被错误显示为“处理中”
- 当任务长时间没有任何新 `run / receipt / checkpoint` 动作时，工作台会把它从“假执行中”降成 `待回看`

### 2.4 线程身份已经从运行时猜测，收口到核心记录字段并完成历史回填

这次补了核心对象上的持久化字段：

- `commands.thread_key / thread_label`
- `decision_requests.thread_key / thread_label`
- `task_briefs.thread_key / thread_label`
- `runs.thread_key / thread_label`
- `checkpoints.thread_key / thread_label`
- `agent_receipts.thread_key / thread_label`
- `inbox_items.thread_key / thread_label`
- `suggestions.thread_key / thread_label`

当前策略是：

- 写入时，优先用 comment / source_url / session / target 等显式信号生成 thread identity
- `task_briefs` 现在也会持久化 `source_ref`
  - 创建时如果只知道上游 `command / decision / run / checkpoint`，也能继承稳定 thread identity，而不是退回 `brief:*`
- `run / checkpoint / receipt` 会自动继承上游 command / brief / decision 的 thread identity
- `inbox_items` 现在也会在写入时继承上游 command / brief / decision / run / checkpoint 的 thread identity
- `suggestions` 现在也会在写入时继承上游 command / brief / decision / run / checkpoint 的 thread identity
- 启动时会自动把历史空白或过泛的 `thread_key / thread_label` 回填到更具体的线程
- `/workspace` 聚合时仍保留 fallback 推导，但已经不再完全依赖运行时猜测
- 首页与线程治理卡现在会直接展示 `线程来源`
  - 比如 `Notion 讨论 / 会话线程 / 任务简报回退 / 命令回退`
  - 不需要再只靠 `thread_key` 猜这条任务是从哪里来的

这轮还补了一层治理总览：

- `线程治理` 面板会先按残留模式汇总
  - 比如 `Run-only 残留 / 陈旧 Brief 残留 / 已归档决策残留`
- 每种模式会直接显示 `主视图 / 历史层` 的数量拆分
- 当你进入某一种模式后，面板里会直接出现 `治理焦点` 摘要，并把对应模式卡标成 `当前筛选`
- 对 `Brief 残留 / 陈旧 Brief 残留` 这几类低价值残留，治理卡现在会直接给 `归档为历史草稿`
  - 归档后默认工作台会立刻把这条低特异度线程折叠出首页，不需要再等自然过期
- 对 `Checkpoint 驱动 Brief` 这类已经有 checkpoint 证据、但缺少更稳定来源的残留，治理卡现在优先给 `回到线程补来源`
  - 先把来源证据补回真实线程，再决定是否归档，避免把还有恢复价值的历史线索直接吞掉
- 对 `孤立决策残留` 这类只剩单条 low-specificity decision 的旧线程，治理卡现在也会直接给 `归档历史决策`
  - 前端会按 `decision_id` 直接调用现有 `/decisions/update-status`，不需要再手工调 API
- `已归档决策残留` 现在也会默认折入历史层
  - 稳定来源的 `thread:*` archived decision 仍可见；只有低特异度 `decision:*` 审计残留会退出默认主视图
- 再往下才看逐条线程卡，避免还要一条条读才能判断治理重点

这样后续要做 thread 审计、thread 聚合、comment 工作流追踪时，数据基础会稳很多。

### 2.5 事件噪声已经从首页剥离

为了避免 `/workspace` 退化成底层队列表，这次专门做了两层降噪：

1. `resolved` 的 comment triage inbox item 不再冒充独立任务
   - `reply_only` 这类纯回复现在也会直接记入历史层，而不是重新制造一个 triage burden
2. `memory review` 这类治理对象不再直接占用首页任务位

现在首页顶层看的是真实任务，而不是 comment / inbox / projector 副产物。

## 3. 自动化验收结果

### 3.1 定向测试

已通过：

```bash
node --test test/task-dashboard.test.js test/workspace-dashboard.test.js test/workspace-docs.test.js
```

覆盖内容：

- 旧 `/dashboard` 数据与 HTML 回归
- 新 `/workspace/data` 的任务投影
- 新 `/workspace` 的双视图页面渲染
- 新 `/workspace` 的 `Notion 协作接入` 面板渲染
- 新 `/workspace/docs/:documentId` 三栏页渲染
- 新 `/workspace/threads/:threadId` 线程详情页渲染
- 文档保存回写到本地 Markdown
- 线程内快速拍板动作
- comment -> command -> run -> checkpoint 的 thread identity 继承
- 历史空白 thread identity 会在重启后自动回填
- 线程右栏“任务流转”解释卡
- 线程右栏“评论线程 triage”原生操作卡
- 右栏结构化决策说明与原始上下文链接
- worker 执行完成后自动回写 `agent receipt`，并在 `/workspace` 线程现场稳定显示回执与 checkpoint
- workspace 会直接暴露 `线程来源` 与 `Custom Agent / token mirror` 当前准备态

### 3.2 全量测试

已通过：

```bash
node --test
```

当前结果：

- `242` 个测试通过
- `0` 个失败

这意味着这次 `/workspace` 改动没有把现有 P0 运行链路打坏。

## 4. Live Probe 结果

本地服务已重新拉起：

- `http://127.0.0.1:19100`

已验证：

- `GET /workspace?project_id=PRJ-cortex` 能返回 HTML
- `GET /workspace/data?project_id=PRJ-cortex` 能返回 JSON
- `GET /workspace/docs/execution?project_id=PRJ-cortex` 能返回 HTML
- `GET /workspace/threads/:threadId` 当前真实会展示“评论线程 / 流转统计 / 后续派生动作 / triage direct action”
- `GET /workspace?project_id=PRJ-cortex` 当前真实 HTML 已确认包含 `当前节点 / 执行链 / 最近回执 / 回执摘要 / 进入执行现场`
- `GET /workspace?project_id=PRJ-cortex` 当前真实 HTML 已确认包含 `执行 Checklist / 当前主闭环 / 推进规则 / 验收条件`
- `GET /workspace?project_id=PRJ-cortex` 当前真实 HTML 已确认 hero 顶部包含 `主闭环速览 / 第 3 步 · 进行中 / 80% · 4 / 5 已收口`
- `GET /workspace?project_id=PRJ-cortex` 当前真实 HTML 已确认包含 `闭环进度 / 80% · 4 / 5 已收口 / 还剩 1 个闭环需要继续推进`
- `GET /workspace?project_id=PRJ-cortex` 当前真实 HTML 已确认 `按线程` 视图包含筛选条：`待分流评论 / 已接回执行 / 红灯 / 进行中 / 已完成`
- `GET /workspace?project_id=PRJ-cortex` 当前真实 HTML 已确认顶部 count cards 已带快捷入口：`按线程查看 / 打开待拍板 / 优先回看`
- `GET /workspace?project_id=PRJ-cortex` 当前真实 HTML 已确认对应快捷入口 href 会正确落到 `#thread-view / #attention-view / #lane-waiting-human / #revisit-context`
- `GET /workspace?project_id=PRJ-cortex&view=thread&thread_filter=red` 当前真实 HTML 已确认保留 `按线程` 激活态与 `红灯` 激活态，不会在自动刷新后丢失筛选上下文
- `GET /workspace/docs/execution?project_id=PRJ-cortex&view=thread&thread_filter=red` 与对应 `/workspace/threads/:threadId?...` 当前真实 HTML 已确认 `返回工作台`、文档目录和线程目录链接都会保留同一组 `view / thread_filter`
- `GET /workspace?project_id=PRJ-cortex` 当前真实 HTML 已确认包含 `Runtime 健康 / 当前前台吃到的是谁 / /workspace/runtime-status`
- `GET /workspace/runtime-status?project_id=PRJ-cortex` 当前真实 JSON 已确认 `process_counts.running = 10 / 10`，并且 `live_listener.matches_repo_server = true / matches_managed_pid = true / drift_detected = false`
- `rtk node scripts/automation-stop.js` 当前真实返回已确认同时包含 `ensurePause.reason = manual_stop` 与 `serverDirect.action = bootout / ok = true`
- `rtk node scripts/automation-ensure.js` 当前在 active pause 窗口内已确认返回 `action = paused`
- `rtk node scripts/automation-stop.js -> sleep 17 -> rtk node scripts/automation-status.js` 当前真实已确认 `10 / 10` managed 进程全部 down，且 `healthProbe.ok = false / liveListener.pid = null`
- `rtk node scripts/automation-start.js` 当前真实已确认返回 `readiness.ok = true`，并且 `serverDirect.action = bootstrapped / ready = true / listenerPid != null`
- `GET /workspace?project_id=PRJ-cortex` 当前真实 HTML 已确认包含 `记忆治理中枢 / Review 队列 / 相关 Suggestions`
- `GET /workspace?project_id=PRJ-cortex` 当前真实 HTML 已确认记忆治理面板头部存在 `打开协作记忆`，并直接指向 `/workspace/docs/memory?project_id=PRJ-cortex`
- `GET /workspace/data?project_id=PRJ-cortex` 当前真实 JSON 已确认线程组层已经带出 `comment_triage_count / comment_ready_count / completed_count / overview_summary`
- `GET /workspace/runtime-status?project_id=PRJ-cortex` 当前真实 JSON 已确认即使监听命令显示为 `node src/server.js`，也会结合进程 `workingDirectory` 正确识别为当前 repo，不再误报 `matchesRepoServer = false`
- `GET /workspace?project_id=PRJ-cortex` 当前真实 HTML 已确认包含 `Notion 协作接入 / Custom Agent 主路径 / token-based mirror`
- `GET /workspace?project_id=PRJ-cortex` 当前真实 HTML 已确认包含 `线程治理 / 稳定线程 / 主视图泛化线程 / 历史层待治理`
- `GET /workspace/docs/execution?project_id=PRJ-cortex` 当前真实 HTML 已确认包含 `文档导航 / 风险举手 / 评论约定`
- `GET /workspace/docs/execution?project_id=PRJ-cortex` 当前真实 HTML 已确认包含 `thread-directory / comment-threads / quick-decisions` 三个可跳转锚点
- `GET /workspace/docs/execution?project_id=PRJ-cortex` 当前真实 HTML 已确认线程目录直接出现 `2 条待分流评论` 这类线程级评论摘要
- `GET /workspace?project_id=PRJ-cortex` 当前真实 HTML 已确认包含 `当前仍需恢复 2 条具体线程` 与 `历史层已折叠 6 条待回看 / 7 条已完成`
- `GET /workspace/threads/:threadId` 当前真实 HTML 已确认包含 `协作输入 / 直接继续执行 / 挂黄灯待审 / 发红灯拍板`
- `GET /workspace/threads/:threadId` 当前真实 HTML 已确认包含 `执行 Checklist / 当前主闭环 / 验收条件 / 4 / 5 个闭环已收口`
- `GET /workspace/threads/:threadId` 当前真实 HTML 已确认包含 `闭环进度 / 当前焦点状态 / 第 3 步 · 进行中`
- `GET /workspace/threads/:threadId` 当前真实 HTML 已确认包含 `当前最需要处理的是 1 条待分流评论 / 1 待分流 / 0 已接回执行 / 0 已拦截`
- 首页任务卡已经带内部 `进入执行现场` 跳转
- 真实本地库里 `commands / runs / checkpoints / receipts` 的 `thread_key` 空值已回填到 `0`
- 当前 live `PRJ-cortex` 默认聚焦视图已收口到 `活跃线程 = 7（raw 20）`、`任务总数 = 8（raw 22）`
- 当前 live `PRJ-cortex` 默认聚焦视图里，`系统处理中 = 2`，并且 `2 / 2` 都是 concrete 线程上的真实 `待回看`
- 当前 live `PRJ-cortex` 已默认隐藏 `13` 条低特异度历史线程（含陈旧已完成 / 长时间待回看），但 raw count 和显式展开入口都还在
- 当前 live `PRJ-cortex` 的进行中任务里，`尚未形成可见执行节点 = 0`
- 当前 live `PRJ-cortex` 的 `agent-ext-e2e 验收完成` 卡片已确认显示为 `回执 · 已回执`，并带出 `已回执 · 2026-04-15 03:20:13Z`
- 当前 live `PRJ-cortex` 已把明显的 `red alert 验收 / dark-live-verify 在线探针` 收进 synthetic 历史层；默认 raw 线程数已从 `20` 降到 `16`，历史层待治理线程已从 `14` 降到 `10`
- 当前 live `PRJ-cortex` 的 `Run-only 残留` 已从 `5` 条收口到 `1` 条，剩下主要是 `陈旧 Brief 残留 5 条 / 已归档决策残留 2 条 / Checkpoint 驱动 Brief 1 条 / 孤立决策 1 条`
- 当前 live `PRJ-cortex` 在 `include_residual=1&residual_pattern=orphan_decision` 下，已确认这 `1` 条 `孤立决策` 会直接出现 `归档历史决策`
  - 真实 payload 已确认走 `decision_id -> /decisions/update-status`，而不是另造一条 decision 专用治理 API
- 当前 live `PRJ-cortex` 的治理卡已新增 `证据状态`，能直接区分 `仅剩 Run 记录 / Checkpoint 引用缺口 / 缺少来源证据 / 历史拍板记录 / 仅剩 Brief 草稿`
- 显式打开 `include_residual=1` 后，仍然可以看到完整历史视图；说明这次做的是“视图降噪”，不是数据删除
- 首页 brief 节点已显示为 `任务简报 · 草稿中 / 已对齐` 这类中文状态，不再裸露英文内部态
- 当前 live `PRJ-cortex` 已确认 `merged_attention_duplicates = 1`，重复 PM brief 会在首页被透明合并，并显示 `同线程任务：3 / 已合并相近卡：2`
- 当前 live `PRJ-cortex` 的 PM 跟进线程页已确认会直接展示 `TB-20260331-005 / TB-20260331-004 / TB-20260331-003` 这类原始任务标识，以及对应的 `当前节点 / 最近更新`
- 当前 live `PRJ-cortex` 的 PM 跟进线程页已确认右栏摘要会直接显示 `当前活跃子任务 = TB-20260331-004`，并列出完整 `子任务分布`
- 当前 live `PRJ-cortex` 的真实线程页已确认 `执行摘要` 直接出现 `卡点原因 / 推荐动作`，不需要再退回首页任务卡看解释
- 当前 live `PRJ-cortex` 的 `checkpoint_backed_brief` 线程页已确认右栏出现 `来源修补提示 / Checkpoint 引用缺口 / 返回线程治理`
  - 不再只是把人送进线程现场后让人自己猜“要补哪段来源证据”
- 当前 live `PRJ-cortex` 的同一线程页也已确认出现 `保存来源线索 / data-source-recovery-submit`
  - 说明这条来源修补链路已经从说明层推进到线程页内可直接提交的动作层
- `task brief source repair` 当前也会返回 canonical `refresh_url`
  - 前端提交来源修补后，会直接跳到修补后的真实线程，而不是继续留在旧 `brief:` 壳子里
- 即使有人还保留旧的 `brief:TB-...` 线程链接，当前服务端也会自动 302 回修补后的真实线程
  - 说明这条来源修补链路已经开始具备“旧链接自愈”能力，而不只是一次性的表单提交
- 当前 live `PRJ-cortex` 的真实 Notion 线程页已确认任务卡出现 `最近评论 / 挂载关系 / 打开关联评论`
- 当前 live `PRJ-cortex` 的真实 Notion 线程页已确认存在 `基于当前聚焦推断` 的诚实回退文案，不会伪装成直接绑定
- 当前 live `PRJ-cortex` 首页已新增 `线程身份` 治理读数，直接显示 `6` 条聚焦线程已有稳定来源、`1` 条仍是 `command / brief / decision` 级别
- 当前 live `PRJ-cortex` 首页已新增 `线程治理` 明细面板，会直接列出剩余 `command / brief / decision` 级别线程为什么还在主视图、为什么被折叠进历史层，以及对应线程现场跳转入口
- 显式打开 `include_residual=1&residual_pattern=run_only_completed` 后，当前 live 页面已确认同时出现 `治理焦点：Run-only 残留 / 查看全部残留模式 / 当前筛选`
- 当前 live 默认 `/workspace/data?project_id=PRJ-cortex` 已确认收口到 `当前已有 6 条稳定线程，主视图还剩 0 条泛化线程，历史层另有 10 条待治理记录`
- 对应 Checklist 当前也会同步显示 `主视图已收口`
  - 而不是继续用笼统的 `进行中` 掩盖“默认工作台已干净、只剩历史层治理”的事实
- 当前 live `PRJ-cortex` 首页已确认 `Notion 协作接入` 面板会把 `Custom Agent 主路径已就绪` 与 `token-based mirror 需单独授权` 同时摊开显示
- 当前 live `PRJ-cortex` 首页已确认 `Notion 协作接入` 面板新增 `最近同步落点` 卡，并展示 `Cortex P0 工作台同步 - 2026-05-09 / 2026-05-09 21:10（上海时间） · Codex 子 agent MCP smoke / 打开最近同步页`
- 当前 live `PRJ-cortex` 首页已确认 `执行 Checklist` 焦点卡新增 `优先清理` 入口，并直接展示 `Run-only 残留 · 5 条 / 陈旧 Brief 残留 · 5 条 / 已归档决策残留 · 2 条`
- 当前 live `PRJ-cortex` 首页已确认 `执行 Checklist` 焦点卡新增 `优先回看` 入口，并直接展示 `PM 跟进：真实通道要怎么配呢？@cortex · 待回看 / PM 跟进：@pm 把这段需求整理成 why/… · 待回看`
- 当前 live `PRJ-cortex` 首页已确认焦点任务卡、线程分组头和中枢卡片会直接出现 `闭环 3 / 5`
- 当前 live `PRJ-cortex` 首页已确认这些同类卡片会继续显示 `执行清单：4 / 5 已收口 · 80% · 还剩 1 个闭环需要继续推进`
- `thread:` 显式线程键已被识别为稳定来源，不再被误算成低特异度历史线程
- 当前 live `PRJ-cortex` 没有待拍板任务，所以首页暂未自然看到 `卡点原因 / 推荐动作`；但该分支已由 `test/workspace-dashboard.test.js` 覆盖验证。
- 当前 `src/workspace-docs.js` 已把 `当前节点 / 这一步验收 / Checkpoint 规则` 统一渲染到 `任务流转 / 评论线程 / 快速拍板` 三类 thread 现场卡片
- `test/workspace-docs.test.js` 当前已显式覆盖：
  - 红灯决策卡出现 `当前节点 · 拍板 · 红灯 / 待拍板`
  - triage 评论卡出现 `当前节点 · Triage · 仅入收件箱`
  - ready 评论卡出现 `当前节点 · Checkpoint · running`
- 定向 `rtk node --test test/workspace-docs.test.js` 当前为 `22 / 22` 全绿；全量 `rtk node --test` 当前为 `259 / 259` 全绿
- 当前 runtime 已再次通过 `rtk npm run automation:restart` + `rtk node scripts/automation-status.js` 复验
  - 结果保持 `10 / 10 running`
  - `matchesRepoServer = true`
  - `matchesManagedPid = true`
  - `driftDetected = false`
- live probe `PRJ-cortex-live-probe-thread-node-guidance` 当前已确认真实 `19100` thread 页同时命中：
  - `评论线程` 区域内的 `当前节点 · Checkpoint · running / 这一步验收 / Checkpoint 规则`
  - `快速拍板` 区域内的 `当前节点 · 拍板 · 红灯 / 待拍板 / 这一步验收 / Checkpoint 规则`
- 当前 `src/task-dashboard.js` 已把 `验收条件 / Checkpoint 规则` 前置到首页 `注意力任务卡 / 决策中枢 / 评论回流中枢 / 线程分组头`
- `test/workspace-dashboard.test.js` 当前已显式覆盖：
  - `decision_focus.redItems[0]` 带 `checklistAcceptance / checklistCheckpointRule`
  - `comment_workflow.readyItems[0]` 带 `checklistAcceptance / checklistCheckpointRule`
  - 长时间未回执的 attention task / thread group 也会保留 `checklist_acceptance / checklist_checkpoint_rule`
- 定向 `rtk node --test test/workspace-dashboard.test.js` 当前为 `18 / 18` 全绿；`rtk node --test test/task-dashboard.test.js` 当前为 `2 / 2` 全绿；全量 `rtk node --test` 当前继续为 `259 / 259` 全绿
- live probe `PRJ-cortex-live-probe-home-guidance` 当前已确认真实 `19100` 首页同时命中：
  - 注意力任务卡内的 `验收条件 / Checkpoint 规则`
  - `决策中枢` 内的 `验收条件 / Checkpoint 规则`
  - `评论回流中枢` 内的 `验收条件 / Checkpoint 规则`
  - `按线程` 分组头内的 `Checkpoint 规则`
- 当前 `src/task-dashboard.js` 已继续把首页 `决策中枢 / 评论回流中枢` 从只读看板推进到轻量动作面板
  - `决策中枢` 卡片出现 `允许继续 / 要求修改 / 要求重跑 / 停止任务`
  - `评论回流中枢` ready 卡出现 `继续执行 / 要求修改 / 重新执行 / 停止任务`
  - `评论回流中枢` triage 卡出现 `继续执行 / 升黄灯 / 升红灯`
  - 每张可操作卡都带一条首页内联说明输入框和 `workspace-action-feedback`
- `test/workspace-dashboard.test.js` 当前已显式覆盖：
  - `decision_focus.redItems[0]` 带 `actionable / decisionId / threadKey`
  - `comment_workflow.triageItems[0]` 带 `actionable / actionMode=triage / commandId / ownerAgent`
  - `comment_workflow.readyItems[0]` 带 `actionable / actionMode=ready / commandId / ownerAgent`
  - 首页 HTML 会出现 `data-home-decision-action`、`data-home-comment-target="derive"`、`data-home-comment-target="comment"`
- 定向 `rtk node --test test/workspace-dashboard.test.js` 当前为 `18 / 18` 全绿；`rtk node --test test/task-dashboard.test.js` 当前为 `2 / 2` 全绿；全量 `rtk node --test` 当前继续为 `259 / 259` 全绿
- 当前 runtime 已再次通过 `rtk npm run automation:restart` + `rtk node scripts/automation-status.js` 复验
  - 结果保持 `10 / 10 running`
  - `matchesRepoServer = true`
  - `matchesManagedPid = true`
  - `driftDetected = false`
- live probe `PRJ-cortex-live-probe-home-actions` 当前已确认真实 `19100` 首页同时命中：
  - `data-home-decision-action="approved" / "changes_requested" / "retry_requested" / "stopped"`
  - `data-home-comment-target="derive"` 与 `data-home-comment-target="comment"`
  - 文案 `继续执行 / 要求修改 / 重新执行 / 停止任务 / 升黄灯 / 升红灯`
- 同一 live probe 已再次模拟首页动作写回
  - 红灯首页拍板 `approved` 后，`/workspace/data?project_id=PRJ-cortex-live-probe-home-actions` 已确认 `decision_focus.counts.red = 0`
  - 首页评论 `continue` 复用的 `/commands/derive` 写路径已在 live runtime 上成功返回，无报错
- 当前 `src/task-dashboard.js` 已继续把首页评论中枢补到 reply-only 协作层
  - triage / ready 线程项都带 `replyCapable`
  - 首页动作区出现 `发送回复`
  - 新增 `data-home-comment-target="reply"`，复用 thread 页现有 `reply_only=true` 写路径
- `test/workspace-dashboard.test.js` 当前已显式覆盖：
  - `comment_workflow.triageItems[0].replyCapable = true`
  - `comment_workflow.readyItems[0].replyCapable = true`
  - 首页 HTML 出现 `发送回复` 与 `data-home-comment-target="reply"`
- 定向 `rtk node --test test/workspace-dashboard.test.js` 当前为 `18 / 18` 全绿；`rtk node --test test/workspace-docs.test.js` 当前为 `22 / 22` 全绿；全量 `rtk node --test` 当前继续为 `259 / 259` 全绿
- live probe `PRJ-cortex-live-probe-home-reply-actions` 当前已确认真实 `19100` 首页同时命中：
  - `发送回复`
  - `data-home-comment-target="reply"`
  - `triageReplyCapable = true`
  - `readyReplyCapable = true`
- 同一 live probe 已直接模拟一次首页 reply-only 写回
  - `POST /workspace/threads/:threadKey/comment` 返回 `workflow_path = comment_history`
  - `signal_level = green`
  - 返回新的 `command_id`

说明：

- 你当前打开的浏览器标签如果之前是空白/报错，不是因为页面没写，而是 `19100` 当时没有运行
- 现在服务已经重新启动，可以直接刷新查看

## 5. 当前仍未完成的部分

下面这些不是 bug，而是下一阶段明确还没做完的 P0/P1 缺口：

1. `单文档三栏协作页` 已进入最小交互态，但还不是完整协作编辑器
   - 现在已经能编辑本地 Markdown、能拍板、能看事件时间线
   - 但还没有真正的 block editor 内核
   - 也还没有富文本选区评论 / reply / resolve 的原生评论体验

2. `thread_key / thread_label` 的第一轮历史回填已完成，但还没有做更激进的清洗治理
   - 真实库里空白 thread identity 已经补齐，`inbox_items` 也已经纳入同一套回填链路
   - 明显的 smoke / 在线探针残留，现在已经会先被 synthetic 过滤折叠，不再默认混进治理层
   - 对当前仍保留在治理层的残留，前台现在也会先摊开“证据状态”，帮助区分是 `手工同步缺口` 还是 `只有 brief / run / decision 留存`
   - 但早期遗留的 `brief:* / command:* / decision:* / project:*` 这类低特异度键仍可能存在
   - 后面如果要做更稳定的 thread analytics，可以再做一轮更激进的 cleanup / merge

3. `首页 current node` 的可读性虽然已经明显提升，但还有继续优化空间
   - 当前 live 数据里，进行中任务已经不再出现“尚未形成可见执行节点”
   - 现在会优先回退到 `Run / 回执 / 决策 / 任务简报`
   - 已完成但只有 receipt 的线程，现在也会明确显示 `回执 · 已回执`
   - 但后面仍可以继续区分“已执行但待回执”“已归档决策”“仅有 brief 未拆命令”等更细语义
4. `评论 -> 结构化任务 -> 前台状态联动` 已进入半原生状态，但还没完全收口
   - 后端和 webhook 路由链路已经存在
   - 首页现在已经有 `评论回流中枢`，前台也已经能解释 comment 触发出来的任务流转
   - comment thread 自身已经能做 triage 状态处理
   - 评论卡现在已经能做原地回复，也不会再把纯回复误判成执行指令
   - 但还没有做到真正的富文本 reply / resolve thread / block 级 thread 折叠与归并

5. `记忆治理` 已经有最小 reviewer workspace，并补上了第一版原生治理动作
   - 现在首页已经有 `记忆治理中枢`，能直接前置 `记忆候选 / Review 队列 / 相关 Suggestions`
   - `/workspace/docs/memory` 也已经不再是通用执行壳子，而是有独立 `记忆治理目录 + reviewer 摘要 + 三组治理队列` 的最小 reviewer 现场
   - 也就是说 memory 的“可见性”和“进入 reviewer 现场”的主路径已经补上了，不再只藏在旧版 dashboard 或长文档里
   - 现在 reviewer 现场已经能直接做 `accept / reject / needs_followup / 重跑 reviewer`，不需要再绕回旧 dashboard 或评论线程才能改 memory 状态
   - 首页 `记忆治理中枢` 现在也已经补上同一套轻量治理动作，至少能原地处理 candidate memory、带 `memory_id` 的 review 卡，以及 suggestion 沉淀动作
   - 当前仍缺的是更细的 `evidence diff / freshness / revalidation` 面板，以及 reviewer 判断后的更强前台回流解释

## 6. 明天最值得继续的方向

如果明天继续接着做，建议优先顺序如下：

1. 把 `单文档三栏协作页` 从“最小交互态”升级成真正的协作编辑器
   - 接入真实 editor 内核
   - 把右侧线程区升级成 comment / reply / resolve / enqueue 面板

2. 把 thread 现场继续往“可继续协作”推进
   - 不是只展示状态，还要支持 comment / action / resolve / enqueue

3. 继续把 thread 治理从“已回填”推进到“已清洗”
   - 让首页、审计、记忆和后续自动化都逐步摆脱旧的低特异度 thread key

4. 继续把记忆治理与评论回流做成更细的中枢面板
   - 让“为什么这条 candidate 值得沉淀 / review 后如何回流 / comment triage 之后下一步去哪”更透明
   - 重点补 `evidence diff / freshness / revalidation / suggestion 回写`，把 reviewer 现场从第一版动作台推进成完整治理台

## 2026-05-10 首页评论中枢最近协同结果验收

- 已完成：`src/task-dashboard.js` 现已在 thread 级 comment overview 中额外聚合 `latest_comment_title / summary / detail / intent / policy / task_state / reason / status`，不再只有 comment count。
- 已完成：首页 `评论回流中枢` 的 triage / ready 卡片现已新增 `最近协同` callout，能直接显示 `线程回复 · 已归档`、真实回复正文，以及 `流向 / 策略 / 状态 / 原因`。
- 已完成：reply-only 协同的首页展示已优先取真实回复正文，而不是系统生成的上下文引用。
- 已完成：同一秒内连续写入 comment event 时，最新协同元信息现在会按“同时间戳后写优先”覆盖，避免首页停留在旧状态。
- 定向回归：
  - `rtk node --test test/workspace-dashboard.test.js`
  - `rtk node --test test/task-dashboard.test.js`
- 全量回归：
  - `rtk node --test` 当前为 `259 / 259` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk node scripts/automation-status.js`
  - 当前为 `10 / 10 running`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live probe：
  - 项目：`PRJ-cortex-live-probe-home-collab-visibility`
  - `POST /workspace/threads/:threadKey/comment` 返回 `workflow_path = comment_history`
  - `comment_intent = thread_reply`
  - `/workspace/data?project_id=PRJ-cortex-live-probe-home-collab-visibility` 已确认 ready 卡片返回：
    - `latestCollaborationTitle = 线程回复 · 已归档`
    - `latestCollaborationSummary = 我先确认看到了这条评论，最近协同结果已经回写到首页卡片。`
    - `latestCollaborationDetail` 包含 `流向：历史层 / 策略：仅记录到线程历史 / 状态：已记录回复`
  - `/workspace?project_id=PRJ-cortex-live-probe-home-collab-visibility` 已确认 HTML 同时命中：
    - `最近协同 · 线程回复 · 已归档`
    - `我先确认看到了这条评论，最近协同结果已经回写到首页卡片。`
    - `流向：历史层`
- 当前备注：
  - ready 评论线程的 `执行证据` 当前会显示 `2 条命令 / 1 个 Run / 1 个 Checkpoint`
  - 这是因为 reply-only 也会作为 thread history command 持久化
  - 该口径当前属真实行为，不是 bug；若后续要把 reply-only 从执行证据里剥离，可另开一轮精修

## 2026-05-10 执行证据拆分口径验收

- 已完成：`src/task-dashboard.js` 现已在 `execution_proof` 里区分 `执行命令` 与 `协同记录`，不再把 reply-only 这类 thread history comment event 直接算进执行命令数。
- 已完成：新增 `classifyTaskFlowCommandRole(...)` 与 `summarizeTaskFlowDetails(...)`，并透传 `execution_command_count / collaboration_history_count`。
- 已完成：规则当前限定为：
  - `source = notion_comment`
  - 且 `comment_execution_policy !== enqueue`
  - 命中时记为 `协同记录`
- 定向回归：
  - `rtk node --test test/workspace-dashboard.test.js`
  - `rtk node --test test/workspace-docs.test.js`
  - `rtk node --test test/task-dashboard.test.js`
- 全量回归：
  - `rtk node --test` 当前为 `259 / 259` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk node scripts/automation-status.js`
  - 当前为 `10 / 10 running`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live probe：
  - 项目：`PRJ-cortex-live-probe-proof-split`
  - `POST /workspace/threads/:threadKey/comment` 返回 `workflow_path = comment_history`
  - `/workspace/data?project_id=PRJ-cortex-live-probe-proof-split` 已确认 ready 卡片 `proofValue` 为：
    - `1 条命令 / 1 条协同记录 / 1 个 Run / 1 个 Checkpoint`
  - `/workspace?project_id=PRJ-cortex-live-probe-proof-split` 已确认首页 HTML 命中同一串文案
  - `/workspace/threads/notion%3Apage-proof-split%3Adiscussion-proof-split?project_id=PRJ-cortex-live-probe-proof-split&document_id=execution` 已确认 thread 页 HTML 命中同一串文案
  - 首页与 thread 页也都能同时看到 reply 文案 `这次会把协同记录从执行命令里拆出来`
- 当前备注：
  - 现在 reply-only 仍会以 command event 持久化，只是前台统计口径已不再把它算作执行命令
  - 若后续要把 `协同记录` 进一步拆成 `reply / triage / reject`，可作为下一轮审计增强

## 2026-05-10 协同记录类型细分验收

- 已完成：`src/task-dashboard.js` 现已进一步把 `协同记录` 细分为：
  - `线程回复`
  - `待分流评论`
  - `被拦截评论`
  - `协同留痕`
- 已完成：task summary 现已透传 `collaboration_history_summary`，首页评论中枢和 thread 任务卡都可直接消费。
- 已完成：首页 `评论回流中枢` 的 ready/triage 卡 meta 现在会显示类似：
  - `协同记录：1 条线程回复`
- 已完成：thread 页 `renderThreadTask(...)` 现在也会显示 `协同记录` 字段，而不是只剩总的 `执行链` 文案。
- 定向回归：
  - `rtk node --test test/workspace-dashboard.test.js`
  - `rtk node --test test/workspace-docs.test.js`
  - `rtk node --test test/task-dashboard.test.js`
- 全量回归：
  - `rtk node --test` 当前为 `259 / 259` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk node scripts/automation-status.js`
  - 当前为 `10 / 10 running`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live probe：
  - 项目：`PRJ-cortex-live-probe-collab-breakdown`
  - `/workspace/data?project_id=PRJ-cortex-live-probe-collab-breakdown` 已确认 ready 卡 `meta` 包含：
    - `协同记录：1 条线程回复`
  - `/workspace?project_id=PRJ-cortex-live-probe-collab-breakdown` 已确认首页 HTML 命中：
    - `协同记录：1 条线程回复`
  - `/workspace/threads/notion%3Apage-collab-breakdown%3Adiscussion-collab-breakdown?project_id=PRJ-cortex-live-probe-collab-breakdown&document_id=execution` 已确认 thread 页 HTML 命中：
    - `协同记录`
    - `1 条线程回复`
    - `这次会把线程回复直接写成协同记录明细`
- 当前备注：
  - 当前类型细分仍是 task 级摘要，不是逐条协同 timeline
  - 如后续需要更完整的协同审计，可继续把每条协同记录单独做成更细的 audit item

## 2026-05-10 thread reply 父卡聚合与 task 锚点验收

- 已完成：`reply_only` 写回现在会稳定保留 `parent_command_id`，不再只是文案级“原地回复”。
- 已完成：thread 页 comment card 现在按顶层评论树聚合，reply-only 会折回父卡，而不是额外冒出一张历史卡抢走焦点。
- 已完成：`src/task-dashboard.js` 现已在 synthetic task 聚合时优先锚定执行 comment command，再把 `thread_reply` 这类协同留痕后挂进去。
- 已完成：新增回归，确保 ready 评论线程在 workspace payload 里仍满足：
  - `task_id = command:<根 comment command>`
  - `title` 保持根评论文案
  - `command_ids` 同时包含根评论和 reply-only 子评论
- 定向回归：
  - `rtk node --test test/workspace-dashboard.test.js`
  - `rtk node --test test/workspace-docs.test.js`
  - `rtk node --test test/task-dashboard.test.js`
- 全量回归：
  - `rtk node --test` 当前为 `259 / 259` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk node scripts/automation-status.js`
  - 当前为 `10 / 10 running`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live probe：
  - 项目：`PRJ-cortex-live-probe-comment-card-tree-v2`
  - `/workspace/data?project_id=PRJ-cortex-live-probe-comment-card-tree-v2&include_synthetic=1` 已确认：
    - `tasks[0].task_id = command:CMD-20260510-021`
    - `tasks[0].title = 继续推进 comment card tree 的 live probe`
  - `/workspace/threads/notion%3Apage-comment-card-tree-v2%3Adiscussion-comment-card-tree-v2?project_id=PRJ-cortex-live-probe-comment-card-tree-v2&document_id=execution` 已确认同时命中：
    - `1 条命令 / 1 条线程回复 / 1 个 Run / 1 个 Checkpoint`
    - `当前聚焦：已接回执行 · 1 条`
    - `我先补一句线程回复，确认父卡和 task 锚点都已经收好。`
- 当前备注：
  - 现在 reply-only 已经稳定挂回父 comment command，并且不会再把 synthetic task 的主锚点改成自己
  - 如后续要做更细的异步协作审计，可以继续把这棵评论树展开成更明确的 timeline / audit 结构

## 2026-05-10 协同审计条目前台验收

- 已完成：thread/document 页的评论卡现在新增 `协同审计` 区块，会把 comment tree 里的协同子记录逐条展开，而不再只剩 `协同记录：1 条线程回复` 这类 task 级摘要。
- 已完成：每条 audit item 现在都会显示：
  - 类型：`线程回复 / 待分流评论 / 被拦截评论 / 协同留痕`
  - 时间
  - 正文摘要
  - 执行策略 / 判定原因
  - 负责人 / 原始位置
- 已完成：thread 页 `关联任务` 卡里的 `最近评论 / 评论状态` 已开始优先显示最近一条协同记录，而不是只盯根 comment command。
- 定向回归：
  - `rtk node --test test/workspace-docs.test.js`
  - `rtk node --test test/workspace-dashboard.test.js`
- 全量回归：
  - `rtk node --test` 当前为 `259 / 259` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk node scripts/automation-status.js`
  - 当前为 `10 / 10 running`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live probe：
  - 项目：`PRJ-cortex-live-probe-comment-audit-v1`
  - `/workspace/threads/notion%3Apage-live-audit%3Adiscussion-live-audit?project_id=PRJ-cortex-live-probe-comment-audit-v1&document_id=execution` 已确认同时命中：
    - `协同审计`
    - `data-comment-audit-item="thread_reply"`
    - `我先补一句线程回复，确认协同审计条目已经在前台展开。`
    - `评论状态：线程回复 · 已记录回复 · 已归档`
- 当前备注：
  - thread/document 现场的逐条 audit 已经补齐
  - 首页 `评论回流中枢` 仍以摘要式协同卡为主，后续如要继续上提协同审计，可再把 per-item audit 拉到首页

## 2026-05-10 首页评论回流中枢协同审计验收

- 已完成：首页 `评论回流中枢` 的 `待分流评论 / 已接回执行` 卡现在也会直接展开最近几条协同 audit item，而不再只剩 `最近协同` 摘要。
- 已完成：首页 audit item 当前会直接显示：
  - 类型：`线程回复 / 待分流评论 / 被拦截评论 / 协同留痕`
  - 时间
  - 标题
  - 正文摘要
  - `流向 / 策略 / 状态 / 原因` 这类 detail
- 已完成：thread group 聚合现在会透传 `collaboration_audit_items` 与 `latest_collaboration_*`，首页卡不再把任意最新 comment 都误当成“最近协同”。
- 定向回归：
  - `rtk node --test test/workspace-dashboard.test.js`
  - `rtk node --test test/workspace-docs.test.js`
  - `rtk node --test test/task-dashboard.test.js`
- 全量回归：
  - `rtk node --test` 当前为 `259 / 259` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk node scripts/automation-status.js`
  - 当前为 `10 / 10 running`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live probe：
  - 项目：`PRJ-cortex-live-probe-home-comment-audit-v1`
  - `/workspace/data?project_id=PRJ-cortex-live-probe-home-comment-audit-v1` 已确认：
    - `comment_workflow.triageItems[0].collaborationAuditItems` 含 `kind = triage`
    - `comment_workflow.readyItems[0].collaborationAuditItems` 含 `kind = thread_reply`
  - `/workspace?project_id=PRJ-cortex-live-probe-home-comment-audit-v1` 已确认同时命中：
    - `data-home-comment-audit-item="triage"`
    - `data-home-comment-audit-item="thread_reply"`
    - `我先补一句线程回复，让首页直接看见这条协同审计。`
- 当前备注：
  - 首页 ready/triage 卡的 per-item audit 已经补齐
  - `最近评论事件` 这一列仍是原始 comment event 列表，后续如要继续前置 richer 审计，可再把这列收口成 comment tree / task-aware 版本

## 2026-05-10 首页最近评论事件 thread-aware 验收

- 已完成：首页 `评论回流中枢` 的 `最近评论事件` 这一列已改成 thread-aware recent cards，而不再直接透出原始 `recent_comments` 列表。
- 已完成：thread group 聚合现在会稳定透传 `recent_comment_events / recentCommentEvents`，首页 `comment_workflow.recentCommentCards` 已改为从 `thread_groups[*].recent_comment_events` 扁平汇总。
- 已完成：recent card 当前会直接显示：
  - `最近事件`
  - `事件明细`
  - `当前聚焦`
  - `当前节点`
  - `事件时间`
- 已完成：recent lane 当前会保留 ready / triage 线程标题与线程入口，不需要再靠 comment id 反推它属于哪条闭环。
- 定向回归：
  - `rtk node --test test/workspace-dashboard.test.js`
  - `rtk node --test test/workspace-docs.test.js`
  - `rtk node --test test/task-dashboard.test.js`
- 全量回归：
  - `rtk node --test` 当前为 `259 / 259` 全绿
- runtime 复验：
  - `rtk node scripts/automation-status.js`
  - 当前为 `10 / 10 running`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live probe：
  - 项目：`PRJ-cortex-live-probe-home-recent-events-v1`
  - `/workspace/data?project_id=PRJ-cortex-live-probe-home-recent-events-v1` 已确认：
    - `comment_workflow.counts.recentComments = 3`
    - `comment_workflow.recentCommentCards[0].meta` 含 `最近事件：线程回复 · 已归档`
    - `comment_workflow.recentCommentCards[1].meta` 含 `最近事件：继续执行 · 新建`
    - `comment_workflow.recentCommentCards[2].meta` 含 `最近事件：问题 · 已归档`
  - `/workspace?project_id=PRJ-cortex-live-probe-home-recent-events-v1` 已确认同时命中：
    - `最近评论事件`
    - `最近事件：线程回复 · 已归档`
    - `最近事件：继续执行 · 新建`
    - `Notion · page-thread-ready-live`
    - `Notion · page-thread-triage-live`
- 当前备注：
  - 首页 recent lane 已经具备 thread-aware recent context
  - 如果后面要继续把首页压成更强的 comment tree / task audit strip，还可以继续把动作状态与证据摘要往前提

## 2026-05-10 首页最近评论事件按线程收口验收

- 已完成：首页 `最近评论事件` 已从“按事件平铺多张卡”收口成“每条线程一张 recent audit card”，同一线程的 `继续执行 / 线程回复 / triage` 不会再把 recent lane 切成多张重复卡。
- 已完成：recent lane 现在会在 thread group 内按 `timestamp + commandId` 稳定排序，再把最近几条评论流转压进同一张线程卡里的 `最近流转` 区块。
- 已完成：recent card 当前会直接显示：
  - `最近事件数`
  - `线程状态`
  - `最近流转`
  - 线程级 `actionMode / actionable / replyCapable`
- 已完成：ready 线程即使最新事件是 `线程回复 · 已归档`，仍会保留 ready 动作语义，不会因为 latest event 落进历史层就丢掉 `继续执行 / 要求修改 / 重新执行 / 停止任务`。
- 定向回归：
  - `rtk node --test test/workspace-dashboard.test.js`
  - `rtk node --test test/task-dashboard.test.js`
  - `rtk node --test test/workspace-docs.test.js`
- 全量回归：
  - `rtk node --test` 当前为 `259 / 259` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk node scripts/automation-status.js`
  - 当前为 `10 / 10 running`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live probe：
  - 项目：`PRJ-cortex-live-probe-home-recent-thread-strip-v2`
  - `/workspace/data?project_id=PRJ-cortex-live-probe-home-recent-thread-strip-v2` 已确认：
    - `comment_workflow.counts.recentComments = 3`
    - `comment_workflow.counts.recentThreads = 2`
    - `comment_workflow.recentCommentCards.length = 2`
    - ready recent card 含 `recentEventCount = 2`
    - ready recent card 含 `auditKinds = [thread_reply, execution]`
    - ready recent card 含 `actionMode = ready`
  - `/workspace?project_id=PRJ-cortex-live-probe-home-recent-thread-strip-v2` 已确认同时命中：
    - `最近评论事件`
    - `最近流转`
    - `最近事件数：2 条`
    - `线程回复 · 已归档`
    - `继续执行 · 新建`
- 当前备注：
  - 首页 recent lane 已经真正按线程收口，不再被同线程多次 recent event 刷屏
  - 如后续还要继续推进成更强的 comment tree / task audit strip，可再把动作反馈和 source anchor 往前提

## 2026-05-10 线程页评论 inbox action 状态回流验收

- 已完成：thread 页 `评论线程 triage` 卡里的原生 inbox 动作现在不再只是“状态写成功”，而会真正带动前台 bucket 语义切换。
- 已完成：`resolved / archived` 的 non-executable comment 现在会进入 `历史层`，不会再因为原始 `comment_task_state = needs_triage` 被错误留在 `待分流`。
- 已完成：`enqueue` 型 ready 评论不会被这轮修复误伤；即使其 inbox 壳是 `archived`，只要执行链仍活跃，前台仍保持 `已接回执行`。
- 定向回归：
  - `rtk node --test test/workspace-docs.test.js`
  - `rtk node --test test/workspace-dashboard.test.js`
- 全量回归：
  - `rtk node --test` 当前为 `260 / 260` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk node scripts/automation-status.js`
  - 当前为 `10 / 10 running`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live probe：
  - 项目：`PRJ-cortex-live-probe-thread-inbox-actions-1778381873889`
  - `/inbox/:id/act` 已确认：
    - `resolve -> status = resolved`
    - `reopen -> status = open`
  - `/workspace/threads/:threadId?project_id=PRJ-cortex-live-probe-thread-inbox-actions-1778381873889&document_id=execution` 已确认：
    - resolve 后命中 `当前 1 条评论都已进入历史层`
    - resolve 后命中 `data-default-filter="resolved"`
    - resolve 后仍保留 `data-inbox-action="reopen"`
    - reopen 后命中 `当前最需要处理的是 1 条待分流评论`
    - reopen 后命中 `data-default-filter="triage"`
    - reopen 后重新露出 `data-inbox-action="resolve"` 与 `data-inbox-action="snooze"`
- 当前备注：
  - 这轮已经把“按钮可见”推进成“按钮驱动的前台状态语义可验收”
  - 若后续还要补 `archive / snooze` 的更细 live probe，可继续把这两条动作单独拆成更细的回归脚本

## 2026-05-10 线程页评论 snooze / archive 引导验收

- 已完成：thread 页评论卡在 `snooze / archive` 之后，`当前判断 / 下一步` 终于开始说对当前 triage 状态，而不再把所有 non-executable comment 都混成“还在等待人工决定”。
- 已完成：`snooze` 之后评论仍留在 `待分流`，但文案现在会明确提示“已暂缓处理，仍保留在 triage 队列中”，同时继续露出 `resolve / archive / reopen` 三类后续动作。
- 已完成：`archive` 之后评论会进入 `历史层`，文案现在会明确提示“已归档到历史层；如需重新推进，可直接重新打开”，并且只保留 `reopen` 动作。
- 定向回归：
  - `rtk node --test test/workspace-docs.test.js`
- 全量回归：
  - `rtk node --test` 当前为 `261 / 261` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk node scripts/automation-status.js`
  - 当前为 `10 / 10 running`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live probe：
  - 项目：`PRJ-cortex-live-probe-thread-inbox-guidance-1778382290770`
  - `/inbox/:id/act` 已确认：
    - `snooze -> status = snoozed`
    - `archive -> status = archived`
  - `/workspace/threads/:threadId?project_id=PRJ-cortex-live-probe-thread-inbox-guidance-1778382290770&document_id=execution` 已确认：
    - snooze 后命中 `data-default-filter="triage"`
    - snooze 后命中 `这条评论已暂缓处理，当前仍停在 triage，后续需要重新打开或直接处理完。`
    - snooze 后命中 `这条评论已稍后处理，仍保留在 triage 队列中等待重新打开或直接处理完。`
    - archive 后命中 `data-default-filter="resolved"`
    - archive 后命中 `这条评论已归档到历史层，当前主要用于回看和审计。`
    - archive 后命中 `这条评论已归档到历史层；如需重新推进，可直接重新打开。`
- 当前备注：
  - 这轮已经把评论 triage 的四个原生动作从“能点击”推进成“两组动作有明确前台语义 + live probe 验收”
  - 若后续还要继续压实，可再补 `archive -> reopen -> resolve` 这种更长链路的前台 UAT

## 2026-05-10 首页记忆治理中枢已补原生治理动作

- 已完成：首页 `记忆治理中枢` 的 `记忆候选` 卡现在会直接露出 `首页直达治理`，可原地执行 `接受为 durable / 继续补证据 / 拒绝沉淀 / 重跑 reviewer`。
- 已完成：带 `memory_id` 的 `Review 队列` 卡现在也会复用同一套首页治理动作，不需要再跳回 `/workspace/docs/memory` 才能写 reviewer 判断。
- 已完成：首页 `相关 Suggestions` 卡现在会直接露出 `Suggestion 沉淀动作`，可原地执行 `转成 candidate memory / 暂不沉淀`。
- 定向回归：
  - `rtk node --test test/workspace-dashboard.test.js`
- 全量回归：
  - `rtk node --test` 当前为 `261 / 261` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk node scripts/automation-status.js`
  - 当前为 `10 / 10 running`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live probe：
  - 项目：`PRJ-cortex-live-probe-home-memory-actions-1778383894159`
  - `/workspace?project_id=PRJ-cortex-live-probe-home-memory-actions-1778383894159` 已确认同时命中：
    - `data-home-memory-review-action="accepted"`
    - `data-home-memory-review-action="needs_followup"`
    - `data-home-memory-review-action="rejected"`
    - `data-home-memory-reviewer-refresh`
    - `data-home-suggestion-review-action="accept"`
    - `data-home-suggestion-review-action="reject"`
    - `首页直达治理`
    - `Suggestion 沉淀动作`
- 当前备注：
  - 这轮已经把首页记忆治理从“只读中枢”推进成“轻量可操作中枢”，并且仍然复用现有 memory / suggestion server 写路径，没有再造新的协议
  - 若后续继续推进，优先级最高的剩余缺口已经收窄到 `evidence diff / freshness / revalidation` 这类更细的 reviewer 解释层

## 2026-05-10 首页记忆治理中枢已补 reviewer signals

- 已完成：首页 `记忆候选 / Review 队列` 卡现在也会直接露出 `Reviewer 建议 / Freshness 体检 / 证据变化 / 重新校验建议`，不需要先跳进 `/workspace/docs/memory` 才能判断为什么当前值得 accept、补证据或重跑 reviewer。
- 已完成：这轮没有新增任何 server 写路径；首页只是继续复用已有 `memory.metadata.reviewer_recommendation / human_review` 与 `memory sources`，把 reviewer 现场已经存在的解释层前置到工作台。
- 定向回归：
  - `rtk node --test test/workspace-dashboard.test.js`
- 全量回归：
  - `rtk node --test` 当前为 `261 / 261` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk node scripts/automation-status.js`
  - 当前为 `10 / 10 running`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live probe：
  - 项目：`PRJ-cortex-live-probe-home-memory-signals-1778384582366`
  - `/workspace?project_id=PRJ-cortex-live-probe-home-memory-signals-1778384582366` 已确认同时命中：
    - `Reviewer 建议`
    - `Freshness 体检`
    - `证据变化`
    - `重新校验建议`
    - `当前没有 source`
- 当前备注：
  - 这轮已经把首页记忆治理从“有动作”继续推进成“有第一层判断依据”
  - 若后续继续压实，优先级最高的剩余缺口已经收窄到 `post-action feedback / reviewer note 回写可见性`，而不是再补新的 source 解释层

## 2026-05-10 首页记忆治理中枢已补证据摘要与 source 锚点

- 已完成：首页 `记忆候选 / Review 队列` 卡现在会直接露出 `证据摘要`，把已有 `memory sources` 的摘要线索前置到工作台，不需要再先跳 `/workspace/docs/memory` 才知道这条 memory 现在是基于什么证据在等判断。
- 已完成：当最新 source 带 `source_url` 时，同一张首页卡会直接补出 `打开最近 source`，并把 `Checkpoint · ref=...` 这种 source 锚点一起露出来；首页现在不只是告诉我们“建议怎么判”，也会告诉我们“依据锚在哪儿、可以点哪儿”。
- 已完成：这轮仍然没有新增任何 server route 或 schema；只是继续复用 `buildMemoryEvidenceSummary(...)`、`pickLatestMemorySource(...)` 和现有 memory source 字段，把 memory reviewer 现场已经有的数据再往首页抬一层。
- 定向回归：
  - `rtk node --test test/workspace-dashboard.test.js`
- 全量回归：
  - `rtk node --test` 当前为 `261 / 261` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk node scripts/automation-status.js`
  - 当前为 `10 / 10 running`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live probe：
  - 项目：`PRJ-cortex-live-probe-home-memory-evidence-1778385145337`
  - `/workspace?project_id=PRJ-cortex-live-probe-home-memory-evidence-1778385145337` 已确认同时命中：
    - `证据摘要`
    - `Checkpoint · ref=CP-home-memory-evidence-live`
    - `打开最近 source`
    - `首页记忆卡应直接显示证据摘要`
- 当前备注：
  - 这轮已经把首页记忆治理从“有 reviewer 判断”继续推进成“有 reviewer 依据入口”
  - 若后续继续推进，优先级最高的剩余缺口已经收窄到更统一的跨中枢动作反馈，而不是 memory 卡自身的 reviewer note 可见性

## 2026-05-10 首页 memory reviewer 动作已补刷新后 feedback 与 note 可见性

- 已完成：首页 memory reviewer / suggestion / comment / decision 动作现在都会把成功反馈带过一次刷新；首页不再只有瞬时 toast，而是会在刷新后继续露出 `workspace-action-feedback` banner。
- 已完成：首页 memory reviewer 写入的 `review_note` 现在会在刷新后继续通过 `最近人工判断` 回到同一张 memory 卡上，不需要再跳 memory 文档确认“刚刚写回的 note 有没有落进去”。
- 已完成：这轮没有新增任何 server route；只是让 `/workspace` 继续吃 `action_feedback / action_feedback_tone` 查询参数，并复用已有 `human_review` 元数据把 note 再前置回首页。
- 定向回归：
  - `rtk node --test test/workspace-dashboard.test.js`
- 全量回归：
  - `rtk node --test` 当前为 `262 / 262` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk node scripts/automation-status.js`
  - 当前为 `10 / 10 running`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live probe：
  - 项目：`PRJ-cortex-live-probe-home-memory-feedback-1778385789567`
  - `/workspace?project_id=PRJ-cortex-live-probe-home-memory-feedback-1778385789567&action_feedback=...` 已确认同时命中：
    - 成功反馈 banner
    - `最近人工判断`
    - `workspace_memory_reviewer`
    - `请先补两条真实 source 再 accept。`
- 当前备注：
  - 这轮已经把首页 memory 动作从“能点、能成功”继续推进成“刷新回来还知道刚刚写了什么”
  - 若后续继续推进，优先级最高的剩余缺口已经收窄到让决策/评论/记忆三类首页动作共享更统一的反馈语言

## 2026-05-10 首页跨中枢 feedback 文案 contract 已收敛

- 已完成：`src/task-dashboard.js` 现已把首页 success feedback 收口为共享 helper：
  - `buildWorkspaceHomeDecisionFeedback(...)`
  - `buildWorkspaceHomeCommentFeedback(...)`
  - `buildWorkspaceHomeMemoryReviewFeedback(...)`
  - `buildWorkspaceHomeSuggestionFeedback(...)`
- 已完成：同一套 helper 会同时被 Node 侧纯函数回归和首页内嵌脚本复用；decision / comment / memory / suggestion 四类动作不再各自手写 success banner 文案。
- 已完成：新增 `test/task-dashboard-feedback.test.js`，专门钉住四类首页动作的 success feedback contract，避免后续扩动作时出现“同类动作不同话术”的退化。
- 定向回归：
  - `rtk node --test test/task-dashboard-feedback.test.js`
  - `rtk node --test test/workspace-dashboard.test.js`
- 全量回归：
  - `rtk node --test` 当前为 `266 / 266` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk node scripts/automation-status.js`
  - 当前为 `10 / 10 running`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 当前备注：
  - 这轮已经把首页 feedback 从“能带过刷新”继续推进成“跨中枢共享同一套成功话术”
  - 这条浏览器级真实点击回归现在也已经补齐，后续可以把注意力重新放回协作主路径与 checklist 引导本身

## 2026-05-10 首页 decision/comment 刷新后 feedback 已补端到端回归

- 已完成：`test/workspace-dashboard.test.js` 新增一条 decision homepage 集成回归。
  - 真实调用 `/workspace/threads/:threadKey/decision`
  - 再拉 `/workspace?...&action_feedback=...`
  - 确认 success banner 仍在
  - 确认 red lane 回到 `当前没有红灯待拍板事项`
- 已完成：`test/workspace-dashboard.test.js` 新增一条 comment reply homepage 集成回归。
  - 真实调用 `/workspace/threads/:threadKey/comment` 的 `reply_only` 路径
  - 再拉 homepage
  - 确认 success banner 仍在
  - 确认 `线程回复 · 已归档` 审计痕迹仍在
  - 确认 reply 文本仍能在首页评论回流中枢看见
- 定向回归：
  - `rtk node --test test/workspace-dashboard.test.js`
  - 当前为 `21 / 21` 全绿
- 全量回归：
  - `rtk node --test` 当前为 `268 / 268` 全绿
- runtime 复验：
  - `rtk node scripts/automation-status.js`
  - 当前为 `10 / 10 running`
  - listener 端口 `19100`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 当前备注：
  - 这轮已经把“刷新后 feedback 仍可见”的 homepage 回归从 memory 单点扩展到 decision/comment 一起受测
  - browser/UAT 级真实点击验证现在也已经补齐，后续可以把注意力重新放回 workspace/thread/document 协作面本身

## 2026-05-10 docs/thread/memory 首屏 selector contract 已补齐

- 已完成：`src/workspace-docs.js` 已为 docs / thread / memory 首屏关键区块补齐稳定 `data-*` selector，同时保留既有 id/class，不改视觉结构。
  - `data-execution-focus-strip`
  - `data-memory-focus-strip`
  - `data-thread-focus-card`
  - `data-execution-summary-card`
  - `data-thread-workflow-card`
  - `data-workspace-compose-card`
  - `data-comment-summary-card`
  - `data-thread-event-summary-card`
  - `data-memory-reviewer-focus-card`
  - `data-memory-reviewer-summary-card`
- 已完成：`test/workspace-docs.test.js` 已切到这些 selector 做 contract 回归，不再主要依赖 `.thread-focus` / `.comment-summary-card` 这类更容易漂移的样式类。
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 已同步改用这些 selector，docs / memory / thread 首屏的浏览器 UAT 现在验证的是稳定 contract，而不是实现细节。
- 定向回归：
  - `rtk node --check src/workspace-docs.js`
  - `rtk node --test test/workspace-docs.test.js`
  - 当前为 `24 / 24` 全绿
- 全量回归：
  - `rtk node --test` 当前为 `269 / 269` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk npm run automation:status`
  - 当前为 `10 / 10 running`
  - listener 端口 `19100`
  - `cortex-server` pid `46907`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live browser UAT：
  - 项目：`PRJ-cortex-live-browser-execution-guide-1778425510474`
  - `checkedAt`: `2026-05-10T15:05:13.563Z`
  - 已确认 `/workspace`、`/workspace/docs/execution`、`/workspace/docs/memory`、`/workspace/threads/...` 四条首屏链路全部通过
- 当前备注：
  - 这轮已经把 docs-side 首屏 contract 从“看起来能用”推进成“自动化可稳定依赖”
  - 若后续继续推进，优先级更高的是把 docs-side proof/action 语义继续向 dashboard 侧共享 renderer 收口，而不是单纯继续堆 selector

## 2026-05-10 docs 首屏 proof-card contract 已继续收口

- 已完成：`src/workspace-docs.js` 新增本地共享 helper：
  - `renderHtmlAttributeString(...)`
  - `renderChecklistFocusLinks(...)`
  - `renderChecklistFocusProofCard(...)`
- 已完成：execution strip 已稳定产出 namespaced `data-focus-proof-kind`：
  - `execution-direct-links`
  - `execution-workflow-node`
  - `execution-node-acceptance`
  - `execution-node-checkpoint-rule`
  - `execution-focus-evidence`
  - `execution-next-acceptance`
  - `execution-checkpoint-rule`
  - `execution-focus-context`
  - `execution-revisit-context`
- 已完成：memory strip 已稳定产出 namespaced `data-focus-proof-kind`：
  - `memory-execution-relation`
  - `memory-node-guidance`
  - `memory-current-decision`
  - `memory-step-decision`
  - `memory-governance-rule`
  - `memory-focus-evidence`
- 已完成：`renderChecklistRelationCallout(...)` 现已支持附加 attributes，因此 memory 首屏里的“与当前闭环关系”也进入了稳定 proof-card contract。
- 已完成：`test/workspace-docs.test.js` 与 `scripts/workspace-execution-guide-live-uat.playwright.js` 已同步切到这些 per-card hook，不再只验证 strip 容器存在。
- 定向回归：
  - `rtk node --check src/workspace-docs.js`
  - `rtk node --test test/workspace-docs.test.js`
  - 当前继续 `24 / 24` 全绿
- 全量回归：
  - `rtk node --test` 当前继续 `269 / 269` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk npm run automation:status`
  - 当前为 `10 / 10 running`
  - listener 端口 `19100`
  - `cortex-server` pid `52428`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live browser UAT：
  - 项目：`PRJ-cortex-live-browser-execution-guide-1778426077709`
  - `checkedAt`: `2026-05-10T15:14:42.491Z`
  - 已确认新的 proof-card hooks 在 `/workspace/docs/execution`、`/workspace/docs/memory`、`/workspace/threads/...` 首屏断言里全部通过
- 当前备注：
  - 这轮已经把 docs-side checklist 引导 contract 从“容器级稳定”推进成“proof-card 级稳定”
  - 若后续继续推进，优先级更高的是评估如何把 docs-side proof/action model 更自然地与 dashboard 侧 guidance model 对齐，而不是继续补更多孤立钩子

## 2026-05-10 docs 首屏 guidance 已进入 payload contract

- 已完成：`src/workspace-docs.js` 新增结构化 guidance builder：
  - `buildChecklistFocusGuidanceModel(...)`
  - `buildExecutionFocusGuidanceModel(...)`
  - `buildMemoryFocusGuidanceModel(...)`
- 已完成：`buildWorkspaceDocumentPayload(...)` 现在会稳定产出：
  - `execution_focus_guidance` / `executionFocusGuidance`
  - `memory_focus_guidance` / `memoryFocusGuidance`
  - `execution_guide_queue` / `executionGuideQueue`
  - `focus_strip_workflow_guidance` / `focusStripWorkflowGuidance`
- 已完成：同一轮里 `execution_checklist.focus_guidance` 与 `memory_panel.focus_guidance` 也会挂上对应 guidance model，render 层不再需要自己重算 docs 第一屏语义。
- 已完成：`renderWorkspaceDocumentPage(...)`、`renderChecklistFocusStrip(...)`、`renderMemoryFocusStrip(...)` 现已优先消费 payload-backed guidance model，只在旧调用路径下才回退到本地 builder。
- 已完成：`test/workspace-docs.test.js` 已补 payload 断言，直接确认 execution / memory 两条链路的 guidance model 会进入 payload，并包含关键 proof-card kind。
- 定向回归：
  - `rtk node --check src/workspace-docs.js`
  - `rtk node --test test/workspace-docs.test.js`
  - 当前继续 `24 / 24` 全绿
- 全量回归：
  - `rtk node --test` 当前继续 `269 / 269` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk npm run automation:status`
  - 当前为 `10 / 10 running`
  - listener 端口 `19100`
  - `cortex-server` pid `60791`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live browser UAT：
  - 项目：`PRJ-cortex-live-browser-execution-guide-1778426904435`
  - `checkedAt`: `2026-05-10T15:28:27.471Z`
  - 已确认 payload-backed docs strip 仍然在 `/workspace/docs/execution`、`/workspace/docs/memory`、`/workspace/threads/...` 首屏通过全部断言
- 当前备注：
  - 这轮已经把 docs 首屏从“proof-card contract 稳定”继续推进成“payload contract 稳定”
  - 若后续继续推进，优先级更高的是评估 docs-side guidance model 与 homepage/dashboard 侧 panel guidance model 的进一步共模，而不是继续让两边平行生长

## 2026-05-10 docs 首屏 thread chrome / comment focus 已继续进入 payload contract

- 已完成：`src/workspace-docs.js` 新增共享 helper：
  - `buildWorkspaceDocumentSelectedCommentFocus(...)`
  - `buildWorkspaceDocumentTopbarStatus(...)`
  - `buildWorkspaceDocumentComposeOwnerAgent(...)`
- 已完成：`buildWorkspaceDocumentPayload(...)` 现在会稳定产出：
  - `selected_comment_focus` / `selectedCommentFocus`
  - `topbar_status` / `topbarStatus`
  - `compose_owner_agent` / `composeOwnerAgent`
- 已完成：同一轮里 `thread_detail.selected_comment_focus` 也会挂上选中的评论节点，render 层不再需要根据 comment filter 临时重选 comment focus。
- 已完成：`renderWorkspaceDocumentPage(...)` 现已优先消费 payload-backed topbar / comment focus / compose owner，只在旧 payload 路径下才回退到本地 builder。
- 已完成：`test/workspace-docs.test.js` 已补两类断言：
  - 直接确认 payload 会挂出 `selected_comment_focus`、`topbar_status`、`compose_owner_agent`
  - 覆盖 payload 后再调用 `renderWorkspaceDocumentPage(...)`，确认 renderer 会优先使用 payload 值，而不是重新从 `threadDetail` 即时拼装
- 定向回归：
  - `rtk node --check src/workspace-docs.js`
  - `rtk node --test test/workspace-docs.test.js`
  - 当前继续 `24 / 24` 全绿
- 全量回归：
  - `rtk node --test` 当前继续 `269 / 269` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk npm run automation:status`
  - 当前为 `10 / 10 running`
  - listener 端口 `19100`
  - `cortex-server` pid `66284`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live browser UAT：
  - 项目：`PRJ-cortex-live-browser-execution-guide-1778427490900`
  - `checkedAt`: `2026-05-10T15:38:13.949Z`
  - 已确认 `/workspace/docs/execution`、`/workspace/docs/memory`、`/workspace/threads/...` 首屏继续通过 live browser UAT
  - 直接浏览器复核 execution 文档时，也已看到“当前线程 …”“当前主闭环”“评论线程”“默认负责人 agent-router”等首屏文案仍与 payload-backed contract 对齐
- 当前备注：
  - 这轮已经把 docs 首屏从“guidance payload 稳定”继续推进成“thread chrome / comment focus 也稳定挂在 payload 上”
  - 若后续继续推进，优先级更高的是继续削减 `thread_panel` / `thread_detail.comment_summary` 一带残留的 render-time 语义，而不是回头再补更多零散 DOM 钩子

## 2026-05-10 docs thread 评论筛选焦点卡 已收口成可切换 contract

- 已完成：`src/workspace-docs.js` 新增 `buildWorkspaceDocumentCommentFocusMap(...)`，把 `all / triage / ready / rejected / resolved` 每个评论筛选层的焦点描述与焦点 comment 稳定挂进 payload。
- 已完成：`buildWorkspaceDocumentSelectedCommentFocus(...)` 现在会优先从 comment focus map 选取当前筛选层的焦点 comment，而不是在 render 时重新 fallback 猜一个。
- 已完成：`renderCommentFocusCard(...)` 现在支持“当前筛选里暂时没有可展开的评论节点”的空态卡；`renderCommentFocusPanel(...)` 会渲染可切换的 `data-comment-focus-entry` / `data-comment-focus-for` contract。
- 已完成：thread 页前端脚本现在会同时切换：
  - 评论列表 `data-comment-bucket`
  - 焦点卡 `data-comment-focus-entry`
  - 状态条文案 `data-comment-filter-status-headline/detail`
- 已完成：顺手修掉了状态条 selector 冲突；以前脚本误选了带 `data-comment-filter-headline/detail` 属性的按钮，现在已改成专属的 `data-comment-filter-status-headline/detail`。
- 已完成：`test/workspace-docs.test.js` 已补 contract 断言：
  - payload 会挂出 `comment_focus_map` / `commentFocusMap`
  - resolved 为空时会渲染对应空态 focus card
  - 覆盖 payload 的 focus map 后，render 会优先使用 payload 中的下一步文案
- 已完成：`scripts/workspace-execution-guide-live-uat.playwright.js` 现已把 thread 页面评论筛选点击也纳入 live browser UAT；会真实点击 `resolved` 再切回 `triage`，确认状态条与焦点卡同步更新。
- 定向回归：
  - `rtk node --check src/workspace-docs.js`
  - `rtk node --test test/workspace-docs.test.js`
  - 当前继续 `24 / 24` 全绿
- 全量回归：
  - `rtk node --test` 当前继续 `269 / 269` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk npm run automation:status`
  - 当前为 `10 / 10 running`
  - listener 端口 `19100`
  - `cortex-server` pid `80609`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live browser UAT：
  - 项目：`PRJ-cortex-live-browser-execution-guide-1778428926876`
  - `checkedAt`: `2026-05-10T16:02:11.836Z`
  - 已确认 `/workspace`、`/workspace/docs/execution`、`/workspace/docs/memory`、`/workspace/threads/...` 首屏继续通过
  - 已额外确认 thread 页面点击 `resolved` / `triage` 评论筛选按钮后，状态条与焦点卡会同步切换
- 当前备注：
  - 这轮已经把 docs/thread 评论筛选体验从“首屏 SSR 对”继续推进成“浏览器点击后仍然对”
  - 若后续继续推进，优先级更高的是评估 homepage comment center 是否能共享同一份 per-filter focus model，而不是继续在 docs/thread 页面单独长更多局部状态

## 2026-05-10 docs 首屏 thread_panel alias / 事件摘要 已继续进入 payload contract

- 已完成：`buildWorkspaceDocumentPayload(...)` 现在返回的 `threadPanel` camelCase alias 已与 `thread_panel` 主对象对齐，不再只是裁剪后的 subset。
- 已完成：`thread_event_summary` / `threadEventSummary` 已改为由 payload 层直接产出，`renderWorkspaceDocumentPage(...)` 会优先消费这份 payload-backed 摘要，而不是在 render 时再次即席重算。
- 已完成：`test/workspace-docs.test.js` 已补 contract 断言：
  - `threadPanel` 与 `thread_panel` 会保持同样语义
  - payload 会挂出 `thread_event_summary` / `threadEventSummary`
  - renderer 会优先使用 payload 提供的 thread event summary
- 定向回归：
  - `rtk node --check src/workspace-docs.js`
  - `rtk node --test test/workspace-docs.test.js`
- 全量回归：
  - `rtk node --test`
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk npm run automation:status`
  - 当前为 `10 / 10 running`
  - listener 端口 `19100`
  - `cortex-server` pid `85816`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live browser UAT：
  - 项目：`PRJ-cortex-live-browser-execution-guide-1778429310382`
  - `checkedAt`: `2026-05-10T16:08:34.456Z`
  - 已确认 `/workspace`、`/workspace/docs/execution`、`/workspace/docs/memory`、`/workspace/threads/...` 首屏继续通过
  - 已确认 docs 首屏 thread event summary 与 thread panel 首屏文案继续保持 payload-backed 一致
- 当前备注：
  - 这轮已经把 docs 首屏从“comment focus / focus map 稳定”继续推进成“thread panel alias 与事件摘要也稳定挂在 payload 上”
  - 若后续继续推进，优先级更高的是继续削减 `thread_detail.comment_summary` 一带残留的 render-time 语义，而不是继续补更多命名层 alias

## 2026-05-10 docs renderer 已补齐 camelCase payload alias 读路径

- 已完成：`renderWorkspaceDocumentPage(...)` 现在会兼容读取：
  - `selectedThread`
  - `threadPanel`
  - `threadDetail`
  - `executionChecklist`
  不再只依赖对应的 snake_case 顶层字段。
- 已完成：同一轮里 `threadDetail` 的关键嵌套 alias 也已归一化：
  - `executionSnapshot`
  - `commentSummary`
  - `commentThreads`
  - `openDecisions`
  - `sourceRecovery`
- 已完成：`test/workspace-docs.test.js` 新增 camelCase-only 回归；会故意删除 snake_case 顶层与嵌套字段，只保留 camelCase payload，再要求页面仍然渲染：
  - 顶部状态
  - 评论下一步
  - 默认负责人
  - 线程事件摘要
- 定向回归：
  - `rtk node --check src/workspace-docs.js`
  - `rtk node --test test/workspace-docs.test.js`
  - 当前继续 `24 / 24` 全绿
- 全量回归：
  - `rtk node --test` 当前继续 `269 / 269` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk npm run automation:status`
  - 当前为 `10 / 10 running`
  - listener 端口 `19100`
  - `cortex-server` pid `91366`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live browser UAT：
  - 项目：`PRJ-cortex-live-browser-execution-guide-1778429560089`
  - `checkedAt`: `2026-05-10T16:12:43.132Z`
  - 已确认 `/workspace`、`/workspace/docs/execution`、`/workspace/docs/memory`、`/workspace/threads/...` 首屏继续通过
  - 已确认这次 renderer-side alias 归一化没有带来首屏回归
- 当前备注：
  - 这轮已经把 docs 首屏从“payload 带 alias”继续推进成“renderer 也真的接受 alias”
  - 若后续继续推进，优先级更高的是继续削减 `thread_detail.comment_summary` 一带残留的 render-time 语义，而不是继续增加更多命名兼容分支

## 2026-05-10 docs comment_summary 已补齐 bilingual payload contract

- 已完成：`normalizeCommentSummary(...)` 现在会把 comment summary 统一补齐为双语 contract：
  - `triageCount / triage_count`
  - `readyCount / ready_count`
  - `rejectedCount / rejected_count`
  - `resolvedCount / resolved_count`
  - `activeCount / active_count`
  - `defaultFilter / default_filter`
  - `selectedFilter / selected_filter`
  - `defaultFocus / default_focus`
  - `selectedFocus / selected_focus`
- 已完成：`buildCommentThreadSummary(...)`、`buildWorkspaceDocumentPayload(...)`、`buildWorkspaceDocumentCommentFocusMap(...)`、`buildWorkspaceDocumentSelectedCommentFocus(...)` 现已统一走这层归一化，不再假设 comment summary 只会以 camelCase 流动。
- 已完成：`renderWorkspaceDocumentPage(...)`、`renderCommentFocusCard(...)`、`renderCommentFocusPanel(...)` 已改为优先消费归一化后的 comment summary；即使只保留 snake_case 版本的计数、focus 与 filter 字段，docs 首屏仍能正常显示评论总览、筛选焦点与默认 filter。
- 已完成：`test/workspace-docs.test.js` 新增两类回归：
  - payload 直接断言 `triage_count / ready_count / default_focus / selected_focus`
  - snake_case-only comment summary 仍能通过 renderer 命中评论总览、当前焦点与 `data-default-filter="resolved"`
- 定向回归：
  - `rtk node --check src/workspace-docs.js`
  - `rtk node --test test/workspace-docs.test.js`
  - 当前继续 `24 / 24` 全绿
- 全量回归：
  - `rtk node --test` 当前继续 `269 / 269` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk npm run automation:status`
  - 当前为 `10 / 10 running`
  - listener 端口 `19100`
  - `cortex-server` pid `96335`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live browser UAT：
  - 项目：`PRJ-cortex-live-browser-execution-guide-1778429898698`
  - `checkedAt`: `2026-05-10T16:18:21.906Z`
  - 已确认 `/workspace`、`/workspace/docs/execution`、`/workspace/docs/memory`、`/workspace/threads/...` 首屏继续通过
  - 已确认这次 comment summary 归一化没有带来首屏回归
- 当前备注：
  - 这轮已经把 docs/thread 评论总览从“依赖某种 naming shape”继续推进成“payload 与 renderer 都承认双语 contract”
  - 若后续继续推进，优先级更高的是评估 `comment_focus_map` 与 homepage comment center 是否还在平行演化，而不是继续堆 docs/thread 页面局部兼容

## 2026-05-10 homepage comment_workflow 已补齐 bilingual payload contract

- 已完成：`normalizeCommentWorkflowPayload(...)` 现在会把 homepage `comment_workflow` 内部结构统一补齐为双语 contract：
  - `triageItems / triage_items`
  - `readyItems / ready_items`
  - `recentCommentCards / recent_comment_cards`
  - `focusGuidance / focus_guidance`
  - `counts.triageThreads / counts.triage_threads`
  - `counts.triageComments / counts.triage_comments`
  - `counts.readyThreads / counts.ready_threads`
  - `counts.readyComments / counts.ready_comments`
  - `counts.recentComments / counts.recent_comments`
  - `counts.recentThreads / counts.recent_threads`
- 已完成：`buildWorkspaceCommentWorkflowFocus(...)`、`buildHomeCommentCenterGuidance(...)`、`renderWorkspacePage(...)` 现已统一走这层归一化；即使 homepage 只拿到 snake_case-only 的 `comment_workflow` 内部字段，评论中枢仍能稳定渲染 KPI、当前评论节点 guidance 和三条评论 lane。
- 已完成：`test/workspace-dashboard.test.js` 新增两类回归：
  - payload 直接断言 `focus_guidance`、`triage_items`、`ready_items`、`recent_comment_cards` 与 snake_case 计数 alias
  - snake_case-only `comment_workflow` 仍能通过 `renderWorkspacePage(...)` 命中自定义 summary、focus guidance 与 KPI 数字
- 定向回归：
  - `rtk node --check src/task-dashboard.js`
  - `rtk node --test test/workspace-dashboard.test.js`
  - 当前继续 `22 / 22` 全绿
- 全量回归：
  - `rtk node --test` 当前继续 `269 / 269` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk npm run automation:status`
  - 当前为 `10 / 10 running`
  - listener 端口 `19100`
  - `cortex-server` pid `2633`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live browser UAT：
  - 项目：`PRJ-cortex-live-browser-execution-guide-1778430547927`
  - `checkedAt`: `2026-05-10T16:29:11.018Z`
  - 已确认 `/workspace`、`/workspace/docs/execution`、`/workspace/docs/memory`、`/workspace/threads/...` 首屏继续通过
  - 已确认这次 homepage comment center contract 收口没有带来前台回归
- 当前备注：
  - 这轮已经把 homepage comment center 从“顶层双写、内部偏 camelCase”继续推进成“内部语义也真正双语可消费”
  - 若后续继续推进，优先级更高的是评估 homepage / docs-thread 的 per-filter focus model 是否还能进一步共模，而不是继续补更多命名兼容

## 2026-05-10 homepage comment_workflow item-level contract 已补齐 bilingual alias

- 已完成：`normalizeCommentWorkflowAuditItem(...)` 与 `normalizeCommentWorkflowItem(...)` 已落到 `src/task-dashboard.js`，homepage comment item 与 audit item 不再默认只走 camelCase。
- 已完成：`comment_workflow` 卡片内部现在会稳定双写下列关键字段：
  - `actionMode / action_mode`
  - `replyCapable / reply_capable`
  - `proofValue / proof_value`
  - `proofLabel / proof_label`
  - `threadKey / thread_key`
  - `commandId / command_id`
  - `ownerAgent / owner_agent`
  - `sourceHref / source_href`
  - `hrefLabel / href_label`
  - `focusNote / focus_note`
  - `focusLabel / focus_label`
  - `focusStepLabel / focus_step_label`
  - `focusStepTitle / focus_step_title`
  - `progressLabel / progress_label`
  - `progressNote / progress_note`
  - `checklistProgressSummary / checklist_progress_summary`
  - `latestCollaborationTitle / latest_collaboration_title`
  - `latestCollaborationSummary / latest_collaboration_summary`
  - `latestCollaborationDetail / latest_collaboration_detail`
  - `auditLabel / audit_label`
  - `collaborationAuditItems / collaboration_audit_items`
- 已完成：audit item 本身也会稳定补齐：
  - `kindLabel / kind_label`
  - `timeLabel / time_label`
- 已完成：`renderWorkspaceCommentWorkflowList(...)` 与 `renderWorkspaceCommentAuditList(...)` 现在会在渲染前先做 item-level normalization；即使 homepage 只收到 snake_case-only 的 ready/triage/recent 卡与协同审计条目，页面仍能稳定渲染下一步、证据、负责人与审计摘要。
- 已完成：`test/workspace-dashboard.test.js` 现在会直接断言：
  - `comment_workflow.readyItems[0].reply_capable = true`
  - `comment_workflow.readyItems[0].command_id` 与 `commandId` 对齐
  - `comment_workflow.readyItems[0].owner_agent` 与 `ownerAgent` 对齐
  - `comment_workflow.readyItems[0].proof_value` 与 `proofValue` 对齐
  - `comment_workflow.readyItems[0].collaboration_audit_items` 与 `collaborationAuditItems` 深度一致
- 已完成：同一份测试还新增 snake_case-only render 回归；故意只保留 `ready_items[*].action_mode / blocker_reason / proof_value / collaboration_audit_items[*].kind_label / time_label` 等字段，再要求 `renderWorkspacePage(...)` 继续命中自定义 ready 卡与审计文案。
- 定向回归：
  - `rtk node --test test/workspace-dashboard.test.js`
  - 当前继续 `22 / 22` 全绿
- 全量回归：
  - `rtk node --test` 当前继续 `269 / 269` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk npm run automation:status`
  - 当前为 `10 / 10 running`
  - listener 端口 `19100`
  - `cortex-server` pid `9647`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live browser UAT：
  - 项目：`PRJ-cortex-live-browser-execution-guide-1778431426718`
  - `checkedAt`: `2026-05-10T16:43:49.824Z`
  - 已确认 `/workspace`、`/workspace/docs/execution`、`/workspace/docs/memory`、`/workspace/threads/...` 首屏继续通过
  - 已确认这次 homepage comment item-level contract 收口没有带来前台回归
- 当前备注：
  - 这轮已经把 homepage comment center 从“lane 级双语”继续推进成“item-level 也真正双语可消费”
  - 若后续继续推进，优先级更高的是评估 docs/thread 的 comment focus / audit scene 是否也能共享这套 item-level normalization，而不是继续补更多单页兼容分支

## 2026-05-10 docs/thread comment focus 与 audit scene 已并入 item-level bilingual contract

- 已完成：`src/workspace-docs.js` 现在会直接复用 `normalizeCommentWorkflowItem(...)` / `normalizeCommentWorkflowAuditItem(...)` 作为 base path，并在 docs 侧新增：
  - `normalizeThreadCommentItem(...)`
  - `normalizeThreadCommentAuditItem(...)`
  - `normalizeCommentFocusMap(...)`
- 已完成：docs/thread comment item 现在会稳定双写下列关键字段：
  - `queueBucket / queue_bucket`
  - `queueBucketLabel / queue_bucket_label`
  - `executionPolicy / execution_policy`
  - `replyCapable / reply_capable`
  - `actionMode / action_mode`
  - `sourceUrl / source_url`
  - `collaborationAuditSummary / collaboration_audit_summary`
  - `nodeLabel / node_label`
  - `nodeSummary / node_summary`
  - `nodeAcceptance / node_acceptance`
  - `nodeCheckpointRule / node_checkpoint_rule`
  - `nodeEvidence / node_evidence`
  - `nodeAnchorLabel / node_anchor_label`
  - `nextAction / next_action`
  - `flowCountsLabel / flow_counts_label`
  - `latestRunStatusLabel / latest_run_status_label`
  - `latestReceiptLabel / latest_receipt_label`
  - `latestCheckpointSummary / latest_checkpoint_summary`
  - `latestDerivedCommandLabel / latest_derived_command_label`
  - `intentLabel / intent_label`
  - `executionPolicyLabel / execution_policy_label`
  - `taskStateLabel / task_state_label`
  - `confidenceLabel / confidence_label`
  - `reasonLabel / reason_label`
  - `commandStatusLabel / command_status_label`
  - `inboxStatusLabel / inbox_status_label`
  - `relatedTaskLabel / related_task_label`
  - `relatedTaskHref / related_task_href`
  - `collaborationAuditItems / collaboration_audit_items`
- 已完成：docs/thread audit item 也会稳定补齐：
  - `statusLabel / status_label`
  - `ownerAgent / owner_agent`
  - `sourceUrl / source_url`
- 已完成：`buildThreadCommentCards(...)`、`buildWorkspaceDocumentCommentFocusMap(...)`、`buildWorkspaceDocumentSelectedCommentFocus(...)`、`renderCommentFocusCard(...)`、`renderCommentThreadCard(...)`、`renderCommentAuditTrail(...)`、`renderWorkspaceDocumentPage(...)` 现已统一走这层归一化；即使 thread 页面只收到 snake_case-only 的 comment card、focus map、selected comment 与 audit row，评论聚焦卡、评论列表卡和协同审计条带仍能稳定渲染。
- 已完成：`test/workspace-docs.test.js` 现在会直接断言：
  - `thread_detail.comment_threads[0].queue_bucket` 与 `queueBucket` 对齐
  - `thread_detail.comment_threads[0].command_id` 与 `commandId` 对齐
  - `thread_detail.comment_threads[0].source_url` 与 `sourceUrl` 对齐
  - `thread_detail.comment_threads[0].collaboration_audit_items` 与 `collaborationAuditItems` 深度一致
  - `thread_detail.comment_threads[0].collaboration_audit_items[0].kind_label` 与 `kindLabel` 对齐
  - `selected_comment_focus.command_id` 与 `commandId` 对齐
  - `selected_comment_focus.source_url` 与 `sourceUrl` 对齐
  - `selected_comment_focus.collaboration_audit_items` 与 `collaborationAuditItems` 深度一致
- 已完成：同一份测试还新增 snake_case-only docs render 回归；故意只保留：
  - `comment_threads[*].queue_bucket / command_status_label / node_label / next_action`
  - `comment_threads[*].collaboration_audit_items[*].kind_label / time_label / source_url`
  - `comment_focus_map.triage.selected_focus`
  再要求 `renderWorkspaceDocumentPage(...)` 继续命中自定义 focus / card / audit 文案。
- 定向回归：
  - `rtk node --check src/workspace-docs.js`
  - `rtk node --check src/task-dashboard.js`
  - `rtk node --test test/workspace-docs.test.js`
  - 当前继续 `24 / 24` 全绿
  - `rtk node --test test/workspace-dashboard.test.js`
  - 当前继续 `22 / 22` 全绿
- 全量回归：
  - `rtk node --test` 当前继续 `269 / 269` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk npm run automation:status`
  - 当前为 `10 / 10 running`
  - listener 端口 `19100`
  - `cortex-server` pid `16132`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live browser UAT：
  - 项目：`PRJ-cortex-live-browser-execution-guide-1778432132441`
  - `checkedAt`: `2026-05-10T16:55:35.521Z`
  - 已确认 `/workspace`、`/workspace/docs/execution`、`/workspace/docs/memory`、`/workspace/threads/...` 首屏继续通过
  - 已确认这次 docs/thread comment item-level contract 收口没有带来前台回归
- 当前备注：
  - 这轮已经把 docs/thread comment scene 从“summary 级双语”继续推进成“item-level 也真正双语可消费”
  - 若后续继续推进，优先级更高的是评估 memory reviewer / docs evidence scene 是否也该共享同样的 item-level audit normalization，而不是继续补 comment 单页兼容分支

## 2026-05-10 memory reviewer / docs evidence scene 已补齐 item-level bilingual contract

- 已完成：`src/workspace-docs.js` 已把 memory reviewer 的 hydration、focus strip、right rail、directory、governance card renderer 与 page payload builder 全部接到同一层 normalization，不再要求 memory payload 必须先是 camelCase 才能稳定渲染。
- 已完成：memory reviewer card / focus panel 现在会稳定补齐并接受：
  - `memoryId / memory_id`
  - `nextStep / next_step`
  - `evidenceSummary / evidence_summary`
  - `freshnessLabel / freshness_label`
  - `evidenceDeltaLabel / evidence_delta_label`
  - `revalidationLabel / revalidation_label`
  - `humanReviewSummary / human_review_summary`
  - `sourceAnchorLabel / source_anchor_label`
  - `sourceAnchorDetail / source_anchor_detail`
  - `sourceAnchorHref / source_anchor_href`
  - `focusItem / focus_item`
  - `focusTitle / focus_title`
  - `focusSectionTitle / focus_section_title`
  - `focusEvidence / focus_evidence`
- 已完成：docs/memory reviewer action panel 现在会显式显示“最近 source 锚点”，把最近 source 的 label / detail / href 直接放进治理卡，不必再离开当前 reviewer 现场追 source。
- 已完成：`test/workspace-docs.test.js` 已新增：
  - payload alias 断言，确保 `memory_governance.candidate_cards[0]` 与 `memory_panel.focus_item` 的 snake_case / camelCase 字段一致
  - snake_case-only render 回归，确保只保留 snake_case 的 memory panel / card 时，页面仍能命中自定义焦点、证据、freshness、重新校验和 source anchor 文案
- 定向回归：
  - `rtk node --check src/workspace-docs.js`
  - `rtk node --check test/workspace-docs.test.js`
  - `rtk node --test test/workspace-docs.test.js`
  - 当前继续 `24 / 24` 全绿
- 全量回归：
  - `rtk node --test`
  - 当前继续 `269 / 269` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk npm run automation:status`
  - 当前为 `10 / 10 running`
  - listener 端口 `19100`
  - `cortex-server` pid `27531`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live browser UAT：
  - 项目：`PRJ-cortex-live-browser-execution-guide-1778433238245`
  - `checkedAt`: `2026-05-10T17:14:01.287Z`
  - 已确认 `/workspace`、`/workspace/docs/execution`、`/workspace/docs/memory`、`/workspace/threads/...` 四条 execution-guide 场景继续通过
  - 注：并行 restart 窗口里曾出现一次 `ECONNREFUSED 127.0.0.1:19100`，runtime 稳定后复跑即全绿，已确认不是本轮 memory reviewer contract 变更导致的前台回归
- 当前备注：
  - 这轮已经把 memory reviewer / docs evidence scene 正式拉到 item-level bilingual contract
  - 下一轮更值得推进的是 homepage memory governance / reviewer summary 是否也该共用这套 normalization，而不是继续追加单页兼容逻辑

## 2026-05-10 homepage memory governance / reviewer summary 已补齐 item-level bilingual contract

- 已完成：`src/task-dashboard.js` 现已新增：
  - `normalizeHomeMemoryGovernanceCard(...)`
  - `normalizeHomeMemoryGovernancePayload(...)`
- 已完成：homepage memory governance 中枢现在会稳定接受并双写：
  - `candidateCards / candidate_cards`
  - `reviewCards / review_cards`
  - `suggestionCards / suggestion_cards`
  - `memoryDocHref / memory_doc_href`
  - `focusGuidance / focus_guidance`
- 已完成：homepage memory governance card 现在会稳定补齐并接受：
  - `memoryId / memory_id`
  - `showGovernanceActions / show_governance_actions`
  - `reviewerRecommendationSummary / reviewer_recommendation_summary`
  - `evidenceSummary / evidence_summary`
  - `sourceAnchorLabel / source_anchor_label`
  - `sourceAnchorHref / source_anchor_href`
  - `freshnessLabel / freshness_label`
  - `evidenceDeltaLabel / evidence_delta_label`
  - `revalidationLabel / revalidation_label`
- 已完成：`buildHomeMemoryCenterGuidance(...)`、`buildHomeMemoryGovernanceGuidance(...)`、`renderHomeGovernanceActionPanel(...)`、`renderHomeMemoryGovernanceSignals(...)`、`buildWorkspaceHeroActionQueue(...)`、`buildWorkspaceMemoryGovernanceFocus(...)`、`renderWorkspacePage(...)` 现已统一走这层归一化；即使 homepage 只收到 snake_case-only 的 memory governance payload，首页记忆中枢仍能稳定渲染 reviewer 建议、证据变化、source anchor 与治理动作。
- 已完成：`test/workspace-dashboard.test.js` 现在会直接断言：
  - `memory_governance.candidate_cards[0].memory_id` 与 `memoryId` 对齐
  - `memory_governance.candidate_cards[0].show_governance_actions` 与 `showGovernanceActions` 对齐
  - `memory_governance.candidate_cards[0].reviewer_recommendation_summary` 与 `reviewerRecommendationSummary` 对齐
  - `memory_governance.candidate_cards[0].evidence_summary` 与 `evidenceSummary` 对齐
  - `memory_governance.candidate_cards[0].source_anchor_label` 与 `sourceAnchorLabel` 对齐
  - `memory_governance.candidate_cards[0].source_anchor_href` 与 `sourceAnchorHref` 对齐
  - `memory_governance.candidate_cards[0].freshness_label` 与 `freshnessLabel` 对齐
  - `memory_governance.candidate_cards[0].evidence_delta_label` 与 `evidenceDeltaLabel` 对齐
  - `memory_governance.candidate_cards[0].revalidation_label` 与 `revalidationLabel` 对齐
  - `memory_governance.focus_guidance` 与 `focusGuidance` 对齐
- 已完成：同一份测试还新增 snake_case-only homepage render 回归；故意只保留：
  - `memory_governance.memory_doc_href`
  - `memory_governance.focus_guidance`
  - `memory_governance.candidate_cards / review_cards / suggestion_cards`
  - 首张 candidate card 的 `reviewer_recommendation_summary / reviewer_rationale / evidence_summary / source_anchor_label / source_anchor_href / freshness_label / evidence_delta_label / revalidation_label`
  再要求 `renderWorkspacePage(...)` 继续命中自定义首页记忆中枢文案。
- 定向回归：
  - `rtk node --check src/task-dashboard.js`
  - `rtk node --check test/workspace-dashboard.test.js`
  - `rtk node --test test/workspace-dashboard.test.js`
  - 当前继续 `22 / 22` 全绿
- 全量回归：
  - `rtk node --test`
  - 当前继续 `269 / 269` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk npm run automation:status`
  - 当前为 `10 / 10 running`
  - listener 端口 `19100`
  - `cortex-server` pid `34839`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live browser UAT：
  - 项目：`PRJ-cortex-live-browser-execution-guide-1778434064943`
  - `checkedAt`: `2026-05-10T17:27:48.194Z`
  - 已确认 `/workspace`、`/workspace/docs/execution`、`/workspace/docs/memory`、`/workspace/threads/...` 首屏继续通过
  - 已确认这次 homepage memory governance contract 收口没有带来前台回归
- 当前备注：
  - 这轮已经把 homepage memory governance / reviewer summary 正式拉到 item-level bilingual contract
  - 若后续继续推进，优先级更高的是评估 memory governance 与 workspace checklist / hero queue 是否还能继续共享同一套 focus model，而不是继续补更多单页兼容分支

## 2026-05-10 homepage memory governance 已与 checklist / hero queue 对齐同一焦点卡

- 已完成：`src/task-dashboard.js` 现已新增：
  - `pickHomeMemoryGovernanceFocusCard(...)`
- 已完成：homepage memory governance 的焦点选择现在会先按：
  - `candidateCards`
  - `reviewCards`
  - `suggestionCards`
  的 checklist 对齐顺序聚合卡片，再复用 `pickTopChecklistFocus(...)` 选出真正的首页焦点卡。
- 已完成：当 checklist focus label 缺失时，记忆治理仍会回退到原先的：
  - `reviewCards[0]`
  - `candidateCards[0]`
  - `suggestionCards[0]`
  顺序，避免把无焦点标签场景强行改成新的业务优先级。
- 已完成：`buildHomeMemoryCenterGuidance(...)` 现在直接使用这张共享焦点卡；因此 homepage `memory_governance.focusGuidance` 的：
  - `actionDetail`
  - `progressLabel`
  - `checklistAcceptance`
  - `checklistCheckpointRule`
  已与 `checklistHeadline / checklistNote / checklistProgressSummary` 对齐。
- 已完成：`buildWorkspaceHeroActionQueue(...)` 里的记忆治理 action card 也改成使用同一张焦点卡，并让 detail 优先显示：
  - `focusNote`
  - `checklistProgressSummary`
  再回退到 `homeGovernanceHint / summary`。
- 已完成：`test/workspace-dashboard.test.js` 现在会直接断言，在 `candidate=优先回看 / review=当前主闭环 / suggestion=优先回看` 的 seed 下：
  - `memory_governance.focusGuidance.actionDetail` 命中 `当前需要优先回看的线程|先确认它为什么从自动推进降成待回看`
  - `memory_governance.focusGuidance.progressLabel` 命中 `关联闭环：闭环 3 / 5`
  - `memory_governance.focusGuidance.progressLabel` 命中 `执行清单：4 / 5 已收口`
- 已完成：同一份测试还新增 scoped HTML 回归；要求：
  - `data-home-memory-center-guidance` 命中同一条 `优先回看` 文案
  - hero `记忆治理` action card 命中同一条 `优先回看` 文案
  - hero 记忆 action 继续保留 `打开协作记忆`
- 定向回归：
  - `rtk node --check src/task-dashboard.js`
  - `rtk node --check test/workspace-dashboard.test.js`
  - `rtk node --test test/workspace-dashboard.test.js`
  - 当前继续 `22 / 22` 全绿
- 全量回归：
  - `rtk node --test`
  - 当前继续 `269 / 269` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk npm run automation:status`
  - 当前为 `10 / 10 running`
  - listener 端口 `19100`
  - `cortex-server` pid `44565`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live browser UAT：
  - 项目：`PRJ-cortex-live-browser-execution-guide-1778435134377`
  - `checkedAt`: `2026-05-10T17:45:37.436Z`
  - 已确认 `/workspace`、`/workspace/docs/execution`、`/workspace/docs/memory`、`/workspace/threads/...` 首屏继续通过
  - 已确认这次记忆治理焦点卡对齐没有带来前台回归
- 当前备注：
  - 这轮已经把 homepage memory governance 的 checklist、center guidance、hero queue 对齐到同一张焦点卡
  - 若后续继续推进，优先级更高的是评估 decision/comment center 是否也要把 hero queue 与 panel guidance 继续并到同一层 focus selector，而不是让三个首页中枢各自维持一段相似但独立的优先级逻辑

## 2026-05-10 homepage decision / comment center 焦点选择器收口

- 已完成：`src/task-dashboard.js` 现已新增：
  - `pickHomeDecisionFocusItem(...)`
  - `pickHomeCommentWorkflowFocusItem(...)`
- 已完成：`buildHomeDecisionCenterGuidance(...)` 与 `buildHomeCommentCenterGuidance(...)` 现在都会直接使用这两个共享 selector；decision / comment center 的 `actionDetail / progressLabel` 已与 checklist focus 指向同一张卡。
- 已完成：`buildWorkspaceHeroActionQueue(...)` 里的：
  - decision hero item
  - comment hero item
  也已切到同一批 selector。
- 已完成：hero queue detail 现在统一优先显示：
  - `focusNote`
  - `checklistProgressSummary`
  再回退到旧的 `blockerReason / actionValue / summary`。
- 已完成：decision hero badge 不再只按固定红灯文案硬编码；如果共享 selector 真正挑中 yellow focus item，hero 现在会稳定显示 `黄灯绕行`。
- 已完成：`test/workspace-dashboard.test.js` 现在会直接断言：
  - `decision_focus.focusGuidance.actionDetail` 命中当前焦点卡的 `focusNote`
  - `decision_focus.focusGuidance.progressLabel` 命中 `关联闭环：闭环 3 / 5`
  - `decision_focus.focusGuidance.progressLabel` 命中 `执行清单：4 / 5 已收口`
  - `comment_workflow.focusGuidance.actionDetail` 命中当前焦点卡的 `focusNote`
  - `comment_workflow.focusGuidance.progressLabel` 命中 `关联闭环：闭环 3 / 5`
  - `comment_workflow.focusGuidance.progressLabel` 命中 `执行清单：4 / 5 已收口`
- 已完成：同一份测试还新增 conflict regression；即使：
  - decision 的 red item 只是 `当前主闭环`
  - decision 的 yellow item 才是 `优先回看`
  - comment triage 只是 `当前主闭环`
  - comment ready 才是 `优先回看`
  homepage center guidance 与 hero queue 也必须共同选中 yellow / ready 那张焦点卡。
- 已完成：`test/workspace-docs.test.js` 与 `scripts/workspace-execution-guide-live-uat.playwright.js` 已同步把旧 badge 断言收口到：
  - `红灯待拍板`
  - `红灯拍板`
  - `黄灯绕行中`
  - `黄灯绕行`
  避免 docs test 与 live UAT 继续卡在过时文案。
- 定向回归：
  - `rtk node --check src/task-dashboard.js`
  - `rtk node --check test/workspace-dashboard.test.js`
  - `rtk node --check test/workspace-docs.test.js`
  - `rtk node --check scripts/workspace-execution-guide-live-uat.playwright.js`
  - `rtk node --test test/workspace-dashboard.test.js`
  - `rtk node --test test/workspace-docs.test.js`
  - 当前分别继续 `22 / 22`、`24 / 24` 全绿
- 全量回归：
  - `rtk node --test`
  - 当前继续 `269 / 269` 全绿
- runtime 复验：
  - `rtk npm run automation:restart`
  - `rtk npm run automation:status`
  - 当前为 `10 / 10 running`
  - listener 端口 `19100`
  - `cortex-server` pid `53256`
  - `matchesRepoServer=true`
  - `matchesManagedPid=true`
  - `driftDetected=false`
- 真实 live browser UAT：
  - 项目：`PRJ-cortex-live-browser-execution-guide-1778436158201`
  - `checkedAt`: `2026-05-10T18:02:41.225Z`
  - 已确认 `/workspace`、`/workspace/docs/execution`、`/workspace/docs/memory`、`/workspace/threads/...` 首屏继续通过
  - 已确认第一次失败只是 UAT 脚本仍写死 `红灯拍板`，同步到 `红灯待拍板` 后复跑即恢复全绿
- 当前备注：
  - 这轮已经把 homepage decision / comment center 与 hero queue 收口到同一条 checklist focus
  - 若后续继续推进，优先级更高的是评估 docs/thread scene 是否也该抽出同一层 focus-selector helper，而不是继续在 homepage 与 docs 两边各自维护 badge / detail 优先级

## 2026-05-10 docs execution 默认线程已共享 checklist focus 选择

- 当前任务：继续沿着上一轮的 yellow note 往前推，把已经收口到 homepage / thread view 的 checklist focus 优先级继续接到 `/workspace/docs/execution` 首屏默认线程选择上，优先解决 docs 现场仍按“显式 threadKey / brief alias -> 第一条 red -> 第一条线程”落点，导致首页和 thread view 已经认定 `优先回看` ready 线程是主焦点时，execution doc 首屏仍可能先打开前排 red 线程的问题。
- 核心进展：1）`src/task-dashboard.js` 现已导出 `pickTopChecklistFocus(...)`，让 docs-side 可以直接复用和 homepage / thread view 完全同一套焦点优先级。2）`src/workspace-docs.js` 已新增 `pickWorkspaceDocumentThreadGroup(...)`；默认线程选择现在改成 `显式 threadKey / brief alias -> checklist focus -> 第一条 red -> 第一条线程`。3）`buildWorkspaceDocumentPayload(...)` 现会先构造带 overview 的 `threadGroups`，再用这条共享 helper 挑 `selectedThread`，因此 execution doc 的 thread panel、focus strip workflow guidance、topbar status 和右栏线程现场终于会围绕同一条 checklist 焦点线程说话。4）这轮没有新增 route、schema 或持久化对象，只是把 async document workflow 的默认线程落点从“red-first”继续推进到“和 workspace checklist focus 同步”。
- 本轮新增完成：1）`test/workspace-docs.test.js` 已新增回归 `workspace docs default thread picker prefers checklist focus before earlier red thread`，直接故意排出“前一条是 `当前主闭环` red 线程，后一条才是 `优先回看` ready 线程”的冲突序列，并要求 docs 默认线程选择稳定命中后者。2）同一条回归还明确保住显式 `threadKey` 与 `brief:` alias 的优先级，避免共享 focus selector 后把定向打开线程的行为意外改掉。3）`rtk node --check src/task-dashboard.js`、`rtk node --check src/workspace-docs.js`、`rtk node --check test/workspace-docs.test.js` 已通过。4）定向 `rtk node --test test/workspace-docs.test.js` 当前继续 `25 / 25` 全绿；定向 `rtk node --test test/workspace-dashboard.test.js` 当前继续 `22 / 22` 全绿；全量 `rtk node --test` 当前继续 `270 / 270` 全绿。
- 本轮新增完成：5）runtime 已再次通过 `rtk npm run automation:restart` + `rtk npm run automation:status` 复验；当前仍是 `10 / 10 running`，listener 端口 `19100`，最新 `cortex-server` pid 为 `64691`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。6）真实 live browser UAT `PRJ-cortex-live-browser-execution-guide-1778437374151` 已在 `2026-05-10T18:22:57.276Z` 命中；`/workspace`、`/workspace/docs/execution`、`/workspace/docs/memory`、`/workspace/threads/...` 四条 execution-guide 场景继续通过，说明 docs execution 首屏默认线程这次收口没有带来前台回归。
- 🔴 红灯：无。这轮只是让 docs execution 默认线程选择共享 checklist focus helper，并保留显式 threadKey / brief alias 的优先级，没有改 server 写接口、没有新增持久化对象，也没有影响 runtime 编排。
- 🟡 黄灯：现在 homepage center、thread view guidance 与 docs execution 默认线程都已经开始围绕同一条 checklist focus 讲故事；后续如果继续推进，更值得看的会是 docs-side `threadPanel / focus strip workflow guidance` 是否也能进一步共享 thread-view 那层状态语气 helper，而不是继续在 docs/thread/dashboard 三处各自维护相近但独立的解释文案。
- 🟢 已推进：这轮之后，`/workspace/docs/execution` 不会再因为数组顺序先把人带进一条前排 red 线程；从 homepage、thread view 切到 async document workflow 时，首屏默认线程也会优先落到同一条 `优先回看` 焦点线程，workspace 协作面的主线叙事又少了一处分叉。

## 2026-05-10 docs thread panel / focus strip 已共享 thread-view 状态语气

- 当前任务：继续沿着上一轮的 yellow note 往前推，不只让 `/workspace/docs/execution` 首屏选中和 homepage / thread-view 一样的焦点线程，也要让 docs 右栏和 execution focus strip 用同一套状态语气明确说出这条线程当前到底是 `待分流 / 已接回执行 / 待拍板 / 执行中 / 已完成` 哪一种，而不是继续只露 workflow 原文或局部计数。
- 核心进展：1）`src/task-dashboard.js` 已新增并导出 `buildThreadGuidanceDescriptor(...)`，把 thread-view 现有的状态标签、状态说明、下一步动作和动作链接文案收成同一层 helper；`buildThreadViewGuidance(...)` 自己也已改回复用它，不再在同文件里平行维护两份语气。2）`src/workspace-docs.js` 现在会基于 `selectedThreadGroup` 直接拿到这份共享 descriptor，并把它投进 `threadPanel.stateLabel / stateSummary / stateAction`。3）docs 顶部 `topbar status` 现在会显式带出 `当前状态：...`；右栏 thread focus card 也新增了 `当前状态 / 状态说明 / 这一步处理` 三行，不再只给 `当前聚焦 / 队列概览 / signal summary`。4）`buildFocusStripWorkflowGuidance(...)` 现在会把共享状态语气并进 `execution-workflow-node` proof card；因此 execution focus strip 在继续保留 `当前节点 · Checkpoint · running` 这类节点级信息的同时，也会同步展示 `线程状态：已接回执行线程`、`状态说明：...`、`这一步处理：...`。5）这轮没有新增 route、schema 或持久化对象，只是把 docs-side thread panel 与 focus strip 再往 thread-view 那层状态机靠拢。
- 本轮新增完成：1）`test/workspace-docs.test.js` 已补 payload 合同断言，直接要求 `focus_strip_workflow_guidance.nodeStateLabel` 与 `focusStripWorkflowGuidance.nodeStateLabel` 对齐，并要求 `threadPanel.stateLabel` 与 `thread_panel.state_label` 双写一致。2）同一份测试还新增真实页面断言：execution doc 首屏必须命中 `当前状态：待拍板线程` 与 `线程状态：待拍板线程`；ready comment thread 页面必须命中 `当前状态：已接回执行线程` 与 `线程状态：已接回执行线程`。3）`rtk node --check src/task-dashboard.js`、`rtk node --check src/workspace-docs.js`、`rtk node --check test/workspace-docs.test.js` 已通过。4）定向 `rtk node --test test/workspace-dashboard.test.js` 当前继续 `22 / 22` 全绿；定向 `rtk node --test test/workspace-docs.test.js` 当前继续 `25 / 25` 全绿；全量 `rtk node --test` 当前继续 `270 / 270` 全绿。
- 本轮新增完成：5）runtime 已再次通过 `rtk npm run automation:restart` + `rtk npm run automation:status` 复验；当前仍是 `10 / 10 running`，listener 端口 `19100`，最新 `cortex-server` pid 为 `72641`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。6）真实 live browser UAT `PRJ-cortex-live-browser-execution-guide-1778438209890` 已在 `2026-05-10T18:36:53.148Z` 命中；`/workspace`、`/workspace/docs/execution`、`/workspace/docs/memory`、`/workspace/threads/...` 四条 execution-guide 场景继续通过，说明 docs thread panel / focus strip 这次收口没有带来前台回归。
- 🔴 红灯：无。这轮只是让 docs thread panel 与 execution focus strip 共享 thread-view 状态语气 helper，没有改 server 写接口、没有新增持久化对象，也没有影响 runtime 编排。
- 🟡 黄灯：现在 homepage center、thread view guidance、docs execution 默认线程、docs thread panel 与 focus strip 都已经围绕同一条 checklist focus 和同一套状态语气讲故事；后续如果继续推进，更值得看的会是 docs-side `comment focus / quick decision / source recovery` 是否也能继续共享这层 thread-state helper，而不是继续在各卡片里局部描述线程状态。
- 🟢 已推进：这轮之后，async document workflow 不再只是“选对线程”；回到 `/workspace/docs/execution` 时，顶栏、右栏和 focus strip 也会用和 thread-view 一样的中文状态告诉人这条线程现在是待拍板、已接回执行还是待分流，workspace 协作面的状态叙事又少了一层分叉。

## 2026-05-10 docs comment focus / quick decision / source recovery 已共享 thread-state helper

- 当前任务：继续沿着上一轮的 yellow note 往前推，把 docs execution 页面里还在各写各的线程状态说明继续收口，优先解决 `comment focus`、`comment thread`、`quick decision` 和 `source recovery` 这几块虽然已经处在同一线程现场里，但仍主要靠各自局部文案解释状态，导致用户在右栏、focus strip 和卡片正文之间来回切时会读到两套并行语气的问题。
- 核心进展：1）`src/workspace-docs.js` 已新增 `buildThreadStateGuidance(...)` 与 `renderThreadStateGuidanceSections(...)`，统一从 `threadPanel.stateLabel / stateSummary / stateAction` 渲染 `当前状态 / 状态说明 / 这一步处理` 三段 shared state copy。2）`renderCommentFocusCard(...)`、`renderCommentThreadCard(...)`、`renderDecisionActionCard(...)` 现在都会直接接这层 helper，因此 comment focus、评论线程卡和快速拍板卡会先显式说出线程当前是 `待拍板线程` 还是 `已接回执行线程`，再继续展示各自的评论判断 / 决策判断 / 节点级 guidance。3）`thread source recovery` 卡也已经接到同一层 helper；来源修补提示不再只给“建议处理”，还会同步带出这条线程当前的大状态、状态说明与这一步处理建议。4）这轮没有新增 route、schema 或持久化对象，只是把 docs 内剩余几张 action-heavy 卡继续和 thread-view / thread panel / focus strip 说成同一种中文状态机。
- 本轮新增完成：1）`test/workspace-docs.test.js` 已新增 scoped render 断言，直接要求 `data-comment-focus-entry`、`data-comment-thread-card` 与 `data-decision-card` 都命中 `当前状态 / 状态说明 / 这一步处理`，并且在待拍板场景中复用 `待拍板线程 + 1 条待分流评论 · 1 个红灯 + 补拍板或明确绕行动作` 这一套 shared copy。2）同一份测试还补了 ready 评论场景回归，要求 `comment focus` 与 `comment thread card` 一起命中 `已接回执行线程 + 当前有 1 条评论已经接回执行链 + 继续产生命令、Run 或 Checkpoint`。3）来源修补提示页现在也被锁住必须露出 `当前状态 / 状态说明 / 这一步处理`，避免后续 source recovery 再退回孤立文案。4）`rtk node --check src/workspace-docs.js` 与 `rtk node --check test/workspace-docs.test.js` 已通过；定向 `rtk node --test test/workspace-docs.test.js` 当前继续 `25 / 25` 全绿；定向 `rtk node --test test/workspace-dashboard.test.js` 当前继续 `22 / 22` 全绿；全量 `rtk node --test` 当前继续 `270 / 270` 全绿。
- 本轮新增完成：5）runtime 已再次通过 `rtk npm run automation:restart` + `rtk npm run automation:status` 复验；当前仍是 `10 / 10 running`，listener 端口 `19100`，最新 `cortex-server` pid 为 `77620`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。6）真实 live browser UAT `PRJ-cortex-live-browser-execution-guide-1778438681381` 已在 `2026-05-10T18:44:47.855Z` 命中；`/workspace`、`/workspace/docs/execution`、`/workspace/docs/memory`、`/workspace/threads/...` 四条 execution-guide 场景继续通过，说明 docs comment / decision / source recovery 这次收口没有带来前台回归。
- 🔴 红灯：无。这轮只是把 docs execution 里的 comment focus、quick decision、source recovery 和 comment thread card 接到同一条 thread-state helper，没有改 server 写接口、没有新增持久化对象，也没有影响 runtime 编排。
- 🟡 黄灯：现在 homepage center、thread view guidance、docs execution 默认线程、thread panel、focus strip，以及 docs 侧的 comment / decision / source recovery cards 都已经围绕同一套 checklist focus 和 thread-state 文案讲故事；后续如果继续推进，更值得看的会是 thread event summary、workflow summary 与 compose 区是否也要共享同一层 status presenter，而不是各自再长局部判断句式。
- 🟢 已推进：这轮之后，回到 `/workspace/docs/execution` 时，用户不只会在顶栏和 focus strip 读到统一状态；就连 comment focus、评论线程卡、快速拍板和来源修补提示也会沿同一套 `当前状态 / 状态说明 / 这一步处理` 继续解释现场，workspace/thread collaboration surface 的状态叙事又少了一层分叉。

## 2026-05-10 docs workflow summary / thread event summary / compose 已共享 thread-state presenter

- 当前任务：继续沿着上一轮的 yellow note 往前推，把 docs execution 里剩下几张“总览型”卡片也收口到同一套 thread-state presenter，优先解决 `任务流转`、`线程事件总览` 和 `协作输入` 虽然已经与当前线程强绑定，但正文仍主要只展示 checklist relation 或局部摘要，导致用户滚到页面中后段时又要自己把状态语气重新拼回去的问题。
- 核心进展：1）`src/workspace-docs.js` 里的 `renderThreadStateGuidanceSections(...)` 现在进一步接到了 `data-thread-workflow-card`、`data-thread-event-summary-card` 和 `data-workspace-compose-card`。2）因此 `任务流转` 卡在展示 workflow node / next action 之前，会先明确说出当前线程的大状态、状态说明与这一步处理；`线程事件总览` 不再只是事件计数和摘要，也会同步带出和 thread panel 一样的状态语气；`协作输入` 卡现在在真正发出 comment / yellow / red 动作之前，也会先解释当前线程为什么值得这样处理。3）这轮没有新增 route、schema 或持久化对象，只是把 docs execution 页中段和下段三张高频卡片继续收口到和 thread panel / focus strip / comment cards 一样的 presenter。
- 本轮新增完成：1）`test/workspace-docs.test.js` 已新增待拍板场景断言，直接要求 `data-thread-workflow-card`、`data-thread-event-summary-card` 和 `data-workspace-compose-card` 都命中 `当前状态：待拍板线程 / 状态说明：1 条待分流评论 · 1 个红灯 / 这一步处理：补拍板或明确绕行动作`。2）同一份测试还补了 ready 评论场景回归，要求这三张卡在 `已接回执行线程` 场景下也一起命中 `当前有 1 条评论已经接回执行链` 与 `继续产生命令、Run 或 Checkpoint`。3）`rtk node --check src/workspace-docs.js` 与 `rtk node --check test/workspace-docs.test.js` 已通过；定向 `rtk node --test test/workspace-docs.test.js` 当前继续 `25 / 25` 全绿；定向 `rtk node --test test/workspace-dashboard.test.js` 当前继续 `22 / 22` 全绿；全量 `rtk node --test` 当前继续 `270 / 270` 全绿。
- 本轮新增完成：4）runtime 已再次通过 `rtk npm run automation:restart` + `rtk npm run automation:status` 复验；当前仍是 `10 / 10 running`，listener 端口 `19100`，最新 `cortex-server` pid 为 `82019`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。5）真实 live browser UAT `PRJ-cortex-live-browser-execution-guide-1778439092322` 已在 `2026-05-10T18:51:35.630Z` 命中；`/workspace`、`/workspace/docs/execution`、`/workspace/docs/memory`、`/workspace/threads/...` 四条 execution-guide 场景继续通过，说明 workflow summary / event summary / compose 这次收口没有带来前台回归。
- 🔴 红灯：无。这轮只是把 docs execution 里的 workflow summary、thread event summary 和 compose 区接到同一条 thread-state presenter，没有改 server 写接口、没有新增持久化对象，也没有影响 runtime 编排。
- 🟡 黄灯：现在 docs execution 里从 thread panel、focus strip、comment / decision / source recovery cards，到 workflow summary、thread event summary、compose 卡，已经基本围绕同一套 thread-state 文案工作；后续如果继续推进，更值得看的会是 comment summary / filter status / checklist overview 是否也要统一切到同一层 presenter，而不是继续停留在 checklist-only 的解释方式。
- 🟢 已推进：这轮之后，用户在 `/workspace/docs/execution` 从页首滚到页中、再滚到协作输入区时，不会再在状态语气上断档；thread collaboration surface 的大多数关键卡片都已经共享同一套 `当前状态 / 状态说明 / 这一步处理` 叙事。

## 2026-05-10 docs execution summary / checklist / comment summary 已共享 thread-state presenter

- 当前任务：继续沿着上一轮的 yellow note 往前推，把 docs execution 里仍停留在 checklist-only 解释方式的几张总览卡收口，优先解决 `执行摘要`、`执行 Checklist`、`评论线程总览` 和 `评论筛选状态` 虽然都已经围绕当前线程组织，但滚到这些卡片时仍看不到和上方一致的线程状态句式的问题。
- 核心进展：1）`src/workspace-docs.js` 现已让 `renderExecutionChecklistCard(...)` 接受可选 `threadPanel`，并新增 `data-execution-checklist-card`，这样执行 checklist 卡也能稳定渲染 shared 的 `当前状态 / 状态说明 / 这一步处理`。2）`data-execution-summary-card`、`data-comment-summary-card`、`data-comment-filter-status` 现在也都直接接入 `renderThreadStateGuidanceSections(...)`，因此执行摘要、评论总览和筛选状态会在自身摘要之前先复用同一套 thread-state 口径。3）这轮没有新增 route、schema 或持久化对象，只是把 execution doc 里最后一批面向线程现场的 overview 卡也接到同一条 presenter。
- 本轮新增完成：1）`test/workspace-docs.test.js` 已新增待拍板场景回归，直接要求 `data-execution-summary-card`、`data-execution-checklist-card`、`data-comment-summary-card`、`data-comment-filter-status` 全部命中 `待拍板线程 + 1 条待分流评论 · 1 个红灯 + 补拍板或明确绕行动作`。2）同一份测试也新增 ready 评论场景断言，要求这四张卡在 `已接回执行线程` 下同步命中 `当前有 1 条评论已经接回执行链` 与 `继续产生命令、Run 或 Checkpoint`。3）`rtk node --check src/workspace-docs.js` 与 `rtk node --check test/workspace-docs.test.js` 已通过；定向 `rtk node --test test/workspace-docs.test.js` 当前继续 `25 / 25` 全绿；定向 `rtk node --test test/workspace-dashboard.test.js` 当前继续 `22 / 22` 全绿；全量 `rtk node --test` 当前继续 `270 / 270` 全绿。
- 本轮新增完成：4）runtime 已再次通过 `rtk npm run automation:restart` + `rtk npm run automation:status` 复验；当前仍是 `10 / 10 running`，listener 端口 `19100`，最新 `cortex-server` pid 为 `88188`，`matchesRepoServer=true`、`matchesManagedPid=true`、`driftDetected=false`。5）真实 live browser UAT `PRJ-cortex-live-browser-execution-guide-1778439711741` 已在 `2026-05-10T19:01:55.025Z` 命中；`/workspace`、`/workspace/docs/execution`、`/workspace/docs/memory`、`/workspace/threads/...` 四条 execution-guide 场景继续通过，说明 execution summary / checklist / comment summary / filter status 这次收口没有带来前台回归。
- 🔴 红灯：无。这轮只是把执行摘要、执行 checklist、评论总览与评论筛选状态接到同一条 thread-state presenter，没有改 server 写接口、没有新增持久化对象，也没有影响 runtime 编排。
- 🟡 黄灯：现在 docs execution 里大多数 thread-facing 卡片都已经共享同一套 thread-state 文案；后续如果继续推进，更值得看的会是线程事件单卡、关联任务卡与 execution snapshot 内部说明是否也该进一步归一到同一层 presenter，而不是继续混用局部 badge / summary。
- 🟢 已推进：这轮之后，用户在 `/workspace/docs/execution` 从页首一路滚到评论分流区域时，看到的执行摘要、checklist、评论总览和筛选状态都已经和 thread panel / focus strip / action cards 使用同一套状态叙事，docs execution 的线程口径又少了一层分叉。
