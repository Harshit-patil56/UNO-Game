import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Cpu, ArrowLeft, Crown, Copy, Check, UserMinus, Settings, BookOpen, Volume2, VolumeX, LogOut } from 'lucide-react';
import { createAvatar } from '@dicebear/core';
import { adventurer } from '@dicebear/collection';
import { io } from 'socket.io-client';
import { BACKEND_URL } from './config';
// PixiJS has been ditched in favor of native React + Framer Motion + CSS


const socket = io(BACKEND_URL, {
  autoConnect: false,
  transports: ['websocket']
});

interface UnoCardProps {
  cardId: string;
  isBack?: boolean;
  onClick?: () => void;
  className?: string;
  side?: 'light' | 'dark';
  gameMode?: 'classic' | 'flip';
  disabled?: boolean;
  style?: React.CSSProperties;
}

const getActiveCardFaceFrontend = (cardId: string, side: 'light' | 'dark' = 'light', gameMode: 'classic' | 'flip' = 'classic'): string => {
  if (gameMode === 'classic') return cardId;
  if (!cardId || !cardId.startsWith('FLIP_CARD_')) return cardId;
  const index = parseInt(cardId.split('_')[2], 10);
  if (isNaN(index) || index < 0) return cardId;
  
  const lightColors = ['RED', 'BLUE', 'GREEN', 'YELLOW'];
  const darkColors = ['ORANGE', 'PINK', 'TEAL', 'PURPLE'];
  const mapping: Array<{ light: string, dark: string }> = [];

  for (let c = 0; c < 4; c++) {
    const lc = lightColors[c];
    const dc = darkColors[c];
    for (let val = 1; val <= 9; val++) {
      mapping.push({ light: `${lc}_NUMBER_${val}`, dark: `${dc}_NUMBER_${val}` });
      mapping.push({ light: `${lc}_NUMBER_${val}`, dark: `${dc}_NUMBER_${val}` });
    }
    mapping.push({ light: `${lc}_REVERSE`, dark: `${dc}_REVERSE` });
    mapping.push({ light: `${lc}_REVERSE`, dark: `${dc}_REVERSE` });
    mapping.push({ light: `${lc}_FLIP`, dark: `${dc}_FLIP` });
    mapping.push({ light: `${lc}_FLIP`, dark: `${dc}_FLIP` });
    mapping.push({ light: `${lc}_SKIP`, dark: `${dc}_SKIP_EVERYONE` });
    mapping.push({ light: `${lc}_SKIP`, dark: `${dc}_SKIP_EVERYONE` });
    mapping.push({ light: `${lc}_DRAW_ONE`, dark: `${dc}_DRAW_FIVE` });
    mapping.push({ light: `${lc}_DRAW_ONE`, dark: `${dc}_DRAW_FIVE` });
  }
  for (let i = 0; i < 4; i++) {
    mapping.push({ light: 'WILD', dark: 'WILD' });
  }
  for (let i = 0; i < 4; i++) {
    mapping.push({ light: 'WILD_DRAW_TWO', dark: 'WILD_DRAW_COLOR' });
  }

  if (index >= mapping.length) return cardId;
  return side === 'dark' ? mapping[index].dark : mapping[index].light;
};

const getCardAssetUrl = (cardId: string, side: 'light' | 'dark' = 'light', gameMode: 'classic' | 'flip' = 'classic'): string => {
  if (!cardId) {
    return '/cards/Deck.png';
  }

  const face = getActiveCardFaceFrontend(cardId, side, gameMode);
  
  if (face === 'WILD') {
    return '/cards/Wild.png';
  }
  if (face === 'WILD_DRAW_FOUR') {
    return '/cards/Wild_Draw.png';
  }
  if (face === 'WILD_DRAW_TWO') {
    return '/cards/Wild_Draw.png';
  }
  if (face === 'WILD_DRAW_COLOR') {
    return '/cards/Wild.png';
  }

  const parts = face.split('_');
  if (parts.length < 2) return '/cards/Deck.png';

  let colorRaw = parts[0].toLowerCase();
  if (colorRaw === 'orange') colorRaw = 'red';
  if (colorRaw === 'pink') colorRaw = 'yellow';
  if (colorRaw === 'teal') colorRaw = 'green';
  if (colorRaw === 'purple') colorRaw = 'blue';

  const color = colorRaw.charAt(0).toUpperCase() + colorRaw.slice(1);

  if (parts[1] === 'NUMBER') {
    const val = parts[2];
    return `/cards/${color}_${val}.png`;
  }
  if (parts[1] === 'SKIP') {
    return `/cards/${color}_Skip.png`;
  }
  if (parts[1] === 'REVERSE') {
    return `/cards/${color}_Reverse.png`;
  }
  if (parts[1] === 'DRAW' && parts[2] === 'TWO') {
    return `/cards/${color}_Draw.png`;
  }
  if (parts[1] === 'DRAW' && parts[2] === 'ONE') {
    return `/cards/${color}_Draw.png`;
  }
  if (parts[1] === 'DRAW' && parts[2] === 'FIVE') {
    return `/cards/${color}_Draw.png`;
  }
  if (parts[1] === 'FLIP') {
    return `/cards/${color}_Reverse.png`;
  }
  if (parts[1] === 'SKIP' && parts[2] === 'EVERYONE') {
    return `/cards/${color}_Skip.png`;
  }

  return '/cards/Deck.png';
};

export function UnoCard({ cardId, isBack = false, onClick, className = '', side = 'light', gameMode = 'classic', disabled = false, style }: UnoCardProps) {
  const assetUrl = useMemo(() => {
    if (isBack) return '/cards/Deck.png';
    return getCardAssetUrl(cardId, side, gameMode);
  }, [cardId, isBack, side, gameMode]);

  return (
    <motion.div
      style={style}
      whileHover={disabled ? {} : { scale: 1.08, y: -16, zIndex: 60, transition: { type: 'spring', stiffness: 300, damping: 15 } }}
      onClick={disabled ? undefined : onClick}
      className={`w-24 h-36 rounded-[12px] relative overflow-hidden select-none flex-shrink-0 cursor-pointer transition-shadow duration-200 hover:shadow-[0_10px_25px_-5px_rgba(0,0,0,0.3)] ${className} ${disabled ? 'opacity-85 cursor-not-allowed' : ''}`}
    >
      <img
        src={assetUrl}
        alt={isBack ? 'Card Back' : cardId}
        className="w-full h-full object-contain pointer-events-none"
      />
    </motion.div>
  );
}

interface HandCanvasProps {
  hand: string[];
  side: 'light' | 'dark';
  gameMode: 'classic' | 'flip';
  roomId: string;
  socket: any;
}

function HandCanvas({ hand, side, gameMode, roomId, socket }: HandCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 1024, height: 300 });
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // ResizeObserver to dynamically track layout size
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const isMob = (width || 1024) < 640;
        setDimensions({
          width: width || 1024,
          height: height || (isMob ? 180 : 300),
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Reset selected card index when hand/side/gamemode changes
  useEffect(() => {
    setSelectedCardIndex(null);
  }, [hand, side, gameMode]);

  const handleCardTap = (cardId: string, index: number) => {
    setSelectedCardIndex((prev) => {
      if (prev === index) {
        socket.emit('play_card', { roomId, cardId });
        return null;
      } else {
        return index;
      }
    });
  };

  if (!Array.isArray(hand)) {
    return (
      <div
        ref={containerRef}
        className="w-full max-w-5xl h-[180px] sm:h-[300px] flex items-center justify-center text-xs text-neutral-muted uppercase font-black"
        style={{ touchAction: 'none' }}
      >
        Loading cards...
      </div>
    );
  }

  const count = hand.length;
  const isMobile = dimensions.width < 640;
  
  const targetH = isMobile ? 130 : 220;
  const targetW = targetH * 0.69; // 0.69 aspect ratio

  const spacing = isMobile 
    ? Math.max(25, 45 - count) 
    : Math.max(42, 80 - count);

  const cx = dimensions.width / 2;
  const startX = cx - ((count - 1) * spacing) / 2;

  const baseY = isMobile 
    ? dimensions.height - 5 - targetH / 2 
    : dimensions.height - 10 - targetH / 2;

  const middle = (count - 1) / 2;

  // Generate unique keys for duplicate cardId values to prevent layout jumping
  const counts = new Map<string, number>();
  const cardKeys = hand.map((cardId) => {
    const currentCount = counts.get(cardId) || 0;
    counts.set(cardId, currentCount + 1);
    return `${cardId}__${currentCount}`;
  });

  return (
    <div
      ref={containerRef}
      className="w-full max-w-5xl h-[180px] sm:h-[300px] relative overflow-visible flex items-center justify-center"
      style={{ touchAction: 'none' }}
    >
      <AnimatePresence>
        {hand.map((cardId, i) => {
          const key = cardKeys[i];
          const offset = i - middle;
          const tX = startX + i * spacing;
          const tYBase = baseY + Math.abs(offset) * 4;

          const isSelected = i === selectedCardIndex;
          const isHovered = i === hoveredIndex;

          let targetY = tYBase;
          let targetScale = 1.0;
          let zIndex = isSelected ? 200 + i : i;

          if (isSelected) {
            targetY = tYBase - 35;
          } else if (isHovered) {
            targetY = tYBase - 15;
            targetScale = 1.08;
          }

          const targetRot = offset * 2.0; // rotation in degrees

          // Drop shadow based on select/hover state
          let shadowStyle = "drop-shadow(3.54px 3.54px 4px rgba(0,0,0,0.2))";
          if (isSelected) {
            shadowStyle = "drop-shadow(3.5px 3.5px 3px rgba(0,0,0,0.2))";
          } else if (isHovered) {
            shadowStyle = "drop-shadow(2.5px 2.5px 2px rgba(0,0,0,0.2))";
          }

          const assetUrl = getCardAssetUrl(cardId, side, gameMode);

          return (
            <motion.div
              key={key}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: `${targetW}px`,
                height: `${targetH}px`,
                transformOrigin: 'center center',
                zIndex: zIndex,
                cursor: 'pointer',
                touchAction: 'none',
                filter: shadowStyle,
              }}
              initial={{
                x: cx - targetW / 2,
                y: dimensions.height + 200,
                rotate: 0,
                scale: 0.1,
              }}
              animate={{
                x: tX - targetW / 2,
                y: targetY - targetH / 2,
                rotate: targetRot,
                scale: targetScale,
              }}
              exit={{
                y: dimensions.height + 200,
                opacity: 0,
                scale: 0.1,
                transition: { duration: 0.25 }
              }}
              transition={{
                type: 'spring',
                stiffness: 260,
                damping: 24,
                mass: 0.8
              }}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => {
                setHoveredIndex((prev) => (prev === i ? null : prev));
              }}
              onClick={() => handleCardTap(cardId, i)}
            >
              <img
                src={assetUrl}
                alt={cardId}
                className="w-full h-full object-contain pointer-events-none select-none"
                style={{ imageRendering: 'pixelated' }}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function App() {
  const [view, setView] = useState<'main' | 'friends' | 'computer' | 'lobby' | 'game'>(() => {
    try {
      // If a reconnect token exists, go to friends to reconnect.
      const token = localStorage.getItem('uno_reconnect_token');
      if (token) return 'friends';
      // If a room code is in the URL, take them directly to the join screen.
      const urlRoom = new URLSearchParams(window.location.search).get('room');
      if (urlRoom && urlRoom.length === 6) return 'friends';
    } catch (_) { }
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
    } catch (_) { }
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const handleHostGame = () => {
    if (!playerName.trim()) {
      setNameError(true);
      setShakeTrigger(prev => prev + 1);
      return;
    }
    // Clear any stale session token so tryReconnect doesn't hijack this connection
    try { localStorage.removeItem('uno_reconnect_token'); } catch (_) { }

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
    try { localStorage.removeItem('uno_reconnect_token'); } catch (_) { }

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
    } catch (_) { }
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
    } catch (_) { }
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
        try { localStorage.setItem('uno_my_player_id', data.player.id); } catch (_) { }
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
        try { localStorage.setItem('uno_my_player_id', data.player.id); } catch (_) { }
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
      } catch (_) { }
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
      } catch (_) { }
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

  const [menuAvatars, setMenuAvatars] = useState<string[]>(() => {
    try {
      return [
        createAvatar(adventurer, { seed: 'Harry-init', backgroundColor: ['cc3333'] }).toDataUri(),
        createAvatar(adventurer, { seed: 'Hermione-init', backgroundColor: ['ecd407'] }).toDataUri(),
        createAvatar(adventurer, { seed: 'Ron-init', backgroundColor: ['379711'] }).toDataUri()
      ];
    } catch (_) {
      return [
        'https://i.pravatar.cc/150?img=1',
        'https://i.pravatar.cc/150?img=5',
        'https://i.pravatar.cc/150?img=3'
      ];
    }
  });

  useEffect(() => {
    const maleNames = ['Harry', 'Ron', 'Neville', 'Draco', 'Fred', 'George', 'Albus', 'Severus', 'Rubeus', 'Cedric'];
    const femaleNames = ['Hermione', 'Luna', 'Ginny', 'Cho', 'Lavender', 'Fleur', 'Lily', 'Minerva', 'Bellatrix', 'Nymphadora'];
    const nonBlueBgs = ['cc3333', 'ecd407', '379711', '8338ec', 'e67e22'];

    const cycleAvatars = () => {
      const seed1 = maleNames[Math.floor(Math.random() * maleNames.length)] + '-' + Math.floor(Math.random() * 100);
      const seed2 = femaleNames[Math.floor(Math.random() * femaleNames.length)] + '-' + Math.floor(Math.random() * 100);
      const seed3 = maleNames[Math.floor(Math.random() * maleNames.length)] + '-' + Math.floor(Math.random() * 100);

      const bg1 = nonBlueBgs[Math.floor(Math.random() * nonBlueBgs.length)];
      let bg2 = nonBlueBgs[Math.floor(Math.random() * nonBlueBgs.length)];
      while (bg2 === bg1) {
        bg2 = nonBlueBgs[Math.floor(Math.random() * nonBlueBgs.length)];
      }
      let bg3 = nonBlueBgs[Math.floor(Math.random() * nonBlueBgs.length)];
      while (bg3 === bg1 || bg3 === bg2) {
        bg3 = nonBlueBgs[Math.floor(Math.random() * nonBlueBgs.length)];
      }

      try {
        return [
          createAvatar(adventurer, { seed: seed1, backgroundColor: [bg1] }).toDataUri(),
          createAvatar(adventurer, { seed: seed2, backgroundColor: [bg2] }).toDataUri(),
          createAvatar(adventurer, { seed: seed3, backgroundColor: [bg3] }).toDataUri()
        ];
      } catch (_) {
        return [
          'https://i.pravatar.cc/150?img=' + Math.floor(Math.random() * 10 + 1),
          'https://i.pravatar.cc/150?img=' + Math.floor(Math.random() * 10 + 11),
          'https://i.pravatar.cc/150?img=' + Math.floor(Math.random() * 10 + 21)
        ];
      }
    };

    const interval = setInterval(() => {
      setMenuAvatars(cycleAvatars());
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  if (view === 'friends') {
    return (
      <div className="h-screen overflow-hidden bg-neutral-bg text-neutral-text flex flex-col items-center pt-16 pb-6 px-6 font-sans">
        <div className="max-w-md w-full my-auto">
          {/* Panel with 20px radius in matching brutalist style */}
          <div className="relative bg-neutral-card border-3 border-[#0f172a] rounded-[20px] pt-10 pb-6 px-8 shadow-[8px_8px_0_#0f172a] flex flex-col items-center w-full">

            {/* Pill Header sitting on the top border, changes color ONLY on direct hover */}
            <div className={`absolute left-6 -top-5.5 ${gameMode === 'flip' ? 'bg-brand-flip' : 'bg-brand-red hover:bg-brand-blue'} border-2 border-[#0f172a] px-5 py-2.5 rounded-[8px] shadow-[2px_2px_0_#0f172a] transition-all duration-180 ease-out cursor-pointer`}>
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
                style={{
                  '--input-shadow-color': gameMode === 'flip' ? '#4c1d95' : '#0956bf',
                  '--input-focus-shadow-color': gameMode === 'flip' ? '#8338ec' : '#8338ec',
                } as React.CSSProperties}
                type="text"
                value={playerName}
                onChange={(e) => {
                  setPlayerName(e.target.value);
                  if (e.target.value.trim()) {
                    setNameError(false);
                  }
                }}
              />
              <label className={`brutalist-label ${nameError ? 'bg-[#cc3333]' : gameMode === 'flip' ? 'bg-brand-flip' : 'bg-brand-red'}`}>
                {nameError ? 'Name is Required!' : 'Player Name'}
              </label>
            </div>

            {/* Room ID Input */}
            <div key={`room-${shakeTrigger}`} className={`brutalist-container w-full ${roomError ? 'animate-brutal-shake' : ''}`}>
              <input
                placeholder="ENTER ROOM CODE"
                className={`brutalist-input ${roomError ? 'brutalist-input-error' : ''}`}
                style={{
                  '--input-shadow-color': gameMode === 'flip' ? '#4c1d95' : '#0956bf',
                  '--input-focus-shadow-color': gameMode === 'flip' ? '#8338ec' : '#8338ec',
                } as React.CSSProperties}
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
              <label className={`brutalist-label ${roomError ? 'bg-[#cc3333]' : gameMode === 'flip' ? 'bg-brand-flip' : 'bg-brand-red'}`}>
                {roomError ? 'Invalid Room ID!' : 'Room ID'}
              </label>
            </div>

            {/* Game Mode Switcher (Host only chooses this) */}
            <div className="flex flex-col items-center w-full max-w-[256px] mt-2 mb-4">
              <div className="flex w-full bg-neutral-card border-2 border-[#0f172a] rounded-[14px] p-0.5 shadow-[2px_2px_0_#0f172a] overflow-hidden relative">
                {/* Sliding animated background highlight */}
                <motion.div
                  className="absolute top-0.5 bottom-0.5 rounded-[10px] border-2 border-[#0f172a] shadow-[1px_1px_0_#0f172a] z-0"
                  style={{ width: 'calc(50% - 3px)' }}
                  animate={{
                    x: gameMode === 'classic' ? 0 : '100%',
                    backgroundColor: gameMode === 'classic' ? '#cc3333' : '#4c1d95'
                  }}
                  transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                />

                <button
                  onClick={() => setGameMode('classic')}
                  className={`flex-1 py-1.5 text-[10px] font-black tracking-wider uppercase rounded-[10px] cursor-pointer relative z-10 transition-colors duration-200 ${gameMode === 'classic' ? 'text-white' : 'text-[#0f172a] hover:bg-neutral-bg/30'
                    }`}
                >
                  Classic
                </button>
                <button
                  onClick={() => setGameMode('flip')}
                  className={`flex-1 py-1.5 text-[10px] font-black tracking-wider uppercase rounded-[10px] cursor-pointer relative z-10 transition-colors duration-200 ${gameMode === 'flip' ? 'text-white' : 'text-[#0f172a] hover:bg-neutral-bg/30'
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

            {/* 3D Host Game Button - Mattel Red / Flip Purple */}
            <button
              onClick={handleHostGame}
              disabled={isLoading}
              className={`btn-3d w-[256px] ${isLoading ? 'opacity-75 cursor-not-allowed' : ''}`}
            >
              <span className="btn-3d-shadow" />
              <span className={`btn-3d-edge ${gameMode === 'flip' ? 'btn-3d-edge-purple' : 'btn-3d-edge-red'}`} />
              <div className={`btn-3d-front ${gameMode === 'flip' ? 'btn-3d-front-purple' : 'btn-3d-front-red'} flex items-center justify-center relative w-full px-12 gap-2`}>
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
            <div className={`absolute left-6 -top-5.5 ${room.gameMode === 'flip' ? 'bg-brand-flip' : 'bg-brand-red'} border-2 border-[#0f172a] px-5 py-2.5 rounded-[8px] shadow-[2px_2px_0_#0f172a]`}>
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
                      className={`flex items-center justify-between border-2 border-[#0f172a] rounded-[10px] p-2 shadow-[1.5px_1.5px_0_#0f172a] ${isSelf ? 'bg-white' : 'bg-neutral-card'
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
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border border-[#0f172a] uppercase ${player.isReady
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
                  <span className={`btn-3d-edge ${canStart
                      ? (room.gameMode === 'flip' ? 'btn-3d-edge-purple' : 'btn-3d-edge-red')
                      : 'bg-neutral-muted'
                    }`} />
                  <div className={`btn-3d-front ${canStart
                      ? (room.gameMode === 'flip' ? 'btn-3d-front-purple' : 'btn-3d-front-red')
                      : 'bg-neutral-border text-neutral-muted border-2 border-[#0f172a]'
                    } flex items-center justify-center relative w-full px-12`}>
                    <span className="font-bold select-none uppercase tracking-wider text-xs">Start Game</span>
                  </div>
                </button>
              ) : (
                <button
                  onClick={handleToggleReady}
                  className="btn-3d w-full"
                >
                  <span className="btn-3d-shadow" />
                  <span className={`btn-3d-edge ${room.gameMode === 'flip' ? 'btn-3d-edge-purple' : 'btn-3d-edge-blue'}`} />
                  <div className={`btn-3d-front ${room.gameMode === 'flip' ? 'btn-3d-front-purple' : 'btn-3d-front-blue'} flex items-center justify-center relative w-full px-12`}>
                    <span className="font-bold select-none uppercase tracking-wider text-xs">
                      {room.players.find((p: any) => p.id === myPlayerId)?.isReady ? 'Unready' : 'Ready Up'}
                    </span>
                  </div>
                </button>
              )}

              <button
                onClick={() => setIsRuleBookOpen(true)}
                className="btn-3d w-full"
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
    const myPlayer = room.players.find((p: any) => p.id === myPlayerId);
    const player = myPlayer || room.players[0];
    const hand = Array.isArray(player?.hand) ? player.hand : [];

    return (
      <div className="h-screen w-screen bg-white relative overflow-hidden font-sans select-none flex flex-col items-center justify-end pb-16">
        
        {/* Settings button in the top-right */}
        <div className="absolute top-6 right-6 z-50">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className="p-3 border-3 border-[#0f172a] rounded-[12px] bg-white hover:bg-neutral-bg text-[#0f172a] shadow-[4px_4px_0_#0f172a] transition-all cursor-pointer flex items-center justify-center"
            title="Open Settings"
          >
            <motion.div
              animate={{ rotate: isSettingsOpen ? 90 : 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            >
              <Settings className="w-5 h-5" />
            </motion.div>
          </motion.button>

          {/* Settings Dropdown Menu */}
          <AnimatePresence>
            {isSettingsOpen && (
              <>
                <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setIsSettingsOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-3 w-56 bg-white border-3 border-[#0f172a] rounded-[16px] shadow-[6px_6px_0_#0f172a] p-3 z-50 flex flex-col gap-2"
                >
                  <div className="text-[10px] font-black text-neutral-muted uppercase tracking-widest border-b-2 border-[#0f172a] pb-1.5 mb-1 text-left">
                    Game Menu
                  </div>
                  
                  <button
                    onClick={() => {
                      setIsSettingsOpen(false);
                      setIsRuleBookOpen(true);
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 text-left text-xs font-bold text-[#0f172a] hover:bg-brand-blue hover:text-white rounded-[8px] transition-colors border border-transparent hover:border-[#0f172a] cursor-pointer"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>Rule Book</span>
                  </button>

                  <button
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className="flex items-center gap-2.5 px-3 py-2 text-left text-xs font-bold text-[#0f172a] hover:bg-brand-green hover:text-white rounded-[8px] transition-colors border border-transparent hover:border-[#0f172a] cursor-pointer"
                  >
                    {soundEnabled ? (
                      <>
                        <Volume2 className="w-4 h-4" />
                        <span>Mute Sounds</span>
                      </>
                    ) : (
                      <>
                        <VolumeX className="w-4 h-4" />
                        <span>Unmute Sounds</span>
                      </>
                    )}
                  </button>

                  <div className="border-t-2 border-[#0f172a] my-1" />

                  <button
                    onClick={() => {
                      setIsSettingsOpen(false);
                      if (confirm("Are you sure you want to leave the game?")) {
                        handleLeaveLobby();
                      }
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 text-left text-xs font-bold text-white bg-brand-red hover:bg-red-700 rounded-[8px] transition-colors border border-[#0f172a] cursor-pointer shadow-[2px_2px_0_#0f172a] active:scale-95 animate-pulse"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Leave Room</span>
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Fanned Player Cards View in React (Facing the player) */}
        <HandCanvas
          hand={hand}
          side={room.side}
          gameMode={room.gameMode}
          roomId={room.roomId}
          socket={socket}
        />

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
        {/* UNO with Friends Pill Header matching the Play with Friends style */}
        <div className="flex justify-center mb-12">
          <div className="relative bg-brand-red border-2 border-[#0f172a] px-8 py-3.5 rounded-[8px] shadow-[3px_3px_0_rgba(15,23,42,0.15)]">
            <h1 className="text-white font-black text-2xl sm:text-3xl tracking-wider uppercase select-none">
              UNO with Friends
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
            <div className="btn-3d-front btn-3d-front-blue flex items-center justify-center gap-3.5 w-full px-4">
              <div className="flex -space-x-3.5 shrink-0">
                <div key={menuAvatars[0]} className="w-7 h-7 rounded-full border-2 border-[#0f172a] overflow-hidden bg-neutral-bg shadow-sm animate-avatar-pop">
                  <img src={menuAvatars[0]} alt="Avatar 1" className="w-full h-full object-cover" />
                </div>
                <div key={menuAvatars[1]} className="w-7 h-7 rounded-full border-2 border-[#0f172a] overflow-hidden bg-neutral-bg shadow-sm animate-avatar-pop">
                  <img src={menuAvatars[1]} alt="Avatar 2" className="w-full h-full object-cover" />
                </div>
                <div key={menuAvatars[2]} className="w-7 h-7 rounded-full border-2 border-[#0f172a] overflow-hidden bg-neutral-bg shadow-sm animate-avatar-pop">
                  <img src={menuAvatars[2]} alt="Avatar 3" className="w-full h-full object-cover" />
                </div>
              </div>
              <span className="font-semibold select-none whitespace-nowrap">Play with Friends</span>
            </div>
          </button>

          {/* Play with Computer Button - UNO Green */}
          <button
            onClick={() => setView('computer')}
            className="btn-3d w-full sm:w-1/2"
          >
            <span className="btn-3d-shadow" />
            <span className="btn-3d-edge btn-3d-edge-green" />
            <div className="btn-3d-front btn-3d-front-green flex items-center justify-center gap-3 w-full px-4">
              <Cpu className="w-6 h-6 text-white shrink-0" />
              <span className="font-semibold select-none whitespace-nowrap">Play with Computer</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
