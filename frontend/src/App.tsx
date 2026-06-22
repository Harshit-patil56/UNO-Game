import { useState, useMemo, useEffect } from 'react';
import { Users, Cpu, ArrowLeft, Crown, Copy, Check, UserMinus } from 'lucide-react';
import { createAvatar } from '@dicebear/core';
import { adventurer } from '@dicebear/collection';
import { io } from 'socket.io-client';
import { BACKEND_URL } from './config';

const socket = io(BACKEND_URL, {
  autoConnect: false,
  transports: ['websocket']
});

function App() {
  const [view, setView] = useState<'main' | 'friends' | 'computer' | 'lobby' | 'game'>(() => {
    try {
      // If a reconnect token exists, go to friends to reconnect.
      const token = localStorage.getItem('uno_reconnect_token');
      if (token) return 'friends';
      // If a room code is in the URL, take them directly to the join screen.
      const urlRoom = new URLSearchParams(window.location.search).get('room');
      if (urlRoom && urlRoom.length === 6) return 'friends';
    } catch (_) {}
    return 'main';
  });
  const [playerName, setPlayerName] = useState(() => {
    try {
      return localStorage.getItem('uno_player_name') || '';
    } catch (e) {
      return '';
    }
  });
  const [debouncedName, setDebouncedName] = useState(() => {
    try {
      return localStorage.getItem('uno_player_name') || '';
    } catch (e) {
      return '';
    }
  });
  const [roomId, setRoomId] = useState(() => {
    // Pre-fill room ID from URL parameter ?room=XXXXXX
    try {
      const urlRoom = new URLSearchParams(window.location.search).get('room');
      if (urlRoom && urlRoom.length === 6) return urlRoom.toUpperCase();
    } catch (_) {}
    return '';
  });
  const [avatarOffset, setAvatarOffset] = useState<number>(() => {
    try {
      const val = localStorage.getItem('uno_avatar_offset');
      return val ? parseInt(val, 10) : 0;
    } catch (e) {
      return 0;
    }
  });
  const [gameMode, setGameMode] = useState<'classic' | 'flip'>(() => {
    try {
      const val = localStorage.getItem('uno_game_mode');
      return (val === 'classic' || val === 'flip') ? val : 'classic';
    } catch (e) {
      return 'classic';
    }
  });
  const [room, setRoom] = useState<any>(null);
  const [myPlayerId, setMyPlayerId] = useState<string>(() => {
    try {
      return localStorage.getItem('uno_my_player_id') || '';
    } catch (_) {
      return '';
    }
  });
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isRuleBookOpen, setIsRuleBookOpen] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [roomError, setRoomError] = useState(false);
  const [shakeTrigger, setShakeTrigger] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const handleHostGame = () => {
    if (!playerName.trim()) {
      setNameError(true);
      setShakeTrigger(prev => prev + 1);
      return;
    }
    // Clear any stale session token so tryReconnect doesn't hijack this connection
    try { localStorage.removeItem('uno_reconnect_token'); } catch (_) {}

    setIsLoading(true);
    const seed = `${playerName.trim()}-${avatarOffset}`;
    const doCreate = () => {
      console.log('Emitting create_room for player:', playerName.trim());
      socket.emit('create_room', {
        playerName: playerName.trim(),
        gameMode,
        avatarSeed: seed
      });
      setRoomId('');
    };

    if (socket.connected) {
      doCreate();
    } else {
      socket.disconnect();
      socket.once('connect', doCreate);
      socket.connect();
    }
  };

  const handleJoinGame = () => {
    if (!playerName.trim()) {
      setNameError(true);
      setShakeTrigger(prev => prev + 1);
      return;
    }
    if (!roomId.trim() || roomId.trim().length !== 6) {
      setRoomError(true);
      setShakeTrigger(prev => prev + 1);
      return;
    }
    // Clear any stale session token so tryReconnect doesn't hijack this connection
    try { localStorage.removeItem('uno_reconnect_token'); } catch (_) {}

    setIsLoading(true);
    const seed = `${playerName.trim()}-${avatarOffset}`;
    const doJoin = () => {
      console.log('Emitting join_room for player:', playerName.trim(), 'room:', roomId.trim().toUpperCase());
      socket.emit('join_room', {
        roomId: roomId.trim().toUpperCase(),
        playerName: playerName.trim(),
        avatarSeed: seed
      });
    };

    if (socket.connected) {
      doJoin();
    } else {
      socket.disconnect();
      socket.once('connect', doJoin);
      socket.connect();
    }
  };

  const handleLeaveLobby = () => {
    socket.disconnect();
    setRoom(null);
    try {
      localStorage.removeItem('uno_reconnect_token');
      localStorage.removeItem('uno_my_player_id');
    } catch (_) {}
    setView('main');
  };

  const handleToggleReady = () => {
    if (room?.roomId) {
      socket.emit('ready_toggle', { roomId: room.roomId });
    }
  };

  const handleStartGame = () => {
    if (!room?.roomId) return;
    if (room.players.length < 2) {
      alert('Need at least 2 players to start the game.');
      return;
    }
    const notReady = room.players.find((p: any) => p.id !== room.hostId && !p.isReady);
    if (notReady) {
      alert(`Waiting for all players to ready up (e.g., ${notReady.name} is not ready).`);
      return;
    }
    socket.emit('start_game', { roomId: room.roomId });
  };

  const copyRoomId = () => {
    if (room?.roomId) {
      navigator.clipboard.writeText(room.roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyInviteLink = () => {
    if (room?.roomId) {
      const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${room.roomId}`;
      navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleNextAvatar = () => {
    setAvatarOffset(prev => prev + 1);
  };

  const handleKickPlayer = (targetPlayerId: string) => {
    if (room?.roomId) {
      socket.emit('kick_player', { roomId: room.roomId, targetPlayerId });
    }
  };

  // Debounce player name changes for avatar generation (500ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedName(playerName);
    }, 500);

    return () => clearTimeout(timer);
  }, [playerName]);

  // Persist name, avatarOffset, and gameMode to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('uno_player_name', playerName);
    } catch (e) {
      console.warn('Failed to save player name to localStorage:', e);
    }
  }, [playerName]);

  useEffect(() => {
    try {
      localStorage.setItem('uno_avatar_offset', avatarOffset.toString());
    } catch (e) {
      console.warn('Failed to save avatar offset to localStorage:', e);
    }
  }, [avatarOffset]);

  useEffect(() => {
    try {
      localStorage.setItem('uno_game_mode', gameMode);
    } catch (e) {
      console.warn('Failed to save game mode to localStorage:', e);
    }
  }, [gameMode]);

  // Persist myPlayerId so the lobby knows who 'you' are after a page reload
  useEffect(() => {
    try {
      if (myPlayerId) {
        localStorage.setItem('uno_my_player_id', myPlayerId);
      }
    } catch (e) {
      console.warn('Failed to save myPlayerId to localStorage:', e);
    }
  }, [myPlayerId]);

  // Fetch room details and switch gameMode automatically when entering Room ID
  useEffect(() => {
    if (roomId.length === 6) {
      fetch(`${BACKEND_URL}/rooms/${roomId}`)
        .then(res => {
          if (!res.ok) throw new Error('Room not found');
          return res.json();
        })
        .then(data => {
          if (data && data.gameMode) {
            setGameMode(data.gameMode);
            console.log(`Auto-switched game mode to: ${data.gameMode}`);
          }
        })
        .catch(err => {
          console.warn('Failed to fetch room mode:', err.message);
        });
    }
  }, [roomId]);

  // Auto-join via URL invite link (?room=XXXXXX)
  // If the URL has a room param and the player already has a saved name, join automatically.
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlRoom = urlParams.get('room');
      if (urlRoom && urlRoom.length === 6) {
        // Clean up the URL so it's not bookmarked/shared accidentally
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);

        // If the player already has a name saved, auto-join after a brief tick
        const savedName = localStorage.getItem('uno_player_name')?.trim();
        if (savedName) {
          const timer = setTimeout(() => {
            // Trigger join — roomId is already pre-filled from the URL init
            setView('friends');
          }, 300);
          return () => clearTimeout(timer);
        }
        // No saved name — just land them on friends page with room pre-filled
        setView('friends');
      }
    } catch (_) {}
  }, []);

  // Socket.IO listeners
  useEffect(() => {
    console.log('Registering socket event listeners');
    
    const tryReconnect = () => {
      let token = '';
      try {
        token = localStorage.getItem('uno_reconnect_token') || '';
      } catch (e) {
        console.warn('Failed to read reconnect token from localStorage:', e);
      }
      if (token) {
        console.log('Attempting player reconnect with token:', token);
        socket.emit('reconnect_player', { reconnectToken: token });
      }
    };

    socket.on('connect', () => {
      console.log('Socket connected successfully! ID:', socket.id);
      tryReconnect();
    });

    // Track connect_error retries — auto-refresh if server is unreachable after 3 attempts
    let connectErrorCount = 0;
    socket.on('connect_error', (err) => {
      console.error('Socket connection error occurred:', err);
      connectErrorCount++;
      if (connectErrorCount >= 3) {
        console.warn('Server unreachable after 3 attempts. Reloading page...');
        window.location.reload();
      }
    });

    // Reset error counter on successful connect
    socket.on('connect', () => {
      connectErrorCount = 0;
    });

    socket.on('room_created', (data) => {
      console.log('Socket room_created received. Payload:', data);
      setIsLoading(false);
      if (data && data.player) {
        setMyPlayerId(data.player.id);
        try { localStorage.setItem('uno_my_player_id', data.player.id); } catch (_) {}
      }
      try {
        localStorage.setItem('uno_reconnect_token', data.reconnectToken);
      } catch (e) {
        console.warn('Failed to save reconnect token to localStorage:', e);
      }
      setRoom(data.room);
      setView('lobby');
    });

    socket.on('room_joined', (data) => {
      console.log('Socket room_joined received. Payload:', data);
      setIsLoading(false);
      if (data && data.player) {
        setMyPlayerId(data.player.id);
        try { localStorage.setItem('uno_my_player_id', data.player.id); } catch (_) {}
      }
      try {
        localStorage.setItem('uno_reconnect_token', data.reconnectToken);
      } catch (e) {
        console.warn('Failed to save reconnect token to localStorage:', e);
      }
      setRoom(data.room);
      setView('lobby');
    });

    socket.on('room_updated', (updatedRoom) => {
      console.log('Socket room_updated received. Payload:', updatedRoom);
      setRoom(updatedRoom);
      if (updatedRoom && updatedRoom.gameMode) {
        setGameMode(updatedRoom.gameMode);
      }
    });

    socket.on('game_state_updated', (updatedRoom) => {
      console.log('Socket game_state_updated received. Payload:', updatedRoom);
      setRoom(updatedRoom);
      if (updatedRoom && updatedRoom.gameStarted) {
        setView('game');
      }
    });

    socket.on('game_started', () => {
      console.log('Socket game_started received');
      setView('game');
    });

    socket.on('error', (err: any) => {
      console.error('Socket error event received:', err);
      setIsLoading(false);
      alert(err.message || 'An error occurred');
    });

    socket.on('reconnect_success', (data) => {
      console.log('Socket reconnect_success received. Payload:', data);
      if (data && data.player) {
        setMyPlayerId(data.player.id);
      }
      setRoom(data.room);
      setView(data.room?.gameStarted ? 'game' : 'lobby');
    });

    socket.on('reconnect_failed', (data) => {
      console.warn('Socket reconnect_failed received. Payload:', data);
      try {
        localStorage.removeItem('uno_reconnect_token');
        localStorage.removeItem('uno_my_player_id');
      } catch (_) {}
      socket.disconnect();
      setRoom(null);
      setMyPlayerId('');
      setView('friends');
      alert(data.message || 'Session expired or room no longer exists');
    });

    socket.on('kicked', (data) => {
      console.warn('Player was kicked from room:', data);
      try {
        localStorage.removeItem('uno_reconnect_token');
        localStorage.removeItem('uno_my_player_id');
      } catch (_) {}
      socket.disconnect();
      setRoom(null);
      setMyPlayerId('');
      setView('friends');
      alert(data.message || 'You have been kicked by the host');
    });

    // Check for reconnection token on mount
    if (socket.connected) {
      tryReconnect();
    } else {
      let token = '';
      try {
        token = localStorage.getItem('uno_reconnect_token') || '';
      } catch (e) {
        console.warn('Failed to read reconnect token from localStorage:', e);
      }
      if (token) {
        console.log('Found reconnect token on mount, attempting auto-reconnect:', token);
        socket.connect();
      }
    }

    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('room_created');
      socket.off('room_joined');
      socket.off('room_updated');
      socket.off('game_state_updated');
      socket.off('game_started');
      socket.off('error');
      socket.off('reconnect_success');
      socket.off('reconnect_failed');
      socket.off('kicked');
    };
  }, []);

  // Generate local SVG data URI instantly using the client-side library
  const avatarDataUri = useMemo(() => {
    try {
      const avatar = createAvatar(adventurer, {
        seed: `${debouncedName || 'Felix'}-${avatarOffset}`,
        backgroundColor: ['cc3333', '0956bf', '379711', '8338ec']
      });
      return avatar.toDataUri();
    } catch (e) {
      console.error('Dicebear generation failed, falling back to static URI:', e);
      return '';
    }
  }, [debouncedName, avatarOffset]);

  if (view === 'friends') {
    return (
      <div className="h-screen overflow-hidden bg-neutral-bg text-neutral-text flex flex-col items-center pt-16 pb-6 px-6 font-sans">
        <div className="max-w-md w-full my-auto">
          {/* Panel with 20px radius in matching brutalist style */}
          <div className="relative bg-neutral-card border-3 border-[#0f172a] rounded-[20px] pt-10 pb-6 px-8 shadow-[8px_8px_0_#0f172a] flex flex-col items-center w-full">
            
            {/* Pill Header sitting on the top border, changes color ONLY on direct hover */}
            <div className="absolute left-6 -top-5.5 bg-brand-red hover:bg-brand-blue border-2 border-[#0f172a] px-5 py-2.5 rounded-[8px] shadow-[2px_2px_0_#0f172a] transition-all duration-180 ease-out cursor-pointer">
              <h2 className="text-white font-black text-xs tracking-wider uppercase select-none">
                Play with Friends
              </h2>
            </div>

            {/* Back Button integrated symmetrically on the top-right border */}
            <button
              onClick={() => {
                setNameError(false);
                setRoomError(false);
                setView('main');
              }}
              title="Back to Main Menu"
              className="absolute right-6 -top-5.5 bg-neutral-card hover:bg-brand-red hover:text-white text-[#0f172a] border-2 border-[#0f172a] px-3.5 py-2.5 rounded-[8px] shadow-[2px_2px_0_#0f172a] transition-all duration-180 ease-in-out cursor-pointer flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="font-bold text-xs tracking-wider uppercase select-none">Back</span>
            </button>

            {/* Dynamic Avatar Container with Floating Swap Button - shifted up */}
            <div className="mb-6 flex flex-col items-center mt-1">
              <div className="relative">
                {/* The avatar circle */}
                <div className="w-20 h-20 bg-neutral-bg border-3 border-[#0f172a] rounded-full shadow-[4px_4px_0_#0f172a] overflow-hidden flex items-center justify-center transition-all duration-300">
                  {avatarDataUri && (
                    <img
                      src={avatarDataUri}
                      alt="Player Avatar"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                
                {/* Floating Avatar Swap Button: 32px size, 2px border, 2px shadow */}
                <button
                  onClick={handleNextAvatar}
                  title="Cycle Avatar Style"
                  className="absolute -bottom-1 -right-1 w-8 h-8 bg-brand-yellow hover:bg-[#d8c206] active:scale-90 border-2 border-[#0f172a] rounded-full shadow-[2px_2px_0_#0f172a] flex items-center justify-center cursor-pointer transition-all duration-150"
                >
                  <Users className="w-4 h-4 text-[#0f172a]" />
                </button>
              </div>
            </div>
            
            <div key={`name-${shakeTrigger}`} className={`brutalist-container w-full ${nameError ? 'animate-brutal-shake' : ''}`}>
              <input
                placeholder="ENTER YOUR NAME"
                className={`brutalist-input ${nameError ? 'brutalist-input-error' : ''}`}
                type="text"
                value={playerName}
                onChange={(e) => {
                  setPlayerName(e.target.value);
                  if (e.target.value.trim()) {
                    setNameError(false);
                  }
                }}
              />
              <label className="brutalist-label">
                {nameError ? 'Name is Required!' : 'Player Name'}
              </label>
            </div>

            {/* Room ID Input */}
            <div key={`room-${shakeTrigger}`} className={`brutalist-container w-full ${roomError ? 'animate-brutal-shake' : ''}`}>
              <input
                placeholder="ENTER ROOM CODE"
                className={`brutalist-input ${roomError ? 'brutalist-input-error' : ''}`}
                type="text"
                value={roomId}
                maxLength={6}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase();
                  setRoomId(val);
                  if (val.trim().length === 6) {
                    setRoomError(false);
                  }
                }}
              />
              <label className="brutalist-label">
                {roomError ? 'Invalid Room ID!' : 'Room ID'}
              </label>
            </div>

            {/* Game Mode Switcher (Host only chooses this) */}
            <div className="flex flex-col items-center w-full max-w-[256px] mt-2 mb-4">
              <div className="flex w-full bg-neutral-card border-2 border-[#0f172a] rounded-[14px] p-0.5 shadow-[2px_2px_0_#0f172a] overflow-hidden">
                <button
                  onClick={() => setGameMode('classic')}
                  className={`flex-1 py-1.5 text-[10px] font-black tracking-wider uppercase rounded-[10px] transition-all duration-150 cursor-pointer ${
                    gameMode === 'classic'
                      ? 'bg-brand-red text-white border-2 border-[#0f172a] shadow-[1px_1px_0_#0f172a]'
                      : 'text-[#0f172a] hover:bg-neutral-bg'
                  }`}
                >
                  Classic
                </button>
                <button
                  onClick={() => setGameMode('flip')}
                  className={`flex-1 py-1.5 text-[10px] font-black tracking-wider uppercase rounded-[10px] transition-all duration-150 cursor-pointer ${
                    gameMode === 'flip'
                      ? 'bg-brand-yellow text-[#0f172a] border-2 border-[#0f172a] shadow-[1px_1px_0_#0f172a]'
                      : 'text-[#0f172a] hover:bg-neutral-bg'
                  }`}
                >
                  Flip
                </button>
              </div>
            </div>

            {/* 3D Join Game Button - UNO Blue */}
            <button
              onClick={handleJoinGame}
              disabled={isLoading}
              className={`btn-3d w-[256px] mt-3 ${isLoading ? 'opacity-75 cursor-not-allowed' : ''}`}
            >
              <span className="btn-3d-shadow" />
              <span className="btn-3d-edge btn-3d-edge-blue" />
              <div className="btn-3d-front btn-3d-front-blue flex items-center justify-center relative w-full px-12 gap-2">
                {isLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span className="font-semibold select-none">Connecting...</span>
                  </>
                ) : (
                  <span className="font-semibold select-none">Join Game</span>
                )}
              </div>
            </button>

            {/* OR Divider matching the reference image layout */}
            <div className="relative w-full flex items-center justify-center mt-4 mb-6">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t-2 border-[#0f172a]"></div>
              </div>
              <div className="relative bg-brand-red border-2 border-[#0f172a] px-4 py-1.5 rounded-[6px] shadow-[2px_2px_0_rgba(15,23,42,0.15)]">
                <span className="text-white font-black text-xs tracking-wider uppercase select-none">
                  OR
                </span>
              </div>
            </div>

            {/* 3D Host Game Button - Mattel Red */}
            <button
              onClick={handleHostGame}
              disabled={isLoading}
              className={`btn-3d w-[256px] ${isLoading ? 'opacity-75 cursor-not-allowed' : ''}`}
            >
              <span className="btn-3d-shadow" />
              <span className="btn-3d-edge btn-3d-edge-red" />
              <div className="btn-3d-front btn-3d-front-red flex items-center justify-center relative w-full px-12 gap-2">
                {isLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span className="font-semibold select-none">Connecting...</span>
                  </>
                ) : (
                  <span className="font-semibold select-none">Host Game</span>
                )}
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'lobby' && room) {
    const isHost = myPlayerId === room.hostId;
    const canStart = room.players.length >= 2 && room.players.every((p: any) => p.id === room.hostId || p.isReady);

    return (
      <div className="h-screen overflow-hidden bg-neutral-bg text-neutral-text flex flex-col items-center pt-16 pb-6 px-6 font-sans">
        <div className="max-w-md w-full my-auto">
          {/* Panel with 20px radius in matching brutalist style */}
          <div className="relative bg-neutral-card border-3 border-[#0f172a] rounded-[20px] pt-12 pb-6 px-8 shadow-[8px_8px_0_#0f172a] flex flex-col items-center w-full">
            
            {/* Dynamic Pill Header based on Game Mode */}
            <div className="absolute left-6 -top-5.5 bg-brand-red border-2 border-[#0f172a] px-5 py-2.5 rounded-[8px] shadow-[2px_2px_0_#0f172a]">
              <h2 className="text-white font-black text-xs tracking-wider uppercase select-none">
                {room.gameMode === 'flip' ? 'UNO FLIP' : 'UNO CLASSIC'}
              </h2>
            </div>

            {/* Leave Room Button integrated symmetrically on the top-right border */}
            <button
              onClick={handleLeaveLobby}
              title="Leave Room"
              className="absolute right-6 -top-5.5 bg-neutral-card hover:bg-brand-red hover:text-white text-[#0f172a] border-2 border-[#0f172a] px-3.5 py-2.5 rounded-[8px] shadow-[2px_2px_0_#0f172a] transition-all duration-180 ease-in-out cursor-pointer flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="font-bold text-xs tracking-wider uppercase select-none">Leave</span>
            </button>

            {/* Generated Room ID Box with Copy Buttons */}
            <div className="relative w-full max-w-[280px] mx-auto mt-4 mb-5">
              <div className="bg-neutral-bg border-3 border-[#0f172a] rounded-[12px] py-3 px-4 shadow-[4px_4px_0_#0f172a] flex flex-col items-center gap-3">
                <span className="font-black text-2xl tracking-wider text-[#0f172a] select-all">
                  {room.roomId}
                </span>
                <div className="flex gap-2 w-full justify-center">
                  <button
                    onClick={copyRoomId}
                    className="flex-1 py-1.5 px-2 border-2 border-[#0f172a] rounded-lg bg-white hover:bg-neutral-bg active:scale-95 transition-all shadow-[2px_2px_0_#0f172a] cursor-pointer flex items-center justify-center gap-1 text-[9px] font-black uppercase"
                    title="Copy Room Code"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-brand-green" />
                        <span className="text-[#0f172a]">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-[#0f172a]" />
                        <span className="text-[#0f172a]">Code</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={copyInviteLink}
                    className="flex-1 py-1.5 px-2 border-2 border-[#0f172a] rounded-lg bg-white hover:bg-neutral-bg active:scale-95 transition-all shadow-[2px_2px_0_#0f172a] cursor-pointer flex items-center justify-center gap-1 text-[9px] font-black uppercase"
                    title="Copy Invite Link"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-3 h-3 text-brand-green" />
                        <span className="text-[#0f172a]">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-[#0f172a]" />
                        <span className="text-[#0f172a]">Link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
              <div className="text-[9px] font-black text-neutral-muted mt-2 text-center uppercase tracking-wider">
                Share this room code or link with friends
              </div>
            </div>

            {/* Players List in Lobby */}
            <div className="w-full bg-neutral-bg border-2 border-[#0f172a] rounded-[16px] p-4 shadow-[3px_3px_0_#0f172a] mb-5 flex flex-col max-h-[200px] overflow-y-auto no-scrollbar">
              <div className="text-[10px] font-black text-neutral-text uppercase tracking-widest border-b-2 border-[#0f172a] pb-1.5 mb-2.5 text-left">
                Lobby Players ({room.players?.length || 0})
              </div>
              <div className="flex flex-col gap-2">
                {room.players?.map((player: any) => {
                  const avatarUri = createAvatar(adventurer, {
                    seed: player.avatarSeed || player.name,
                    backgroundColor: ['cc3333', '0956bf', '379711', '8338ec']
                  }).toDataUri();

                  const isPlayerHost = player.id === room.hostId;
                  const isSelf = player.id === myPlayerId;

                  return (
                    <div
                      key={player.id}
                      className={`flex items-center justify-between border-2 border-[#0f172a] rounded-[10px] p-2 shadow-[1.5px_1.5px_0_#0f172a] ${
                        isSelf ? 'bg-white' : 'bg-neutral-card'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full border border-[#0f172a] overflow-hidden flex items-center justify-center bg-neutral-bg">
                          <img src={avatarUri} alt={player.name} className="w-full h-full object-cover" />
                        </div>
                        {/* Player name */}
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-[#0f172a] truncate max-w-[120px]">
                            {player.name}
                          </span>
                          {isSelf && (
                            <span className="text-[8px] font-black bg-brand-blue text-white px-1 py-0.2 rounded border border-[#0f172a] uppercase">
                              You
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Crown icon / Status & Kick Button */}
                      <div className="flex items-center gap-1.5">
                        {isPlayerHost ? (
                          <Crown
                            className="w-4 h-4"
                            style={{ color: '#ecd407', fill: '#ecd407' }}
                          />
                        ) : (
                          <>
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border border-[#0f172a] uppercase ${
                                player.isReady
                                  ? 'bg-brand-green text-white'
                                  : 'bg-neutral-bg text-[#0f172a]'
                            }`}>
                              {player.isReady ? 'Ready' : 'Lobby'}
                            </span>
                            {isHost && (
                              <button
                                onClick={() => handleKickPlayer(player.id)}
                                className="p-1 border-2 border-[#0f172a] rounded bg-brand-red text-white hover:bg-red-700 active:scale-90 transition-all shadow-[1px_1px_0_#0f172a] cursor-pointer flex items-center justify-center"
                                title={`Kick ${player.name}`}
                              >
                                <UserMinus className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action Buttons: Start Game (Host only) or Ready (Guest only) + Rule Book */}
            <div className="w-full max-w-[256px] flex flex-col gap-4">
              {isHost ? (
                <button
                  onClick={handleStartGame}
                  className="btn-3d w-full"
                >
                  <span className="btn-3d-shadow" />
                  <span className={`btn-3d-edge ${canStart ? 'btn-3d-edge-red' : 'bg-neutral-muted'}`} />
                  <div className={`btn-3d-front ${canStart ? 'btn-3d-front-red' : 'bg-neutral-border text-neutral-muted border-2 border-[#0f172a]'} flex items-center justify-center relative w-full px-12`}>
                    <span className="font-bold select-none uppercase tracking-wider text-xs">Start Game</span>
                  </div>
                </button>
              ) : (
                <button
                  onClick={handleToggleReady}
                  className="btn-3d w-full"
                >
                  <span className="btn-3d-shadow" />
                  <span className="btn-3d-edge btn-3d-edge-blue" />
                  <div className="btn-3d-front btn-3d-front-blue flex items-center justify-center relative w-full px-12">
                    <span className="font-bold select-none uppercase tracking-wider text-xs">
                      {room.players.find((p: any) => p.id === myPlayerId)?.isReady ? 'Unready' : 'Ready Up'}
                    </span>
                  </div>
                </button>
              )}

              <button
                onClick={() => setIsRuleBookOpen(true)}
                className="btn-3d w-full animate-pulse"
              >
                <span className="btn-3d-shadow" />
                <span className="btn-3d-edge btn-3d-edge-green" />
                <div className="btn-3d-front btn-3d-front-green flex items-center justify-center relative w-full px-12">
                  <span className="font-bold select-none uppercase tracking-wider text-xs">Rule Book</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* English Rule Book Modal */}
        {isRuleBookOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="relative w-full max-w-xl bg-white border-3 border-[#0f172a] rounded-[20px] shadow-[8px_8px_0_#0f172a] flex flex-col max-h-[80vh]">
              {/* Modal Header */}
              <div className="bg-brand-red border-b-3 border-[#0f172a] px-6 py-4 rounded-t-[17px] flex items-center justify-between">
                <h3 className="text-white font-black text-sm sm:text-base tracking-wider uppercase">
                  {room.gameMode === 'flip' ? 'UNO FLIP™ Official Rules' : 'UNO Classic Official Rules'}
                </h3>
                <button
                  onClick={() => setIsRuleBookOpen(false)}
                  className="px-3 py-1.5 border-2 border-[#0f172a] rounded-md bg-white hover:bg-brand-yellow hover:text-[#0f172a] font-black text-[10px] uppercase tracking-wider cursor-pointer shadow-[2px_2px_0_#0f172a] transition-all duration-150 active:scale-95"
                >
                  Close
                </button>
              </div>

              {/* Modal Content */}
              <div className="pl-6 py-6 pr-3 overflow-y-auto custom-scrollbar text-left text-xs text-[#0f172a] font-sans flex-1 space-y-4">
                {room.gameMode === 'flip' ? (
                  <>
                    <div className="border-2 border-[#0f172a] p-3 rounded-lg bg-brand-yellow/10">
                      <span className="font-extrabold uppercase text-[#0f172a] block mb-1">
                        UNO FLIP™ IN A NUTSHELL
                      </span>
                      <p className="leading-relaxed">
                        UNO FLIP™ plays like regular UNO®, except there are two sides to the deck of cards: a <strong>Light Side</strong> (white border) and a <strong>Dark Side</strong> (black border). You start playing with the Light Side, but whenever someone plays a FLIP card, the entire deck is flipped over (as are the cards in your hand) and now everyone must play off of the Dark Side of the cards.
                      </p>
                    </div>

                    <div>
                      <span className="font-extrabold uppercase text-[#0f172a] block border-b-2 border-[#0f172a] pb-1 mb-2">
                        LET'S PLAY
                      </span>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>Match the top card of the discard pile by color, number, or symbol.</li>
                        <li>If you do not have a matching card, draw one card from the draw pile. If playable, you can play it immediately.</li>
                        <li>When adding cards to your hand, ensure they face the same direction as your hand's active side.</li>
                        <li><strong>Yell "UNO"</strong> when you have exactly 1 card remaining in hand!</li>
                      </ul>
                    </div>

                    <div>
                      <span className="font-extrabold uppercase text-[#0f172a] block border-b-2 border-[#0f172a] pb-1 mb-2">
                        LIGHT SIDE ACTIONS (White Border)
                      </span>
                      <ul className="space-y-1.5">
                        <li><strong>Draw One:</strong> Next player draws 1 card and loses their turn.</li>
                        <li><strong>Reverse:</strong> Reverses play direction.</li>
                        <li><strong>Skip:</strong> Skips next player's turn.</li>
                        <li><strong>Wild Card:</strong> Choose the active color that continues play.</li>
                        <li><strong>Wild Draw Two:</strong> Choose color; next player draws 2 cards and loses their turn. Only playable if you have no matching colors.</li>
                        <li><strong>Flip Card:</strong> Flips all cards (hand, draw, discard) to the Dark Side.</li>
                      </ul>
                    </div>

                    <div>
                      <span className="font-extrabold uppercase text-[#0f172a] block border-b-2 border-[#0f172a] pb-1 mb-2">
                        DARK SIDE ACTIONS (Black Border)
                      </span>
                      <ul className="space-y-1.5">
                        <li><strong>Draw Five:</strong> Next player draws 5 cards and loses their turn.</li>
                        <li><strong>Reverse:</strong> Reverses play direction.</li>
                        <li><strong>Skip Everyone:</strong> Skips all players. The player who laid it gets another turn.</li>
                        <li><strong>Wild Card:</strong> Choose the active color that continues play.</li>
                        <li><strong>Wild Draw Color:</strong> Choose color; next player draws until they get the chosen color (regardless of count) and loses their turn.</li>
                        <li><strong>Flip Card:</strong> Flips all cards back to the Light Side.</li>
                      </ul>
                    </div>

                    <div>
                      <span className="font-extrabold uppercase text-[#0f172a] block border-b-2 border-[#0f172a] pb-1 mb-2">
                        SCORING (Based on Ending Side)
                      </span>
                      <div className="grid grid-cols-2 gap-2 font-mono">
                        <div>Number Cards (1-9): Face Value</div>
                        <div>Draw One: 10 pts</div>
                        <div>Draw Five: 20 pts</div>
                        <div>Reverse/Skip/Flip: 20 pts</div>
                        <div>Skip Everyone: 30 pts</div>
                        <div>Wild Card: 40 pts</div>
                        <div>Wild Draw Two: 50 pts</div>
                        <div>Wild Draw Color: 60 pts</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="border-2 border-[#0f172a] p-3 rounded-lg bg-brand-blue/10">
                      <span className="font-extrabold uppercase text-[#0f172a] block mb-1">
                        UNO CLASSIC IN A NUTSHELL
                      </span>
                      <p className="leading-relaxed">
                        UNO Classic is the classic card-matching game. The objective is to be the first player to discard all cards in your hand in each round. Score points based on the cards remaining in your opponents' hands. First player to reach 500 points wins the game.
                      </p>
                    </div>

                    <div>
                      <span className="font-extrabold uppercase text-[#0f172a] block border-b-2 border-[#0f172a] pb-1 mb-2">
                        HOW TO PLAY
                      </span>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>Match the top card of the discard pile by color, number, or action symbol.</li>
                        <li>If you do not have a matching card, draw one card from the draw pile. Play it if possible, otherwise pass.</li>
                        <li><strong>Yell "UNO"</strong> when you have exactly 1 card remaining in hand!</li>
                      </ul>
                    </div>

                    <div>
                      <span className="font-extrabold uppercase text-[#0f172a] block border-b-2 border-[#0f172a] pb-1 mb-2">
                        ACTION CARDS
                      </span>
                      <ul className="space-y-1.5">
                        <li><strong>Draw Two (+2):</strong> Next player draws 2 cards and loses their turn.</li>
                        <li><strong>Reverse:</strong> Reverses play direction.</li>
                        <li><strong>Skip:</strong> Skips next player's turn.</li>
                        <li><strong>Wild Card:</strong> Choose the active color that continues play.</li>
                        <li><strong>Wild Draw Four (+4):</strong> Choose color; next player draws 4 cards and loses their turn. Only playable if you have no matching colors.</li>
                      </ul>
                    </div>

                    <div>
                      <span className="font-extrabold uppercase text-[#0f172a] block border-b-2 border-[#0f172a] pb-1 mb-2">
                        SCORING
                      </span>
                      <div className="grid grid-cols-2 gap-2 font-mono">
                        <div>Number Cards (0-9): Face Value</div>
                        <div>Draw Two / Skip / Reverse: 20 pts</div>
                        <div>Wild / Wild Draw Four: 50 pts</div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === 'game' && room) {
    return (
      <div className="h-screen overflow-hidden bg-neutral-bg text-neutral-text flex flex-col items-center pt-16 pb-6 px-6 font-sans">
        <div className="max-w-md w-full my-auto">
          <div className="relative bg-neutral-card border-3 border-[#0f172a] rounded-[20px] pt-12 pb-8 px-8 shadow-[8px_8px_0_#0f172a] flex flex-col items-center w-full">
            <div className="absolute left-6 -top-5.5 bg-brand-green border-2 border-[#0f172a] px-5 py-2.5 rounded-[8px] shadow-[2px_2px_0_#0f172a]">
              <h2 className="text-white font-black text-xs tracking-wider uppercase select-none">
                Uno Game Session
              </h2>
            </div>
            
            <h3 className="font-black text-xl mb-4 text-[#0f172a] mt-2">GAME STARTED</h3>
            <p className="text-xs text-neutral-muted mb-6 text-center">
              The game has officially begun! Game mode: <strong className="uppercase">{room.gameMode}</strong>.
            </p>

            <button
              onClick={handleLeaveLobby}
              className="btn-3d w-full"
            >
              <span className="btn-3d-shadow" />
              <span className="btn-3d-edge btn-3d-edge-red" />
              <div className="btn-3d-front btn-3d-front-red flex items-center justify-center relative w-full px-12">
                <span className="font-bold select-none uppercase tracking-wider text-xs">Quit Game</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'computer') {
    return (
      <div className="min-h-screen bg-neutral-bg text-neutral-text flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full">
          {/* Panel with 20px radius in matching brutalist style */}
          <div className="relative bg-neutral-card border-3 border-[#0f172a] rounded-[20px] pt-12 pb-8 px-8 shadow-[8px_8px_0_#0f172a] flex flex-col items-center w-full min-h-[200px]">
            
            {/* Pill Header sitting on the top border */}
            <div className="absolute left-6 -top-5.5 bg-brand-red border-2 border-[#0f172a] px-5 py-2.5 rounded-[8px] shadow-[2px_2px_0_#0f172a]">
              <h2 className="text-white font-black text-xs tracking-wider uppercase select-none">
                Play with Computer
              </h2>
            </div>

            {/* Back Button integrated symmetrically on the top-right border */}
            <button
              onClick={() => {
                setNameError(false);
                setView('main');
              }}
              title="Back to Main Menu"
              className="absolute right-6 -top-5.5 bg-neutral-card hover:bg-brand-red hover:text-white text-[#0f172a] border-2 border-[#0f172a] px-3.5 py-2.5 rounded-[8px] shadow-[2px_2px_0_#0f172a] transition-all duration-180 ease-in-out cursor-pointer flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="font-bold text-xs tracking-wider uppercase select-none">Back</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-bg text-neutral-text flex flex-col items-center justify-center p-6 font-sans">
      <div className="max-w-4xl w-full text-center">
        {/* UNO Online Pill Header matching the Play with Friends style */}
        <div className="flex justify-center mb-12">
          <div className="relative bg-brand-red border-2 border-[#0f172a] px-8 py-3.5 rounded-[8px] shadow-[3px_3px_0_rgba(15,23,42,0.15)]">
            <h1 className="text-white font-black text-2xl sm:text-3xl tracking-wider uppercase select-none">
              UNO Online
            </h1>
          </div>
        </div>

        {/* 3D Action Buttons: 32px gap, 14px border radius, 56px height */}
        <div className="flex flex-col sm:flex-row gap-8 justify-center max-w-md sm:max-w-xl mx-auto w-full px-4">
          {/* Play with Friends Button - UNO Blue */}
          <button
            onClick={() => {
              setNameError(false);
              setView('friends');
            }}
            className="btn-3d w-full sm:w-1/2"
          >
            <span className="btn-3d-shadow" />
            <span className="btn-3d-edge btn-3d-edge-blue" />
            <div className="btn-3d-front btn-3d-front-blue flex items-center justify-center relative w-full px-12">
              <Users className="absolute left-6 w-6 h-6 text-white" />
              <span className="font-semibold select-none">Play with Friends</span>
            </div>
          </button>

          {/* Play with Computer Button - UNO Green */}
          <button
            onClick={() => setView('computer')}
            className="btn-3d w-full sm:w-1/2"
          >
            <span className="btn-3d-shadow" />
            <span className="btn-3d-edge btn-3d-edge-green" />
            <div className="btn-3d-front btn-3d-front-green flex items-center justify-center relative w-full px-12">
              <Cpu className="absolute left-6 w-6 h-6 text-white" />
              <span className="font-semibold select-none">Play with Computer</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
