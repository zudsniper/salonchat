# SalonChat

A real-time chat application with a React frontend and Express backend.

## Environment Setup

This project uses a shared `.env` file in the root directory for both the frontend and backend subprojects.

### Available Environment Variables

- `PORT`: The port for the backend server (default: 4000)
- `VITE_API_URL`: The URL for the frontend to connect to the backend (default: http://localhost:4000)
- `NODE_ENV`: The environment mode (development, production, etc.)

### Setup Instructions

1. Copy the `.env.example` file to `.env` in the root directory:
   ```
   cp .env.example .env
   ```

2. Modify the values in the `.env` file as needed.

3. The environment variables will be automatically loaded by both subprojects.

## Development

```
npm install
npm run dev
```

This will start both the frontend and backend in development mode.

## Production

```
npm run build
npm start
```

This will build both subprojects and start the backend server. 