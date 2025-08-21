const mongoose = require('mongoose');

// User Schema
const userSchema = new mongoose.Schema({
    telegramId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    username: String,
    firstName: String,
    lastName: String,
    walletAddress: {
        type: String,
        required: true,
        index: true
    },
    encryptedPrivateKey: {
        type: String,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isPremium: {
        type: Boolean,
        default: false
    },
    referredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    referralCode: {
        type: String,
        unique: true,
        sparse: true
    },
    settings: {
        slippage: {
            type: Number,
            default: 0.5,
            min: 0.1,
            max: 10
        },
        priorityFee: {
            type: Number,
            default: 0.01,
            min: 0.001,
            max: 1
        },
        autoSell: {
            type: Boolean,
            default: false
        },
        takeProfitPercentage: {
            type: Number,
            default: 100,
            min: 1,
            max: 1000
        },
        stopLossPercentage: {
            type: Number,
            default: 50,
            min: 1,
            max: 99
        },
        maxPositions: {
            type: Number,
            default: 10,
            min: 1,
            max: 50
        },
        defaultBuyAmount: {
            type: Number,
            default: 0.1,
            min: 0.01,
            max: 100
        }
    },
    statistics: {
        totalTrades: {
            type: Number,
            default: 0
        },
        winningTrades: {
            type: Number,
            default: 0
        },
        totalVolume: {
            type: Number,
            default: 0
        },
        totalPnL: {
            type: Number,
            default: 0
        },
        lastTradeAt: Date
    }
}, {
    timestamps: true
});

// Position Schema
const positionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    tokenAddress: {
        type: String,
        required: true,
        index: true
    },
    tokenSymbol: String,
    tokenName: String,
    amount: {
        type: Number,
        required: true
    },
    buyPrice: {
        type: Number,
        required: true
    },
    buySignature: String,
    buyTimestamp: {
        type: Date,
        required: true
    },
    sellPrice: Number,
    sellSignature: String,
    sellTimestamp: Date,
    status: {
        type: String,
        enum: ['open', 'closed', 'partial'],
        default: 'open'
    },
    pnl: {
        type: Number,
        default: 0
    },
    pnlPercentage: {
        type: Number,
        default: 0
    },
    isAutoSell: {
        type: Boolean,
        default: false
    },
    takeProfitPrice: Number,
    stopLossPrice: Number
}, {
    timestamps: true
});

// Copy Trade Schema
const copyTradeSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    targetWallet: {
        type: String,
        required: true,
        index: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    copyRatio: {
        type: Number,
        default: 1,
        min: 0.1,
        max: 10
    },
    maxAmount: {
        type: Number,
        default: 1,
        min: 0.01,
        max: 100
    },
    delaySeconds: {
        type: Number,
        default: 5,
        min: 0,
        max: 300
    },
    onlyBuys: {
        type: Boolean,
        default: false
    },
    onlySells: {
        type: Boolean,
        default: false
    },
    minTradeAmount: {
        type: Number,
        default: 0.01
    },
    statistics: {
        totalCopied: {
            type: Number,
            default: 0
        },
        successfulCopies: {
            type: Number,
            default: 0
        },
        totalPnL: {
            type: Number,
            default: 0
        }
    }
}, {
    timestamps: true
});

// Snipe Configuration Schema
const snipeConfigSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    isActive: {
        type: Boolean,
        default: false
    },
    buyAmount: {
        type: Number,
        required: true,
        min: 0.01,
        max: 10
    },
    maxSlippage: {
        type: Number,
        default: 10,
        min: 1,
        max: 50
    },
    criteria: {
        minLiquidity: {
            type: Number,
            default: 1000
        },
        maxMarketCap: {
            type: Number,
            default: 1000000
        },
        minHolders: {
            type: Number,
            default: 50
        },
        maxSupply: {
            type: Number,
            default: 1000000000
        }
    },
    blacklistedTokens: [String],
    whitelistedTokens: [String]
}, {
    timestamps: true
});

// Transaction Schema
const transactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    signature: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    type: {
        type: String,
        enum: ['buy', 'sell', 'transfer', 'copy', 'snipe'],
        required: true
    },
    tokenAddress: String,
    tokenSymbol: String,
    amount: Number,
    price: Number,
    solAmount: Number,
    slippage: Number,
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'failed'],
        default: 'pending'
    },
    blockTime: Date,
    fee: Number,
    metadata: {
        copyFromWallet: String,
        isAutoTrade: Boolean,
        strategy: String
    }
}, {
    timestamps: true
});

// Price Alert Schema
const priceAlertSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    tokenAddress: {
        type: String,
        required: true,
        index: true
    },
    tokenSymbol: String,
    targetPrice: {
        type: Number,
        required: true
    },
    condition: {
        type: String,
        enum: ['above', 'below'],
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isTriggered: {
        type: Boolean,
        default: false
    },
    triggeredAt: Date,
    triggeredPrice: Number
}, {
    timestamps: true
});

// Bot Analytics Schema
const analyticsSchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true,
        index: true
    },
    activeUsers: Number,
    totalTrades: Number,
    totalVolume: Number,
    successfulTrades: Number,
    failedTrades: Number,
    newUsers: Number,
    premiumUsers: Number,
    revenue: Number
}, {
    timestamps: true
});

// Referral Schema
const referralSchema = new mongoose.Schema({
    referrerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    referredId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    commission: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['pending', 'paid'],
        default: 'pending'
    }
}, {
    timestamps: true
});

// Add indexes for better performance
userSchema.index({ telegramId: 1, isActive: 1 });
positionSchema.index({ userId: 1, status: 1 });
positionSchema.index({ tokenAddress: 1, status: 1 });
copyTradeSchema.index({ userId: 1, isActive: 1 });
copyTradeSchema.index({ targetWallet: 1, isActive: 1 });
transactionSchema.index({ userId: 1, type: 1 });
transactionSchema.index({ blockTime: -1 });
priceAlertSchema.index({ userId: 1, isActive: 1 });
priceAlertSchema.index({ tokenAddress: 1, isActive: 1 });

// Virtual fields
userSchema.virtual('winRate').get(function() {
    if (this.statistics.totalTrades === 0) return 0;
    return (this.statistics.winningTrades / this.statistics.totalTrades) * 100;
});

positionSchema.virtual('currentValue').get(function() {
    // This would be calculated with current price in real implementation
    return this.amount * this.buyPrice;
});

// Pre-save middleware
userSchema.pre('save', function(next) {
    if (this.isNew && !this.referralCode) {
        this.referralCode = this.telegramId + Math.random().toString(36).substr(2, 5);
    }
    next();
});

// Create models
const User = mongoose.model('User', userSchema);
const Position = mongoose.model('Position', positionSchema);
const CopyTrade = mongoose.model('CopyTrade', copyTradeSchema);
const SnipeConfig = mongoose.model('SnipeConfig', snipeConfigSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const PriceAlert = mongoose.model('PriceAlert', priceAlertSchema);
const Analytics = mongoose.model('Analytics', analyticsSchema);
const Referral = mongoose.model('Referral', referralSchema);

module.exports = {
    User,
    Position,
    CopyTrade,
    SnipeConfig,
    Transaction,
    PriceAlert,
    Analytics,
    Referral
};