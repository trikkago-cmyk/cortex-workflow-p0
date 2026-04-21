# Cortex vNext Memory Extraction Plan

最近更新：2026-04-15

## Why

当前 Cortex 已经能从 `comment / decision / checkpoint / receipt / suggestion` 里提炼出 candidate memory。

但这套提炼逻辑还存在两个问题：

- 抽取规则和 v2 的知识编译架构还没有完全对齐
- “抽什么”“先抽成什么”“什么时候才能进入长期知识”还不够清楚

这份文档只解决一个问题：

- 把 **现在 Cortex 的 memory 应该怎么 extract** 说清楚

## Context

从 2026-04-15 起，Cortex 的 memory 解释采用 v2 架构：

- `Raw / Source / Topic / Query` 是知识层
- `candidate / approved / rejected / archived` 是生命周期
- `Governance` 是横切治理层
- Cortex 主端是唯一真相源
- Obsidian / Notion 是映射层，不是主源

当前实现仍保留兼容字段：

- `memory_items.layer = base_memory | timeline | knowledge`
- `memory_items.status = candidate | durable | archived | rejected`
- `memory_items.review_state = pending_accept | accepted | rejected | needs_followup`

所以本规划同时服务两个目标：

1. 给当前 extractor / projector 明确规则
2. 给后续 `Source / Topic / Query` 真正拆对象做过渡设计

## What

这份规划定义：

- 什么原始对象允许进入 extract 流程
- 每类输入默认抽成 `Source / Topic / Query` 里的哪一层
- 哪些情况只能抽成 `Source candidate`
- 哪些情况允许继续编译成 `Topic candidate`
- 什么字段必须保留，什么字段缺失时一律不晋升
- review / dedupe / conflict / projection 的最小闭环

---

## 1. 一句话定义

Memory extract 不是“从一句话里猜规则”。

它是一个受治理的知识编译入口：

1. 先接收 `Raw`
2. 再抽成 `Source candidate`
3. 通过 review / 聚合后编译成 `Topic candidate`
4. 必要时再生成 `Query candidate`
5. 审批后才允许进入默认挂载或外部映射

默认原则：

- **先抽 Source，后编 Topic，最后才编 Query**

---

## 2. 目标与非目标

### 2.1 目标

- 让 Cortex 能稳定从原始事件中提炼知识，而不是只存聊天记录
- 让每条抽取结果都可追溯、可审查、可拒绝、可重编译
- 让未来 agent 默认挂载的是经过审查的 Topic，而不是零散原话
- 让 Obsidian / Notion 的知识页面都能回链到 Cortex 主端

### 2.2 非目标

- 不追求第一期就把所有 Raw 都自动编成 Topic
- 不允许“上传文档即自动生效”为长期规则
- 不把 Query 当聊天缓存
- 不把 Obsidian 页面当主真相源

---

## 3. 术语

### Raw

原始输入对象。只保真，不做最终结论。

### Source candidate

从单条或少量 Raw 中抽取出的结构化知识候选。

它回答的是：

- 这条原始输入到底说了什么
- 证据在哪
- 适用范围和风险是什么

### Topic candidate

从多个 Source candidate 综合出的主题结论候选。

它回答的是：

- 当前系统对某一主题的最佳解释是什么
- 是否存在冲突、例外、待确认项

### Query candidate

从 Topic / Source 编译出的复用问答候选。

它回答的是：

- 一个高频问题现在应该怎么答
- 答案证据回链到哪里

### Governance

对全部知识层生效的治理能力：

- 权限
- 审批
- 版本
- 审计
- 冲突
- 复核

---

## 4. 核心原则

### 4.1 抽取优先，不要过早结论

- Raw 可以被结构化
- 但不能因为一句带“必须 / 默认 / 直接”就自动成为 durable rule
- 默认先产出 `Source candidate`

### 4.2 单一来源只能先说“这条来源表达了什么”

- 一条 comment
- 一次 decision
- 一次 checkpoint

这些都更适合作为 `Source candidate` 的输入，而不是直接变成 Topic。

### 4.3 Topic 必须来自聚合，不来自单条直觉

只有满足下面任一条件，才允许从 Source 往 Topic 编译：

- 同类 Source 重复出现 >= 2 次
- 单条 Source 本身就是正式拍板或正式规范
- 有明确 owner / scope / effective_at / approval_status
- 有人工 review 明确 accept 为 Topic

### 4.4 Query 必须回链 Topic / Source

- Query 不能直接从 session answer 反推生成
- Query 也不能脱离证据单独存在

### 4.5 先治理，后挂载

没有下面字段的内容，不允许作为默认挂载知识：

- `source_type`
- `source_ref`
- `scope`
- `permission_level`
- `approval_status`
- `reviewed_at`

---

## 5. 分层策略

## 5.1 统一规则

每条 Raw 进入 extractor 后，必须先回答 3 个问题：

1. 这条输入有没有知识价值？
2. 如果有，先应该落成 `Source / Topic / Query` 的哪一层？
3. 这条内容现在处于什么生命周期状态？

默认决策：

- **层级默认值：`Source`**
- **生命周期默认值：`candidate`**

## 5.2 不同层的进入门槛

### 进入 Source candidate 的门槛

满足任一项即可：

- 有清晰事实表达
- 有可引用原文
- 有明确事件结果
- 有明确建议 / 拍板 / 复盘结论

### 进入 Topic candidate 的门槛

至少满足下面 4 条中的 2 条：

- 同主题 Source 重复出现 >= 2 次
- 影响范围跨模块 / 跨角色 / 跨项目
- 明确是规则、流程、原则、模式
- 有人类 review 明确要求提升为 Topic

并且必须满足：

- 可追溯到一个或多个 Source

### 进入 Query candidate 的门槛

必须同时满足：

- 问题是高频或明确会复用
- 已经有 `approved Topic` 或足够稳定的 `approved Source`
- 答案可以通过模板化方式重建

---

## 6. 输入对象抽取矩阵

## 6.1 Comment

默认抽取：

- `Source candidate`

允许升级为 Topic candidate 的条件：

- 同类表达重复出现 >= 2 次
- 或 comment 来自明确 owner 且属于长期协作原则

常见结果：

- 协作偏好
- 审美判断
- 明确流程红线

禁止事项：

- 单条 comment 不直接变 `approved Topic`

## 6.2 Decision

默认抽取：

- `Source candidate`

允许升级为 Topic candidate 的条件：

- decision `status in (approved, resolved)`
- 且影响范围是跨模块 / 长期有效 / 明确规则化

常见结果：

- 流程规则
- 架构边界
- 协作准则

禁止事项：

- 未拍板 decision 不进入 Topic

## 6.3 Checkpoint

默认抽取：

- `Source candidate`

允许升级为 Topic candidate 的条件：

- checkpoint `status = passed`
- 且 evidence 证明“已验证、可复用、可迁移”

常见结果：

- 模式验证
- 路由方法
- 编排范式

禁止事项：

- 只有“做过”没有“验证证据”的 checkpoint，不升级

## 6.4 Receipt / Incident

默认抽取：

- `Source candidate`

允许升级为 Topic candidate 的条件：

- 事故已复盘
- 有明确 guardrail / fix pattern

常见结果：

- 失败案例
- 风险模式
- 事故防线

禁止事项：

- 失败事实不等于长期规则

## 6.5 Suggestion

默认抽取：

- `Source candidate`

允许升级为 Topic candidate 的条件：

- suggestion 已 `accepted`
- 或 `rejected` 但 rejection 本身形成稳定边界

常见结果：

- 编辑策略
- review 规范
- 不应采用的模式

禁止事项：

- 未经处理的 suggestion 不生成 Topic

## 6.6 Task Brief

默认抽取：

- 不直接进入长期 Topic
- 只允许生成 `Source candidate`

适合抽取：

- Why / Context / What
- 当前任务范围
- 当前任务边界

禁止事项：

- 不把 task brief 当成长期规则

## 6.7 External Docs / Meeting Notes

默认抽取：

- `Source candidate`

允许升级为 Topic candidate 的条件：

- 文档为正式规范
- 有版本、owner、scope、effective_at
- 已完成 review

禁止事项：

- 无版本、无 owner、无权限标签的外部材料不能直升长期 Topic

---

## 7. 标准抽取流水线

### Step 1：Raw ingest

输入对象先作为 Raw 入库，必须保留：

- 原文
- 来源
- 时间
- source_ref
- source_url
- payload / evidence

### Step 2：Normalize

做最小清洗：

- whitespace normalize
- 字段归一
- 状态归一
- 术语归一

但不能：

- 覆盖原文
- 丢掉证据

### Step 3：Extract Source candidate

从 Raw 提炼：

- `title`
- `summary`
- `quote_text`
- `source_type`
- `source_ref`
- `compiled_tier = source`
- `target_tier = source | topic`

这一步的原则：

- 只说“原文表达了什么”
- 不抢先把内容写成“系统最终规则”

### Step 4：Dedupe and cluster

对 Source candidate 做两类处理：

- 事件级去重
- 语义级聚类

事件级去重依赖：

- `source_type + source_ref + variant`

语义级聚类依赖：

- 主题键
- 规则键
- 作用域键

### Step 5：Review gate

所有 candidate 默认进 review。

review 只做 4 种动作：

- `accept_source`
- `promote_to_topic`
- `reject`
- `needs_followup`

### Step 6：Compile Topic candidate

满足升级条件的 Source 才能进入 Topic candidate。

Topic candidate 必须补齐：

- 当前最佳解释
- scope
- owner
- conflict list
- exception list
- open questions
- supporting source refs

### Step 7：Compile Query candidate

只从稳定 Topic / Source 生成。

Query candidate 必须补齐：

- canonical question
- canonical answer
- answer scope
- evidence refs
- expiration / revalidation rule

### Step 8：Publish projection

只有 `approved Source / Topic / Query` 才允许投影到：

- Notion
- Obsidian
- 任务挂载上下文

---

## 8. 元数据要求

## 8.1 Source candidate 必填

- `source_type`
- `source_ref`
- `quote_text`
- `summary`
- `compiled_tier = source`
- `approval_status`
- `permission_level`
- `scope`
- `created_at`

## 8.2 Topic candidate 必填

- `topic_key`
- `supporting_sources`
- `best_explanation`
- `scope`
- `owner`
- `approval_status`
- `reviewed_at`
- `version`
- `permission_level`

## 8.3 Query candidate 必填

- `query_key`
- `canonical_question`
- `canonical_answer`
- `topic_refs`
- `source_refs`
- `approval_status`
- `reviewed_at`
- `permission_level`

---

## 9. 当前代码与 v2 的落地映射

当前阶段先不立刻拆新表，采用兼容方案：

- `memory_items`
  - 暂时承载 `Source / Topic / Query` candidate
- `memory_sources`
  - 承载证据链
- `metadata_json.compiled_tier`
  - 标记当前抽取产物属于哪一层
- `metadata_json.target_tier`
  - 标记下一步预期升级方向
- `memory_items.layer`
  - 保留为兼容挂载桶位，不再当成新的知识分层

当前 extractor 的 immediate policy：

- comment -> `compiled_tier = source`, `target_tier = topic`
- checkpoint -> `compiled_tier = source`, `target_tier = topic`
- approved cross-module decision -> `compiled_tier = source`, `target_tier = topic`
- local decision / incident -> `compiled_tier = source`, `target_tier = source`
- accepted / rejected suggestion -> `compiled_tier = source`, `target_tier = topic`

这意味着：

- 现在系统已经有“抽成 Source candidate”的基础
- 但还没有真正独立的 Topic compiler 和 Query compiler

---

## 10. 不该抽什么

以下情况默认不进入 extract：

- 纯寒暄
- 一次性情绪表达
- 没有事实也没有规则价值的状态噪音
- 无法识别来源的转述
- 权限边界不明且不能自动降级的敏感内容

以下情况只保留 Raw，不升级：

- 证据不足
- 说法互相冲突但尚未标记冲突
- 范围不明
- owner 不明
- 未明确是否长期有效

---

## 11. Review 规则

### 11.1 默认规则

- 任何 extract 结果默认都是 `candidate`
- 没有人工 review 或强规则审查，不允许成为默认挂载知识

### 11.2 接受条件

Source accept 条件：

- 摘取准确
- 证据完整
- 范围明确
- 权限明确

Topic accept 条件：

- 至少有 1 个有效 Source 支撑
- 最佳解释清楚
- 冲突 / 例外 / 待确认项已标出
- 具备默认挂载价值

Query accept 条件：

- 问题稳定
- 答案可重建
- 回链完整
- 适用范围清楚

### 11.3 拒绝条件

- 抽取过度推断
- 证据不成立
- 范围错配
- 与已批准 Topic 冲突但未处理

---

## 12. 实施顺序

### Phase 1：把现有 extractor 明确限定为 Source extractor

目标：

- 停止语义漂移
- 不再口头上把当前 candidate 说成“已经是长期知识”

动作：

- 所有 extractor 输出都带 `compiled_tier`
- projector 默认把它们送到 Source review

### Phase 2：增加 Topic compiler

目标：

- 从多个 Source 编译 Topic candidate

动作：

- 建立 topic_key
- 支持 source clustering
- 支持 conflict / exception / open question

### Phase 3：增加 Query compiler

目标：

- 从 approved Topic / Source 生成复用问答

动作：

- 建 canonical question
- 建 answer template
- 建回链和复核机制

### Phase 4：补治理

目标：

- 让知识真正可运营

动作：

- 审批流
- 冲突检测
- 过期提醒
- 版本管理
- 权限过滤

### Phase 5：补映射层

目标：

- 把已批准知识投影到 Obsidian / Notion

动作：

- Obsidian Topic / Query 投影
- Notion review / memory 映射
- 只读导出接口

---

## 13. 验收标准

这份 extraction 设计算完成，至少要满足：

1. 团队能明确区分 `Source / Topic / Query` 和 `candidate / approved`
2. 当前 extractor 不再被误称为“直接生成长期 memory”
3. 每条 candidate 都有来源、证据、scope、permission、approval 状态
4. Topic 和 Query 只能从 Source / Topic 编译，而不是从聊天缓存直接生成
5. Obsidian / Notion 的任何知识页面都能回链到 Cortex 主端对象

---

## 14. 当前决定

从现在开始，Cortex 对 memory extract 的执行口径统一为：

- Raw 先入库，不直接当知识
- Extract 默认只生成 `Source candidate`
- 只有经过 review 或聚合的 Source 才能升级为 `Topic candidate`
- 只有稳定 Topic / Source 才能编译成 `Query candidate`
- Cortex 是唯一真相源
- Obsidian / Notion 是映射层
