const axios = require('axios');
const { Connection, PublicKey, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');

class TradingEngine {
    constructor(connection) {
        this.connection = connection;
        this.jupiterApiUrl = process.env.JUPITER_API_URL || 'https://quote-api.jup.ag/v6';
        this.dexScreenerApi = process.env.DEX_SCREENER_API || 'https://api.dexscreener.com/latest';
    }

    // Get token price from DEX Screener
    async getTokenPrice(tokenAddress) {
        try {
            const response = await axios.get(`${this.dexScreenerApi}/dex/tokens/${tokenAddress}`);
            const pairs = response.data.pairs;
            
            if (pairs && pairs.length > 0) {
                const mainPair = pairs.find(p => p.dexId === 'raydium') || pairs[0];
                return {
                    price: parseFloat(mainPair.priceUsd),
                    priceChange24h: parseFloat(mainPair.priceChange.h24),
                    volume24h: parseFloat(mainPair.volume.h24),
                    marketCap: parseFloat(mainPair.fdv),
                    liquidity: parseFloat(mainPair.liquidity?.usd || 0)
                };
            }
            return null;
        } catch (error) {
            console.error('Error fetching token price:', error.message);
            return null;
        }
    }

    // Get Jupiter quote for token swap
    async getJupiterQuote(inputToken, outputToken, amount, slippage = 0.5) {
        try {
            const params = {
                inputMint: inputToken,
                outputMint: outputToken,
                amount: Math.floor(amount),
                slippageBps: Math.floor(slippage * 100)
            };

            const response = await axios.get(`${this.jupiterApiUrl}/quote`, { params });
            return response.data;
        } catch (error) {
            console.error('Error getting Jupiter quote:', error.message);
            return null;
        }
    }

    // Execute swap transaction through Jupiter
    async executeSwap(userKeypair, quote) {
        try {
            const swapRequest = {
                quoteResponse: quote,
                userPublicKey: userKeypair.publicKey.toString(),
                wrapAndUnwrapSol: true,
                dynamicComputeUnitLimit: true,
                prioritizationFeeLamports: 'auto'
            };

            const response = await axios.post(`${this.jupiterApiUrl}/swap`, swapRequest);
            const { swapTransaction } = response.data;

            // Deserialize transaction
            const transaction = Transaction.from(Buffer.from(swapTransaction, 'base64'));
            
            // Sign and send transaction
            const signature = await sendAndConfirmTransaction(
                this.connection,
                transaction,
                [userKeypair],
                { commitment: 'confirmed' }
            );

            return { success: true, signature };
        } catch (error) {
            console.error('Error executing swap:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Buy token with SOL
    async buyToken(userKeypair, tokenAddress, solAmount, slippage = 0.5) {
        const SOL_MINT = 'So11111111111111111111111111111111111111112';
        const amountInLamports = solAmount * 1e9; // Convert SOL to lamports

        const quote = await this.getJupiterQuote(
            SOL_MINT,
            tokenAddress,
            amountInLamports,
            slippage
        );

        if (!quote) {
            return { success: false, error: 'Failed to get quote' };
        }

        return await this.executeSwap(userKeypair, quote);
    }

    // Sell token for SOL
    async sellToken(userKeypair, tokenAddress, tokenAmount, slippage = 0.5) {
        const SOL_MINT = 'So11111111111111111111111111111111111111112';

        const quote = await this.getJupiterQuote(
            tokenAddress,
            SOL_MINT,
            tokenAmount,
            slippage
        );

        if (!quote) {
            return { success: false, error: 'Failed to get quote' };
        }

        return await this.executeSwap(userKeypair, quote);
    }

    // Get token balance for user
    async getTokenBalance(userPublicKey, tokenMint) {
        try {
            const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
                new PublicKey(userPublicKey),
                { mint: new PublicKey(tokenMint) }
            );

            if (tokenAccounts.value.length === 0) {
                return 0;
            }

            const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
            return balance || 0;
        } catch (error) {
            console.error('Error getting token balance:', error.message);
            return 0;
        }
    }

    // Monitor wallet for copy trading
    async monitorWallet(walletAddress, callback) {
        const publicKey = new PublicKey(walletAddress);
        
        // Subscribe to account changes
        const subscriptionId = this.connection.onAccountChange(
            publicKey,
            async (accountInfo) => {
                try {
                    // Get recent transactions
                    const signatures = await this.connection.getSignaturesForAddress(
                        publicKey,
                        { limit: 1 }
                    );

                    if (signatures.length > 0) {
                        const tx = await this.connection.getParsedTransaction(
                            signatures[0].signature,
                            { maxSupportedTransactionVersion: 0 }
                        );

                        // Analyze transaction for trading activity
                        const tradeInfo = this.parseTradeTransaction(tx);
                        if (tradeInfo) {
                            callback(tradeInfo);
                        }
                    }
                } catch (error) {
                    console.error('Error monitoring wallet:', error.message);
                }
            }
        );

        return subscriptionId;
    }

    // Parse transaction to extract trade information
    parseTradeTransaction(transaction) {
        if (!transaction || !transaction.transaction) {
            return null;
        }

        const instructions = transaction.transaction.message.instructions;
        
        // Look for Jupiter/Raydium/other DEX instructions
        for (const instruction of instructions) {
            if (instruction.parsed) {
                const { type, info } = instruction.parsed;
                
                if (type === 'transfer' && info.lamports) {
                    // SOL transfer detected
                    return {
                        type: 'transfer',
                        amount: info.lamports,
                        from: info.source,
                        to: info.destination,
                        signature: transaction.transaction.signatures[0]
                    };
                }
            }
        }

        return null;
    }

    // Auto sell with take profit / stop loss
    async autoSell(userKeypair, tokenAddress, tpPercentage, slPercentage, buyPrice) {
        const currentPrice = await this.getTokenPrice(tokenAddress);
        
        if (!currentPrice) {
            return { action: 'wait', reason: 'Unable to fetch current price' };
        }

        const priceChange = ((currentPrice.price - buyPrice) / buyPrice) * 100;
        
        if (priceChange >= tpPercentage) {
            // Take profit triggered
            const balance = await this.getTokenBalance(
                userKeypair.publicKey.toString(),
                tokenAddress
            );
            
            if (balance > 0) {
                const result = await this.sellToken(userKeypair, tokenAddress, balance);
                return { action: 'take_profit', result, priceChange };
            }
        } else if (priceChange <= -slPercentage) {
            // Stop loss triggered
            const balance = await this.getTokenBalance(
                userKeypair.publicKey.toString(),
                tokenAddress
            );
            
            if (balance > 0) {
                const result = await this.sellToken(userKeypair, tokenAddress, balance);
                return { action: 'stop_loss', result, priceChange };
            }
        }

        return { action: 'wait', priceChange };
    }

    // Token sniping for new launches
    async snipeNewTokens(userKeypair, criteria) {
        try {
            // This is a simplified version - in practice, you'd monitor
            // specific DEX programs for new token creation events
            
            const recentTokens = await this.getRecentTokenLaunches();
            
            for (const token of recentTokens) {
                if (this.meetsSnipeCriteria(token, criteria)) {
                    const result = await this.buyToken(
                        userKeypair,
                        token.address,
                        criteria.amount,
                        criteria.slippage
                    );
                    
                    if (result.success) {
                        return {
                            success: true,
                            token: token.address,
                            signature: result.signature
                        };
                    }
                }
            }
            
            return { success: false, reason: 'No suitable tokens found' };
        } catch (error) {
            console.error('Error sniping tokens:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Get recent token launches (placeholder - implement with real data source)
    async getRecentTokenLaunches() {
        // This would connect to a service that tracks new token launches
        // For now, return empty array
        return [];
    }

    // Check if token meets sniping criteria
    meetsSnipeCriteria(token, criteria) {
        // Implement criteria checking logic
        // Examples: minimum liquidity, maximum market cap, etc.
        return (
            token.liquidity >= criteria.minLiquidity &&
            token.marketCap <= criteria.maxMarketCap
        );
    }

    // Calculate PnL for a position
    calculatePnL(buyPrice, currentPrice, amount) {
        const totalBought = buyPrice * amount;
        const totalCurrent = currentPrice * amount;
        const pnl = totalCurrent - totalBought;
        const pnlPercentage = (pnl / totalBought) * 100;
        
        return {
            pnl,
            pnlPercentage,
            totalBought,
            totalCurrent
        };
    }

    // Get comprehensive wallet analytics
    async getWalletAnalytics(walletAddress) {
        try {
            const publicKey = new PublicKey(walletAddress);
            
            // Get transaction history
            const signatures = await this.connection.getSignaturesForAddress(
                publicKey,
                { limit: 100 }
            );
            
            let totalTrades = 0;
            let winningTrades = 0;
            let totalVolume = 0;
            let totalPnL = 0;
            
            for (const sig of signatures) {
                const tx = await this.connection.getParsedTransaction(
                    sig.signature,
                    { maxSupportedTransactionVersion: 0 }
                );
                
                if (tx) {
                    const tradeInfo = this.parseTradeTransaction(tx);
                    if (tradeInfo) {
                        totalTrades++;
                        totalVolume += tradeInfo.amount || 0;
                        
                        // Simplified P&L calculation
                        if (tradeInfo.profit > 0) {
                            winningTrades++;
                            totalPnL += tradeInfo.profit;
                        }
                    }
                }
            }
            
            const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
            const avgTradeSize = totalTrades > 0 ? totalVolume / totalTrades : 0;
            
            return {
                totalTrades,
                winningTrades,
                winRate,
                totalVolume,
                totalPnL,
                avgTradeSize,
                lastActivity: signatures[0]?.blockTime || 0
            };
        } catch (error) {
            console.error('Error getting wallet analytics:', error.message);
            return null;
        }
    }

    // Emergency sell all positions
    async emergencySellAll(userKeypair) {
        try {
            const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
                userKeypair.publicKey,
                { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
            );
            
            const results = [];
            
            for (const tokenAccount of tokenAccounts.value) {
                const tokenInfo = tokenAccount.account.data.parsed.info;
                const balance = tokenInfo.tokenAmount.uiAmount;
                
                if (balance > 0) {
                    const result = await this.sellToken(
                        userKeypair,
                        tokenInfo.mint,
                        balance,
                        5 // Higher slippage for emergency sells
                    );
                    
                    results.push({
                        token: tokenInfo.mint,
                        amount: balance,
                        result
                    });
                }
            }
            
            return results;
        } catch (error) {
            console.error('Error in emergency sell:', error.message);
            return [];
        }
    }

    // Real-time price alerts
    async setupPriceAlert(tokenAddress, targetPrice, userId, callback) {
        const checkPrice = async () => {
            const priceData = await this.getTokenPrice(tokenAddress);
            if (priceData && priceData.price >= targetPrice) {
                callback(userId, tokenAddress, priceData.price, targetPrice);
                clearInterval(interval);
            }
        };
        
        const interval = setInterval(checkPrice, 30000); // Check every 30 seconds
        return interval;
    }
}

module.exports = TradingEngine;