import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Load .env files from the root directory
process.env.VITE_ROOT_DIR = path.resolve(__dirname, '../../');

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` from the root directory
  const rootEnv = loadEnv(mode, process.env.VITE_ROOT_DIR || '../../', '');
  
  // Merge with process.env
  Object.assign(process.env, rootEnv);
  
  return {
    plugins: [react()],
    server: {
      port: 3000,
    },
    build: {
      outDir: 'dist',
    },
  };
});

