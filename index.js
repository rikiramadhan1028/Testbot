const TelegramBot = require('node-telegram-bot-api');
const { Connection, PublicKey, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const bs58 = require('bs58');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

// Initialize bot and Solana connection
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// In-memory storage (replace with database in production)
const users = new Map();
const userWallets = new Map();
const userSettings = new Map();
const copyTrades = new Map();
const positions = new Map();

// Utility functions
const encrypt = (text) => {
    const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
};

const decrypt = (text) => {
    const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY);
    let decrypted = decipher.update(text, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};

const formatSOL = (lamports) => {
    return (lamports / LAMPORTS_PER_SOL).toFixed(4);
};

const createInlineKeyboard = (buttons) => {
    return {
        reply_markup: {
            inline_keyboard: buttons
        }
    };
};

// User management
const initializeUser = async (userId) => {
    if (!users.has(userId)) {
        const keypair = Keypair.generate();
        const encryptedPrivateKey = encrypt(bs58.encode(keypair.secretKey));
        
        users.set(userId, {
            id: userId,
            registered: new Date(),
            balance: 0
        });
        
        userWallets.set(userId, {
            publicKey: keypair.publicKey.toString(),
            encryptedPrivateKey
        });
        
        userSettings.set(userId, {
            slippage: 0.5,
            priority_fee: 0.01,
            auto_sell: false,
            tp_percentage: 100,
            sl_percentage: 50
        });
        
        copyTrades.set(userId, new Set());
        positions.set(userId, new Map());
    }
};

// Wallet functions
const getWalletBalance = async (publicKey) => {
    try {
        const balance = await connection.getBalance(new PublicKey(publicKey));
        return balance;
    } catch (error) {
        console.error('Error getting balance:', error);
        return 0;
    }
};

const sendSOL = async (fromKeypair, toPublicKey, amount) => {
    try {
        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: fromKeypair.publicKey,
                toPubkey: new PublicKey(toPublicKey),
                lamports: amount * LAMPORTS_PER_SOL,
            })
        );
        
        const signature = await connection.sendTransaction(transaction, [fromKeypair]);
        await connection.confirmTransaction(signature);
        return signature;
    } catch (error) {
        console.error('Error sending SOL:', error);
        throw error;
    }
};

// Bot commands
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    await initializeUser(userId);
    const wallet = userWallets.get(userId);
    
    const welcomeMessage = `
🚀 *Welcome to Roku Trade Bot!*

Your wallet has been created:
📍 *Address:* \`${wallet.publicKey}\`

🔥 *Features Available:*
• High-speed Solana trading
• Copy trading
• Token sniping  
• Auto TP/SL
• Smart analytics

💡 Send some SOL to your wallet to get started!

Use /help to see all commands.
    `;
    
    const keyboard = createInlineKeyboard([
        [{ text: '💰 Wallet', callback_data: 'wallet' }],
        [{ text: '📈 Buy', callback_data: 'buy' }, { text: '📉 Sell', callback_data: 'sell' }],
        [{ text: '⚙️ Settings', callback_data: 'settings' }]
    ]);
    
    await bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown', ...keyboard });
});

bot.onText(/\/wallet/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!users.has(userId)) {
        return bot.sendMessage(chatId, 'Please use /start first to initialize your wallet.');
    }
    
    const wallet = userWallets.get(userId);
    const balance = await getWalletBalance(wallet.publicKey);
    
    const walletMessage = `
💰 *Your Wallet*

📍 *Address:* \`${wallet.publicKey}\`
💎 *Balance:* ${formatSOL(balance)} SOL

🔄 *Actions:*
    `;
    
    const keyboard = createInlineKeyboard([
        [{ text: '📤 Withdraw', callback_data: 'withdraw' }],
        [{ text: '🔑 Export Private Key', callback_data: 'export_key' }],
        [{ text: '🔄 Refresh', callback_data: 'wallet' }]
    ]);
    
    await bot.sendMessage(chatId, walletMessage, { parse_mode: 'Markdown', ...keyboard });
});

bot.onText(/\/positions/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!users.has(userId)) {
        return bot.sendMessage(chatId, 'Please use /start first.');
    }
    
    const userPositions = positions.get(userId);
    
    if (userPositions.size === 0) {
        return bot.sendMessage(chatId, '📊 No positions found. Start trading to see your positions here!');
    }
    
    let positionsMessage = '📊 *Your Positions*\n\n';
    
    userPositions.forEach((position, token) => {
        positionsMessage += `🪙 *${token}*\n`;
        positionsMessage += `💰 Amount: ${position.amount}\n`;
        positionsMessage += `💵 Value: $${position.value}\n`;
        positionsMessage += `📈 PnL: ${position.pnl > 0 ? '+' : ''}${position.pnl}%\n\n`;
    });
    
    await bot.sendMessage(chatId, positionsMessage, { parse_mode: 'Markdown' });
});

bot.onText(/\/settings/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!users.has(userId)) {
        return bot.sendMessage(chatId, 'Please use /start first.');
    }
    
    const settings = userSettings.get(userId);
    
    const settingsMessage = `
⚙️ *Trading Settings*

🎯 *Slippage:* ${settings.slippage}%
💸 *Priority Fee:* ${settings.priority_fee} SOL
🤖 *Auto Sell:* ${settings.auto_sell ? '✅ On' : '❌ Off'}
🎯 *Take Profit:* ${settings.tp_percentage}%
🛑 *Stop Loss:* ${settings.sl_percentage}%
    `;
    
    const keyboard = createInlineKeyboard([
        [{ text: '🎯 Slippage', callback_data: 'set_slippage' }],
        [{ text: '💸 Priority Fee', callback_data: 'set_priority_fee' }],
        [{ text: '🤖 Auto Sell', callback_data: 'toggle_auto_sell' }],
        [{ text: '🎯 TP/SL', callback_data: 'set_tp_sl' }]
    ]);
    
    await bot.sendMessage(chatId, settingsMessage, { parse_mode: 'Markdown', ...keyboard });
});

bot.onText(/\/copytrade/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!users.has(userId)) {
        return bot.sendMessage(chatId, 'Please use /start first.');
    }
    
    const followedWallets = copyTrades.get(userId);
    
    let copyTradeMessage = '🔄 *Copy Trading*\n\n';
    
    if (followedWallets.size === 0) {
        copyTradeMessage += 'No wallets being copied.\n\nUse /follow <wallet_address> to start copying a wallet.';
    } else {
        copyTradeMessage += '*Following wallets:*\n';
        followedWallets.forEach(wallet => {
            copyTradeMessage += `• \`${wallet}\`\n`;
        });
    }
    
    const keyboard = createInlineKeyboard([
        [{ text: '➕ Add Wallet', callback_data: 'add_copy_wallet' }],
        [{ text: '➖ Remove Wallet', callback_data: 'remove_copy_wallet' }]
    ]);
    
    await bot.sendMessage(chatId, copyTradeMessage, { parse_mode: 'Markdown', ...keyboard });
});

bot.onText(/\/follow (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const walletAddress = match[1];
    
    if (!users.has(userId)) {
        return bot.sendMessage(chatId, 'Please use /start first.');
    }
    
    try {
        new PublicKey(walletAddress); // Validate address
        const followedWallets = copyTrades.get(userId);
        followedWallets.add(walletAddress);
        
        await bot.sendMessage(chatId, `✅ Now copying trades from: \`${walletAddress}\``, { parse_mode: 'Markdown' });
    } catch (error) {
        await bot.sendMessage(chatId, '❌ Invalid wallet address format.');
    }
});

bot.onText(/\/snipe/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!users.has(userId)) {
        return bot.sendMessage(chatId, 'Please use /start first.');
    }
    
    const snipeMessage = `
🎯 *Token Sniping*

Configure automatic token sniping for new launches.

⚠️ *Warning:* Sniping involves high risks. Only trade with funds you can afford to lose.
    `;
    
    const keyboard = createInlineKeyboard([
        [{ text: '⚙️ Configure Snipe', callback_data: 'configure_snipe' }],
        [{ text: '🎯 Active Snipes', callback_data: 'active_snipes' }]
    ]);
    
    await bot.sendMessage(chatId, snipeMessage, { parse_mode: 'Markdown', ...keyboard });
});

bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    
    const helpMessage = `
📚 *Roku Trade Bot Commands*

*Basic Commands:*
/start - Initialize your wallet
/wallet - View wallet information
/positions - View your positions
/settings - Trading settings

*Trading:*
/buy - Manual buy order
/sell - Manual sell order
/copytrade - Copy trading setup
/follow <address> - Follow a wallet
/snipe - Token sniping

*Other:*
/help - Show this help message

*Inline Buttons:* Use the buttons for quick actions!
    `;
    
    await bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// Callback query handlers
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;
    
    await bot.answerCallbackQuery(query.id);
    
    switch (data) {
        case 'wallet':
            // Re-trigger wallet command
            await bot.sendMessage(chatId, '/wallet');
            bot.emit('message', { chat: { id: chatId }, from: { id: userId }, text: '/wallet' });
            break;
            
        case 'buy':
            await bot.sendMessage(chatId, `
📈 *Buy Tokens*

Enter the token address or symbol you want to buy:
Example: \`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\` (USDC)

Or use quick buy amounts:
            `, { parse_mode: 'Markdown' });
            break;
            
        case 'sell':
            await bot.sendMessage(chatId, `
📉 *Sell Tokens*

Select a token from your positions to sell, or enter a token address:
            `);
            break;
            
        case 'settings':
            bot.emit('message', { chat: { id: chatId }, from: { id: userId }, text: '/settings' });
            break;
            
        case 'export_key':
            const wallet = userWallets.get(userId);
            if (wallet) {
                const privateKey = decrypt(wallet.encryptedPrivateKey);
                await bot.sendMessage(chatId, `
🔑 *Private Key Export*

⚠️ *NEVER share your private key with anyone!*

\`${privateKey}\`

Save this securely and delete this message after copying.
                `, { parse_mode: 'Markdown' });
            }
            break;
            
        case 'toggle_auto_sell':
            const settings = userSettings.get(userId);
            settings.auto_sell = !settings.auto_sell;
            await bot.sendMessage(chatId, `Auto Sell ${settings.auto_sell ? 'enabled' : 'disabled'} ✅`);
            break;
    }
});

// Error handling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the bot
console.log('🚀 Roku Trade Bot is starting...');
console.log(`Bot token: ${BOT_TOKEN ? 'Set' : 'Not set'}`);
console.log(`Solana RPC: ${SOLANA_RPC_URL}`);
console.log('Bot is running! Send /start to begin.');

module.exports = { bot, connection };