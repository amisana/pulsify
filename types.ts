export interface User {
  id: string;
  isHost: boolean;
}

export interface Room {
  id: string;
  name: string;
  hostId: string;
  listenerCount: number;
  createdAt: number;
  status: 'active' | 'waiting';
}

export interface Message {
  id: string;
  userId: string;
  text: string;
  timestamp: number;
  system?: boolean;
}

export interface WebRTCMessage {
  type: 'offer' | 'answer' | 'candidate';
  payload: any;
  targetUserId: string;
}

// Socket events enum for clarity
export enum SocketEvents {
  JOIN_LOBBY = 'join-lobby',
  CREATE_ROOM = 'create-room',
  JOIN_ROOM = 'join-room',
  LEAVE_ROOM = 'leave-room',
  ROOM_UPDATED = 'room-updated', // For lobby
  ROOM_LIST = 'room-list',
  SEND_MESSAGE = 'send-message',
  NEW_MESSAGE = 'new-message',
  WEBRTC_SIGNAL = 'webrtc-signal',
  USER_JOINED = 'user-joined', // Notify host
  USER_LEFT = 'user-left',
  HOST_START_STREAM = 'host-start-stream',
  LISTENER_REQUEST_CONNECTION = 'listener-request-connection',
  ERROR = 'error'
}