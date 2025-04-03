/**
 * Service Token Management Script
 * 
 * This script helps manage Cloudflare Zero Trust service tokens for communication
 * between frontend and backend workers.
 * 
 * Usage:
 * 1. Create token: node scripts/generate-token.js create
 * 2. Rotate token: node scripts/generate-token.js rotate
 * 3. Show config: node scripts/generate-token.js config
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TOKEN_FILE = path.join(__dirname, '../.service-token.json');

function generateRandomToken() {
  return crypto.randomBytes(24).toString('hex');
}

function createToken() {
  const token = {
    clientId: generateRandomToken(),
    clientSecret: generateRandomToken(),
    created: new Date().toISOString()
  };
  
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2));
  console.log('✅ Service token created');
  console.log('');
  console.log('To configure in Cloudflare Zero Trust:');
  console.log('1. Go to Zero Trust → Access → Service Auth');
  console.log('2. Create a new service token with these credentials');
  console.log(`   Client ID: ${token.clientId}`);
  console.log(`   Client Secret: ${token.clientSecret}`);
  console.log('');
  console.log('To add to your worker:');
  console.log('$ wrangler secret put SERVICE_TOKEN_CLIENT_ID');
  console.log('$ wrangler secret put SERVICE_TOKEN_CLIENT_SECRET');
}

function rotateToken() {
  if (!fs.existsSync(TOKEN_FILE)) {
    console.error('❌ No existing token found. Create one first.');
    process.exit(1);
  }
  
  const oldToken = JSON.parse(fs.readFileSync(TOKEN_FILE));
  
  // Create new token with same client ID but new secret
  const newToken = {
    clientId: oldToken.clientId,
    clientSecret: generateRandomToken(),
    created: new Date().toISOString(),
    previousSecret: oldToken.clientSecret
  };
  
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(newToken, null, 2));
  
  console.log('✅ Service token rotated');
  console.log('');
  console.log('To update in Cloudflare Zero Trust:');
  console.log('1. Go to Zero Trust → Access → Service Auth');
  console.log('2. Find the service token with this Client ID:');
  console.log(`   Client ID: ${newToken.clientId}`);
  console.log('3. Update the Client Secret to:');
  console.log(`   Client Secret: ${newToken.clientSecret}`);
  console.log('');
  console.log('To update your worker:');
  console.log('$ wrangler secret put SERVICE_TOKEN_CLIENT_SECRET');
}

function showConfig() {
  if (!fs.existsSync(TOKEN_FILE)) {
    console.error('❌ No existing token found. Create one first.');
    process.exit(1);
  }
  
  const token = JSON.parse(fs.readFileSync(TOKEN_FILE));
  
  console.log('🔑 Current Service Token Configuration');
  console.log('');
  console.log(`Client ID: ${token.clientId}`);
  console.log(`Client Secret: ${token.clientSecret}`);
  console.log(`Created: ${token.created}`);
  console.log('');
  console.log('Command to set in worker:');
  console.log(`wrangler secret put SERVICE_TOKEN_CLIENT_ID --value "${token.clientId}"`);
  console.log(`wrangler secret put SERVICE_TOKEN_CLIENT_SECRET --value "${token.clientSecret}"`);
}

// Handle command line arguments
const command = process.argv[2];

switch (command) {
  case 'create':
    createToken();
    break;
  case 'rotate':
    rotateToken();
    break;
  case 'config':
    showConfig();
    break;
  default:
    console.log('Usage:');
    console.log('  node scripts/generate-token.js create  - Create new service token');
    console.log('  node scripts/generate-token.js rotate  - Rotate service token secret');
    console.log('  node scripts/generate-token.js config  - Show current configuration');
} 