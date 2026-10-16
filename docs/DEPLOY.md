# 服务器部署与飞书配置指南（大白话版）

这份文档只回答两件事：

1. **飞书那头怎么配**（建机器人、给权限、订阅事件、拉进群）；
2. **程序这头怎么放到服务器上一直活着**（装环境、传代码、pm2 常驻、开机自启）。

需要改哪个文件、填哪个值，都会说清楚。所有命令都在 **项目根目录**（本文档所在项目的根，也就是有 `package.json` 的那层）执行。

---

## 〇、先建立一张地图（30 秒版）

- **一个飞书机器人 = 一个飞书应用**。三个角色（CEO 助理 / 产品经理 / 开发者）就是三个应用，各自有 App ID 和 App Secret。
- 程序的配置分两层：
  - `.env`：放**凭证**（App ID、App Secret、你的 open_id、各种开关）。不进 git。
  - `config/bots.json`：放**团队名单**（谁叫什么、默认用哪个 CLI、在哪个项目目录干活、用什么技能）。不进 git。
- 会话、定时任务、审批状态这些运行数据放在 `data/` 目录，同样不进 git；重启不丢。
- 飞书和程序的通信方式选**长连接**：程序主动连飞书，你家电脑/服务器不需要公网 IP、域名和证书。

---

## 一、飞书配置（每个 bot 都要做一遍）

以下步骤在[飞书开放平台](https://open.feishu.cn/) → 右上角「开发者后台」里完成。做 3 遍（CEO 助理、产品经理、开发者各一个应用）；只想先跑通一台，就先做 1 个应用，把 `config/bots.json` 里其他成员删掉即可。

### 1. 创建应用、拿凭证

1. 开发者后台 →「创建飞书智能体应用」→ 立即创建（会自动预置一部分机器人能力）。
2. 进入应用 →「凭证与基础信息」，复制两个东西：
   - **App ID**（`cli_` 开头）
   - **App Secret**

把三个应用各自的凭证写进 `.env`（变量名要和 `config/bots.json` 里的 `appIdEnv` / `appSecretEnv` 对得上）：

```dotenv
FEISHU_CEO_ASSISTANT_APP_ID=cli_xxx
FEISHU_CEO_ASSISTANT_APP_SECRET=xxx
FEISHU_PRODUCT_APP_ID=cli_xxx
FEISHU_PRODUCT_APP_SECRET=xxx
FEISHU_DEVELOPER_APP_ID=cli_xxx
FEISHU_DEVELOPER_APP_SECRET=xxx
```

> `.env` 不提交、不外传。App Secret 泄露等于把机器人交给别人。

### 2. 开权限（应用 →「权限管理」里搜索并开通）

| 权限 | 用途 |
| --- | --- |
| `im:message`（获取与发送单聊、群组消息） | 接收消息 |
| `im:message:send_as_bot`（以应用的身份发消息） | 回复消息、发卡片 |
| `im:message.p2p_msg:readonly`（读取用户发给机器人的单聊消息） | 私聊消息（可选） |

> 产品经理还要做云文档评论 / 云文档交付时，才需要额外的 drive 相关能力，并且要装 `lark-cli`（见「六、可选能力清单」）。没装就把 `bots.json` 里的 `defaultProductDeliveryMode` 改成 `"local"`，产品方案会以本地 Markdown 落盘，功能不受影响。

### 3. 订阅方式选「长连接」，再订阅事件

1. 应用 →「事件与回调」→ 订阅方式：选**长连接**（不用填任何 URL），保存。
2. 在同一个页面订阅下面这些事件：
   - **接收消息** `im.message.receive_v1` —— 没有它机器人收不到任何话；
   - **卡片回传交互** `card.action.trigger` —— 「停止任务」「恢复会话」「需求澄清按钮」「审批放行/拒绝」全靠它；
   - **飞书文档评论** `drive.notice.comment_add_v1` —— 只有产品经理这个应用需要（用到云文档评论评审时）。

3. 保存后回到页面顶部，应该能看到「连接成功」的提示（需要程序正在运行）；程序没跑也没关系，联调时会自动连上。

### 4. 发布版本，把机器人拉进群

1.「版本管理与发布」→ 创建版本 → 申请发布（自建应用是免审的，发布即可用）。
2. 在飞书里**新建一个话题群**（不是普通群！话题群是"一个话题 = 一个任务"的关键），把机器人拉进群：群设置 → 群机器人 → 添加机器人。
3. 三个机器人拉进**同一个群**。它们之间的 @ 协作、派活、审批都是在这个群里发生的。

### 5. 拿到你自己的 open_id（30 秒）

把三个应用都配好、程序启动之后，在群里 `@CEO助理 你好`。终端日志里会有一行：

```text
[收到] chat=oc_xxx threadId=omt_xxx rootId=... sender=ou_xxxxxxxx
```

`sender=` 后面那串 `ou_` 开头就是你的 open_id，把它填进 `.env`：

```dotenv
OWNER_OPEN_ID=ou_xxxxxxxx
```

它的用途：定时任务和外部消息的"任务归属人"落在你头上；卡片会 @ 你；审批卡默认来找你。

### 6. （可选）运维群 webhook —— 日志巡检往哪报警

1. 新建一个群（运维群也一样要话题群）→ 群设置 → 群机器人 → 添加机器人 → **自定义机器人** → 复制 Webhook 地址。
2. 填进 `.env`：

```dotenv
PATROL_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxxx
```

3. 把**开发者机器人**也拉进这个运维群，否则巡检 @ 它时飞书不会真正通知到它。

---

## 二、本地先跑通（强烈建议先本地，再上服务器）

### 1. 准备环境

- Node.js ≥ 22（`node -v` 看一眼）
- pnpm（`npm install -g pnpm`）
- Claude Code（`npm install -g @anthropic-ai/claude-code`，`claude --version` 能出东西）
  - 没有 Anthropic 订阅时，按 Claude Code 官方文档把模型后端配到 DeepSeek 等兼容服务（在 `~/.claude/settings.json` 里配，不写进本项目）。
- Codex（`npm install -g @openai/codex`，`codex --version`）—— 只用 Claude 可以先不装，`bots.json` 里谁用 codex 就把那个成员删掉或改 `defaultCli`。

### 2. 配置

```bash
cd 项目目录
cp .env.example .env                  # 然后把「一、飞书配置」里拿到的凭证填进去
cp config/bots.example.json config/bots.json
```

打开 `config/bots.json`，重点改这几个字段，其他保持默认即可：

| 字段 | 说明 |
| --- | --- |
| `teamLeader` | 负责人 bot 的 id（默认 `ceo-assistant`） |
| `bots[].workspace` | **这个 bot 在哪个项目目录干活**。默认 `agent-os-team-example`，可以先不动 |
| `bots[].defaultCli` | 新话题默认交给 `claude` 还是 `codex` |
| `defaultProductDeliveryMode` | `lark-doc`（飞书云文档）或 `local`（本地 Markdown）。没装 lark-cli 就填 `local` |

### 3. 安装、构建、启动

```bash
pnpm install
pnpm build
pnpm start          # 开发模式，改代码/配置会自动重启
```

看到类似输出就说明活了：

```text
[配置] 已注册 3 个 bot，Team Leader=ceo-assistant，已恢复 0 个会话
[Bot CEO-ASSISTANT] default_cli=claude workspace=...
[Bot CEO-ASSISTANT] 已连接 name=... open_id=ou_...
```

> 如果报「bot xxx 缺少环境变量 FEISHU_xxx」，就是 `.env` 里的变量名和 `bots.json` 里的 `env` 名对不上，逐个核对。
>
> 如果日志里有 `[Skill] bot=product 找不到 $grill-me` 之类的警告：不影响启动，但对应能力会缺。把 `workspace-template/.agents/skills/` 下的技能目录复制到你的业务工作区（默认 `agent-os-team-example/.agents/skills/`）即可补齐。

### 4. 在飞书里验四个动作

1. `@CEO助理 /team` → 出团队卡片（三名成员、引擎、技能、连接状态）；
2. `@CEO助理 你好，做个自我介绍` → 卡片从蓝色跑到绿色，答案回到话题里；
3. 同一话题追问一句（"刚才我说了什么？"）→ 它记得，说明会话续接正常；
4. `@CEO助理 /schedule 每小时检查一次 demo-server 日志` → 会创建一条定时任务，`/schedules` 能看到它。

---

## 三、上服务器（Linux ECS / VPS，以 Ubuntu/Debian 为例）

### 1. 装基础环境（国内服务器用镜像，快很多）

```bash
sudo apt update && sudo apt install -y git
# Node 22（用 nvm，走国内镜像）
curl -o- https://gitee.com/mirrors/nvm/raw/master/install.sh | bash
source ~/.bashrc
export NVM_NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node
nvm install 22
npm config set registry https://registry.npmmirror.com
npm install -g pnpm pm2
```

### 2. 把代码放上去

如果项目推到了 Git 仓库（自己的私有仓库）：

```bash
git clone <你的仓库地址> agent-os && cd agent-os
pnpm install
pnpm build
```

也可以直接 rsync/scp 整个目录（**排除** `node_modules`、`dist`、`data`、`logs`、`.env`、`config/bots.json`，前两个可以重装重编译，后四个是运行数据/机密）。传完之后在服务器上 `pnpm install && pnpm build`。

### 3. 传两个机密文件

把本机跑通的这两个文件传到服务器项目根目录（它们只存在于运行环境）：

- `.env`
- `config/bots.json`

### 4. 让 claude / codex 在服务器上可用

```bash
claude --version
codex --version
```

能出版本号还不够，**必须在服务器上完成一次登录**（或配置好兼容模型端点），否则 Agent 接到任务会启动失败。国内服务器访问海外模型服务通常需要代理或使用兼容端点，模型配置属于两个 CLI 自己的用户级配置（`~/.claude/settings.json`、`~/.codex/`），不写在 Agent OS 里。

> systemd/Docker 运行时注意：CLI 的登录态在哪个用户的家目录，就给哪个用户跑；换用户要重新登录或把 `HOME` 指过去。

### 5. 启动并设置开机自启

先用自带的 doctor 自检：

```bash
pnpm agent-os doctor
# node / pnpm / pm2 / claude / codex 逐个显示版本；.env 和 config/bots.json 显示"存在"才ok
```

启动：

```bash
pnpm agent-os start     # 没构建会自动 build；跑着就重启，没跑就 pm2 启动；最后 pm2 save
pm2 startup             # 按提示执行它输出的那一行命令，之后服务器重启会自动拉起
```

常用管理：

```bash
pnpm agent-os status    # 看进程在不在线
pnpm agent-os logs      # 看实时日志（Ctrl+C 退出查看，不影响进程）
pnpm agent-os restart   # 重启
pnpm agent-os stop      # 停止
```

不想用 pm2 的话，`deploy/` 目录里给了 systemd 和 Docker 两份等价配置和用法注释。

### 6. 后续更新

```bash
git pull
pnpm install
pnpm build
pm2 restart agent-os
```

改了 `.env` 或 `config/bots.json` 也要 restart 一次；只改 `data/schedules.json` 不用——它是热更新的（程序运行中监听文件变化，几秒内自动生效）。

### 7. 部署后冒烟检查

- `pnpm agent-os status` 显示 `agent-os` 在线；
- 群里 @ 任意 bot，消息触发任务、卡片正常刷新；
- `@CEO助理 /schedules` 能看到巡检计划，`/schedule run <id>` 立即触发能跑；
- 制造一次 critical（用「四、进阶」里的 demo-server 故障注入），审批卡能弹出来，放行/拒绝都能走通；
- 重启服务器后，`pm2 status` 里 agent-os 自动回来了。

---

## 四、进阶：让系统自己动起来（可选，但很值）

1. **日志巡检闭环**：`demo-server` 是一个会写结构化日志、可注入故障的示例服务（`pnpm demo:server` 启动，`pnpm demo:traffic --scenario repeated-error` 造故障）。它的巡检手册在 `demo-server/.agents/skills/log-patrol/SKILL.md`，把「一、飞书配置」里的 `PATROL_WEBHOOK_URL` 配好，再在飞书里建一条"每小时巡检"的定时任务即可。
2. 巡检发现 critical 会 @ 开发者 → 开发者接手排查 → 要动重启这类高危操作时调 `request_approval` → 你在审批卡上拍板 → 放行后它才继续。整条链路不需要你盯。
3. **换一个项目给团队用**：把 `config/bots.json` 里各成员的 `workspace` 指到你的项目，再把 `workspace-template/.agents/skills/`（含 `grill-me` / `to-spec` / `to-tickets` / `implement-ticket`）和 `workspace-template/docs/agents/issue-tracker.md` 复制过去，产品经理就能按"澄清 → Spec → Tickets → 实现"的流程工作。

---

## 五、常见问题排查（按症状查）

| 症状 | 大概率原因 / 怎么办 |
| --- | --- |
| 启动报「找不到 bot 配置文件」 | 没复制 `config/bots.example.json` 为 `config/bots.json` |
| 启动报「bot xxx 缺少环境变量」 | `.env` 缺变量，或变量名与 `bots.json` 不匹配，或 `.env` 没放对目录 |
| 群里 @ 机器人没反应 | ①应用版本没发布；②事件 `im.message.receive_v1` 没订阅；③订阅方式不是长连接；④机器人没被拉进群 |
| 卡片按钮点了没反应 | 事件 `card.action.trigger`（卡片回传交互）没订阅 |
| 卡片停在"正在理解任务"不动 | 看日志：常见是 claude/codex 没装、没登录、工作目录不存在 |
| 任务跑几分钟就超时 | 默认单次执行 2 小时，可调 `.env` 的 `CLI_TIMEOUT_MS`（或 `CLAUDE_TIMEOUT_MS` / `CODEX_TIMEOUT_MS`） |
| 定时任务到点没跑 | 看 `/schedules` 的下次执行时间；看 `data/schedule-runs.json` 的运行记录（`skipped` 说明上一轮还没跑完，本轮自动跳过了） |
| 巡检不推送 | `.env` 没配 `PATROL_WEBHOOK_URL`；或开发者机器人不在运维群里（@ 不到） |
| 审批卡不出现 | 开发者没调 `request_approval`（检查巡检 skill 的派活要求），或应用没订阅卡片回传交互事件 |
| 重启后定时任务还在吗 | 在。计划在 `data/schedules.json`，重启后自动重新排程；错过的一次性任务会记为 skipped，不会重启补跑 |
| 想换 Claude/Codex 的模型 | 属于 CLI 自己的配置（`~/.claude/settings.json` / Codex 配置），改完 CLI 重启 Agent OS 即可 |

---

## 六、可选能力清单（用不到可以跳过）

| 能力 | 需要额外装什么 | 影响 |
| --- | --- | --- |
| 产品方案输出成飞书云文档 + 文档评论评审 | `lark-cli`（`npx @larksuite/cli@latest install`，然后 `lark-cli auth login --domain docs`、`--domain drive`），并把产品经理的 `skills` 里保留 `lark-doc`/`lark-drive` | 不装：把 `defaultProductDeliveryMode` 改 `local` |
| 开发者内部"真浏览器验收"（Tester Sub Agent） | `agent-browser`（`npm install -g agent-browser && agent-browser install`）+ 把 `workspace-template/.claude/agents/tester.md`、`.codex/agents/tester.toml` 复制到业务工作区 | 不装：开发者仍可实现和自检，但没有独立浏览器验收 |
| 独立代码审查（Code Reviewer Sub Agent） | `code-review-expert`（`npx skills add sanyuan0704/sanyuan-skills --path skills/code-review-expert`）+ 对应的 agent 配置 | 不装：少一道跨模型/独立上下文审查 |
| 原版社区技能（grill-me / to-spec / to-tickets） | `npx skills add mattpocock/skills --skill grill-me --skill to-spec --skill to-tickets --agent '*' -y` | 本项目已在 `workspace-template/` 提供等价版本，先用自带的即可 |

---

## 七、一句话总结

飞书那头：**每个 bot 一个应用，开消息+卡片权限，选长连接，订阅接收消息和卡片回传，发布，拉进话题群**。
程序这头：**`.env` 填凭证、`bots.json` 填团队，`pnpm build` 之后 `pnpm agent-os start`，`pm2 startup` 一挂，它就自己活着了。**
