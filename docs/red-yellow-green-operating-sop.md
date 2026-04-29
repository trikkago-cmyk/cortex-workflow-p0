# Cortex 红黄绿灯执行 SOP

最近更新：2026-04-27

## 目标

这份 SOP 只回答一个问题：

- 当一条任务、评论、建议或执行结果进入 Cortex 时，应该按什么规则分到 `green / yellow / red`
- 分流后谁继续执行，谁需要等人，谁必须立刻停下来

## 一句话规则

- `green`：直接执行，不等人
- `yellow`：继续沉淀到文档与 review 队列，不打断主链路
- `red`：立即停止继续推进，升级为人工拍板

## 真相源

- 运行态真相源：Cortex SQLite
- 协作面：Notion discussion / 文档评论
- 文档真相源：本地 Markdown

任何红黄绿灯动作，最终都必须回写到 Cortex 对象层，而不是只停留在聊天或评论里。

## 角色分工

- `Cortex Router`
  - 第一层分流器
  - 负责把事件归类为 green / yellow / red
- `executor worker / external agent`
  - 负责真正执行
  - 产生 run / checkpoint / receipt
- `human reviewer`
  - 处理 durable memory 最终准入
  - 处理 yellow review 中需要人工判断的内容
- `human approver`
  - 处理 red 决策
  - 一旦拍板，才允许继续执行

## Green

### 定义

满足下面特征的事项默认是 `green`：

- 任务可逆
- 风险局限在当前模块
- 不涉及权限、外部发布、资金、合规
- 缺少拍板不会造成后续污染
- 更像“继续推进执行”而不是“改变规则”

### 系统动作

1. 写入 `command`
2. 进入 `claim -> run -> checkpoint -> receipt`
3. 结果进入 `checkpoint / docs`
4. 如果形成稳定经验，再进入 memory candidate 提炼

### 典型例子

- 补一段文档说明
- 按已有方向继续实现
- 整理 PM brief
- 做一轮 evaluator 检查

## Yellow

### 定义

满足下面特征的事项默认是 `yellow`：

- 不需要立即停机
- 但继续推进前最好有人异步看一眼
- 可能影响文档结构、表达方式、执行策略
- 风险暂时可控，但存在不确定性

### 系统动作

1. 写入 `decision_request` 或 `review inbox`
2. 把状态同步到文档 / review 面
3. 在 Notion discussion 中等待下一轮异步评论
4. 不触发本地高优先级通知

### 典型例子

- “这段结构我不确定，先给个建议再继续”
- “是否把历史章节折叠到压缩区”
- “这条 memory 候选是否真的值得 durable 化”

## Red

### 定义

满足下面任一特征，就必须是 `red`：

- 不可逆
- 会污染后续多个模块
- 涉及权限 / 安全 / 合规 / 对外发布
- 会覆盖现有主结构或正式内容
- 不拍板就继续做，错误成本会显著放大

### 系统动作

1. 写入 `decision_request`
2. 写入 `decide inbox`
3. 触发 `local_notification`
4. 停止继续推进
5. 等待人工明确批准 / 拒绝 / 改方案

### 典型例子

- 覆盖正式对外文档结构
- 修改长期默认机制
- 直接变更主协作协议
- 高风险权限动作

## Yellow 和 Red 的边界

如果你拿不准是 `yellow` 还是 `red`，用这条判断：

- 错了之后还能低成本改回来：`yellow`
- 错了之后会污染后续、影响范围扩大、需要追着修：`red`

## Memory 相关特殊规则

### Candidate memory

- 默认不是 red
- 先进入 reviewer-agent 一审
- 再交给 human reviewer 最终裁定

### Durable memory 关键修改

下面这些情况一律不能自动 durable：

- 修改长期协作偏好
- 修改 Base Memory
- 修改跨项目 Knowledge
- 证据不足但影响面大

这些至少是 `yellow`，必要时升 `red`。

## 当前系统内的固定行为

- `green`：继续执行并写 checkpoint
- `yellow`：写 review / decision，等待异步评论
- `red`：触发 `local_notification`
- 本地运行时不再主动用 token 回帖 Notion discussion
- Notion 侧回显默认来自 `receipt / checkpoint / docs`

## 人工拍板后的动作

### 批准

- `decision.status -> approved`
- Router / executor 继续执行

### 要求修改

- `decision.status -> changes_requested`
- 生成新的 review / command

### 停止

- `decision.status -> stopped`
- 当前执行链路结束，不再继续派发

## 这份 SOP 的验收标准

满足下面 5 条，才算真正落地：

1. 任意评论进入后，都能被稳定归类为 green / yellow / red
2. red 一定会停下来，不会被“顺手继续做掉”
3. yellow 不会升级成高优先级打断，但会进入 review 面
4. green 会持续推进，并留下 checkpoint / receipt
5. 决策结果最终能回写到 Cortex，而不是只停留在评论线程里
