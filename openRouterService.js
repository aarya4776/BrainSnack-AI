// server/openRouterService.js — OpenRouter Integration with Strict Model Flow

const REQUEST_TIMEOUT_MS = 12000;

const MODELS = [
    "openai/gpt-oss-120b:free",
    "minimax/minimax-m2.5:free",
    "z-ai/glm-4.5-air:free"
];

function parseApiKeys(rawInput) {
    const keys = {};
    if (!rawInput) return keys;
    
    rawInput.split(";").forEach(pair => {
        const [k, v] = pair.split("=");
        if (k && v) keys[k.trim()] = v.trim();
    });
    return keys;
}

function toOpenRouterRole(role) {
    return (role === 'model' || role === 'bot' || role === 'assistant') ? 'assistant' : 'user';
}

function getMessageText(message) {
    if (!message) return '';
    if (typeof message.content === 'string') return message.content;
    if (message.parts && message.parts[0] && typeof message.parts[0].text === 'string') {
        return message.parts[0].text;
    }
    return '';
}

function buildMessages(history, content, systemInstruction) {
    const messages = [];

    if (systemInstruction) {
        messages.push({ role: 'system', content: systemInstruction });
    }

    if (Array.isArray(history) && history.length > 0) {
        history.forEach(m => {
            const text = getMessageText(m);
            if (!text) return;
            messages.push({ role: toOpenRouterRole(m.role), content: text });
        });
    }

    messages.push({ role: 'user', content: content || '' });

    return messages;
}

async function streamSingleModel(model, apiKey, messages, onChunk) {
    const controller = new AbortController();
    const requestTimeoutId = setTimeout(() => controller.abort(new Error('request-timeout')), REQUEST_TIMEOUT_MS);
    let reader = null;
    let streamTimeoutId = null;

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:3000"
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                stream: true,
                temperature: 0.6,
                max_tokens: 200
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`http-${response.status}`);
        }

        if (!response.body) {
            throw new Error('empty-response-body');
        }

        clearTimeout(requestTimeoutId);
        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        streamTimeoutId = setTimeout(() => controller.abort(new Error('stream-timeout')), REQUEST_TIMEOUT_MS);

        while (true) {
            const { done, value } = await reader.read();
            clearTimeout(streamTimeoutId);

            if (done) {
                return;
            }

            streamTimeoutId = setTimeout(() => controller.abort(new Error('stream-timeout')), REQUEST_TIMEOUT_MS);
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line || !line.startsWith('data: ')) continue;
                const raw = line.slice(6).trim();
                if (raw === '[DONE]') {
                    return;
                }

                let parsed;
                try {
                    parsed = JSON.parse(raw);
                } catch (parseErr) {
                    if (String(parseErr.message || '').includes('Unexpected end of JSON input')) {
                        continue;
                    }
                    throw new Error('stream-json-parse-failure');
                }

                if (parsed.error) {
                    throw new Error('stream-api-error');
                }

                const chunkText = parsed?.choices?.[0]?.delta?.content;
                if (chunkText) {
                    let cleanedChunk = chunkText.replace(/\n*Confidence:\s*(High|Medium|Low)?/gi, '');
                    cleanedChunk = cleanedChunk.replace(/Confidence:\s*(High|Medium|Low)?/gi, '');
                    if (cleanedChunk) {
                        onChunk(cleanedChunk);
                    }
                }
            }
        }
    } finally {
        clearTimeout(requestTimeoutId);
        clearTimeout(streamTimeoutId);
        if (reader) {
            try { await reader.cancel(); } catch (_) {}
        }
    }
}

async function streamOpenRouter(rawInput, history, content, systemInstruction, onChunk, onDone, onError, onMeta) {
    const keys = parseApiKeys(rawInput);
    
    if (!keys.openrouter || !keys.openrouter.startsWith("sk-")) {
        throw new Error("Invalid OpenRouter API key");
    }

    const messages = buildMessages(history, content, systemInstruction);

    for (const model of MODELS) {
        if (!MODELS.includes(model)) {
            throw new Error("Unauthorized model usage blocked");
        }

        try {
            console.log("USING MODEL:", model);
            await streamSingleModel(model, keys.openrouter, messages, onChunk);
            onDone();
            return;
        } catch (err) {
            console.log("FAILED:", model);
        }
    }
    
    // If we reach here, all models failed
    onError(new Error("All models failed"));
}

module.exports = { streamOpenRouter };
