#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { parseSalonServices } = require('./src/parse-data');

// URL of the deployed worker
const WORKER_URL = 'https://salon-vectorize-setup.your-account.workers.dev';

async function main() {
  try {
    // Read the sample data
    const samplePath = path.join(__dirname, 'sample-data.txt');
    const data = fs.readFileSync(samplePath, 'utf8');
    
    // Parse the services
    const services = parseSalonServices(data);
    console.log(`Parsed ${services.length} services`);
    
    // Upload to worker
    console.log('Uploading services to database...');
    
    const response = await fetch(`${WORKER_URL}/api/setup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ services }),
    });
    
    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${await response.text()}`);
    }
    
    const result = await response.json();
    
    console.log('Upload completed!');
    console.log(`Processed ${result.processed} services`);
    
    // Count successes and failures
    const successes = result.results.filter(r => r.success).length;
    const failures = result.results.filter(r => !r.success).length;
    
    console.log(`Successful: ${successes}`);
    console.log(`Failed: ${failures}`);
    
    // Log any failures
    if (failures > 0) {
      console.log('\nFailures:');
      result.results
        .filter(r => !r.success)
        .forEach(r => console.log(`- ${r.name}: ${r.error}`));
    }
  } catch (error) {
    console.error('Error setting up database:', error);
    process.exit(1);
  }
}

main();
