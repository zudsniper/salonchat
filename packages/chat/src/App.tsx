import React, { useState, useEffect, useRef } from 'react';
import { chatService, Message } from './services/chatService';
import { config } from './config';

const App: React.FC = () => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    // Load initial messages from chat service
    setMessages(chatService.getMessages());
  }, []);
  
  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (message.trim()) {
      setLoading(true);
      try {
        // Send message using chat service
        await chatService.sendMessage(message);
        // Update messages from service to ensure we have both user and assistant messages
        setMessages(chatService.getMessages());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message');
        console.error('Error sending message:', err);
      } finally {
        setLoading(false);
        setMessage('');
      }
    }
  };
  
  const handleClearConversation = () => {
    chatService.clearSession();
    setMessages([]);
    setError(null);
  };
  
  return (
    <div className="salon-app-container">
      <div className="salon-header">
        <h1>Beauty Salon Assistant</h1>
        <button 
          className="clear-button" 
          onClick={handleClearConversation}
          title="Clear conversation history"
        >
          Clear Conversation
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
                  {new Date(msg.timestamp).toLocaleTimeString()}
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
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask about salon services, appointments, etc..."
            disabled={loading}
            className="salon-message-input"
          />
          <button 
            type="submit" 
            disabled={loading || !message.trim()} 
            className="salon-send-button"
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
        </form>
      </div>
      
      <style jsx>{`
        .salon-app-container {
          font-family: 'Montserrat', 'Arial', sans-serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          color: #333;
        }
        
        .salon-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        
        .salon-header h1 {
          color: #d05a9c;
          margin: 0;
        }
        
        .clear-button {
          background-color: #f5f5f5;
          color: #666;
          border: 1px solid #ddd;
          padding: 5px 10px;
          border-radius: 20px;
          cursor: pointer;
          font-size: 0.8rem;
          transition: all 0.2s ease;
        }
        
        .clear-button:hover {
          background-color: #e6e6e6;
          color: #333;
        }
        
        .salon-chat-container {
          background-color: #f8f4f7;
          border-radius: 15px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }
        
        .salon-messages {
          height: 400px;
          overflow-y: auto;
          padding: 20px;
        }
        
        .salon-message {
          display: flex;
          margin-bottom: 15px;
        }
        
        .user-message {
          justify-content: flex-end;
        }
        
        .assistant-message {
          justify-content: flex-start;
        }
        
        .message-bubble {
          max-width: 70%;
          padding: 12px 15px;
          border-radius: 20px;
          position: relative;
        }
        
        .user-message .message-bubble {
          background-color: #d05a9c;
          color: white;
          border-bottom-right-radius: 5px;
        }
        
        .assistant-message .message-bubble {
          background-color: white;
          color: #333;
          border-bottom-left-radius: 5px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        .message-content {
          font-size: 0.95rem;
          line-height: 1.4;
          word-break: break-word;
        }
        
        .message-time {
          font-size: 0.7rem;
          opacity: 0.7;
          margin-top: 5px;
          text-align: right;
        }
        
        .salon-message-form {
          display: flex;
          padding: 15px;
          background-color: white;
          border-top: 1px solid #eee;
        }
        
        .salon-message-input {
          flex: 1;
          padding: 12px 15px;
          border: 1px solid #ddd;
          border-radius: 25px;
          font-size: 0.95rem;
          outline: none;
          transition: border 0.2s ease;
        }
        
        .salon-message-input:focus {
          border-color: #d05a9c;
        }
        
        .salon-send-button {
          margin-left: 10px;
          padding: 0 20px;
          background-color: #d05a9c;
          color: white;
          border: none;
          border-radius: 25px;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }
        
        .salon-send-button:hover:not(:disabled) {
          background-color: #b8437e;
        }
        
        .salon-send-button:disabled {
          background-color: #e0aec7;
          cursor: not-allowed;
        }
        
        .error-message {
          background-color: #fee;
          color: #c00;
          padding: 10px 15px;
          border-radius: 5px;
          margin: 10px 15px;
          font-size: 0.9rem;
        }
        
        .loading-message {
          min-width: 60px;
        }
        
        .typing-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 5px 0;
        }
        
        .typing-indicator span {
          height: 8px;
          width: 8px;
          background-color: #bbb;
          border-radius: 50%;
          display: inline-block;
          margin: 0 2px;
          animation: bounce 1.5s infinite ease-in-out;
        }
        
        .typing-indicator span:nth-child(1) {
          animation-delay: 0s;
        }
        
        .typing-indicator span:nth-child(2) {
          animation-delay: 0.2s;
        }
        
        .typing-indicator span:nth-child(3) {
          animation-delay: 0.4s;
        }
        
        @keyframes bounce {
          0%, 60%, 100% {
            transform: translateY(0);
          }
          30% {
            transform: translateY(-4px);
          }
        }
      `}</style>
    </div>
  );
};

export default App;
