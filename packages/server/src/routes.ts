import express, { Router } from 'express';
import { processChat, getChatHistory, clearChatSession } from './controllers/chatController';
import { domainValidationMiddleware } from './utils/domainValidator';

// Create a router instance
const router: Router = express.Router();

// Apply domain validation middleware to all routes
router.use(domainValidationMiddleware());

/**
 * Chat API endpoints
 * Handles message processing, history retrieval, and session clearing
 */
router.post('/api/chat', processChat);
router.get('/api/chat/:sessionId', getChatHistory);
router.delete('/api/chat/:sessionId', clearChatSession);

/**
 * Health check endpoint
 * Used to verify if the API is running
 */
router.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'API is running'
  });
});

/**
 * API version endpoint
 * Returns current API version information
 */
router.get('/api/version', (req, res) => {
  res.status(200).json({
    version: '1.0.0',
    name: 'Salon Chat API'
  });
});

export default router;
