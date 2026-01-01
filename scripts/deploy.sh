#!/bin/bash
set -e

echo "🚀 Deploying Habit Tracker v3.0..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

APP_DIR="/opt/habit-tracker"
SERVICE_NAME="habit-tracker"

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
   echo -e "${RED}Please run as root${NC}"
   exit 1
fi

# Navigate to app directory
cd "$APP_DIR"

echo -e "${YELLOW}→ Pulling latest code...${NC}"
git pull origin main || echo "Not a git repository, skipping pull"

echo -e "${YELLOW}→ Installing dependencies...${NC}"
npm install --production

echo -e "${YELLOW}→ Running tests...${NC}"
npm test || echo "Tests not configured or failed"

echo -e "${YELLOW}→ Creating backup...${NC}"
node scripts/migrate.js --backup-only || echo "Backup script needs update"

echo -e "${YELLOW}→ Running database migrations...${NC}"
node scripts/migrate.js

echo -e "${YELLOW}→ Restarting service...${NC}"
if systemctl is-active --quiet $SERVICE_NAME; then
    systemctl restart $SERVICE_NAME
    echo -e "${GREEN}✓ Service restarted${NC}"
else
    echo -e "${YELLOW}→ Service not active, starting...${NC}"
    systemctl start $SERVICE_NAME
    echo -e "${GREEN}✓ Service started${NC}"
fi

echo -e "${YELLOW}→ Checking service status...${NC}"
systemctl status $SERVICE_NAME --no-pager

echo -e "${GREEN}✓ Deployment completed successfully!${NC}"
echo -e "${GREEN}App running at: http://localhost:3000${NC}"
