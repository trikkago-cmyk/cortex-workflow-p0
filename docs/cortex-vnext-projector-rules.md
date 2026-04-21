# Cortex vNext Projector 规则表

最近更新：2026-04-13

当前已接入的安全规则：

- `4.1 Notion Comment -> Triage Inbox`
- `4.3 Decision Request(red/yellow) -> Decide Inbox`
- `4.4 Approved Decision -> Candidate Memory`
- `4.6 Result / Receipt -> Review Inbox`
- `4.5 Passed Checkpoint -> Candidate Knowledge`
- `4.9 Suggestion Outcome -> Candidate Memory`

其余规则仍保留在设计层，等下一轮继续接。

## 1. 目的

这份文档只解决一个问题：

- 当前 Cortex 已有很多原始对象
- Phase 1 需要把这些原始对象自动投影成 `Inbox` 和 `Memory`

所以这里不再讨论产品概念。
只定义：

- 输入事件是什么
- 触发条件是什么
- 产出什么 Inbox item
- 产出什么 candidate memory
- 幂等键怎么定

---

## 2. 投影原则

### 2.1 原始对象不改语义

projector 只做投影。
不改原始对象的业务真相。

原始对象包括：

- `commands`
- `decision_requests`
- `runs`
- `checkpoints`
- `agent_receipts`
- `notion comments`
- `suggestions`

### 2.2 先投影 Inbox，再考虑 Memory

默认顺序：

1. 先判断是否需要一个待处理 item
2. 再判断是否值得提炼 candidate memory

原因：

- 不是所有待处理事项都值得进 memory
- 但所有值得沉淀的 memory，通常都值得进入 review

### 2.3 Candidate 不等于 Durable

projector 最多只生成：

- `inbox_items`
- `memory_items.status = candidate`

不直接生成 durable memory。

### 2.4 幂等键必须和“事件”绑定

projector 不能因为重复轮询或重复同步生成重复 item。

统一规则：

- 每次投影都必须以“源事件 + 投影目标”计算幂等键

推荐格式：

- `projector:{target}:{source_type}:{source_ref}:{variant}`

---

## 3. Inbox Queue 定义

Phase 1 只保留 3 个 queue：

- `decide`
- `review`
- `triage`

动作语义：

- `decide`: 人类需要拍板
- `review`: 人类需要 accept / reject / request revision
- `triage`: 人类需要接球、回复、分派、转化

---

## 4. Projector 规则

## 4.1 Notion Comment -> Triage Inbox

输入：

- `notion comment`

触发条件：

- 默认全部进入 `triage`
- 但如果评论本身已解析成高风险 suggestion 或明确决策请求，改走别的规则

产出：

- `inbox_items.queue = triage`
- `object_type = comment`
- `action_type = respond`

默认不产出 memory。

幂等键：

- `projector:inbox:notion_comment:{comment_id}:triage`

备注：

- 这是最基础投影规则
- 让评论不再只会生成 command

## 4.2 Notion Comment -> Candidate Memory

输入：

- `notion comment`

触发条件：

- 命中稳定偏好/稳定规则信号
- 或同类反馈已重复 >= 2 次

产出：

- `memory_items.status = candidate`
- 默认：
  - 协作偏好 -> `layer = base_memory`
  - 稳定方法论 -> `layer = knowledge`

同时产出：

- `inbox_items.queue = review`
- `object_type = memory`
- `action_type = review`

幂等键：

- memory:
  - `projector:memory:notion_comment:{comment_id}:{layer}`
- inbox:
  - `projector:inbox:notion_comment:{comment_id}:memory_review`

## 4.3 Decision Request(red/yellow) -> Decide Inbox

输入：

- `decision_requests`

触发条件：

- `signal_level in ('yellow', 'red')`
- `status in ('proposed', 'needs_review')`

产出：

- `inbox_items.queue = decide`
- `object_type = decision`
- `action_type = decide`

默认不产出 memory。

幂等键：

- `projector:inbox:decision:{decision_id}:decide`

## 4.4 Approved Decision -> Candidate Memory

输入：

- `decision_requests`

触发条件：

- decision 已被正式确认
- 且该决策长期影响实现、流程或协作方式

产出：

- `memory_items.status = candidate`
- 默认：
  - 技术/流程规则 -> `knowledge`
  - 协作原则 -> `base_memory`

同时产出：

- `inbox_items.queue = review`
- `object_type = memory`
- `action_type = review`

幂等键：

- memory:
  - `projector:memory:decision:{decision_id}:{layer}`
- inbox:
  - `projector:inbox:decision:{decision_id}:memory_review`

## 4.5 Passed Checkpoint -> Candidate Knowledge

输入：

- `checkpoints`

触发条件：

- `status = passed`
- 且 summary / evidence 表示“模式已验证、值得复用”

产出：

- `memory_items.status = candidate`
- `layer = knowledge`

同时产出：

- `inbox_items.queue = review`
- `object_type = memory`
- `action_type = review`

幂等键：

- memory:
  - `projector:memory:checkpoint:{checkpoint_id}:knowledge`
- inbox:
  - `projector:inbox:checkpoint:{checkpoint_id}:memory_review`

## 4.6 Result / Receipt -> Review Inbox

输入：

- `agent_receipts`
- `command done`

触发条件：

- command 完成
- 或外部 agent receipt `status = completed`

产出：

- `inbox_items.queue = review`
- `object_type = result`
- `action_type = review`

默认不直接产出 memory。

幂等键：

- receipt:
  - `projector:inbox:receipt:{receipt_id}:result_review`
- command:
  - `projector:inbox:command:{command_id}:result_review`

备注：

- 一个 command 只应该有一个当前活跃 result review item
- 如果 receipt 多次到来，应更新同一 item，而不是重复新增

## 4.7 Closed Incident -> Timeline Memory Candidate

输入：

- `failed commands`
- `red receipts`
- `incident checkpoints`

触发条件：

- 问题已经定位根因
- 已有明确规避方式或 guardrail

产出：

- `memory_items.status = candidate`
- 默认 `layer = timeline`
- 如果可复用为 guardrail，再额外生成 `knowledge` candidate

同时产出：

- `inbox_items.queue = review`
- `object_type = memory`
- `action_type = review`

幂等键：

- timeline memory:
  - `projector:memory:incident:{source_ref}:timeline`
- knowledge memory:
  - `projector:memory:incident:{source_ref}:knowledge`

## 4.8 Suggestion Proposed -> Review Inbox

输入：

- `suggestions`

触发条件：

- `status = proposed`

产出：

- 普通 suggestion:
  - `queue = review`
  - `object_type = suggestion`
  - `action_type = review`
- 高风险 suggestion:
  - `queue = decide`
  - `object_type = suggestion`
  - `action_type = decide`

幂等键：

- `projector:inbox:suggestion:{suggestion_id}:{queue}`

## 4.9 Suggestion Accepted / Rejected -> Candidate Memory

输入：

- `suggestions`

触发条件：

- `status in ('accepted', 'rejected')`
- 且原因可以泛化成稳定原则

产出：

- `memory_items.status = candidate`
- 默认：
  - 写作/协作偏好 -> `base_memory`
  - 可复用编辑规则 -> `knowledge`

同时产出：

- `inbox_items.queue = review`
- `object_type = memory`
- `action_type = review`

幂等键：

- memory:
  - `projector:memory:suggestion:{suggestion_id}:{layer}`
- inbox:
  - `projector:inbox:suggestion:{suggestion_id}:memory_review`

## 4.10 Evaluator Review -> Review Inbox / Knowledge Candidate

输入：

- evaluator result
- quality review checkpoint

触发条件：

- 出现稳定验收口径变化
- 或某条评测结论值得沉淀

产出：

- review inbox:
  - `queue = review`
  - `object_type = result`
  - `action_type = review`
- 如命中稳定口径：
  - `memory_items.status = candidate`
  - `layer = knowledge`

幂等键：

- inbox:
  - `projector:inbox:evaluator:{source_ref}:review`
- memory:
  - `projector:memory:evaluator:{source_ref}:knowledge`

## 4.11 Agent Onboarding Verified -> Knowledge Candidate

输入：

- connect / onboarding validation result

触发条件：

- 某种 agent 接入模式走通
- 后续其他 agent 可复用

产出：

- `memory_items.status = candidate`
- `layer = knowledge`

同时产出：

- `inbox_items.queue = review`
- `object_type = memory`
- `action_type = review`

幂等键：

- memory:
  - `projector:memory:onboarding:{source_ref}:knowledge`
- inbox:
  - `projector:inbox:onboarding:{source_ref}:memory_review`

## 4.12 Manual Promote -> Candidate Memory

输入：

- 人工显式提升动作

触发条件：

- 人点选“promote to memory”
- 或明确指令“这条记下来”

产出：

- `memory_items.status = candidate`
- `layer` 由人工指定

同时产出：

- `inbox_items.queue = review`

幂等键：

- `projector:memory:manual:{source_ref}:{layer}`

---

## 5. 不应投影成 Candidate Memory 的事件

默认排除：

- 单纯状态播报
- 没有可复用价值的临时答复
- 只包含情绪、不包含规则的反馈
- 没有 evidence 的空泛判断
- 重复同步噪声

这些事件可以：

- 只进 `triage`
- 只保留原始 comment / checkpoint
- 或只更新 execution doc，不生成 memory

---

## 6. Candidate Memory 最小门槛

至少满足 3 条中的 2 条：

1. 会影响未来 agent 行为
2. 具备可复用性，不是一次性事实
3. 具备 `source` 或 `evidence`

额外规则：

- 想进入 `knowledge durable`，必须有 `source + evidence`
- 想进入 `base_memory durable`，必须属于稳定偏好、稳定规则或稳定原则

---

## 7. 实现建议

Phase 1 不建议把 projector 做成一次性脚本。
建议做成可重放的纯函数或 service：

- `projectInboxItem(event)`
- `projectMemoryCandidate(event)`

这样后面可以：

- 事件触发时即时投影
- 历史数据全量重放
- 回归测试时单独测试规则

---

## 8. 一句话收口

Projector 的核心不是“把所有东西都写进 memory”。

而是：

`把值得人类判断、值得人类审阅、值得长期沉淀的信号，从原始执行对象里筛出来。`
