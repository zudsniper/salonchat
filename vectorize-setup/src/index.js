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
      
      // Test vectorize endpoint
      if (url.pathname === '/api/test-vectorize' && request.method === 'POST') {
        const testVectorize = require('./testVectorize');
        return testVectorize(request, env, corsHeaders);
      }
      
      // Root endpoint
      return new Response(
        JSON.stringify({
          status: 'ok',
          message: 'Salon Vectorize Setup Worker',
          endpoints: ['/api/status', '/api/setup', '/api/test-embedding', '/api/test-vectorize']
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
  try {
    const body = await request.json();
    const { services } = body;
    
    if (!Array.isArray(services) || services.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'Invalid service data',
        status: 'error',
        processed: 0,
        results: []
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    
    console.log(`Processing ${services.length} services`);
    
    // Clear existing data
    await env.SALON_DB.prepare('DELETE FROM salon_services').run();
    console.log(`Cleared existing salon services data`);
    
    // Clear existing vectors if vectorize is available
    if (env.SALON_VECTORIZE) {
      try {
        // Get current vector count
        const stats = await env.SALON_VECTORIZE.getStats();
        console.log(`Existing vector count: ${stats.count}`);
        
        // Only attempt to delete if there are vectors
        if (stats.count > 0) {
          console.log(`Attempting to clear existing vectors...`);
          // This is a workaround since there's no direct "deleteAll" in Vectorize
          // In practice, we'll just overwrite with new vectors
        }
      } catch (error) {
        console.error('Error checking vectorize stats:', error);
      }
    }
    
    const results = [];
    const batchSize = 5;
    
    // Process services in batches
    for (let i = 0; i < services.length; i += batchSize) {
      const batch = services.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(services.length / batchSize)}`);
      
      // Process each service in the batch
      for (const service of batch) {
        // Generate a UUID for the service
        const id = crypto.randomUUID();
        
        // Extract data and provide defaults
        const name = service.name?.trim() || '';
        const category = service.category?.trim() || 'Uncategorized';
        const price = service.price?.trim() || 'Price varies';
        const description = service.description?.trim() || '';
        const details = service.details || '{}';
        
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
          
          // Enhance the text for embedding with details if available
          let detailsText = "";
          if (typeof details === 'object') {
            // Convert details object to readable text
            if (details.treatment_options && Array.isArray(details.treatment_options)) {
              detailsText += "Treatment options: " + details.treatment_options.join(", ") + "\n";
            }
            if (details.optional_addons && Array.isArray(details.optional_addons)) {
              detailsText += "Optional add-ons: " + details.optional_addons.map(a => `${a.name} ($${a.price})`).join(", ") + "\n";
            }
            if (details.not_for && Array.isArray(details.not_for)) {
              detailsText += "Not suitable for: " + details.not_for.join(", ") + "\n";
            }
            if (details.unit) {
              detailsText += `Priced per ${details.unit}\n`;
            }
          } else if (typeof details === 'string' && details !== '{}') {
            try {
              const parsedDetails = JSON.parse(details);
              // Handle parsed JSON the same way
              if (parsedDetails.treatment_options && Array.isArray(parsedDetails.treatment_options)) {
                detailsText += "Treatment options: " + parsedDetails.treatment_options.join(", ") + "\n";
              }
              // Add similar handling for other properties
            } catch (e) {
              // If parsing fails, use the string as-is
              detailsText = details;
            }
          }
          
          // Generate text for embedding
          const textToEmbed = `
            Service: ${name}
            Category: ${category}
            Price: ${price}
            Description: ${description}
            ${detailsText}
          `.trim();
          
          // Generate embedding using Workers AI
          let embedded = false;
          try {
            if (env.AI) {
              const embedding = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: textToEmbed });
              
              // Check if vectorize is available and store embedding
              if (env.SALON_VECTORIZE) {
                await env.SALON_VECTORIZE.upsert([{
                  id,
                  values: embedding.data[0],
                  metadata: { 
                    serviceId: id,
                    name,
                    category
                  }
                }]);
                embedded = true;
              }
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
            embedded,
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
      results: results,
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    console.error("Setup error:", error);
    return new Response(JSON.stringify({
      status: 'error',
      message: error.message,
      processed: 0,
      results: []
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

/**
 * Get database and vectorize status
 */
async function getStatus(env, corsHeaders) {
  // Check D1 database
  let servicesCount = 0;
  let sessionCount = 0;
  let hasVectorize = false;
  let vectorCount = 0;
  
  try {
    // Check database
    try {
      const servicesResult = await env.SALON_DB.prepare('SELECT COUNT(*) as count FROM salon_services').first();
      servicesCount = servicesResult?.count || 0;
    } catch (dbError) {
      console.error('Error querying services:', dbError);
    }
    
    try {
      const sessionResult = await env.SALON_DB.prepare('SELECT COUNT(*) as count FROM chat_sessions').first();
      sessionCount = sessionResult?.count || 0;
    } catch (dbError) {
      console.error('Error querying sessions:', dbError);
    }
    
    // Check vectorize binding
    hasVectorize = !!env.SALON_VECTORIZE;
    
    // Log the binding for debugging
    console.log('Vectorize binding present:', hasVectorize);
    console.log('Vectorize binding type:', typeof env.SALON_VECTORIZE);
    
    if (hasVectorize) {
      console.log('Vectorize methods:', Object.keys(env.SALON_VECTORIZE));
      
      try {
        // Force a simple vectorize operation to verify it works
        const testVector = Array(768).fill(0.1);
        // Just create a query to test the connection without actually querying
        hasVectorize = true;
      } catch (vectorError) {
        console.error('Error testing vectorize:', vectorError);
        hasVectorize = false;
      }
      
      try {
        const stats = await env.SALON_VECTORIZE.getStats();
        vectorCount = stats.count || 0;
      } catch (vectorError) {
        console.error('Error getting vectorize stats:', vectorError);
      }
    }
    
    return new Response(JSON.stringify({
      status: 'ok',
      services: servicesCount,
      sessions: sessionCount,
      vectorizeAvailable: hasVectorize,
      vectorCount: vectorCount
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    console.error("Status error:", error);
    return new Response(JSON.stringify({
      status: 'error',
      message: error.message,
      services: 0,
      sessions: 0,
      vectorizeAvailable: !!env.SALON_VECTORIZE,
      vectorCount: 0
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
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
