import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { config } from './config';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.send('SalonChat API is running');
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('A user connected', socket.id);
  
  socket.on('message', (message) => {
    console.log('Message received:', message);
    io.emit('message', message);
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected', socket.id);
  });
});

// Start server
server.listen(config.port, () => {
  console.log(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
});

