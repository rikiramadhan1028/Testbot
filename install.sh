// install.sh - Installation script
#!/bin/bash

echo "🚀 Installing Roku Trade Bot..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
echo "❌ Node.js is not installed. Please install Node.js 16 or higher."
exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js version 16 or higher is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create required directories
echo "📁 Creating directories..."
mkdir -p logs
mkdir -p backups

# Copy environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating environment file..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your configuration before starting the bot"
fi

# Check if MongoDB is running (if local)
if [ -z "$MONGODB_URI" ] || [[ "$MONGODB_URI" == *"localhost"* ]]; then
    if ! pgrep -x "mongod" > /dev/null; then
        echo "⚠️  MongoDB is not running. Please start MongoDB service."
        echo "   sudo systemctl start mongod"
    else
        echo "✅ MongoDB is running"
    fi
fi

# Install PM2 globally if not present
if ! command -v pm2 &> /dev/null; then
    echo "🔧 Installing PM2..."
    npm install -g pm2
fi

echo ""
echo "✅ Installation completed!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your configuration"
echo "2. Start the bot with: npm start"
echo "3. Or use PM2: pm2 start index.js --name roku-trade-bot"
echo ""
echo "For production deployment, see README.md"

# deploy.sh - Deployment script
#!/bin/bash

set -e

echo "🚀 Deploying Roku Trade Bot..."

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "❌ .env file not found. Please create it first."
    exit 1
fi

# Validate required environment variables
REQUIRED_VARS=("BOT_TOKEN" "SOLANA_RPC_URL" "ENCRYPTION_KEY" "MONGODB_URI")
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ Required environment variable $var is not set"
        exit 1
    fi
done

echo "✅ Environment variables validated"

# Install dependencies
echo "📦 Installing production dependencies..."
npm ci --only=production

# Run health check
echo "🔍 Running health check..."
timeout 30 node health-check.js || {
    echo "❌ Health check failed"
    exit 1
}

echo "✅ Health check passed"

# Stop existing process if running
if command -v pm2 &> /dev/null; then
    echo "🛑 Stopping existing bot process..."
    pm2 stop roku-trade-bot 2>/dev/null || true
    pm2 delete roku-trade-bot 2>/dev/null || true
fi

# Start with PM2
echo "🚀 Starting bot with PM2..."
pm2 start index.js --name roku-trade-bot --log-date-format="YYYY-MM-DD HH:mm:ss Z"

# Save PM2 configuration
pm2 save

# Setup PM2 startup
pm2 startup

echo ""
echo "✅ Deployment completed successfully!"
echo ""
echo "Bot status: $(pm2 describe roku-trade-bot | grep 'status' | head -1)"
echo ""
echo "Useful commands:"
echo "- View logs: pm2 logs roku-trade-bot"
echo "- Monitor: pm2 monit"
echo "- Restart: pm2 restart roku-trade-bot"
echo "- Stop: pm2 stop roku-trade-bot"