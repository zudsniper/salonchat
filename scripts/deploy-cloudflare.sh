#!/bin/bash
set -e

# Deploy Cloudflare Infrastructure for Salon Chat
echo "=== Deploying Cloudflare infrastructure for Salon Chat ==="

# Check environment prerequisites
echo "Checking prerequisites..."
if ! command -v wrangler &> /dev/null; then
    echo "Error: wrangler is not installed."
    echo "Please install it globally with: npm install -g wrangler"
    exit 1
fi

echo "Checking Node.js version..."
NODE_VERSION=$(node -v | cut -d 'v' -f 2)
NODE_MAJOR_VERSION=$(echo $NODE_VERSION | cut -d '.' -f 1)
if [ "$NODE_MAJOR_VERSION" -lt "18" ]; then
    echo "Error: Node.js version 18 or higher is required."
    echo "Current version: $NODE_VERSION"
    echo "Please upgrade Node.js."
    exit 1
fi

# Ensure Cloudflare login
echo "Ensuring Cloudflare login..."
wrangler whoami || wrangler login

# Deploy D1 database (if not exists)
echo "Setting up Salon D1 database..."
SALON_DB_ID=$(wrangler d1 list --json | jq -r '.[] | select(.name=="salon-db") | .uuid')

if [ -z "$SALON_DB_ID" ]; then
    echo "Creating salon-db D1 database..."
    SALON_DB_ID=$(wrangler d1 create salon-db --json | jq -r '.uuid')
    echo "Created database with ID: $SALON_DB_ID"
else
    echo "Found existing salon-db with ID: $SALON_DB_ID"
fi

# Create database schema
echo "Setting up database schema..."
cat << EOF > /tmp/salon_schema.sql
CREATE TABLE IF NOT EXISTS salon_services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  messages TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
EOF

wrangler d1 execute salon-db --file=/tmp/salon_schema.sql

# Set up Vectorize index
echo "Setting up Vectorize index..."
VECTORIZE_INDEX=$(wrangler vectorize list --json | jq -r '.[] | select(.name=="salon-vectorize") | .name')

if [ -z "$VECTORIZE_INDEX" ]; then
    echo "Creating salon-vectorize index..."
    wrangler vectorize create salon-vectorize --dimensions=768
    echo "Created Vectorize index: salon-vectorize"
else
    echo "Found existing Vectorize index: salon-vectorize"
fi

# Update Worker config in vectorize-setup
echo "Updating vectorize-setup worker configuration..."
cat << EOF > ./vectorize-setup/wrangler.toml
name = "salon-vectorize-setup"
main = "src/index.js"
compatibility_date = "2025-04-01"

# Bind the salon database
[[d1_databases]]
binding = "SALON_DB"
database_name = "salon-db"
database_id = "$SALON_DB_ID"

# Bind AI for embeddings
[[ai]]
binding = "AI"

# Bind Vectorize index
[[vectorize]]
binding = "SALON_VECTORIZE"
index_name = "salon-vectorize"
EOF

# Deploy vectorize-setup worker
echo "Deploying vectorize-setup worker..."
cd vectorize-setup
npm install
wrangler deploy

# Load services data
echo "Loading salon services data..."
node setup-database.js

# Update main worker config
echo "Updating salon-chat-backend worker configuration..."
cd ..
cat << EOF > ./wrangler.toml
name = "salon-chat-backend"
main = "./src/index.js"
compatibility_date = "2025-04-01"

[[d1_databases]]
binding = "SALON_DB"
database_name = "salon-db"
database_id = "$SALON_DB_ID"

[[ai]]
binding = "AI"

[[vectorize]]
binding = "SALON_VECTORIZE"
index_name = "salon-vectorize"

[vars]
# Environment variables
# OPENAI_API_KEY = "" # Optional: Set this for using OpenAI instead of Workers AI
EOF

# Deploy main worker
echo "Deploying salon-chat-backend worker..."
wrangler deploy --name=salon-chat-backend

# Update frontend config
echo "Updating frontend configuration..."
WORKER_DOMAIN=$(wrangler whoami | grep -o 'workers.dev' | head -1)
if [ -n "$WORKER_DOMAIN" ]; then
    BACKEND_URL="https://salon-chat-backend.$WORKER_DOMAIN"
    echo "export const apiUrl = '$BACKEND_URL';" > ./packages/chat/src/config.ts
    echo "Backend URL set to: $BACKEND_URL"
fi

echo "=== Deployment completed successfully! ==="
echo "Next steps:"
echo "1. Build the frontend: npm run build --workspace chat"
echo "2. Deploy frontend files to your hosting provider"
echo "3. Embed the chat widget on your salon website"
