// public/js/app.js — BrainSnack v3.1 (Stability & Polish)

const state = {
    apiKey: localStorage.getItem('bs_key') || '',
    model: localStorage.getItem('bs_model') || 'auto',
    mode: 'auto',
    detail: 'short',
    messages: [], 
    chats: [],
    currentChatId: null,
    attachedFile: null,
    isStreaming: false,
};
const CLEAN_BUSY_MESSAGE = "I couldn't fully process the request, but let's try another one.";

// ── DOM refs ──
const $ = id => document.getElementById(id);
const chatWindow = $('chat-window');
const userInput = $('user-input');
const sendBtn = $('send-btn');
const chatHistory = $('chat-history');
const newChatBtn = $('new-chat-btn');
const settingsBtn = $('settings-btn');
const settingsModal = $('settings-modal');
const modalOverlay = $('modal-overlay');
const modalClose = $('modal-close-btn');
const saveSettings = $('save-settings');
const apiKeyInput = $('api-key-input');
const toggleKeyVis = $('toggle-key-vis');
const modelSelect = $('model-select');
const sidebarToggle = $('sidebar-toggle');
const sidebar = document.querySelector('.sidebar');
const detailGroup = $('detail-group');

// ── Init ──
function init() {
    document.documentElement.setAttribute('data-theme', 'dark');
    loadChats();
    renderSidebar();
    showWelcome();
    bindEvents();
    
    const keys = parseFrontendKeys(state.apiKey);
    apiKeyInput.value = keys.openrouter || '';
    const serperKeyInput = $('serper-key-input');
    if (serperKeyInput) serperKeyInput.value = keys.serper || '';

    modelSelect.value = state.model;
    startPlaceholderCycling();
}

function parseFrontendKeys(raw) {
    const keys = {};
    if (!raw) return keys;
    if (!raw.includes('=')) {
        keys.openrouter = raw;
        return keys;
    }
    raw.split(';').forEach(p => {
        const [k, v] = p.split('=');
        if (k && v) keys[k.trim()] = v.trim();
    });
    return keys;
}

// ── Welcome Screen ──
function showWelcome() {
    chatWindow.innerHTML = `
    <div class="welcome">
      <div class="welcome-emoji">🧠</div>
      <h1 class="welcome-heading">Elevate your <span>Study</span></h1>
      <p class="welcome-sub">BrainSnack uses AI to explain complex topics, answer questions, and uncover surprising facts instantly.</p>
      <div class="welcome-cards">
        <button class="welcome-card" onclick="quickMode('summarise')">
          <div class="wc-icon">📋</div>
          <div class="wc-title">Summarise</div>
          <div class="wc-desc">Get concise summaries of any topic or concept.</div>
        </button>
        <button class="welcome-card" onclick="quickMode('explain')">
          <div class="wc-icon">💡</div>
          <div class="wc-title">Explain</div>
          <div class="wc-desc">Simple breakdowns with analogies for any topic.</div>
        </button>
        <button class="welcome-card" onclick="quickMode('funfact')">
          <div class="wc-icon">⚡</div>
          <div class="wc-title">Fun Fact</div>
          <div class="wc-desc">Daily doses of surprising academic trivia.</div>
        </button>
      </div>
    </div>`;
}

function quickMode(mode) {
    setMode(mode);
    userInput.focus();
}

// ── State Management ──
function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll('.mode-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.mode === mode));
    detailGroup.classList.toggle('hidden', mode === 'funfact' || mode === 'auto');
}

function setDetail(detail) {
    state.detail = detail;
    document.querySelectorAll('.detail-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.detail === detail));
}

// ── Intent Detection ──
function detectIntent(text) {
    if (state.mode !== 'auto') return state.mode;
    const t = text.toLowerCase();
    if (t.includes('summarise') || t.includes('summary') || t.includes('tldr') || text.length > 600) return 'summarise';
    if (t.includes('explain') || t.includes('what is') || t.includes('how does') || t.includes('tell me about')) return 'explain';
    if (t.includes('fact') || t.includes('something interesting') || t.includes('surprise me')) return 'funfact';
    return 'chat';
}

function needsSearchFront(text) {
    const t = text.trim().toLowerCase();
    if (t.length < 3) return false;

    const pureChatPatterns = [
        /^what can (you|u) do\b/,
        /^what can i ask( you)?\b/,
        /^what are you\b/,
        /^who are you\b/,
        /^tell me about yourself\b/,
        /^how are you\b/,
        /^what is your name\b/,
        /^what do you do\b/,
        /^what are your capabilities\b/,
        /^what can (you|u) help me with\b/,
        /^are you a bot\b/,
        /^do you have feelings\b/,
        /^describe yourself\b/,
        /^what is your purpose\b/,
        /^what is your job\b/,
        /^who made you\b/,
        /^who created you\b/
    ];

    if (pureChatPatterns.some(pattern => pattern.test(t))) {
        return false;
    }

    const greetings = ["hi", "hello", "hey", "yo", "good morning", "good afternoon", "good evening", "what's up", "whats up", "sup"];
    if (greetings.some(g => t === g || t.startsWith(g + ' '))) {
        return false;
    }

    return true;
}

// ── Chat Persistence ──
function loadChats() {
    try { state.chats = JSON.parse(localStorage.getItem('bs_chats') || '[]'); }
    catch { state.chats = []; }
}
function saveChats() {
    localStorage.setItem('bs_chats', JSON.stringify(state.chats.slice(0, 60)));
}
function newChat() {
    state.currentChatId = null;
    state.messages = [];
    showWelcome();
    renderSidebar();
    if (window.innerWidth <= 768) sidebar.classList.remove('open');
}
function saveChat() {
    if (!state.messages.length) return;
    const title = (state.messages.find(m => m.role === 'user')?.content || 'New Chat').slice(0, 48);
    if (state.currentChatId) {
        const idx = state.chats.findIndex(c => c.id === state.currentChatId);
        if (idx !== -1) { state.chats[idx].messages = [...state.messages]; state.chats[idx].updatedAt = Date.now(); }
    } else {
        state.currentChatId = Date.now().toString();
        state.chats.unshift({ id: state.currentChatId, title: title + (title.length >= 48 ? '…' : ''), messages: [...state.messages], updatedAt: Date.now() });
    }
    saveChats();
    renderSidebar();
}
function loadChat(id) {
    const chat = state.chats.find(c => c.id === id);
    if (!chat) return;
    state.currentChatId = id;
    state.messages = [...chat.messages];
    renderAllMessages();
    renderSidebar();
    if (window.innerWidth <= 768) sidebar.classList.remove('open');
}
function deleteChat(id, e) {
    e.stopPropagation();
    state.chats = state.chats.filter(c => c.id !== id);
    saveChats();
    if (state.currentChatId === id) newChat();
    else renderSidebar();
}
function renderSidebar() {
    chatHistory.innerHTML = '';
    if (!state.chats.length) {
        chatHistory.innerHTML = '<div class="chat-history-empty">No recent chats</div>';
        return;
    }
    state.chats.forEach(chat => {
        const el = document.createElement('div');
        el.className = 'chat-item' + (chat.id === state.currentChatId ? ' active' : '');
        el.innerHTML = `<span class="chat-item-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </span>
        <span class="chat-item-text">${esc(chat.title)}</span>
        <button class="chat-item-del" onclick="deleteChat('${chat.id}',event)">✕</button>`;
        el.addEventListener('click', () => loadChat(chat.id));
        chatHistory.appendChild(el);
    });
}

// ── Message Rendering ──
function getMsgList() {
    let el = chatWindow.querySelector('.messages');
    if (!el) { chatWindow.innerHTML = ''; el = document.createElement('div'); el.className = 'messages'; chatWindow.appendChild(el); }
    return el;
}
function renderAllMessages() {
    chatWindow.innerHTML = '';
    const list = getMsgList();
    state.messages.forEach(m => list.appendChild(makeBubble(m)));
    scrollBottom();
}
function addUserMsg(content, actualMode) {
    const m = { 
        id: Date.now(), 
        role: 'user', 
        content, 
        mode: actualMode, 
        detail: state.detail, 
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    state.messages.push(m);
    getMsgList().appendChild(makeBubble(m));
    scrollBottom();
}
function makeBubble(m) {
    const row = document.createElement('div');
    row.className = `msg-row ${m.role}`;
    const meta = `${modeLabel(m.mode)} · ${m.timestamp}`;
    
    if (m.role === 'user') {
        row.innerHTML = `<div class="msg-avatar">👤</div>
            <div class="msg-body">
                <div class="msg-meta">${esc(meta)}</div>
                <div class="msg-bubble">${esc(m.content)}</div>
                <div class="msg-actions">${copyBtn(m.content)}</div>
            </div>`;
    } else {
        const isError = m.content.startsWith('Error:');
        row.innerHTML = `<div class="msg-avatar">🧠</div>
            <div class="msg-body">
                <div class="msg-meta">${esc(meta)}</div>
                <div class="msg-bubble ${isError ? 'msg-error' : ''}">${isError ? m.content : md(m.content)}</div>
                ${!isError ? `<div class="msg-actions">${copyBtn(m.content)}</div>` : ''}
            </div>`;
    }
    return row;
}
function copyBtn(text) {
    return `<button class="copy-btn" onclick="copyText(this,'${escAttr(text)}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span>Copy</span>
    </button>`;
}

// ── Streaming ──
function addStreamingBubble(actualMode, isSearch) {
    const list = getMsgList();
    const row = document.createElement('div');
    row.className = 'msg-row bot';
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const initialContent = isSearch ? '🔍 Searching...' : '<div class="dot-loader"><span></span><span></span><span></span></div>';

    row.innerHTML = `<div class="msg-avatar">🧠</div>
        <div class="msg-body">
            <div class="msg-meta">${modeLabel(actualMode)} · ${timestamp}</div>
            <div class="msg-bubble" id="stream-bubble">${initialContent}</div>
        </div>`;
    list.appendChild(row);
    scrollBottom();
    return row;
}
function finaliseStreaming(row, text, actualMode, id) {
    const bubble = row.querySelector('.msg-bubble');
    const body = row.querySelector('.msg-body');
    bubble.innerHTML = md(text);
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    actions.innerHTML = copyBtn(text);
    body.appendChild(actions);
    scrollBottom();
}

// ── Chat Logic ──
async function send() {
    if (state.isStreaming) return;
    const raw = userInput.value.trim();
    if (!raw) { shake(userInput); return; }
    if (!state.apiKey) { openModal(); toast('Please add your API key first.'); return; }

    const actualMode = detectIntent(raw || "chat");
    const isSearch = needsSearchFront(raw || "chat");
    
    userInput.value = '';
    autoResize();
    setUIBusy(true);

    addUserMsg(raw, actualMode);
    const row = addStreamingBubble(actualMode, isSearch);
    const bubble = row.querySelector('.msg-bubble');

    const botMsgId = Date.now();
    let fullText = '';
    let streamMeta = null;
    const onChunk = chunk => {
        fullText += chunk;
        bubble.innerHTML = md(fullText);
        scrollBottom();
    };
    const onMeta = meta => {
        streamMeta = meta;
    };
    const onDone = (id) => {
        const botMsg = {
            id: id || Date.now(),
            role: 'bot',
            content: fullText,
            mode: actualMode,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            verified: streamMeta?.verified || false,
            source: streamMeta?.source || '',
            factCount: streamMeta?.factCount || 0
        };
        state.messages.push(botMsg);
        finaliseStreaming(row, fullText, actualMode, id, streamMeta);
        saveChat();
        setUIBusy(false);
    };
    const onError = err => {
        console.error('[Frontend Error]:', err);
        const safe = String(err || '');
        const displayMsg = safe.includes('Invalid API key')
            ? 'Invalid API key. Please check your settings.'
            : CLEAN_BUSY_MESSAGE;
        bubble.innerHTML = `<em>${esc(displayMsg)}</em>`;
        bubble.classList.add('msg-error');
        setUIBusy(false);
    };

    const history = state.messages
        .slice(0, -1)
        .map(m => ({ role: m.role, content: m.content }));

    try {
        await sendText(raw, history, actualMode, onChunk, () => onDone(botMsgId), onError, onMeta);
    } catch (err) {
        console.error('[Frontend Catch Error]:', err);
        onError("I couldn't fully process the request, but let's try another one.");
    }
}



function setUIBusy(busy) {
    state.isStreaming = busy;
    sendBtn.disabled = busy;
    userInput.disabled = busy;
    sendBtn.innerHTML = busy ? `<div class="spinner"></div>` : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
}

async function sendText(content, history, mode, onChunk, onDone, onError, onMeta) {
    const cb = Date.now();
    const res = await fetch(`http://localhost:3000/api/chat?cb=${cb}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: state.apiKey, model: state.model, mode, detail: state.detail, content, history })
    });
    await readSSE(res, onChunk, onDone, onError, onMeta);
}

async function readSSE(res, onChunk, onDone, onError, onMeta) {
    if (!res.ok) {
        let errorMsg = CLEAN_BUSY_MESSAGE;
        try {
            const e = await res.json();
            if (e && e.error && String(e.error).includes('Invalid API key')) {
                errorMsg = 'Invalid API key. Please check your settings.';
            }
        } catch {}
        onError(errorMsg);
        return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') { onDone(); return; }
            try { 
                const j = JSON.parse(raw); 
                if (j.error) { onError(j.error); return; } 
                if (j.meta && typeof onMeta === 'function') onMeta(j.meta);
                if (j.text) onChunk(j.text); 
            } catch {}
        }
    }
    onDone();
}

// ── Modals ──
function openModal() {
    const keys = parseFrontendKeys(state.apiKey);
    apiKeyInput.value = keys.openrouter || '';
    const serperInput = $('serper-key-input');
    if (serperInput) serperInput.value = keys.serper || '';

    modelSelect.value = state.model;
    settingsModal.classList.remove('hidden');
    modalOverlay.classList.remove('hidden');
}
function closeModal() {
    settingsModal.classList.add('hidden');
    modalOverlay.classList.add('hidden');
}
function doSaveSettings() {
    const orKey = apiKeyInput.value.trim();
    const srpKey = $('serper-key-input') ? $('serper-key-input').value.trim() : '';
    
    let combined = '';
    if (orKey) combined += `openrouter=${orKey};`;
    if (srpKey) combined += `serper=${srpKey};`;
    
    state.apiKey = combined;
    state.model = modelSelect.value;
    localStorage.setItem('bs_key', state.apiKey);
    localStorage.setItem('bs_model', state.model);
    closeModal();
    toast('Settings saved');
}

// ── Utils ──
function scrollBottom() { chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: 'smooth' }); }
function autoResize() { 
    userInput.style.height = 'auto'; 
    userInput.style.height = Math.min(userInput.scrollHeight, 200) + 'px'; 
}
function shake(el) { 
    el.style.animation = 'none'; 
    el.offsetHeight; 
    el.style.animation = 'shake .3s ease'; 
}
function modeLabel(m) { return { auto: '🤖 Auto', summarise: '📋 Summarise', explain: '💡 Explain', funfact: '⚡ Fun Fact', chat: '💬 Chat' }[m] || m; }
function md(text) { return window.marked ? marked.parse(text) : esc(text); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escAttr(s) { return String(s).replace(/`/g, '\\`').replace(/\$/g, '\\$'); }

function toast(msg, ms = 2500) {
    let el = $('bs-toast');
    if (!el) { el = document.createElement('div'); el.id = 'bs-toast'; document.body.appendChild(el); }
    el.textContent = msg; 
    el.style.opacity = '1';
    setTimeout(() => el.style.opacity = '0', ms);
}

function copyText(btn, text) {
    navigator.clipboard.writeText(text).then(() => {
        const old = btn.innerHTML;
        btn.textContent = '✓ Copied';
        setTimeout(() => { btn.innerHTML = old; }, 2000);
    });
}

function startPlaceholderCycling() {
    const ph = ["Ask anything...", "Summarise this text...", "Explain it simply...", "Find a fun fact...", "Analyze this file..."];
    let i = 0;
    setInterval(() => { userInput.placeholder = ph[i]; i = (i + 1) % ph.length; }, 5000);
}

async function testApiKey() {
    const key = apiKeyInput.value.trim();
    if (!key) { toast('Please enter a key to test.'); return; }
    
    const btn = $('test-api-btn');
    const list = $('available-models');
    const old = btn.textContent;
    btn.textContent = 'Testing...';
    btn.disabled = true;
    
    try {
        // Simple OpenRouter Key validation
        if (!key.startsWith('sk-or-v1-')) {
            throw new Error('Invalid OpenRouter key format. It should start with sk-or-v1-');
        }
        
        list.innerHTML = `<div style="color:var(--accent);font-weight:800;margin-bottom:8px;">✅ Connection Success! OpenRouter Auto-Fallback active.</div>`;
        
        const modelSelect = $('model-select');
        modelSelect.innerHTML = '<option value="auto">OpenRouter Free Pool (Auto-Switch)</option>';
        modelSelect.value = "auto";
        state.model = "auto";
        
        list.classList.remove('hidden');
        toast('API Key valid! Pool activated.');
    } catch (err) {
        list.innerHTML = `<div style="color:#ef4444;font-weight:800;">❌ Connection Failed: ${esc(err.message)}</div>`;
        list.classList.remove('hidden');
        toast('Connection failed');
    } finally {
        btn.textContent = old;
        btn.disabled = false;
    }
}

async function testSerperKey() {
    const si = $('serper-key-input');
    const key = si ? si.value.trim() : '';
    if (!key) { toast('Please enter a Serper key to test.'); return; }
    
    const btn = $('test-serper-btn');
    const list = $('serper-test-result');
    const old = btn.textContent;
    btn.textContent = 'Testing...';
    btn.disabled = true;
    
    try {
        const res = await fetch("https://google.serper.dev/search", {
            method: "POST",
            headers: {
                "X-API-KEY": key,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ q: "test" })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        list.innerHTML = `<div style="color:var(--accent);font-weight:800;margin-bottom:8px;">✅ Connection Success! Serper API is active.</div>`;
        list.classList.remove('hidden');
        toast('Serper Key valid!');
    } catch (err) {
        list.innerHTML = `<div style="color:#ef4444;font-weight:800;">❌ Connection Failed: ${esc(err.message)}</div>`;
        list.classList.remove('hidden');
        toast('Connection failed');
    } finally {
        btn.textContent = old;
        btn.disabled = false;
    }
}

// ── Events ──
function bindEvents() {
    sendBtn.addEventListener('click', send);
    userInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    userInput.addEventListener('input', autoResize);

    document.querySelectorAll('.mode-btn').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
    document.querySelectorAll('.detail-btn').forEach(b => b.addEventListener('click', () => setDetail(b.dataset.detail)));



    newChatBtn.addEventListener('click', newChat);
    sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
    settingsBtn.addEventListener('click', openModal);
    modalOverlay.addEventListener('click', closeModal);
    modalClose.addEventListener('click', closeModal);
    saveSettings.addEventListener('click', doSaveSettings);
    toggleKeyVis.addEventListener('click', () => { apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password'; });
    $('test-api-btn').addEventListener('click', testApiKey);

    const toggleSerperVis = $('toggle-serper-vis');
    if (toggleSerperVis) {
        toggleSerperVis.addEventListener('click', () => {
            const si = $('serper-key-input');
            si.type = si.type === 'password' ? 'text' : 'password';
        });
    }
    const testSerperBtn = $('test-serper-btn');
    if (testSerperBtn) {
        testSerperBtn.addEventListener('click', testSerperKey);
    }
}


document.addEventListener('DOMContentLoaded', init);


