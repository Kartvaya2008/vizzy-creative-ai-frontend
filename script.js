/* ─── Vizzy Chat — script.js ────────────────────────────────────────── */

const BASE_URL = "https://vizzy-creative-ai-backend-production.up.railway.app";

const CHAT_API   = `${BASE_URL}/chat`;
const IMAGE_API  = `${BASE_URL}/image`;
const ENHANCE_API= `${BASE_URL}/enhance`;

/* ── DOM refs ── */
const chatBox         = document.getElementById('chat-box');
const userInput       = document.getElementById('user-input');
const landingInput    = document.getElementById('landing-input');
const sendBtn         = document.getElementById('send-btn');
const typingIndicator = document.getElementById('typing-indicator');
const typingLabel     = document.getElementById('typingLabel');
const inputCard       = document.getElementById('inputCard');
const landingInputCard= document.getElementById('landingInputCard');
const toggleBtn       = document.getElementById('toggleBtn');
const imageModeBtn    = document.getElementById('imageModeBtn');
const modeBadge       = document.getElementById('modeBadge');
const pageHome        = document.getElementById('pageHome');
const pageChat        = document.getElementById('pageChat');

/* ── App state ── */
let currentPage  = 'home';
let isWaiting    = false;
let enhanceMode  = false;
let currentIndex = null;
let messages     = [];
let selectedMode = null;
let imageMode    = false;
let storyMode    = false;

/* ══════════════════════════════════════════
   PAGE NAVIGATION
   Uses display:flex / display:none toggling
   (no translateX — avoids the blank-on-load bug)
══════════════════════════════════════════ */
function navigateTo(page) {
  if (page === currentPage) return;

  /* hide current */
  const leaving  = currentPage === 'home' ? pageHome : pageChat;
  leaving.classList.remove('active');

  /* show next */
  const entering = page === 'home' ? pageHome : pageChat;
  entering.classList.add('active');

  currentPage = page;

  setTimeout(() => {
    if (page === 'home') landingInput?.focus();
    else userInput?.focus();
  }, 60);
}

function goHome() {
  saveCurrentChat();
  currentIndex      = null;
  messages          = [];
  chatBox.innerHTML = '';
  userInput.value   = '';
  autoResizeInput();
  clearMode();
  loadHistory();
  navigateTo('home');
}

function navigateToChat() { navigateTo('chat'); }

/* ══════════════════════════════════════════
   SIDEBAR TOGGLE
══════════════════════════════════════════ */
toggleBtn.addEventListener('click', () => {
  const collapsed = document.body.classList.toggle('sidebar-collapsed');
  localStorage.setItem('vizzy_sidebar_collapsed', collapsed ? '1' : '0');
  loadHistory();
  document.getElementById('historyPanel').classList.add('visible');
});

function toggleHistory() {
  if (document.body.classList.contains('sidebar-collapsed')) {
    document.body.classList.remove('sidebar-collapsed');
    localStorage.setItem('vizzy_sidebar_collapsed', '0');
  }
  document.getElementById('historyPanel').classList.toggle('visible');
  loadHistory();
}

/* ══════════════════════════════════════════
   TEXTAREA AUTO-RESIZE
══════════════════════════════════════════ */
function autoResizeInput() {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 180) + 'px';
  userInput.style.overflowY = userInput.scrollHeight > 180 ? 'auto' : 'hidden';
}

/* ══════════════════════════════════════════
   MODE MANAGEMENT
══════════════════════════════════════════ */
function clearMode() {
  selectedMode = null; imageMode = false; storyMode = false;
  imageModeBtn?.classList.remove('active');
  modeBadge?.classList.add('hidden');
  document.getElementById('storyModeBtn')?.classList.remove('active');
  if (userInput)    userInput.placeholder    = 'Ask anything';
  if (landingInput) landingInput.placeholder = 'Ask anything';
}

function setMode(mode) {
  selectedMode = (selectedMode === mode) ? null : mode;
  imageMode    = selectedMode === 'image';
  storyMode    = selectedMode === 'story';

  document.getElementById('storyModeBtn')?.classList.toggle('active', selectedMode === 'story');
  imageModeBtn?.classList.toggle('active', selectedMode === 'image');
  modeBadge?.classList.toggle('hidden', selectedMode !== 'image');

  const ph = selectedMode === 'story' ? 'Describe your story…'
           : selectedMode === 'image' ? 'Describe the image you want…'
           : 'Ask anything';
  if (userInput)    userInput.placeholder    = ph;
  if (landingInput) landingInput.placeholder = ph;

  document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('hidden'));
}

function toggleStoryMode() { setMode('story'); }
function toggleImageMode()  { setMode('image'); }
function toggleImage()      { setMode('image'); }

/* ══════════════════════════════════════════
   LANDING SEND
══════════════════════════════════════════ */
landingInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); landingSend(); }
});
landingInput.addEventListener('focus', () => landingInputCard.classList.add('focused'));
landingInput.addEventListener('blur',  () => landingInputCard.classList.remove('focused'));

function landingSend() {
  const message = landingInput.value.trim();
  if (!message) {
    landingInputCard.classList.add('shake');
    setTimeout(() => landingInputCard.classList.remove('shake'), 400);
    return;
  }
  navigateToChat();
  requestAnimationFrame(() => {
    landingInput.value = '';
    addMessage(message, 'user');
    if (imageMode) callImageBackend(message);
    else           callTextBackend(message);
  });
}

/* ══════════════════════════════════════════
   CHAT HISTORY
══════════════════════════════════════════ */
function getChats()       { return JSON.parse(localStorage.getItem('vizzy_chats') || '[]'); }
function saveChats(chats) { localStorage.setItem('vizzy_chats', JSON.stringify(chats)); }

function loadHistory() {
  const list  = document.getElementById('historyList');
  const chats = getChats();
  if (!chats.length) {
    list.innerHTML = '<div class="history-empty">No chats yet</div>';
    return;
  }
  list.innerHTML = chats.slice().reverse().map((c, ri) => {
    const idx    = chats.length - 1 - ri;
    const active = idx === currentIndex ? ' active-chat' : '';
    return `<div class="history-item${active}" onclick="switchChat(${idx})">
      <span class="history-item-text">${escapeHtml(c.title)}</span>
      <button class="history-del" onclick="deleteChat(event,${idx})">×</button>
    </div>`;
  }).join('');
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function switchChat(index) {
  const chats = getChats();
  if (!chats[index]) return;
  saveCurrentChat();
  currentIndex = index;
  messages     = chats[index].messages || [];
  chatBox.innerHTML = '';
  messages.forEach(m => renderMessage(m.text, m.role, m.isImage, true));
  navigateToChat();
  loadHistory();
}

function deleteChat(e, index) {
  e.stopPropagation();
  const chats = getChats();
  chats.splice(index, 1);
  saveChats(chats);
  if (index === currentIndex) {
    currentIndex = null; messages = []; chatBox.innerHTML = '';
  } else if (currentIndex !== null && index < currentIndex) {
    currentIndex--;
  }
  loadHistory();
}

function saveCurrentChat() {
  if (!messages.length) return;
  const chats = getChats();
  const title = messages[0]?.text?.slice(0, 40) || 'New Chat';
  const entry = { title, messages };
  if (currentIndex === null) { chats.push(entry); currentIndex = chats.length - 1; }
  else chats[currentIndex] = entry;
  saveChats(chats);
  loadHistory();
}

/* ══════════════════════════════════════════
   NEW CHAT
══════════════════════════════════════════ */
function newChat() {
  saveCurrentChat();
  currentIndex = null; messages = [];
  chatBox.innerHTML = ''; userInput.value = '';
  autoResizeInput(); clearMode();
  navigateToChat(); loadHistory();
}

/* ══════════════════════════════════════════
   ON LOAD — ensure home page is visible
══════════════════════════════════════════ */
window.addEventListener('load', () => {
  /* Restore sidebar state */
  if (localStorage.getItem('vizzy_sidebar_collapsed') === '1') {
    document.body.classList.add('sidebar-collapsed');
  } else {
    document.body.classList.remove('sidebar-collapsed');
  }

  /* ── CRITICAL FIX: ensure exactly one page is active ── */
  pageHome.classList.remove('active');
  pageChat.classList.remove('active');
  pageHome.classList.add('active');   /* always start on home */
  currentPage = 'home';

  /* Input listeners */
  userInput.addEventListener('focus', () => inputCard.classList.add('focused'));
  userInput.addEventListener('blur',  () => inputCard.classList.remove('focused'));
  userInput.addEventListener('input', autoResizeInput);

  /* Close dropdowns on outside click */
  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('hidden'));
  });

  document.getElementById('historyPanel').classList.add('visible');
  loadHistory();
  landingInput.focus();
});

/* ══════════════════════════════════════════
   SEND MESSAGE (chat page)
══════════════════════════════════════════ */
userInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

async function sendMessage() {
  if (isWaiting) return;
  const message = userInput.value.trim();
  if (!message) {
    inputCard.classList.add('shake');
    setTimeout(() => inputCard.classList.remove('shake'), 400);
    return;
  }
  userInput.value = ''; autoResizeInput();
  addMessage(message, 'user');
  if (imageMode)        await callImageBackend(message);
  else if (enhanceMode) await callEnhanceBackend(message);
  else                  await callTextBackend(message);
}

/* ══════════════════════════════════════════
   API CALLS
══════════════════════════════════════════ */
async function callTextBackend(message) {
  lockUI(); typingLabel.textContent = ''; showTyping();
  try {
    const res  = await fetch(CHAT_API, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ message }) });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const data = await res.json();
    hideTyping(); addMessage(data.reply, 'bot');
  } catch (err) {
    hideTyping();
    addMessage('⚠ Could not reach the server. Make sure Flask is running on port 5000.', 'bot', false, false, true);
  } finally { unlockUI(); }
}

async function callEnhanceBackend(text) {
  lockUI(); typingLabel.textContent = 'Enhancing…'; showTyping();
  try {
    const res  = await fetch(ENHANCE_API, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text }) });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const data = await res.json();
    hideTyping(); addMessage(data.enhanced, 'bot');
  } catch (err) {
    hideTyping();
    addMessage('⚠ Enhance failed. Make sure Flask is running on port 5000.', 'bot', false, false, true);
  } finally { unlockUI(); }
}

async function callImageBackend(prompt) {
  lockUI(); typingLabel.textContent = ''; showTyping();
  try {
    const res = await fetch(IMAGE_API, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ prompt }) });
    if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.error || `Server error: ${res.status}`); }
    const blob   = await res.blob();
    const imgUrl = URL.createObjectURL(blob);
    hideTyping(); addImageMessage(imgUrl, prompt);
  } catch (err) {
    hideTyping();
    addMessage(`⚠ Image generation failed: ${err.message}`, 'bot', false, false, true);
  } finally { unlockUI(); }
}

/* ══════════════════════════════════════════
   TYPEWRITER
══════════════════════════════════════════ */
function typewriterEffect(element, text, speed = 18) {
  element.textContent = '';
  let i = 0;
  const cursor = document.createElement('span');
  cursor.className = 'tw-cursor'; cursor.textContent = '▍';
  element.appendChild(cursor);
  const iv = setInterval(() => {
    if (i < text.length) {
      element.insertBefore(document.createTextNode(text.charAt(i)), cursor);
      i++; chatBox.scrollTop = chatBox.scrollHeight;
    } else { clearInterval(iv); cursor.remove(); }
  }, speed);
}

/* ══════════════════════════════════════════
   RENDER MESSAGES
══════════════════════════════════════════ */
function addMessage(text, role, isImage=false, silent=false, isError=false) {
  renderMessage(text, role, isImage, silent, isError);
}

function renderMessage(text, role, isImage=false, silent=false, isError=false) {
  const row = document.createElement('div'); row.classList.add('message-row');
  const div = document.createElement('div'); div.classList.add('message', role);
  if (isError) div.classList.add('error');

  const isImgUrl = isImage || (typeof text === 'string' &&
    /^(blob:|https?:\/\/\S+\.(png|jpg|jpeg|gif|webp))/.test(text));

  if (isImgUrl) {
    div.classList.add('image-bubble');
    const img = document.createElement('img'); img.src = text; img.alt = 'Generated'; img.loading = 'lazy';
    div.appendChild(img);
    const dl = document.createElement('a'); dl.href = text; dl.download = 'vizzy-image.png';
    dl.className = 'dl-btn';
    dl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download`;
    div.appendChild(dl);
  } else {
    if (role === 'bot' && !isError && !silent) typewriterEffect(div, text);
    else div.innerText = text;
  }

  row.appendChild(div); chatBox.appendChild(row);
  chatBox.scrollTop = chatBox.scrollHeight;

  if (!silent && !isError) { messages.push({ role, text, isImage: isImgUrl }); saveCurrentChat(); }
}

function addImageMessage(blobUrl, prompt) {
  const row     = document.createElement('div'); row.classList.add('message-row');
  const wrapper = document.createElement('div'); wrapper.classList.add('message','bot','image-bubble');
  const cap     = document.createElement('div'); cap.className = 'img-caption';
  cap.textContent = `🎨 "${prompt.slice(0,80)}${prompt.length>80?'…':''}"`;
  wrapper.appendChild(cap);
  const img = document.createElement('img'); img.src = blobUrl; img.alt = 'Generated'; img.loading = 'lazy';
  wrapper.appendChild(img);
  const dl = document.createElement('a'); dl.href = blobUrl; dl.download = 'vizzy-image.png';
  dl.className = 'dl-btn';
  dl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download`;
  wrapper.appendChild(dl);
  row.appendChild(wrapper); chatBox.appendChild(row);
  chatBox.scrollTop = chatBox.scrollHeight;
  messages.push({ role:'bot', text:blobUrl, isImage:true }); saveCurrentChat();
}

/* ══════════════════════════════════════════
   UI HELPERS
══════════════════════════════════════════ */
function showTyping() { typingIndicator.classList.remove('hidden'); chatBox.scrollTop = chatBox.scrollHeight; }
function hideTyping() { typingIndicator.classList.add('hidden'); }
function lockUI()  { isWaiting = true;  userInput.disabled = true;  sendBtn.disabled = true; }
function unlockUI(){ isWaiting = false; userInput.disabled = false; sendBtn.disabled = false; userInput.focus(); }

function toggleDropdown(id, e) {
  if (e) e.stopPropagation();
  const menu   = document.getElementById(id);
  const hidden = menu.classList.contains('hidden');
  document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('hidden'));
  if (hidden) menu.classList.remove('hidden');
}

let csToastTimer = null;
function showComingSoon() {
  const toast = document.getElementById('csToast');
  if (!toast) return;
  toast.classList.remove('hidden');
  requestAnimationFrame(() => toast.classList.add('show'));
  if (csToastTimer) clearTimeout(csToastTimer);
  csToastTimer = setTimeout(() => toast.classList.remove('show'), 2000);
}