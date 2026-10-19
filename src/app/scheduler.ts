import { randomUUID } from 'node:crypto';
import { Cron } from 'croner';
import type { AppRuntime } from './runtime.js';
import type { ScheduleStore } from '../core/schedule-store.js';
import type { ScheduleRunStore } from '../core/schedule-run-store.js';
import type { ProductDeliveryMode } from '../core/bot-registry.js';
import type {
  CreateScheduledTask,
  ScheduledTask,
} from '../core/schedule.js';
import { dispatchScheduledTask } from './scheduled-task-dispatcher.js';

export interface SchedulerOptions {
  runtime: AppRuntime;
  scheduleStore: ScheduleStore;
  runStore: ScheduleRunStore;
  defaultProductDeliveryMode: ProductDeliveryMode;
  now?: () => Date;
}

export class Scheduler {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private running = false;

  constructor(private readonly options: SchedulerOptions) {}

  list(): ScheduledTask[] {
    return this.options.scheduleStore.list();
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.recoverInterruptedRuns();
    for (const task of this.options.scheduleStore.list()) {
      if (task.status !== 'active') continue;
      this.schedule(task);
    }
  }

  stop(): void {
    this.running = false;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  create(options: CreateScheduledTask & { id?: string }): ScheduledTask {
    const task = this.options.scheduleStore.create(options);
    if (task.status === 'active') this.schedule(task);
    return task;
  }

  update(
    id: string,
    patch: Partial<
      Pick<
        ScheduledTask,
        | 'chatId'
        | 'creatorOpenId'
        | 'targetBotId'
        | 'prompt'
        | 'rule'
        | 'status'
      >
    >,
  ): ScheduledTask | undefined {
    const task = this.options.scheduleStore.get(id);
    if (!task) return undefined;
    const updated = this.options.scheduleStore.update(id, patch);
    if (updated) {
      this.clearTimer(id);
      if (updated.status === 'active') this.schedule(updated);
    }
    return updated;
  }

  pause(id: string): ScheduledTask | undefined {
    const task = this.options.scheduleStore.get(id);
    if (!task || task.status !== 'active') return task;
    this.clearTimer(id);
    return this.options.scheduleStore.update(id, { status: 'paused' });
  }

  resume(id: string): ScheduledTask | undefined {
    const task = this.options.scheduleStore.get(id);
    if (!task || task.status !== 'paused') return task;
    const updated = this.options.scheduleStore.update(id, { status: 'active' });
    if (updated) this.schedule(updated);
    return updated;
  }

  delete(id: string): boolean {
    this.clearTimer(id);
    return this.options.scheduleStore.delete(id);
  }

  removeMany(ids: string[]): number {
    let count = 0;
    for (const id of ids) {
      if (this.delete(id)) count += 1;
    }
    return count;
  }

  removeAll(): number {
    return this.removeMany(this.list().map((task) => task.id));
  }

  async runNow(id: string): Promise<ScheduledTask | undefined> {
    const task = this.options.scheduleStore.get(id);
    if (!task) return undefined;
    await this.trigger(
      task,
      this.options.now?.()?.toISOString() ?? new Date().toISOString(),
    );
    return this.options.scheduleStore.get(id);
  }

  private schedule(task: ScheduledTask): void {
    this.clearTimer(task.id);
    const delayMs = this.nextRunDelay(task);
    if (delayMs === undefined) return;
    const updated = this.options.scheduleStore.update(task.id, {
      nextRunAt: new Date(Date.now() + delayMs).toISOString(),
    });
    if (!updated) return;
    const timer = setTimeout(() => {
      this.timers.delete(task.id);
      void this.onDue(updated);
    }, delayMs);
    timer.unref?.();
    this.timers.set(task.id, timer);
  }

  private nextRunDelay(task: ScheduledTask): number | undefined {
    const now = this.options.now?.() ?? new Date();
    if (task.rule.kind === 'once') {
      const runAt = new Date(task.rule.runAt).getTime();
      if (runAt <= now.getTime()) return undefined;
      return runAt - now.getTime();
    }
    if (task.rule.kind === 'interval') return task.rule.everyMs;

    const cron = new Cron(task.rule.expression, {
      timezone: task.rule.timezone,
    });
    const next = cron.msToNext();
    return next === null || next === undefined
      ? undefined
      : Math.max(1_000, next);
  }

  private async onDue(task: ScheduledTask): Promise<void> {
    const scheduledFor = task.nextRunAt ?? new Date().toISOString();
    const current = this.options.scheduleStore.get(task.id);
    if (!current || current.status !== 'active') return;
    await this.trigger(current, scheduledFor);
    if (current.rule.kind === 'once') {
      this.options.scheduleStore.update(task.id, { status: 'completed' });
      return;
    }
    if (this.running) this.schedule(this.options.scheduleStore.get(task.id) ?? current);
  }

  private async trigger(task: ScheduledTask, scheduledFor: string): Promise<void> {
    if (this.options.runStore.find(task.id, scheduledFor)) return;
    const running = this.options.runStore.latestRunning(task.id);
    if (running) {
      const skipped = this.options.runStore.create(task.id, scheduledFor);
      if (skipped) {
        this.options.runStore.markSkipped(skipped.id, '上一轮仍在执行，本轮跳过');
      }
      return;
    }
    const run = this.options.runStore.create(task.id, scheduledFor);
    if (!run) return;
    const taskId = randomUUID().replaceAll('-', '').slice(0, 24);
    this.options.scheduleStore.update(task.id, { lastRunAt: scheduledFor });
    try {
      await dispatchScheduledTask({
        runtime: this.options.runtime,
        task,
        scheduledFor,
        defaultProductDeliveryMode: this.options.defaultProductDeliveryMode,
      });
      this.options.runStore.markSucceeded(run.id, taskId);
    } catch (error) {
      this.options.runStore.markFailed(run.id, (error as Error).message);
    }
  }

  private recoverInterruptedRuns(): void {
    const now = this.options.now?.() ?? new Date();
    for (const task of this.options.scheduleStore.list()) {
      const running = this.options.runStore.latestRunning(task.id);
      if (running) {
        this.options.runStore.markFailed(running.id, 'Agent OS 重启，上一轮执行中断');
      }
      if (task.status !== 'active' || task.rule.kind !== 'once') continue;
      const runAt = task.rule.runAt;
      if (new Date(runAt).getTime() > now.getTime()) continue;
      if (this.options.runStore.find(task.id, runAt)) continue;
      const skipped = this.options.runStore.create(task.id, runAt);
      if (skipped) {
        this.options.runStore.markSkipped(skipped.id, '错过的执行时间，重启后不补跑');
      }
      this.options.scheduleStore.update(task.id, { status: 'completed' });
    }
  }

  private clearTimer(id: string): void {
    const timer = this.timers.get(id);
    if (!timer) return;
    clearTimeout(timer);
    this.timers.delete(id);
  }
}
