#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { parseServices } = require('./src/parseFullServices');

// Constants
const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8787';
const SERVICES_DATA_PATH = path.join(__dirname, '../resources/services-prompt.txt');

/**
 * Main function to setup the vector database
 */
async function main() {
  try {
    console.log('Salon Chat Vector Database Setup');
    console.log('--------------------------------');
    
    // Check worker status
    console.log('Checking worker status...');
    const statusResponse = await fetch(`${WORKER_URL}/api/status`);
    if (!statusResponse.ok) {
      throw new Error(`Worker not responding correctly: ${statusResponse.status}`);
    }
    
    const status = await statusResponse.json();
    console.log(`Worker status: ${status.status}`);
    console.log(`Current services in database: ${status.services}`);
    console.log(`Vectorize available: ${status.vectorizeAvailable ? 'Yes' : 'No'}`);
    
    if (!status.vectorizeAvailable) {
      console.warn('\nWARNING: Vectorize binding not available in worker.');
      console.warn('Vector embeddings will not be stored.');
      console.warn('Please update the worker configuration with a vectorize binding.\n');
    }
    
    // Parse services data
    console.log('\nParsing salon services data...');
    const data = fs.readFileSync(SERVICES_DATA_PATH, 'utf8');
    const services = parseServices(data);
    console.log(`Parsed ${services.length} services`);
    
    // Confirm before proceeding
    console.log('\nReady to upload services to the database and generate embeddings.');
    console.log('This will REPLACE any existing data in the database.');
    
    // Prompt for confirmation unless --force flag is used
    if (!process.argv.includes('--force')) {
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      await new Promise((resolve) => {
        readline.question('Continue? (y/N): ', (answer) => {
          readline.close();
          if (answer.toLowerCase() !== 'y') {
            console.log('Aborted.');
            process.exit(0);
          }
          resolve();
        });
      });
    }
    
    // Upload services
    console.log('\nUploading services and generating embeddings...');
    const uploadResponse = await fetch(`${WORKER_URL}/api/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ services })
    });
    
    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.status}`);
    }
    
    const result = await uploadResponse.json();
    
    // Report results
    console.log(`\nProcessed ${result.processed} services`);
    
    const successful = result.results.filter(r => r.success).length;
    const failed = result.results.filter(r => !r.success).length;
    
    console.log(`Successfully processed: ${successful}`);
    console.log(`Failed to process: ${failed}`);
    
    if (failed > 0) {
      console.log('\nFailures:');
      result.results
        .filter(r => !r.success)
        .forEach(r => console.log(`- ${r.name}: ${r.error}`));
    }
    
    console.log('\nSetup completed successfully!');
    
    // Check service count after upload
    const finalStatusResponse = await fetch(`${WORKER_URL}/api/status`);
    if (finalStatusResponse.ok) {
      const finalStatus = await finalStatusResponse.json();
      console.log(`Final service count in database: ${finalStatus.services}`);
    }
    
  } catch (error) {
    console.error('Error setting up database:', error);
    process.exit(1);
  }
}

// Execute main function
main();
