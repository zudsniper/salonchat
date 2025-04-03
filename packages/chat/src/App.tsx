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
  const [showTyping, setShowTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<{ id: string; provider: string; fullName: string }[]>([]);
  const [currentModel, setCurrentModel] = useState<string>('');
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [userScrolled, setUserScrolled] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    // Check initially
    checkMobile();
    
    // Add event listener for resize
    window.addEventListener('resize', checkMobile);
    
    // Cleanup
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
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
  
  // Handle keyboard visibility on mobile
  useEffect(() => {
    if (!isMobile) return;
    
    const handleFocus = () => {
      // Small delay to let the keyboard appear
      setTimeout(() => {
        resetScroll();
      }, 300);
    };
    
    const handleBlur = () => {
      // Restore scroll when keyboard disappears
      setTimeout(() => {
        window.scrollTo(0, 0);
      }, 100);
    };
    
    const inputElement = inputRef.current;
    if (inputElement) {
      inputElement.addEventListener('focus', handleFocus);
      inputElement.addEventListener('blur', handleBlur);
      
      return () => {
        inputElement.removeEventListener('focus', handleFocus);
        inputElement.removeEventListener('blur', handleBlur);
      };
    }
  }, [isMobile, inputRef.current]);
  
  // Detect user scroll
  useEffect(() => {
    const messagesContainer = messagesContainerRef.current;
    if (!messagesContainer) return;
    
    const handleScroll = () => {
      // Check if user has scrolled up (not at bottom)
      const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
      
      // When close to bottom (within 20px), we consider user at bottom
      // This prevents minor scroll differences from triggering userScrolled
      const atBottom = scrollHeight - scrollTop - clientHeight < 20;
      
      // Only update the state if it's changing to avoid unnecessary rerenders
      if (userScrolled === atBottom) {
        setUserScrolled(!atBottom);
      }
    };
    
    messagesContainer.addEventListener('scroll', handleScroll);
    return () => messagesContainer.removeEventListener('scroll', handleScroll);
  }, [userScrolled]);
  
  // Scroll to bottom ONLY when new message arrives
  useEffect(() => {
    // Only scroll if a new message has been added
    const isNewMessage = messages.length > 0 && 
      (messages[messages.length - 1].animationState === 'appearing');
    
    if (isNewMessage && messagesEndRef.current && chatConfig.behavior.autoScroll) {
      // Use a small timeout to ensure DOM is updated
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [messages]);
  
  // Reset user scroll flag when sending messages
  const resetScroll = () => {
    if (messagesContainerRef.current) {
      const { scrollHeight, clientHeight } = messagesContainerRef.current;
      messagesContainerRef.current.scrollTop = scrollHeight - clientHeight;
    }
  };
  
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
    
    // Create temporary user message to display immediately
    const userMessage: ChatMessage = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content: messageText,
      timestamp: Date.now(),
      animationState: 'appearing'
    };
    
    // Add user message to UI immediately
    setMessages(prevMessages => [...prevMessages, userMessage]);
    
    // Reset scroll position to bottom
    resetScroll();
    
    // On mobile, blur the input to hide keyboard
    if (isMobile && inputRef.current) {
      inputRef.current.blur();
    }
    
    // Then start loading state for assistant response
    setLoading(true);
    setError(null);
    
    // Natural delay before showing typing indicator
    const initialDelay = chatConfig.behavior.typingIndicatorDelay || 800;
    
    // Create a more natural typing pattern with random pauses
    const simulateNaturalTyping = () => {
      let totalThinkingTime = 0;
      const minThinkingTime = 2000; // Minimum thinking time in ms
      const maxThinkingTime = 4000; // Maximum thinking time in ms
      const targetThinkingTime = Math.random() * (maxThinkingTime - minThinkingTime) + minThinkingTime;
      
      // Initial delay before showing typing indicator
      setTimeout(() => {
        setShowTyping(true);
        
        // Start the thinking simulation loop
        const thinkingLoop = () => {
          // Random pause time between 400-1200ms
          const pauseTime = Math.random() * 800 + 400;
          
          // Only continue the simulation if total time is less than target
          if (totalThinkingTime < targetThinkingTime) {
            setTimeout(() => {
              // 30% chance to hide the indicator during thinking
              if (Math.random() < 0.3) {
                setShowTyping(false);
                
                // Show it again after a short pause
                setTimeout(() => {
                  setShowTyping(true);
                  totalThinkingTime += pauseTime;
                  thinkingLoop();
                }, pauseTime);
              } else {
                totalThinkingTime += pauseTime;
                thinkingLoop();
              }
            }, pauseTime);
          }
        };
        
        thinkingLoop();
      }, initialDelay);
    };
    
    simulateNaturalTyping();
    
    try {
      // Send to backend and get updated messages
      const updatedMessages = await chatService.sendMessage(messageText);
      
      // Mark the latest message as appearing for animation
      if (updatedMessages.length > 0) {
        const lastMessage = updatedMessages[updatedMessages.length - 1];
        if (lastMessage.role === 'assistant') {
          lastMessage.animationState = 'appearing';
        }
      }
      
      // Short delay before showing the response (feels more natural)
      setTimeout(() => {
        setMessages(updatedMessages);
        setLoading(false);
        setShowTyping(false);
        
        // Reset scroll position to bottom for new assistant message
        resetScroll();
      }, 300);
    } catch (err) {
      // We already added the user message, so we don't need to add it again
      setError(chatConfig.content.errorMessage);
      console.error('Error sending message:', err);
      setLoading(false);
      setShowTyping(false);
    }
  };
  
  // Handle animation end for messages
  useEffect(() => {
    const timeout = setTimeout(() => {
      setMessages(prevMessages => 
        prevMessages.map(msg => 
          msg.animationState === 'appearing' 
            ? { ...msg, animationState: 'appeared' } 
            : msg
        )
      );
    }, 500);
    
    return () => clearTimeout(timeout);
  }, [messages]);
  
  // Handle clearing conversation
  const handleClearConversation = async () => {
    try {
      await chatService.clearSession();
      setMessages([]);
      setError(null);
    } catch (err) {
      console.error('Failed to clear conversation:', err);
    }
  };
  
  // Handle saving conversation as markdown
  const handleSaveConversation = () => {
    // Generate a timestamp for the filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `conversation-${timestamp}.md`;
    
    // Get the model display name for metadata
    const modelName = currentModel ? getModelDisplayName(currentModel) : 'Unknown Model';
    
    // Create markdown content with metadata as YAML frontmatter
    let markdownContent = `---
timestamp: ${new Date().toISOString()}
model: ${modelName}
session_id: ${chatService.getSessionId() || 'Unknown'}
message_count: ${messages.length}
saved_at: ${new Date().toLocaleString()}
---

# Conversation ${new Date().toLocaleString()}

`;
    
    // Add each message to the markdown
    messages.forEach((msg) => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      const time = new Date(msg.timestamp).toLocaleString();
      markdownContent += `## ${role} (${time})\n\n${msg.content}\n\n`;
    });
    
    // Create a download link
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
  };
  
  return (
    <div className="salon-app-container">
      <div className="salon-header">
        <h1>{chatConfig.content.headerTitle}</h1>
        <button 
          className="save-button" 
          onClick={handleSaveConversation}
          aria-label="Save Conversation"
        >
          Save
        </button>
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
        <div className="salon-messages" ref={messagesContainerRef}>
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`salon-message ${msg.role === 'user' ? 'user-message' : 'assistant-message'} ${
                msg.animationState === 'appearing' 
                  ? msg.role === 'user' 
                    ? 'user-message-appearing' 
                    : 'assistant-message-appearing' 
                  : ''
              }`}
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
          
          {loading && showTyping && (
            <div className="salon-message assistant-message loading-message-container">
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
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={chatConfig.content.inputPlaceholder}
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
