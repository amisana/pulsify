import React, { useState, useEffect, useMemo } from 'react';
import { Layout } from './components/Layout';
import { Lobby } from './components/Lobby';
import { RoomView } from './components/RoomView';
import { JackInOverlay } from './components/JackInOverlay';
import { User, Room, SocketEvents } from './types';
import io, { Socket } from 'socket.io-client';

// Use env var for socket URL, fallback to localhost for dev
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

const App: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [activeRooms, setActiveRooms] = useState<Room[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  
  // Jack-in sequence state
  const [showJackIn, setShowJackIn] = useState(true);

  // Initialize Socket connection
  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });

    newSocket.on('connect', () => {
      console.log('Connected to server:', newSocket.id);
      setIsConnected(true);
      setUser({ id: newSocket.id!, isHost: false });
      
      // Request initial room list
      newSocket.emit(SocketEvents.JOIN_LOBBY);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected');
      setIsConnected(false);
    });

    newSocket.on(SocketEvents.ROOM_LIST, (rooms: Room[]) => {
      setActiveRooms(rooms);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  const handleCreateRoom = (roomName: string) => {
    if (!socket) return;
    socket.emit(SocketEvents.CREATE_ROOM, roomName, (room: Room) => {
      setShowJackIn(true); // Trigger sequence for room entry
      setTimeout(() => {
        setCurrentRoom(room);
        setUser(prev => prev ? { ...prev, isHost: true } : null);
      }, 500); // Small delay so overlay appears first
    });
  };

  const handleJoinRoom = (roomId: string) => {
    if (!socket) return;
    socket.emit(SocketEvents.JOIN_ROOM, roomId, (response: { room: Room, success: boolean, message?: string }) => {
      if (response.success) {
        setShowJackIn(true); // Trigger sequence for room entry
        setTimeout(() => {
          setCurrentRoom(response.room);
          setUser(prev => prev ? { ...prev, isHost: false } : null);
        }, 500);
      } else {
        alert(response.message || "Failed to join room. It may have been destroyed.");
      }
    });
  };

  const handleLeaveRoom = () => {
    if (!socket || !currentRoom) return;
    socket.emit(SocketEvents.LEAVE_ROOM, currentRoom.id);
    setCurrentRoom(null);
    setUser(prev => prev ? { ...prev, isHost: false } : null);
    // Re-request lobby data
    socket.emit(SocketEvents.JOIN_LOBBY);
  };

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-neon-yellow font-mono flex-col gap-4">
        <div className="animate-pulse text-2xl">ESTABLISHING UPLINK...</div>
        <div className="text-xs text-gray-500">Ensure local server is running on port 3001</div>
      </div>
    );
  }

  return (
    <>
      {showJackIn && (
        <JackInOverlay onComplete={() => setShowJackIn(false)} />
      )}

      <Layout 
        isConnected={isConnected} 
        userId={user?.id}
        onLeave={currentRoom ? handleLeaveRoom : undefined}
        inRoom={!!currentRoom}
      >
        {currentRoom ? (
          <RoomView 
            socket={socket!} 
            room={currentRoom} 
            user={user!} 
            onLeave={handleLeaveRoom}
          />
        ) : (
          <Lobby 
            rooms={activeRooms} 
            onCreateRoom={handleCreateRoom} 
            onJoinRoom={handleJoinRoom} 
          />
        )}
      </Layout>
    </>
  );
};

export default App;