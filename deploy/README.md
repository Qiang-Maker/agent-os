# 三种常驻方式

完整步骤（大白话版）见 `docs/DEPLOY.md`，这里只列文件用途。

| 方式 | 文件 | 适用 |
| --- | --- | --- |
| pm2 | `ecosystem.config.cjs` | 推荐；本地和 ECS 通用，`pnpm agent-os start` 底层就是它 |
| systemd | `agent-os.service` | Linux 服务器上不想装 pm2 时的原生方案 |
| Docker | `Dockerfile` + `docker-compose.yml` | 需要容器化的场景；注意 claude / codex 需在镜像内可用并挂载登录态 |

pm2 快速用法：

```bash
pnpm build
pm2 start deploy/ecosystem.config.cjs
pm2 save && pm2 startup   # 开机自启
```
