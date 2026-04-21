# Cortex Memory Hub

- 更新于：2026-04-21 19:24:07（上海时间）
- Durable：Base 0 / Knowledge 0 / Timeline 0
- 待裁定 Candidate：0（Base 0 / Knowledge 0 / Timeline 0）

## Memory Pipeline

1. Raw materials：先从 comment / decision / checkpoint / receipt / suggestion 等原材料里提取候选信号。
2. Candidate memory：只落候选，不直接写成长期记忆；同时 attach source / evidence / confidence / freshness / next step。
3. Durable memory：只有 accepted 的条目才进入 durable，并按 Base Memory / Knowledge / Timeline 三类挂载。

## 导航

- Base Memory：docs/memory/base-memory.md
- Knowledge：docs/memory/knowledge.md
- Timeline：docs/memory/timeline.md
- Candidate Memory：docs/memory/candidates.md

## 当前待裁定摘要

- 暂无待裁定 candidate。

## 说明

- Base Memory / Knowledge 是全局可复用资产，不按项目拆散。
- Timeline 允许按项目留痕，但仍然收敛到同一个 hub 下管理。
- 项目只贡献 timeline 事实和 source，不单独维护一份长期记忆正文。
