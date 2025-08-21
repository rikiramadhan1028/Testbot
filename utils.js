const crypto = require('crypto');
const { PublicKey } = require('@solana/web3.js');
const winston = require('winston');

// Logger configuration
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'roku-trade-bot' },
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// Encryption utilities
class CryptoUtils {
    static encrypt(text, key = process.env.ENCRYPTION_KEY) {
        const algorithm = 'aes-256-gcm';
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher(algorithm, key);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        return {
            iv: iv.toString('hex'),
            encryptedData: encrypted,
            authTag: authTag.toString('hex')
        };
    }

    static decrypt(encryptedData, key = process.env.ENCRYPTION_KEY) {
        const algorithm = 'aes-256-gcm';
        const decipher = crypto.createDecipher(algorithm, key);
        
        let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }

    static generateApiKey() {
        return crypto.randomBytes(32).toString('hex');
    }
}

// Validation utilities
class ValidationUtils {
    static isValidSolanaAddress(address) {
        try {
            new PublicKey(address);
            return true;
        } catch (error) {
            return false;
        }
    }

    static isValidAmount(amount, min = 0.001, max = 1000) {
        const num = parseFloat(amount);
        return !isNaN(num) && num >= min && num <= max;
    }

    static isValidPercentage(percentage, min = 0, max = 100) {
        const num = parseFloat(percentage);
        return !isNaN(num) && num >= min && num <= max;
    }

    static sanitizeInput(input) {
        if (typeof input !== 'string') return input;
        return input.replace(/[<>]/g, '').trim();
    }

    static isValidSlippage(slippage) {
        return this.isValidPercentage(slippage, 0.1, 50);
    }
}

// Format utilities
class FormatUtils {
    static formatSOL(lamports, decimals = 4) {
        return (lamports / 1e9).toFixed(decimals);
    }

    static formatNumber(number, decimals = 2) {
        if (number >= 1e9) {
            return (number / 1e9).toFixed(decimals) + 'B';
        } else if (number >= 1e6) {
            return (number / 1e6).toFixed(decimals) + 'M';
        } else if (number >= 1e3) {
            return (number / 1e3).toFixed(decimals) + 'K';
        }
        return number.toFixed(decimals);
    }

    static formatPercentage(number, decimals = 2) {
        const formatted = number.toFixed(decimals);
        return number >= 0 ? `+${formatted}%` : `${formatted}%`;
    }

    static formatPrice(price, decimals = 6) {
        if (price < 0.001) {
            return price.toExponential(2);
        }
        return price.toFixed(decimals);
    }

    static formatAddress(address, startChars = 4, endChars = 4) {
        if (address.length <= startChars + endChars) return address;
        return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
    }

    static formatTimeAgo(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return `${seconds}s ago`;
    }
}

// Rate limiting utilities
class RateLimiter {
    constructor(windowMs = 60000, maxRequests = 100) {
        this.windowMs = windowMs;
        this.maxRequests = maxRequests;
        this.requests = new Map();
    }

    isAllowed(userId) {
        const now = Date.now();
        const userRequests = this.requests.get(userId) || [];
        
        // Remove old requests outside the window
        const validRequests = userRequests.filter(
            timestamp => now - timestamp < this.windowMs
        );
        
        if (validRequests.length >= this.maxRequests) {
            return false;
        }
        
        validRequests.push(now);
        this.requests.set(userId, validRequests);
        
        return true;
    }

    getRemainingRequests(userId) {
        const now = Date.now();
        const userRequests = this.requests.get(userId) || [];
        const validRequests = userRequests.filter(
            timestamp => now - timestamp < this.windowMs
        );
        
        return Math.max(0, this.maxRequests - validRequests.length);
    }

    getResetTime(userId) {
        const userRequests = this.requests.get(userId) || [];
        if (userRequests.length === 0) return 0;
        
        const oldestRequest = Math.min(...userRequests);
        return oldestRequest + this.windowMs;
    }
}

// Error handling utilities
class ErrorUtils {
    static createError(message, code, statusCode = 500) {
        const error = new Error(message);
        error.code = code;
        error.statusCode = statusCode;
        return error;
    }

    static handleError(error, context = '') {
        logger.error(`Error in ${context}:`, {
            message: error.message,
            stack: error.stack,
            code: error.code
        });
        
        // Return user-friendly error message
        if (error.message.includes('insufficient funds')) {
            return 'Insufficient balance for this transaction.';
        } else if (error.message.includes('slippage')) {
            return 'Transaction failed due to high slippage. Try increasing slippage tolerance.';
        } else if (error.message.includes('network')) {
            return 'Network error. Please try again later.';
        } else if (error.message.includes('invalid')) {
            return 'Invalid input provided.';
        }
        
        return 'An unexpected error occurred. Please try again.';
    }
}

// Trading utilities
class TradingUtils {
    static calculateSlippageAmount(amount, slippagePercent) {
        return amount * (1 + slippagePercent / 100);
    }

    static calculatePriceImpact(inputAmount, outputAmount, price) {
        const expectedOutput = inputAmount * price;
        const impact = ((expectedOutput - outputAmount) / expectedOutput) * 100;
        return Math.max(0, impact);
    }

    static calculatePosition(entryPrice, currentPrice, amount) {
        const currentValue = amount * currentPrice;
        const initialValue = amount * entryPrice;
        const pnl = currentValue - initialValue;
        const pnlPercentage = (pnl / initialValue) * 100;
        
        return {
            currentValue,
            initialValue,
            pnl,
            pnlPercentage,
            isProfit: pnl > 0
        };
    }

    static shouldTakeProfit(currentPrice, entryPrice, tpPercentage) {
        const priceChange = ((currentPrice - entryPrice) / entryPrice) * 100;
        return priceChange >= tpPercentage;
    }

    static shouldStopLoss(currentPrice, entryPrice, slPercentage) {
        const priceChange = ((currentPrice - entryPrice) / entryPrice) * 100;
        return priceChange <= -slPercentage;
    }

    static calculateTrailingStop(currentPrice, highestPrice, trailingPercent) {
        const trailingAmount = highestPrice * (trailingPercent / 100);
        return highestPrice - trailingAmount;
    }
}

// Telegram utilities
class TelegramUtils {
    static createInlineKeyboard(buttons) {
        return {
            reply_markup: {
                inline_keyboard: buttons
            }
        };
    }

    static createReplyKeyboard(buttons, options = {}) {
        return {
            reply_markup: {
                keyboard: buttons,
                resize_keyboard: true,
                one_time_keyboard: options.oneTime || false,
                selective: options.selective || false
            }
        };
    }

    static escapeMarkdown(text) {
        return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
    }

    static createProgressBar(percentage, length = 10) {
        const filledLength = Math.round((percentage / 100) * length);
        const emptyLength = length - filledLength;
        
        return '█'.repeat(filledLength) + '░'.repeat(emptyLength);
    }
}

// Database utilities
class DatabaseUtils {
    static async withTransaction(session, operations) {
        try {
            await session.startTransaction();
            const result = await operations(session);
            await session.commitTransaction();
            return result;
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    static createPaginationQuery(page = 1, limit = 10) {
        const skip = (page - 1) * limit;
        return { skip, limit };
    }

    static async paginate(model, query = {}, options = {}) {
        const page = parseInt(options.page) || 1;
        const limit = parseInt(options.limit) || 10;
        const skip = (page - 1) * limit;
        
        const [data, total] = await Promise.all([
            model.find(query)
                .sort(options.sort || { createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate(options.populate || ''),
            model.countDocuments(query)
        ]);
        
        return {
            data,
            pagination: {
                current: page,
                pages: Math.ceil(total / limit),
                total,
                hasNext: page < Math.ceil(total / limit),
                hasPrev: page > 1
            }
        };
    }
}

// Performance monitoring
class PerformanceMonitor {
    static startTimer(label) {
        return {
            label,
            start: process.hrtime.bigint()
        };
    }

    static endTimer(timer) {
        const end = process.hrtime.bigint();
        const duration = Number(end - timer.start) / 1000000; // Convert to milliseconds
        
        logger.info(`Performance: ${timer.label} took ${duration.toFixed(2)}ms`);
        return duration;
    }

    static async measureAsync(label, asyncFunction) {
        const timer = this.startTimer(label);
        try {
            const result = await asyncFunction();
            this.endTimer(timer);
            return result;
        } catch (error) {
            this.endTimer(timer);
            throw error;
        }
    }
}

module.exports = {
    CryptoUtils,
    ValidationUtils,
    FormatUtils,
    RateLimiter,
    ErrorUtils,
    TradingUtils,
    TelegramUtils,
    DatabaseUtils,
    PerformanceMonitor,
    logger
};