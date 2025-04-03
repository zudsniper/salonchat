#!/usr/bin/env node

import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const FRONTEND_URL = 'https://salonchat.zodworks.dev';
const API_URL = 'https://salonchat-api.zodworks.dev';
const SERVICE_TOKEN_CLIENT_ID = process.env.SERVICE_TOKEN_CLIENT_ID || '';
const SERVICE_TOKEN_CLIENT_SECRET = process.env.SERVICE_TOKEN_CLIENT_SECRET || '';

async function testZeroTrustConfig() {
  console.log('Testing Zero Trust Configuration');
  console.log('-------------------------------');
  console.log(`Frontend URL: ${FRONTEND_URL}`);
  console.log(`API URL: ${API_URL}`);
  console.log(`Service Token ID: ${SERVICE_TOKEN_CLIENT_ID.substring(0, 5)}...`);
  console.log(`Service Token Secret: ${SERVICE_TOKEN_CLIENT_SECRET ? '✓ Set' : '✗ Not Set'}`);
  console.log('-------------------------------\n');

  // Test 1: Direct API access without tokens (should be blocked)
  try {
    console.log('Test 1: Direct API access without tokens (should be blocked)');
    const response = await fetch(`${API_URL}/api/models`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log(`  Status: ${response.status}`);
    console.log(`  Message: ${response.status === 403 ? 'Blocked (expected)' : 'Not blocked (unexpected)'}`);
  } catch (error) {
    console.log(`  Error: ${error.message}`);
  }
  console.log('');

  // Test 2: Direct API access with service tokens
  try {
    console.log('Test 2: Direct API access with service tokens (should succeed)');
    const response = await fetch(`${API_URL}/api/models`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'CF-Access-Client-Id': SERVICE_TOKEN_CLIENT_ID,
        'CF-Access-Client-Secret': SERVICE_TOKEN_CLIENT_SECRET
      }
    });
    console.log(`  Status: ${response.status}`);
    if (response.ok) {
      const data = await response.json();
      console.log(`  Data: ${JSON.stringify(data).substring(0, 100)}...`);
      console.log(`  Message: Service tokens working correctly!`);
    } else {
      console.log(`  Message: Service tokens not working`);
    }
  } catch (error) {
    console.log(`  Error: ${error.message}`);
  }
  console.log('');

  // Test 3: Access through frontend worker
  try {
    console.log('Test 3: Access through frontend worker (should proxy with tokens)');
    const response = await fetch(`${FRONTEND_URL}/api/models`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log(`  Status: ${response.status}`);
    if (response.ok) {
      const data = await response.json();
      console.log(`  Data: ${JSON.stringify(data).substring(0, 100)}...`);
      console.log(`  Message: Worker proxy working correctly!`);
    } else {
      console.log(`  Message: Worker proxy not working`);
    }
  } catch (error) {
    console.log(`  Error: ${error.message}`);
  }
}

testZeroTrustConfig().catch(console.error);
