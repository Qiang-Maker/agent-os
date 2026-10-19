# 任务：实现 TaskStore.complete(id)

`src/task-store.ts` 里的 `TaskStore.complete(id)` 目前只有一行 TODO。
把它实现出来，让 `pnpm build` 与 `pnpm test` 全部通过。

## 验收标准

1. `complete(id)` 把对应任务标记为已完成，并把 `completedAt` 记录为 ISO 时间字符串。
2. `complete(id)` 返回更新后的任务对象，`store.get(id)` 能读到同样的状态。
3. 传入不存在的 id 时抛出错误，错误信息包含这个 id。
4. `pnpm build` 无类型错误；`pnpm test` 全部通过。
5. 不允许修改测试文件的断言来「通过」测试。

## 建议步骤

```bash
pnpm install
pnpm build
pnpm test   # 先看测试是怎么失败的，再动手实现
```
