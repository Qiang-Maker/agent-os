# Agent OS —— 一个人，一队 Agent

把飞书变成 AI 编程 CLI（Claude Code / Codex）的指挥台。

一个话题 = 一个任务；一个话题 = 一个会话；bot 之间可以互相 @ 派活；定时任务让系统在你没说话时继续运转；高危操作停下来等你拍板。

> 部署与飞书配置看这里：**[docs/DEPLOY.md（大白话版）](docs/DEPLOY.md)**
> 给 AI 看的项目说明书：**[CLAUDE.md](CLAUDE.md)**

---

## 这是什么

- **入口**：飞书话题群（移动端/桌面端随时派活、看进度、做审批）。
- **执行引擎**：本机的 Claude Code（`claude -p --output-format stream-json`）与 Codex（`codex exec --json`），做成可插拔适配器。
- **指挥层（本项目）**：消息解析、会话内核、流式卡片、多 bot 协作、MCP 工具、定时调度、审批门。
- **不调模型 API**：模型调用、工具执行、上下文管理都由两个 CLI 自己负责——我们造的是上面的指挥层。

## 能力清单

| 模块 | 说明 |
| --- | --- |
| 飞书接入 | WS 长连接收消息、话题内回复、@提及解析、图片/文件下载、交互卡片 |
| 会话内核 | 一个话题一个会话（bot 维度隔离）、状态机、JSON 原子落盘、重启恢复 |
| CLI 引擎 | CliAdapter 抽象、多轮 `--resume`、stream-json 事件链、流式任务卡片、停止按钮 |
| 双引擎 | Claude Code / Codex 同构接入，`/claude` `/codex` 显式选择，话题内引擎唯一 |
| 工作目录 | bot 默认项目 + 话题级 `/cd` 切换，切目录自动换 CLI 会话 |
| 会话管理 | `/new` `/resume`（历史会话卡片）`/compact`（调用引擎原生压缩） |
| 团队协作 | `dispatch_task` 派活、交接单+收件箱、`reportToBotId` 结果回到编排者、轮次熔断 |
| 需求澄清 | `request_clarification` MCP 工具 → 飞书表单卡片 → 答案续接原 CLI 会话 |
| 产品文档 | `request_spec_approval` → 本地 Spec/Tickets 或飞书云文档 → 确认卡 → 自动交回 CEO |
| 文档评论 | 云文档里的评论可 @ 产品经理直接触发修改 |
| 定时调度 | once/interval/cron 三种规则、执行记录与幂等、`/schedule` 命令、`schedule_manage` 工具、HTTP API、schedules.json 热更新 |
| 审批门 | `request_approval` 硬闸门（调用即停机）、审批卡片、放行/拒绝/超时自动拒绝 |
| 演示服务 | `demo-server`：结构化日志 + 故障注入 + 巡检手册 + 运维群 webhook 通知 |

## 快速开始（本地）

```bash
pnpm install
pnpm build

cp .env.example .env                      # 填飞书凭证等
cp config/bots.example.json config/bots.json

pnpm start                                # 开发模式（watch）
# 或
pnpm agent-os doctor                      # 环境自检
pnpm agent-os start                       # pm2 常驻
```

在飞书话题群里 @ 任意 bot 说句话即可。首次没配好飞书应用时，参考 [docs/DEPLOY.md](docs/DEPLOY.md)，15 分钟能配完一台。

## 目录结构

```text
src/
├── index.ts            # 入口：加载配置、连 bot、组装运行主线
├── deploy-cli.ts       # 部署 CLI（doctor/start/stop/restart/status/logs）
├── im/                 # 飞书接入层（lark / message-parser / card）
├── core/               # 领域内核（会话、协作、澄清、产品文档、审批、调度、团队）
├── cli/                # CLI 引擎（adapters / runner / 原生会话 / 原生压缩 / MCP 参数）
├── mcp/                # 本地 MCP Server（5 个应用工具）
├── app/                # 运行主线（runtime / 命令 / 卡片动作 / 各类 runner）
└── probe-*.ts          # 独立探针（事件流解析、MCP 工具验证）
config/
├── bots.example.json   # 团队名单模板（复制为 bots.json）
demo-server/            # 示例业务服务（日志巡检演示）
example-project/        # 最小示例项目（协作演示用）
workspace-template/     # 业务工作区模板（skills / subagents / issue-tracker）
deploy/                 # pm2 / systemd / Docker 部署配置范例
```

## 常用命令

```bash
pnpm dev / pnpm start        # 开发（watch 源码、.env、config/*.json）
pnpm start:once              # 跑一次
pnpm build                   # 类型检查 + 编译到 dist/
pnpm start:prod              # 生产模式跑编译产物
pnpm agent-os <cmd>          # doctor / start / stop / restart / status / logs
pnpm probe:cli               # 事件流解析探针
pnpm probe:tool claude|codex # 验证 MCP 工具链
pnpm demo:server             # 启动示例服务（默认 3222 端口）
pnpm demo:traffic [scenario] # 给示例服务造流量（normal/slow/error-spike/repeated-error/db-down）
```

## 飞书里可用的命令

```text
/status            查看当前会话（含 CLI 会话、工作目录）
/team              查看 Agent 团队名册
/new               开启全新 CLI 会话
/resume            恢复历史会话（点选卡片）
/compact [要求]     用当前引擎原生压缩上下文
/cd [目录]          查看/切换当前话题的工作目录
/schedule <需求>    自然语言创建定时任务（交给 CEO 助理转结构化调用）
/schedules         查看定时任务列表
/schedule pause|resume|delete|run <id>
/close             关闭当前会话
/help              查看命令
/claude <任务>      新话题指定 Claude Code
/codex <任务>       新话题指定 Codex
```

## 环境变量（完整说明见 .env.example）

| 变量 | 用途 |
| --- | --- |
| `BOTS_CONFIG` | bot 注册文件路径，默认 `config/bots.json` |
| `FEISHU_*_APP_ID/SECRET` | 每个 bot 的飞书应用凭证（变量名由 bots.json 指定） |
| `OWNER_OPEN_ID` | 你的 open_id（任务归属、@ 通知用） |
| `CLI_WORKDIR` | 默认工作目录（可被 bots.json 的 workspace 覆盖） |
| `CLI_TIMEOUT_MS` / `CLAUDE_TIMEOUT_MS` / `CODEX_TIMEOUT_MS` | 单次执行超时，默认 2 小时 |
| `SCHEDULE_API_PORT` / `SCHEDULE_API_TOKEN` | 定时任务管理接口（本机回环） |
| `PATROL_WEBHOOK_URL` | 运维群自定义机器人 webhook（日志巡检推送用） |

## 已知限制与注意事项

- 群聊里机器人**只响应 @它 的消息**（受飞书「获取群组中用户@机器人消息」权限约束）；私聊不受此限。
- 卡片上的**按钮**（停止任务 / 审批 / 澄清表单）依赖订阅 `card.action.trigger` 回调——飞书应用后台要把它一起配上（见 docs/DEPLOY.md）。
- 服务要**常驻**才有"随时在线"的效果：本地 `pnpm start` 关掉终端就停；生产用 `deploy/` 里的 pm2 / systemd / Docker。
- Windows 注意事项：`tsx watch` 不会因 `.env` 变更自动重启（改完 .env 手动重启一次）；长时间运行建议放独立终端或 pm2 等进程管理工具。
- 引擎可用性：`claude` / `codex` 至少装一个并完成登录；`pnpm agent-os doctor` 会检查。模型能力差异由各自 CLI 决定，本项目不做模型层适配。
- 定时任务 / 审批 / 澄清等能力依赖本机回环接口（`SCHEDULE_API_PORT`），请勿把该端口暴露到公网。

## License

[MIT](LICENSE)
