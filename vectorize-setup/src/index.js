// Salon Service Vectorization Worker
export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Parse URL and route request
    const url = new URL(request.url);
    
    try {
      // Setup endpoint for populating the database
      if (url.pathname === '/api/setup' && request.method === 'POST') {
        return setupDatabase(request, env, corsHeaders);
      }
      
      // Status endpoint for checking configuration
      if (url.pathname === '/api/status') {
        return getStatus(env, corsHeaders);
      }
      
      // Test embedding endpoint
      if (url.pathname === '/api/test-embedding' && request.method === 'POST') {
        return testEmbedding(request, env, corsHeaders);
      }
      
      // Root endpoint
      return new Response(
        JSON.stringify({
          status: 'ok',
          message: 'Salon Vectorize Setup Worker',
          endpoints: ['/api/status', '/api/setup', '/api/test-embedding']
        }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    } catch (error) {
      console.error('Error processing request:', error);
      
      return new Response(
        JSON.stringify({
          status: 'error',
          message: error.message || 'Internal server error',
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }
  },
};

/**
 * Add salon services to the database and generate embeddings
 */
async function setupDatabase(request, env, corsHeaders) {
  const { services } = await request.json();
  
  if (!Array.isArray(services) || services.length === 0) {
    return new Response(JSON.stringify({ error: 'Invalid service data' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
  
  // Clear existing data
  await env.SALON_DB.prepare('DELETE FROM salon_services').run();
  console.log(`Cleared existing salon services data`);
  
  const results = [];
  const batchSize = 10;
  
  // Process services in batches
  for (let i = 0; i < services.length; i += batchSize) {
    const batch = services.slice(i, i + batchSize);
    console.log(`Processing batch ${i / batchSize + 1} of ${Math.ceil(services.length / batchSize)}`);
    
    // Process each service in the batch
    for (const service of batch) {
      // Generate a UUID for the service
      const id = crypto.randomUUID();
      
      // Extract data and provide defaults
      const name = service.name?.trim() || '';
      const category = service.category?.trim() || 'Uncategorized';
      const price = service.price?.trim() || 'Price varies';
      const description = service.description?.trim() || '';
      
      // Validate required fields
      if (!name) {
        results.push({
          success: false,
          name: name || 'Unnamed service',
          error: 'Missing service name',
        });
        continue;
      }
      
      try {
        // Insert into D1
        await env.SALON_DB.prepare(
          'INSERT INTO salon_services (id, name, category, price, description) VALUES (?, ?, ?, ?, ?)'
        ).bind(id, name, category, price, description).run();
        
        // Generate text for embedding
        const textToEmbed = `
          Service: ${name}
          Category: ${category}
          Price: ${price}
          Description: ${description}
        `.trim();
        
        // Generate embedding using Workers AI
        let embedding;
        try {
          embedding = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: textToEmbed });
          
          // Check if vectorize is available and store embedding
          if (env.SALON_VECTORIZE) {
            await env.SALON_VECTORIZE.upsert([{
              id,
              values: embedding.data[0],
              metadata: { serviceId: id }
            }]);
          }
        } catch (embeddingError) {
          console.error(`Error generating embedding for ${name}:`, embeddingError);
          // Continue without embedding if there's an error
        }
        
        results.push({
          success: true,
          id,
          name,
          category,
          embedded: !!embedding,
        });
      } catch (error) {
        console.error(`Error processing service ${name}:`, error);
        results.push({
          success: false,
          name,
          error: error.message,
        });
      }
    }
  }
  
  return new Response(JSON.stringify({
    status: 'success',
    processed: services.length,
    results,
  }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

/**
 * Get database and vectorize status
 */
async function getStatus(env, corsHeaders) {
  // Check D1 database
  const servicesCount = await env.SALON_DB.prepare('SELECT COUNT(*) as count FROM salon_services').first();
  const sessionCount = await env.SALON_DB.prepare('SELECT COUNT(*) as count FROM chat_sessions').first();
  
  // Check vectorize if available
  let vectorCount = 0;
  let vectorStatus = false;
  
  if (env.SALON_VECTORIZE) {
    try {
      // Try to get stats - this will throw if vectorize is not properly configured
      const stats = await env.SALON_VECTORIZE.getStats();
      vectorCount = stats.count || 0;
      vectorStatus = true;
    } catch (error) {
      console.error('Error getting vectorize stats:', error);
    }
  }
  
  return new Response(JSON.stringify({
    status: 'ok',
    services: servicesCount?.count || 0,
    sessions: sessionCount?.count || 0,
    vectorizeAvailable: !!env.SALON_VECTORIZE,
    vectorizeStatus,
    vectorCount,
  }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

/**
 * Test embedding generation
 */
async function testEmbedding(request, env, corsHeaders) {
  const { text } = await request.json();
  
  if (!text) {
    return new Response(JSON.stringify({ error: 'Text is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
  
  try {
    // Generate embedding
    const embedding = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text });
    
    // Test search if vectorize is available
    let searchResults = null;
    if (env.SALON_VECTORIZE) {
      searchResults = await env.SALON_VECTORIZE.query(embedding.data[0], { topK: 3 });
      
      // If we got results, fetch the actual services
      if (searchResults.matches && searchResults.matches.length > 0) {
        const serviceIds = searchResults.matches.map(match => match.id);
        const placeholders = serviceIds.map(() => '?').join(',');
        
        const services = await env.SALON_DB.prepare(
          `SELECT * FROM salon_services WHERE id IN (${placeholders})`
        ).bind(...serviceIds).all();
        
        // Add service details to results
        searchResults.services = services.results;
      }
    }
    
    return new Response(JSON.stringify({
      status: 'success',
      embedding: {
        dimensions: embedding.data[0].length,
        sample: embedding.data[0].slice(0, 5),
      },
      vectorSearch: searchResults,
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      status: 'error',
      message: error.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
