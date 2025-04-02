#!/bin/bash
set -e

# Setup Vectorize for Salon Chat
echo "=== Setting up Vectorize for Salon Chat ==="

# Check if wrangler is installed
if ! command -v npx &> /dev/null; then
    echo "Error: npx is not installed."
    exit 1
fi

# Deploy vector setup worker
echo "Deploying vectorize setup worker..."
npx wrangler deploy

# Create index if it doesn't exist
echo "Checking vectorize index..."
if ! npx wrangler vectorize list | grep -q "salon-vectorize"; then
    echo "Creating salon-vectorize index..."
    npx wrangler vectorize create salon-vectorize --dimensions=768
    echo "Index created."
    
    # Re-deploy worker to use the new index
    echo "Re-deploying worker with vectorize binding..."
    npx wrangler deploy
else
    echo "Index already exists."
fi

# Run the setup script to populate the DB and generate embeddings
echo "Populating database and generating embeddings..."
node setup.js --force

echo "=== Vectorize setup completed! ==="
