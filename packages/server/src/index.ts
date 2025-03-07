import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import routes from './routes';

// Check if essential environment variables are set
if (!config.OPENROUTER_API_KEY) {
  console.warn('WARNING: OPENROUTER_API_KEY is not set. Chat functionality will not work properly.');
}

// Initialize express app and HTTP server
const app = express();
const server = http.createServer(app);

// Configure Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: config.nodeEnv === 'development' 
      ? [config.frontendUrl, 'http://localhost:3000', 'http://localhost:5173'] 
      : [...config.allowedDomains],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Security and parsing middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", ...config.allowedDomains, 'https://openrouter.ai']
    }
  }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure CORS middleware
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    
    // Check if origin is allowed
    const isAllowedOrigin = 
      config.allowedDomains.some(domain => origin.includes(domain)) ||
      (config.allowLocalhost && (
        origin.includes('localhost') || 
        origin.includes('127.0.0.1')
      ));
    
    if (isAllowedOrigin) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS policy`));
    }
  },
  methods: ["GET", "POST", "DELETE"],
  credentials: true
};

app.use(cors(corsOptions));

// Root route - API health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'SalonChat API is running',
    version: '1.0.0',
    environment: config.nodeEnv
  });
});

// Mount all routes directly (they already have /api prefix)
app.use(routes);

// Socket.IO event handlers for real-time messaging
io.on('connection', (socket) => {
  console.log('A user connected', socket.id);
  
  socket.on('message', (message) => {
    console.log('Message received:', message);
    // Broadcast message to all connected clients
    io.emit('message', message);
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected', socket.id);
  });
});

// Start server
server.listen(config.port, () => {
  console.log(`⚡️ Server running on port ${config.port} in ${config.nodeEnv} mode`);
  console.log(`🌐 Frontend URL: ${config.frontendUrl}`);
  console.log(`🔌 API endpoints available at: http://localhost:${config.port}/api/*`);
  
  if (config.allowedDomains.length > 0) {
    console.log(`🔒 Allowed domains: ${config.allowedDomains.join(', ')}`);
  }
  
  if (config.allowLocalhost) {
    console.log(`⚠️ Localhost access is enabled for development`);
  }
});
