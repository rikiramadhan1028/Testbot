// scripts/migrate.js - Database migration utility
async function migrate() {
    try {
        console.log('🔄 Running database migrations...');
        
        // Migration 1: Add new fields to users
        await User.updateMany(
            { 'settings.maxPositions': { $exists: false } },
            { $set: { 'settings.maxPositions': 10 } }
        );
        
        // Migration 2: Update old transaction format
        await Transaction.updateMany(
            { metadata: { $exists: false } },
            { $set: { metadata: {} } }
        );
        
        // Migration 3: Add indexes if not exists
        await User.collection.createIndex({ 'referralCode': 1 }, { sparse: true });
        await Position.collection.createIndex({ 'userId': 1, 'tokenAddress': 1 });
        
        console.log('✅ Migrations completed successfully');
        
    } catch (error) {
        console.error('❌ Migration error:', error.message);
    }
}

