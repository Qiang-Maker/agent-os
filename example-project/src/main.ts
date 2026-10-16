import { TaskStore } from "./task-store.js";

const store = new TaskStore();
const task = store.add("示例任务");
console.log("创建任务:", task);
console.log("当前任务数:", store.list().length);
