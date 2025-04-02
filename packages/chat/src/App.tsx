import React, { useState, useEffect, useRef } from 'react';
import { createChatService, ChatMessage } from './services/cloudflare';
import { apiUrl, chatConfig } from './config';
import './styles.css';

const chatService = createChatService(apiUrl);

const App: React.FC = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Initialize chat
  useEffect(() => {
    const initChat = async () => {
      try {
        // Load saved messages
        const savedMessages = await chatService.getHistory();
        setMessages(savedMessages);
        
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
  
  // Scroll to bottom when messages change
  useEffect(() => {
    if (chatConfig.behavior.autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);
  
  // Handle message submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || loading) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const updatedMessages = await chatService.sendMessage(input);
      setMessages(updatedMessages);
      setInput('');
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
        <button 
          className="clear-button" 
          onClick={handleClearConversation}
          aria-label={chatConfig.content.clearButtonLabel}
        >
          {chatConfig.content.clearButtonLabel}
        </button>
      </div>
      
      <div className="salon-chat-container">
        <div className="salon-messages">
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`salon-message ${msg.role === 'user' ? 'user-message' : 'assistant-message'}`}
            >
              <div className="message-bubble">
                <div className="message-content">{msg.content}</div>
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
            aria-label={loading ? chatConfig.content.loadingLabel : chatConfig.content.sendButtonLabel}
          >
            {loading ? chatConfig.content.loadingLabel : chatConfig.content.sendButtonLabel}
          </button>
        </form>
      </div>
    </div>
  );
};

export default App;
