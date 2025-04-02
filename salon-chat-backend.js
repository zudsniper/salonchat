/**
 * Salon Chat Backend Worker
 * 
 * Implements RAG pattern for Apotheca salon chatbot using Cloudflare Workers
 * with D1 database, Vectorize for embeddings, and Workers AI for inference.
 */

// ----------------- Constants -----------------

// Default model for inference
const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct";
// Embedding model for vector search
const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
// Maximum number of relevant services to retrieve
const MAX_RELEVANT_DOCS = 3;

// ----------------- Router Setup -----------------

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Handle CORS for cross-origin requests
    if (request.method === "OPTIONS") {
      return handleCORS();
    }
    
    try {
      // API endpoint routing
      if (path === "/api/chat" && request.method === "POST") {
        return handleCORS(handleChatMessage(request, env, ctx));
      }
      else if (path.match(/^\/api\/chat\/[^\/]+$/) && request.method === "GET") {
        const sessionId = path.split("/").pop();
        return handleCORS(getChatHistory(sessionId, env));
      }
      else if (path.match(/^\/api\/chat\/[^\/]+$/) && request.method === "DELETE") {
        const sessionId = path.split("/").pop();
        return handleCORS(clearChatSession(sessionId, env));
      }
      else if (path === "/api/health") {
        return handleCORS(new Response(JSON.stringify({ status: "healthy" }), {
          headers: { "Content-Type": "application/json" }
        }));
      }
      else if (path === "/api/models" && request.method === "GET") {
        return handleCORS(getModels(env));
      }
      else if (path === "/api/model" && request.method === "GET") {
        return handleCORS(getCurrentModel(env));
      }
      else if (path === "/api/model" && request.method === "PUT") {
        return handleCORS(setModel(request, env));
      }
      else {
        return handleCORS(new Response(JSON.stringify({ error: "Not Found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        }));
      }
    } catch (error) {
      console.error("Unhandled error:", error);
      return handleCORS(new Response(JSON.stringify({ 
        error: "Internal Server Error",
        message: error.message 
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }));
    }
  }
};

/**
 * Handle CORS headers for cross-origin requests
 */
function handleCORS(response = null) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
  
  if (response === null) {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  
  // For promises, await them first
  if (response instanceof Promise) {
    return response.then(actualResponse => {
      const newHeaders = new Headers(actualResponse.headers);
      
      Object.keys(corsHeaders).forEach(key => {
        newHeaders.set(key, corsHeaders[key]);
      });
      
      return new Response(actualResponse.body, {
        status: actualResponse.status,
        statusText: actualResponse.statusText,
        headers: newHeaders
      });
    });
  }
  
  // Regular response handling
  const newHeaders = new Headers(response.headers);
  
  Object.keys(corsHeaders).forEach(key => {
    newHeaders.set(key, corsHeaders[key]);
  });
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

// ----------------- Message Handling -----------------

/**
 * Process a chat message using RAG pattern
 */
async function handleChatMessage(request, env, ctx) {
  try {
    // Clone the request for safety
    const clonedRequest = request.clone();
    const bodyText = await clonedRequest.text();
    
    if (!bodyText) {
      return new Response(JSON.stringify({ error: "Empty request body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    let requestData;
    try {
      requestData = JSON.parse(bodyText);
    } catch (parseError) {
      console.error("JSON parse error:", parseError, "Body:", bodyText);
      return new Response(JSON.stringify({ 
        error: "Invalid JSON in request body",
        details: parseError.message 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Extract sessionId with fallback to ensure it's never null/undefined
    let { message, sessionId, model } = requestData;
    
    // If sessionId is null, undefined, or an empty string, generate a new one
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      console.log(`Generated new sessionId: ${sessionId} (client sent: ${requestData.sessionId || 'null/undefined'})`);
    }
    
    console.log(`Processing message for session ${sessionId}:`, message && message.substring(0, 50) + (message && message.length > 50 ? '...' : ''));
    
    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Ensure the chat_sessions table exists
    await ensureChatSessionsTable(env);
    
    // Get chat history
    let chatHistory = [];
    try {
      const historyResult = await env.SALON_DB.prepare(
        "SELECT messages FROM chat_sessions WHERE id = ?"
      ).bind(sessionId).first();
      
      if (historyResult?.messages) {
        try {
          chatHistory = JSON.parse(historyResult.messages);
          console.log(`Retrieved chat history for session ${sessionId}, found ${chatHistory.length} messages`);
          // Log first few messages to help with debugging
          if (chatHistory.length > 0) {
            console.log("Sample of chat history:");
            chatHistory.slice(Math.max(0, chatHistory.length - 2)).forEach((msg, i) => {
              console.log(`[${i}] ${msg.role}: ${msg.content.substring(0, 30)}...`);
            });
          }
        } catch (parseError) {
          console.error("Error parsing chat history JSON:", parseError);
          // Reset chat history if parsing fails
          chatHistory = [];
        }
      } else {
        console.log(`No existing chat history found for session ${sessionId}`);
      }
    } catch (error) {
      console.error("Error retrieving chat history:", error);
      // Continue with empty history if retrieval fails
    }
    
    // Add user message to history
    chatHistory.push({ role: "user", content: message });
    console.log(`Added user message to history. History now has ${chatHistory.length} messages`);
    
    // Generate embeddings for user query and search vector database
    const relevantServices = await searchRelevantServices(message, env);
    console.log(`Found ${relevantServices.length} relevant services`);
    
    // Construct prompt with context and generate response
    const aiResponse = await generateAIResponse(message, relevantServices, chatHistory, env, model);
    console.log("Generated AI response:", aiResponse.substring(0, 50) + (aiResponse.length > 50 ? '...' : ''));
    
    // Add AI response to history
    chatHistory.push({ role: "assistant", content: aiResponse });
    console.log(`Added AI response to history. Final history has ${chatHistory.length} messages`);
    
    // Update or create chat session in database
    const timestamp = Math.floor(Date.now() / 1000);
    try {
      await env.SALON_DB.prepare(
        `INSERT INTO chat_sessions (id, messages, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
         messages = excluded.messages,
         updated_at = excluded.updated_at`
      ).bind(
        sessionId,
        JSON.stringify(chatHistory),
        timestamp,
        timestamp
      ).run();
      console.log(`Successfully saved chat history to database for session ${sessionId}`);
    } catch (dbError) {
      console.error("Database error when saving chat history:", dbError);
      // Continue even if database update fails
    }
    
    // Check if this is a new session ID (different from what client sent)
    const isNewSession = sessionId !== requestData.sessionId;
    
    const responseData = {
      sessionId,
      isNewSession,
      message: aiResponse
    };
    
    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error("Error handling chat message:", error);
    return new Response(JSON.stringify({ 
      error: "Failed to process message",
      message: error.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

/**
 * Retrieve chat history for a session
 */
async function getChatHistory(sessionId, env) {
  try {
    console.log(`Retrieving chat history for session ${sessionId}`);
    
    // Ensure the chat_sessions table exists
    await ensureChatSessionsTable(env);
    
    const result = await env.SALON_DB.prepare(
      "SELECT messages FROM chat_sessions WHERE id = ?"
    ).bind(sessionId).first();
    
    if (!result?.messages) {
      console.log(`No chat history found for session ${sessionId}`);
      return new Response(JSON.stringify({ error: "Chat session not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    let messages;
    try {
      messages = JSON.parse(result.messages);
      console.log(`Successfully retrieved chat history with ${messages.length} messages for session ${sessionId}`);
      
      // Log a sample of messages to help with debugging
      if (messages.length > 0) {
        console.log("Sample of chat history:");
        const sampleSize = Math.min(messages.length, 3);
        messages.slice(messages.length - sampleSize).forEach((msg, i) => {
          console.log(`[${messages.length - sampleSize + i}] ${msg.role}: ${msg.content.substring(0, 30)}...`);
        });
      }
    } catch (parseError) {
      console.error("Error parsing messages JSON:", parseError);
      return new Response(JSON.stringify({ 
        error: "Invalid chat history format",
        details: parseError.message
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    return new Response(JSON.stringify({
      sessionId,
      messages
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Error retrieving chat history:", error);
    return new Response(JSON.stringify({ error: "Failed to retrieve chat history" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

/**
 * Clear a chat session
 */
async function clearChatSession(sessionId, env) {
  try {
    // Ensure the chat_sessions table exists
    await ensureChatSessionsTable(env);
    
    await env.SALON_DB.prepare(
      "DELETE FROM chat_sessions WHERE id = ?"
    ).bind(sessionId).run();
    
    return new Response(JSON.stringify({
      sessionId,
      status: "cleared"
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Error clearing chat session:", error);
    return new Response(JSON.stringify({ error: "Failed to clear chat session" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// ----------------- RAG Implementation -----------------

/**
 * Search for relevant salon services based on user query
 */
async function searchRelevantServices(query, env) {
  try {
    // Generate embedding vector for the query
    const embedding = await generateEmbedding(query, env);
    
    if (!embedding) {
      console.error("Failed to generate embedding for query");
      return [];
    }
    
    try {
      // Search for similar vectors in Vectorize
      const results = await env.SALON_VECTORIZE.query(embedding, {
        topK: MAX_RELEVANT_DOCS
      });
      
      if (!results?.matches?.length) {
        console.log("No vector matches found for query:", query);
        return [];
      }
      
      // Retrieve service details from D1 database
      const serviceIds = results.matches.map(match => match.id);
      const placeholders = serviceIds.map(() => '?').join(',');
      const sqlQuery = `SELECT * FROM salon_services WHERE id IN (${placeholders})`;
      
      try {
        const services = await env.SALON_DB.prepare(sqlQuery)
          .bind(...serviceIds)
          .all();
        
        return services?.results || [];
      } catch (dbError) {
        console.error("Database error retrieving services:", dbError);
        
        // For testing: if database fails, return mock data in development
        if (env.WORKER_ENV === "development" || env.NODE_ENV === "development") {
          return [
            {
              id: "mock-1",
              name: "Classic Shampoo Style",
              category: "Hair Styling",
              price: "From $42",
              description: "Revitalize your hair with our luxurious Classic Shampoo & Style service."
            }
          ];
        }
        return [];
      }
    } catch (vectorizeError) {
      console.error("Vectorize search error:", vectorizeError);
      
      // For testing: if vectorize fails, return mock data in development
      if (env.WORKER_ENV === "development" || env.NODE_ENV === "development") {
        return [
          {
            id: "mock-1",
            name: "Classic Shampoo Style",
            category: "Hair Styling",
            price: "From $42",
            description: "Revitalize your hair with our luxurious Classic Shampoo & Style service."
          }
        ];
      }
      return [];
    }
  } catch (error) {
    console.error("Error searching relevant services:", error);
    return [];
  }
}

/**
 * Generate embedding vector for text using Workers AI
 */
async function generateEmbedding(text, env) {
  try {
    // Use Workers AI for embeddings
    const response = await env.AI.run(EMBEDDING_MODEL, { text });
    return response.data[0];
  } catch (error) {
    console.error("Error generating embedding:", error);
    
    // Fallback to a mock embedding for testing if in development
    if (env.WORKER_ENV === "development" || env.NODE_ENV === "development") {
      console.log("Using mock embedding for development");
      // Generate a mock 768-dimension vector
      return Array(768).fill(0).map(() => Math.random() - 0.5);
    }
    
    // Return zero vector as fallback
    return Array(768).fill(0);
  }
}

/**
 * Generate AI response based on user message, context, and history
 */
async function generateAIResponse(message, services, history, env, model) {
  try {
    // Format services context as a string with rich details
    let contextText = "";
    if (services.length > 0) {
      contextText = "Here is information about relevant salon services:\n\n";
      services.forEach(service => {
        contextText += `Service: ${service.name}\n`;
        contextText += `Category: ${service.category}\n`;
        contextText += `Price: ${service.price_from || service.price}\n`;
        contextText += `Description: ${service.description}\n`;
        
        // Add detailed service information if available
        if (service.details) {
          let details;
          try {
            if (typeof service.details === 'string') {
              details = JSON.parse(service.details);
            } else {
              details = service.details;
            }
            
            if (details.unit) {
              contextText += `Priced per: ${details.unit}\n`;
            }
            
            if (details.treatment_options && Array.isArray(details.treatment_options)) {
              contextText += `Treatment options: ${details.treatment_options.join(', ')}\n`;
            }
            
            if (details.optional_addons && Array.isArray(details.optional_addons)) {
              contextText += "Optional add-ons:\n";
              details.optional_addons.forEach(addon => {
                contextText += `- ${addon.name}: $${addon.price}${addon.description ? ` (${addon.description})` : ''}\n`;
              });
            }
            
            if (details.not_for && Array.isArray(details.not_for)) {
              contextText += `Not suitable for: ${details.not_for.join(', ')}\n`;
            }
            
            if (details.with_new_growth) {
              contextText += `Price with new growth: $${details.with_new_growth}\n`;
            }
          } catch (error) {
            console.error("Error parsing service details:", error);
          }
        }
        
        contextText += "\n";
      });
    } else {
      contextText = "I don't have specific information about salon services matching your query, but as an expert hairstylist I can still help you.\n\n";
    }
    
    // System prompt with instructions based on original prompt
    const systemPrompt = `You are an expert hairstylist AI chatbot integrated into Apotheca Salon's website, https://apothecaatx.com.
You will converse with clients and help them determine what they want for their hair color, haircut, lashes, eyebrows, etc.
Help them choose what service they need to book on our online booking website.
Be friendly, professional, and use your expertise to guide the client based on their hair needs, concerns, and goals.
Respond conversationally! Do not be too verbose. Be kind, considerate, and friendly.
Ask clarifying questions when needed. Make specific service recommendations. 

When using a service name, bold it. When showing a price, bold it.

Book appointments based on current length, not desired length. If there's a major change in length, such as going from long to short, suggest a Transformation service, or otherwise a long/medium cut. 
We book cuts based on current length, not desired length.

Do not hallucinate services, only suggest specific service names from the list of services. 
All services offer Razor Cut within the service. 

When recommending services, take into account:
- The client's hair type, current length, desired lengthand condition
- Their desired outcome
- Any previous treatments they've had
- Their maintenance preferences
- Any specific concerns they mention
- Any specific hair goals they mention


${contextText}`;
    
    // Format messages for the AI model
    const messages = [
      { role: "system", content: systemPrompt },
      ...history
    ];
    
    let aiResponse;
    
    // Get the current model to use
    let currentModel = model;
    
    // If no model provided in request, check settings table
    if (!currentModel) {
      try {
        // Make sure settings table exists
        await ensureSettingsTable(env);
        const result = await env.SALON_DB.prepare(
          "SELECT value FROM settings WHERE key = 'current_model'"
        ).first();
        if (result?.value) {
          currentModel = result.value;
        } else {
          currentModel = DEFAULT_MODEL;
        }
      } catch (error) {
        console.error("Error getting current model from database:", error);
        currentModel = DEFAULT_MODEL;
      }
    }
    
    // Get AI parameters from environment variables or use defaults
    const aiParams = {
      max_tokens: Number(env.MAX_TOKENS) || 500,
      temperature: Number(env.TEMPERATURE) || 0.7,
      top_p: Number(env.TOP_P) || 0.9,
      top_k: Number(env.TOP_K) || 40,
      frequency_penalty: Number(env.FREQUENCY_PENALTY) || 0.0,
      presence_penalty: Number(env.PRESENCE_PENALTY) || 0.0
    };

    console.log("Using AI parameters:", JSON.stringify(aiParams));
    
    // Check if using Workers AI or OpenAI
    if (env.OPENAI_API_KEY) {
      try {
        // OpenAI implementation
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: messages,
            temperature: aiParams.temperature,
            max_tokens: aiParams.max_tokens,
            top_p: aiParams.top_p,
            frequency_penalty: aiParams.frequency_penalty,
            presence_penalty: aiParams.presence_penalty
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`OpenAI API error: ${response.status}, ${errorText}`);
        }
        
        const data = await response.json();
        aiResponse = data.choices[0].message.content;
      } catch (openaiError) {
        console.error("OpenAI error:", openaiError);
        
        // Fallback to mock response in development environment
        if (env.WORKER_ENV === "development" || env.NODE_ENV === "development") {
          aiResponse = "I'd be happy to help you find the perfect hair service for your needs at Apotheca Salon. Could you tell me more about what you're looking for?";
        } else {
          throw openaiError;
        }
      }
    } else {
      try {
        // Use Workers AI for inference with the current model
        console.log(`Using model: ${currentModel}`);
        
        // Add AI parameters to the request
        const aiRequest = { 
          messages,
          max_tokens: aiParams.max_tokens,
          temperature: aiParams.temperature,
          top_p: aiParams.top_p,
          top_k: aiParams.top_k
        };
        
        // Add frequency/presence penalties if the model supports them
        if (aiParams.frequency_penalty > 0) {
          aiRequest.frequency_penalty = aiParams.frequency_penalty;
        }
        
        if (aiParams.presence_penalty > 0) {
          aiRequest.presence_penalty = aiParams.presence_penalty;
        }
        
        const response = await env.AI.run(currentModel, aiRequest);
        aiResponse = response.response;
      } catch (aiError) {
        console.error(`Error with model ${currentModel}:`, aiError);
        
        // If the selected model fails, try the default model
        if (currentModel !== DEFAULT_MODEL) {
          try {
            console.log(`Falling back to default model: ${DEFAULT_MODEL}`);
            const response = await env.AI.run(DEFAULT_MODEL, { 
              messages,
              max_tokens: aiParams.max_tokens,
              temperature: aiParams.temperature,
              top_p: aiParams.top_p,
              top_k: aiParams.top_k
            });
            aiResponse = response.response;
          } catch (fallbackError) {
            console.error("Default model fallback error:", fallbackError);
            
            // Fallback to mock response in development environment
            if (env.WORKER_ENV === "development" || env.NODE_ENV === "development") {
              aiResponse = "I'd be happy to help you find the perfect hair service for your needs at Apotheca Salon. Could you tell me more about what you're looking for?";
            } else {
              throw fallbackError;
            }
          }
        } else {
          // Fallback to mock response in development environment
          if (env.WORKER_ENV === "development" || env.NODE_ENV === "development") {
            aiResponse = "I'd be happy to help you find the perfect hair service for your needs at Apotheca Salon. Could you tell me more about what you're looking for?";
          } else {
            throw aiError;
          }
        }
      }
    }
    
    return aiResponse || "As an expert hairstylist at Apotheca Salon, I'd love to help you find the perfect service for your hair needs. What are you looking for today?";
  } catch (error) {
    console.error("Error generating AI response:", error);
    return "I'm sorry, I'm having trouble processing your request right now. Please try again later or contact Apotheca Salon directly at (555) 123-4567 for assistance.";
  }
}

/**
 * Retrieve available models
 */
async function getModels(env) {
  try {
    // Use the full static models.json data
    const models = [
      {
        id: "deepseek-coder-6.7b-base-awq",
        provider: "thebloke",
        fullName: "@cf/thebloke/deepseek-coder-6.7b-base-awq"
      },
      {
        id: "deepseek-coder-6.7b-instruct-awq",
        provider: "thebloke",
        fullName: "@cf/thebloke/deepseek-coder-6.7b-instruct-awq"
      },
      {
        id: "deepseek-math-7b-instruct",
        provider: "deepseek-ai",
        fullName: "@cf/deepseek-ai/deepseek-math-7b-instruct"
      },
      {
        id: "deepseek-r1-distill-qwen-32b",
        provider: "deepseek-ai",
        fullName: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b"
      },
      {
        id: "discolm-german-7b-v1-awq",
        provider: "thebloke",
        fullName: "@cf/thebloke/discolm-german-7b-v1-awq"
      },
      {
        id: "falcon-7b-instruct",
        provider: "tiiuae",
        fullName: "@cf/tiiuae/falcon-7b-instruct"
      },
      {
        id: "gemma-2b-it-lora",
        provider: "Google",
        fullName: "@cf/google/gemma-2b-it-lora"
      },
      {
        id: "gemma-7b-it-lora",
        provider: "Google",
        fullName: "@cf/google/gemma-7b-it-lora"
      },
      {
        id: "gemma-7b-it",
        provider: "Google",
        fullName: "@hf/google/gemma-7b-it"
      },
      {
        id: "hermes-2-pro-mistral-7b",
        provider: "nousresearch",
        fullName: "@cf/nousresearch/hermes-2-pro-mistral-7b"
      },
      {
        id: "llama-2-13b-chat-awq",
        provider: "thebloke",
        fullName: "@cf/thebloke/llama-2-13b-chat-awq"
      },
      {
        id: "llama-2-7b-chat-hf-lora",
        provider: "meta-llama",
        fullName: "@cf/meta-llama/llama-2-7b-chat-hf-lora"
      },
      {
        id: "llama-2-7b-chat-fp16",
        provider: "Meta",
        fullName: "@cf/meta/llama-2-7b-chat-fp16"
      },
      {
        id: "llama-2-7b-chat-int8",
        provider: "Meta",
        fullName: "@cf/meta/llama-2-7b-chat-int8"
      },
      {
        id: "llama-3-8b-instruct-awq",
        provider: "Meta",
        fullName: "@cf/meta/llama-3-8b-instruct-awq"
      },
      {
        id: "llama-3-8b-instruct",
        provider: "Meta",
        fullName: "@cf/meta/llama-3-8b-instruct"
      },
      {
        id: "llama-3.1-70b-instruct",
        provider: "Meta",
        fullName: "@cf/meta/llama-3.1-70b-instruct"
      },
      {
        id: "llama-3.1-8b-instruct-awq",
        provider: "Meta",
        fullName: "@cf/meta/llama-3.1-8b-instruct-awq"
      },
      {
        id: "llama-3.1-8b-instruct-fp8",
        provider: "Meta",
        fullName: "@cf/meta/llama-3.1-8b-instruct-fp8"
      },
      {
        id: "llama-3.1-8b-instruct-fast",
        provider: "Meta",
        fullName: "@cf/meta/llama-3.1-8b-instruct-fast"
      },
      {
        id: "llama-3.1-8b-instruct",
        provider: "Meta",
        fullName: "@cf/meta/llama-3.1-8b-instruct"
      },
      {
        id: "llama-3.2-11b-vision-instruct",
        provider: "Meta",
        fullName: "@cf/meta/llama-3.2-11b-vision-instruct"
      },
      {
        id: "llama-3.2-1b-instruct",
        provider: "Meta",
        fullName: "@cf/meta/llama-3.2-1b-instruct"
      },
      {
        id: "llama-3.2-3b-instruct",
        provider: "Meta",
        fullName: "@cf/meta/llama-3.2-3b-instruct"
      },
      {
        id: "llama-3.3-70b-instruct-fp8-fast",
        provider: "Meta",
        fullName: "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
      },
      {
        id: "llama-guard-3-8b",
        provider: "Meta",
        fullName: "@cf/meta/llama-guard-3-8b"
      },
      {
        id: "llamaguard-7b-awq",
        provider: "thebloke",
        fullName: "@cf/thebloke/llamaguard-7b-awq"
      },
      {
        id: "meta-llama-3-8b-instruct",
        provider: "meta-llama",
        fullName: "@cf/meta-llama/meta-llama-3-8b-instruct"
      },
      {
        id: "mistral-7b-instruct-v0.1-awq",
        provider: "thebloke",
        fullName: "@cf/thebloke/mistral-7b-instruct-v0.1-awq"
      },
      {
        id: "mistral-7b-instruct-v0.1",
        provider: "MistralAI",
        fullName: "@cf/mistralai/mistral-7b-instruct-v0.1"
      },
      {
        id: "mistral-7b-instruct-v0.2-lora",
        provider: "MistralAI",
        fullName: "@cf/mistralai/mistral-7b-instruct-v0.2-lora"
      },
      {
        id: "mistral-7b-instruct-v0.2",
        provider: "MistralAI",
        fullName: "@cf/mistralai/mistral-7b-instruct-v0.2"
      },
      {
        id: "neural-chat-7b-v3-1-awq",
        provider: "thebloke",
        fullName: "@cf/thebloke/neural-chat-7b-v3-1-awq"
      },
      {
        id: "openchat-3.5-0106",
        provider: "openchat",
        fullName: "@cf/openchat/openchat-3.5-0106"
      },
      {
        id: "openhermes-2.5-mistral-7b-awq",
        provider: "thebloke",
        fullName: "@cf/thebloke/openhermes-2.5-mistral-7b-awq"
      },
      {
        id: "phi-2",
        provider: "Microsoft",
        fullName: "@cf/microsoft/phi-2"
      },
      {
        id: "qwen1.5-0.5b-chat",
        provider: "qwen",
        fullName: "@cf/qwen/qwen1.5-0.5b-chat"
      },
      {
        id: "qwen1.5-1.8b-chat",
        provider: "qwen",
        fullName: "@cf/qwen/qwen1.5-1.8b-chat"
      },
      {
        id: "qwen1.5-14b-chat-awq",
        provider: "qwen",
        fullName: "@cf/qwen/qwen1.5-14b-chat-awq"
      },
      {
        id: "qwen1.5-7b-chat-awq",
        provider: "qwen",
        fullName: "@cf/qwen/qwen1.5-7b-chat-awq"
      },
      {
        id: "sqlcoder-7b-2",
        provider: "defog",
        fullName: "@cf/defog/sqlcoder-7b-2"
      },
      {
        id: "starling-lm-7b-beta",
        provider: "nexusflow",
        fullName: "@cf/nexusflow/starling-lm-7b-beta"
      },
      {
        id: "tinyllama-1.1b-chat-v1.0",
        provider: "tinyllama",
        fullName: "@cf/tinyllama/tinyllama-1.1b-chat-v1.0"
      },
      {
        id: "una-cybertron-7b-v2-bf16",
        provider: "fblgit",
        fullName: "@cf/fblgit/una-cybertron-7b-v2-bf16"
      },
      {
        id: "zephyr-7b-beta-awq",
        provider: "thebloke",
        fullName: "@cf/thebloke/zephyr-7b-beta-awq"
      }
    ];
    
    return new Response(JSON.stringify({ models }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Error retrieving models:", error);
    return new Response(JSON.stringify({ error: "Failed to retrieve models" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

/**
 * Get current model setting
 */
async function getCurrentModel(env) {
  try {
    // Make sure settings table exists
    await ensureSettingsTable(env);
    
    // Try to get the current model from the database
    const result = await env.SALON_DB.prepare(
      "SELECT value FROM settings WHERE key = 'current_model'"
    ).first();
    
    // Return the current model or the default if not set
    const model = result?.value || DEFAULT_MODEL;
    
    return new Response(JSON.stringify({ model }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Error getting current model:", error);
    
    // Return the default model if there's an error
    return new Response(JSON.stringify({ model: DEFAULT_MODEL }), {
      headers: { "Content-Type": "application/json" }
    });
  }
}

/**
 * Set current model
 */
async function setModel(request, env) {
  try {
    // Parse the request body
    const data = await request.json();
    
    if (!data.model) {
      return new Response(JSON.stringify({ error: "Model parameter is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Make sure settings table exists
    await ensureSettingsTable(env);
    
    // Save the model setting to the database
    const timestamp = Math.floor(Date.now() / 1000);
    await env.SALON_DB.prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`
    ).bind(
      'current_model',
      data.model,
      timestamp
    ).run();
    
    return new Response(JSON.stringify({ success: true, model: data.model }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Error setting model:", error);
    return new Response(JSON.stringify({ error: "Failed to set model" }), {
      status: 500, 
      headers: { "Content-Type": "application/json" }
    });
  }
}

/**
 * Ensure settings table exists
 */
async function ensureSettingsTable(env) {
  try {
    await env.SALON_DB.prepare(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER
      )
    `).run();
  } catch (error) {
    console.error("Error creating settings table:", error);
  }
}

/**
 * Ensure chat_sessions table exists
 */
async function ensureChatSessionsTable(env) {
  try {
    await env.SALON_DB.prepare(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        messages TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();
    
    // Create an index for faster lookups by session ID
    await env.SALON_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_id ON chat_sessions (id)
    `).run();
    
    console.log("Ensured chat_sessions table and indexes exist");
  } catch (error) {
    console.error("Error ensuring chat_sessions table:", error);
  }
}
