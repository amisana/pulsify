import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Room, User, Message, SocketEvents, WebRTCMessage } from '../types';
import { Socket } from 'socket.io-client';

interface RoomViewProps {
  socket: Socket;
  room: Room;
  user: User;
  onLeave: () => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }, // Public STUN server
  ],
};

export const RoomView: React.FC<RoomViewProps> = ({ socket, room, user, onLeave }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // WebRTC Refs
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<{ [userId: string]: RTCPeerConnection }>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  // Chat scroll ref
  const chatEndRef = useRef<HTMLDivElement>(null);

  // --- Scroll to bottom of chat ---
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

    return () => {
      socket.off(SocketEvents.NEW_MESSAGE);
      socket.off(SocketEvents.USER_LEFT);
      socket.off(SocketEvents.HOST_START_STREAM);
    };
  }, [socket, user.isHost, room.id]);

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
      source.loop = true; // Loop for now
      sourceNodeRef.current = source;

      // Create destination for WebRTC
      const destination = audioContext.createMediaStreamDestination();
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

  // --- HOST Logic: Screen/Mic Streaming ---
  const startStream = async () => {
    try {
      setError(null);
      
      // Check browser support
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      const isChrome = /chrome/i.test(navigator.userAgent) && !/edge/i.test(navigator.userAgent);
      const isEdge = /edge/i.test(navigator.userAgent);
      const isFirefox = /firefox/i.test(navigator.userAgent);
      
      // Check if we're on HTTPS (required for mediaDevices)
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
      
      // Safari has limited support for getDisplayMedia with audio
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
          return; // User cancelled
        }
      }

      // For audio sharing in browsers, we generally need getDisplayMedia for system audio
      // or getUserMedia for microphone. 
      // To share system audio reliably, 'getDisplayMedia' is often used with video, ignoring the video track.
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, // Required to trigger the "Share Audio" checkbox in Chrome modal
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      });

      // Stop video tracks immediately (we only need audio)
      stream.getVideoTracks().forEach(track => track.stop());

      // We only care about the audio track for dAUXimity
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        // User might have cancelled or didn't check "Share tab audio"
        // Offer fallback to microphone
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

      // If user stops sharing via browser UI
      audioTrack.onended = () => {
        stopStream();
      };

      // Create a stream with just audio to send
      const audioStream = new MediaStream([audioTrack]);
      localStreamRef.current = audioStream;
      setIsStreaming(true);

      // Notify waiting listeners that we are ready
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
    // Close all peer connections
    Object.values(peersRef.current).forEach(pc => (pc as RTCPeerConnection).close());
    peersRef.current = {};
    setIsStreaming(false);
  };

  // --- WebRTC Signaling Handling ---

  const createPeerConnection = useCallback((targetUserId: string, stream?: MediaStream) => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    
    // ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit(SocketEvents.WEBRTC_SIGNAL, {
          type: 'candidate',
          payload: event.candidate,
          targetUserId
        });
      }
    };

    // If we are Host, add tracks
    if (stream) {
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
    }

    // If we are Listener, handle incoming track
    pc.ontrack = (event) => {
      if (audioRef.current) {
        audioRef.current.srcObject = event.streams[0];
        // Autoplay requires interaction usually, but since user joined room, it might work
        audioRef.current.play().catch(e => console.error("Autoplay blocked", e));
        setIsStreaming(true); // Visually indicate stream active
      }
    };

    peersRef.current[targetUserId] = pc;
    return pc;
  }, [socket]);

  useEffect(() => {
    // HOST: Handle new user joining
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

    // CLIENT/HOST: Handle incoming signals
    const handleSignal = async ({ type, payload, senderId }: { type: string, payload: any, senderId: string }) => {
      // If we don't have a PC for this sender yet (Client side mostly), create one
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
    
    // Handle listener requesting connection (e.g. after host start stream signal)
    socket.on(SocketEvents.LISTENER_REQUEST_CONNECTION, ({ listenerId }: { listenerId: string }) => {
       console.log(`Listener ${listenerId} requested connection`);
       handleUserJoined({ userId: listenerId });
    });

    return () => {
      socket.off(SocketEvents.USER_JOINED);
      socket.off(SocketEvents.WEBRTC_SIGNAL);
      socket.off(SocketEvents.LISTENER_REQUEST_CONNECTION);
    };
  }, [socket, user.isHost, createPeerConnection]);

  // --- Cleanup on unmount ---
  useEffect(() => {
    return () => {
      stopStream();
    };
  }, []);

  // --- Chat ---
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    socket.emit(SocketEvents.SEND_MESSAGE, { roomId: room.id, text: inputText });
    setInputText('');
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
      {/* --- Left Panel: Room Info & Stream Controls --- */}
      <div className="md:col-span-2 flex flex-col gap-4 h-full">
        <div className="industrial-panel p-8 relative flex-1 flex flex-col justify-center items-center border border-gray-800 bg-black/80 backdrop-blur-sm">
          {/* Technical Overlay Graphics */}
          <div className="absolute top-4 left-4 right-4 flex justify-between text-[10px] font-mono text-gray-600 uppercase tracking-widest pointer-events-none">
             <span>PROTOCOL: {room.name}</span>
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

          
          {/* Visualizer / Status */}
          <div className="flex flex-col items-center gap-8 z-10">
            {isStreaming ? (
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
                 {/* Muted SVG */}
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
              <h2 className={`text-3xl font-bold mb-2 tracking-tighter ${isStreaming ? 'text-neon-green glitch-text' : 'text-gray-500'}`}>
                {isStreaming ? 'TRANSMISSION ACTIVE' : 'WAITING FOR HOST...'}
              </h2>
              <p className="text-gray-400 text-sm uppercase tracking-widest">
                {user.isHost 
                  ? ">> INITIATE UPLINK SEQUENCE <<" 
                  : ">> AWAITING SIGNAL LOCK <<"}
              </p>
            </div>

            {user.isHost && (
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
                 <button 
                   onClick={stopStream}
                   className="btn-retro px-8 py-4 border-red-500 text-red-500 hover:bg-red-500 hover:text-black font-bold text-xl tracking-widest hover:shadow-[0_0_30px_#ff0000]"
                 >
                   TERMINATE UPLINK
                 </button>
               )
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
          {!user.isHost && isStreaming && (
             <div className="absolute bottom-8 right-8">
               <button 
                 onClick={() => {
                   setIsMuted(!isMuted);
                   if(audioRef.current) audioRef.current.muted = !isMuted;
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