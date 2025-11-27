import React from 'react';

export const GlitchLogo: React.FC = () => {
  return (
    <div className="relative group cursor-pointer select-none">
      <h1 
        className="text-4xl font-bold tracking-tighter italic font-mono glitch-text text-white mix-blend-screen"
        data-text="dAUXimity"
      >
        dAUXimity
      </h1>
      <div className="absolute -bottom-2 right-0 text-[10px] text-neon-blue tracking-[0.3em] opacity-70 group-hover:animate-pulse">
        SIGNAL_V.2.0
      </div>
    </div>
  );
};