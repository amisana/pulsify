import React, { useState } from 'react';
import { Room } from '../types';
import { GlitchLogo } from './GlitchLogo';

interface LobbyProps {
  rooms: Room[];
  onCreateRoom: (name: string) => void;
  onJoinRoom: (roomId: string) => void;
}

// Live badge with animated bars
const LiveBadge: React.FC = () => (
  <div className="live-badge">
    <div className="bars">
      <div className="bar"></div>
      <div className="bar"></div>
      <div className="bar"></div>
      <div className="bar"></div>
    </div>
    <span>LIVE</span>
  </div>
);

export const Lobby: React.FC<LobbyProps> = ({ rooms, onCreateRoom, onJoinRoom }) => {
  const [newRoomName, setNewRoomName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    onCreateRoom(newRoomName);
    setNewRoomName('');
  };

  const formatTimeAgo = (timestamp: number) => {
    const minutes = Math.floor((Date.now() - timestamp) / 60000);
    if (minutes < 1) return '< 1m ago';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  // Separate demo rooms from user rooms
  const demoRooms = rooms.filter(r => r.isDemo);
  const userRooms = rooms.filter(r => !r.isDemo);

  return (
    <div className="min-h-screen bg-dark p-4 md:p-8">
      {/* Header */}
      <header className="text-center mb-12">
        <GlitchLogo size="lg" />
        
        {/* Create Room Form */}
        <form onSubmit={handleSubmit} className="mt-8 flex justify-center gap-2 max-w-md mx-auto">
          <input 
            type="text"
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            placeholder="Enter room name"
            className="input-field flex-1"
          />
          <button type="submit" className="btn-primary">
            HOST
          </button>
        </form>
      </header>

      {/* Scrolling Banner */}
      <div className="marquee-container mb-8">
        <div className="marquee-content text-red">
          <span>▼ JOIN A ROOM ▼</span>
          <span>•</span>
          <span>▲ HOST A ROOM ▲</span>
          <span>•</span>
          <span>▼ JOIN A ROOM ▼</span>
          <span>•</span>
          <span>▲ HOST A ROOM ▲</span>
          <span>•</span>
          <span>▼ JOIN A ROOM ▼</span>
          <span>•</span>
          <span>▲ HOST A ROOM ▲</span>
          <span>•</span>
          <span>▼ JOIN A ROOM ▼</span>
          <span>•</span>
          <span>▲ HOST A ROOM ▲</span>
          <span>•</span>
        </div>
      </div>

      {/* Room Grid */}
      <div className="max-w-6xl mx-auto">
        {rooms.length === 0 ? (
          <div className="text-center py-24 text-muted">
            <p className="text-xl mb-2">NO ACTIVE TRANSMISSIONS</p>
            <p className="text-sm">Be the first to host a room</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Demo rooms first */}
            {demoRooms.map(room => (
              <RoomCard 
                key={room.id} 
                room={room} 
                onJoin={() => onJoinRoom(room.id)}
                formatTimeAgo={formatTimeAgo}
              />
            ))}
            {/* User rooms */}
            {userRooms.map(room => (
              <RoomCard 
                key={room.id} 
                room={room} 
                onJoin={() => onJoinRoom(room.id)}
                formatTimeAgo={formatTimeAgo}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer Ticker */}
      <div className="footer-ticker">
        <div className="marquee-content">
          <span>YOUR OLDEST FEARS ARE THE WORST ONES</span>
          <span>•</span>
          <span>IT IS UNFAIR TO TEAR SOMEBODY APART</span>
          <span>•</span>
          <span>© 2025 PULSE</span>
          <span>•</span>
          <span>TERMS</span>
          <span>•</span>
          <span>YOUR OLDEST FEARS ARE THE WORST ONES</span>
          <span>•</span>
          <span>IT IS UNFAIR TO TEAR SOMEBODY APART</span>
          <span>•</span>
          <span>© 2025 PULSE</span>
          <span>•</span>
          <span>TERMS</span>
          <span>•</span>
        </div>
      </div>
    </div>
  );
};

// Room Card Component
interface RoomCardProps {
  room: Room;
  onJoin: () => void;
  formatTimeAgo: (timestamp: number) => string;
}

const RoomCard: React.FC<RoomCardProps> = ({ room, onJoin, formatTimeAgo }) => {
  const isLive = room.status === 'active' || room.isDemo;
  
  return (
    <div 
      className={`room-card ${room.isDemo ? 'demo' : ''}`}
      onClick={onJoin}
    >
      <div className="flex justify-between items-start mb-3">
        <h3 className="text-cyan text-lg font-medium tracking-tight uppercase">
          {room.name}
        </h3>
        {isLive && <LiveBadge />}
      </div>
      
      <div className="flex items-center gap-4 text-xs text-muted mb-3">
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"/>
          </svg>
          {room.listenerCount}
        </span>
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/>
          </svg>
          {formatTimeAgo(room.createdAt)}
        </span>
      </div>

      {/* Now Playing placeholder - would come from actual stream data */}
      {room.isDemo && (
        <div className="now-playing truncate">
          {room.name.includes('NTS') && 'Live Radio Stream'}
          {room.name.includes('Groove') && 'Ambient / Chill'}
          {room.name.includes('DEF') && 'Hacker Music'}
          {room.name.includes('Lofi') && 'Lo-fi Beats'}
        </div>
      )}

      {/* Action icons */}
      <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-[var(--border)]">
        <button className="icon-btn" title="History">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </button>
        <button className="icon-btn" title="Share">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
          </svg>
        </button>
      </div>
    </div>
  );
};
