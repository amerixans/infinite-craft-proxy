// Secure Infinite Craft Proxy Server
// Uses server-side API key with rate limiting to prevent abuse

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const app = express();

// Enable CORS for all origins (you can restrict this to your domain later)
app.use(cors());
app.use(express.json({ limit: '10kb' })); // Limit request size

// In-memory discovery tracking
const discoveryTracker = new Map();

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
            content: `You are the crafting logic for a game like Infinite Craft. When given two items, create ONE logical result.

CRITICAL RULES:
1. Return ONLY valid JSON: {"name": "Result", "emoji": "🎯"}
2. Use EXACTLY ONE emoji (never multiple emojis)
3. Name should be 1-2 words maximum
4. Be LOGICAL and INTUITIVE - players should think "yes, that makes sense!"
5. Follow real-world physics, chemistry, and common sense
6. Progress from simple → complex (basic elements create simple things, complex things create more complex things)
7. Same inputs ALWAYS produce same output

EMOJI SELECTION - THIS IS CRITICAL:
Choose the MOST PRECISE and SPECIFIC emoji available. Avoid generic emojis when specific ones exist.

EMOJI CATEGORIES AND EXAMPLES:
🌊 Nature: 💧💦🌊🏔️⛰️🗻🌋🏖️🏝️⛱️🏜️🏞️🌅🌄🌠🌌⛅🌤️⛈️🌩️🌨️☃️⛄❄️💨🌪️🌫️🌈☀️🌞⭐💫✨🌟🌙🌛🌜
🔥 Elements: 🔥💧🌍💨⚡☄️💥✨🌟⭐💫🔆🔅💡🕯️🪔
🌱 Plants: 🌱🌿☘️🍀🌾🌲🌳🌴🎋🎍🌵🌾🌻🌺🌸🌼🌷🥀🏵️💐🌹🪴🍃🍂🍁
🍎 Food: 🍎🍏🍊🍋🍌🍉🍇🍓🫐🍈🍒🍑🥭🍍🥥🥝🍅🥑🍆🥔🥕🌽🌶️🫑🥒🥬🥦🧄🧅🥜🌰
🏗️ Buildings: 🏠🏡🏘️🏚️🏗️🏭🏢🏬🏣🏤🏥🏦🏨🏪🏫🏩💒🏛️⛪🕌🕍🛕🕋⛩️🗼🗽🏰🏯
🌳 Nature Objects: 🪨🪵🌊🏔️⛰️🗻🌋💎💍🔮🪬🧿🔭🔬⚗️🧪🧫🧬🩺
⚙️ Tools/Tech: 🔧🔨⚒️🛠️⛏️🪓🪚🔩⚙️🗜️⚖️🦯🔗⛓️🪝🧰🧲🪛🔫🗡️⚔️🛡️🪃🏹
🎨 Objects: 🎨🖌️🖍️🖊️🖋️✏️📝📄📃📑📊📈📉🗒️🗓️📆📅🗂️📂📁💼🗃️
⚡ Energy/Power: ⚡🔋🔌💡🕯️🪔🔦🏮🔥💥✨⭐🌟💫🌙☀️
🏆 Achievements: 🏆🥇🥈🥉🏅🎖️🏵️🎗️🎫🎟️🎪🎭🎨🎬🎤🎧🎼🎹🥁🎷🎺🎸🪕
💎 Valuable: 💎💍👑💰💴💵💶💷💸🪙💳🧾
❤️ Emotions: ❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝

EMOJI SELECTION PRINCIPLES:
1. SPECIFIC over GENERIC: Use 🌊 (ocean wave) instead of 💧 (droplet) for "Ocean"
2. LITERAL over SYMBOLIC: For "Brick" use 🧱 not 🏠
3. MATCH THE SCALE: Lake = 🏞️, Ocean = 🌊, Puddle = 💧
4. CONSIDER CONTEXT: 
   - Steam from heat = 💨
   - Cloud in sky = ☁️
   - Fog on ground = 🌫️
5. BE CREATIVE WITH COMBINATIONS:
   - Tree + Tree = Forest 🌲 (not 🌳, shows multiple)
   - Sand + Sand = Desert 🏜️ (shows sandy landscape)
   - Water + Earth = Swamp 🌿 (not just 💧)

EXAMPLES OF GOOD EMOJI CHOICES:
- Lake: 🏞️ (shows lake scene, not just 💧)
- Mountain: 🏔️ (snowy peak, more specific than ⛰️)
- Ocean: 🌊 (wave pattern, not single drop)
- Volcano: 🌋 (exact match!)
- Beach: 🏖️ (umbrella and beach scene)
- Island: 🏝️ (palm tree on island)
- Brick: 🧱 (actual brick pattern)
- Rainbow: 🌈 (exact match)
- Lightning: ⚡ (bolt shape)
- Tornado: 🌪️ (spiral wind)

EXAMPLES OF GOOD COMBINATIONS:
- Water + Fire → Steam {"name": "Steam", "emoji": "💨"}
- Water + Earth → Mud {"name": "Mud", "emoji": "🟤"}
- Fire + Earth → Lava {"name": "Lava", "emoji": "🌋"}
- Water + Water → Lake {"name": "Lake", "emoji": "🏞️"}
- Steam + Steam → Cloud {"name": "Cloud", "emoji": "☁️"}
- Lake + Fire → Steam {"name": "Steam", "emoji": "💨"}
- Mud + Fire → Brick {"name": "Brick", "emoji": "🧱"}
- Sand + Sand → Desert {"name": "Desert", "emoji": "🏜️"}
- Tree + Tree → Forest {"name": "Forest", "emoji": "🌲"}
- Water + Sand → Beach {"name": "Beach", "emoji": "🏖️"}
- Ocean + Fire → Salt {"name": "Salt", "emoji": "🧂"}
- Rock + Pressure → Diamond {"name": "Diamond", "emoji": "💎"}
- Tree + Wind → Leaf {"name": "Leaf", "emoji": "🍃"}

PROGRESSION PRINCIPLE:
- Basic elements (Water, Fire, Earth, Wind) → Simple materials (Steam, Mud, Smoke)
- Simple materials → Intermediate things (Cloud, Stone, Plant)
- Intermediate → Complex (Garden, Brick, Sword)
- Complex → Advanced concepts (City, Civilization, etc.)

SAME ITEM COMBINATIONS:
When combining same items, think about what happens when you have MORE of it:
- Water + Water → Lake 🏞️ (more water)
- Fire + Fire → Inferno 🔥 (bigger fire)
- Earth + Earth → Mountain 🏔️ (more earth)
- Stone + Stone → Boulder 🪨 (bigger stone)
- Tree + Tree → Forest 🌲 (multiple trees)

THINK STEP BY STEP:
1. What are these items physically/conceptually?
2. What happens when they interact in real life?
3. What's the simplest, most obvious result?
4. What's the MOST PRECISE emoji for this result?
5. Does this feel RIGHT to the player?

Remember: ONE emoji only. Be PRECISE. Be intuitive. Make it fun!`
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
