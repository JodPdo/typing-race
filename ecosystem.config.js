// PM2 process definition for the Typing Race server (Phase 6C).
//
// Usage on the VPS (from the repo root):
//   pm2 start ecosystem.config.js   # first time
//   pm2 reload typing-race          # zero-downtime restart on deploy
//   pm2 save                        # persist across reboots
//
// NOTE: secrets (DATABASE_URL, etc.) are NOT defined here — they are provided by the
// server environment (e.g. an untracked /etc/typing-race.env or pm2 ecosystem env file on
// the box). Never commit real connection strings. See DEPLOY.md.

module.exports = {
  apps: [
    {
      name: 'typing-race',
      cwd: './server',
      script: 'dist/index.js',
      interpreter: 'node',
      exec_mode: 'fork', // single instance: live room state is in-memory, not shared
      instances: 1,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3004,
        // DATABASE_URL and any other secrets come from the server environment, not here.
      },
    },
  ],
};
