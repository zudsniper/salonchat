#!/bin/bash
# Script to install and use the correct Node.js version

# Check if nvm is installed
if ! command -v nvm &> /dev/null; then
    echo "NVM not found. Installing NVM..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
    
    # Source nvm
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi

# Install and use Node.js 22.14.0
echo "Installing Node.js 22.14.0..."
nvm install 22.14.0
nvm use 22.14.0

# Verify installation
node -v
npm -v

echo "Node.js 22.14.0 is now active"
