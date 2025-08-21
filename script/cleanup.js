// scripts/cleanup.js - Database cleanup utility
const { User, Transaction, Position } = require('../database');

async function cleanup() {
    try {
        // Remove old transactions (older than 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        
        const oldTransactions = await Transaction.deleteMany({
            createdAt: { $lt: sixMonthsAgo },
            status: 'confirmed'
        });
        
        console.log(`🗑️ Removed ${oldTransactions.deletedCount} old transactions`);
        
        // Remove inactive users (no activity for 3 months)
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        
        const inactiveUsers = await User.find({
            'statistics.lastTradeAt': { $lt: threeMonthsAgo },
            'statistics.totalTrades': 0
        });
        
        console.log(`👥 Found ${inactiveUsers.length} inactive users`);
        
        // Close stale positions (older than 1 year)
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        
        const stalePositions = await Position.updateMany(
            {
                buyTimestamp: { $lt: oneYearAgo },
                status: 'open'
            },
            {
                status: 'closed',
                sellTimestamp: new Date()
            }
        );
        
        console.log(`📊 Closed ${stalePositions.modifiedCount} stale positions`);
        
    } catch (error) {
        console.error('❌ Cleanup error:', error.message);
    }
}

if (require.main === module) {
    cleanup();
}
