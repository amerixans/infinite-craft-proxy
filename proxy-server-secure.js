// Secure Infinite Craft Proxy Server
// Uses server-side API key with rate limiting to prevent abuse

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const app = express();

// Enable CORS for all origins (you can restrict this to your domain later)
app.use(cors());
app.use(express.json({ limit: '10kb' })); // Limit request size

// In-memory discovery tracking
const discoveryTracker = new Map();

// Load crafting instructions from file
let craftingInstructions = '';
try {
  craftingInstructions = fs.readFileSync(
    path.join(__dirname, 'crafting-instructions.txt'),
    'utf8'
  );
  console.log('✅ Crafting instructions loaded successfully');
} catch (error) {
  console.error('❌ Failed to load crafting instructions:', error.message);
  console.error('Make sure crafting-instructions.txt is in the same directory as this file');
  process.exit(1);
}

// SECURITY: Rate limiting to prevent abuse
// Limits each IP to 100 requests per 15 minutes
const craftLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limit for the craft endpoint (most expensive)
const strictCraftLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 crafts per minute
  message: { error: 'Crafting too fast! Please wait a moment.' },
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Infinite Craft Proxy Server (Secured)',
    instructionsLoaded: craftingInstructions.length > 0,
    endpoints: {
      craft: 'POST /api/craft',
      trackDiscovery: 'POST /api/track-discovery',
      discoveryCount: 'GET /api/discovery-count/:item'
    }
  });
});

// Track discovery endpoint
app.post('/api/track-discovery', craftLimiter, async (req, res) => {
  const { item } = req.body;
  
  if (!item) {
    return res.status(400).json({ error: 'item is required' });
  }

  // Validate input
  if (typeof item !== 'string' || item.length > 100) {
    return res.status(400).json({ error: 'Invalid item name' });
  }

  try {
    const itemKey = item.toLowerCase();
    const currentCount = discoveryTracker.get(itemKey) || 0;
    discoveryTracker.set(itemKey, currentCount + 1);
    
    res.json({ 
      success: true, 
      count: currentCount + 1 
    });
  } catch (error) {
    console.error('Track discovery error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get discovery count endpoint
app.get('/api/discovery-count/:item', craftLimiter, async (req, res) => {
  const { item } = req.params;
  
  try {
    const itemKey = decodeURIComponent(item).toLowerCase();
    
    // Validate input
    if (itemKey.length > 100) {
      return res.status(400).json({ error: 'Invalid item name' });
    }
    
    const count = discoveryTracker.get(itemKey) || 0;
    
    res.json({ count });
  } catch (error) {
    console.error('Get discovery count error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Craft endpoint - combines two items using OpenAI
// SECURITY: Uses server-side API key from environment variable
app.post('/api/craft', strictCraftLimiter, async (req, res) => {
  const { item1, item2 } = req.body;
  
  // Validate inputs
  if (!item1 || !item2) {
    return res.status(400).json({ error: 'item1 and item2 are required' });
  }

  if (typeof item1 !== 'string' || typeof item2 !== 'string') {
    return res.status(400).json({ error: 'Items must be strings' });
  }

  if (item1.length > 100 || item2.length > 100) {
    return res.status(400).json({ error: 'Item names too long' });
  }

  // SECURITY: Get API key from environment variable
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.error('OPENAI_API_KEY not set in environment variables');
    return res.status(500).json({ error: 'Server configuration error' });
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
            content: craftingInstructions
          },
          {
            role: 'user',
            content: `Combine: ${item1} + ${item2}`
          }
        ],
        temperature: 0.2,
        max_tokens: 50
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('OpenAI API error:', error);
      return res.status(response.status).json({ error: 'AI service error' });
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
    
    // Ensure only one emoji
    const emojiMatch = result.emoji.match(/(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/gu);
    if (emojiMatch && emojiMatch.length > 0) {
      result.emoji = emojiMatch[0]; // Take only the first emoji
    }
    
    res.json(result);
  } catch (error) {
    console.error('Craft error:', error);
    res.status(500).json({ error: 'Failed to create combination' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Secure proxy server running on port ${PORT}`);
  console.log(`Rate limiting enabled: 100 requests per 15 minutes per IP`);
  console.log(`Craft endpoint: 10 requests per minute per IP`);
});

module.exports = app;
