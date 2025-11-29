import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Room, User, Message, SocketEvents, NowPlaying } from '../types';
import { Socket } from 'socket.io-client';

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
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

// AudD API for music recognition
const AUDD_API_URL = 'https://api.audd.io/';

export const RoomView: React.FC<RoomViewProps> = ({ socket, room, user, onLeave, onSwitchRoom }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('IDLE');
  
  // Feature 1: Lobby sidebar
  const [lobbyRooms, setLobbyRooms] = useState<Room[]>([]);
  const [showLobby, setShowLobby] = useState(false);
  
  // Feature 2: Push-to-talk
  const [isPTTActive, setIsPTTActive] = useState(false);
  const [pttEnabled, setPttEnabled] = useState(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  
  // Feature 3: Music Recognition
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const lastRecognizedRef = useRef<string>('');
  const recognitionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // WebRTC Refs
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<{ [userId: string]: RTCPeerConnection }>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const demoAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  // Chat scroll ref
  const chatEndRef = useRef<HTMLDivElement>(null);

  // --- Scroll to bottom of chat ---
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Feature 1: Listen to lobby updates ---
  useEffect(() => {
    socket.emit(SocketEvents.JOIN_LOBBY);
    
    socket.on(SocketEvents.ROOM_LIST, (rooms: Room[]) => {
      setLobbyRooms(rooms.filter(r => r.id !== room.id));
    });
    
    return () => {
      socket.off(SocketEvents.ROOM_LIST);
    };
  }, [socket, room.id]);

  // --- Socket Event Listeners for Chat & Logic ---
  useEffect(() => {
    // Add system message on join
    setMessages([{ 
      id: 'sys-init', 
      text: 'MSG TRANSMISSION: LIVE AS TYPED', 
      timestamp: Date.now(), 
      userId: 'SYSTEM', 
      system: true 
    }]);

    socket.on(SocketEvents.NEW_MESSAGE, (msg: Message) => {
      setMessages(prev => [...prev, msg]);
    });

    socket.on(SocketEvents.USER_LEFT, ({ userId }) => {
       // Cleanup peer connection if this user left
       if (peersRef.current[userId]) {
         peersRef.current[userId].close();
         delete peersRef.current[userId];
       }
       setMessages(prev => [...prev, { 
         id: `sys-${Date.now()}`, 
         text: `User ${userId.substring(0,4)} disconnected`, 
         timestamp: Date.now(), 
         userId: 'SYSTEM', 
         system: true 
       }]);
    });

    // --- Handshake for existing listeners ---
    socket.on(SocketEvents.HOST_START_STREAM, () => {
      // If we are a listener, request connection
      if (!user.isHost) {
        console.log('Host started streaming, requesting connection...');
        socket.emit(SocketEvents.LISTENER_REQUEST_CONNECTION, { roomId: room.id });
      }
    });

    // Check status on join
    if (!user.isHost) {
      socket.emit('check-stream-status', { roomId: room.id });
    }

    return () => {
      socket.off(SocketEvents.NEW_MESSAGE);
      socket.off(SocketEvents.USER_LEFT);
      socket.off(SocketEvents.HOST_START_STREAM);
    };
  }, [socket, user.isHost, room.id]);

  // --- Feature 3: Music Recognition ---
  const recognizeMusic = useCallback(async () => {
    if (!audioRef.current?.srcObject && !demoAudioRef.current) return;
    
    try {
      setIsRecognizing(true);
      
      // For demo rooms, we can't easily capture audio from external stream
      // For WebRTC streams, we capture from the audio context
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const audioContext = audioContextRef.current;
      let sourceNode: MediaStreamAudioSourceNode | MediaElementAudioSourceNode;
      
      if (audioRef.current?.srcObject) {
        sourceNode = audioContext.createMediaStreamSource(audioRef.current.srcObject as MediaStream);
      } else if (demoAudioRef.current) {
        sourceNode = audioContext.createMediaElementSource(demoAudioRef.current);
      } else {
        return;
      }
      
      // Record a short sample
      const destination = audioContext.createMediaStreamDestination();
      sourceNode.connect(destination);
      
      const mediaRecorder = new MediaRecorder(destination.stream);
      const chunks: Blob[] = [];
      
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        
        // Convert to base64 for AudD API
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];
          
          try {
            // Note: This requires an API key in production
            const response = await fetch(AUDD_API_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                api_token: import.meta.env.VITE_AUDD_API_KEY || 'test',
                audio: base64,
                return: 'apple_music,spotify'
              })
            });
            
            const data = await response.json();
            
            if (data.result) {
              const songKey = `${data.result.artist}-${data.result.title}`;
              
              // Deduplication: Don't show same song twice
              if (songKey !== lastRecognizedRef.current) {
                lastRecognizedRef.current = songKey;
                setNowPlaying({
                  title: data.result.title,
                  artist: data.result.artist,
                  album: data.result.album,
                  artwork: data.result.apple_music?.artwork?.url?.replace('{w}', '200').replace('{h}', '200'),
                  recognizedAt: Date.now()
                });
              }
            }
          } catch (err) {
            console.error('Music recognition failed:', err);
          }
        };
        reader.readAsDataURL(blob);
      };
      
      mediaRecorder.start();
      setTimeout(() => mediaRecorder.stop(), 5000); // 5 second sample
      
    } catch (err) {
      console.error('Recognition error:', err);
    } finally {
      setIsRecognizing(false);
    }
  }, []);

  // --- HOST Logic: File Streaming ---
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
      
      // Decode audio data
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Create source node
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
      }
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.loop = true;
      sourceNodeRef.current = source;

      // Create destination for WebRTC
      const destination = audioContext.createMediaStreamDestination();
      destinationRef.current = destination;
      source.connect(destination);
      
      // Also connect to local output so host can hear
      source.connect(audioContext.destination);

      source.start(0);
      
      // Use the stream from destination
      const stream = destination.stream;
      localStreamRef.current = stream;
      setIsStreaming(true);
      
      // Notify waiting listeners that we are ready
      socket.emit(SocketEvents.HOST_START_STREAM, { roomId: room.id });
      
    } catch (err: any) {
      console.error("Error processing audio file:", err);
      setError("Failed to process audio file.");
    }
  };

  // --- Feature 2: Push-to-Talk ---
  const setupPTT = async () => {
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      });
      micStreamRef.current = micStream;
      
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const audioContext = audioContextRef.current;
      const micSource = audioContext.createMediaStreamSource(micStream);
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0; // Start muted
      micGainRef.current = gainNode;
      
      micSource.connect(gainNode);
      
      // If we have a destination, connect mic to it
      if (destinationRef.current) {
        gainNode.connect(destinationRef.current);
      }
      
      setPttEnabled(true);
    } catch (err) {
      console.error('Failed to setup PTT:', err);
      setError('Failed to access microphone for Push-to-Talk');
    }
  };

  const handlePTTDown = () => {
    if (micGainRef.current) {
      micGainRef.current.gain.value = 1;
      setIsPTTActive(true);
    }
  };

  const handlePTTUp = () => {
    if (micGainRef.current) {
      micGainRef.current.gain.value = 0;
      setIsPTTActive(false);
    }
  };

  // --- HOST Logic: Screen/Mic Streaming ---
  const startStream = async () => {
    try {
      setError(null);
      
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      const isChrome = /chrome/i.test(navigator.userAgent) && !/edge/i.test(navigator.userAgent);
      const isEdge = /edge/i.test(navigator.userAgent);
      const isFirefox = /firefox/i.test(navigator.userAgent);
      
      const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
      
      if (!isSecure) {
        throw new Error("Media access requires HTTPS. Please use https:// or localhost.");
      }
      
      if (!navigator.mediaDevices) {
        throw new Error("Media devices API not available. Please check browser permissions.");
      }
      
      const hasDisplayMedia = typeof navigator.mediaDevices.getDisplayMedia === 'function';
      
      if (!hasDisplayMedia) {
        if (isSafari) {
          throw new Error("Safari doesn't support system audio sharing. Please use Chrome, Edge, or Firefox for best results.");
        }
        const browserInfo = isChrome ? "Chrome" : isEdge ? "Edge" : isFirefox ? "Firefox" : "your browser";
        throw new Error(`Screen sharing not available. Please ensure you're using a recent version of ${browserInfo}, or try Chrome/Edge/Firefox.`);
      }
      
      if (isSafari) {
        const useMic = window.confirm(
          "Safari has limited support for system audio sharing.\n\n" +
          "Would you like to use your microphone instead?\n\n" +
          "(For system audio, please use Chrome, Edge, or Firefox)"
        );
        
        if (useMic) {
          try {
            const micStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
              }
            });
            localStreamRef.current = micStream;
            setIsStreaming(true);
            micStream.getAudioTracks()[0].onended = () => stopStream();
            return;
          } catch (micErr: any) {
            throw new Error("Microphone access denied. Please allow microphone permissions.");
          }
        } else {
          return;
        }
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      });

      stream.getVideoTracks().forEach(track => track.stop());

      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        const useMic = window.confirm(
          "No system audio detected. This usually means:\n" +
          "1. You didn't check 'Share tab audio' in the share dialog\n" +
          "2. Or you're sharing a window without audio\n\n" +
          "Would you like to use your microphone instead?"
        );
        
        if (useMic) {
          try {
            const micStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
              }
            });
            localStreamRef.current = micStream;
            setIsStreaming(true);
            micStream.getAudioTracks()[0].onended = () => stopStream();
            return;
          } catch (micErr: any) {
            throw new Error("Microphone access denied. Please allow microphone permissions.");
          }
        } else {
          throw new Error("No audio track selected. Make sure to check 'Share tab audio' when sharing.");
        }
      }

      audioTrack.onended = () => {
        stopStream();
      };

      const audioStream = new MediaStream([audioTrack]);
      localStreamRef.current = audioStream;
      setIsStreaming(true);

      socket.emit(SocketEvents.HOST_START_STREAM, { roomId: room.id });

    } catch (err: any) {
      console.error("Error starting stream:", err);
      const errorMessage = err.message || "Failed to capture audio. Use Chrome and check 'Share Audio'.";
      setError(errorMessage);
    }
  };

  const stopStream = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    Object.values(peersRef.current).forEach(pc => (pc as RTCPeerConnection).close());
    peersRef.current = {};
    setIsStreaming(false);
    setPttEnabled(false);
  };

  // --- WebRTC Signaling Handling ---

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
      }
    };

    peersRef.current[targetUserId] = pc;

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE State: ${pc.iceConnectionState}`);
      setConnectionStatus(pc.iceConnectionState.toUpperCase());
    };

    return pc;
  }, [socket]);

  useEffect(() => {
    const handleUserJoined = async ({ userId }: { userId: string }) => {
      if (!user.isHost || !localStreamRef.current) return;
      
      console.log(`Host: User ${userId} joined, initiating connection...`);
      const pc = createPeerConnection(userId, localStreamRef.current);
      
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      socket.emit(SocketEvents.WEBRTC_SIGNAL, {
        type: 'offer',
        payload: offer,
        targetUserId: userId
      });
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
        
        socket.emit(SocketEvents.WEBRTC_SIGNAL, {
          type: 'answer',
          payload: answer,
          targetUserId: senderId
        });
      } else if (type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(payload));
      } else if (type === 'candidate') {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload));
        } catch (e) {
          console.error("Error adding ice candidate", e);
        }
      }
    };

    socket.on(SocketEvents.USER_JOINED, handleUserJoined);
    socket.on(SocketEvents.WEBRTC_SIGNAL, handleSignal);
    
    socket.on(SocketEvents.LISTENER_REQUEST_CONNECTION, ({ listenerId }: { listenerId: string }) => {
       console.log(`Listener ${listenerId} requested connection`);
       handleUserJoined({ userId: listenerId });
    });

    socket.on('check-stream-status', ({ requesterId }: { requesterId: string }) => {
      if (isStreaming) {
        socket.emit('stream-status-reply', { requesterId, isStreaming: true });
      }
    });

    return () => {
      socket.off(SocketEvents.USER_JOINED);
      socket.off(SocketEvents.WEBRTC_SIGNAL);
      socket.off(SocketEvents.LISTENER_REQUEST_CONNECTION);
      socket.off('check-stream-status');
    };
  }, [socket, user.isHost, createPeerConnection, isStreaming]);

  // --- Cleanup on unmount ---
  useEffect(() => {
    return () => {
      stopStream();
      if (recognitionIntervalRef.current) {
        clearInterval(recognitionIntervalRef.current);
      }
    };
  }, []);

  // --- Chat ---
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    socket.emit(SocketEvents.SEND_MESSAGE, { roomId: room.id, text: inputText });
    setInputText('');
  };

  // Check if this is a demo room
  const isDemo = room.isDemo && room.streamUrl;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-140px)] relative">
      
      {/* --- Feature 1: Lobby Sidebar Overlay --- */}
      {showLobby && (
        <div className="absolute top-0 left-0 z-50 w-64 h-full bg-black/95 border-r border-neon-yellow/30 backdrop-blur-sm overflow-hidden">
          <div className="p-4 border-b border-gray-800">
            <div className="flex justify-between items-center">
              <span className="text-neon-yellow font-mono text-xs tracking-widest">ACTIVE_SIGNALS</span>
              <button onClick={() => setShowLobby(false)} className="text-gray-500 hover:text-red-500 text-xs">[X]</button>
            </div>
          </div>
          <div className="overflow-y-auto h-full p-4 space-y-2">
            {lobbyRooms.length === 0 ? (
              <p className="text-gray-600 text-xs font-mono">NO_OTHER_SIGNALS</p>
            ) : (
              lobbyRooms.map(r => (
                <div 
                  key={r.id}
                  onClick={() => onSwitchRoom?.(r.id)}
                  className="p-3 border border-gray-800 hover:border-neon-yellow cursor-pointer transition-all group"
                >
                  <div className="flex items-center gap-2">
                    {r.isDemo && <span className="text-[8px] px-1 bg-neon-blue/20 text-neon-blue border border-neon-blue/30">24/7</span>}
                    <span className="text-white font-mono text-xs group-hover:text-neon-yellow">{r.name}</span>
                  </div>
                  <div className="text-[10px] text-gray-600 mt-1">{r.listenerCount} CONNECTED</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Toggle Lobby Button */}
      <button 
        onClick={() => setShowLobby(!showLobby)}
        className="absolute top-2 left-2 z-40 btn-retro px-2 py-1 text-[10px]"
      >
        {showLobby ? 'HIDE' : 'LOBBY'} [{lobbyRooms.length}]
      </button>

      {/* --- Left Panel: Room Info & Stream Controls --- */}
      <div className="md:col-span-2 flex flex-col gap-4 h-full">
        <div className="industrial-panel p-8 relative flex-1 flex flex-col justify-center items-center border border-gray-800 bg-black/80 backdrop-blur-sm">
          {/* Technical Overlay Graphics */}
          <div className="absolute top-4 left-4 right-4 flex justify-between text-[10px] font-mono text-gray-600 uppercase tracking-widest pointer-events-none">
             <span>PROTOCOL: {room.name} {isDemo && '[DEMO]'}</span>
             <span>SIGNAL_INTEGRITY: {isStreaming ? '100%' : '0%'}</span>
          </div>
          <div className="absolute bottom-4 left-4 text-[10px] font-mono text-gray-600 uppercase tracking-widest pointer-events-none">
             LATENCY: {Math.floor(Math.random() * 20) + 10}MS
          </div>
          
          {/* Corner Accents */}
          <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-neon-yellow opacity-50"></div>
          <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-neon-yellow opacity-50"></div>
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-neon-yellow opacity-50"></div>
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-neon-yellow opacity-50"></div>

          {/* --- Feature 3: Now Playing Display --- */}
          {nowPlaying && (
            <div className="absolute top-12 left-4 right-4 flex items-center gap-4 p-3 bg-black/80 border border-neon-green/30">
              {nowPlaying.artwork && (
                <img src={nowPlaying.artwork} alt="Album art" className="w-12 h-12 object-cover" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-neon-green font-mono text-sm truncate">{nowPlaying.title}</div>
                <div className="text-gray-400 font-mono text-xs truncate">{nowPlaying.artist}</div>
                {nowPlaying.album && <div className="text-gray-600 font-mono text-[10px] truncate">{nowPlaying.album}</div>}
              </div>
              <div className="text-[8px] text-gray-600 font-mono">NOW_PLAYING</div>
            </div>
          )}
          
          {/* Visualizer / Status */}
          <div className="flex flex-col items-center gap-8 z-10">
            {isStreaming || isDemo ? (
              <div className="relative group cursor-pointer">
                <div className="w-48 h-48 rounded-full border-4 border-neon-green flex items-center justify-center animate-pulse shadow-[0_0_50px_#00ff00] bg-black relative z-10">
                   <div className="absolute inset-2 rounded-full border border-neon-green opacity-50 border-dashed animate-[spin_10s_linear_infinite]"></div>
                   <div className="absolute inset-6 rounded-full border border-neon-green opacity-30 border-dotted animate-[spin_5s_linear_infinite_reverse]"></div>
                   
                   {/* Waveform SVG */}
                   <svg className="w-24 h-24 text-neon-green" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                     <path d="M10 50L20 50" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
                       <animate attributeName="d" values="M10 50L20 50; M10 20L20 80; M10 50L20 50" dur="0.5s" repeatCount="indefinite" />
                     </path>
                     <path d="M30 50L40 50" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
                       <animate attributeName="d" values="M30 50L40 50; M30 10L40 90; M30 50L40 50" dur="0.4s" repeatCount="indefinite" />
                     </path>
                     <path d="M50 50L60 50" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
                       <animate attributeName="d" values="M50 50L60 50; M50 30L60 70; M50 50L60 50" dur="0.6s" repeatCount="indefinite" />
                     </path>
                     <path d="M70 50L80 50" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
                       <animate attributeName="d" values="M70 50L80 50; M70 15L80 85; M70 50L80 50" dur="0.3s" repeatCount="indefinite" />
                     </path>
                     <path d="M90 50L100 50" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
                       <animate attributeName="d" values="M90 50L100 50; M90 40L100 60; M90 50L100 50" dur="0.7s" repeatCount="indefinite" />
                     </path>
                   </svg>

                </div>
                <div className="absolute inset-0 rounded-full border-2 border-neon-green animate-ping opacity-20"></div>
                <div className="absolute -inset-4 rounded-full border border-neon-green/20 animate-pulse"></div>
              </div>
            ) : (
               <div className="w-48 h-48 rounded-full border-4 border-gray-800 flex items-center justify-center text-gray-700 relative">
                 <div className="absolute inset-2 rounded-full border border-gray-800/50 border-dashed"></div>
                 <svg className="w-24 h-24 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                   <line x1="1" y1="1" x2="23" y2="23"></line>
                   <path d="M9 9v6a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                   <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                   <line x1="12" y1="19" x2="12" y2="23"></line>
                   <line x1="8" y1="23" x2="16" y2="23"></line>
                 </svg>
               </div>
            )}
            
            <div className="text-center font-mono">
              <h2 className={`text-3xl font-bold mb-2 tracking-tighter ${isStreaming || isDemo ? 'text-neon-green glitch-text' : 'text-gray-500'}`}>
                {isStreaming || isDemo ? 'TRANSMISSION ACTIVE' : 'WAITING FOR HOST...'}
              </h2>
              <p className="text-gray-400 text-sm uppercase tracking-widest">
                {user.isHost 
                  ? ">> INITIATE UPLINK SEQUENCE <<" 
                  : `>> STATUS: ${connectionStatus} <<`}
              </p>
              {!user.isHost && !isStreaming && !isDemo && (
                <button 
                  onClick={() => socket.emit(SocketEvents.LISTENER_REQUEST_CONNECTION, { roomId: room.id })}
                  className="mt-4 btn-retro px-4 py-2 text-[10px]"
                >
                  FORCE_RETRY_HANDSHAKE
                </button>
              )}
            </div>

            {/* Demo Room Audio Player */}
            {isDemo && room.streamUrl && (
              <audio 
                ref={demoAudioRef}
                src={room.streamUrl} 
                autoPlay 
                controls
                className="w-full max-w-xs"
              />
            )}

            {user.isHost && !isDemo && (
               !isStreaming ? (
                 <div className="flex flex-col gap-4 w-full max-w-xs">
                   <button 
                     onClick={startStream}
                     className="btn-retro px-6 py-3 font-bold text-lg tracking-widest w-full"
                   >
                     INITIATE UPLINK
                     <span className="block text-[10px] font-normal opacity-70 mt-1">(SCREEN SHARE)</span>
                   </button>
                   
                   <div className="flex items-center gap-4 justify-center text-gray-600 text-xs font-mono my-1">
                      <div className="h-[1px] bg-gray-800 flex-1"></div>
                      <span>OR</span>
                      <div className="h-[1px] bg-gray-800 flex-1"></div>
                   </div>

                   <input 
                     type="file" 
                     accept="audio/*" 
                     ref={fileInputRef}
                     onChange={handleFileUpload}
                     className="hidden"
                   />
                   <button 
                     onClick={() => fileInputRef.current?.click()}
                     className="btn-retro px-6 py-3 font-bold text-lg tracking-widest w-full border-neon-blue text-neon-blue hover:shadow-[0_0_20px_#00ffff]"
                   >
                     LOAD DATA CARTRIDGE
                     <span className="block text-[10px] font-normal opacity-70 mt-1">(FILE UPLOAD)</span>
                   </button>
                 </div>
               ) : (
                 <div className="flex flex-col gap-4 items-center">
                   <button 
                     onClick={stopStream}
                     className="btn-retro px-8 py-4 border-red-500 text-red-500 hover:bg-red-500 hover:text-black font-bold text-xl tracking-widest hover:shadow-[0_0_30px_#ff0000]"
                   >
                     TERMINATE UPLINK
                   </button>
                   
                   {/* Feature 2: Push-to-Talk */}
                   {!pttEnabled ? (
                     <button 
                       onClick={setupPTT}
                       className="btn-retro px-4 py-2 text-xs border-neon-blue text-neon-blue"
                     >
                       ENABLE PUSH_TO_TALK
                     </button>
                   ) : (
                     <button 
                       onMouseDown={handlePTTDown}
                       onMouseUp={handlePTTUp}
                       onMouseLeave={handlePTTUp}
                       onTouchStart={handlePTTDown}
                       onTouchEnd={handlePTTUp}
                       className={`btn-retro px-6 py-4 text-sm font-bold ${isPTTActive ? 'bg-red-500 text-black border-red-500 shadow-[0_0_30px_#ff0000]' : 'border-gray-600 text-gray-400'}`}
                     >
                       {isPTTActive ? 'TRANSMITTING...' : 'HOLD TO TALK'}
                     </button>
                   )}
                 </div>
               )
            )}
            
            {/* Feature 3: Music Recognition Button */}
            {(isStreaming || isDemo) && !user.isHost && (
              <button 
                onClick={recognizeMusic}
                disabled={isRecognizing}
                className="btn-retro px-4 py-2 text-xs border-purple-500 text-purple-500 hover:shadow-[0_0_20px_#a855f7] disabled:opacity-50"
              >
                {isRecognizing ? 'ANALYZING...' : 'IDENTIFY_TRACK'}
              </button>
            )}
            
            {error && (
              <div className="mt-4 p-4 border border-red-500 bg-red-900/20 text-red-500 font-mono text-sm max-w-md text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full bg-scanlines opacity-10"></div>
                <span className="font-bold mr-2">[ERROR]:</span> {error}
              </div>
            )}
          </div>

          {/* Hidden Audio Element for Listeners */}
          <audio ref={audioRef} autoPlay playsInline muted={isMuted} />
          
          {/* Mute Control for Listeners */}
          {!user.isHost && (isStreaming || isDemo) && (
             <div className="absolute bottom-8 right-8">
               <button 
                 onClick={() => {
                   setIsMuted(!isMuted);
                   if(audioRef.current) audioRef.current.muted = !isMuted;
                   if(demoAudioRef.current) demoAudioRef.current.muted = !isMuted;
                 }}
                 className="btn-retro px-4 py-2 text-xs"
               >
                 {isMuted ? 'UNMUTE SIGNAL' : 'MUTE SIGNAL'}
               </button>
             </div>
          )}
        </div>
      </div>

      {/* --- Right Panel: Chat --- */}
      <div className="tech-border bg-black flex flex-col h-full relative">
        <div className="absolute -top-3 left-4 bg-black px-2 text-neon-yellow text-xs font-bold tracking-widest border-l border-r border-neon-yellow">
          CHAT_LOG
        </div>
        <div className="absolute top-3 right-3 cursor-pointer text-gray-600 hover:text-red-500 transition-colors" onClick={onLeave}>
          <span className="text-xs uppercase">[CLOSE_CHANNEL]</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 font-mono text-sm space-y-2 scrollbar-thin scrollbar-thumb-neon-yellow scrollbar-track-gray-900 mt-6">
          {messages.map((msg) => (
            <div key={msg.id} className={`${msg.system ? 'text-neon-yellow italic opacity-70 text-xs' : 'text-gray-300'} border-l-2 ${msg.userId === user.id ? 'border-neon-blue' : 'border-transparent'} pl-2`}>
              {!msg.system && (
                <div className="text-[10px] text-gray-600 mb-0.5">{new Date(msg.timestamp).toLocaleTimeString()}</div>
              )}
              <div className="break-words leading-tight">
                {!msg.system && (
                  <span className="text-neon-blue font-bold mr-2 text-xs">
                    {msg.userId === user.id ? 'YOU' : msg.userId.substring(0,6)}:
                  </span>
                )}
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-800 flex gap-2 bg-gray-900/30">
          <input 
            type="text" 
            className="flex-1 bg-black border border-gray-700 p-3 text-white focus:outline-none focus:border-neon-yellow text-xs font-mono tracking-wider placeholder-gray-700"
            placeholder="TRANSMIT_MESSAGE..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <button 
            type="submit"
            className="btn-retro px-4 py-2 text-xs font-bold"
          >
            SEND
          </button>
        </form>
      </div>
    </div>
  );
};
