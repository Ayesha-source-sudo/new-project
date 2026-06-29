const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 3000;
const indexPath = path.join(__dirname, 'index.html');

function readIndexHtml() {
  return fs.readFileSync(indexPath, 'utf8');
}

function heuristicCombine(first, second) {
  const a = String(first || '').trim().toLowerCase();
  const b = String(second || '').trim().toLowerCase();

  const combos = [
    ['water', 'fire', { element: 'Steam', emoji: '💨' }],
    ['fire', 'water', { element: 'Steam', emoji: '💨' }],
    ['water', 'earth', { element: 'Mud', emoji: '🪨' }],
    ['earth', 'water', { element: 'Mud', emoji: '🪨' }],
    ['water', 'air', { element: 'Rain', emoji: '🌧️' }],
    ['air', 'water', { element: 'Rain', emoji: '🌧️' }],
    ['fire', 'earth', { element: 'Lava', emoji: '🌋' }],
    ['earth', 'fire', { element: 'Lava', emoji: '🌋' }],
    ['fire', 'air', { element: 'Spark', emoji: '⚡' }],
    ['air', 'fire', { element: 'Spark', emoji: '⚡' }],
    ['earth', 'air', { element: 'Dust', emoji: '🌫️' }],
    ['air', 'earth', { element: 'Dust', emoji: '🌫️' }],
    ['water', 'water', { element: 'Ice', emoji: '🧊' }],
    ['earth', 'earth', { element: 'Stone', emoji: '🪨' }],
    ['air', 'air', { element: 'Wind', emoji: '🌪️' }],
    ['fire', 'fire', { element: 'Flame', emoji: '🔥' }]
  ];

  const match = combos.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
  return match ? match[2] : { element: 'Nothing', emoji: '❌' };
}

async function callAlchemyApi(first, second) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return heuristicCombine(first, second);
  }

  const systemPrompt = [
    'You are an alchemy engine.',
    'Given two items, return ONLY a JSON object with two fields: element and emoji.',
    'If the combination makes no sense, return {"element":"Nothing","emoji":"❌"}.',
    'Do not explain anything. Use concise names.'
  ].join(' ');

  const userPrompt = `Combine these two alchemical items: ${first} and ${second}`;

  if (process.env.GEMINI_API_KEY) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: { temperature: 0.1 }
      })
    });

    const data = await response.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    try {
      const parsed = JSON.parse(raw);
      if (parsed.element) {
        return { element: parsed.element, emoji: parsed.emoji || '🧪' };
      }
    } catch {
      // fall through to heuristic
    }
  }

  if (process.env.OPENAI_API_KEY) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content || '{}';
    try {
      const parsed = JSON.parse(raw);
      if (parsed.element) {
        return { element: parsed.element, emoji: parsed.emoji || '🧪' };
      }
    } catch {
      // fall through to heuristic
    }
  }

  return heuristicCombine(first, second);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(readIndexHtml());
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/combine') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', async () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const first = payload.first || payload.item1 || payload.a || '';
        const second = payload.second || payload.item2 || payload.b || '';
        const result = await callAlchemyApi(first, second);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(port, () => {
  console.log(`Alchemy server running at http://localhost:${port}`);
});
