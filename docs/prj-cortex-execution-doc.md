# PRJ-cortex 执行文档

## 当前状态

- 当前任务：重建当前 Notion 空间的 Cortex 工作台，避免继续依赖旧的 all-in-one 同步页。
- 当前进展：已创建项目索引数据库、总览面板、执行文档、协作记忆页；旧 `32c...` 工作台只作为截图/历史参考，不再写入。
- 决策状态：🔴 无；🟡 `2026-05-12 18:17（上海时间）` 诊断确认当前 Notion 根页尚未共享给 token integration `codex`；🟢 页面信息架构已建立。
- 下一步：将当前根页共享给 integration `codex` 后，重跑 `notion:diagnose`、`notion:sync-all`、`memory:notion-sync`。

## 红黄绿状态

### 🔴 红灯

- 暂无。没有需要产品方向拍板的不可逆决策。

### 🟡 黄灯

- 当前空间通过 Notion MCP 可写，但本地 `NOTION_API_KEY` 对当前根页返回 `object_not_found`。
- 影响：`notion:sync-all`、`memory:notion-sync` 和 `notion-comment-poller` 不能持续写入这套新空间。
- 处理：把当前根页 `Cortex工作台` 共享给 Notion integration `codex`。
- 诊断证据：`npm run notion:diagnose -- https://www.notion.so/35beb0c2e3f780309d79ddb2bd3c44b6` 返回 `page_not_shared`，根页、总览页、执行文档、协作记忆页均为 404。

### 🟢 已推进

- 创建 `Cortex 项目索引` 数据库。
- 创建 `按项目看板`、`红黄绿看板`、`项目总表` 三个视图。
- 创建 `Cortex 总览面板`、`Cortex 执行文档`、`Cortex 协作记忆` 三个核心页面。
- 本地 `PRJ-cortex` 项目配置已指向新页面。
- 本地评论路由文件已加入新页面映射。
- 当前根页已收敛为：总览目录、工作台多维表格、执行文档、Memory。
- 本地保留 `docs/collaboration-memory.md` 作为 Memory 主版本；Obsidian 里也有 Cortex Memory 相关参考，但不作为写入真相源。

## 评论协作规则

- 对具体段落划词评论，不要只在页面底部泛泛留言。
- 明确意图优先：approve / reject / improve / retry / block。
- 自然语言补充建议可以跟在明确意图后面。
- 权限补齐后，Cortex 会把可执行评论转成 command，并回写执行结果。

## 验收标准

- `notion:diagnose` 能访问根页、总览页、执行文档、协作记忆页。
- `notion:sync-all` 能写入总览、执行文档和项目索引。
- `memory:notion-sync` 能写入协作记忆。
- 在执行文档划词评论后，`notion-comment-poller` 能创建 command 并回复 Notion discussion。
