module.exports = {
  apps: [
    {
      name: 'onpass_socket',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: { NODE_ENV: 'production' }
    }
  ]
};
