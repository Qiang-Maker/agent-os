import assert from "node:assert/strict";
import { test } from "node:test";
import { TaskStore } from "./task-store.js";

test("complete 标记任务为完成并记录时间", () => {
  const store = new TaskStore();
  const task = store.add("写单元测试");
  const completed = store.complete(task.id);
  assert.equal(completed.completed, true);
  assert.ok(completed.completedAt, "completedAt 应该被记录");
  assert.equal(Number.isNaN(Date.parse(completed.completedAt!)), false);
  assert.equal(store.get(task.id)?.completed, true);
});

test("complete 未知任务时抛出错误", () => {
  const store = new TaskStore();
  assert.throws(() => store.complete("T404"), /T404/);
});

test("list 返回全部任务且保持原顺序", () => {
  const store = new TaskStore();
  store.add("一");
  store.add("二");
  const ids = store.list().map((task) => task.title);
  assert.deepEqual(ids, ["一", "二"]);
});
