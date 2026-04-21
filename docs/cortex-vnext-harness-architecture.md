# Cortex vNext Harness 架构

最近更新：2026-04-13

## 1. 结论

可以。

而且 Cortex 应该主动升级成一套 `Harness-first` 的多 agent 协作系统。

但不是照搬 Java 工程里那套：

- `Checkstyle / ArchUnit / SpotBugs / JaCoCo`

而是把同样的思想翻译成多 agent 执行场景下的四层闭环：

- 约束
- 告知
- 验证
- 纠正

一句话：

`Cortex 不是 Harness 的补充。Cortex 本身就应该是多 agent 协作场景下的 Harness Runtime。`

---

## 2. 为什么 Cortex 需要 Harness

现在 Cortex 已经有执行能力。

但还缺三件事：

1. 没有把“什么算做对”编码成运行时对象和规则
2. 没有把执行反馈稳定收敛成 review / inbox / memory
3. 没有把错误纠正路径做成默认机制

所以当前 Cortex 更像：

- 有 agent
- 有 webhook
- 有 outbox
- 有 Notion 同步

但还不像一个真正能长期驾驭 agent 的系统。

Harness 的价值就在这里：

- 不靠 prompt 反复提醒
- 不靠人类一直盯窗口巡逻
- 不靠 agent “自觉”

而是把正确路径做成默认路径。

---

## 3. Cortex 版 Harness 四层

## 3.1 告知层

回答两个问题：

- 这次任务为什么做
- 什么叫做对

在 Cortex 里，对应这些对象：

- `task_briefs`
- `Base Memory`
- `Knowledge`
- `agent onboarding / connect profile`
- 项目级规则文档

这里承载的是显性意图。

要求：

- 每次任务先生成 `Why / Context / What`
- 新 agent 不直接吃长上下文
- 通过 `Base Memory + Task Brief + Knowledge` 渐进式挂载

## 3.2 约束层

回答一个问题：

- agent 可以自由做什么，不能越过什么

在 Cortex 里，不应该只靠自然语言规范。

要把约束做成运行时对象：

- 红黄绿灯决策分级
- `Inbox` 动作队列
- `Suggestion accept / reject`
- `Memory review_state / status`
- `source / evidence / confidence / freshness`
- 幂等键
- projector 规则

这层不是“提醒”。

而是系统约束。

例子：

- 没有 `source + evidence` 的 memory 不能变成 durable
- 红灯事项不能只写 Notion，必须 push
- suggestion 不能只 reply，必须有 `proposed / accepted / rejected`
- inbox 一级分类按人类动作，不按对象类型

## 3.3 验证层

回答一个问题：

- 现在到底做得怎么样

在 Cortex 里，对应这些传感器：

- `runs`
- `checkpoints`
- `agent_receipts`
- `inbox backlog`
- `memory freshness`
- `projector audit`
- `receipt / suggestion / decision` 状态流转

这层相当于 Harness 里的 sensors。

它不只看“任务有没有结束”。

还看：

- 有没有脱轨
- 有没有积压
- 哪些结论已经稳定
- 哪些结果还只停留在 candidate

## 3.4 纠正层

回答一个问题：

- 发现偏差后，系统怎么自己纠偏

在 Cortex 里，对应这些动作：

- 绿灯：直接推进，静默写 review
- 黄灯：先挂起当前点，转去做其他安全工作
- 红灯：立刻 push，等待拍板
- memory review：accept / reject / needs_followup
- suggestion：accept / reject / supersede
- executor retry / re-route
- comment triage -> assign / convert

这层就是 Cortex 的纠偏回路。

---

## 4. Planner / Generator / Evaluator 放在哪里

可以引入。

但它应该是 Cortex Harness 里的执行角色。

不是替代 Cortex 本身。

推荐关系：

- `Planner`
  - 负责把输入任务转成 `task_brief + plan + checkpoints`
- `Generator`
  - 负责实际生产：写代码、写文档、跑任务
- `Evaluator`
  - 负责审查结果、提出 suggestion、产生 candidate knowledge

Cortex 负责：

- 承载这些角色的状态
- 记录谁做了什么
- 把结果投影到 inbox / memory
- 在红黄绿灯规则下驱动升级与回路

所以关系不是：

- Cortex vs 三 agent

而是：

- `Cortex = Harness Runtime`
- `Planner / Generator / Evaluator = Harness 内的角色编排`

---

## 5. 与传统 Harness 的区别

传统代码仓库里的 Harness 更偏：

- 编译器
- lint
- unit test
- CI gate

Cortex 的 Harness 更偏：

- 多 agent 协作状态机
- human-in-the-loop 决策门
- review inbox
- memory 治理
- suggestion 接受 / 拒绝
- 评论与执行结果的结构化回流

也就是说：

- 传统 Harness 管“代码产出是否合规”
- Cortex Harness 管“多 agent 协作是否持续对齐、可审查、可纠偏”

两者不是冲突关系。

后续完全可以组合：

- 仓库内部用代码 Harness
- Cortex 外层用协作 Harness

---

## 6. Cortex 的 Phase 路线

## Phase 1

先把 Harness 的对象层补齐：

- `memory_items`
- `memory_sources`
- `inbox_items`
- `suggestions`

以及最小 API：

- `/memory`
- `/inbox`
- `/suggestions`

## Phase 2

把 projector 和 Notion adapter 接起来：

- comment -> triage inbox
- result -> review inbox
- checkpoint / decision -> candidate memory
- suggestion -> accept / reject / resolve

## Phase 3

补 Connect / Onboarding：

- agent profile
- auth / scope
- webhook / receipt mode
- heartbeat / health
- role capability

## Phase 4

补 Native 前台：

- 自己的 Inbox
- 自己的 Memory 面板
- 自己的 Comment / Suggestion review

---

## 7. 当前落点

今天这轮之后，Cortex 已经开始进入 Harness 化：

- vNext 框架已明确
- Phase 1 对象模型已明确
- `memory / inbox / suggestion` 的 schema 和最小 API 已开始落地

下一步不是继续讨论“能不能用 Harness”。

而是持续把：

- projector
- review loop
- connect
- evaluator

接进来。
