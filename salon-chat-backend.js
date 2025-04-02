/**
 * Salon Chat Backend Worker
 * 
 * Implements RAG pattern for Apotheca salon chatbot using Cloudflare Workers
 * with D1 database, Vectorize for embeddings, and Workers AI for inference.
 */

// ----------------- Constants -----------------

// Default model for inference
const DEFAULT_MODEL = "@cf/meta/llama-3-8b-instruct";
// Embedding model for vector search
const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
// Maximum number of relevant services to retrieve
const MAX_RELEVANT_DOCS = 5;

// ----------------- Router Setup -----------------

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Handle CORS for cross-origin requests
    if (request.method === "OPTIONS") {
      return handleCORS();
    }
    
    // API endpoint routing
    if (path === "/api/chat" && request.method === "POST") {
      return await handleCORS(handleChatMessage(request, env, ctx));
    }
    else if (path.match(/^\/api\/chat\/[^\/]+$/) && request.method === "GET") {
      const sessionId = path.split("/").pop();
      return await handleCORS(getChatHistory(sessionId, env));
    }
    else if (path.match(/^\/api\/chat\/[^\/]+$/) && request.method === "DELETE") {
      const sessionId = path.split("/").pop();
      return await handleCORS(clearChatSession(sessionId, env));
    }
    else if (path === "/api/health") {
      return await handleCORS(new Response(JSON.stringify({ status: "healthy" }), {
        headers: { "Content-Type": "application/json" }
      }));
    }
    else {
      return await handleCORS(new Response("Not Found", { status: 404 }));
    }
  }
};

/**
 * Handle CORS headers for cross-origin requests
 */
function handleCORS(response = null) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  
  if (response === null) {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  
  // Clone the response and add CORS headers
  const originalHeaders = response.headers;
  const newHeaders = new Headers(originalHeaders);
  
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
    const { message, sessionId = crypto.randomUUID() } = await request.json();
    
    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Get chat history
    let chatHistory = [];
    try {
      const historyResult = await env.SALON_DB.prepare(
        "SELECT messages FROM chat_sessions WHERE id = ?"
      ).bind(sessionId).first();
      
      if (historyResult?.messages) {
        chatHistory = JSON.parse(historyResult.messages);
      }
    } catch (error) {
      console.error("Error retrieving chat history:", error);
      // Continue with empty history if retrieval fails
    }
    
    // Add user message to history
    chatHistory.push({ role: "user", content: message });
    
    // Generate embeddings for user query and search vector database
    const relevantServices = await searchRelevantServices(message, env);
    
    // Construct prompt with context and generate response
    const aiResponse = await generateAIResponse(message, relevantServices, chatHistory, env);
    
    // Add AI response to history
    chatHistory.push({ role: "assistant", content: aiResponse });
    
    // Update or create chat session in database
    const timestamp = Math.floor(Date.now() / 1000);
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
    
    return new Response(JSON.stringify({
      sessionId,
      message: aiResponse
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Error handling chat message:", error);
    return new Response(JSON.stringify({ error: "Failed to process message" }), {
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
    const result = await env.SALON_DB.prepare(
      "SELECT messages FROM chat_sessions WHERE id = ?"
    ).bind(sessionId).first();
    
    if (!result?.messages) {
      return new Response(JSON.stringify({ error: "Chat session not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    return new Response(JSON.stringify({
      sessionId,
      messages: JSON.parse(result.messages)
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
    
    // Search for similar vectors in Vectorize
    const results = await env.SALON_VECTORIZE.query(embedding, {
      topK: MAX_RELEVANT_DOCS
    });
    
    if (!results?.matches?.length) {
      return [];
    }
    
    // Retrieve service details from D1 database
    const serviceIds = results.matches.map(match => match.id);
    const placeholders = serviceIds.map(() => '?').join(',');
    const query = `SELECT * FROM salon_services WHERE id IN (${placeholders})`;
    
    const services = await env.SALON_DB.prepare(query)
      .bind(...serviceIds)
      .all();
    
    return services?.results || [];
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
    // Check if using Workers AI or OpenAI
    if (env.OPENAI_API_KEY) {
      // OpenAI embeddings implementation
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "text-embedding-ada-002",
          input: text
        })
      });
      
      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }
      
      const data = await response.json();
      return data.data[0].embedding;
    } else {
      // Use Workers AI for embeddings
      const response = await env.AI.run(EMBEDDING_MODEL, { text });
      return response.data[0];
    }
  } catch (error) {
    console.error("Error generating embedding:", error);
    return null;
  }
}

/**
 * Generate AI response based on user message, context, and history
 */
async function generateAIResponse(message, services, history, env) {
  try {
    // Format services context as a string
    let contextText = "";
    if (services.length > 0) {
      contextText = "Here is information about relevant salon services:\n\n";
      services.forEach(service => {
        contextText += `Service: ${service.name}\n`;
        contextText += `Category: ${service.category}\n`;
        contextText += `Price: ${service.price}\n`;
        contextText += `Description: ${service.description}\n\n`;
      });
    }
    
    // System prompt with instructions
    const systemPrompt = `You are a helpful assistant for Apotheca Salon. Answer questions about salon services, 
    pricing, and general hair care advice based on the provided information. If you don't know the answer, 
    suggest that the user contact the salon directly. Be friendly, professional, and concise.
    
    ${contextText}`;
    
    // Format messages for the AI model
    const messages = [
      { role: "system", content: systemPrompt },
      ...history
    ];
    
    // Check if using Workers AI or OpenAI
    if (env.OPENAI_API_KEY) {
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
          temperature: 0.7,
          max_tokens: 500
        })
      });
      
      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }
      
      const data = await response.json();
      return data.choices[0].message.content;
    } else {
      // Use Workers AI for inference
      const response = await env.AI.run(DEFAULT_MODEL, { messages });
      return response.response;
    }
  } catch (error) {
    console.error("Error generating AI response:", error);
    return "I'm sorry, I'm having trouble processing your request right now. Please try again later or contact the salon directly for assistance.";
  }
}
