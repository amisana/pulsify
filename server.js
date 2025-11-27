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
// Room structure: { id, name, hostId, listeners: Set<socketId>, createdAt }
const rooms = new Map();

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