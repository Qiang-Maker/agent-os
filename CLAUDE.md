# agent-os

把飞书变成 AI 编程 CLI（Claude Code / Codex）的指挥台。
一个话题 = 一个任务；bot 之间可互相 @ 协作；cron 定时巡检。

## 运行

pnpm dev（tsx watch）/ pnpm start / pnpm build

## 约定

- ESM only，Node 22+，pnpm；相对导入带 `.js` 后缀
- TypeScript 7 需在 tsconfig 显式声明 `"types": ["node"]`
- Windows 下 CLI 的 prompt 走 stdin（见 `src/cli/types.ts` 的 `promptInputForPlatform`），避免 cmd 转义问题
- 子项目需要独立安装依赖时，给它自己的 `pnpm-workspace.yaml`（参考 example-project）
- 凭证只放 .env（已 gitignore），绝不硬编码、绝不提交

## 模块地图

- src/index.ts — 入口（连飞书长连接）
- src/probe-cli.ts — 事件流解析器
- src/im/lark.ts — 飞书接入（WS 长连接收消息 + REST 回消息）
- src/im/message-parser.ts — @提及解析与富媒体资源提取
- src/im/card.ts — 任务卡片构建 + 节流更新器（ThrottledCardUpdater）
- src/core/session-manager.ts — 会话模型（一个话题一个会话 + 状态机）
- src/core/session-store.ts — 会话持久化（Zod 校验 + 原子写入）
- src/core/command-parser.ts — /close /status /help 命令解析 + /claude /codex 引擎请求
- src/core/task-progress.ts — 任务进度快照（TaskProgressTracker）
- src/core/task-abort.ts — 运行中任务清单与停止指令（ActiveRun）
- src/cli/types.ts — CliAdapter 接口与统一事件类型（CliEvent）
- src/cli/runner.ts — 通用 CLI 运行器（spawn/超时/取消/事件分发）
- src/cli/spawn-cli.ts — 跨平台子进程启动与进程树清理
- src/cli/claude-adapter.ts — Claude Code 适配器
- src/cli/codex-adapter.ts — Codex 适配器
- src/cli/registry.ts — 执行引擎注册表（claude/codex）
- src/cli/native-sessions.ts — 读取 Claude Code / Codex 原生历史会话
- src/cli/native-compact.ts — 调用引擎原生上下文压缩（/compact）
- src/core/bot-registry.ts — bot 注册表（凭证/引擎/角色/工作目录/reviewBy）
- src/core/workspace.ts — 工作目录解析与校验（/cd）
- src/core/collaboration.ts — 通用交接单（dispatch_task）/收件箱/协作来源
- src/core/clarification.ts — 需求澄清 Schema、流程 Store、owner 判断
- src/core/product-spec.ts — 产品文档提交 Schema、确认 Flow Store（local / lark-doc）
- src/core/product-spec-store.ts — 产品确认状态的 JSON 持久化
- src/core/approval.ts — 高危操作审批 Schema、审批 Flow Store
- src/core/approval-store.ts — 审批状态的 JSON 持久化
- src/core/schedule.ts — 定时任务规则/计划/管理请求 Schema
- src/core/schedule-store.ts — 定时任务计划持久化（导出 ScheduledTaskSchema 供热更新校验）
- src/core/schedule-run-store.ts — 定时任务运行记录（幂等/裁剪）
- src/core/team-registry.ts — 团队名册、上下文与 Skill 检查
- src/core/topic-task.ts — 群+话题 → 稳定任务编号
- src/mcp/app-tools-server.ts — 本地 MCP Server（澄清/产品文档/派发/定时/审批五个工具）
- src/cli/app-tools.ts — MCP 工具名与双 CLI 启动参数
- src/app/scheduler.ts — 定时任务调度器（注册/恢复/触发/熔断）
- src/app/schedule-manage-service.ts / schedule-api.ts / schedule-watcher.ts — 管理执行/HTTP API/文件热更新
- src/app/scheduled-task-runner.ts — 到点静默唤醒目标 bot 会话（threadId=scheduled-<taskId>）
- src/app/approval-runner.ts — 审批结果恢复开发者会话
- src/app/ — 运行主线（runtime/cli-execution/session-view/command-handler/card-action-handler/notification/collaboration-service/product-*）
