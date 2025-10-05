// Simple proxy server for Infinite Craft to bypass CORS restrictions
// Deploy this to Vercel, Netlify, Railway, or any Node.js hosting service

const express = require('express');
const cors = require('cors');
const app = express();

// Enable CORS for all origins (you can restrict this later)
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Infinite Craft Proxy Server',
    endpoints: {
      craft: 'POST /api/craft',
      test: 'POST /api/test'
    }
  });
});

// Test endpoint
app.post('/api/test', async (req, res) => {
  const { apiKey } = req.body;
  
  if (!apiKey) {
    return res.status(400).json({ error: 'API key required' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: 'Respond with just the word "success"'
          }
        ],
        max_tokens: 10
      })
    });

    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json(error);
    }

    const data = await response.json();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Test error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Craft endpoint - combines two items using OpenAI
app.post('/api/craft', async (req, res) => {
  const { apiKey, item1, item2 } = req.body;
  
  if (!apiKey || !item1 || !item2) {
    return res.status(400).json({ error: 'apiKey, item1, and item2 are required' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are helping create combinations for a crafting game like Infinite Craft. When given two items, respond with a creative but logical result of combining them. Respond ONLY with a JSON object in this exact format: {"name": "ItemName", "emoji": "🎯"}. The name should be a single word or short phrase (2-3 words max), and the emoji should be relevant and fun. Be creative but consistent - the same inputs should logically produce similar outputs.'
          },
          {
            role: 'user',
            content: `Combine: ${item1} + ${item2}`
          }
        ],
        temperature: 0.3,
        max_tokens: 50
      })
    });

    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json(error);
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    
    // Try to extract JSON from the response
    let jsonStr = content;
    if (content.includes('```')) {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        jsonStr = match[1].trim();
      }
    }
    
    const result = JSON.parse(jsonStr);
    
    if (!result.name || !result.emoji) {
      throw new Error('Invalid response format');
    }
    
    res.json(result);
  } catch (error) {
    console.error('Craft error:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});

module.exports = app;
