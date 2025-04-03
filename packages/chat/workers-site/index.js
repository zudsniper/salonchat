/**
 * Cloudflare Worker for SalonChat Frontend
 * - Serves static React app with Zero Trust protection
 * - Adds Zero Trust JWT token to API requests
 */

// Add CORS headers to response
function addCorsHeaders(response, request) {
  const newResponse = new Response(response.body, response);
  
  // Copy all original headers
  response.headers.forEach((value, key) => {
    newResponse.headers.set(key, value);
  });
  
  // Get origin from request
  const origin = request.headers.get('Origin') || '*';
  
  // Add CORS headers with specific origin instead of wildcard
  newResponse.headers.set('Access-Control-Allow-Origin', origin);
  newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, CF-Access-JWT-Assertion, CF-Access-Client-Id, CF-Access-Client-Secret');
  newResponse.headers.set('Access-Control-Allow-Credentials', 'true');
  
  // Set appropriate Referrer Policy
  newResponse.headers.set('Referrer-Policy', 'no-referrer-when-downgrade');
  
  return newResponse;
}

// Normalize URL path (handle trailing slashes)
function normalizePath(path) {
  return path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
}

// Zero Trust auth verification 
async function verifyZeroTrustAuth(request) {
  return !!request.headers.get('CF-Access-JWT-Assertion');
}

// Forward request to destination with optional service token
async function forwardRequest(request, destUrl, addServiceToken = false, env) {
  const url = new URL(request.url);
  // Use original pathname without normalization
  const targetUrl = new URL(url.pathname + url.search, destUrl);
  
  // Clone headers from the original request
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    // Skip the CF-Access-JWT-Assertion header for API requests with service tokens
    // to prevent unwanted redirection to cloudflareaccess.com
    if (addServiceToken && key.toLowerCase() === 'cf-access-jwt-assertion') {
      return;
    }
    headers.set(key, value);
  });
  
  // Clone request with modified headers
  const newRequest = new Request(targetUrl, {
    method: request.method,
    headers: headers,
    body: request.body,
    redirect: 'follow',
  });
  
  // Add service token if needed
  if (addServiceToken && env.SERVICE_TOKEN_CLIENT_ID && env.SERVICE_TOKEN_CLIENT_SECRET) {
    console.log('Adding service tokens to request');
    newRequest.headers.set('CF-Access-Client-Id', env.SERVICE_TOKEN_CLIENT_ID);
    newRequest.headers.set('CF-Access-Client-Secret', env.SERVICE_TOKEN_CLIENT_SECRET);
    // Also add to Authorization header in Bearer format
    const bearerToken = `${env.SERVICE_TOKEN_CLIENT_ID}:${env.SERVICE_TOKEN_CLIENT_SECRET}`;
    const encodedToken = btoa(bearerToken);
    newRequest.headers.set('Authorization', `Bearer ${encodedToken}`);
  }
  
  // Forward request and add CORS headers to response
  const response = await fetch(newRequest);
  return addCorsHeaders(response, request);
}

// Main request handler
export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      
      // Handle OPTIONS requests for CORS preflight
      if (request.method === 'OPTIONS') {
        const origin = request.headers.get('Origin') || '*';
        
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, CF-Access-JWT-Assertion, CF-Access-Client-Id, CF-Access-Client-Secret',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Max-Age': '86400',
            'Referrer-Policy': 'no-referrer-when-downgrade',
          },
          status: 204,
        });
      }
      
      // API requests pass-through with service token
      if (url.pathname.startsWith('/api/')) {
        console.log(`Forwarding API request to ${env.API_WORKER_URL} with service token`);
        console.log(`API Path: ${url.pathname}`);
        
        // For API requests, we don't need to verify Zero Trust auth
        // Instead, we'll forward with service tokens which are pre-authorized
        return forwardRequest(request, env.API_WORKER_URL, true, env);
      }
      
      // Verify Zero Trust authentication for non-API requests
      if (!await verifyZeroTrustAuth(request)) {
        return new Response('Unauthorized - Zero Trust authentication required', { status: 401 });
      }
      
      // Serve static assets from Pages deployment
      console.log(`Serving static asset from ${env.PAGES_URL}`);
      return forwardRequest(request, env.PAGES_URL, false, env);
    } catch (error) {
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  }
}; 