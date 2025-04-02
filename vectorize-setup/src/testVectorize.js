/**
 * Test vectorize operations
 */
async function testVectorize(request, env, corsHeaders) {
  try {
    const body = await request.json();
    
    if (body.operation === 'upsert') {
      // Handle upserting documents to Vectorize
      if (!body.documents || !Array.isArray(body.documents)) {
        return new Response(JSON.stringify({ error: 'Documents array is required for upsert' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      
      console.log(`Attempting to upsert ${body.documents.length} document(s)`);
      
      if (env.SALON_VECTORIZE) {
        try {
          const result = await env.SALON_VECTORIZE.upsert(body.documents);
          return new Response(JSON.stringify({
            status: 'success',
            operation: 'upsert',
            result
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        } catch (vectorizeError) {
          console.error('Vectorize upsert error:', vectorizeError);
          return new Response(JSON.stringify({
            status: 'error',
            operation: 'upsert',
            message: vectorizeError.message
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
      } else {
        return new Response(JSON.stringify({
          status: 'error',
          operation: 'upsert',
          message: 'Vectorize binding not available'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    } else if (body.operation === 'query') {
      // Handle querying Vectorize
      if (!body.vector || !Array.isArray(body.vector)) {
        return new Response(JSON.stringify({ error: 'Vector is required for query' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      
      console.log('Attempting to query Vectorize');
      
      if (env.SALON_VECTORIZE) {
        try {
          const topK = body.topK || 5;
          const result = await env.SALON_VECTORIZE.query(body.vector, { topK });
          
          // If we got results and need service details, fetch them
          let services = null;
          if (result.matches && result.matches.length > 0 && body.includeServices) {
            const serviceIds = result.matches.map(match => match.id);
            const placeholders = serviceIds.map(() => '?').join(',');
            
            const servicesResult = await env.SALON_DB.prepare(
              `SELECT * FROM salon_services WHERE id IN (${placeholders})`
            ).bind(...serviceIds).all();
            
            services = servicesResult.results || [];
          }
          
          return new Response(JSON.stringify({
            status: 'success',
            operation: 'query',
            result,
            services
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        } catch (vectorizeError) {
          console.error('Vectorize query error:', vectorizeError);
          return new Response(JSON.stringify({
            status: 'error',
            operation: 'query',
            message: vectorizeError.message
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
      } else {
        return new Response(JSON.stringify({
          status: 'error',
          operation: 'query',
          message: 'Vectorize binding not available'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    } else if (body.operation === 'stats') {
      // Get Vectorize stats
      console.log('Attempting to get Vectorize stats');
      
      if (env.SALON_VECTORIZE) {
        try {
          const stats = await env.SALON_VECTORIZE.getStats();
          return new Response(JSON.stringify({
            status: 'success',
            operation: 'stats',
            stats
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        } catch (vectorizeError) {
          console.error('Vectorize stats error:', vectorizeError);
          return new Response(JSON.stringify({
            status: 'error',
            operation: 'stats',
            message: vectorizeError.message
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
      } else {
        return new Response(JSON.stringify({
          status: 'error',
          operation: 'stats',
          message: 'Vectorize binding not available'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    } else {
      return new Response(JSON.stringify({ 
        error: 'Invalid operation. Supported operations: upsert, query, stats' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  } catch (error) {
    console.error('Error processing vectorize test request:', error);
    return new Response(JSON.stringify({
      status: 'error',
      message: error.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

module.exports = testVectorize;
