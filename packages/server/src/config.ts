import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { dirname } from 'path';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const config = {
  port: process.env.PORT || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.VITE_API_URL || 'http://localhost:3000',
  allowedDomains: (process.env.ALLOWED_DOMAINS || '').split(',').map(domain => domain.trim()),
  allowLocalhost: process.env.ALLOW_LOCALHOST === 'true' || process.env.NODE_ENV === 'development',
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  API_URL: process.env.VITE_API_URL || `http://localhost:${process.env.PORT || 4000}`
}; 
