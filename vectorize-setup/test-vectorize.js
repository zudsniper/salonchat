#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Constants
const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
const MAX_DOCS = 5;

/**
 * Main function to directly test vectorize setup
 */
async function main() {
  try {
    console.log('Salon Chat Vectorize Direct Test');
    console.log('-------------------------------');
    
    // Create a test document with a known ID
    const testDocId = "test-doc-" + Date.now();
    const testVector = Array(768).fill(0.1);
    
    console.log(`Creating test document with ID: ${testDocId}`);
    
    // Create a direct fetch request to upsert a vector
    const upsertResponse = await fetch('https://salon-vectorize-setup.me-810.workers.dev/api/test-vectorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'upsert',
        documents: [{
          id: testDocId,
          values: testVector,
          metadata: { name: 'Test Service' }
        }]
      })
    });
    
    if (!upsertResponse.ok) {
      throw new Error(`Upsert failed: ${upsertResponse.status}`);
    }
    
    const upsertResult = await upsertResponse.json();
    console.log('Upsert result:', upsertResult);
    
    // Query with the same vector to see if we get the document back
    console.log('\nQuerying with the same vector...');
    const queryResponse = await fetch('https://salon-vectorize-setup.me-810.workers.dev/api/test-vectorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'query',
        vector: testVector,
        topK: MAX_DOCS
      })
    });
    
    if (!queryResponse.ok) {
      throw new Error(`Query failed: ${queryResponse.status}`);
    }
    
    const queryResult = await queryResponse.json();
    console.log('Query result:', queryResult);
    
    // Get stats to verify the document was added
    console.log('\nGetting vector index stats...');
    const statsResponse = await fetch('https://salon-vectorize-setup.me-810.workers.dev/api/test-vectorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'stats'
      })
    });
    
    if (!statsResponse.ok) {
      throw new Error(`Stats request failed: ${statsResponse.status}`);
    }
    
    const statsResult = await statsResponse.json();
    console.log('Stats result:', statsResult);
    
    // Now test with the JSON services data
    console.log('\nTesting with actual salon services...');
    const servicesPath = path.join(__dirname, '../resources/services.json');
    const servicesText = fs.readFileSync(servicesPath, 'utf8');
    const services = JSON.parse(servicesText);
    
    // Use just one service for testing
    const testService = services[0];
    console.log(`Using service: ${testService.name}`);
    
    // Format the service for embedding
    const textToEmbed = `
      Service: ${testService.name}
      Category: ${testService.category}
      Price: From $${testService.price_from}
      Description: ${testService.description}
    `.trim();
    
    // Generate a test vector for this service (simple mock)
    const serviceVector = Array(768).fill(0.2);
    const serviceId = "service-" + Date.now();
    
    // Upsert the service
    console.log(`Upserting service with ID: ${serviceId}`);
    const serviceUpsertResponse = await fetch('https://salon-vectorize-setup.me-810.workers.dev/api/test-vectorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'upsert',
        documents: [{
          id: serviceId,
          values: serviceVector,
          metadata: { 
            name: testService.name,
            category: testService.category,
            price: `From $${testService.price_from}`,
          }
        }]
      })
    });
    
    if (!serviceUpsertResponse.ok) {
      throw new Error(`Service upsert failed: ${serviceUpsertResponse.status}`);
    }
    
    const serviceUpsertResult = await serviceUpsertResponse.json();
    console.log('Service upsert result:', serviceUpsertResult);
    
    // Final stats to see the updated index
    console.log('\nFinal vector index stats...');
    const finalStatsResponse = await fetch('https://salon-vectorize-setup.me-810.workers.dev/api/test-vectorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'stats'
      })
    });
    
    if (!finalStatsResponse.ok) {
      throw new Error(`Final stats request failed: ${finalStatsResponse.status}`);
    }
    
    const finalStatsResult = await finalStatsResponse.json();
    console.log('Final stats result:', finalStatsResult);
    
    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('Error during test:', error);
    process.exit(1);
  }
}

// Execute main function
main();
