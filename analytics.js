// scripts/analytics.js - Generate analytics report
const { User, Transaction, Position } = require('../database');

async function generateAnalytics() {
    try {
        const now = new Date();
        const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        // User statistics
        const totalUsers = await User.countDocuments();
        const activeUsersDay = await User.countDocuments({
            'statistics.lastTradeAt': { $gte: dayAgo }
        });
        const activeUsersWeek = await User.countDocuments({
            'statistics.lastTradeAt': { $gte: weekAgo }
        });
        const newUsersMonth = await User.countDocuments({
            createdAt: { $gte: monthAgo }
        });
        
        // Trading statistics
        const totalTrades = await Transaction.countDocuments({ type: { $in: ['buy', 'sell'] } });
        const tradesDay = await Transaction.countDocuments({
            type: { $in: ['buy', 'sell'] },
            createdAt: { $gte: dayAgo }
        });
        const tradesWeek = await Transaction.countDocuments({
            type: { $in: ['buy', 'sell'] },
            createdAt: { $gte: weekAgo }
        });
        
        // Volume statistics
        const volumeDay = await Transaction.aggregate([
            {
                $match: {
                    type: { $in: ['buy', 'sell'] },
                    createdAt: { $gte: dayAgo }
                }
            },
            {
                $group: {
                    _id: null,
                    totalVolume: { $sum: '$solAmount' }
                }
            }
        ]);
        
        // Position statistics
        const openPositions = await Position.countDocuments({ status: 'open' });
        const profitablePositions = await Position.countDocuments({
            status: 'closed',
            pnl: { $gt: 0 }
        });
        const totalClosedPositions = await Position.countDocuments({ status: 'closed' });
        
        const analytics = {
            timestamp: now,
            users: {
                total: totalUsers,
                activeDay: activeUsersDay,
                activeWeek: activeUsersWeek,
                newMonth: newUsersMonth
            },
            trading: {
                totalTrades,
                tradesDay,
                tradesWeek,
                volumeDay: volumeDay[0]?.totalVolume || 0
            },
            positions: {
                open: openPositions,
                profitable: profitablePositions,
                totalClosed: totalClosedPositions,
                winRate: totalClosedPositions > 0 ? (profitablePositions / totalClosedPositions * 100).toFixed(2) : 0
            }
        };
        
        console.log('📊 Analytics Report:');
        console.log(JSON.stringify(analytics, null, 2));
        
        return analytics;
        
    } catch (error) {
        console.error('❌ Analytics error:', error.message);
    }
}

if (require.main === module) {
    generateAnalytics();
}