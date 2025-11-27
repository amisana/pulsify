import React, { useState } from 'react';
import { Room } from '../types';

interface LobbyProps {
  rooms: Room[];
  onCreateRoom: (name: string) => void;
  onJoinRoom: (roomId: string) => void;
}

export const Lobby: React.FC<LobbyProps> = ({ rooms, onCreateRoom, onJoinRoom }) => {
  const [newRoomName, setNewRoomName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    onCreateRoom(newRoomName);
  };

  const formatTimeAgo = (timestamp: number) => {
    const minutes = Math.floor((Date.now() - timestamp) / 60000);
    if (minutes < 1) return '< 1m ago';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="w-full">
      {/* Controls */}
      <div className="flex flex-wrap justify-between items-center mb-12 gap-6 border-b border-gray-800 pb-6 relative">
        <div className="absolute -bottom-1 left-0 w-1/3 h-[1px] bg-neon-yellow"></div>
        <div className="flex gap-6 items-center">
           <button 
             onClick={() => setIsCreating(true)}
             className="btn-retro px-6 py-3 text-sm tracking-wider"
           >
             ▲ HOST A ROOM
           </button>
           <div className="text-gray-500 self-center hidden sm:block font-mono text-xs tracking-widest opacity-60">
             // SYSTEM_READY
             <br/>
             // WAITING_FOR_INPUT
           </div>
        </div>
        
        <div className="flex gap-2 text-xs text-neon-blue font-mono items-center bg-gray-900/50 px-3 py-1 border border-gray-800">
           <div className="w-2 h-2 bg-neon-blue rounded-full animate-pulse"></div>
           <span>ACTIVE SIGNALS: {rooms.length.toString().padStart(2, '0')}</span>
        </div>
      </div>

      {/* Creation Form */}
      {isCreating && (
        <form onSubmit={handleSubmit} className="mb-12 tech-border p-6 relative overflow-hidden">
           <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-neon-yellow to-transparent opacity-50"></div>
          <label className="block text-neon-yellow text-xs mb-2 uppercase tracking-widest">Room Designation</label>
          <div className="flex gap-2">
            <input 
              type="text" 
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              className="bg-black/50 border border-gray-600 text-white p-3 flex-1 focus:border-neon-yellow focus:outline-none font-mono placeholder-gray-700"
              placeholder="ENTER_PROTOCOL_NAME..."
              autoFocus
            />
            <button type="submit" className="btn-retro px-6 py-2 text-xs">
              Initialize
            </button>
            <button type="button" onClick={() => setIsCreating(false)} className="text-gray-500 px-6 hover:text-white uppercase text-xs tracking-widest border border-transparent hover:border-gray-700 transition-all">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Room List */}
      <div className="grid gap-4">
        {rooms.length === 0 ? (
          <div className="text-center py-24 text-gray-600 font-mono border border-dashed border-gray-800 relative overflow-hidden group">
            <div className="absolute inset-0 bg-scanlines opacity-10 pointer-events-none"></div>
            <div className="glitch-text text-xl mb-2 opacity-50">NO ACTIVE TRANSMISSIONS</div>
            <div className="text-xs uppercase tracking-widest">Be the first to break the silence</div>
          </div>
        ) : (
          rooms.map(room => (
            <div 
              key={room.id}
              className="industrial-panel p-5 hover:border-neon-green transition-all cursor-pointer group relative overflow-hidden"
              onClick={() => onJoinRoom(room.id)}
            >
              <div className="absolute top-0 right-0 p-1 opacity-20 group-hover:opacity-100 transition-opacity">
                <div className="w-2 h-2 bg-neon-green rounded-full"></div>
              </div>
              
              <div className="flex justify-between items-center relative z-10">
                <div>
                  <h3 className="text-2xl font-bold text-white mb-1 group-hover:text-neon-green transition-colors font-mono tracking-tighter">
                    {room.name}
                  </h3>
                  <div className="flex gap-6 text-xs text-gray-500 font-mono uppercase tracking-wide">
                     <span className="flex items-center gap-2">
                       <span className="text-neon-pink">●</span> LSTN: {room.listenerCount.toString().padStart(2, '0')}
                     </span>
                     <span className="flex items-center gap-2">
                       <span className="text-neon-blue">●</span> AGE: {formatTimeAgo(room.createdAt)}
                     </span>
                  </div>
                </div>
                <div className="border border-gray-800 p-3 group-hover:border-neon-green group-hover:bg-neon-green/10 group-hover:text-neon-green text-gray-600 transition-all transform group-hover:translate-x-1">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                </div>
              </div>
              
              {/* Decorative Corner Lines */}
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-gray-800 group-hover:border-neon-green transition-colors"></div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};