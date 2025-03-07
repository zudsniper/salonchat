import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { config } from '../config';

// Define types for chat messages and sessions
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface ChatSession {
  id: string;
  messages: ChatMessage[];
  createdAt: Date;
  lastUpdated: Date;
}

// Store sessions in memory (could be moved to a persistent store in production)
const sessions = new Map<string, ChatSession>();

// System message for the salon chatbot
const SYSTEM_MESSAGE = 'You are a helpful AI assistant for a salon. Provide friendly, concise responses about salon services, hair care, and beauty advice.';

/**
 * Process a chat message using OpenRouter API
 */
export const processChat = async (req: Request, res: Response): Promise<void> => {
  try {
    // Extract message and session token from request
    const { message, sessionToken } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ 
        success: false, 
        error: 'Message is required' 
      });
      return;
    }

    // Get or create a session
    let session: ChatSession;
    let isNewSession = false;
    const currentSessionToken = sessionToken || uuidv4();

    if (sessionToken && sessions.has(sessionToken)) {
      session = sessions.get(sessionToken)!;
    } else {
      // Create a new session if none exists or token is invalid
      session = {
        id: currentSessionToken,
        messages: [],
        createdAt: new Date(),
        lastUpdated: new Date()
      };
      sessions.set(currentSessionToken, session);
      isNewSession = true;
    }

    // Add user message to session
    const userMessage: ChatMessage = {
      role: 'user',
      content: message.trim(),
      timestamp: new Date()
    };
    session.messages.push(userMessage);
    session.lastUpdated = new Date();

    // Format messages for OpenRouter API
    const formattedMessages = session.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // Add a system message if it doesn't exist
    if (!formattedMessages.some(msg => msg.role === 'system')) {
      formattedMessages.unshift({
        role: 'system',
        content: SYSTEM_MESSAGE
      });
    }
    // Make the request to OpenRouter API
    const openRouterUrl = 'https://openrouter.ai/api/v1/chat/completions';
    const openRouterApiKey = config.OPENROUTER_API_KEY;

    if (!openRouterApiKey) {
      console.error('OpenRouter API key is not configured');
      res.status(500).json({ 
        success: false, 
        error: 'API configuration error' 
      });
      return;
    }

    try {
      const response = await axios.post(
        openRouterUrl,
        {
          model: 'openai/gpt-3.5-turbo', // Can be configured based on needs
          messages: formattedMessages
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openRouterApiKey}`,
            'HTTP-Referer': config.API_URL || 'http://localhost:4000', // The URL of your service
            'X-Title': 'Salon Chatbot'
          }
        }
      );

      // Extract the assistant's response
      const assistantResponse = response.data.choices[0]?.message?.content || 'Sorry, I couldn\'t generate a response.';
      
      // Save the assistant message to the session
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: assistantResponse,
        timestamp: new Date()
      };
      
      session.messages.push(assistantMessage);
      session.lastUpdated = new Date();

      // Return response to client
      res.status(200).json({
        success: true,
        message: assistantResponse,
        sessionToken: currentSessionToken,
        isNewSession
      });

    } catch (error) {
      console.error('Error calling OpenRouter API:', error);
      
      // Handle axios errors more specifically
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status || 500;
        const errorMessage = error.response?.data?.error?.message || error.message;
        
        res.status(statusCode).json({
          success: false,
          error: errorMessage
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to process chat message'
        });
      }
    }
  } catch (error) {
    console.error('Chat processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

/**
 * Get chat history for a session
 */
export const getChatHistory = (req: Request, res: Response): void => {
  const { sessionToken } = req.params;

  if (!sessionToken) {
    res.status(400).json({
      success: false,
      error: 'Session token is required'
    });
    return;
  }

  // Check if session exists
  if (!sessions.has(sessionToken)) {
    res.status(404).json({
      success: false,
      error: 'Session not found'
    });
    return;
  }

  const session = sessions.get(sessionToken)!;
  
  res.status(200).json({
    success: true,
    sessionToken,
    messages: session.messages,
    createdAt: session.createdAt,
    lastUpdated: session.lastUpdated
  });
};

/**
 * Clear a chat session
 */
export const clearChatSession = (req: Request, res: Response): void => {
  const { sessionToken } = req.params;

  if (!sessionToken) {
    res.status(400).json({
      success: false,
      error: 'Session token is required'
    });
    return;
  }

  // Check if session exists
  if (!sessions.has(sessionToken)) {
    res.status(404).json({
      success: false,
      error: 'Session not found'
    });
    return;
  }

  // Reset the session to its initial state but keep the same token
  const oldSession = sessions.get(sessionToken)!;
  const newSession: ChatSession = {
    id: sessionToken,
    messages: [],
    createdAt: oldSession.createdAt, // Keep the original creation date
    lastUpdated: new Date()
  };
  
  sessions.set(sessionToken, newSession);

  res.status(200).json({
    success: true,
    message: 'Chat session cleared successfully',
    sessionToken
  });
};
