import React from 'react';

interface GlitchLogoProps {
  size?: 'sm' | 'md' | 'lg';
}

export const GlitchLogo: React.FC<GlitchLogoProps> = ({ size = 'md' }) => {
  const sizeClasses = {
    sm: 'text-2xl',
    md: 'text-4xl md:text-5xl',
    lg: 'text-6xl md:text-8xl'
  };

  return (
    <div className="relative inline-block">
      <h1 
        className={`glitch-logo ${sizeClasses[size]}`}
        data-text="pulse"
      >
        pulse
      </h1>
    </div>
  );
};
