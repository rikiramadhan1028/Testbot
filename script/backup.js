// scripts/backup.js - Database backup utility
const mongoose = require('mongoose');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

async function createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, '..', 'backups', timestamp);
    
    try {
        await fs.mkdir(backupDir, { recursive: true });
        
        const mongodump = spawn('mongodump', [
            '--uri', process.env.MONGODB_URI,
            '--out', backupDir
        ]);
        
        mongodump.on('close', (code) => {
            if (code === 0) {
                console.log(`✅ Backup created successfully: ${backupDir}`);
            } else {
                console.error(`❌ Backup failed with code ${code}`);
            }
        });
        
    } catch (error) {
        console.error('❌ Backup error:', error.message);
    }
}

if (require.main === module) {
    createBackup();
}
