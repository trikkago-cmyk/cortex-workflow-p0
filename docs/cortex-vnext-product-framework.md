# Cortex vNext 产品框架

最近更新：2026-04-13

## 1. Why / Context / What

### Why

Cortex 现在的问题不是“没有执行能力”。
问题是执行内核已经有了，但产品层还太弱。

当前体验主要依赖：

- Notion 作为 review 面板
- 评论轮询作为任务入口
- 文档同步作为进度展示

这套方式能跑，但不够像一个稳定产品。

短板主要在四个地方：

- memory 还是“共享文本”，不是“可治理资产”
- review 还是“文档汇报”，不是“待处理队列”
- 文档协同还是“reply”，不是“suggestion + accept / reject”
- agent 接入还是“协议文档”，不是“可操作 onboarding”

### Context

当前 Cortex 已有能力：

- `task_briefs`：任务简报，承载 `Why / Context / What`
- `commands / decision_requests / runs / checkpoints`：执行内核
- `outbox / agent_receipts`：通知与双向回执
- `agent registry + executor workers`：多 agent 路由
- `notion comment -> command -> reply`：异步协作链路
- `green / yellow / red`：决策升级框架

所以 vNext 不是推翻重做。
而是在现有执行内核之上，补齐产品抽象和治理层。

### What

vNext 的目标不是做一个更花的工作台。

而是把 Cortex 升级成一套完整的多 agent 协作系统：

- 底层是执行中枢
- 中间是 memory 治理
- 上层是 review inbox 和文档协同
- 入口是统一的 agent connect / onboarding

---

## 2. 产品定位

Cortex vNext 是一个面向 human-in-the-loop 多 agent 协作的执行中枢。

它解决四件事：

1. 多个 agent 在同一个项目里共享状态，不各自失忆
2. 人类不需要盯着每个 agent 聊天窗口巡逻，只在 inbox 里处理必要事项
3. 稳定记忆可以被提炼、审阅、接受、拒绝，而不是越堆越乱
4. 高风险事项通过红灯机制升级到企业 IM，低风险事项保持异步静默推进

一句话定义：

`Cortex = 执行内核 + Memory 治理 + Review Inbox + Agent Connect`

---

## 2.1 Cortex 与 Harness Engineering 的关系

Cortex vNext 可以直接按 Harness Engineering 的思路设计。

但要翻译成多 agent 协作语境。

不是照搬代码仓库里的：

- lint
- compiler
- unit test

而是把 Harness 改写成：

- 告知层：`task_briefs + Base Memory + Knowledge + onboarding`
- 约束层：`红黄绿灯 + inbox queue + suggestion accept/reject + evidence/source`
- 验证层：`runs + checkpoints + receipts + memory freshness + inbox backlog`
- 纠正层：`push / defer / accept / reject / retry / re-route`

更完整的拆解见：

- [docs/cortex-vnext-harness-architecture.md](./cortex-vnext-harness-architecture.md)

---

## 3. vNext 四层结构

## 3.1 执行内核层

职责：

- 接收任务
- 分派 agent
- 记录执行状态
- 触发红黄绿决策
- 发通知
- 收回执

保留现有对象：

- `task_briefs`
- `commands`
- `decision_requests`
- `runs`
- `checkpoints`
- `outbox`
- `agent_receipts`

这一层继续是 Cortex 的核心优势。
不做推翻。

## 3.2 Memory 治理层

把当前“共享 memory 文档”升级成三层模型。

### Base Memory

定义：

- 稳定协作偏好
- 稳定工程审美
- 稳定产品原则
- 稳定角色边界

特点：

- 低频修改
- 高复用
- 直接影响所有新任务和新 agent

示例：

- 红黄绿灯决策规则
- 沟通偏好
- 工程审美
- 产品判断原则

### Timeline

定义：

- 按时间产生的事实、判断、checkpoint、异常、回执、评论结论

特点：

- 强时序
- 可回看
- 不要求都进入长期资产层

示例：

- 某次 red decision 的来龙去脉
- 某次真实验证结果
- 某条评论引发的策略变化

### Knowledge

定义：

- 从 Timeline 和文档中提炼出的稳定方法、模式、规则、可复用资产

特点：

- 不是流水账
- 需要被 curator / reviewer 接受
- 用于跨项目复用

示例：

- 外部 agent onboarding 模式
- Notion 评论路由模式
- 红灯升级模板
- 记忆治理准则

关于 `raw material -> candidate -> durable` 的完整沉淀流程，见：

- [docs/cortex-vnext-memory-pipeline.md](./cortex-vnext-memory-pipeline.md)

## 3.3 Review Frontend 层

把当前“执行文档 + 评论线程”的模式升级成明确的待处理队列。

核心不是再写更长的文档。
而是让人类一眼看到现在需要处理什么。

Inbox 的一级分类不按“对象类型”分。
而按“人类下一步动作”分。

原因：

- 人打开 inbox，不是来理解底层对象模型的
- 人只关心自己下一步该做什么
- 如果把“记忆 / 评论 / 决策 / 结果”直接并列，会把对象类型和动作类型混在一起
- 这样会造成“待拍板决策”和“待验收执行结果”看起来重复

每一条 inbox item 都必须有：

- 类型
- 来源
- 当前状态
- owner agent
- 风险等级
- 建议动作
- 跳转目标

## 3.4 Connect / Onboarding 层

把现在“读接入文档 + 改 JSON + 重启 automation”的过程，升级成统一接入入口。

Connect 页至少要承载：

- agent 名称
- 别名
- 模式：同步 webhook / handoff + receipt
- webhook / callback 配置
- token / 鉴权
- 权限与作用域
- 最后一次心跳
- 最后一次回执
- 当前状态

---

## 4. Memory 数据模型升级

每条 memory 都不再只是文字。
而是治理对象。

最小字段：

- `memory_id`
- `layer`
- `type`
- `title`
- `summary`
- `status`
- `source`
- `evidence`
- `confidence`
- `freshness`
- `related_memory`
- `next_step`
- `owner_agent`
- `review_state`
- `created_at`
- `updated_at`

字段说明：

- `layer`：`base_memory | timeline | knowledge`
- `type`：`decision | preference | rule | incident | pattern | open_question`
- `status`：`candidate | durable | archived | rejected`
- `source`：来源对象列表，指向评论、文档、command、checkpoint、meeting、web clip
- `evidence`：支持这条 memory 的原始摘录、事实或链接
- `confidence`：`high | medium | low`
- `freshness`：这条 memory 上次被验证的时间或状态
- `related_memory`：相关 memory id 列表
- `next_step`：下一步动作或复核条件
- `review_state`：`pending_accept | accepted | rejected | needs_followup`

治理原则：

- 没有 `source` 和 `evidence`，不能直接升成 durable knowledge
- Timeline 默认可以多，但 Knowledge 默认要少
- Base Memory 的修改必须有审计记录
- 被 reject 的 memory 不能消失，必须可追溯

---

## 5. Review Inbox 设计

Inbox 的分类依据只有一个：

- `人类此刻需要做的动作`

对象类型是二级字段，不是一级 tab。

推荐的一级分类只保留 3 类：

- 待判断
- 待审阅
- 待处理

每条 item 再额外带：

- `object_type`
- `source_type`
- `risk_level`
- `action_type`

示例：

- 一条 candidate memory
  - `object_type = memory`
  - `action_type = review`
- 一条 red decision
  - `object_type = decision`
  - `action_type = decide`
- 一条普通评论追问
  - `object_type = comment`
  - `action_type = respond`
- 一条执行完成结果
  - `object_type = result`
  - `action_type = review`

## 5.1 待判断

来源：

- `yellow / red` decision request
- 两条方案都能做，但需要人类拍板
- 高风险 suggestion
- 即将进入不可逆步骤前的确认项

人类动作：

- Approve
- Choose A / B / C
- Improve
- Stop
- Defer

结果：

- 更新 decision 状态
- 继续执行或挂起执行
- red 情况继续同步企业 IM 与 review 记录

判断标准：

- 这类 item 的关键不是“看一眼是否通过”
- 而是“人必须给方向”

## 5.2 待审阅

来源：

- candidate memory
- 文档 suggestion
- execution result
- evaluator review
- 需要 accept / reject 的 agent 产物

人类动作：

- Accept
- Reject
- Edit then Accept
- Request Revision
- Resolve
- Snooze

结果：

- candidate memory -> 升入 Base Memory / Knowledge，或 reject
- suggestion -> 应用改动，或 reject
- result -> 验收通过，或打回重做

判断标准：

- 这类 item 的共同点是：
  `agent 已经给出了一个候选产物，人来做审阅和收口`

## 5.3 待处理

来源：

- 普通评论
- 需要补充上下文的问题
- 需要分派 owner 的线程
- 需要简单回复后收口的反馈
- 不构成 suggestion / decision / result review 的交互

人类动作：

- Reply
- Assign
- Convert to Command
- Convert to Decision
- Resolve
- Ignore

结果：

- 生成 command
- 转成 decision
- 直接收口 discussion

判断标准：

- 这类 item 还没有进入“候选产物待审阅”阶段
- 本质上是需要人先接一下球

## 5.4 为什么“待拍板决策”和“待验收执行结果”不该并列

因为它们混了两种不同维度：

- `待拍板决策`
  - 是按动作类型分的
  - 人类要做的是“判断 / 选方向”
- `待验收执行结果`
  - 也是按动作类型分的
  - 人类要做的是“审阅 / 接受 / 打回”

它们都不是对象类型。
所以如果 Inbox 真的按动作来分，正确做法不是把它们并列成两个 tab。
而是：

- 决策进 `待判断`
- 执行结果进 `待审阅`

这样一眼就能明白：

- `待判断` = 我要拍板
- `待审阅` = 我要验收 / 接受 / 拒绝
- `待处理` = 我要回复 / 分派 / 转任务

---

## 6. 文档协同升级

当前模式：

- comment
- reply

vNext 模式：

- comment
- suggestion
- accept
- reject
- resolve

## 6.1 Comment

语义：

- 提问题
- 给反馈
- 提任务

Comment 不代表一定要改文档。

## 6.2 Suggestion

语义：

- 提出一个具体可应用的改动

Suggestion 必须带：

- 原文定位
- 建议改写内容
- 建议理由
- 影响范围

## 6.3 Accept / Reject

语义：

- `Accept`：采纳 suggestion，应用变更，并更新相关状态
- `Reject`：不采纳 suggestion，但保留拒绝原因

重要原则：

- Accept / Reject 不只是 UI 反馈
- 必须产生结构化后果

例如：

- 更新文档正文
- 更新 memory review state
- 关闭 inbox item
- 新增或关闭 command

## 6.4 Resolve

语义：

- 该线程已经处理完成
- 不再需要继续行动

Resolve 不等于 Accept。
它只是关闭讨论。

---

## 7. Agent Connect 设计

Connect 不是“协议说明页”。
它是 agent 的接入控制台。

最小能力：

- 创建 agent
- 选择接入模式
- 配 webhook / callback
- 配 token
- 配 role / scope
- 查看最近命令
- 查看最近回执
- 查看在线状态
- 查看失败原因

推荐支持两种接入模式：

### 模式 A：同步执行

适合：

- 短任务
- 一次 webhook 就能完成

返回：

- `done / failed`
- `reply_text`
- `result_summary`

### 模式 B：异步 handoff + receipt

适合：

- 企业 IM
- 长任务
- 外部 workflow

流程：

- Cortex 先 handoff
- 外部 agent 再回 receipt
- receipt 进入 run / checkpoint / inbox

---

## 8. 人类判断与智能体执行边界

必须人工判断：

- Base Memory 的关键修改
- Knowledge durable 化
- red 决策拍板
- suggestion 的 accept / reject
- 执行结果最终验收

可由 agent 自动执行：

- 绿灯任务推进
- 评论扫描与路由
- candidate memory 提炼
- Timeline 记录
- 执行结果回执 / 协作面回显
- yellow item 入 inbox

需要升级人工：

- 高风险异常
- 权限 / 安全问题
- 即将进入不可逆步骤
- memory durable 化时证据不足但影响面大

---

## 9. vNext 首页结构

建议的产品信息架构：

- Workspace
- Inbox
- Docs
- Memory
- Activity
- Connect

模块职责：

- `Workspace`：项目空间与对象总览
- `Inbox`：待处理事项队列
- `Docs`：正文、评论、suggestion 协同
- `Memory`：Base Memory / Timeline / Knowledge
- `Activity`：人和 agent 的行为流水
- `Connect`：agent onboarding 与状态管理

---

## 10. 与当前 Cortex 的关系

保留：

- 执行内核对象模型
- 红黄绿灯机制
- outbox / receipt
- Notion comment scan
- agent registry
- executor worker pool

新增：

- memory 三层
- memory 治理字段
- review inbox
- suggestion accept / reject 语义
- connect 控制台

替换：

- “长文档汇报为主” -> “Inbox 队列为主，文档为辅”
- “memory 共享文档” -> “memory 资产层 + 审阅状态”
- “协议文档接入” -> “Connect onboarding”

---

## 11. 分阶段路线

## Phase 1：不换内核，只补结构

目标：

- 在当前 SQLite 与 Notion 适配层上先补齐数据结构和产品抽象

本期交付：

- memory 三层 schema
- inbox item schema
- comment / suggestion / accept / reject 语义
- connect 配置模型

## Phase 2：先做可用前台，不急着全量原生化

目标：

- 先把“待处理队列 + memory 视图 + connect 视图”做出来

本期交付：

- Inbox 页面
- Memory 页面
- Connect 页面
- 文档 suggestion 操作流

## Phase 3：把 Notion 从主操作面板降级成外部协作入口

目标：

- Cortex 自己成为主控制面板
- Notion 继续作为外部内容载体和评论入口之一

本期交付：

- Native doc review
- Native inbox action
- Native memory review

---

## 12. P0 范围建议

如果只做一版最小可用产品，不要一次上全部。

P0 只收下面 7 件事：

1. 保留现有执行内核
2. 新增 memory 三层与治理字段
3. 新增 inbox 三类 action queue：`待判断 / 待审阅 / 待处理`
4. 每条 inbox item 增加 `object_type + action_type + risk_level`
5. 把文档交互升级成 `comment + suggestion + accept/reject`
6. 新增 connect onboarding 基础页
7. 红灯决策继续走企业 IM push

P0 不做：

- 复杂的多工作区权限矩阵
- 自动 curator 全自治
- 高级 dashboard 美化
- 太多 memory 子层级
- 太多 doc 类型

---

## 13. 关键不变量

- 执行真相源仍然是 Cortex，不是前台页面
- 红灯必须能脱离页面，直接升级到企业 IM
- 没有证据链的 durable memory 不成立
- 没有结构化后果的 accept / reject 不成立
- inbox 只保留待处理事项，不承载流水账
- Notion 仍可作为入口，但不再是唯一控制面板

---

## 14. 一句话产品定义

Cortex vNext 不是“会写 Notion 的 agent 框架”。

它应该是：

`一个让多 agent 共享记忆、共享执行状态、共享 review 队列，并在必要时升级人类决策的协作操作系统。`

---

## 15. 阶段性动作拆解

## Phase 0：框架收敛

目标：

- 把产品抽象讲清楚
- 不再在“Notion 工作流脚本”和“协作操作系统”之间摇摆

本阶段动作：

- 锁定四层结构
- 锁定 memory 三层
- 锁定 inbox 按动作分类
- 锁定 doc suggestion 语义
- 锁定 connect 模块

完成标志：

- 有一份稳定框架文档
- 后续 schema 和 UI 都按这份框架展开

## Phase 1：MVP 内核增强

目标：

- 不做大前台
- 先把新对象模型接进现有 Cortex

本阶段动作：

- 新增 `memory_items`
- 新增 `memory_sources`
- 新增 `inbox_items`
- 新增 `suggestions`
- 让 `command / decision / result / comment / memory candidate` 都能入 inbox
- 保留 Notion 作为外部 doc 入口

完成标志：

- Cortex 后台能正确生成三类 inbox item
- memory 已支持三层和治理字段
- 红灯仍然能走 IM push

## Phase 2：MVP 可用前台

目标：

- 先把“人类怎么用”做出来
- 不要求完整 native docs

本阶段动作：

- 做 Inbox 页面
- 做 Memory 页面
- 做 Connect 页面
- 做最小 Suggestion Review 面板
- 支持从 inbox 直接做 `approve / accept / reject / reply / resolve`

完成标志：

- 人类不需要翻长文档找待办
- 只看 inbox 就能处理主要事项

## Phase 3：Native 协同增强

目标：

- 降低对 Notion 的主控制依赖
- 把 suggestion / accept / reject 做成原生能力

本阶段动作：

- Native doc review
- 原生段落 suggestion
- 版本和 diff 视图
- activity feed

完成标志：

- Cortex 自己成为主协作面板
- Notion 退成外部内容入口之一
