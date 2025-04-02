import config from '../config';
import { v4 as uuidv4 } from 'uuid';

export interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
}

export interface ChatSession {
  sessionId: string;
  messages: ChatMessage[];
}

// Local storage key for saving the session
const SESSION_STORAGE_KEY = 'salon_chat_session';

/**
 * Retrieves the current session from localStorage or creates a new one
 */
export const getSession = (): ChatSession => {
  const storedSession = localStorage.getItem(SESSION_STORAGE_KEY);
  if (storedSession) {
    return JSON.parse(storedSession);
  }
  // Create a new empty session (the server will assign a sessionId)
  return {
    sessionId: '',
    messages: []
  };
};

/**
 * Saves the current session to localStorage
 */
export const saveSession = (session: ChatSession): void => {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
};

/**
 * Sends a message to the chat API
 */
export const sendMessage = async (message: string): Promise<ChatSession> => {
  const session = getSession();
  
  try {
    const response = await fetch(`${config.apiUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        sessionId: session.sessionId
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Update the session with the new sessionId (if it was a new session)
    // and store the updated messages
    const updatedSession: ChatSession = {
      sessionId: data.sessionId,
      messages: data.messages
    };
    
    saveSession(updatedSession);
    return updatedSession;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
};

/**
 * Gets the chat history for the current session
 */
export const getChatHistory = async (): Promise<ChatSession> => {
  const session = getSession();
  
  // If we don't have a sessionId yet, just return the empty session
  if (!session.sessionId) {
    return session;
  }
  
  try {
    const response = await fetch(`${config.apiUrl}/api/chat/history?sessionId=${session.sessionId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    
    const updatedSession: ChatSession = {
      sessionId: data.sessionId,
      messages: data.messages
    };
    
    saveSession(updatedSession);
    return updatedSession;
  } catch (error) {
    console.error('Error getting chat history:', error);
    // If there's an error, we'll just use what's in localStorage
    return session;
  }
};

/**
 * Clears the current chat session
 */
export const clearChat = async (): Promise<ChatSession> => {
  const session = getSession();
  
  try {
    // Only attempt to clear on server if we have a sessionId
    if (session.sessionId) {
      const response = await fetch(`${config.apiUrl}/api/chat/clear`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: session.sessionId
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
    }

    // Create a new empty session but preserve the sessionId
    const newSession: ChatSession = {
      sessionId: session.sessionId,
      messages: []
    };
    
    saveSession(newSession);
    return newSession;
  } catch (error) {
    console.error('Error clearing chat:', error);
    throw error;
  }
};

export class ChatService {
  private readonly API_URL = `${config.apiUrl}/api/chat`;
  private session: ChatSession | null = null;

  constructor() {
    this.loadSession();
  }

  /**
   * Loads the existing session from localStorage or creates a new one
   */
  private loadSession(): void {
    const storedSession = localStorage.getItem(SESSION_STORAGE_KEY);
    if (storedSession) {
      try {
        const { sessionId } = JSON.parse(storedSession);
        this.session = {
          sessionId,
          messages: []
        };
      } catch (error) {
        console.error('Failed to parse stored session:', error);
        this.session = null;
      }
    }
  }

  /**
   * Saves the current session ID to localStorage
   */
  private saveSession(): void {
    if (this.session) {
      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ sessionId: this.session.sessionId })
      );
    }
  }

  /**
   * Sends a message to the chat API
   * @param content - The message content
   * @returns A promise that resolves to the updated chat history
   */
  async sendMessage(content: string): Promise<ChatMessage[]> {
    if (!content.trim()) {
      throw new Error('Message cannot be empty');
    }

    // Create a new user message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      content,
      role: 'user',
      timestamp: Date.now()
    };

    // Add to session
    if (this.session) {
      this.session.messages.push(userMessage);
      this.saveSession();
    }

    try {
      // Send to API
      const response = await fetch(`${this.API_URL}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: content,
          sessionId: this.session?.sessionId || undefined
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.message || 'Failed to send message';
        } catch (e) {
          errorMessage = `API error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data: ChatSession = await response.json();
      
      // If this was a new session, store the returned sessionId
      if (!this.session && data.sessionId) {
        this.session = {
          sessionId: data.sessionId,
          messages: data.messages
        };
        this.saveSession();
      }

      return data.messages;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  /**
   * Fetches the chat history for the current session
   * @returns A promise that resolves to the chat history
   */
  async getChatHistory(): Promise<ChatMessage[]> {
    if (!this.session) {
      return [];
    }

    try {
      const response = await fetch(
        `${this.API_URL}/history`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data: ChatSession = await response.json();
      this.session = data;
      this.saveSession();
      
      return this.session.messages;
    } catch (error) {
      console.error('Error fetching chat history:', error);
      return this.session.messages;
    }
  }

  /**
   * Clears the current chat session
   * @returns A promise that resolves when the session is cleared
   */
  async clearChatSession(): Promise<void> {
    if (!this.session) {
      return;
    }

    try {
      const response = await fetch(
        `${this.API_URL}/clear`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      // Clear local messages regardless of API success
      this.session.messages = [];
      this.saveSession();
    } catch (error) {
      console.error('Error clearing chat session:', error);
      // Still clear local messages even if API fails
      this.session.messages = [];
      this.saveSession();
    }
  }

  /**
   * Checks if there is an active session
   * @returns True if there is an active session, false otherwise
   */
  hasActiveSession(): boolean {
    return !!this.session;
  }

  /**
   * Gets the current session ID
   * @returns The current session ID or null if there is no active session
   */
  getSessionId(): string | null {
    return this.session?.sessionId || null;
  }
}

// Export a singleton instance
export const chatService = new ChatService();

// Export the class as default
export default ChatService;

