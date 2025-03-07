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
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:4000',
  nodeEnv: process.env.NODE_ENV || 'development',
}; 