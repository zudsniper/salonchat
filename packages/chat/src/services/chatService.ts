import { config } from '../config';

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

import { config } from '../config';

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
}

export interface ChatSession {
  sessionId: string;
  messages: Message[];
}

const SESSION_STORAGE_KEY = 'salon-chat-session';

export class ChatService {
  private sessionId: string | null = null;
  private apiUrl: string;

  constructor() {
    this.apiUrl = config.apiUrl;
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
        this.sessionId = sessionId;
      } catch (error) {
        console.error('Failed to parse stored session:', error);
        this.sessionId = null;
      }
    }
  }

  /**
   * Saves the current session ID to localStorage
   */
  private saveSession(): void {
    if (this.sessionId) {
      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ sessionId: this.sessionId })
      );
    }
  }

  /**
   * Sends a message to the chat API
   * @param content - The message content
   * @returns A promise that resolves to the updated chat history
   */
  async sendMessage(content: string): Promise<Message[]> {
    try {
      const response = await fetch(`${this.apiUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: content,
          sessionId: this.sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      
      // If this was a new session, store the returned sessionId
      if (!this.sessionId && data.sessionId) {
        this.sessionId = data.sessionId;
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
  async getChatHistory(): Promise<Message[]> {
    if (!this.sessionId) {
      return [];
    }

    try {
      const response = await fetch(
        `${this.apiUrl}/api/chat/history?sessionId=${this.sessionId}`,
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

      const data = await response.json();
      return data.messages;
    } catch (error) {
      console.error('Error fetching chat history:', error);
      return [];
    }
  }

  /**
   * Clears the current chat session
   * @returns A promise that resolves when the session is cleared
   */
  async clearChatSession(): Promise<void> {
    if (!this.sessionId) {
      return;
    }

    try {
      const response = await fetch(
        `${this.apiUrl}/api/chat/clear?sessionId=${this.sessionId}`,
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

      // Request successful, but also clear local storage
      localStorage.removeItem(SESSION_STORAGE_KEY);
      this.sessionId = null;
    } catch (error) {
      console.error('Error clearing chat session:', error);
      throw error;
    }
  }

  /**
   * Checks if there is an active session
   * @returns True if there is an active session, false otherwise
   */
  hasActiveSession(): boolean {
    return !!this.sessionId;
  }

  /**
   * Gets the current session ID
   * @returns The current session ID or null if there is no active session
   */
  getSessionId(): string | null {
    return this.sessionId;
  }
}

// Export a singleton instance
export const chatService = new ChatService();

export default chatService;

import { v4 as uuidv4 } from 'uuid';
import { VITE_API_URL } from '../config';

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: number;
}

export interface ChatSession {
  sessionId: string;
  messages: Message[];
}

// Session storage key in localStorage
const SESSION_STORAGE_KEY = 'salon_chat_session';

/**
 * ChatService handles all communication with the chat API and manages
 * local session storage for persistence between page reloads
 */
class ChatService {
  private apiUrl: string;
  private session: ChatSession;

  constructor() {
    this.apiUrl = VITE_API_URL;
    this.session = this.loadSession();
  }

  /**
   * Load session from localStorage or create a new one
   */
  private loadSession(): ChatSession {
    const storedSession = localStorage.getItem(SESSION_STORAGE_KEY);
    
    if (storedSession) {
      try {
        return JSON.parse(storedSession);
      } catch (error) {
        console.error('Failed to parse stored session:', error);
      }
    }

    // Create new session if none exists or parsing failed
    return {
      sessionId: uuidv4(),
      messages: []
    };
  }

  /**
   * Save current session to localStorage
   */
  private saveSession(): void {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(this.session));
  }

  /**
   * Get the current session data
   */
  public getSession(): ChatSession {
    return { ...this.session };
  }

  /**
   * Send a message to the AI and get a response
   */
  public async sendMessage(message: string): Promise<Message> {
    try {
      // Create the user message
      const userMessage: Message = {
        id: uuidv4(),
        text: message,
        sender: 'user',
        timestamp: Date.now()
      };

      // Add the user message to the session
      this.session.messages.push(userMessage);
      this.saveSession();

      // Send the message to the API
      const response = await fetch(`${this.apiUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          sessionId: this.session.sessionId
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Create the AI message
      const aiMessage: Message = {
        id: uuidv4(),
        text: data.response,
        sender: 'ai',
        timestamp: Date.now()
      };

      // Add the AI message to the session
      this.session.messages.push(aiMessage);
      this.saveSession();

      return aiMessage;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  /**
   * Fetch chat history from the API
   */
  public async getChatHistory(): Promise<Message[]> {
    try {
      const response = await fetch(`${this.apiUrl}/api/chat/history/${this.session.sessionId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Update the local session with the history from the server
      this.session.messages = data.messages;
      this.saveSession();
      
      return this.session.messages;
    } catch (error) {
      console.error('Error fetching chat history:', error);
      
      // Return the local messages if API call fails
      return this.session.messages;
    }
  }

  /**
   * Clear the current chat session
   */
  public async clearChatSession(): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/api/chat/clear/${this.session.sessionId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        }
      });

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
   * Start a new chat session
   */
  public startNewSession(): void {
    this.session = {
      sessionId: uuidv4(),
      messages: []
    };
    this.saveSession();
  }
}

// Export a singleton instance
const chatService = new ChatService();
export default chatService;

import { config } from '../config';

/**
 * Interface for chat messages
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/**
 * Interface for chat session data
 */
export interface ChatSession {
  sessionId: string;
  messages: ChatMessage[];
}

/**
 * Interface for chat API response
 */
export interface ChatApiResponse {
  message: string;
  sessionId: string;
}

/**
 * Chat service that handles communication with the backend chat API
 * and manages local storage for chat sessions.
 */
class ChatService {
  private readonly STORAGE_KEY = 'salon_chat_session';
  private readonly API_URL = `${config.apiUrl}/api/chat`;
  private session: ChatSession | null = null;

  constructor() {
    this.loadSession();
  }

  /**
   * Load the chat session from local storage or create a new one
   */
  private loadSession(): void {
    const storedSession = localStorage.getItem(this.STORAGE_KEY);
    
    if (storedSession) {
      try {
        this.session = JSON.parse(storedSession);
      } catch (error) {
        console.error('Failed to parse stored session:', error);
        this.createNewSession();
      }
    } else {
      this.createNewSession();
    }
  }

  /**
   * Create a new empty chat session
   */
  private createNewSession(): void {
    this.session = {
      sessionId: '', // Will be assigned by the server on first message
      messages: []
    };
    this.saveSession();
  }

  /**
   * Save the current session to local storage
   */
  private saveSession(): void {
    if (this.session) {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.session));
    }
  }

  /**
   * Get the current chat history
   * @returns Array of messages in the current session
   */
  getMessages(): ChatMessage[] {
    return this.session?.messages || [];
  }

  /**
   * Send a message to the chat API and update the local session
   * @param content - The message content to send
   * @returns Promise with the assistant's response message
   */
  async sendMessage(content: string): Promise<ChatMessage> {
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

      const data: ChatApiResponse = await

