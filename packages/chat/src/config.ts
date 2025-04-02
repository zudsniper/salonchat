// Chat configuration

interface ImportMetaEnv {
  VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// API URL for the backend
export const apiUrl = import.meta.env.VITE_API_URL || 'https://salon-chat-backend.me-810.workers.dev';

// Default system prompt
export const defaultSystemPrompt = `You are an expert hairstylist AI chatbot integrated onto Apotheca Salon's website.
You will converse with clients and help them determine what they want for their hair color, haircut, lashes, eyebrows, etc.
Help them choose what service they need to book on our online booking website.

Be friendly, professional, and use your expertise to guide the client based on their hair needs, concerns, and goals.
Ask clarifying questions when needed. Make specific service recommendations.`;

// Chat UI configuration
export const chatConfig = {
  // Visual configuration
  appearance: {
    accentColor: '#d05a9c',
    fontFamily: "'Montserrat', 'Arial', sans-serif",
    bubbleRadius: '20px',
    height: '500px',
    width: '350px',
  },

  // Behavior configuration
  behavior: {
    initialMessageDelay: 800,
    typingIndicatorDelay: 500,
    autoScroll: true,
    persistConversation: true,
  },

  // Content configuration
  content: {
    headerTitle: 'Beauty Salon Assistant',
    welcomeMessage: 'Hello! I\'m your Apotheca Salon Assistant. How can I help you today?',
    inputPlaceholder: 'Ask about salon services, appointments, etc...',
    clearButtonLabel: 'Clear Conversation',
    sendButtonLabel: 'Send',
    loadingLabel: 'Sending...',
    errorMessage: 'Sorry, I couldn\'t process your request. Please try again.',
  }
};

export default {
  apiUrl,
  defaultSystemPrompt,
  chatConfig,
};
