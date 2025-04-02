# Salon Chat Vectorize Setup

This module handles setting up the vector database for the Salon Chat application. It:

1. Parses salon service data
2. Creates D1 database records
3. Generates vector embeddings
4. Stores embeddings in Vectorize

## Prerequisites

- Node.js v18.0.0 or later
- Cloudflare account with Workers Paid plan
- Wrangler CLI v3.0.0 or later

## Quick Start

```bash
# Install dependencies
npm install

# Deploy worker and set up vector database
./deploy-vectorize.sh

# Or run setup steps manually:

# 1. Deploy the worker
npx wrangler deploy

# 2. Create vectorize index (if not exists)
npx wrangler vectorize create salon-vectorize --dimensions=768

# 3. Run the data import
node setup.js
```

## Testing

Test the vector search functionality:

```bash
node test-search.js
```

This will run several test queries and show matching services.

## API Endpoints

The worker exposes the following endpoints:

- `GET /api/status` - Check database and vectorize status
- `POST /api/setup` - Import services and generate embeddings
- `POST /api/test-embedding` - Test embedding generation and search

## Files

- `src/index.js` - Worker code
- `src/parseFullServices.js` - Parser for services data
- `setup.js` - Script to import data
- `test-search.js` - Script to test search functionality
- `deploy-vectorize.sh` - Deployment script

## Data Format

Services are imported with the following structure:

```json
{
  "name": "Service Name",
  "category": "Service Category",
  "price": "From $XX",
  "description": "Detailed service description..."
}
```

## Troubleshooting

- If you see "Error: workers.dev domain not found in your account" when deploying, run `wrangler login` first
- If embedding generation fails, check your AI binding in wrangler.toml
- If vector search returns no results, verify that embeddings were generated successfully during setup
- If parser misses services, adjust the parsing logic in parseFullServices.js

## Performance Considerations

- Embedding generation is resource-intensive; process services in batches
- Vector search is optimized for queries with semantic similarity to service descriptions
- Consider adding a caching layer for frequently searched terms
