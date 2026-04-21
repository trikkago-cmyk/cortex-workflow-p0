# Cortex vNext Memory Pipeline

最近更新：2026-04-14

> 兼容说明
>
> 这份文档描述的是 v1 术语体系，里面把 `Raw Materials / Candidate / Durable` 和
> `Base Memory / Timeline / Knowledge` 并列讨论，容易产生混层。
>
> 从 2026-04-15 起，规范解释以
> `docs/cortex-vnext-memory-compiler-architecture.md`
> 为准：
>
> - `Raw / Source / Topic / Query` 是知识层
> - `candidate / approved / rejected / archived` 是生命周期
> - `Governance` 是横切治理层
> - Obsidian / Notion 是映射层，不是主真相源

## 1. 先说结论

`memory` 现在不要只理解成“一堆长期记忆文本”。

在 Cortex 里，它其实分成三层对象，加上一层原材料和一层治理对象。

最清晰的看法是：

1. `Raw Materials`
2. `Candidate Memory`
3. `Durable Memory`
4. `Memory Governance`

其中真正叫 memory 的，是第 2、3 层。

---

## 2. Memory 现在有几类对象

## 2.1 第一层：Raw Materials

这层还不是 memory。

它只是原材料。

来源包括：

- Notion 评论
- IM 指令
- task brief
- decision request
- checkpoint
- agent receipt / 执行结果
- suggestion
- meeting note
- incident / 复盘记录
- 外部文档 / 网页摘录

特点：

- 噪音多
- 时序强
- 不能直接信
- 不能直接当长期规则

一句话：

`Raw Material = 事实输入，不等于稳定记忆`

## 2.2 第二层：Candidate Memory

这是从 raw materials 提炼出来、但还没被正式接受的记忆候选。

当前结构是：

- `memory_items.status = candidate`
- `review_state = pending_accept | needs_followup`

这层是 Cortex 最重要的缓冲层。

因为绝大多数错误，都发生在“把一句偶然反馈误写成长期原则”这一步。

所以 candidate 必须存在。

## 2.3 第三层：Durable Memory

这是已经被接受、会影响后续任务和 agent 行为的稳定记忆。

当前结构是：

- `memory_items.status = durable`
- `review_state = accepted`

这层才应该被默认挂载到后续任务。

## 2.4 第四层：Memory Governance Objects

这层不是 memory 内容本身。

是 memory 的治理外壳。

包括：

- `memory_sources`
- `inbox_items`
- `suggestions`
- `review_state / status / freshness / confidence`

它们解决的是：

- 这条记忆从哪来
- 证据是什么
- 谁接受了它
- 什么时候该复核
- 被 reject 后怎么保留痕迹

---

## 3. 真正的 Memory 有 3 个 layer

为什么是这 3 个，不是别的更多层？

因为新任务真正需要的上下文，本质上只分 3 种：

1. `以后默认怎么做`
2. `最近实际发生了什么`
3. `有哪些已经验证过、可以复用的方法`

这 3 种正好对应：

- `Base Memory`
- `Timeline`
- `Knowledge`

也就是说：

- `layer` 是给任务挂载上下文时用的
- `status` 是给治理和信任度用的
- `type` 是给语义分类用的

所以不要把它们混在一起。

`Raw Materials / Candidate / Durable / Governance` 不是 layer。

它们回答的是别的问题：

- Raw Materials：原始输入在哪
- Candidate / Durable：这条记忆现在处于什么成熟度
- Governance：这条记忆怎么被追踪、审阅、复核

而真正给后续任务挂载时，最需要区分的还是这 3 类上下文角色。

## 3.1 Base Memory

存什么：

- 稳定协作偏好
- 稳定工程审美
- 稳定产品原则
- 稳定角色边界

判断标准：

- 会长期影响任务执行方式
- 不依赖某一次具体上下文
- 对新 agent 也成立

例子：

- 低风险事项默认直接推进
- 默认先执行再汇报
- 执行记录默认倒序同步
- 一眼看不到重点的同步文档算失败

挂载策略：

- 默认挂载
- 新 agent 启动时优先挂
- 变化后需要显式同步

## 3.2 Timeline

存什么：

- 某次真实发生的事实
- 某次 checkpoint 结论
- 某次异常与处理过程
- 某次评论或回执带来的变化

判断标准：

- 主要价值是可追溯
- 强时序
- 不一定值得长期挂载

例子：

- 2026-04-14 接上首批 projector
- 某次 red decision 为什么触发
- 某次真实评论验证失败

挂载策略：

- 不默认全量挂载
- 只按时间窗口或相关性挂载
- 更适合给“最近发生了什么”的任务简报做上下文

## 3.3 Knowledge

存什么：

- 经验证可复用的方法
- 稳定模式
- 规范化流程
- 可迁移到其他项目 / agent 的经验

判断标准：

- 不是一次性事实
- 已经被验证
- 复用价值明确

例子：

- 评论 -> triage inbox 的路由模式
- suggestion 必须有 accept/reject 的 review 语义
- Base Memory / Timeline / Knowledge 三层治理模型

挂载策略：

- 不默认全量挂载
- 按主题检索、按任务语义召回
- 更适合给实现、设计、复用型任务按需挂载

---

## 4. 每条 memory 还有 6 个 type

当前 type 枚举是：

- `decision`
- `preference`
- `rule`
- `incident`
- `pattern`
- `open_question`

怎么理解：

- `decision`
  - 已拍板或待沉淀的关键决策
  - 重点是“这个判断改变了后续路径”
- `preference`
  - 人的稳定偏好
  - 重点是“这不是规则红线，但会稳定影响协作方式”
- `rule`
  - 明确规则 / 红线 / 约束
  - 重点是“默认必须遵守，不靠临场判断”
- `incident`
  - 异常、事故、偏差与复盘结论
  - 重点是“发生过问题，需要可追溯和可避免复发”
- `pattern`
  - 可复用的方法、架构、流程模式
  - 重点是“这套做法以后可以重复使用”
- `open_question`
  - 还没收口，但值得挂起追踪的问题
  - 重点是“现在还不能定，但值得持续跟踪”

所以更准确地说：

- layer 决定“它处在什么层”
- type 决定“它是什么性质”

两个很实用的判断句：

- `layer` 问的是：这条信息在任务里扮演什么角色？
- `type` 问的是：这条信息本身属于什么语义类别？

---

## 5. 从 raw materials 到 memory，怎么沉淀

不要一上来就“总结成一条记忆”。

正确流程应该是 6 步。

## 5.1 收集 Raw Material

先收输入，不做过早总结。

每条 raw material 最好至少带：

- `source_type`
- `source_ref`
- `source_url`
- `quote_text`
- `created_at`

目的：

- 保留原始语境
- 方便回看
- 避免总结时断章取义

## 5.2 提炼 Atomic Claim

从原材料里先抽“单条判断”，不是直接写 memory。

Atomic Claim 要求：

- 一句话只表达一个判断
- 尽量不用大段抽象话
- 可以被验证

模板：

- `claim`
- `why_it_matters`
- `evidence`
- `scope`
- `confidence`
- `freshness`

例子：

原评论：

- “如果下一步只有收益没有风险，直接执行，不用停下来问我。”

抽出来的 claim：

- `低风险且明显有益的下一步，默认直接执行，不等待确认`

## 5.3 判断它是不是值得进 Memory

不是所有 claim 都值得沉淀。

至少过这 4 个门：

1. 稳定性

- 这是一时吐槽，还是会重复成立？

2. 复用性

- 它只对这一次任务有效，还是会影响未来多个任务？

3. 行为影响

- 它会改变 agent 之后的执行方式吗？

4. 证据充分度

- 有没有原始引用、上下文、结果支撑？

只要其中一个门明显不过，就先留在 raw materials 或 timeline。

不要强行升 memory。

## 5.4 给它分 layer 和 type

最快的判断法：

- 如果它是“这次真实发生了什么”
  - 先放 `Timeline`
- 如果它是“以后默认怎么做”
  - 倾向 `Base Memory`
- 如果它是“已经验证过、可跨任务复用的方法”
  - 倾向 `Knowledge`

type 的判断法：

- 偏好 -> `preference`
- 规则 -> `rule`
- 决策 -> `decision`
- 异常 -> `incident`
- 方法 -> `pattern`
- 未解问题 -> `open_question`

## 5.5 先写成 Candidate，不直接写成 Durable

推荐默认动作：

- 创建 `memory_items.status = candidate`
- 绑定 `memory_sources`
- 同时投影一个 `review` inbox item

这一步的核心不是“沉淀成功”。

而是：

- 让它进入 review
- 让人能 accept / reject / follow up

## 5.6 Review 后再升 Durable

review 结果只有 4 种：

- `accepted`
- `rejected`
- `needs_followup`
- `archived`

默认策略：

- `accepted`
  - candidate -> durable
- `rejected`
  - candidate -> rejected
- `needs_followup`
  - 保持 candidate，补 `next_step`
- `archived`
  - 不再默认挂载，但保留历史

---

## 6. 一条 memory 应该长什么样

不要写成散文。

推荐最小结构：

- `title`
- `summary`
- `layer`
- `type`
- `source`
- `evidence`
- `confidence`
- `freshness`
- `related_memory`
- `next_step`

好的 memory summary 应该满足：

- 一句话说清规则或结论
- 不依赖原始聊天上下文才能理解
- 不混多个结论
- 看完就知道会如何影响未来行为

---

## 7. 实操例子

## 例子 A：从评论沉淀 Base Memory

raw material：

- 评论：“不要停下来问我，绿灯就继续做。”

提炼：

- claim：`绿灯事项默认直接执行，不等待确认`

分类：

- layer：`base_memory`
- type：`preference`

治理：

- source：该条评论
- evidence：评论原文 + 上下文段落
- confidence：`high`

结果：

- 先入 `candidate`
- review accept 后变成 durable

## 例子 B：从 checkpoint 沉淀 Knowledge

raw material：

- checkpoint：`notion comment -> triage inbox` 已真实跑通

提炼：

- claim：`评论先投影到 triage inbox，而不是直接改 memory`

分类：

- layer：`knowledge`
- type：`pattern`

治理：

- source：checkpoint + 相关 receipt + 实现文件
- evidence：测试通过 + 实际路由结果

## 例子 C：从异常沉淀 Timeline / Knowledge

raw material：

- 某次 tunnel 挂掉，导致 outbox pending 堆积

提炼：

- 事实层：`远端 tunnel 502 导致 poller 拉不到 outbox`
- 规则层：`IM 正式链路不能依赖临时公网 tunnel`

分类：

- Timeline：异常事实
- Knowledge：部署经验

这里不要把两个层混成一条 memory。

应该拆开。

---

## 8. 什么时候不要沉淀 memory

以下情况不要急着沉淀：

- 只是一次性的任务说明
- 只是还没验证的猜想
- 只是情绪化反馈，没有明确行为含义
- 只是已经被别的 durable memory 覆盖的重复表达
- 证据太弱，回头看不出为什么得出这个结论

原则：

`宁可少而准，不要多而乱`

---

## 9. 当前最推荐的沉淀机制

对 Cortex 现在这个阶段，最合适的机制是：

1. 原始事件先进 raw materials
2. projector 只做安全投影
3. extractor 从 raw materials 提 Atomic Claim
4. claim 满足条件后创建 candidate memory
5. review accept / reject
6. accept 后才进入 durable memory
7. 定期看 freshness，决定是否复核或归档

一句话：

`Raw Material -> Claim -> Candidate Memory -> Durable Memory`

不要跳步。

---

## 10. 当前工程落点

现在 Cortex 已经有这些基础对象：

- `memory_items`
- `memory_sources`
- `inbox_items`
- `suggestions`

现在也已经有第一版规则化提炼器：

- `src/memory-extractor.js`

以及第一批自动 candidate 投影：

- passed checkpoint -> candidate knowledge
- approved decision -> candidate memory
- accepted / rejected suggestion -> candidate memory

下一步真正该补的是：

- 更强的 raw material extractor
- 更完整的 candidate memory projector
- review accept / reject 工作流
- freshness / revalidation 机制

这四块补齐后，memory 才不只是“能存”，而是“会长、会筛、会治理”。
