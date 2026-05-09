// NOTE: Do not hardcode real API keys in repo files.
// Paste your key here temporarily for local testing, or pass it via localStorage/settings in the UI.
const apiKey = 'openrouter=YOUR_KEY_HERE;serper=YOUR_SERPER_KEY_HERE;';
fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        apiKey,
        mode: 'chat',
        detail: 'short',
        content: 'hi'
    })
}).then(res => {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    return reader.read().then(function processText({ done, value }) {
        if (done) return;
        console.log(decoder.decode(value));
        return reader.read().then(processText);
    });
}).catch(err => console.error(err));
