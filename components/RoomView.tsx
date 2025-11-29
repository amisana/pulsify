import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Room, User, Message, SocketEvents, NowPlaying } from '../types';
import { Socket } from 'socket.io-client';
import { GlitchLogo } from './GlitchLogo';

interface RoomViewProps {
  socket: Socket;
  room: Room;
  user: User;
  onLeave: () => void;
  onSwitchRoom?: (roomId: string) => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const RoomView: React.FC<RoomViewProps> = ({ socket, room, user, onLeave, onSwitchRoom }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('IDLE');
  const [showChat, setShowChat] = useState(false);
  const [lobbyRooms, setLobbyRooms] = useState<Room[]>([]);
  const [showLobby, setShowLobby] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  
  // Visualizer state - horizontal bars like Pulse
  const [audioLevels, setAudioLevels] = useState<number[]>(Array(40).fill(0));
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // PTT
  const [isPTTActive, setIsPTTActive] = useState(false);
  const [pttEnabled, setPttEnabled] = useState(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micGainRef = useRef<GainNode | null>(null);

  // WebRTC Refs
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<{ [userId: string]: RTCPeerConnection }>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const demoAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Lobby updates
  useEffect(() => {
    socket.emit(SocketEvents.JOIN_LOBBY);
    socket.on(SocketEvents.ROOM_LIST, (rooms: Room[]) => {
      setLobbyRooms(rooms.filter(r => r.id !== room.id));
    });
    return () => { socket.off(SocketEvents.ROOM_LIST); };
  }, [socket, room.id]);

  // Audio visualizer - horizontal bars
  useEffect(() => {
    const updateVisualizer = () => {
      if (analyserRef.current) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Sample frequency bands for horizontal bars
        const levels: number[] = [];
        const bands = 40;
        const step = Math.floor(dataArray.length / bands);
        for (let i = 0; i < bands; i++) {
          // Normalize to 0-100 for width percentage
          levels.push((dataArray[i * step] / 255) * 100);
        }
        setAudioLevels(levels);
      }
      animationFrameRef.current = requestAnimationFrame(updateVisualizer);
    };
    
    if (isStreaming) {
      updateVisualizer();
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isStreaming]);

  // Socket events
  useEffect(() => {
    setMessages([{ 
      id: 'sys-init', 
      text: 'Connected to room', 
      timestamp: Date.now(), 
      userId: 'SYSTEM', 
      system: true 
    }]);

    socket.on(SocketEvents.NEW_MESSAGE, (msg: Message) => {
      setMessages(prev => [...prev, msg]);
    });

    socket.on(SocketEvents.USER_LEFT, ({ userId }) => {
       if (peersRef.current[userId]) {
         peersRef.current[userId].close();
         delete peersRef.current[userId];
       }
    });

    socket.on(SocketEvents.HOST_START_STREAM, () => {
      if (!user.isHost) {
        socket.emit(SocketEvents.LISTENER_REQUEST_CONNECTION, { roomId: room.id });
      }
    });

    if (!user.isHost) {
      socket.emit('check-stream-status', { roomId: room.id });
    }

    return () => {
      socket.off(SocketEvents.NEW_MESSAGE);
      socket.off(SocketEvents.USER_LEFT);
      socket.off(SocketEvents.HOST_START_STREAM);
    };
  }, [socket, user.isHost, room.id]);

  // File upload handler
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setError(null);
      const arrayBuffer = await file.arrayBuffer();
      
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const audioContext = audioContextRef.current;
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
      }
      
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.loop = true;
      sourceNodeRef.current = source;

      const destination = audioContext.createMediaStreamDestination();
      destinationRef.current = destination;
      
      // Create analyser for visualizer
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      
      source.connect(analyser);
      analyser.connect(destination);
      source.connect(audioContext.destination);
      source.start(0);
      
      localStreamRef.current = destination.stream;
      setIsStreaming(true);
      socket.emit(SocketEvents.HOST_START_STREAM, { roomId: room.id });
      
    } catch (err: any) {
      setError("Failed to process audio file.");
    }
  };

  // Screen share
  const startStream = async () => {
    try {
      setError(null);
      
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });

      stream.getVideoTracks().forEach(track => track.stop());
      const audioTrack = stream.getAudioTracks()[0];
      
      if (!audioTrack) {
        throw new Error("No audio track. Check 'Share tab audio'.");
      }

      audioTrack.onended = () => stopStream();
      
      // Setup analyser
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const audioContext = audioContextRef.current;
      const source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      source.connect(analyser);

      const audioStream = new MediaStream([audioTrack]);
      localStreamRef.current = audioStream;
      setIsStreaming(true);
      socket.emit(SocketEvents.HOST_START_STREAM, { roomId: room.id });

    } catch (err: any) {
      setError(err.message || "Failed to capture audio.");
    }
  };

  const stopStream = () => {
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    sourceNodeRef.current?.stop();
    sourceNodeRef.current = null;
    micStreamRef.current?.getTracks().forEach(track => track.stop());
    micStreamRef.current = null;
    Object.values(peersRef.current).forEach(pc => pc.close());
    peersRef.current = {};
    setIsStreaming(false);
    setPttEnabled(false);
    setAudioLevels(Array(40).fill(0));
  };

  // WebRTC
  const createPeerConnection = useCallback((targetUserId: string, stream?: MediaStream) => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit(SocketEvents.WEBRTC_SIGNAL, {
          type: 'candidate',
          payload: event.candidate,
          targetUserId
        });
      }
    };

    if (stream) {
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
    }

    pc.ontrack = (event) => {
      if (audioRef.current) {
        audioRef.current.srcObject = event.streams[0];
        audioRef.current.play().catch(e => console.error("Autoplay blocked", e));
        setIsStreaming(true);
        
        // Setup analyser for listener
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const source = audioContextRef.current.createMediaStreamSource(event.streams[0]);
        const analyser = audioContextRef.current.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;
        source.connect(analyser);
      }
    };

    peersRef.current[targetUserId] = pc;
    pc.oniceconnectionstatechange = () => {
      setConnectionStatus(pc.iceConnectionState.toUpperCase());
    };

    return pc;
  }, [socket]);

  useEffect(() => {
    const handleUserJoined = async ({ userId }: { userId: string }) => {
      if (!user.isHost || !localStreamRef.current) return;
      const pc = createPeerConnection(userId, localStreamRef.current);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit(SocketEvents.WEBRTC_SIGNAL, { type: 'offer', payload: offer, targetUserId: userId });
    };

    const handleSignal = async ({ type, payload, senderId }: { type: string, payload: any, senderId: string }) => {
      if (!peersRef.current[senderId]) {
        createPeerConnection(senderId);
      }
      const pc = peersRef.current[senderId];

      if (type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(payload));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit(SocketEvents.WEBRTC_SIGNAL, { type: 'answer', payload: answer, targetUserId: senderId });
      } else if (type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(payload));
      } else if (type === 'candidate') {
        await pc.addIceCandidate(new RTCIceCandidate(payload)).catch(() => {});
      }
    };

    socket.on(SocketEvents.USER_JOINED, handleUserJoined);
    socket.on(SocketEvents.WEBRTC_SIGNAL, handleSignal);
    socket.on(SocketEvents.LISTENER_REQUEST_CONNECTION, ({ listenerId }) => handleUserJoined({ userId: listenerId }));
    socket.on('check-stream-status', ({ requesterId }) => {
      if (isStreaming) socket.emit('stream-status-reply', { requesterId, isStreaming: true });
    });

    return () => {
      socket.off(SocketEvents.USER_JOINED);
      socket.off(SocketEvents.WEBRTC_SIGNAL);
      socket.off(SocketEvents.LISTENER_REQUEST_CONNECTION);
      socket.off('check-stream-status');
    };
  }, [socket, user.isHost, createPeerConnection, isStreaming]);

  useEffect(() => {
    return () => { stopStream(); };
  }, []);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    socket.emit(SocketEvents.SEND_MESSAGE, { roomId: room.id, text: inputText });
    setInputText('');
  };

  // PTT
  const setupPTT = async () => {
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = micStream;
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const micSource = audioContextRef.current.createMediaStreamSource(micStream);
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 0;
      micGainRef.current = gainNode;
      micSource.connect(gainNode);
      if (destinationRef.current) gainNode.connect(destinationRef.current);
      setPttEnabled(true);
    } catch (err) {
      setError('Microphone access denied');
    }
  };

  const isDemo = room.isDemo && room.streamUrl;

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-4">
          <GlitchLogo size="sm" />
          <button onClick={() => setShowLobby(!showLobby)} className="icon-btn">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>
        </div>
        
        <div className="flex items-center gap-2 text-[#00ffff]">
          <span className="text-sm font-medium">/{room.name.toUpperCase().replace(/\s+/g, '_')}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[#666]">{room.listenerCount} listening</span>
          <button onClick={() => setIsMuted(!isMuted)} className="icon-btn">
            {isMuted ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
              </svg>
            )}
          </button>
          <button onClick={() => setShowChat(!showChat)} className="icon-btn">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
            </svg>
          </button>
          <button onClick={onLeave} className="icon-btn text-[#ff3366]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Now Playing Ticker */}
      {(isStreaming || isDemo) && nowPlaying && (
        <div className="marquee-container border-b border-[#1a1a1a]">
          <div className="marquee-content text-[#00ff88] text-xs">
            <span>NOW PLAYING: {nowPlaying.title.toUpperCase()} - {nowPlaying.artist.toUpperCase()}</span>
            <span className="mx-8">•</span>
            <span>NOW PLAYING: {nowPlaying.title.toUpperCase()} - {nowPlaying.artist.toUpperCase()}</span>
            <span className="mx-8">•</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* Lobby Sidebar */}
        {showLobby && (
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-[#111] border-r border-[#1a1a1a] z-50 overflow-y-auto">
            <div className="p-4 border-b border-[#1a1a1a] flex justify-between items-center">
              <span className="text-[#00ffff] text-xs uppercase tracking-wider">Rooms</span>
              <button onClick={() => setShowLobby(false)} className="text-[#666] hover:text-white">&times;</button>
            </div>
            {lobbyRooms.map(r => (
              <div 
                key={r.id}
                onClick={() => { onSwitchRoom?.(r.id); setShowLobby(false); }}
                className="p-3 border-b border-[#1a1a1a] cursor-pointer hover:bg-[#1a1a1a]"
              >
                <div className="text-[#00ffff] text-sm">{r.name}</div>
                <div className="text-xs text-[#666]">{r.listenerCount} listening</div>
              </div>
            ))}
          </div>
        )}

        {/* Visualizer Area */}
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          {isStreaming || isDemo ? (
            /* HORIZONTAL BAR VISUALIZER - Like Pulse */
            <div className="w-full max-w-4xl space-y-1">
              {audioLevels.map((level, i) => (
                <div key={i} className="flex items-center h-3">
                  <div 
                    className="h-full bg-[#00ffff] transition-all duration-75"
                    style={{ width: `${Math.max(2, level)}%` }}
                  />
                </div>
              ))}
            </div>
          ) : (
            // Host Controls or Waiting
            <div className="text-center max-w-md">
              {user.isHost ? (
                <div className="space-y-6">
                  <h2 className="text-2xl text-[#00ffff] mb-8 tracking-wider">HOST_CONTROLLER</h2>
                  
                  <input 
                    type="file" 
                    accept="audio/*" 
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  
                  <button onClick={() => fileInputRef.current?.click()} className="btn-primary w-full py-4">
                    LOAD AUDIO FILE
                  </button>
                  
                  <div className="text-[#666] text-xs py-2">— OR —</div>
                  
                  <button onClick={startStream} className="btn-secondary w-full py-4">
                    SHARE TAB AUDIO
                  </button>
                  
                  {error && (
                    <div className="text-[#ff3366] text-sm mt-4 p-3 border border-[#ff3366]/30">{error}</div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-4xl text-[#666] tracking-wider">WAITING FOR HOST</div>
                  <div className="text-xs text-[#444]">STATUS: {connectionStatus}</div>
                  <button 
                    onClick={() => socket.emit(SocketEvents.LISTENER_REQUEST_CONNECTION, { roomId: room.id })}
                    className="btn-secondary"
                  >
                    RETRY CONNECTION
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Host streaming controls */}
          {user.isHost && isStreaming && (
            <div className="mt-8 flex gap-4">
              <button onClick={stopStream} className="btn-danger">
                STOP STREAM
              </button>
              {!pttEnabled ? (
                <button onClick={setupPTT} className="btn-secondary">
                  ENABLE PTT
                </button>
              ) : (
                <button 
                  onMouseDown={() => { micGainRef.current && (micGainRef.current.gain.value = 1); setIsPTTActive(true); }}
                  onMouseUp={() => { micGainRef.current && (micGainRef.current.gain.value = 0); setIsPTTActive(false); }}
                  onMouseLeave={() => { micGainRef.current && (micGainRef.current.gain.value = 0); setIsPTTActive(false); }}
                  className={`btn-primary ${isPTTActive ? 'bg-[#00ffff] text-black' : ''}`}
                >
                  {isPTTActive ? 'TRANSMITTING' : 'HOLD TO TALK'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Chat Sidebar */}
        {showChat && (
          <div className="w-80 border-l border-[#1a1a1a] flex flex-col bg-[#111]">
            <div className="p-3 border-b border-[#1a1a1a] flex justify-between items-center">
              <span className="text-[#00ffff] text-xs uppercase tracking-wider">Chat</span>
              <button onClick={() => setShowChat(false)} className="text-[#666] hover:text-white">&times;</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {messages.map(msg => (
                <div key={msg.id} className={msg.system ? 'text-[#666] text-xs italic' : ''}>
                  {!msg.system && (
                    <span className="text-[#00ffff] text-xs">{msg.userId.slice(0,6)}: </span>
                  )}
                  <span className="text-sm text-white">{msg.text}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            
            <form onSubmit={handleSendMessage} className="p-3 border-t border-[#1a1a1a]">
              <div className="flex gap-2">
                <input 
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Message..."
                  className="input-field flex-1 text-sm"
                />
                <button type="submit" className="btn-primary px-3 py-1 text-xs">
                  SEND
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Hidden audio elements */}
      <audio ref={audioRef} autoPlay playsInline muted={isMuted} />
      {isDemo && room.streamUrl && (
        <audio ref={demoAudioRef} src={room.streamUrl} autoPlay muted={isMuted} />
      )}

      {/* Footer */}
      <footer className="border-t border-[#1a1a1a] py-2 px-4 text-xs text-[#444] flex justify-between">
        <span>© 2025 PULSE</span>
        <span>CHANGELOG • HELP • FEEDBACK</span>
      </footer>
    </div>
  );
};
