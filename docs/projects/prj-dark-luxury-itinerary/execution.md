# Dark Luxury Itinerary 执行文档

- 当前任务：把 dark luxury itinerary agent 从 `PRJ-cortex` 总项目拆成独立项目，并接入独立 Notion 文档链路
- 核心进展：已创建独立项目工作区；已将 `agent-dark-luxury-itinerary` 绑定到独立 `project_id`；下一步是创建独立 Notion 页集并验证自动同步
- 最近同步：未同步（上海时间）

**风险举手**

🔴 红灯：无
🟡 黄灯：历史 dark luxury 进展仍留在 `PRJ-cortex` 旧记录中，后续只做独立项目新增，不再继续污染主项目
🟢 已推进：`codex_resume` worker 已跑通；connect health check 已验证通过；错误项目归属与“只回复 online”空转 probe 已收口；后续评论会直接落到本项目执行文档

**下一步**

- 创建独立 Notion 工作台 / 协作记忆 / 执行文档
- 重启自动化，拉起本项目专属 notion loop
- 做一次项目级同步，确认项目工作台里出现独立行

**评论约定**

- 直接对具体段落或具体条目划词评论
- 默认把评论视作执行反馈，而不是闲聊
- 若需指定 agent，可用 `@agent` / `@别名`
