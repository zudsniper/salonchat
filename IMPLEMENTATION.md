# Salon Chat Implementation Notes

## Overview

This document outlines the implementation of the Salon Chat application using Cloudflare's serverless infrastructure with a RAG (Retrieval Augmented Generation) pattern.

## Architecture

The application follows a serverless architecture with these components:

1. **Frontend**: React-based chat widget (packages/chat)
2. **Backend**: Cloudflare Workers for API handling (salon-chat-backend)
3. **Database**: Cloudflare D1 for structured data storage
4. **Vector Database**: Cloudflare Vectorize for semantic search
5. **AI**: Cloudflare Workers AI for inference

## Key Components

### Backend Worker (salon-chat-backend)

- **Purpose**: Handles API requests, performs database operations, and runs AI inference
- **Endpoints**:
  - `POST /api/chat`: Process chat messages using RAG
  - `GET /api/chat/:sessionId`: Retrieve chat history
  - `DELETE /api/chat/:sessionId`: Clear chat session
  - `GET /api/health`: Health check endpoint

### Database Structure

**D1 Tables**:
```sql
CREATE TABLE salon_services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE chat_sessions (
  id TEXT PRIMARY KEY,
  messages TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### Vector Index

- Configured for 768-dimension vectors to work with `@cf/baai/bge-base-en-v1.5` embeddings
- Contains embeddings of salon service descriptions for semantic search

### Setup Scripts

- `vectorize-setup`: Worker for setup and administration
- `scripts/deploy-cloudflare.sh`: Automated deployment script

## RAG Implementation

The RAG pattern is implemented as follows:

1. **Indexing**:
   - Salon service descriptions are stored in D1
   - Text embeddings are generated using Workers AI
   - Embeddings are stored in Vectorize with service IDs

2. **Query Processing**:
   - User query is converted to embedding vector
   - Vector is compared against stored embeddings
   - Most similar service descriptions are retrieved
   - Services are formatted as context for the AI

3. **Response Generation**:
   - Context is combined with conversation history
   - Full prompt is sent to AI model for inference
   - Response is returned to user and stored in session

## Local Development

1. Frontend:
   ```bash
   cd packages/chat
   npm run dev
   ```

2. Testing Cloudflare Worker:
   ```bash
   cd vectorize-setup
   npx wrangler dev
   ```

## Deployment

```bash
# Deploy all components
npm run deploy

# Deploy only Cloudflare resources
npm run deploy:cloudflare

# Build chat widget only
npm run deploy:chat
```

## Future Improvements

1. **Conversation Analysis**: Implement smarter context pruning to maintain relevance over longer conversations
2. **Hybrid Search**: Combine vector and keyword search for improved results
3. **Analytics**: Add telemetry for tracking user queries and improving effectiveness
4. **Appointment Integration**: Direct booking from chat interface

## Notes

- When adding new salon services, they must be processed through the vectorize-setup worker
- The worker requires Node.js 18+ for deployment
- Default model is Cloudflare Workers AI's Llama-3-8b-instruct, but can be switched to OpenAI/Anthropic by setting API keys
