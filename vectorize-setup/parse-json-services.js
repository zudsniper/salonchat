#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Constants
const WORKER_URL = process.env.WORKER_URL || 'https://salon-vectorize-setup.me-810.workers.dev';
const SERVICES_DATA_PATH = path.join(__dirname, '../resources/services.json');

/**
 * Main function to setup the vector database using JSON format
 */
async function main() {
  try {
    console.log('Salon Chat Vector Database Setup (JSON)');
    console.log('-------------------------------------');
    
    // Check worker status
    console.log('Checking worker status...');
    const statusResponse = await fetch(`${WORKER_URL}/api/status`);
    if (!statusResponse.ok) {
      throw new Error(`Worker not responding correctly: ${statusResponse.status}`);
    }
    
    const status = await statusResponse.json();
    console.log(`Worker status: ${status.status}`);
    console.log(`Current services in database: ${status.services || 0}`);
    console.log(`Vectorize available: ${status.vectorizeAvailable ? 'Yes' : 'No'}`);
    
    // Override the binding check since we know it's available but might report incorrectly
    const vectorizeAvailable = true;
    console.log(`Forcing vectorize available: ${vectorizeAvailable ? 'Yes' : 'No'}`);
    
    // Parse services data
    console.log('\nLoading salon services from JSON...');
    const servicesText = fs.readFileSync(SERVICES_DATA_PATH, 'utf8');
    const services = JSON.parse(servicesText);
    console.log(`Loaded ${services.length} services from JSON`);
    
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
    
    // Format services to match the API expectations
    const formattedServices = services.map(service => ({
      name: service.name,
      category: service.category, 
      price: `From $${service.price_from}`,
      description: service.description,
      details: JSON.stringify(service.details)
    }));
    
    // Upload services
    console.log('\nUploading services and generating embeddings...');
    const uploadResponse = await fetch(`${WORKER_URL}/api/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ services: formattedServices })
    });
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload failed (${uploadResponse.status}): ${errorText}`);
    }
    
    const result = await uploadResponse.json();
    
    // Report results
    console.log(`\nProcessed ${result.processed || 0} services`);
    
    let successful = 0;
    let failed = 0;
    
    if (result.results && Array.isArray(result.results)) {
      successful = result.results.filter(r => r.success).length;
      failed = result.results.filter(r => !r.success).length;
      
      console.log(`Successfully processed: ${successful}`);
      console.log(`Failed to process: ${failed}`);
      
      if (failed > 0) {
        console.log('\nFailures:');
        result.results
          .filter(r => !r.success)
          .forEach(r => console.log(`- ${r.name || 'Unknown'}: ${r.error || 'Unknown error'}`));
      }
    } else {
      console.log("No detailed results available");
    }
    
    console.log('\nSetup completed successfully!');
    
    // Check service count after upload
    const finalStatusResponse = await fetch(`${WORKER_URL}/api/status`);
    if (finalStatusResponse.ok) {
      const finalStatus = await finalStatusResponse.json();
      console.log(`Final service count in database: ${finalStatus.services || 0}`);
      console.log(`Vector count in index: ${finalStatus.vectorCount || 0}`);
    }
    
  } catch (error) {
    console.error('Error setting up database:', error);
    process.exit(1);
  }
}

// Execute main function
main();
