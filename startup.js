// startup.js
const { logger } = require('./utils');
const mongoose = require('mongoose');

async function startup() {
    try {
        logger.info('🚀 Starting Roku Trade Bot...');
        
        // Validate environment variables
        const requiredEnvs = ['BOT_TOKEN', 'SOLANA_RPC_URL', 'ENCRYPTION_KEY', 'MONGODB_URI'];
        const missing = requiredEnvs.filter(env => !process.env[env]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }
        
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            maxPoolSize: 10,
            bufferMaxEntries: 0,
            connectTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        });
        
        logger.info('📊 Database connected successfully');
        
        // Create necessary indexes
        await createIndexes();
        
        // Start the bot
        require('./index');
        
        logger.info('🎯 Bot started successfully');
        
    } catch (error) {
        logger.error('💥 Failed to start bot:', error);
        process.exit(1);
    }
}

async function createIndexes() {
    const { User, Position, Transaction, CopyTrade } = require('./database');
    
    try {
        await Promise.all([
            User.collection.createIndex({ telegramId: 1 }, { unique: true }),
            User.collection.createIndex({ walletAddress: 1 }, { unique: true }),
            Position.collection.createIndex({ userId: 1, status: 1 }),
            Position.collection.createIndex({ tokenAddress: 1 }),
            Transaction.collection.createIndex({ userId: 1, createdAt: -1 }),
            Transaction.collection.createIndex({ signature: 1 }, { unique: true }),
            CopyTrade.collection.createIndex({ userId: 1, isActive: 1 }),
            CopyTrade.collection.createIndex({ targetWallet: 1, isActive: 1 })
        ]);
        
        logger.info('📊 Database indexes created');
    } catch (error) {
        logger.warn('⚠️ Some indexes may already exist:', error.message);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('🛑 Received SIGTERM, shutting down gracefully...');
    await mongoose.connection.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    logger.info('🛑 Received SIGINT, shutting down gracefully...');
    await mongoose.connection.close();
    process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('💥 Unhandled Rejection:', reason);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    logger.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

if (require.main === module) {
    startup();
}

module.exports = { startup, createIndexes };

