# Zero Trust Setup for Backend Worker

## 1. Create Zero Trust Application for API

1. Log into Cloudflare dashboard
2. Go to Zero Trust → Access → Applications
3. Click "Add application" → "Self-hosted"
4. Configure:
   - Application name: SalonChat Backend API
   - Session duration: 24 hours
   - Application domain: salon-chat-backend.zodworks.dev
   - Policy name: SalonChat API Access

5. Add service token policy:
   - Go to the application just created
   - Add a policy named "Service Token Access"
   - Configure the policy to include Service Tokens
   - Create a service token named "Frontend-to-Backend"
   - Save the Client ID and Client Secret (these are the values you'll use in the frontend worker)

## 2. Update Backend Worker (if needed)

If the backend worker needs to verify Zero Trust, add this code to the existing worker:

```javascript
async function verifyZeroTrustRequest(request) {
  // Valid JWT token means the request passed through Access
  const jwtToken = request.headers.get('CF-Access-JWT-Assertion');
  
  // Also check service token if needed
  const clientId = request.headers.get('CF-Access-Client-Id');
  const clientSecret = request.headers.get('CF-Access-Client-Secret');
  
  if (!jwtToken && !(clientId && clientSecret)) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  // Continue processing the request
  return null;
}

// Add to request handler:
const authError = await verifyZeroTrustRequest(request);
if (authError) {
  return authError;
}
```
