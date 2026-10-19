# Docker 部署范例。
#
# Claude Code / Codex 是 Agent OS 的运行依赖，需要你在镜像里额外安装并完成登录，
# 且登录态（~/.claude、~/.codex）要挂载进容器；没有完成这一步，容器里的任务会启动失败。
# 建议先按 docs/DEPLOY.md 在主机上把 claude / codex 都跑通，再考虑容器化。

FROM node:22-bookworm

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY demo-server/package.json demo-server/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# 运行数据、配置与日志通过挂载注入：
#   -v $(pwd)/.env:/app/.env
#   -v $(pwd)/config:/app/config
#   -v $(pwd)/data:/app/data
#   -v $HOME/.claude:/root/.claude
#   -v $HOME/.codex:/root/.codex
EXPOSE 3101

CMD ["node", "dist/index.js"]
