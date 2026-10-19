---
name: to-tickets
description: 把 Spec 拆成纵向切片、按依赖排序的本地实现 Tickets。
disable-model-invocation: false
---

# To Tickets

输入是刚写好的 Spec。把它拆成可以逐个领取、独立交付与验收的 Tickets，写入当前工作区。

## 输出位置

遵循 `docs/agents/issue-tracker.md` 的约定：

- 目录：`.scratch/<feature-slug>/issues/`
- 文件名：`<NN>-<ticket-slug>.md`，`NN` 从 `01` 开始，按依赖顺序编号

## 每个 Ticket 必须包含

1. **What to build**：这项改动交付什么（用户可感知的行为）。
2. **Blocked by**：前置 Ticket 编号；没有前置时写 `None`。
3. **Status**：初始为 `ready-for-agent`（存在前置时写 `blocked-by-<NN>`）。
4. **验收标准**：可以逐条验证的检查项。
5. **实现提示**（可选）：关键文件、接口或数据结构的指路，不写完整代码。

## 拆分原则

- 纵向切片：每一项都能独立跑通一条最小用户路径，不做「先建全部表、再写全部逻辑」式的横向拆分。
- 依赖顺序即编号顺序；后面的 Ticket 可以引用前面的编号。
- 粒度控制在一次任务可以完成的范围；过大的切片继续拆分。

## 约束

- 只写文档，不写实现代码。
- 写完后确认 issues 目录里至少有一个 `.md` 文件，再调用 `request_spec_approval` 提交产物路径。
