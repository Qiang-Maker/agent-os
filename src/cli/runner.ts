import { createInterface } from "node:readline";
import type { CliAdapter, CliEvent, CliRunResult } from "./types.js";
import { promptInputForPlatform } from "./types.js";
import { killCli, spawnCli } from "./spawn-cli.js";

const DEFAULT_TIMEOUT_MS = 2 * 60 * 60 * 1000;

function resolveTimeoutMs(adapter: CliAdapter, override?: number): number {
  if (override !== undefined) return override;
  const specific = adapter.id === "claude"
    ? process.env.CLAUDE_TIMEOUT_MS
    : process.env.CODEX_TIMEOUT_MS;
  const value = Number(specific ?? process.env.CLI_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

export interface RunCliOptions {
  adapter: CliAdapter;
  prompt: string;
  cwd: string;
  sessionId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  env?: Record<string, string>;
  stopToolNames?: string[];
  onEvent?: (event: CliEvent) => void;
}

export function runCli(options: RunCliOptions): Promise<CliRunResult> {
  const {
    adapter,
    prompt,
    cwd,
    sessionId,
    signal,
    timeoutMs,
    env,
    stopToolNames = [],
    onEvent,
  } = options;
  const effectiveTimeoutMs = resolveTimeoutMs(adapter, timeoutMs);
  // Windows 下 prompt 走 stdin（规避 cmd 转义/乱码），其他平台直接作为命令行参数。
  const promptInput = promptInputForPlatform(process.platform);
  const useStdin = promptInput === "stdin";
  const args = sessionId
    ? adapter.buildResumeArgs(prompt, sessionId, promptInput, env)
    : adapter.buildArgs(prompt, promptInput, env);

  return new Promise((resolve, reject) => {
    // 固定用 `['pipe','pipe','pipe']`，让 stdin 始终可写（spawnCli 返回类型按字面量收窄）。
    const child = spawnCli(adapter.command, args, {
      cwd,
      signal,
      env: env ? { ...process.env, ...env } : undefined,
      stdio: ["pipe", "pipe", "pipe"],
    });
    // stdin 模式下把 prompt 写入子进程；否则 prompt 已在命令行参数里，stdin 直接收口。
    if (child.stdin) {
      if (useStdin) child.stdin.end(prompt, "utf8");
      child.stdin.end();
    }
    const lines = createInterface({ input: child.stdout });
    let observedSessionId = sessionId;
    let observedAnswer: string | undefined;
    let observedStats: CliRunResult["stats"];
    const observedToolCalls = new Map<
      string,
      NonNullable<CliRunResult["toolCalls"]>[number]
    >();
    let stoppedByToolCall:
      | NonNullable<CliRunResult["toolCalls"]>[number]
      | undefined;
    let finalResult: CliRunResult | undefined;
    let resultError: Error | undefined;
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killCli(child);
    }, effectiveTimeoutMs);

    const finish = () => clearTimeout(timer);
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      finish();
      reject(error);
    };

    lines.on("line", (line) => {
      for (const event of adapter.parseEvents(line)) {
        onEvent?.(event);
        if ("sessionId" in event && event.sessionId) {
          observedSessionId = event.sessionId;
        }
        if (event.type === "error") {
          resultError = new Error(event.message);
          continue;
        }
        if (event.type === "stats") {
          observedStats = event.stats;
          if (finalResult && !finalResult.stats) {
            finalResult.stats = event.stats;
          }
          continue;
        }
        if (event.type === "tool_call") {
          observedToolCalls.set(event.toolUseId, event);
          if (
            !stoppedByToolCall &&
            stopToolNames.includes(event.toolName)
          ) {
            stoppedByToolCall = {
              toolUseId: event.toolUseId,
              toolName: event.toolName,
              input: event.input,
            };
            killCli(child);
          }
          continue;
        }
        if (event.type === "tool_end" && event.failed) {
          observedToolCalls.delete(event.toolUseId);
          continue;
        }
        if (event.type === "result") {
          if (event.answer) observedAnswer = event.answer;
          if (event.stats) observedStats = event.stats;
          if (!observedAnswer) continue;
          finalResult = {
            answer: observedAnswer,
            sessionId: event.sessionId ?? observedSessionId,
            ...(observedStats ? { stats: observedStats } : {}),
          };
        }
      }
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      if (timedOut) {
        fail(new Error(`${adapter.displayName} 执行超时`));
        return;
      }
      if (signal?.aborted) {
        fail(new Error(`${adapter.displayName} 执行已取消`));
        return;
      }
      fail(error);
    });
    if (finalResult && observedStats && !finalResult.stats) {
      finalResult.stats = observedStats;
    }
    child.once("close", (code) => {
      if (settled) return;
      if (stoppedByToolCall) {
        settled = true;
        finish();
        resolve({
          answer: observedAnswer ?? "",
          sessionId: observedSessionId,
          toolCalls: [stoppedByToolCall],
        });
        return;
      }
      if (timedOut) {
        return fail(new Error(`${adapter.displayName} 执行超时`));
      }
      if (signal?.aborted) {
        return fail(new Error(`${adapter.displayName} 执行已取消`));
      }
      if (resultError) return fail(resultError);
      if (code !== 0) {
        return fail(
          new Error(
            stderr.trim() || `${adapter.displayName} 退出，状态码 ${code}`,
          ),
        );
      }
      if (!finalResult) {
        return fail(new Error(`${adapter.displayName} 没有返回最终结果`));
      }
      if (observedToolCalls.size > 0) {
        finalResult.toolCalls = [...observedToolCalls.values()].map((call) => ({
          toolUseId: call.toolUseId,
          toolName: call.toolName,
          input: call.input,
        }));
      }
      settled = true;
      finish();
      resolve(finalResult);
    });
  });
}
