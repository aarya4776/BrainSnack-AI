const body = {
  apiKey: 'openrouter=sk-TEST;serper=TEST',
  model: 'openai/gpt-oss-120b:free',
  mode: 'chat',
  detail: 'short',
  history: [],
  content: 'what can u do?'
};
(async () => {
  try {
    const res = await fetch('http://localhost:3000/api/chat?cb=' + Date.now(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    console.log('status', res.status);
    const text = await res.text();
    console.log(text);
  } catch (err) {
    console.error(err);
  }
})();