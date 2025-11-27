import React from 'react';
import { GlitchLogo } from './GlitchLogo';

interface LayoutProps {
  children: React.ReactNode;
  isConnected: boolean;
  userId?: string;
  onLeave?: () => void;
  inRoom: boolean;
}

export const Layout: React.FC<LayoutProps> = ({ children, isConnected, userId, onLeave, inRoom }) => {
  return (
    <div className="flex flex-col h-screen bg-black text-gray-200 overflow-hidden relative">
      {/* Grid Background */}
      <div className="absolute inset-0 pointer-events-none opacity-10" 
           style={{ 
             backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)', 
             backgroundSize: '40px 40px' 
           }}>
      </div>

      {/* Top System Bar */}
      <div className="bg-black border-b border-gray-900 px-2 py-1 flex justify-between text-[10px] text-gray-600 font-mono select-none z-20">
         <span>SYS.V.1.0.4 // UPLINK_SECURE</span>
         <span className="hidden md:inline">MEM: {Math.floor(Math.random() * 99)}% // CPU: {Math.floor(Math.random() * 99)}%</span>
         <span>{new Date().toISOString().split('T')[0]}</span>
      </div>

      {/* Header */}
      <header className="flex justify-between items-center p-4 border-b border-gray-800 bg-black/90 backdrop-blur-sm z-10 relative">
        <div className="flex items-center gap-6">
          <GlitchLogo />
          {inRoom && (
            <button 
              onClick={onLeave}
              className="btn-retro px-4 py-1 text-xs border-red-500 text-red-500 hover:bg-red-900/20 hover:text-red-500 hover:shadow-[0_0_15px_rgba(255,0,0,0.5)]"
            >
              DISCONNECT
            </button>
          )}
        </div>
        
        <div className="flex items-center gap-6 text-xs font-mono">
           <div className="hidden md:flex items-center gap-2">
             <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-neon-green animate-pulse' : 'bg-red-500'}`}></div>
             <span className="opacity-70 tracking-widest">{isConnected ? 'ONLINE' : 'OFFLINE'}</span>
           </div>
           {userId && (
             <div className="text-gray-500 border border-gray-800 px-2 py-1 bg-black">
               ID: <span className="text-white">{userId.substring(0, 6).toUpperCase()}</span>
             </div>
           )}
        </div>
        
        {/* Decorative Header Line */}
        <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-gray-700 to-transparent"></div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative p-4 md:p-8 flex justify-center z-10">
        <div className="w-full max-w-6xl">
          {children}
        </div>
      </main>

      {/* Footer / Marquee */}
      <footer className="border-t border-neon-yellow bg-black text-neon-yellow py-2 overflow-hidden whitespace-nowrap relative z-10">
        <div className="absolute top-0 left-0 w-full h-full bg-neon-yellow opacity-5"></div>
        <div className="animate-marquee inline-block font-bold tracking-widest text-sm font-mono">
          STERILIZATION IS A WEAPON OF THE RULERS  •  FREEDOM IS A LUXURY NOT A RIGHT  •  THE SIGNAL IS PURE  •  NO GODS NO MASTERS  •  DIGITAL DECAY IS INEVITABLE  •  LISTEN TO THE STATIC  •  
          STERILIZATION IS A WEAPON OF THE RULERS  •  FREEDOM IS A LUXURY NOT A RIGHT  •  THE SIGNAL IS PURE  •  NO GODS NO MASTERS  •  DIGITAL DECAY IS INEVITABLE  •  LISTEN TO THE STATIC  •
        </div>
      </footer>
    </div>
  );
};