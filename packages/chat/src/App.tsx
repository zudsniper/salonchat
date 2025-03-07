import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { config } from './config';

interface ChatMessage {
  id: string;
  text: string;
  user: string;
  timestamp: number;
}

const App: React.FC = () => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [username, setUsername] = useState(`User_${Math.floor(Math.random() * 1000)}`);
  const socketRef = useRef<Socket | null>(null);
  
  useEffect(() => {
    // Connect to the server
    socketRef.current = io(config.apiUrl);
    
    // Listen for incoming messages
    socketRef.current.on('message', (newMessage: ChatMessage) => {
      setMessages(prevMessages => [...prevMessages, newMessage]);
    });
    
    // Cleanup on unmount
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      const newMessage: ChatMessage = {
        id: Date.now().toString(),
        text: message,
        user: username,
        timestamp: Date.now(),
      };
      
      // Send message to server
      socketRef.current?.emit('message', newMessage);
      
      setMessage('');
    }
  };
  
  return (
    <div className="app-container">
      <h1>SalonChat</h1>
      <div className="chat-container">
        <div className="messages">
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`message ${msg.user === username ? 'own-message' : ''}`}
            >
              <div className="message-user">{msg.user}</div>
              <div className="message-text">{msg.text}</div>
              <div className="message-time">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message..."
          />
          <button type="submit">Send</button>
        </form>
      </div>
    </div>
  );
};

export default App;
