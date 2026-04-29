# Cortex 记忆总览

- 更新于：2026-04-27（上海时间）
- 长期记忆：Base 0 / Knowledge 0 / Timeline 0
- 待裁定候选：0（Base 0 / Knowledge 0 / Timeline 0）

## 记忆流水线

1. 原始材料：先从 comment / decision / checkpoint / receipt / suggestion 等原材料里提取候选信号。
2. 候选记忆：先落候选，不直接写成长期记忆；同时附带 `source / evidence / confidence / freshness / next_step`。
3. 长期记忆：只有通过 review 且被确认接受的条目，才会进入 durable，并按 Base Memory / Knowledge / Timeline 三类挂载。

## 导航

- Base Memory（基础记忆）：docs/memory/base-memory.md
- Knowledge（知识）：docs/memory/knowledge.md
- Timeline（时间线）：docs/memory/timeline.md
- 候选记忆：docs/memory/candidates.md
- 项目级记忆：docs/projects/*/memory.md

## 当前待裁定摘要

- 暂无待裁定候选。

## 说明

- Base Memory / Knowledge 是全局可复用资产，不按项目拆散。
- Timeline 允许按项目留痕，但仍然收敛到同一个 hub 下管理。
- 项目级记忆可以单独存在于 docs/projects/*/memory.md，用于保留项目内协作约定、局部知识和项目里程碑。
- 项目级记忆不会自动并入全局长期记忆中心，只有经过 review 提升后，才会进入全局的 Base / Knowledge / Timeline。
