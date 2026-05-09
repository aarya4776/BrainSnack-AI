// server/index.js — BrainSnack Express Backend (Stability v3.1)

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const { getSystemInstruction } = require('./promptBuilder');
const { streamOpenRouter } = require('./openRouterService');
const { isGreetingOrCasual, getSearchContext } = require('./serperService');

const CLEAN_BUSY_ERROR = "I couldn't fully process the request, but let's try another one.";
const CLEAN_AUTH_ERROR = 'Invalid API key. Please check your settings.';

const app = express();

// ─── Middleware ─────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '20mb' }));
app.use(express.static(__dirname));

// ─── Global Error Prevention ─────────────────────────────
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Process Error] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[Process Error] Uncaught Exception:', err);
});

// ─── Utils ───────────────────────────────────────────────
function mapHistory(messages) {
    if (!messages || !Array.isArray(messages)) return [];
    return messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
    }));
}

function parseApiKeys(rawInput) {
    const keys = {};
    if (!rawInput) return keys;
    if (!rawInput.includes('=')) {
        keys.openrouter = rawInput;
        return keys;
    }
    rawInput.split(';').forEach(p => {
        const [k, v] = p.split('=');
        if (k && v) keys[k.trim()] = v.trim();
    });
    return keys;
}

function setSSEHeaders(res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for Nginx if present
    res.flushHeaders();
}

// ─── API Routes ─────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '3.1.0' }));

app.post('/api/chat', async (req, res) => {
    const { apiKey, mode, detail, history, content } = req.body;

    if (!apiKey) return res.status(400).json({ error: 'API key is required.' });
    if (!content && !history) return res.status(400).json({ error: 'Content is missing.' });

    // Parse API keys to extract Serper key if available
    const keys = parseApiKeys(apiKey);
    const serperKey = keys.serper || null;

    // Get system instruction
    let systemInstruction = getSystemInstruction(mode, detail || 'short');

    // Determine what to search for
    let searchQuery = content;
    
    // If current message is very short/casual, look for the last user question in history
    if (isGreetingOrCasual(content) && history && history.length > 0) {
        // Find the last user message that is NOT casual
        for (let i = history.length - 1; i >= 0; i--) {
            const msg = history[i];
            if (msg.role === 'user' && !isGreetingOrCasual(msg.content)) {
                searchQuery = msg.content;
                break;
            }
        }
    }

    // Get search context if we have a real query
    let searchContext = '';
    if (!isGreetingOrCasual(searchQuery) && serperKey) {
        searchContext = await getSearchContext(searchQuery, serperKey);
    }

    // Combine system instruction with search context
    if (searchContext) {
        systemInstruction += '\n\n---\n\n' + searchContext + '\n\nUse the above web search results to provide accurate, up-to-date information. Do not include citation numbers or brackets in your response.';
    }

    console.log(`\n[Server] Request received at /api/chat.`);
    console.log(`[Server] Mode: ${mode}, Detail: ${detail}`);
    console.log(`[Server] History length: ${history ? history.length : 0}, Content length: ${content ? content.length : 0}`);
    console.log(`[Server] Greeting/Casual: ${isGreetingOrCasual(content)}, Search Context: ${searchContext ? 'Yes' : 'No'}`);
    setSSEHeaders(res);

    try {
        const formattedKey = apiKey.includes('=') ? apiKey : `openrouter=${apiKey}`;
        await streamOpenRouter(formattedKey, history, content, systemInstruction,
            (chunk) => { 
                res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`); 
            },
            () => { 
                console.log('[Server] Stream finished successfully');
                res.write('data: [DONE]\n\n'); 
                res.end(); 
            },
            (err) => {
                const safeError = String(err || '').includes('Invalid API key') ? CLEAN_AUTH_ERROR : CLEAN_BUSY_ERROR;
                res.write(`data: ${JSON.stringify({ error: safeError })}\n\n`); 
                res.end();
            },
            (meta) => {
                res.write('data: ' + JSON.stringify({ meta }) + '\n\n');
            }
        );
    } catch (err) {
        console.error('[Server] Fatal Catch:', err);
        const safeError = String(err?.message || '').includes('Invalid OpenRouter API key') ? CLEAN_AUTH_ERROR : CLEAN_BUSY_ERROR;
        res.write(`data: ${JSON.stringify({ error: safeError })}\n\n`);
        res.end();
    }
});



// ─── SPA Fallback ───────────────────────────────────────
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
        return res.sendFile(path.join(__dirname, 'index.html'));
    }
    next();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 BrainSnack v3.1 running at http://localhost:${PORT}\n`);
});


