#!/bin/bash
# Script to handle setup with correct Node.js version

# Source NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Use Node.js 22.14.0
nvm use 22.14.0 || nvm install 22.14.0

# Install dependencies
npm install

# Run your setup script
node setup.js --force

echo "Setup completed with Node.js $(node -v)"
