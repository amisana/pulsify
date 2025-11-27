import React, { useEffect, useState } from 'react';

interface JackInOverlayProps {
  onComplete: () => void;
}

export const JackInOverlay: React.FC<JackInOverlayProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  // Boot sequence logs
  const bootSequence = [
    "INITIALIZING NEURAL HANDSHAKE...",
    "BYPASSING ICE...",
    "VERIFYING BIOMETRIC SIGNATURE...",
    "ESTABLISHING SECURE UPLINK...",
    "SYNCING CORTEX BUFFER...",
    "CONNECTION ESTABLISHED."
  ];

  useEffect(() => {
    let currentStep = 0;
    
    const interval = setInterval(() => {
      if (currentStep >= bootSequence.length) {
        clearInterval(interval);
        setTimeout(onComplete, 800); // Wait a bit before dismissing
        return;
      }

      setLogs(prev => [...prev, bootSequence[currentStep]]);
      setStep(currentStep);
      currentStep++;
    }, 400); // Speed of log lines

    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[10000] bg-black flex flex-col items-center justify-center font-mono overflow-hidden">
      {/* Matrix/Hex Background Effect */}
      <div className="absolute inset-0 opacity-20 pointer-events-none" 
           style={{
             backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(0, 255, 0, .3) 25%, rgba(0, 255, 0, .3) 26%, transparent 27%, transparent 74%, rgba(0, 255, 0, .3) 75%, rgba(0, 255, 0, .3) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(0, 255, 0, .3) 25%, rgba(0, 255, 0, .3) 26%, transparent 27%, transparent 74%, rgba(0, 255, 0, .3) 75%, rgba(0, 255, 0, .3) 76%, transparent 77%, transparent)',
             backgroundSize: '50px 50px'
           }}>
      </div>

      {/* Central Interface */}
      <div className="relative z-10 max-w-md w-full p-8 border-l-4 border-r-4 border-neon-yellow bg-black/90">
        <div className="text-neon-yellow text-xs tracking-[0.5em] mb-6 text-center animate-pulse">
          NEURO_LINK_V.4.2
        </div>

        <div className="space-y-2 mb-8 min-h-[150px]">
          {logs.map((log, i) => (
            <div key={i} className={`${i === logs.length - 1 ? 'text-white' : 'text-gray-500'} text-sm font-bold uppercase tracking-wider`}>
              <span className="text-neon-green mr-2">{'>'}</span>
              {log}
            </div>
          ))}
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2 bg-gray-900 border border-gray-700 relative overflow-hidden">
          <div 
            className="h-full bg-neon-yellow transition-all duration-300 ease-out"
            style={{ width: `${Math.min(((step + 1) / bootSequence.length) * 100, 100)}%` }}
          ></div>
        </div>
        
        <div className="mt-2 flex justify-between text-[10px] text-gray-500 uppercase">
           <span>Sys.Root</span>
           <span>{Math.min(Math.round(((step + 1) / bootSequence.length) * 100), 100)}% COMPLETED</span>
        </div>
      </div>

      {/* Glitch Overlay */}
      <div className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-10 animate-pulse bg-noise"></div>
    </div>
  );
};
