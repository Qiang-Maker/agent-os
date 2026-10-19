// pm2 进程守护配置：pm2 start deploy/ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'agent-os',
      script: 'dist/index.js',
      cwd: __dirname + '/..',
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
      out_file: 'logs/agent-os.out.log',
      error_file: 'logs/agent-os.err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
