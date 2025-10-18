// Time Pass - extended backend for real-user 4-digit ID system, persistent storage, and "find by ID" / add-friend flows

const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');

// Real-time (Socket.IO)
const { Server } = require('socket.io');
const io = new Server(httpServer);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend from the "public" folder
app.use(express.static('public'));

// Data persistence (disk)
let users = [];
let chats = [];

// Helpers
const nowIso = () => new Date().toISOString();

// Ensure data folder exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
}

// Load data from disk (or seed if empty)
function loadData() {
  ensureDataDir();

  // Load users
  if (fs.existsSync(USERS_FILE)) {
    try {
      const raw = fs.readFileSync(USERS_FILE);
      users = JSON.parse(raw);
    } catch {
      users = [];
    }
  }

  // Load chats
  if (fs.existsSync(CHATS_FILE)) {
    try {
      const raw = fs.readFileSync(CHATS_FILE);
      chats = JSON.parse(raw);
    } catch {
      chats = [];
    }
  }

  // Seed if empty
  if (users.length === 0) seedSampleUsers();
  if (chats.length === 0) seedSampleChats();
  // Persist to disk to ensure initial state
  saveData();
}

// Persist to disk
function saveData() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  fs.writeFileSync(CHATS_FILE, JSON.stringify(chats, null, 2));
}

// Seed initial 4-digit-ID users
function seedSampleUsers() {
  // Ensure unique 4-digit IDs (1000-9999)
  const seedUsers = [
    { name: 'Alex Chen', online: true, id: '1001', avatarColor: '#4a90e2' },
    { name: 'Time Pass Bot', online: true, id: '2002', avatarColor: '#8e44ad' },
    { name: 'Mila Novak', online: false, id: '3003', avatarColor: '#e67e22' }
  ];
  users = seedUsers.map(u => ({
    id: u.id,
    name: u.name,
    online: !!u.online,
    avatarColor: u.avatarColor,
    createdAt: nowIso()
  }));
}

// Seed a sample chat between existing users
function seedSampleChats() {
  // If 1001 and 2002 exist, create a chat
  const u1 = users.find(u => u.id === '1001');
  const u2 = users.find(u => u.id === '2002');
  if (!u1 || !u2) return;

  const chat = {
    id: 'chat_' + Date.now(),
    participants: [u1.id, u2.id],
    createdAt: nowIso(),
    messages: [
      { id: 'm1', sender: u2.id, text: 'Hey Alex, ready for the kickoff?', time: nowIso() },
      { id: 'm2', sender: u1.id, text: 'Yes, just finishing up notes.', time: nowIso() }
    ],
    last: 'Yes, just finishing up notes.'
  };
  chats.push(chat);
}

// Init
loadData();

// Helper to fetch a user by ID (4-digit)
function getUserById(id) {
  return users.find(u => u.id === id);
}

// Function to ensure a non-existent chat between two users is created
function findChatBetween(userId, friendId) {
  return chats.find(c => {
    return c.participants.includes(userId) && c.participants.includes(friendId) && c.participants.length === 2;
  });
}

// Socket.IO: connection handling
io.on('connection', (socket) => {
  console.log('A user connected');

  // Optional: join as a specific user
  socket.on('join-user', ({ userId }) => {
    if (userId) socket.join('user_' + userId);
  });

  // Join a chat room (per-chat)
  socket.on('join-chat', ({ chatId }) => {
    if (chatId) socket.join('chat_' + chatId);
  });

  // Relay a chat message to the specific chat room (if emitted by client)
  socket.on('chat message', ({ chatId, msg }) => {
    if (chatId) {
      io.to('chat_' + chatId).emit('chat message', { chatId, msg });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// API endpoints

// Create a new user (assigns a unique 4-digit ID)
app.post('/api/users', (req, res) => {
  const { name } = req.body;
  const trimmed = (name || '').toString().trim();
  if (!trimmed) {
    return res.status(400).json({ error: 'Name is required' });
  }

  // Generate a unique 4-digit id (1000-9999)
  const used = new Set(users.map(u => u.id));
  let candidate;
  let attempts = 0;
  do {
    candidate = String(1000 + Math.floor(Math.random() * 9000)); // 1000-9999
    attempts++;
  } while (used.has(candidate) && attempts < 50);

  if (used.has(candidate)) {
    // Fallback: find any unused 4-digit (very unlikely)
    for (let d = 1000; d <= 9999; d++) {
      const s = String(d);
      if (!used.has(s)) {
        candidate = s;
        break;
      }
    }
  }

  const newUser = {
    id: candidate,
    name: trimmed,
    online: true,
    avatarColor: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'),
    createdAt: nowIso()
  };

  users.unshift(newUser);
  saveData();

  res.status(201).json(newUser);
});

// Get user by 4-digit ID
app.get('/api/users/:id', (req, res) => {
  const id = req.params.id;
  if (!id || !/^\d{4}$/.test(id)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  const user = getUserById(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// Get chats for a given user (by userId)
app.get('/api/chats', (req, res) => {
  const userId = (req.query.userId || '').trim();
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  const userExists = !!getUserById(userId);
  if (!userExists) return res.status(404).json({ error: 'User not found' });

  const userChats = chats
    .filter(c => c.participants.includes(userId))
    .map(c => {
      // identify the peer
      const peerId = c.participants.find(id => id !== userId);
      const peer = getUserById(peerId);
      return {
        id: c.id,
        peer: {
          id: peer?.id,
          name: peer?.name,
          avatarColor: peer?.avatarColor,
          online: peer?.online
        },
        last: c.last || '',
        lastTime: c.createdAt || '',
        messagesCount: c.messages.length || 0
      };
    });

  res.json(userChats);
});

// Get messages for a chat (ensure user is a participant)
app.get('/api/chats/:id/messages', (req, res) => {
  const chatId = req.params.id;
  const userId = (req.query.userId || '').trim();
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const chat = chats.find(c => c.id === chatId);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  if (!chat.participants.includes(userId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Normalize messages: mark sender as 'me' or 'peer' for frontend clarity
  const normalized = chat.messages.map(m => ({
    id: m.id,
    sender: m.sender,
    text: m.text,
    time: m.time
  }));

  res.json(normalized);
});

// Create a new chat between two users (userId) and friendId  (by ID)
app.post('/api/chats', (req, res) => {
  const { userId, friendId } = req.body;
  if (!userId || !friendId) return res.status(400).json({ error: 'userId and friendId are required' });

  if (!getUserById(userId) || !getUserById(friendId)) {
    return res.status(404).json({ error: 'One or both users not found' });
  }

  // Check if chat already exists
  let chat = findChatBetween(userId, friendId);
  if (!chat) {
    chat = {
      id: 'chat_' + Date.now(),
      participants: [userId, friendId],
      createdAt: nowIso(),
      messages: [
        { id: 'm' + Date.now(), sender: friendId, text: 'Chat started between you', time: nowIso() }
      ],
      last: 'Chat started between you'
    };
    chats.unshift(chat);
    saveData();
  }

  // Return minimal chat info for frontend
  const peerId = chat.participants.find(p => p !== userId);
  const peer = getUserById(peerId);

  res.status(201).json({
    id: chat.id,
    peer: {
      id: peer?.id,
      name: peer?.name,
      avatarColor: peer?.avatarColor,
      online: peer?.online
    },
    last: chat.last,
    lastTime: chat.createdAt,
    messages: chat.messages
  });
});

// Send a message in a chat
app.post('/api/chats/:id/messages', (req, res) => {
  const chatId = req.params.id;
  const { userId, text } = req.body;
  if (!userId || !text) return res.status(400).json({ error: 'userId and text are required' });

  const chat = chats.find(c => c.id === chatId);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  if (!chat.participants.includes(userId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const msg = {
    id: 'm' + Date.now(),
    sender: userId,
    text: String(text).trim(),
    time: nowIso()
  };
  chat.messages.push(msg);
  chat.last = msg.text;
  saveData();

  // Real-time broadcast to all participants in this chat
  io.to('chat_' + chatId).emit('chat message', { chatId, msg });

  res.json({ id: msg.id, sender: msg.sender, text: msg.text, time: msg.time });
});

// Simple textual search for users (by name or by ID)
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q) return res.json([]);
  const results = users
    .filter(u => u.name.toLowerCase().includes(q) || u.id.toLowerCase().includes(q))
    .slice(0, 20)
    .map(u => ({
      id: u.id,
      name: u.name,
      avatarColor: u.avatarColor,
      online: u.online
    }));
  res.json(results);
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`Time Pass backend (extended) is running on http://localhost:${PORT}`);
});
