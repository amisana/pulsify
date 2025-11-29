import React, { useEffect, useState } from 'react';

interface JackInOverlayProps {
  onComplete: () => void;
}

export const JackInOverlay: React.FC<JackInOverlayProps> = ({ onComplete }) => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1200),
      setTimeout(() => onComplete(), 1800),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-dark z-[9999] flex items-center justify-center">
      <div className="text-center">
        {phase >= 0 && (
          <div className={`text-cyan text-xs mb-4 transition-opacity duration-300 ${phase >= 1 ? 'opacity-100' : 'opacity-0'}`}>
            ESTABLISHING CONNECTION...
          </div>
        )}
        {phase >= 1 && (
          <div 
            className="glitch-logo text-6xl md:text-8xl"
            data-text="pulse"
            style={{ 
              opacity: phase >= 2 ? 1 : 0.5,
              transition: 'opacity 0.3s ease'
            }}
          >
            pulse
          </div>
        )}
        {phase >= 2 && (
          <div className={`text-green text-xs mt-4 transition-opacity duration-300 ${phase >= 3 ? 'opacity-100' : 'opacity-0'}`}>
            CONNECTED
          </div>
        )}
      </div>
    </div>
  );
};
