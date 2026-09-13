import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { dbOps } from './server/db.js';
import { createApiRouter } from './server/routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve API routes
app.use('/api', createApiRouter(io));

// Serve Admin Dashboard route specifically
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// Serve frontend static assets (HTML, CSS, JS, Images)
app.use(express.static(__dirname));

// Fallback to index.html for root navigation
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Real-time Visitor & Presence Tracking
let activeVisitors = new Set();

const broadcastPresence = () => {
  const count = Math.max(1, activeVisitors.size);
  io.emit('presence:count', { count });
};

// Socket.io Real-time Handlers
io.on('connection', async (socket) => {
  activeVisitors.add(socket.id);
  broadcastPresence();

  // Send initial real-time snapshot to the connected client
  try {
    const stats = await dbOps.getStats();
    socket.emit('stats:updated', stats);
  } catch (e) {
    console.error('Error fetching initial stats:', e.message);
    socket.emit('stats:error', { error: 'Could not load stats right now' });
  }
  socket.emit('presence:count', { count: activeVisitors.size });

  // 1. Client joins general public room
  socket.on('join_public', () => {
    socket.join('public_room');
  });

  // 2. Admin connects to Coach Command Center
  socket.on('join_admin', async (pin) => {
    try {
      const validPin = (await dbOps.getSetting('admin_pin')) || 'kaarthi2026';
      if (pin === validPin) {
        socket.join('admin_room');
        socket.emit('admin:authenticated', { success: true });
        // Send fresh leads and stats
        socket.emit('admin:initial_data', {
          leads: await dbOps.getAllLeads(),
          stats: await dbOps.getStats(),
          settings: await dbOps.getAllSettings(),
          recentChats: await dbOps.getRecentChatSessions()
        });
      } else {
        socket.emit('admin:authenticated', { success: false, error: 'Invalid PIN' });
      }
    } catch (e) {
      console.error('Error in join_admin:', e.message);
      socket.emit('admin:authenticated', { success: false, error: 'Server error, try again' });
    }
  });

  // 3. Visitor or Coach joins a Live Chat Session Room
  socket.on('chat:join', async ({ sessionId, senderName }) => {
    try {
      socket.join(`chat_${sessionId}`);
      const history = await dbOps.getChatHistory(sessionId);
      socket.emit('chat:history', history);
    } catch (e) {
      console.error('Error in chat:join:', e.message);
      socket.emit('chat:history', []);
    }
  });

  // 4. Live Chat Message Transmission
  socket.on('chat:send', async ({ sessionId, sender, text, senderName }) => {
    if (!sessionId || !text) return;
    try {
      const msg = await dbOps.saveChatMessage(sessionId, sender, text, senderName || (sender === 'coach' ? 'Coach Kaarthi' : 'Visitor'));

      // Emit to everyone in this chat session room (visitor + coach)
      io.to(`chat_${sessionId}`).emit('chat:message', msg);

      // If visitor sent it, also push live notification to admin room
      if (sender === 'visitor') {
        io.to('admin_room').emit('chat:activity', {
          sessionId,
          message: msg,
          senderName: senderName || 'Prospective Athlete'
        });
      }
    } catch (e) {
      console.error('Error in chat:send:', e.message);
      socket.emit('chat:error', { error: 'Message could not be sent' });
    }
  });

  // 5. Typing Indicators
  socket.on('chat:typing', ({ sessionId, sender, isTyping }) => {
    socket.to(`chat_${sessionId}`).emit('chat:typing', { sender, isTyping });
  });

  // 6. Real-time Lead Status Modification from Coach Admin
  socket.on('lead:update_status', async ({ id, status, notes }) => {
    try {
      const updated = await dbOps.updateLeadStatus(id, status, notes);
      io.to('admin_room').emit('lead:updated', updated);
      io.emit(`lead_status:${updated.ref_code}`, { ref_code: updated.ref_code, status: updated.status });
    } catch (e) {
      console.error('Error updating lead status:', e.message);
    }
  });

  // 7. Real-time Slot Quick-Adjust from Coach Admin
  socket.on('slots:adjust', async ({ delta }) => {
    try {
      const current = parseInt((await dbOps.getSetting('slots_remaining')) || '3', 10);
      const next = Math.max(0, current + delta);
      await dbOps.setSetting('slots_remaining', next);

      const stats = await dbOps.getStats();
      io.emit('stats:updated', stats);
      io.to('admin_room').emit('settings:updated', await dbOps.getAllSettings());
    } catch (e) {
      console.error('Error adjusting slots:', e.message);
    }
  });

  socket.on('disconnect', () => {
    activeVisitors.delete(socket.id);
    broadcastPresence();
  });
});

// Global safety net: log unexpected errors instead of letting them
// silently crash the whole server (and every connected user with it).
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`⚡ KAARTHI LIFTS REAL-TIME FULLSTACK SERVER RUNNING`);
  console.log(`⚡ Visitor Experience: http://localhost:${PORT}`);
  console.log(`⚡ Coach Admin Center: http://localhost:${PORT}/admin`);
  console.log(`⚡ Real-Time WebSockets: Active`);
  console.log(`⚡ Appwrite Database: Connected`);
  console.log(`====================================================`);
});
