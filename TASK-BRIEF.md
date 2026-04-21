# Cortex 当前任务简报

## Why

当前 Cortex 已经有了可运行的 P0 执行内核。

但它还不够像一个真正的长程协作系统。

现在最缺的不是“再多接一个入口”，而是三件事：

- 每个 agent 做过什么，要留下结构化运行轨迹
- 每个阶段形成了什么稳定结论，要留下 checkpoint
- review 面板要优先展示阶段、质量、异常和下一步，而不是只展示最后一句聊天摘要

所以这轮升级的目标是：

- 把 Cortex 从“能跑命令”升级成“能跑长程任务”的 v0.2 底座
- 让 planner / generator / evaluator 式职责分工有明确落点
- 让 Notion 和 review 真正能看懂当前有没有脱轨

---

## Context

当前已经具备：

- 企业 IM -> Cortex -> outbox -> 胖虎 -> 企业 IM 的主链路
- `task_briefs / decisions / commands / outbox` 的 SQLite 真相源
- 红黄绿灯决策框架
- Notion 评论扫描、reply、执行文档 / review / 项目索引同步
- multi-agent 常驻 worker 池

当前的主要短板：

- 缺少结构化 `run` 记录，无法看出谁在 plan / design / execute / evaluate
- 缺少结构化 `checkpoint`，review 面板只能从 brief / command 文本里猜阶段
- 缺少显式的质量等级、异常等级、反馈来源，无法做长期执行追踪
- comment handler 虽然能动，但还没有把“角色化执行 + 阶段性收口”写进系统本体

这轮我已经选择的落地方向是：

- 不盲目再加很多新 worker
- 先把 `runs + checkpoints + evaluator route + checkpoint-driven review` 接进现有主链路
- 保持与当前 P0 自动化兼容，不重写整套系统

---

## What

### 这轮要交付

1. 长程任务结构化对象
   - `runs`：记录 agent 的角色、阶段、状态、质量、异常
   - `checkpoints`：记录阶段性结论、证据、下一步、信号等级

2. review 真相源升级
   - `project-review` 优先使用最新 checkpoint
   - 输出当前阶段、角色进度、质量 / 异常信号
   - Notion 项目索引提取逻辑优先读 checkpoint，而不是只读 brief

3. multi-agent 执行层升级
   - router 保持编排
   - pm 作为 planner
   - architect / notion worker 继续承担生成与执行
   - evaluator 作为新角色接入路由
   - worker 处理任务时自动写 run / checkpoint

4. 自动化与文档同步
   - 自动化栈重启后使用新代码
   - 执行文档、review、项目索引按 v0.2 口径同步

### 当前验收标准

- `/runs` 和 `/checkpoints` 可读写
- `project-review` 能返回 `latest_checkpoint / recent_runs / run_role_progress`
- review markdown 能显示当前阶段和角色进度
- multi-agent handler 不因为 run/checkpoint 写入失败而中断主执行
- evaluator 能作为新路由目标接入
- 全量测试通过

---

## 一句话定义

**这轮 Cortex 交付的，是 P0 执行内核之上的 v0.2 长程任务底座。**

它开始真正具备：

- 任务简报
- 决策分级
- 执行轨迹
- 阶段 checkpoint
- 质量与异常信号
- 面向 Notion review 的稳定收口能力
