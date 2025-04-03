#!/bin/bash

# SalonChat Frontend Setup Script

echo "Setting up SalonChat frontend with Zero Trust protection"

# Install dependencies
echo "Installing dependencies..."
npm install

# Create service token
echo "Creating service token for backend access..."
node scripts/generate-token.js create

# Setup instructions
echo ""
echo "Next steps:"
echo "1. Configure Zero Trust in Cloudflare dashboard (see zero-trust-setup.md)"
echo "2. Set service token environment variables:"
echo "   wrangler secret put SERVICE_TOKEN_CLIENT_ID"
echo "   wrangler secret put SERVICE_TOKEN_CLIENT_SECRET"
echo "3. Deploy the application:"
echo "   ./scripts/deploy.sh" 