import React, { useState, useEffect, useRef } from 'react';
import { createChatService, ChatMessage } from './services/cloudflare';
import { apiUrl, chatConfig } from './config';
import './styles.css';
import ReactMarkdown from 'react-markdown';

// Model data - use fetch from server or local static data
const fetchModels = async () => {
  try {
    // Fetch from server
    const response = await fetch(`${apiUrl}/api/models`);
    if (response.ok) {
      const data = await response.json();
      if (data.models && Array.isArray(data.models)) {
        return data.models;
      }
    }
    throw new Error('Failed to fetch models from server');
  } catch (error) {
    console.error('Error fetching models:', error);
    // Default models if all else fails
    return [
      {
        id: "deepseek-r1-distill-qwen-32b",
        provider: "deepseek-ai",
        fullName: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b"
      },
      {
        id: "llama-3-8b-instruct",
        provider: "Meta",
        fullName: "@cf/Meta/llama-3-8b-instruct"
      },
      {
        id: "mistral-7b-instruct-v0.2",
        provider: "MistralAI",
        fullName: "@cf/MistralAI/mistral-7b-instruct-v0.2"
      }
    ];
  }
};

// Fetch the current model directly from the API
const fetchCurrentModel = async () => {
  try {
    const response = await fetch(`${apiUrl}/api/model`);
    if (response.ok) {
      const data = await response.json();
      if (data.model) {
        return data.model;
      }
    }
    throw new Error('Failed to fetch current model');
  } catch (error) {
    console.error('Error fetching current model:', error);
    return '';
  }
};

const chatService = createChatService(apiUrl);

const App: React.FC = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<{ id: string; provider: string; fullName: string }[]>([]);
  const [currentModel, setCurrentModel] = useState<string>('');
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  
  // Initialize chat and load model
  useEffect(() => {
    const initChat = async () => {
      try {
        // Load models
        const modelsList = await fetchModels();
        setModels(modelsList);
        
        // Load saved messages
        const savedMessages = await chatService.getHistory();
        setMessages(savedMessages);
        
        // Get current model from API
        const model = await fetchCurrentModel();
        setCurrentModel(model);
        
        // Add welcome message if no messages
        if (savedMessages.length === 0 && chatConfig.content.welcomeMessage) {
          setTimeout(() => {
            setMessages([{
              id: 'welcome',
              role: 'assistant',
              content: chatConfig.content.welcomeMessage,
              timestamp: Date.now()
            }]);
          }, chatConfig.behavior.initialMessageDelay);
        }
      } catch (err) {
        console.error('Failed to initialize chat:', err);
      }
    };
    
    initChat();
  }, []);
  
  // Handle clicks outside the model dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modelDropdownRef.current && 
        !modelDropdownRef.current.contains(event.target as Node) && 
        modelDropdownOpen
      ) {
        setModelDropdownOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [modelDropdownOpen]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    if (chatConfig.behavior.autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);
  
  // Handle model change
  const handleModelChange = async (model: string) => {
    try {
      setLoading(true);
      
      // Update the model via API
      const response = await fetch(`${apiUrl}/api/model`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model })
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      // Update the local service
      await chatService.setModel(model);
      setCurrentModel(model);
      setModelDropdownOpen(false);
    } catch (err) {
      console.error('Failed to change model:', err);
      setError('Failed to change model. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Get display name for model
  const getModelDisplayName = (fullName: string) => {
    const model = models.find(m => m.fullName === fullName);
    if (model) {
      return `${model.id} (${model.provider})`;
    }
    return fullName.replace('@cf/', '');
  };
  
  // Handle message submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || loading) return;
    
    const messageText = input.trim();
    
    // Clear input immediately
    setInput('');
    
    // Create and display user message immediately
    const userMessage: ChatMessage = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content: messageText,
      timestamp: Date.now()
    };
    
    // Add user message to UI immediately
    setMessages(prevMessages => [...prevMessages, userMessage]);
    
    // Then start loading state for assistant response
    setLoading(true);
    setError(null);
    
    try {
      // Send to backend and get updated messages
      const updatedMessages = await chatService.sendMessage(messageText);
      setMessages(updatedMessages);
    } catch (err) {
      setError(chatConfig.content.errorMessage);
      console.error('Error sending message:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle clearing conversation
  const handleClearConversation = async () => {
    try {
      await chatService.clearSession();
      setMessages([]);
      setError(null);
      
      // Add welcome message
      if (chatConfig.content.welcomeMessage) {
        setTimeout(() => {
          setMessages([{
            id: 'welcome',
            role: 'assistant',
            content: chatConfig.content.welcomeMessage,
            timestamp: Date.now()
          }]);
        }, chatConfig.behavior.initialMessageDelay);
      }
    } catch (err) {
      console.error('Failed to clear conversation:', err);
    }
  };
  
  return (
    <div className="salon-app-container">
      <div className="salon-header">
        <h1>{chatConfig.content.headerTitle}</h1>
        <div className="salon-header-controls">
          <div className="model-selector" ref={modelDropdownRef}>
            <button 
              className="model-selector-button" 
              onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
              disabled={loading}
            >
              {currentModel ? getModelDisplayName(currentModel) : 'Select Model'}
            </button>
            {modelDropdownOpen && (
              <div className="model-dropdown">
                {models.map((model) => (
                  <div 
                    key={model.id} 
                    className={`model-option ${currentModel === model.fullName ? 'selected' : ''}`}
                    onClick={() => handleModelChange(model.fullName)}
                  >
                    {model.id} ({model.provider})
                  </div>
                ))}
              </div>
            )}
          </div>
          <button 
            className="clear-button" 
            onClick={handleClearConversation}
            aria-label={chatConfig.content.clearButtonLabel}
          >
            {chatConfig.content.clearButtonLabel}
          </button>
        </div>
      </div>
      
      <div className="salon-chat-container">
        <div className="salon-messages">
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`salon-message ${msg.role === 'user' ? 'user-message' : 'assistant-message'}`}
            >
              <div className="message-bubble">
                <div className="message-content">
                  {msg.role === 'user' ? (
                    msg.content
                  ) : (
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  )}
                </div>
                <div className="message-time">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
          
          {loading && (
            <div className="salon-message assistant-message">
              <div className="message-bubble loading-message">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
        
        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}
        
        <form className="salon-message-form" onSubmit={handleSubmit}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={chatConfig.content.inputPlaceholder}
            disabled={loading}
            className="salon-message-input"
            aria-label="Message input"
          />
          <button 
            type="submit" 
            disabled={loading || !input.trim()} 
            className="salon-send-button"
            aria-label={chatConfig.content.sendButtonLabel}
          >
            {chatConfig.content.sendButtonLabel}
          </button>
        </form>
      </div>
    </div>
  );
};

export default App;
