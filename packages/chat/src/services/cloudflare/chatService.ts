import { v4 as uuidv4 } from 'uuid';

// Define message interface
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// Local storage key
const STORAGE_KEY = 'salon-chat-session';

/**
 * CloudflareChatService - Handles communication with Cloudflare Worker backend
 */
export class CloudflareChatService {
  private apiUrl: string;
  private sessionId: string | null = null;
  private messages: ChatMessage[] = [];

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
    this.loadSession();
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
  async sendMessage(content: string): Promise<ChatMessage[]> {
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
      // Call backend API
      const response = await fetch(`${this.apiUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: content.trim(),
          sessionId: this.sessionId
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      // Update session ID if new
      if (data.sessionId && (!this.sessionId || data.isNewSession)) {
        this.sessionId = data.sessionId;
      }

      // Create assistant message
      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: data.message,
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
          content: msg.content,
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
    this.saveSession();
  }

  /**
   * Get all messages
   */
  getMessages(): ChatMessage[] {
    return [...this.messages];
  }
}

// Export singleton instance
export const createChatService = (apiUrl: string) => new CloudflareChatService(apiUrl);
