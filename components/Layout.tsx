import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
  isConnected: boolean;
  userId?: string;
  onLeave?: () => void;
  inRoom?: boolean;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  // The new design handles its own layout in Lobby and RoomView
  return <>{children}</>;
};
