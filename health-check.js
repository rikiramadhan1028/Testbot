// health-check.js
const mongoose = require('mongoose'); // This line is correct
const TelegramBot = require('node-telegram-bot-api');
const { Connection } = require('@solana/web3.js');

async function healthCheck() {
    const checks = [];
    
    try {
        // Check MongoDB
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000
        });
        checks.push('✅ MongoDB: Connected');
        await mongoose.connection.close();
    } catch (error) {
        checks.push(`❌ MongoDB: ${error.message}`);
        process.exit(1);
    }
    
    try {
        // Check Telegram Bot
        const bot = new TelegramBot(process.env.BOT_TOKEN);
        await bot.getMe();
        checks.push('✅ Telegram Bot: Active');
    } catch (error) {
        checks.push(`❌ Telegram Bot: ${error.message}`);
        process.exit(1);
    }
    
    try {
        // Check Solana RPC
        const connection = new Connection(process.env.SOLANA_RPC_URL);
        await connection.getVersion();
        checks.push('✅ Solana RPC: Connected');
    } catch (error) {
        checks.push(`❌ Solana RPC: ${error.message}`);
        process.exit(1);
    }
    
    console.log('Health Check Results:');
    checks.forEach(check => console.log(check));
    process.exit(0);
}

if (require.main === module) {
    healthCheck();
}

module.exports = healthCheck;
