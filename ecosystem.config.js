// ecosystem.config.js - PM2 configuration
module.exports = {
    apps: [{
        name: 'roku-trade-bot',
        script: 'index.js',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '1G',
        env: {
            NODE_ENV: 'development'
        },
        env_production: {
            NODE_ENV: 'production'
        },
        error_file: './logs/err.log',
        out_file: './logs/out.log',
        log_file: './logs/combined.log',
        time: true,
        cron_restart: '0 4 * * *', // Restart daily at 4 AM
        max_restarts: 10,
        min_uptime: '10s'
    }]
};