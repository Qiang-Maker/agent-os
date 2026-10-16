import type { AppRuntime } from './runtime.js';
import type { ScheduledTask } from '../core/schedule.js';
import type { ProductDeliveryMode } from '../core/bot-registry.js';
import { runScheduledTaskDirectly } from './scheduled-task-runner.js';

export async function dispatchScheduledTask(options: {
  runtime: AppRuntime;
  task: ScheduledTask;
  scheduledFor: string;
  defaultProductDeliveryMode: ProductDeliveryMode;
}): Promise<{ sessionId?: string }> {
  return runScheduledTaskDirectly(options);
}
