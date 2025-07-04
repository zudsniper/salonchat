# Salon Chat - AI Assistant for Apotheca Salon

Conversation-aware AI assistant for Apotheca Salon using Cloudflare's serverless infrastructure and Retrieval Augmented Generation (RAG).

## Architecture

- **Frontend**: React-based chat interface
- **Backend**: Cloudflare Workers
- **Database**: Cloudflare D1
- **Vector Database**: Cloudflare Vectorize
- **AI**: Cloudflare Workers AI with RAG

## Project Structure

- `packages/chat` - Frontend chat component
- `vectorize-setup` - Vector database setup tools
- `resources` - Service data and prompts
- `scripts` - Deployment scripts

## Setup

### Prerequisites

- Node.js ≥18.0.0
- Cloudflare account with Workers Paid plan
- Wrangler CLI ≥3.0.0

### Initial Setup

```bash
# Install dependencies
npm install

# Set up vectorize and database
npm run setup:vectorize

# Deploy backend
npm run deploy:backend

# Build frontend
npm run deploy:chat
```

### Environment Configuration

Create a `.env` file from `.env.example`:

```
# Required for frontend
VITE_API_URL=https://salon-chat-backend.your-account.workers.dev

# Cloudflare Zero Trust Service Tokens
VITE_SERVICE_TOKEN_CLIENT_ID=your_client_id_here.access
VITE_SERVICE_TOKEN_CLIENT_SECRET=your_client_secret_here

# Optional - use OpenAI/Anthropic instead of Workers AI
# OPENAI_API_KEY=your_openai_key
# ANTHROPIC_API_KEY=your_anthropic_key
```

### Zero Trust Configuration

To set up the Cloudflare Zero Trust service tokens:

1. Run the token generation script:
   ```bash
   cd packages/chat
   node scripts/generate-token.js create
   ```

2. Configure the generated tokens in Cloudflare Zero Trust dashboard:
   - Go to Zero Trust → Access → Service Auth
   - Create a new service token with the generated credentials
   - Copy the generated tokens to your `.env` file

3. Update environment variables:
   ```bash
   cd packages/chat
   cp .env.example .env
   # Edit .env with the generated tokens
   ```

## Development

```bash
# Start frontend dev server
npm run dev:chat

# Test vector search
cd vectorize-setup && node test-search.js
```

## Deployment

```bash
# Deploy everything
npm run deploy

# Deploy individual components
npm run setup:vectorize
npm run deploy:backend
npm run deploy:chat
```

## RAG Implementation

The system uses RAG to provide contextually relevant responses:

1. Service descriptions stored in D1
2. Vector embeddings in Vectorize
3. User queries converted to embeddings
4. Semantically similar services retrieved
5. Context provided to AI for improved responses

## Documentation

- `IMPLEMENTATION.md` - Technical implementation details
- `vectorize-setup/README.md` - Vector database setup instructions

## License

ISC
