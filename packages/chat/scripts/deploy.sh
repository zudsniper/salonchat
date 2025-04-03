#!/bin/bash

# SalonChat Frontend Deployment Script

echo "Building React app..."
npm run build

echo "Deploying to Cloudflare Workers..."
npx wrangler deploy

echo "Done! Frontend deployed to salonchat.zodworks.dev"
echo "Verify Zero Trust protection is working with 'node scripts/test-zero-trust.js'" 