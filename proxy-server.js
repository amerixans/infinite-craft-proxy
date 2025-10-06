// Simple proxy server for Infinite Craft to bypass CORS restrictions
// Deploy this to Vercel, Netlify, Railway, or any Node.js hosting service

const express = require('express');
const cors = require('cors');
const app = express();

// Enable CORS for all origins (you can restrict this later)
app.use(cors());
app.use(express.json());

// In-memory discovery tracking (resets on server restart)
// In production, you'd use a database like Redis or PostgreSQL
const discoveryTracker = new Map();

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Infinite Craft Proxy Server',
    endpoints: {
      craft: 'POST /api/craft',
      test: 'POST /api/test',
      trackDiscovery: 'POST /api/track-discovery',
      discoveryCount: 'GET /api/discovery-count/:item'
    }
  });
});

// Track discovery endpoint
app.post('/api/track-discovery', async (req, res) => {
  const { item } = req.body;
  
  if (!item) {
    return res.status(400).json({ error: 'item is required' });
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
app.get('/api/discovery-count/:item', async (req, res) => {
  const { item } = req.params;
  
  try {
    const itemKey = decodeURIComponent(item).toLowerCase();
    const count = discoveryTracker.get(itemKey) || 0;
    
    res.json({ count });
  } catch (error) {
    console.error('Get discovery count error:', error);
    res.status(500).json({ error: error.message });
  }
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
            content: `You are the crafting logic for a game like Infinite Craft. When given two items, create ONE logical result.

CRITICAL RULES:
1. Return ONLY valid JSON: {"name": "Result", "emoji": "🎯"}
2. Use EXACTLY ONE emoji (never multiple emojis)
3. Name should be 1-2 words maximum
4. Be LOGICAL and INTUITIVE - players should think "yes, that makes sense!"
5. Follow real-world physics, chemistry, and common sense
6. Progress from simple → complex (basic elements create simple things, complex things create more complex things)
7. Same inputs ALWAYS produce same output

EXAMPLES OF GOOD COMBINATIONS:
- Water + Fire → Steam (not "Hot Water")
- Water + Earth → Mud (simple, intuitive)
- Fire + Earth → Lava (follows logic)
- Water + Water → Lake (combining same items scales up)
- Steam + Steam → Cloud (logical progression)
- Lake + Fire → Steam (water evaporates)
- Mud + Fire → Brick (makes sense!)
- Plant + Water → Garden (grows)
- Metal + Fire → Sword (smithing)

PROGRESSION PRINCIPLE:
- Basic elements (Water, Fire, Earth, Wind) → Simple materials (Steam, Mud, Smoke)
- Simple materials → Intermediate things (Cloud, Stone, Plant)
- Intermediate → Complex (Garden, Brick, Sword)
- Complex → Advanced concepts (City, Civilization, etc.)

SAME ITEM COMBINATIONS:
When combining same items, think about what happens when you have MORE of it:
- Water + Water → Lake (more water)
- Fire + Fire → Inferno (bigger fire)
- Earth + Earth → Mountain (more earth)
- Stone + Stone → Boulder (bigger stone)
- Tree + Tree → Forest (multiple trees)

THINK STEP BY STEP:
1. What are these items physically/conceptually?
2. What happens when they interact in real life?
3. What's the simplest, most obvious result?
4. Does this feel RIGHT to the player?

Remember: ONE emoji only. Be intuitive. Make it fun!`
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
    
    // Ensure only one emoji
    const emojiMatch = result.emoji.match(/(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/gu);
    if (emojiMatch && emojiMatch.length > 0) {
      result.emoji = emojiMatch[0]; // Take only the first emoji
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
