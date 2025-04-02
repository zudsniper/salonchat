import { v4 as uuidv4 } from 'uuid';

// Define message interface
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  animationState?: 'appearing' | 'appeared';
}

// Local storage key
const STORAGE_KEY = 'salon-chat-session';
const MODEL_STORAGE_KEY = 'salon-chat-model';

/**
 * CloudflareChatService - Handles communication with Cloudflare Worker backend
 */
export class CloudflareChatService {
  private apiUrl: string;
  private sessionId: string | null = null;
  private messages: ChatMessage[] = [];
  private currentModel: string | null = null;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
    this.loadSession();
    this.loadModel();
    
    // Ensure we always have a sessionId
    if (!this.sessionId) {
      this.sessionId = uuidv4();
      this.saveSession();
    }
  }

  /**
   * Load existing session from localStorage
   */
  private loadSession(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const { sessionId, messages } = JSON.parse(saved);
        this.sessionId = sessionId;
        this.messages = messages || [];
      }
    } catch (error) {
      console.error('Failed to load chat session:', error);
      this.clearSession(false);
    }
  }

  /**
   * Load current model from localStorage
   */
  private loadModel(): void {
    try {
      const model = localStorage.getItem(MODEL_STORAGE_KEY);
      if (model) {
        this.currentModel = model;
      }
    } catch (error) {
      console.error('Failed to load model setting:', error);
    }
  }

  /**
   * Save current model to localStorage
   */
  private saveModel(): void {
    try {
      if (this.currentModel) {
        localStorage.setItem(MODEL_STORAGE_KEY, this.currentModel);
      }
    } catch (error) {
      console.error('Failed to save model setting:', error);
    }
  }

  /**
   * Save current session to localStorage
   */
  private saveSession(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        sessionId: this.sessionId,
        messages: this.messages
      }));
    } catch (error) {
      console.error('Failed to save chat session:', error);
    }
  }

  /**
   * Send message to backend and process response
   */
  async sendMessage(content: string, model?: string): Promise<ChatMessage[]> {
    if (!content.trim()) {
      throw new Error('Message cannot be empty');
    }

    // Create user message
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now()
    };

    // Add to local messages
    this.messages.push(userMessage);
    this.saveSession();

    try {
      // Ensure we have a sessionId before sending the request
      if (!this.sessionId) {
        console.warn('No sessionId found, generating a new one');
        this.sessionId = uuidv4();
        this.saveSession();
      }
      
      // Create request payload
      const payload: any = {
        message: content.trim(),
        sessionId: this.sessionId
      };

      // Use model from parameter, current model, or let server decide
      if (model) {
        payload.model = model;
      } else if (this.currentModel) {
        payload.model = this.currentModel;
      }

      // Call backend API
      const response = await fetch(`${this.apiUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      // Update session ID if new
      if (data.sessionId && (!this.sessionId || data.isNewSession)) {
        this.sessionId = data.sessionId;
        this.saveSession();
      }

      // Create assistant message
      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: data.message || "",
        timestamp: Date.now()
      };

      // Add to local messages
      this.messages.push(assistantMessage);
      this.saveSession();

      return this.messages;
    } catch (error) {
      console.error('Error sending message:', error);
      // Remove the user message on error to allow retry
      this.messages.pop();
      this.saveSession();
      throw error;
    }
  }

  /**
   * Get conversation history
   */
  async getHistory(): Promise<ChatMessage[]> {
    if (!this.sessionId) {
      return this.messages;
    }

    try {
      const response = await fetch(`${this.apiUrl}/api/chat/${this.sessionId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Update local messages with server data
      if (data.messages && Array.isArray(data.messages)) {
        this.messages = data.messages.map((msg: any) => ({
          id: msg.id || uuidv4(),
          role: msg.role,
          content: msg.content || "",
          timestamp: msg.timestamp || Date.now()
        }));
        this.saveSession();
      }

      return this.messages;
    } catch (error) {
      console.error('Error fetching chat history:', error);
      return this.messages;
    }
  }

  /**
   * Clear the chat session
   */
  async clearSession(callApi = true): Promise<void> {
    // Call API if we have a session ID and callApi flag is true
    if (callApi && this.sessionId) {
      try {
        await fetch(`${this.apiUrl}/api/chat/${this.sessionId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          }
        });
      } catch (error) {
        console.error('Error clearing chat session on server:', error);
      }
    }

    // Clear local data
    this.messages = [];
    
    // Generate a new session ID
    this.sessionId = uuidv4();
    
    this.saveSession();
  }

  /**
   * Get all messages
   */
  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  /**
   * Get available models
   */
  async getModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.apiUrl}/api/models`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return data.models || [];
    } catch (error) {
      console.error('Error getting models:', error);
      return [];
    }
  }

  /**
   * Get current model
   */
  async getCurrentModel(): Promise<string> {
    try {
      // Return cached model if available
      if (this.currentModel) {
        return this.currentModel;
      }

      const response = await fetch(`${this.apiUrl}/api/model`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      this.currentModel = data.model;
      this.saveModel();
      return data.model;
    } catch (error) {
      console.error('Error getting current model:', error);
      return '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b'; // Default model
    }
  }

  /**
   * Set active model
   */
  async setModel(model: string): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/api/model`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      // Update local model cache
      this.currentModel = model;
      this.saveModel();
    } catch (error) {
      console.error('Error setting model:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const createChatService = (apiUrl: string) => new CloudflareChatService(apiUrl);
