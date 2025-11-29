const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// Health check endpoint for deployment platforms (Railway/Render)
app.get('/', (req, res) => {
  res.send('dAUXimity Signal Server Online. Status: NOMINAL.');
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for MVP
    methods: ["GET", "POST"]
  }
});

// In-memory storage
// Room structure: { id, name, hostId, listeners: Set<socketId>, createdAt, isDemo?, streamUrl? }
const rooms = new Map();

// --- Feature 4: Create 24/7 Demo Rooms on startup ---
const DEMO_ROOMS = [
  {
    id: 'demo-nts-1',
    name: 'NTS Radio 1',
    streamUrl: 'https://stream-relay-geo.ntslive.net/stream',
    hostId: 'SYSTEM',
    listeners: new Set(),
    createdAt: Date.now(),
    status: 'active',
    isDemo: true
  },
  {
    id: 'demo-soma-groove',
    name: 'SomaFM Groove Salad',
    streamUrl: 'https://ice2.somafm.com/groovesalad-128-mp3',
    hostId: 'SYSTEM',
    listeners: new Set(),
    createdAt: Date.now(),
    status: 'active',
    isDemo: true
  },
  {
    id: 'demo-soma-defcon',
    name: 'SomaFM DEF CON Radio',
    streamUrl: 'https://ice2.somafm.com/defcon-128-mp3',
    hostId: 'SYSTEM',
    listeners: new Set(),
    createdAt: Date.now(),
    status: 'active',
    isDemo: true
  },
  {
    id: 'demo-lofi',
    name: 'Lofi Girl Radio',
    streamUrl: 'https://play.streamafrica.net/lofiradio',
    hostId: 'SYSTEM',
    listeners: new Set(),
    createdAt: Date.now(),
    status: 'active',
    isDemo: true
  }
];

// Initialize demo rooms
DEMO_ROOMS.forEach(room => {
  rooms.set(room.id, room);
});
console.log(`Initialized ${DEMO_ROOMS.length} demo rooms`);

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // --- Lobby Events ---
  
  socket.on('join-lobby', () => {
    socket.join('lobby');
    // Send active rooms (convert Map to Array)
    const roomList = Array.from(rooms.values()).map(r => ({
      ...r,
      listenerCount: r.listeners.size,
      listeners: undefined // Don't send set over wire
    }));
    socket.emit('room-list', roomList);
  });

  socket.on('create-room', (name, callback) => {
    const roomId = `room-${Date.now().toString().slice(-6)}`;
    const newRoom = {
      id: roomId,
      name: name || `Signal ${roomId}`,
      hostId: socket.id,
      listeners: new Set(),
      createdAt: Date.now(),
      status: 'active'
    };
    
    rooms.set(roomId, newRoom);
    socket.join(roomId);
    
    // Ack to host
    callback(newRoom);
    
    // Update lobby
    broadcastLobbyUpdate();
  });

  socket.on('join-room', (roomId, callback) => {
    const room = rooms.get(roomId);
    if (!room) {
      return callback({ success: false, message: 'Room not found or signal lost.' });
    }

    socket.join(roomId);
    room.listeners.add(socket.id);
    
    // Notify host a new user joined (to initiate WebRTC offer)
    io.to(room.hostId).emit('user-joined', { userId: socket.id });

    // Send success to joiner
    callback({ 
      success: true, 
      room: { ...room, listenerCount: room.listeners.size, listeners: undefined } 
    });

    broadcastLobbyUpdate();
  });

  socket.on('leave-room', (roomId) => {
    handleLeaveRoom(socket, roomId);
  });

  // --- WebRTC Signaling ---
  
  socket.on('webrtc-signal', ({ type, payload, targetUserId }) => {
    // Forward signal to specific target
    io.to(targetUserId).emit('webrtc-signal', {
      type,
      payload,
      senderId: socket.id
    });
  });

  // --- Stream Handshake ---
  socket.on('host-start-stream', ({ roomId }) => {
    // Notify everyone in the room that the host started streaming
    socket.to(roomId).emit('host-start-stream');
  });

  socket.on('listener-request-connection', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room && room.hostId) {
      // Notify the host that a listener wants to connect
      io.to(room.hostId).emit('listener-request-connection', { listenerId: socket.id });
    }
  });

  // Listener asks if stream is active (on join)
  socket.on('check-stream-status', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room && room.hostId) {
      io.to(room.hostId).emit('check-stream-status', { requesterId: socket.id });
    }
  });

  // Host replies yes, triggering listener to request connection
  socket.on('stream-status-reply', ({ requesterId, isStreaming }) => {
    if (isStreaming) {
      io.to(requesterId).emit('host-start-stream');
    }
  });

  // --- Chat ---
  
  socket.on('send-message', ({ roomId, text }) => {
    const message = {
      id: `${socket.id}-${Date.now()}`,
      userId: socket.id,
      text,
      timestamp: Date.now()
    };
    io.to(roomId).emit('new-message', message);
  });

  // --- Disconnect ---

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Find rooms this user is in
    rooms.forEach((room, roomId) => {
      if (room.hostId === socket.id || room.listeners.has(socket.id)) {
        handleLeaveRoom(socket, roomId);
      }
    });
  });

  function handleLeaveRoom(socket, roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    // Demo rooms never get deleted
    if (room.isDemo) {
      room.listeners.delete(socket.id);
      socket.leave(roomId);
      io.to(roomId).emit('user-left', { userId: socket.id });
      broadcastLobbyUpdate();
      return;
    }

    if (room.hostId === socket.id) {
      // Host left, destroy room
      io.to(roomId).emit('new-message', {
        id: 'sys-destroy',
        text: 'HOST DISCONNECTED. SIGNAL LOST.',
        system: true,
        timestamp: Date.now(),
        userId: 'SYSTEM'
      });
      // Force everyone out (optional, or just update UI)
      rooms.delete(roomId);
    } else {
      // Listener left
      room.listeners.delete(socket.id);
      socket.leave(roomId);
      // Notify active users
      io.to(roomId).emit('user-left', { userId: socket.id });
    }
    broadcastLobbyUpdate();
  }

  function broadcastLobbyUpdate() {
    const roomList = Array.from(rooms.values()).map(r => ({
      ...r,
      listenerCount: r.listeners.size,
      listeners: undefined
    }));
    io.to('lobby').emit('room-list', roomList);
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
    console.error('Please kill the existing process or wait a moment for it to close.');
    process.exit(1);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});