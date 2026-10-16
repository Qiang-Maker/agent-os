import type { AppRuntime } from './runtime.js';
import type { ScheduledTask } from '../core/schedule.js';
import type { ProductDeliveryMode } from '../core/bot-registry.js';
import { buildBotPrompt } from '../core/bot-registry.js';
import { getCliAdapter } from '../cli/registry.js';
import { runCli } from '../cli/runner.js';
import { TaskProgressTracker } from '../core/task-progress.js';
import { markSessionIdle } from './session-view.js';

export async function runScheduledTaskDirectly(options: {
  runtime: AppRuntime;
  task: ScheduledTask;
  scheduledFor: string;
  defaultProductDeliveryMode: ProductDeliveryMode;
}): Promise<{ sessionId?: string }> {
  const { runtime, task } = options;
  const config = runtime.teamRegistry.get(task.targetBotId);
  if (!config) throw new Error(`定时任务目标成员不存在: ${task.targetBotId}`);

  const { session } = await runtime.sessions.resolve(
    {
      messageId: `scheduled-${task.id}`,
      chatId: task.chatId,
      threadId: `scheduled-${task.id}`,
      rootId: '',
    },
    config.defaultCliId,
    config.id,
    config.workspaceDir,
  );
  if (session.status === 'closed') throw new Error('定时任务对应会话已经关闭');
  if (session.status === 'active') throw new Error('定时任务会话仍在执行');

  const adapter = getCliAdapter(session.cliId);
  const run = new AbortController();
  await runtime.sessions.transition(session.id, 'active');
  runtime.activeRuns.set(session.id, {
    controller: run,
    ownerOpenId: task.creatorOpenId,
  });
  const progress = new TaskProgressTracker(
    Date.now,
    runtime.contextWindows.get(session.id),
    !session.cliSessionId,
  );

  try {
    const prompt = buildBotPrompt(
      config,
      [
        `定时任务触发时间：${options.scheduledFor}（计划 ${task.id}）`,
        task.prompt,
      ].join('\n\n'),
      runtime.teamRegistry.contextFor(config.id),
      options.defaultProductDeliveryMode,
    );
    const result = await runCli({
      adapter,
      prompt,
      cwd: session.workspaceDir,
      sessionId: session.cliSessionId,
      signal: run.signal,
      env: {
        AGENT_OS_CHAT_ID: task.chatId,
        AGENT_OS_OWNER_OPEN_ID: task.creatorOpenId,
      },
      onEvent: (event) => {
        if (
          event.type !== 'tool_start' &&
          event.type !== 'tool_end' &&
          event.type !== 'context'
        )
          return;
        const snapshot = progress.accept(event);
        console.log(
          `[定时] ${task.id} ${snapshot.current} tools=${snapshot.completedCount}/${snapshot.toolCount}`,
        );
      },
    });
    if (result.sessionId) {
      await runtime.sessions.setCliSessionId(session.id, result.sessionId);
    }
    if (result.stats?.contextWindowTokens) {
      runtime.contextWindows.set(session.id, result.stats.contextWindowTokens);
    }
    console.log(
      `[定时] ${task.id} 执行完成: ${result.answer.slice(0, 200)}`,
    );
    return { sessionId: result.sessionId };
  } finally {
    if (runtime.activeRuns.get(session.id)?.controller === run) {
      runtime.activeRuns.delete(session.id);
    }
    await markSessionIdle(runtime.sessions, session.id);
  }
}
