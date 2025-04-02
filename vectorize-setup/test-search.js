#!/usr/bin/env node
const fetch = require('node-fetch');

// Constants
const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8787';
const TEST_QUERIES = [
  "I need help with my dry hair",
  "What's the best treatment for damaged hair?",
  "Do you have any special event styling?",
  "How much is a haircut?",
  "Can you recommend something for my wedding?",
  "I need my hair strengthened"
];

/**
 * Test vector search functionality
 */
async function main() {
  try {
    console.log('Salon Chat Vector Search Test');
    console.log('----------------------------');
    
    // Check worker status
    console.log('Checking worker status...');
    const statusResponse = await fetch(`${WORKER_URL}/api/status`);
    if (!statusResponse.ok) {
      throw new Error(`Worker not responding correctly: ${statusResponse.status}`);
    }
    
    const status = await statusResponse.json();
    console.log(`Worker status: ${status.status}`);
    console.log(`Services in database: ${status.services}`);
    console.log(`Vectorize available: ${status.vectorizeAvailable ? 'Yes' : 'No'}`);
    console.log(`Vector embeddings: ${status.vectorCount || 'Unknown'}`);
    
    if (!status.vectorizeAvailable) {
      console.error('\nERROR: Vectorize binding not available in worker.');
      process.exit(1);
    }
    
    if (status.services === 0) {
      console.error('\nERROR: No services in database. Please run setup.js first.');
      process.exit(1);
    }
    
    // Run test queries
    console.log('\nRunning test queries...');
    
    for (const query of TEST_QUERIES) {
      console.log(`\nQuery: "${query}"`);
      
      const response = await fetch(`${WORKER_URL}/api/test-embedding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: query })
      });
      
      if (!response.ok) {
        console.error(`  Error: ${response.status}`);
        continue;
      }
      
      const result = await response.json();
      
      if (!result.vectorSearch || !result.vectorSearch.matches) {
        console.error('  No search results returned');
        continue;
      }
      
      // Output the matching services
      console.log('  Top matches:');
      if (result.vectorSearch.services) {
        result.vectorSearch.services.forEach((service, index) => {
          const match = result.vectorSearch.matches[index];
          const score = match.score.toFixed(4);
          console.log(`  ${index + 1}. ${service.name} (${service.category}) - ${service.price}`);
          console.log(`     Score: ${score}`);
          console.log(`     ${service.description.substring(0, 100)}...`);
        });
      } else {
        result.vectorSearch.matches.forEach((match, index) => {
          console.log(`  ${index + 1}. ID: ${match.id}, Score: ${match.score.toFixed(4)}`);
        });
      }
    }
    
    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('Error during test:', error);
    process.exit(1);
  }
}

// Execute main function
main();
