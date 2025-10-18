// public/client.js
// Time Pass - frontend client (vanilla JS) with 4-digit ID flow, real-ish chats, and ID-based searching

let chats = [];
let currentChatId = null;
let currentUser = null; // { id, name }
const API_BASE = ''; // relative root to API endpoints

// DOM elements
const chatListEl = document.getElementById('chatList');
const searchInputEl = document.getElementById('searchInput');
const searchBtnEl = document.getElementById('searchBtn');
const addFriendBtnEl = document.getElementById('addFriendBtn');
const messagesEl = document.getElementById('messages');
const currentNameEl = document.getElementById('currentName');
const currentAvatarEl = document.getElementById('currentAvatar');
const currentStatusEl = document.getElementById('currentStatus');
const messageInputEl = document.getElementById('messageInput');
const composerFormEl = document.getElementById('composer');
const headerSearchBtn = document.getElementById('headerSearchBtn');
const headerMoreBtn = document.getElementById('headerMoreBtn');
const yourIdBadge = document.getElementById('yourIdBadge');
const findIdInput = document.getElementById('findIdInput');
const findIdBtn = document.getElementById('findIdBtn');
const findResultEl = document.getElementById('findResult');

// Helpers
function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function renderMessages(chat) {
  messagesEl.innerHTML = '';
  chat.messages.forEach(msg => {
    const bubble = document.createElement('div');
    const isMe = msg.sender === currentUser?.id;
    bubble.className = `bubble ${isMe ? 'me' : 'them'}`;

    const text = document.createElement('div');
    text.className = 'text';
    text.textContent = msg.text;

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = formatTime(msg.time);

    bubble.appendChild(text);
    bubble.appendChild(meta);
    messagesEl.appendChild(bubble);
  });
  // Scroll to bottom
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setCurrentChat(chatId) {
  currentChatId = chatId;
  fetch(`${API_BASE}/api/chats/${encodeURIComponent(chatId)}/messages?userId=${encodeURIComponent(currentUser?.id || '')}`)
    .then(res => res.json())
    .then(msgs => {
      const chat = chats.find(c => c.id === chatId);
      if (!chat) return;

      chat.messages = msgs;
      // Update header
      // We know peer from chat object
      currentNameEl.textContent = chat.peer?.name || 'Chat';
      currentAvatarEl.textContent = chat.peer?.name?.charAt(0).toUpperCase() || '?';
      currentAvatarEl.style.background = chat.peer?.avatarColor || '#4a90e2';
      currentStatusEl.textContent = chat.peer?.online ? 'Online' : 'Offline';
      renderMessages(chat);
      renderChatList(); // highlight active
    })
    .catch(() => {
      // Fallback: ignore
    });
}

// Build chat list UI
function renderChatList(filter = '') {
  chatListEl.innerHTML = '';
  const term = filter.toLowerCase();
  const list = chats.filter(c => {
    const hay = `${c.peer?.name ?? ''} ${c.last ?? ''}`.toLowerCase();
    return hay.includes(term);
  });
  list.forEach(chat => {
    const item = document.createElement('div');
    item.className = 'chat-item';
    if (chat.id === currentChatId) item.classList.add('active');

    item.addEventListener('click', () => setCurrentChat(chat.id));

    const av = document.createElement('div');
    av.className = 'avatar';
    av.style.background = chat.peer?.avatarColor || '#324d74';
    av.textContent = (chat.peer?.name || '?').charAt(0).toUpperCase();

    const info = document.createElement('div');
    info.className = 'info';
    const nameEl = document.createElement('div');
    nameEl.className = 'name';
    nameEl.textContent = chat.peer?.name || '';
    const lastEl = document.createElement('div');
    lastEl.className = 'last';
    lastEl.textContent = chat.last || '';

    info.appendChild(nameEl);
    info.appendChild(lastEl);

    const timeEl = document.createElement('div');
    timeEl.className = 'time';
    const lastTime = chat.lastTime;
    timeEl.textContent = lastTime ? formatTime(lastTime) : '';

    item.appendChild(av);
    item.appendChild(info);
    item.appendChild(timeEl);

    chatListEl.appendChild(item);
  });

  // Auto-select first chat if none selected
  if (!currentChatId && list.length > 0) {
    setCurrentChat(list[0].id);
  }
}

// Load or initialize current user
function ensureCurrentUser() {
  const stored = localStorage.getItem('tp_current_user');
  if (stored) {
    try {
      currentUser = JSON.parse(stored);
      // Update UI
      yourIdBadge.textContent = `ID: ${currentUser.id}`;
      return Promise.resolve(currentUser);
    } catch {
      // fallthrough to create
    }
  }

  // Create a new user (prompt for a name)
  const name = prompt('Welcome to Time Pass. Enter your display name:') || 'Guest';
  return fetch(`${API_BASE}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
    .then(res => res.json())
    .then(user => {
      currentUser = { id: user.id, name: user.name };
      localStorage.setItem('tp_current_user', JSON.stringify(currentUser));
      yourIdBadge.textContent = `ID: ${currentUser.id}`;
      return currentUser;
    })
    .catch(() => {
      // Fallback to a temporary user (in case of errors)
      currentUser = { id: '0000', name: 'Guest' };
      localStorage.setItem('tp_current_user', JSON.stringify(currentUser));
      yourIdBadge.textContent = `ID: 0000`;
      return currentUser;
    });
}

// Load chats for current user
function loadChats() {
  if (!currentUser?.id) {
    return Promise.resolve();
  }
  return fetch(`${API_BASE}/api/chats?userId=${encodeURIComponent(currentUser.id)}`)
    .then(res => res.json())
    .then(data => {
      // Normalize local chat structure
      chats = data.map(s => ({
        id: s.id,
        peer: s.peer,
        last: s.last,
        lastTime: s.lastTime,
        messages: s.messages || []
      }));
      renderChatList();
    })
    .catch(() => {
      // If server not ready yet, keep empty
    });
}

// Add a friend by name (existing UX)
function addFriend() {
  const name = prompt('Enter your friend\'s name to create a chat (optional)').trim();
  if (!name && !currentUser?.id) return;
  // For simplicity, allow adding a new user by name and then start chat
  fetch(`${API_BASE}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name || 'Friend' })
  })
    .then(res => res.json())
    .then(newUser => {
      // Create chat with this new user
      return fetch(`${API_BASE}/api/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, friendId: newUser.id })
      });
    })
    .then(res => res.json())
    .then(chatInfo => {
      // Prepend in local list
      chats.unshift({
        id: chatInfo.id,
        peer: {
          id: chatInfo.peer?.id,
          name: chatInfo.peer?.name,
          avatarColor: chatInfo.peer?.avatarColor,
          online: chatInfo.peer?.online
        },
        last: chatInfo.last,
        lastTime: chatInfo.lastTime,
        messages: chatInfo.messages || []
      });
      renderChatList();
      if (chatInfo.id) setCurrentChat(chatInfo.id);
    })
    .catch(err => {
      console.error('Failed to add friend', err);
    });
}

// Find by ID flow
findIdBtn.addEventListener('click', () => {
  const id = (findIdInput.value || '').trim();
  if (!/^\d{4}$/.test(id)) {
    findResultEl.innerHTML = '<span style="color:#b33;">Please enter a valid 4-digit ID.</span>';
    return;
  }
  // Look up user by id
  fetch(`${API_BASE}/api/users/${id}`)
    .then(res => {
      if (!res.ok) throw new Error('Not found');
      return res.json();
    })
    .then(user => {
      findResultEl.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; padding:6px 0;">
          <div class="avatar" style="width:28px; height:28px; border-radius:50%; background:${user.avatarColor}; display:inline-flex; align-items:center; justify-content:center; color:white; font-weight:700;">
            ${user.name.charAt(0).toUpperCase()}
          </div>
          <strong>${user.name}</strong> <span style="color:#666; font-size:12px;">(${user.id})</span>
          <button id="btnAddById" style="margin-left:auto; padding:6px 12px; border-radius:6px; border:1px solid #2e3a49; background:#fff; cursor:pointer;">Add as Friend</button>
        </div>`;
      const btnAddById = document.getElementById('btnAddById');
      btnAddById.addEventListener('click', () => {
        // Create chat with this user
        fetch(`${API_BASE}/api/chats`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id, friendId: user.id })
        })
          .then(res => res.json())
          .then(chatInfo => {
            // Add to local list
            chats.unshift({
              id: chatInfo.id,
              peer: chatInfo.peer,
              last: chatInfo.last,
              lastTime: chatInfo.lastTime,
              messages: chatInfo.messages || []
            });
            renderChatList();
            setCurrentChat(chatInfo.id);
            findResultEl.innerHTML = '<span style="color:#2a9d8f;">Friend added and chat opened.</span>';
          })
          .catch(() => {
            findResultEl.innerHTML = '<span style="color:#b33;">Failed to add friend. Try again.</span>';
          });
      });
    })
    .catch(() => {
      findResultEl.innerHTML = '<span style="color:#b33;">User not found.</span>';
    });
});

// Search chats by text
searchBtn.addEventListener('click', () => {
  const q = searchInputEl.value.trim();
  if (!q) {
    loadChats();
    return;
  }
  fetch(`${API_BASE}/api/search?q=` + encodeURIComponent(q))
    .then(res => res.json())
    .then(results => {
      // Build a temporary list from search results
      chats = results.map(s => ({
        id: 'temp_' + s.id,
        peer: s,
        last: '',
        lastTime: '',
        messages: []
      }));
      renderChatList();
      // Auto-select first if any
      if (results.length > 0) {
        // Already not a real chat; don't auto-select
        // But you could fetch messages for a real chat
      }
    })
    .catch(() => {
      chatListEl.innerHTML = '';
    });
});

// Header actions (placeholders)
headerSearchBtn.addEventListener('click', () => {
  const q = prompt('Search messages in your chats (server-side). Enter search term:');
  if (!q) return;
  // Reuse server search for simplicity
  fetch(`${API_BASE}/api/search?q=` + encodeURIComponent(q))
    .then(res => res.json())
    .then(results => {
      chats = results.map(s => ({
        id: 'temp_' + s.id,
        peer: s,
        last: '',
        lastTime: '',
        messages: []
      }));
      renderChatList();
      if (results.length > 0) {
        // We won't auto-open a chat here
      }
    });
});

addFriendBtnEl.addEventListener('click', addFriend);

// Send a message
composerFormEl && composerFormEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInputEl.value.trim();
  if (!text || !currentChatId) return;
  fetch(`${API_BASE}/api/chats/${encodeURIComponent(currentChatId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.id, text })
  })
    .then(res => res.json())
    .then(msg => {
      // Update local chat
      const chat = chats.find(c => c.id === currentChatId);
      if (chat) {
        chat.messages.push({ id: msg.id, sender: currentUser.id, text: msg.text, time: msg.time });
        chat.last = msg.text;
        renderMessages(chat);
        renderChatList(searchInputEl.value);
      }
      messageInputEl.value = '';
    })
    .catch(() => {
      // Optional: queue send for later
    });
});

// Initialize
async function init() {
  await ensureCurrentUser();
  await loadChats();
}
function ensureCurrentUser() {
  // Try to pull from localStorage; if not present, create new user via API
  const stored = localStorage.getItem('tp_current_user');
  if (stored) {
    try {
      currentUser = JSON.parse(stored);
      yourIdBadge.textContent = `ID: ${currentUser.id}`;
      return Promise.resolve(currentUser);
    } catch {
      // ignore and recreate
    }
  }
  // Create new user
  const name = prompt('Enter your display name:') || 'Guest';
  return fetch(`${API_BASE}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
    .then(res => res.json())
    .then(user => {
      currentUser = { id: user.id, name: user.name };
      localStorage.setItem('tp_current_user', JSON.stringify(currentUser));
      yourIdBadge.textContent = `ID: ${currentUser.id}`;
      return currentUser;
    })
    .catch(() => {
      currentUser = { id: '0000', name: 'Guest' };
      localStorage.setItem('tp_current_user', JSON.stringify(currentUser));
      yourIdBadge.textContent = `ID: 0000`;
      return currentUser;
    });
}

// Kick off
init();
