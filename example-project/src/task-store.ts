export interface Task {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: string;
}

export class TaskStore {
  private readonly tasks = new Map<string, Task>();
  private nextId = 1;

  add(title: string): Task {
    const task: Task = {
      id: `T${this.nextId++}`,
      title,
      completed: false,
    };
    this.tasks.set(task.id, task);
    return task;
  }

  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  list(): Task[] {
    return [...this.tasks.values()];
  }

  complete(id: string): Task {
    // TODO: 实现 complete(id)：
    // 1. 找不到任务时抛出错误，错误信息里包含这个 id
    // 2. 把任务标记为已完成，并记录 completedAt（ISO 时间字符串）
    // 3. 返回更新后的任务
    throw new Error(`complete(${id}) 尚未实现`);
  }
}
