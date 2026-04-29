# Cortex vNext Phase 1 计划

最近更新：2026-04-13

## 1. Phase 1 目标

Phase 1 不做大前台。
目标只有一个：

- 在不推翻现有 Cortex 执行内核的前提下，把 `memory 三层 + inbox 三类动作队列 + suggestion 语义` 接进当前系统

一句话：

`先把新对象模型接进现有 backend，让 Cortex 先具备 vNext 的数据和流程能力。`

---

## 2. Phase 1 范围

本期只做 backend / protocol / adapter 增强。

包含：

- 新增 memory schema
- 新增 inbox schema
- 新增 suggestion schema
- 新增 projector / projector rules
- 新增最小 API
- 增强 Notion adapter
- 补测试和验收

不包含：

- 完整 Native UI
- 大规模视觉工作台
- 完整权限后台
- 自动 curator 全自治
- 多工作区复杂治理

---

## 3. Phase 1 的 6 个关键动作

## 动作 1：补齐新对象 Schema

这是 Phase 1 的基础动作。
不先把对象建出来，后面所有 inbox / review / memory 都只是文档概念。

### 1.1 新增 `memory_items`

用途：

- 承载 `Base Memory / Timeline / Knowledge`

建议字段：

- `memory_id`
- `project_id`
- `layer`
- `type`
- `title`
- `summary`
- `status`
- `review_state`
- `confidence`
- `freshness`
- `next_step`
- `owner_agent`
- `source_count`
- `created_at`
- `updated_at`

最小枚举：

- `layer`: `base_memory | timeline | knowledge`
- `type`: `decision | preference | rule | incident | pattern | open_question`
- `status`: `candidate | durable | archived | rejected`
- `review_state`: `pending_accept | accepted | rejected | needs_followup`
- `confidence`: `high | medium | low`

### 1.2 新增 `memory_sources`

用途：

- 让每条 memory 都能追溯证据链

建议字段：

- `source_id`
- `memory_id`
- `project_id`
- `source_type`
- `source_ref`
- `source_url`
- `quote_text`
- `summary`
- `evidence_json`
- `created_at`

最小枚举：

- `source_type`: `comment | document | command | checkpoint | receipt | meeting | web_clip | report`

### 1.3 新增 `inbox_items`

用途：

- 承载 `待判断 / 待审阅 / 待处理`

建议字段：

- `item_id`
- `project_id`
- `queue`
- `object_type`
- `action_type`
- `risk_level`
- `status`
- `title`
- `summary`
- `owner_agent`
- `source_ref`
- `source_url`
- `assigned_to`
- `payload_json`
- `idempotency_key`
- `created_at`
- `updated_at`
- `resolved_at`

最小枚举：

- `queue`: `decide | review | triage`
- `object_type`: `memory | decision | result | comment | suggestion`
- `action_type`: `decide | review | respond | assign | convert`
- `risk_level`: `green | yellow | red`
- `status`: `open | snoozed | resolved | archived`

### 1.4 新增 `suggestions`

用途：

- 把“reply 一段话”升级成“可接受 / 可拒绝的改动提案”

建议字段：

- `suggestion_id`
- `project_id`
- `source_type`
- `source_ref`
- `document_ref`
- `anchor_block_id`
- `selected_text`
- `proposed_text`
- `reason`
- `impact_scope`
- `status`
- `owner_agent`
- `applied_at`
- `rejected_reason`
- `created_at`
- `updated_at`

最小枚举：

- `status`: `proposed | accepted | rejected | superseded`

### 1.5 对现有表的最小补列

建议补充：

- `commands`
  - `inbox_item_count`
  - `last_inbox_item_at`
- `decision_requests`
  - `inbox_item_id`
- `checkpoints`
  - `memory_candidate_count`
- `task_briefs`
  - `memory_context_refs`

验收：

- store migrate 可以无损升级旧库
- 新增表有索引
- 幂等键规则明确

---

## 动作 2：新增 Projector，把现有执行对象投影成 Inbox / Memory

Phase 1 的核心不是“只建表”。
而是把当前已经有的对象自动投影成新对象。

### 2.1 Inbox Projector

输入来源：

- `decision_requests`
- `commands`
- `checkpoints`
- `agent_receipts`
- `notion comments`
- `suggestions`

投影规则：

- `decision signal = red/yellow` -> `queue = decide`
- `candidate memory` -> `queue = review`
- `execution result / evaluator result` -> `queue = review`
- `plain comment / 未分派反馈` -> `queue = triage`
- `suggestion`:
  - 高风险 -> `decide`
  - 普通 -> `review`

### 2.2 Memory Projector

输入来源：

- Base Memory 变更
- 评论中稳定偏好提炼
- checkpoint 结论
- evaluator 结果
- result 验收结论

投影规则：

- 明显时序事实 -> `Timeline`
- 稳定协作原则 -> `Base Memory`
- 稳定可复用模式 -> `Knowledge`

关键限制：

- 没有 `source + evidence` 的 candidate，不允许进入 `durable`

验收：

- 同一事件重复投影不产生重复 item
- projector 可重放
- projector 失败不会破坏原始 command / decision 数据

### 2.3 哪些事件可以产生 candidate memory

不是所有事件都应该直接进 memory。

原则：

- 先有事件
- 再判断这条事件是否包含“稳定、可复用、会影响未来行为”的信号
- 满足条件才生成 `candidate memory`

推荐触发事件如下。

#### A. 人类明确表达稳定偏好或规则

来源：

- Notion 评论
- IM 指令
- 文档 review 反馈

触发条件：

- 出现明确规则词：
  - `默认`
  - `以后都`
  - `不要再`
  - `必须`
  - `统一按`
  - `这类情况直接`
- 或同类反馈重复出现 2 次以上

默认目标层：

- `Base Memory`

示例：

- “这类绿灯不要再停下来问我，直接做。”
- “同步文档只保留当前任务、进展、下一步。”

#### B. 关键决策被正式拍板

来源：

- `decision_requests.status` 进入已确认态

触发条件：

- 决策影响跨模块
- 决策会长期影响实现
- 决策会成为后续默认规则

默认目标层：

- `Knowledge`
- 若属于协作原则，也可进 `Base Memory`

示例：

- 红黄绿灯决策框架正式锁定
- Memory 三层结构正式锁定

#### C. 已验证通过的执行模式

来源：

- `checkpoint`
- `run`
- `agent_receipt`
- `execution result`

触发条件：

- 不是只做完一次
- 而是“完整跑通 + 已验证 + 值得复用”

默认目标层：

- `Knowledge`

示例：

- 外部 agent 的 `handoff + receipt` 模式验证通过
- 某种评论路由规则验证通过

#### D. 已关闭的事故 / 异常复盘

来源：

- failed command
- red alert
- incident checkpoint
- 复盘结论

触发条件：

- 已经知道根因
- 已经知道以后怎么避免

默认目标层：

- `Timeline`
- 如果能沉淀为长期 guardrail，再生成 `Knowledge` candidate

示例：

- “19100 跑着旧进程会导致代码和 live 状态漂移”
- “Notion CLI 可能卡住但不报错，不能只看进程存活”

#### E. Suggestion 被接受或拒绝且理由稳定

来源：

- `suggestions`

触发条件：

- 接受 / 拒绝的理由不是一次性口味
- 而是可泛化的编辑原则、结构原则、协作原则

默认目标层：

- `Base Memory`
- 或 `Knowledge`

示例：

- “导航必须是人可读摘要，不要机器时间标题树”
- “同一 checkpoint 的重复同步不要再追加”

#### F. 验收口径或评测标准发生稳定变化

来源：

- evaluator review
- acceptance result
- 人类 review 结论

触发条件：

- “什么算通过”发生了稳定变化
- 这会影响后续 agent 的判断

默认目标层：

- `Knowledge`

示例：

- “不是有一条表面回复就算成功，必须验证 fresh checkpoint / receipt 和 child command 闭环”

#### G. 新接入模式或协作协议验证通过

来源：

- agent onboarding
- connect config
- protocol smoke

触发条件：

- 新模式已经从协议走到真实验证
- 后续其他 agent 可以复用

默认目标层：

- `Knowledge`

示例：

- 非胖虎 agent 的标准接入 SOP
- Connect 页要求展示的最小字段集合

#### H. 人工显式提升

来源：

- 人类点击 `promote to memory`
- 或评论中明确说“这条记下来，作为以后默认规则”

触发条件：

- 人明确要求沉淀

默认目标层：

- 根据内容进入 `Base Memory / Timeline / Knowledge`

### 2.4 哪些事件不该直接产生 candidate memory

下面这些默认只进 Timeline 或根本不入 memory：

- 单纯进度汇报
- 一次性的上下文说明
- 临时问题和临时答复
- 还没验证的方案草稿
- 没有证据支撑的主观看法
- 重复噪声评论

### 2.5 Candidate Memory 生成门槛

要生成 candidate memory，至少满足下面 3 条中的 2 条：

1. 会影响未来 agent 行为
2. 具备可复用性，不是一次性事实
3. 有明确 `source` 或 `evidence`

额外硬门槛：

- 想升成 `Knowledge durable`，必须同时具备 `source + evidence`
- 想升成 `Base Memory durable`，必须是稳定偏好或稳定原则

---

## 动作 3：补最小 API

Phase 1 不需要完整前台。
但必须先有可调用 API。

### 3.1 Memory API

- `GET /memory`
- `GET /memory/:id`
- `POST /memory`
- `POST /memory/:id/review`

支持动作：

- accept
- reject
- edit_then_accept
- archive

### 3.2 Inbox API

- `GET /inbox`
- `GET /inbox/:id`
- `POST /inbox/:id/act`

支持动作：

- decide
- accept
- reject
- respond
- assign
- resolve
- snooze
- convert_to_command
- convert_to_decision

### 3.3 Suggestion API

- `GET /suggestions`
- `POST /suggestions`
- `POST /suggestions/:id/accept`
- `POST /suggestions/:id/reject`

### 3.4 Projector / Internal API

如果后面需要拆服务，建议预留：

- `POST /projectors/rebuild-inbox`
- `POST /projectors/rebuild-memory`

Phase 1 可以先做成 internal method，不急着开放 HTTP。

验收：

- API 返回对象结构稳定
- 每个动作都有幂等语义
- action 结果会回写原对象状态

---

## 动作 4：增强 Notion Adapter，但不再让 Notion 承担主内核

Phase 1 里 Notion 仍然保留。
但身份变化：

- Notion 是 `外部文档入口`
- 不是 `唯一协作控制面板`

### 4.1 评论增强

当前：

- comment -> command -> reply

Phase 1：

- comment -> triage inbox item
- 可选转成：
  - command
  - decision
  - suggestion
  - memory candidate

### 4.2 Suggestion 语义

即使 Notion 不能原生承载完整 suggestion diff，也要先在 Cortex 内部支持 suggestion 对象。

Phase 1 的折中方案：

- comment 中提取结构化 suggestion
- 在 Cortex 内部落 suggestion object
- 协作面回显时附带：
  - proposed text
  - reason
  - accept / reject 状态

### 4.3 Memory 候选提炼

- 对评论、checkpoint、result summary 做 candidate memory 提炼
- 先落 `memory_items.status = candidate`
- 同时创建 `queue = review` 的 inbox item

验收：

- 真实 Notion comment 能生成 triage inbox item
- 真实结果回写能生成 review inbox item
- 不再只有长文档同步，而是能看到结构化待办

---

## 动作 5：补最小策略与状态机

Phase 1 必须把动作后的状态后果写死。
不然 Accept / Reject 只是 UI 文案。

### 5.1 Memory 状态机

- `candidate -> durable`
- `candidate -> rejected`
- `durable -> archived`

### 5.2 Inbox 状态机

- `open -> snoozed`
- `open -> resolved`
- `open -> archived`

### 5.3 Suggestion 状态机

- `proposed -> accepted`
- `proposed -> rejected`
- `proposed -> superseded`

### 5.4 与现有对象联动

- 接受 result review -> 更新 checkpoint / command
- 决策拍板 -> 更新 `decision_requests.status`
- suggestion accept -> 更新文档适配层状态 + 关闭 inbox
- memory accept -> 写入 durable memory + 关闭 inbox

验收：

- 每个动作都有结构化后果
- 所有状态跳转可测试

---

## 动作 6：补 Phase 1 测试和验收

这是必须一起做的。

### 6.1 Store / Migration 测试

- 旧库升级
- 新表创建
- 索引存在
- 幂等插入

### 6.2 Projector 测试

- comment -> triage inbox
- decision -> decide inbox
- result -> review inbox
- candidate memory -> review inbox + memory item

### 6.3 API 测试

- `/inbox`
- `/memory`
- `/suggestions`
- act / accept / reject / resolve / snooze

### 6.4 Integration 测试

至少覆盖 4 条完整链路：

1. Notion comment -> triage inbox -> convert_to_command
2. red decision -> decide inbox -> approve
3. agent receipt result -> review inbox -> accept
4. candidate memory -> review inbox -> accept -> durable knowledge

### 6.5 Phase 1 完成标志

- store 已支持四个新对象：`memory_items / memory_sources / inbox_items / suggestions`
- 现有对象能自动投影进 inbox
- memory 三层已真实可写
- 最小 API 可用
- Notion comment 不再只是“生成 command”，而能生成 triage/review item
- 红灯决策仍然可以继续走企业 IM push
- 测试覆盖新增状态机和 projector

---

## 4. Phase 1 推荐执行顺序

1. 先改 `store.js` migration 和数据方法
2. 再补 projector 规则
3. 再补 `server.js` API
4. 再补 Notion adapter
5. 最后补测试和协议文档

原因：

- schema 不稳定时先别写 API
- API 不稳定时先别写前台
- projector 是整个 Phase 1 的胶水层，应该尽早落下来

---

## 5. Phase 1 关键风险

### 风险 1：对象太多，状态太散

控制方式：

- Inbox 一级分类只保留三类
- 所有对象状态机都收敛成最小集合

### 风险 2：Notion 适配层继续污染主内核

控制方式：

- Notion 只作为 source
- 真相源只写 Cortex store

### 风险 3：memory 候选泛滥

控制方式：

- 没有 `source + evidence` 不允许 durable
- candidate memory 默认进 review，不直接升

### 风险 4：Accept / Reject 没有真实后果

控制方式：

- 每个动作必须联动更新原对象与 inbox item

---

## 6. 一句话收口

Phase 1 最关键的不是做界面。

而是三件事：

1. 把 `memory / inbox / suggestion` 变成正式对象
2. 把现有 `comment / decision / result / checkpoint` 投影进这些对象
3. 把 `accept / reject / decide / resolve` 变成有真实后果的结构化动作
