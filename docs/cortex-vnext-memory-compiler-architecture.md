# Cortex vNext Memory Compiler Architecture

最近更新：2026-04-15

## 1. 先纠偏

之前那版 memory 设计确实容易让人混乱。

问题不在于对象太多，而在于把几种本来正交的维度写成了同一层结构：

- `Raw Materials / Candidate / Durable` 其实是生命周期
- `Base Memory / Timeline / Knowledge` 其实是挂载用途或旧的内容分桶
- `Governance` 其实是横切治理能力，不是内容层

这三类东西混在一起后，就会出现：

- 一会儿在说“这条内容现在成熟到什么程度”
- 一会儿在说“这条内容给未来任务扮演什么角色”
- 一会儿又在说“这条内容怎么审计和复核”

所以 v2 要做的不是继续补术语，而是先把维度拆开。

## 2. v2 总原则

- Cortex 主端是唯一真相源
- Obsidian / Notion 都是映射层，不是主源
- 知识分层和生命周期必须分开
- 治理能力是横切面，不是知识层
- 问答结果必须回链到 Topic / Source，不允许只存在聊天缓存
- 没有来源、版本、适用范围、权限和审批状态的内容，不能当成可治理知识

## 3. v2 的五层知识架构

### Layer 1：Raw

定义：

- 原始输入
- 不可直接当知识结论
- 必须保留原文、时间、来源、权限、版本

在 Cortex 里的典型对象：

- Notion comment
- IM message / action
- task brief
- decision request
- checkpoint
- receipt
- suggestion
- meeting note
- 外部文档摘录

设计约束：

- Raw 只负责保真，不负责解释
- Raw 可以解析、切块、标注，但不能被“润色后覆盖原文”
- Raw 必须可追溯回原始对象

### Layer 2：Source

定义：

- 从单一或极少量原始材料抽取出的结构化页面
- 目标是“把证据变得可读”，不是提前下结论

应该包含：

- 核心事实
- 摘要
- 原文摘录
- 来源链接
- 时间与版本
- 适用范围与权限

设计约束：

- Source 以抽取和归纳为主
- 可以指出疑点，但不要过早形成“稳定规则”
- 一个 Source 必须能解释自己从哪来

### Layer 3：Topic

定义：

- 跨多个 Source 编译出来的主题综合层
- 这是系统当前“最佳解释”的承载层

典型内容：

- 稳定协作原则
- 某类流程规范
- 某类实现模式
- 某个项目域的长期规则

设计约束：

- Topic 必须标记冲突、例外、待确认问题
- Topic 不是拍脑袋总结，必须有 Source 支撑
- Topic 才是默认给未来任务挂载的知识层

### Layer 4：Query

定义：

- 面向复用问法的问答层
- 它不是聊天缓存，而是 Topic / Source 的已编译问答入口

典型内容：

- “新员工 30 天内要完成哪些系统开通？”
- “出现 red 决策时通知策略是什么？”
- “评论路由优先级怎么判定？”

设计约束：

- 每条 Query 都必须回链到 Topic 或 Source
- Query 的答案必须是可重建的，不允许脱离知识主链独立漂移
- Query 更像 FAQ / Answer Card，不是 session memory

### Layer 5：Governance

定义：

- 治理层不是内容层
- 它是对 Raw / Source / Topic / Query 四层的共同约束

治理对象包括：

- 权限控制
- 审计日志
- 版本管理
- 冲突检测
- 审批状态
- 复核时间
- 过期提醒

红线：

- 法务 / 财务 / 人事 / 高风险工程规则，没有证据链不能回答
- 没有权限标签的内容不能跨范围暴露
- 没有审核时间和版本号的内容不能默认长期挂载

## 4. 和生命周期分开

知识层级不是生命周期。

v2 把生命周期单独定义为另一条轴：

- `draft`
- `candidate`
- `approved`
- `rejected`
- `archived`

解释：

- `Raw` 可以有采集状态，但它不是“candidate memory”
- `Source / Topic / Query` 都可以处在 `candidate` 或 `approved`
- `approved` 才能成为默认挂载资产
- `rejected` 也要留痕，便于审计和冲突排查

所以以后不要再把：

- `Raw / Candidate / Durable`

和：

- `Source / Topic / Query`

写成同一条分层链路。

## 5. 和当前 Cortex 模型怎么对齐

### 5.1 当前模型哪里混了

当前 `memory_items.layer` 只有三种值：

- `base_memory`
- `timeline`
- `knowledge`

这在实现上能跑，但语义上混了两件事：

- 内容将来给谁用
- 内容现在属于哪一层知识产物

### 5.2 v2 的兼容解释

在不立刻大迁移 schema 的前提下，先这样解释：

- `status / review_state`
  - 只表示生命周期和治理状态
- `memory_sources`
  - 表示证据链，不表示知识层
- `memory_items.layer`
  - 暂时保留为兼容字段
  - 它表示“旧的挂载桶位”，不是新的知识层级
- `metadata_json.compiled_tier`
  - 才表示 v2 下的知识层级
- `metadata_json.target_tier`
  - 表示这条内容下一步应该沉淀到哪一层

### 5.3 旧术语到新术语的映射

- `Raw Materials`
  - 对应 v2 `Raw`
- `Candidate / Durable`
  - 对应 v2 生命周期状态
- `Base Memory`
  - 不再视为顶层 layer
  - 以后更接近某类 `Topic`
  - 例如“协作方式与工程审美”
- `Timeline`
  - 不再视为顶层 layer
  - 以后更接近 `Raw` 或 `Source` 的事件视图
  - 时间是过滤和投影视角，不是主分层
- `Knowledge`
  - 不再视为笼统 layer
  - 以后拆成 `Topic` 和 `Query`

一句话：

旧模型里的 `Base Memory / Timeline / Knowledge`，以后都不应该再被叫作“统一层级”。

## 6. 现在这套系统里的推荐对象关系

### Raw objects

- comments
- decisions
- checkpoints
- receipts
- suggestions
- task briefs
- external docs

### Compiled knowledge objects

建议统一理解成：

- `Source Node`
- `Topic Node`
- `Query Node`

Phase 1 为兼容现有代码，暂时继续落在 `memory_items` 里，但必须在 metadata 里标清 tier。

### Governance objects

- `memory_sources`
- `inbox_items`
- `suggestions`
- `review_state`
- 审批动作
- 变更日志
- 冲突记录

## 7. Cortex 的标准知识编译流水线

标准链路应为：

1. Raw 入库
2. 自动解析 / 切块 / 清洗
3. 生成 `Source candidate`
4. 人审或规则审
5. 更新相关 `Topic`
6. 生成 / 更新相关 `Query`
7. 重建索引
8. 产出 change log / conflict / review todo

关键约束：

- 不是“上传即生效”
- 不是“抽到一句话就直接变 durable rule”
- 不是“问过一次就算 Query”

## 8. 检索策略

单一向量检索不够。

至少应支持四类检索协同：

- BM25 / 关键词检索
  - 适合制度、术语、字段名、接口名、规则编号
- 向量语义检索
  - 适合相似问法和概念关联
- 图谱关系检索
  - 适合组织、人、流程、系统、依赖关系
- 元数据过滤
  - 先按项目、部门、地区、权限、时间、生效状态做预过滤

推荐顺序：

1. 先做 metadata 预过滤
2. 再跑 BM25 + vector 混合召回
3. 需要时补图谱扩展
4. 最终答案只从可见且已审批的 Topic / Query / Source 里组装

## 9. 强制元数据字段

每条可治理知识至少应有：

- `source_type`
- `source_ref`
- `author` 或 `owner`
- `effective_at`
- `reviewed_at`
- `version`
- `scope`
- `permission_level`
- `approval_status`
- `confidence`

推荐补充：

- `project_id`
- `region`
- `department`
- `supersedes`
- `superseded_by`
- `conflict_with`
- `projection_targets`

缺这些字段的后果：

- 无法判断是否过期
- 无法做冲突治理
- 无法做权限边界
- 无法做审计追责

## 10. Obsidian / Notion 的角色

### Cortex

- 唯一真相源
- 持有 Raw、Compiled、Governance 全链路对象
- 负责审计、版本、审批、检索和挂载

### Obsidian

- 个人阅读和编辑友好的映射层
- 适合看 Topic、Query、个人笔记和关系图
- 不应该承担唯一真相源职责

### Notion

- 协作 review 和执行交互界面
- 适合评论、审批、同步摘要、项目面板
- 不应该和 Cortex 主数据分叉

## 11. 实施顺序

### Phase 1：先纠偏命名和 metadata

- 保留现有 `memory_items`
- 在 `metadata_json` 写入 `compiled_tier / target_tier / compiler_version`
- 文档统一停止把 `Base Memory / Timeline / Knowledge` 说成统一层级

### Phase 2：补 Source / Topic / Query 编译链

- 从 Raw 自动生成 `Source candidate`
- Topic 改成从 Source 重编译
- Query 改成从 Topic / Source 生成

### Phase 3：补治理闭环

- 审批流
- 冲突检测
- 过期提醒
- 变更日志

### Phase 4：补混合检索

- metadata filter
- BM25
- vector
- graph

### Phase 5：补外部映射

- Notion review projection
- Obsidian topic/query projection
- 可选的只读导出 API

## 12. 当前决定

这版之后，Cortex memory 设计按下面这句话执行：

> Cortex 的 memory 不是“长期记忆文本堆”，而是一个知识编译系统。  
> `Raw / Source / Topic / Query` 是知识层。  
> `candidate / approved / rejected / archived` 是生命周期。  
> `permissions / audit / version / conflict / review` 是治理横切面。  
> Obsidian / Notion 只做映射，不做主真相源。
