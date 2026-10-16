import { fileURLToPath } from "node:url";

export const CLARIFICATION_TOOL_NAME = "request_clarification";
export const PRODUCT_SPEC_TOOL_NAME = "request_spec_approval";
export const DISPATCH_TASK_TOOL_NAME = "dispatch_task";
export const SCHEDULE_MANAGE_TOOL_NAME = "schedule_manage";
export const REQUEST_APPROVAL_TOOL_NAME = "request_approval";
export const CLAUDE_CLARIFICATION_TOOL_NAME = `mcp__agent_os__${CLARIFICATION_TOOL_NAME}`;
export const CLAUDE_PRODUCT_SPEC_TOOL_NAME = `mcp__agent_os__${PRODUCT_SPEC_TOOL_NAME}`;
export const CLAUDE_DISPATCH_TASK_TOOL_NAME = `mcp__agent_os__${DISPATCH_TASK_TOOL_NAME}`;
export const CLAUDE_SCHEDULE_MANAGE_TOOL_NAME = `mcp__agent_os__${SCHEDULE_MANAGE_TOOL_NAME}`;
export const CLAUDE_REQUEST_APPROVAL_TOOL_NAME = `mcp__agent_os__${REQUEST_APPROVAL_TOOL_NAME}`;

function serverInvocation(): { command: string; args: string[] } {
  const runningFromTypeScript = import.meta.url.endsWith(".ts");
  const server = fileURLToPath(
    new URL(
      runningFromTypeScript
        ? "../mcp/app-tools-server.ts"
        : "../mcp/app-tools-server.js",
      import.meta.url,
    ),
  );
  if (!runningFromTypeScript) {
    return { command: process.execPath, args: [server] };
  }
  const tsxCli = fileURLToPath(
    new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url),
  );
  return { command: process.execPath, args: [tsxCli, server] };
}

export function claudeAppToolArgs(
  env?: Record<string, string>,
): string[] {
  const invocation = serverInvocation();
  return [
    "--mcp-config",
    JSON.stringify({
      mcpServers: {
        agent_os: {
          type: "stdio",
          command: invocation.command,
          args: invocation.args,
          ...(env && Object.keys(env).length > 0 ? { env } : {}),
        },
      },
    }),
  ];
}

// codex 的 -c 值会经 cmd 转发（Windows spawn shell:true），值里的双引号会被 cmd 吞掉：
// 用 JSON.stringify 生成 ["a","b"] 会让 codex 报 “invalid type: string, expected a sequence”。
// TOML 单引号字面量不含双引号且反斜杠原样保留，正好绕开；路径含 ' 时退回基本字符串。
function tomlString(value: string): string {
  if (!value.includes("'")) return `'${value}'`;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function codexAppToolArgs(env?: Record<string, string>): string[] {
  const invocation = serverInvocation();
  const args = [
    "-c",
    `mcp_servers.agent_os.command=${tomlString(invocation.command)}`,
    "-c",
    `mcp_servers.agent_os.args=[${invocation.args.map(tomlString).join(",")}]`,
  ];
  // codex 不会把父进程的环境变量传给 MCP 子进程，会话上下文必须显式写进配置。
  for (const [key, value] of Object.entries(env ?? {})) {
    args.push("-c", `mcp_servers.agent_os.env.${key}=${tomlString(value)}`);
  }
  return args;
}
