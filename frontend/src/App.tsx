import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { Users, Cpu, ArrowLeft, Crown, Copy, Check, UserMinus, Settings, BookOpen, Volume2, VolumeX, LogOut, Megaphone, Zap } from 'lucide-react';
import { createAvatar } from '@dicebear/core';
import { adventurer } from '@dicebear/collection';
import { io } from 'socket.io-client';
import { BACKEND_URL } from './config';
import confetti from 'canvas-confetti';

// Audio cue synthesizer using AudioContext (fallback)
const playGameEndSoundSynth = (isVictory: boolean) => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (isVictory) {
      // Triumphant rising arpeggio: C4 -> E4 -> G4 -> C5
      const notes = [261.63, 329.63, 392.00, 523.25];
      notes.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + index * 0.15);

        gain.gain.setValueAtTime(0, ctx.currentTime + index * 0.15);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + index * 0.15 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + index * 0.15 + 0.4);

        osc.start(ctx.currentTime + index * 0.15);
        osc.stop(ctx.currentTime + index * 0.15 + 0.45);
      });
    } else {
      // Melancholic descending tone: G4 -> Eb4 -> D4 -> C4
      const notes = [392.00, 311.13, 293.66, 261.63];
      notes.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + index * 0.2);

        gain.gain.setValueAtTime(0, ctx.currentTime + index * 0.2);
        gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + index * 0.2 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + index * 0.2 + 0.5);

        osc.start(ctx.currentTime + index * 0.2);
        osc.stop(ctx.currentTime + index * 0.2 + 0.6);
      });
    }
  } catch (e) {
    console.warn('AudioContext playback failed:', e);
  }
};

// Play public sound effects
const playSoundEffect = (soundName: 'draw' | 'play' | 'shuffle' | 'win' | 'lose' | 'uno' | 'drag', enabled = true) => {
  if (!enabled) return;
  try {
    const audio = new Audio(`/sounds/${soundName === 'draw' ? 'card-draw' :
      soundName === 'play' ? 'card-play' :
        soundName === 'shuffle' ? 'card-shuffle' :
          soundName === 'win' ? 'win' :
            soundName === 'lose' ? 'lose' :
              soundName === 'uno' ? 'uno-call' :
                'card-drag'}.mp3`);
    audio.volume = soundName === 'drag' ? 0.3 : 0.55;
    audio.play().catch(e => console.warn(`Audio play for ${soundName} blocked or failed:`, e));
  } catch (e) {
    console.warn(`Audio initialization for ${soundName} failed:`, e);
  }
};

const playGameEndSound = (isVictory: boolean) => {
  try {
    const audio = new Audio(`/sounds/${isVictory ? 'win' : 'lose'}.mp3`);
    audio.volume = 0.6;
    audio.play().catch((err) => {
      console.warn('MP3 game end sound failed, falling back to synth:', err);
      playGameEndSoundSynth(isVictory);
    });
  } catch (e) {
    playGameEndSoundSynth(isVictory);
  }
};

// Confetti fireworks loop helper
const triggerVictoryConfetti = () => {
  const duration = 3 * 1000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 1000, colors: ['#cc3333', '#0956bf', '#379711', '#ecd407', '#8338ec'] };

  function randomInRange(min: number, max: number) {
    return Math.random() * (max - min) + min;
  }

  const interval: any = setInterval(function () {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      return clearInterval(interval);
    }

    const particleCount = 50 * (timeLeft / duration);
    confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
    confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
  }, 250);
};

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

interface NormalizedCardClient {
  color: string;
  type: string;
  value: number | null;
}

const normalizeCardClient = (cardId: string): NormalizedCardClient => {
  if (!cardId || typeof cardId !== 'string') {
    return { color: 'UNKNOWN', type: 'UNKNOWN', value: null };
  }

  // Handle wild cards
  if (cardId === 'WILD') {
    return { color: 'WILD', type: 'WILD', value: null };
  }
  if (cardId === 'WILD_DRAW_FOUR') {
    return { color: 'WILD', type: 'WILD_DRAW_FOUR', value: null };
  }
  if (cardId === 'WILD_DRAW_TWO') {
    return { color: 'WILD', type: 'WILD_DRAW_TWO', value: null };
  }
  if (cardId === 'WILD_DRAW_COLOR') {
    return { color: 'WILD', type: 'WILD_DRAW_COLOR', value: null };
  }

  // Handle colored cards (e.g. BLUE_NUMBER_0, RED_SKIP, RED_REVERSE, YELLOW_DRAW_TWO)
  const parts = cardId.split('_');
  const color = parts[0]; // RED, BLUE, GREEN, YELLOW

  if (parts.length === 3 && parts[1] === 'NUMBER') {
    const value = parseInt(parts[2], 10);
    return { color, type: 'NUMBER', value };
  }

  // Action cards (RED_SKIP, RED_REVERSE, YELLOW_DRAW_TWO)
  let type = parts[1];
  if (parts[2]) {
    type += `_${parts[2]}`; // e.g. DRAW_TWO
  }

  return { color, type, value: null };
};

const validatePlayableClientLogic = (cardId: string, topDiscardCardId: string, currentColor: string): boolean => {
  const card = normalizeCardClient(cardId);
  const topCard = normalizeCardClient(topDiscardCardId);

  // Wild cards are always playable
  if (card.color === 'WILD') {
    return true;
  }

  // Check color match
  const activeColor = currentColor || topCard.color;
  if (card.color === activeColor) {
    return true;
  }

  // Check numeric value match for number cards
  if (card.type === 'NUMBER' && topCard.type === 'NUMBER' && card.value === topCard.value) {
    return true;
  }

  // Check type match for action cards (SKIP, REVERSE, DRAW_TWO)
  if (card.type !== 'NUMBER' && card.type === topCard.type) {
    return true;
  }

  return false;
};

// Turn timer constants
const TURN_DURATION = 30; // seconds per turn
const RING_PERIMETER = 345.66; // Perimeter of the custom rounded path inset by 2.5

interface GamePlayerAvatarProps {
  name: string;
  avatarSeed: string;
  cardCount: number;
  isTurn?: boolean;
  isMe?: boolean;
  turnStartedAt?: number;
}

function GamePlayerAvatar({ name, avatarSeed, cardCount, isTurn = false, isMe = false, turnStartedAt }: GamePlayerAvatarProps) {
  const [timeLeft, setTimeLeft] = useState(TURN_DURATION);

  // Reset and start countdown whenever this player's turn begins or turnStartedAt changes
  useEffect(() => {
    if (!isTurn || !turnStartedAt) {
      setTimeLeft(TURN_DURATION);
      return;
    }

    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - turnStartedAt) / 1000);
      const remaining = Math.max(0, TURN_DURATION - elapsed);
      setTimeLeft(remaining);
    };

    updateTimer(); // run once immediately

    const interval = setInterval(() => {
      updateTimer();
    }, 1000);

    return () => clearInterval(interval);
  }, [isTurn, turnStartedAt]);

  const avatarUri = useMemo(() => {
    try {
      return createAvatar(adventurer, {
        seed: avatarSeed || name || 'Felix',
        backgroundColor: ['cc3333', '0956bf', '379711', '8338ec']
      }).toDataUri();
    } catch (e) {
      return '';
    }
  }, [avatarSeed, name]);

  // Progress 1.0 = full, 0.0 = depleted
  const progress = isTurn ? timeLeft / TURN_DURATION : 1;
  // Color: green > 50%, yellow 25-50%, red < 25%
  const ringColor = progress > 0.5 ? '#379711' : progress > 0.25 ? '#ecd407' : '#cc3333';

  return (
    <motion.div
      animate={isTurn ? {
        y: [0, -20, 2, -2, 0],
        scale: [1, 1.15, 1.08, 1.1, 1.1],
      } : {
        y: 0,
        scale: 1,
      }}
      transition={{
        duration: 0.6,
        times: [0, 0.35, 0.55, 0.8, 1],
        ease: "easeInOut",
      }}
      className={`flex flex-col items-center select-none ${!isTurn ? 'avatar-inactive' : 'avatar-active'
        }`}
    >
      {/* YOUR TURN pill: only shown for the local player when it's their turn */}
      {isMe && isTurn && (
        <div
          className="your-turn-badge mb-1.5 bg-[#cc3333] border-2 border-[#0f172a] rounded-[6px] px-3 py-1 shadow-[2px_2px_0_#0f172a] flex items-center"
        >
          <span className="text-white font-black text-[9px] sm:text-[10px] tracking-widest uppercase">Your Turn</span>
        </div>
      )}

      {/* Name Label Badge — red when active, teal otherwise */}
      <div
        className={`border-2 border-white rounded-[8px] px-3.5 py-1.5 flex items-center justify-center min-w-[80px] transition-colors duration-300 ${isTurn ? 'bg-[#cc3333]' : 'bg-[#1e7b85]'
          }`}
      >
        <span className="text-white font-extrabold text-[10px] sm:text-xs tracking-wider truncate max-w-[85px] uppercase">
          {name}
        </span>
      </div>

      {/* Avatar Wrapper — sized to match avatar box so SVG inset-0 covers it exactly */}
      <div className="relative mt-2 w-[72px] h-[72px] sm:w-[88px] sm:h-[88px]">

        <div 
          className="w-full h-full bg-white border-[5px] sm:border-[6px] border-white overflow-hidden shadow-[0_8px_16px_rgba(0,0,0,0.15)]"
          style={{ borderRadius: '22.5%' }}
        >
          {avatarUri && (
            <img src={avatarUri} alt={name} className="w-full h-full object-cover" />
          )}
        </div>

        {/* SVG progress ring — depletes clockwise from top-right (badge position) */}
        {isTurn && (
          <svg
            className="absolute inset-0 pointer-events-none z-10"
            viewBox="0 0 100 100"
            width="100%"
            height="100%"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Animated solid progress stroke — overlays white border directly, depletes clockwise */}
            <path
              d="M 77.5 2.5 A 20 20 0 0 1 97.5 22.5 L 97.5 77.5 A 20 20 0 0 1 77.5 97.5 L 22.5 97.5 A 20 20 0 0 1 2.5 77.5 L 2.5 22.5 A 20 20 0 0 1 22.5 2.5 L 77.5 2.5"
              fill="none"
              stroke={ringColor}
              strokeWidth="5"
              strokeLinecap="round"
              style={{
                strokeDasharray: `${RING_PERIMETER}`,
                strokeDashoffset: `${(1 - progress) * RING_PERIMETER}`,
                transition: 'stroke-dashoffset 0.95s linear, stroke 0.4s ease',
              }}
            />
          </svg>
        )}
        {/* Countdown badge — notification-style circle at top-right, color matches ring */}
        {isTurn && (
          <div
            className="absolute -top-2 -right-2 z-20 w-6 h-6 rounded-full border-2 border-[#0f172a] flex items-center justify-center font-black text-[10px] text-white shadow-[1px_1px_0_#0f172a] select-none"
            style={{ backgroundColor: ringColor, transition: 'background-color 0.4s ease' }}
          >
            {timeLeft}
          </div>
        )}

        {/* Card Count Indicator Overlayed at the bottom right */}
        <div className="absolute -right-3 -bottom-1.5 z-10">
          <div className="relative w-8 h-10 sm:w-9 sm:h-11">
            {/* Back card */}
            <div className="absolute left-0.5 top-0.7 w-6.5 h-8.5 sm:w-7 sm:h-9 bg-white border-2 border-[#0f172a] rounded-[4px] shadow-[1px_1px_0_rgba(0,0,0,0.15)] transform -rotate-6" />
            {/* Top card */}
            <div className="absolute left-1.5 top-0 w-6.5 h-8.5 sm:w-7 sm:h-9 bg-white border-2 border-[#0f172a] rounded-[4px] shadow-[2px_2px_0_#0f172a] flex items-center justify-center font-black text-xs text-[#0f172a] transform rotate-3 select-none">
              {cardCount}
            </div>
          </div>
        </div>

      </div>
    </motion.div>
  );
}

interface OpponentCardFanProps {
  cardCount: number;
  direction: 'left' | 'right' | 'down';
  side: 'light' | 'dark';
  gameMode: 'classic' | 'flip';
  isShort?: boolean;
  isVeryShort?: boolean;
}

function OpponentCardFan({ cardCount, direction: _direction, side, gameMode, isShort = false, isVeryShort = false }: OpponentCardFanProps) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (cardCount <= 0) return null;

  // Symmetrical fan: show up to 15 cards
  const visibleCards = Math.min(cardCount, 15);
  const middle = (visibleCards - 1) / 2;

  const isDarkSide = gameMode === 'flip' && side === 'dark';
  const cardBackFilter = isDarkSide
    ? 'hue-rotate(145deg) brightness(0.7) contrast(1.1)'
    : 'none';

  let cardW = isMobile ? 44 : 72;
  let cardH = isMobile ? 64 : 104;
  let maxFanWidth = isMobile ? 120 : 200;
  let bottomOffset = isMobile ? 14 : 22;

  if (isVeryShort) {
    cardW = isMobile ? 28 : 44;
    cardH = isMobile ? 40 : 64;
    maxFanWidth = isMobile ? 80 : 120;
    bottomOffset = isMobile ? 8 : 12;
  } else if (isShort) {
    cardW = isMobile ? 36 : 56;
    cardH = isMobile ? 52 : 80;
    maxFanWidth = isMobile ? 100 : 160;
    bottomOffset = isMobile ? 10 : 16;
  }

  const defaultSpacing = isVeryShort ? (isMobile ? 8 : 12) : (isShort ? (isMobile ? 10 : 16) : (isMobile ? 14 : 22));
  const spacingX = visibleCards > 1
    ? Math.min(defaultSpacing, maxFanWidth / (visibleCards - 1))
    : 0;

  const curveFactor = isMobile ? 1.0 : 1.8;
  const rotationFactor = isMobile ? 1.8 : 2.5;

  const actualWidth = (visibleCards - 1) * spacingX + cardW;

  return (
    <div
      className="relative flex items-end justify-center select-none pointer-events-none"
      style={{
        width: `${actualWidth}px`,
        height: `${cardH + bottomOffset + 4}px`,
        margin: '0 auto',
      }}
    >
      {Array.from({ length: visibleCards }).map((_, idx) => {
        const offset = idx - middle;

        // Symmetrical curve math:
        // x offsets cards horizontally
        const x = offset * spacingX;
        // y pushes outer cards downwards (positive Y), making middle card highest (dome shape)
        const y = Math.pow(Math.abs(offset), 1.4) * curveFactor;
        // rotate tilts outer cards outwards
        const rotate = offset * rotationFactor;

        const outerStyle: React.CSSProperties = {
          position: 'absolute',
          bottom: `${bottomOffset}px`,
          left: `calc(50% - ${cardW / 2}px)`,
          width: `${cardW}px`,
          height: `${cardH}px`,
          transform: `translateX(${x}px) translateY(${y}px) rotate(${rotate}deg)`,
          transformOrigin: 'bottom center',
          zIndex: idx,
          filter: cardBackFilter,
        };

        const isTopCard = idx === visibleCards - 1;

        return (
          <div key={idx} style={outerStyle} className="relative flex-shrink-0">
            <div
              className="w-full h-full rounded-[6px] border-2 border-[#0f172a] shadow-[1px_2px_4px_rgba(0,0,0,0.18)] bg-white overflow-hidden transition-all duration-300"
              style={{
                WebkitBoxReflect: 'below 1px linear-gradient(transparent 75%, rgba(255, 255, 255, 0.12))',
              }}
            >
              <img
                src="/cards/Deck.png"
                alt="Card Back"
                className="w-full h-full object-contain pointer-events-none select-none"
              />
            </div>
            {isTopCard && cardCount > 15 && (
              <div
                className="absolute bg-brand-red border-2 border-[#0f172a] rounded-full flex items-center justify-center font-black text-white shadow-[2px_2px_0_#0f172a] z-50"
                style={{
                  width: isMobile ? '20px' : '28px',
                  height: isMobile ? '20px' : '28px',
                  fontSize: isMobile ? '9px' : '12px',
                  top: isMobile ? '-8px' : '-12px',
                  right: isMobile ? '-8px' : '-12px',
                }}
              >
                +{cardCount - 15}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface ParsedCard {
  cardId: string;
  face: string;
  colorGroup: number; // 0: Red/Orange, 1: Blue/Pink, 2: Green/Teal, 3: Yellow/Purple, 4: Wild
  typeGroup: number;  // 0: Number, 1: Skip, 2: Reverse, 3: Draw, 4: Flip, 5: Wild, 6: Wild Draw
  numberValue: number; // For number cards (0-9), otherwise 0
  specificType: string;
}

const parseCardForSorting = (
  cardId: string,
  side: 'light' | 'dark',
  gameMode: 'classic' | 'flip'
): ParsedCard => {
  const face = getActiveCardFaceFrontend(cardId, side, gameMode);
  const parts = face.split('_');

  // Wild check
  if (face.startsWith('WILD')) {
    let typeGroup = 5; // Wild
    if (face.includes('DRAW') || face.includes('COLOR')) {
      typeGroup = 6; // Wild Draw
    }
    return {
      cardId,
      face,
      colorGroup: 4, // Wild color group
      typeGroup,
      numberValue: 0,
      specificType: face
    };
  }

  // Regular colored cards
  const colorRaw = parts[0].toUpperCase();
  let colorGroup = 4;
  if (colorRaw === 'RED' || colorRaw === 'ORANGE') colorGroup = 0;
  else if (colorRaw === 'BLUE' || colorRaw === 'PINK') colorGroup = 1;
  else if (colorRaw === 'GREEN' || colorRaw === 'TEAL') colorGroup = 2;
  else if (colorRaw === 'YELLOW' || colorRaw === 'PURPLE') colorGroup = 3;

  // Types
  let typeGroup = 0; // default number
  let numberValue = 0;
  let specificType = parts[1] || '';

  if (face.includes('_NUMBER_')) {
    typeGroup = 0;
    numberValue = parseInt(parts[2], 10) || 0;
  } else if (face.includes('_SKIP')) {
    typeGroup = 1;
  } else if (face.includes('_REVERSE')) {
    typeGroup = 2;
  } else if (face.includes('_DRAW_')) {
    typeGroup = 3;
    numberValue = parseInt(parts[2], 10) || 0; // Draw Five or Draw One/Two
  } else if (face.includes('_FLIP')) {
    typeGroup = 4;
  }

  return {
    cardId,
    face,
    colorGroup,
    typeGroup,
    numberValue,
    specificType
  };
};

const compareCards = (a: ParsedCard, b: ParsedCard): number => {
  if (a.colorGroup !== b.colorGroup) {
    return a.colorGroup - b.colorGroup;
  }
  if (a.typeGroup !== b.typeGroup) {
    return a.typeGroup - b.typeGroup;
  }
  if (a.numberValue !== b.numberValue) {
    return a.numberValue - b.numberValue;
  }
  return a.face.localeCompare(b.face);
};

interface DiscardHistoryCard {
  key: string;
  cardId: string;
  layoutId?: string;
  rotation: number;
  offsetX: number;
  offsetY: number;
}

interface DiscardPileProps {
  room: any;
  side: 'light' | 'dark';
  gameMode: 'classic' | 'flip';
  lastPlayedCardKey: string | null;
  onResetPlayedKey: () => void;
}

function DiscardPile({ room, side, gameMode, lastPlayedCardKey, onResetPlayedKey }: DiscardPileProps) {
  const [discardHistory, setDiscardHistory] = useState<DiscardHistoryCard[]>([]);
  const lastTopRef = useRef<string | null>(null);
  const lastSizeRef = useRef<number>(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!room) {
      setDiscardHistory([]);
      lastTopRef.current = null;
      lastSizeRef.current = 0;
      return;
    }

    const currentTop = room.discardPileTop;
    const currentSize = room.discardPileSize || 0;

    if (!currentTop || currentSize === 0) {
      setDiscardHistory([]);
      lastTopRef.current = null;
      lastSizeRef.current = 0;
      return;
    }

    const generateOffsets = () => {
      return {
        rotation: Math.random() * 16 - 8,
        offsetX: Math.random() * 12 - 6,
        offsetY: Math.random() * 8 - 4,
      };
    };

    // Case 1: Initial load — show top card + up to 5 placeholder cards underneath
    if (discardHistory.length === 0 || lastSizeRef.current === 0) {
      const visibleUnder = Math.min(currentSize - 1, 5);
      const initialPile: DiscardHistoryCard[] = [];
      for (let i = 0; i < visibleUnder; i++) {
        initialPile.push({
          key: `placeholder_${i}_${Math.random()}`,
          cardId: 'DECK_BACK',
          ...generateOffsets()
        });
      }
      initialPile.push({
        key: `card_${currentTop}_${Date.now()}_${Math.random()}`,
        cardId: currentTop,
        ...generateOffsets()
      });
      setDiscardHistory(initialPile);
    }
    // Case 2: New card played — stack the new top card on the pile
    else if (currentSize > lastSizeRef.current || currentTop !== lastTopRef.current) {
      const newCard: DiscardHistoryCard = {
        // Unique key so Framer Motion mounts this as a NEW element every time
        key: `card_${currentTop}_${Date.now()}_${Math.random()}`,
        cardId: currentTop,
        // layoutId must match the hand card's layoutId that was just played.
        // Framer Motion FLIP-animates it flying from hand position → pile center.
        layoutId: lastPlayedCardKey || undefined,
        ...generateOffsets()
      };

      setDiscardHistory(prev => {
        // Guard: don't double-add the same card
        if (prev.length > 0 && prev[prev.length - 1].cardId === currentTop && currentSize === lastSizeRef.current) {
          return prev;
        }
        // Keep at most 8 visible in the stack for performance
        const kept = prev.slice(-7);
        return [...kept, newCard];
      });

      if (lastPlayedCardKey && onResetPlayedKey) {
        onResetPlayedKey();
      }
    }
    // Case 3: Reshuffled — pile shrunk, rebuild history
    else if (currentSize < lastSizeRef.current) {
      const visibleUnder = Math.min(currentSize - 1, 5);
      const resetPile: DiscardHistoryCard[] = [];
      for (let i = 0; i < visibleUnder; i++) {
        resetPile.push({
          key: `placeholder_${i}_${Math.random()}`,
          cardId: 'DECK_BACK',
          ...generateOffsets()
        });
      }
      resetPile.push({
        key: `card_${currentTop}_${Date.now()}_${Math.random()}`,
        cardId: currentTop,
        ...generateOffsets()
      });
      setDiscardHistory(resetPile);
    }

    lastTopRef.current = currentTop;
    lastSizeRef.current = currentSize;
  }, [room?.discardPileTop, room?.discardPileSize, lastPlayedCardKey]);

  const targetH = isMobile ? 130 : 220;
  const targetW = targetH * 0.69;

  return (
    <div
      id="discard-pile-drop-zone"
      className="relative flex items-center justify-center w-[90px] h-[130px] sm:w-[152px] sm:h-[220px] transition-all duration-150 ease-out"
    >
      <div className="relative w-full h-full">
        {discardHistory.map((card, i) => {
          const isTop = i === discardHistory.length - 1;
          const shadowStyle = isTop
            ? '0 14px 28px rgba(0,0,0,0.32), 0 5px 10px rgba(0,0,0,0.22)'
            : '0 4px 8px rgba(0,0,0,0.18), 0 2px 4px rgba(0,0,0,0.12)';

          const assetUrl = getCardAssetUrl(card.cardId, side, gameMode);

          return (
            <motion.div
              key={card.key}
              style={{
                position: 'absolute',
                width: `${targetW}px`,
                height: `${targetH}px`,
                left: `calc(50% - ${targetW / 2}px)`,
                top: `calc(50% - ${targetH / 2}px)`,
                transformOrigin: 'center center',
                zIndex: i,
                boxShadow: shadowStyle,
                borderRadius: isMobile ? '7px' : '12px',
                overflow: 'hidden',
                backfaceVisibility: 'hidden',
                willChange: 'transform',
              }}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{
                x: card.offsetX,
                y: card.offsetY,
                rotate: card.rotation,
                scale: 1.0,
                opacity: 1,
              }}
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 26,
                mass: 0.8,
              }}
            >
              <img
                src={assetUrl}
                alt={card.cardId}
                className="w-full h-full object-contain pointer-events-none select-none"
                style={{
                  imageRendering: 'auto',
                  filter: card.cardId === 'DECK_BACK' && gameMode === 'flip' && side === 'dark'
                    ? 'hue-rotate(145deg) brightness(0.7) contrast(1.1)'
                    : 'none'
                }}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

interface HandCanvasProps {
  hand: string[];
  side: 'light' | 'dark';
  gameMode: 'classic' | 'flip';
  roomId: string;
  socket: any;
  onCardPlay?: (key: string) => void;
  room: any;
  myPlayerId: string;
  onPlayWild?: (cardId: string, cardKey: string) => void;
  lastPlayedCardKey: string | null;
  soundEnabled: boolean;
  isShort?: boolean;
  isVeryShort?: boolean;
}

function HandCanvas({
  hand,
  side,
  gameMode,
  roomId,
  socket,
  onCardPlay,
  room,
  myPlayerId,
  onPlayWild,
  lastPlayedCardKey,
  soundEnabled,
  isShort = false,
  isVeryShort = false
}: HandCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 1024, height: 300 });
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  // Tracks which card index is shaking (invalid play attempt)
  const [shakingIndex, setShakingIndex] = useState<number | null>(null);


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

  // Reset selected card index when hand changes
  useEffect(() => {
    setSelectedCardIndex(null);
  }, [hand, side, gameMode]);

  /**
   * Client-side UNO playability check.
   * Rules:
   *  1. Must be the active player's turn.
   *  2. Wild cards are always playable.
   *  3. Card color matches room.currentColor (which may be a Wild-chosen color).
   *  4. Card number matches top card number (for NUMBER cards).
   *  5. Card action type matches top card action type (SKIP, REVERSE, DRAW_*).
   * If player drew a playable card, they may only play that specific card.
   */
  const validatePlayableClient = (cardId: string): boolean => {
    console.log('[validatePlayableClient] Starting validation for card:', cardId);
    if (!room) {
      console.log('[validatePlayableClient] Rejecting because room is null/undefined');
      return false;
    }

    // Must be my turn
    const activePlayer = room.players[room.currentTurn];
    if (!activePlayer) {
      console.log('[validatePlayableClient] Rejecting because activePlayer is null/undefined at index:', room.currentTurn);
      return false;
    }

    console.log('[validatePlayableClient] activePlayer:', activePlayer.name, 'id:', activePlayer.id);
    console.log('[validatePlayableClient] myPlayerId:', myPlayerId);
    if (activePlayer.id !== myPlayerId) {
      console.log('[validatePlayableClient] Rejecting because it is not my turn');
      return false;
    }

    // If drew a playable card this turn, only that card is allowed
    if (room.drawnPlayableCard && room.drawnPlayableCard !== cardId) {
      console.log('[validatePlayableClient] Rejecting because drawnPlayableCard is set to:', room.drawnPlayableCard, 'and does not match card:', cardId);
      return false;
    }

    const topCardId = room.discardPileTop;
    console.log('[validatePlayableClient] topCardId on discard pile:', topCardId);
    // No card on pile yet (shouldn't happen mid-game, but safe fallback)
    if (!topCardId) {
      console.log('[validatePlayableClient] Allowing play because discard pile is empty');
      return true;
    }

    // Resolve the active face for flip/classic mode
    const face = getActiveCardFaceFrontend(cardId, room.side, room.gameMode);
    const topFace = getActiveCardFaceFrontend(topCardId, room.side, room.gameMode);
    console.log('[validatePlayableClient] resolved face:', face, 'resolved topFace:', topFace);

    const isPlayable = validatePlayableClientLogic(face, topFace, room.currentColor);
    console.log('[validatePlayableClient] Result of validatePlayableClientLogic:', isPlayable);
    return isPlayable;
  };

  const triggerShake = (index: number) => {
    setShakingIndex(index);
    setTimeout(() => setShakingIndex(null), 450);
  };

  const playCard = (cardId: string, _index: number, instanceId: string) => {
    const face = getActiveCardFaceFrontend(cardId, side, gameMode);
    if (face === 'WILD' || face === 'WILD_DRAW_FOUR' || face === 'WILD_DRAW_TWO' || face === 'WILD_DRAW_COLOR') {
      if (onPlayWild) {
        onPlayWild(cardId, instanceId);
      }
    } else {
      if (onCardPlay) {
        onCardPlay(instanceId);
      }
      socket.emit('play_card', { roomId, cardId });
    }
  };

  const handleCardTap = (cardId: string, index: number, instanceId: string) => {
    if (!validatePlayableClient(cardId)) {
      triggerShake(index);
      return;
    }

    setSelectedCardIndex(prev => {
      if (prev === index) {
        // Second tap = play the card
        playCard(cardId, index, instanceId);
        return null;
      }
      return index;
    });
  };

  const checkIsOverDropZone = (point: { x: number; y: number }): boolean => {
    const dropZone = document.getElementById('discard-pile-drop-zone');
    if (!dropZone) return false;
    const rect = dropZone.getBoundingClientRect();
    const padding = 24;
    return (
      point.x >= rect.left - padding &&
      point.x <= rect.right + padding &&
      point.y >= rect.top - padding &&
      point.y <= rect.bottom + padding
    );
  };

  const handleDrag = (_event: any, info: any) => {
    const isOver = checkIsOverDropZone(info.point);
    const dropZone = document.getElementById('discard-pile-drop-zone');
    if (dropZone) {
      if (isOver) dropZone.classList.add('drop-zone-active');
      else dropZone.classList.remove('drop-zone-active');
    }
  };

  const handleDragEnd = (_event: any, info: any, cardId: string, index: number, instanceId: string) => {
    setDraggingIndex(null);
    const dropZone = document.getElementById('discard-pile-drop-zone');
    if (dropZone) dropZone.classList.remove('drop-zone-active');

    const isOver = checkIsOverDropZone(info.point);
    if (!isOver) return; // Dropped outside — dragSnapToOrigin handles the snap-back

    if (!validatePlayableClient(cardId)) {
      // Card can't be played — shake it
      triggerShake(index);
      return;
    }

    // Valid drop on pile: play the card
    setSelectedCardIndex(null);
    playCard(cardId, index, instanceId);
  };

  const sortedHand = useMemo(() => {
    if (!Array.isArray(hand)) return [];
    return [...hand].sort((aId, bId) => {
      const aParsed = parseCardForSorting(aId, side, gameMode);
      const bParsed = parseCardForSorting(bId, side, gameMode);
      return compareCards(aParsed, bParsed);
    });
  }, [hand, side, gameMode]);

  const isMobile = dimensions.width < 640;

  let containerHeight = isMobile ? 180 : 300;
  if (isVeryShort) {
    containerHeight = isMobile ? 120 : 160;
  } else if (isShort) {
    containerHeight = isMobile ? 150 : 220;
  }

  if (!Array.isArray(hand)) {
    return (
      <div
        ref={containerRef}
        style={{ touchAction: 'none', height: `${containerHeight}px` }}
        className="w-full max-w-5xl flex items-center justify-center text-xs text-neutral-muted uppercase font-black"
      >
        Loading cards...
      </div>
    );
  }

  const count = sortedHand.length;

  let targetH = isMobile ? 130 : 220;
  if (isVeryShort) {
    targetH = isMobile ? 90 : 120;
  } else if (isShort) {
    targetH = isMobile ? 110 : 160;
  }
  const targetW = targetH * 0.69;

  let spacing = isMobile
    ? Math.max(25, 45 - count)
    : Math.max(42, 80 - count);

  const avatarSpace = isVeryShort ? (isMobile ? 60 : 100) : (isShort ? (isMobile ? 80 : 120) : (isMobile ? 100 : 140));
  const maxHandWidth = dimensions.width - avatarSpace;

  const totalHandWidth = (count - 1) * spacing + targetW;
  if (totalHandWidth > maxHandWidth && count > 1) {
    spacing = (maxHandWidth - targetW) / (count - 1);
    spacing = Math.max(isMobile ? 12 : 20, spacing);
  }

  const cx = dimensions.width / 2;
  let startX = cx - ((count - 1) * spacing) / 2;
  if (startX < avatarSpace - 10) {
    startX = avatarSpace - 10;
  }

  const baseY = isMobile
    ? dimensions.height - 5 - targetH / 2
    : dimensions.height - 10 - targetH / 2;
  const middle = (count - 1) / 2;

  // Stable key reconciliation for duplicate cardIds
  const instancesRef = useRef<Array<{ instanceId: string; cardId: string }>>([]);
  const reconciledHand = useMemo(() => {
    const oldInstances = [...instancesRef.current];
    const newInstances: Array<{ instanceId: string; cardId: string }> = [];
    const remainingOld = [...oldInstances];

    // Exclude the played instance from being matched in the new hand
    if (lastPlayedCardKey) {
      const playedIndex = remainingOld.findIndex(inst => inst.instanceId === lastPlayedCardKey);
      if (playedIndex !== -1) {
        remainingOld.splice(playedIndex, 1);
      }
    }

    for (const cardId of sortedHand) {
      const matchIndex = remainingOld.findIndex(inst => inst.cardId === cardId);
      if (matchIndex !== -1) {
        newInstances.push(remainingOld[matchIndex]);
        remainingOld.splice(matchIndex, 1);
      } else {
        newInstances.push({
          instanceId: `${cardId}__inst_${Math.random().toString(36).substr(2, 9)}`,
          cardId
        });
      }
    }

    instancesRef.current = newInstances;
    return newInstances;
  }, [sortedHand, lastPlayedCardKey]);

  return (
    <div
      ref={containerRef}
      className="w-full max-w-5xl relative overflow-visible flex items-center justify-center"
      style={{ touchAction: 'none', height: `${containerHeight}px` }}
    >
      {reconciledHand.map((inst, i) => {
        const key = inst.instanceId;
        const cardId = inst.cardId;
        const offset = i - middle;
        const tX = startX + i * spacing;
        const tYBase = baseY + Math.abs(offset) * 4;

        const isSelected = i === selectedCardIndex;
        const isHovered = i === hoveredIndex;
        const isDragging = i === draggingIndex;
        const isShaking = i === shakingIndex;

        let targetScale = 1.0;
        let zIndex = isSelected ? 200 + i : i;

        let shadowStyle = 'drop-shadow(3.54px 3.54px 4px rgba(0,0,0,0.2))';
        if (isDragging) shadowStyle = 'drop-shadow(12px 18px 10px rgba(0,0,0,0.3))';
        else if (isSelected) shadowStyle = 'drop-shadow(5px 8px 6px rgba(0,0,0,0.25))';
        else if (isHovered) shadowStyle = 'drop-shadow(2.5px 2.5px 2px rgba(0,0,0,0.2))';

        const isPlayable = validatePlayableClient(cardId);

        if (isDragging) {
          targetScale = 1.12;
          zIndex = 1000;
        }

        const targetRot = isDragging ? 0 : offset * 2.0;

        const assetUrl = getCardAssetUrl(cardId, side, gameMode);

        return (
          <motion.div
            key={key}
            style={{
              position: 'absolute',
              left: `${tX - targetW / 2}px`,
              top: `${tYBase - targetH / 2}px`,
              width: `${targetW}px`,
              height: `${targetH}px`,
              transformOrigin: 'center center',
              zIndex,
              cursor: isDragging ? 'grabbing' : 'pointer',
              touchAction: 'none',
              filter: shadowStyle,
              borderRadius: isMobile ? '7px' : '12px',
              overflow: 'hidden',
              backgroundColor: room?.side === 'dark' ? '#18181b' : '#ffffff',
            }}
            animate={{
              x: isShaking ? [-8, 8, -6, 6, 0] : 0,
              y: isSelected ? -35 : (isHovered ? -15 : 0),
              rotate: targetRot,
              scale: targetScale,
            }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 30,
              // For shake: run the x keyframes fast
              ...(isShaking ? { duration: 0.4 } : {})
            }}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(prev => prev === i ? null : prev)}
            onClick={() => handleCardTap(cardId, i, key)}
            drag
            dragElastic={1.0}
            dragMomentum={false}
            dragSnapToOrigin={true}
            onDragStart={() => {
              setDraggingIndex(i);
              playSoundEffect('drag', soundEnabled);
            }}
            onDrag={handleDrag}
            onDragEnd={(e, info) => handleDragEnd(e, info, cardId, i, key)}
          >
            <motion.img
              src={assetUrl}
              alt={cardId}
              className="w-full h-full object-contain pointer-events-none select-none"
              style={{ imageRendering: 'pixelated' }}
              animate={{
                opacity: isPlayable ? 1.0 : (isDragging ? 0.8 : (isHovered ? 0.65 : 0.45)),
                filter: isPlayable ? 'none' : 'grayscale(35%) brightness(0.85)',
              }}
              transition={{ duration: 0.18 }}
            />
          </motion.div>
        );
      })}
    </div>
  );
}
function useWindowSize() {
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return windowSize;
}

// ─── CPU Lobby View Component ───────────────────────────────────────────────
interface CpuBot {
  id: string;
  name: string;
  avatarSeed: string;
  bgColor: string;
  avatarUri: string;
}

function BetaPill() {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="fixed top-4 left-4 z-50 pointer-events-auto select-none flex flex-col items-start gap-1.5"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="bg-[#64748b] text-white border-2 border-[#0f172a] px-2.5 py-1 rounded-[6px] shadow-[2px_2px_0_#0f172a] font-black text-[9px] tracking-wider uppercase cursor-help transition-all hover:-translate-y-0.5 active:translate-y-0 active:shadow-[1px_1px_0_#0f172a]">
        Beta 1.0
      </div>

      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -4 }}
            transition={{ duration: 0.15 }}
            className="bg-white text-[#0f172a] border-2 border-[#0f172a] p-3 rounded-[8px] shadow-[3px_3px_0_#0f172a] max-w-[220px] text-left"
          >
            <p className="text-[10px] font-bold leading-normal">
              The game is in beta. Some features might not work; they will come soon. There may be some bugs and glitches, so please bear with us!
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface CpuLobbyViewProps {
  avatarOffset: number;
  onNextAvatar: () => void;
  isLoading: boolean;
  allBotNames: string[];
  botBgColors: string[];
  onBack: () => void;
  onStart: (playerName: string, gameMode: 'classic' | 'flip', bots: CpuBot[], avatarSeed: string) => void;
}

function CpuLobbyView({ avatarOffset, onNextAvatar, isLoading, allBotNames, botBgColors, onBack, onStart }: CpuLobbyViewProps) {
  const [cpuPlayerName, setCpuPlayerName] = useState(() => {
    try {
      return localStorage.getItem('uno_player_name') || '';
    } catch (_) {
      return '';
    }
  });
  const [cpuGameMode, setCpuGameMode] = useState<'classic' | 'flip'>('classic');
  const [bots, setBots] = useState<CpuBot[]>([]);
  const [nameError, setNameError] = useState(false);
  const [botError, setBotError] = useState(false);
  const [shakeTrigger, setShakeTrigger] = useState(0);

  const [debouncedCpuName, setDebouncedCpuName] = useState(cpuPlayerName);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCpuName(cpuPlayerName);
    }, 500);
    return () => clearTimeout(timer);
  }, [cpuPlayerName]);

  useEffect(() => {
    try {
      localStorage.setItem('uno_player_name', cpuPlayerName);
    } catch (_) { }
  }, [cpuPlayerName]);

  const cpuAvatarDataUri = useMemo(() => {
    try {
      const avatar = createAvatar(adventurer, {
        seed: `${debouncedCpuName || 'Felix'}-${avatarOffset}`,
        backgroundColor: ['cc3333', '0956bf', '379711', '8338ec']
      });
      return avatar.toDataUri();
    } catch (e) {
      console.error('Dicebear generation failed, falling back to static URI:', e);
      return '';
    }
  }, [debouncedCpuName, avatarOffset]);

  const usedNames = bots.map(b => b.name);

  const generateBot = (): CpuBot => {
    const available = allBotNames.filter(n => !usedNames.includes(n));
    const name = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : allBotNames[Math.floor(Math.random() * allBotNames.length)] + `${bots.length + 1}`;
    const bgColor = botBgColors[Math.floor(Math.random() * botBgColors.length)];
    const seed = `bot-${name}-${Date.now()}`;
    let avatarUri = '';
    try {
      avatarUri = createAvatar(adventurer, { seed, backgroundColor: [bgColor] }).toDataUri();
    } catch (_) { }
    return { id: seed, name, avatarSeed: seed, bgColor, avatarUri };
  };

  const addBot = () => {
    if (bots.length >= 3) return;
    setBots(prev => [...prev, generateBot()]);
    setBotError(false);
  };

  const removeBot = (id: string) => {
    setBots(prev => prev.filter(b => b.id !== id));
  };

  const handleStart = () => {
    let hasError = false;
    if (!cpuPlayerName.trim()) {
      setNameError(true);
      hasError = true;
    }
    if (bots.length < 1) {
      setBotError(true);
      hasError = true;
    }
    if (hasError) {
      setShakeTrigger(prev => prev + 1);
      return;
    }
    const avatarSeed = `${cpuPlayerName.trim()}-${avatarOffset}`;
    onStart(cpuPlayerName.trim(), cpuGameMode, bots, avatarSeed);
  };

  return (
    <div className="min-h-[100dvh] overflow-y-auto bg-neutral-bg text-neutral-text flex flex-col items-center justify-center py-10 px-4 sm:px-6 font-sans">
      <BetaPill />
      <div className="max-w-md w-full my-auto">
        <div className="relative bg-neutral-card border-3 border-[#0f172a] rounded-[20px] pt-10 pb-6 px-8 shadow-[8px_8px_0_#0f172a] flex flex-col items-center w-full">

          {/* Pill Header sitting on the top border, changes color on hover */}
          <div className={`absolute left-6 -top-5.5 ${cpuGameMode === 'flip' ? 'bg-brand-flip' : 'bg-brand-blue hover:bg-brand-red'} border-2 border-[#0f172a] px-5 py-2.5 rounded-[8px] shadow-[2px_2px_0_#0f172a] transition-all duration-180 ease-out cursor-pointer`}>
            <h2 className="text-white font-black text-xs tracking-wider uppercase select-none flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" />
              Play vs Computer
            </h2>
          </div>

          {/* Back Button integrated symmetrically on the top-right border */}
          <button
            onClick={onBack}
            title="Back to Main Menu"
            className="absolute right-6 -top-5.5 bg-neutral-card hover:bg-brand-red hover:text-white text-[#0f172a] border-2 border-[#0f172a] px-3.5 py-2.5 rounded-[8px] shadow-[2px_2px_0_#0f172a] transition-all duration-180 ease-in-out cursor-pointer flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="font-bold text-xs tracking-wider uppercase select-none">Back</span>
          </button>

          {/* Dynamic Avatar Container with Floating Swap Button */}
          <div className="mb-6 flex flex-col items-center mt-1">
            <div className="relative">
              {/* The avatar circle */}
              <div className="w-20 h-20 bg-neutral-bg border-3 border-[#0f172a] rounded-full shadow-[4px_4px_0_#0f172a] overflow-hidden flex items-center justify-center transition-all duration-300">
                {cpuAvatarDataUri && (
                  <img
                    src={cpuAvatarDataUri}
                    alt="Player Avatar"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              {/* Floating Avatar Swap Button */}
              <button
                onClick={onNextAvatar}
                title="Cycle Avatar Style"
                className="absolute -bottom-1 -right-1 w-8 h-8 bg-brand-yellow hover:bg-[#d8c206] active:scale-90 border-2 border-[#0f172a] rounded-full shadow-[2px_2px_0_#0f172a] flex items-center justify-center cursor-pointer transition-all duration-150"
              >
                <Users className="w-4 h-4 text-[#0f172a]" />
              </button>
            </div>
          </div>

          {/* Player Name Input Container with Shake */}
          <div key={`name-${shakeTrigger}`} className={`brutalist-container w-full ${nameError ? 'animate-brutal-shake' : ''}`}>
            <input
              placeholder="ENTER YOUR NAME"
              className={`brutalist-input ${nameError ? 'brutalist-input-error' : ''}`}
              style={{
                '--input-shadow-color': cpuGameMode === 'flip' ? '#4c1d95' : '#0956bf',
                '--input-focus-shadow-color': cpuGameMode === 'flip' ? '#8338ec' : '#8338ec',
              } as React.CSSProperties}
              type="text"
              value={cpuPlayerName}
              onChange={(e) => {
                setCpuPlayerName(e.target.value);
                if (e.target.value.trim()) {
                  setNameError(false);
                }
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleStart(); }}
            />
            <label className={`brutalist-label ${nameError ? 'bg-[#cc3333]' : cpuGameMode === 'flip' ? 'bg-brand-flip' : 'bg-brand-blue'}`}>
              {nameError ? 'Name is Required!' : 'Player Name'}
            </label>
          </div>

          {/* Game Mode Switcher with Sliding animated background highlight */}
          <div className="flex flex-col items-center w-full max-w-[256px] mt-2 mb-4">
            <div className="flex w-full bg-neutral-card border-2 border-[#0f172a] rounded-[14px] p-0.5 shadow-[2px_2px_0_#0f172a] overflow-hidden relative">
              <motion.div
                className="absolute top-0.5 bottom-0.5 rounded-[10px] border-2 border-[#0f172a] shadow-[1px_1px_0_#0f172a] z-0"
                style={{ width: 'calc(50% - 3px)' }}
                animate={{
                  x: cpuGameMode === 'classic' ? 0 : '100%',
                  backgroundColor: cpuGameMode === 'classic' ? '#cc3333' : '#4c1d95'
                }}
                transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              />

              <button
                onClick={() => setCpuGameMode('classic')}
                className={`flex-1 py-1.5 text-[10px] font-black tracking-wider uppercase rounded-[10px] cursor-pointer relative z-10 transition-colors duration-200 ${cpuGameMode === 'classic' ? 'text-white' : 'text-[#0f172a] hover:bg-neutral-bg/30'
                  }`}
              >
                Classic
              </button>
              <button
                onClick={() => setCpuGameMode('flip')}
                className={`flex-1 py-1.5 text-[10px] font-black tracking-wider uppercase rounded-[10px] cursor-pointer relative z-10 transition-colors duration-200 ${cpuGameMode === 'flip' ? 'text-white' : 'text-[#0f172a] hover:bg-neutral-bg/30'
                  }`}
              >
                Flip
              </button>
            </div>
          </div>

          {/* Bot Builder section formatted like the lobby players list */}
          <div key={`bots-${shakeTrigger}`} className={`w-full bg-neutral-bg border-2 border-[#0f172a] rounded-[16px] p-4 shadow-[3px_3px_0_#0f172a] mb-5 flex flex-col ${botError && bots.length < 1 ? 'animate-brutal-shake border-brand-red ring-2 ring-brand-red/30' : ''}`}>
            <div className="flex items-center justify-between border-b-2 border-[#0f172a] pb-1.5 mb-2.5">
              <div className={`text-[10px] font-black uppercase tracking-widest text-left ${botError && bots.length < 1 ? 'text-brand-red' : 'text-neutral-text'}`}>
                {botError && bots.length < 1 ? 'Add at least 1 bot!' : `Opponents (${bots.length}/3)`}
              </div>
              <button
                onClick={addBot}
                disabled={bots.length >= 3}
                className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border-2 border-[#0f172a] shadow-[1px_1px_0_#0f172a] transition-all cursor-pointer ${bots.length >= 3
                    ? 'opacity-40 cursor-not-allowed bg-neutral-bg text-[#0f172a]'
                    : 'bg-brand-green text-white hover:bg-green-600 active:scale-95'
                  }`}
              >
                + Add Bot
              </button>
            </div>

            {bots.length === 0 ? (
              <div className="w-full py-6 border-2 border-dashed border-[#0f172a] rounded-[12px] flex flex-col items-center justify-center gap-2 text-neutral-muted bg-neutral-card">
                <Cpu className="w-8 h-8 opacity-30" />
                <span className="text-[10px] font-black uppercase tracking-wider opacity-50">No bots added yet</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2 w-full max-h-[150px] overflow-y-auto no-scrollbar">
                <AnimatePresence>
                  {bots.map((bot) => (
                    <motion.div
                      key={bot.id}
                      layout
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="flex items-center justify-between border-2 border-[#0f172a] rounded-[10px] p-2 shadow-[1.5px_1.5px_0_#0f172a] bg-white"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full border border-[#0f172a] overflow-hidden flex-shrink-0 bg-neutral-bg">
                          {bot.avatarUri ? (
                            <img src={bot.avatarUri} alt={bot.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-brand-blue" />
                          )}
                        </div>
                        <div className="flex flex-col text-left">
                          <span className="font-bold text-xs text-[#0f172a]">{bot.name}</span>
                          <span className="text-[8px] font-black text-neutral-muted uppercase tracking-wider">AI Bot</span>
                        </div>
                      </div>
                      <button
                        onClick={() => removeBot(bot.id)}
                        className="p-1 border border-[#0f172a] rounded bg-brand-red text-white hover:bg-red-700 active:scale-90 transition-all shadow-[1px_1px_0_#0f172a] cursor-pointer flex items-center justify-center"
                        title={`Remove ${bot.name}`}
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* 3D Start Game Button */}
          <button
            id="cpu-start-game-btn"
            onClick={handleStart}
            disabled={isLoading}
            className={`btn-3d w-[256px] mt-4 ${isLoading ? 'opacity-75 cursor-not-allowed' : ''}`}
          >
            <span className="btn-3d-shadow" />
            <span className={`btn-3d-edge ${cpuGameMode === 'flip' ? 'btn-3d-edge-purple' : 'btn-3d-edge-green'}`} />
            <div className={`btn-3d-front ${cpuGameMode === 'flip' ? 'btn-3d-front-purple' : 'btn-3d-front-green'} flex items-center justify-center relative w-full px-12 gap-2 text-xs font-bold uppercase tracking-wider`}>
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span className="select-none">Starting...</span>
                </>
              ) : (
                <span className="select-none">Start Game</span>
              )}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const { height } = useWindowSize();
  const isShort = height < 680;
  const isVeryShort = height < 520;

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
  const roomRef = useRef(room);
  useEffect(() => {
    roomRef.current = room;
  }, [room]);
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
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);
  const [lastPlayedCardKey, setLastPlayedCardKey] = useState<string | null>(null);
  const [pendingWildCard, setPendingWildCard] = useState<{ cardId: string; key: string } | null>(null);
  const lastWinnerRef = useRef<string | null>(null);
  // Game notification banner state
  const [gameNotification, setGameNotification] = useState<{ message: string; type: 'info' | 'success' | 'warning' | 'error' } | null>(null);

  useEffect(() => {
    if (gameNotification) {
      const timer = setTimeout(() => {
        setGameNotification(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [gameNotification]);
  // Tracks whether the current game was started as a CPU game (to skip lobby flash)
  const isCpuGameRef = useRef(false);

  // Custom Alert / Confirm Modal State
  const [activeModal, setActiveModal] = useState<{
    type: 'alert' | 'confirm';
    title?: string;
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;
  } | null>(null);

  useEffect(() => {
    if (room && room.winner) {
      if (room.winner !== lastWinnerRef.current) {
        lastWinnerRef.current = room.winner;
        const isVictory = room.winner === myPlayerId;
        if (soundEnabled) {
          playGameEndSound(isVictory);
        }
        if (isVictory) {
          triggerVictoryConfetti();
        }
      }
    } else {
      lastWinnerRef.current = null;
    }
  }, [room?.winner, myPlayerId, soundEnabled]);

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
    isCpuGameRef.current = false;
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
      setActiveModal({
        type: 'alert',
        message: 'Need at least 2 players to start the game.',
        onConfirm: () => setActiveModal(null)
      });
      return;
    }
    const notReady = room.players.find((p: any) => p.id !== room.hostId && !p.isReady);
    if (notReady) {
      setActiveModal({
        type: 'alert',
        message: `Waiting for all players to ready up (e.g., ${notReady.name} is not ready).`,
        onConfirm: () => setActiveModal(null)
      });
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
      // For CPU games the server immediately fires game_started, skip the lobby
      if (!isCpuGameRef.current) {
        setView('lobby');
      }
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
      if (updatedRoom && !updatedRoom.gameStarted) {
        setView('lobby');
      }
    });

    socket.on('game_state_updated', (updatedRoom) => {
      console.log('Socket game_state_updated received. Payload:', updatedRoom);
      setRoom((prevRoom: any) => {
        if (prevRoom && updatedRoom) {
          const prevDiscardSize = prevRoom.discardPileSize || 0;
          const nextDiscardSize = updatedRoom.discardPileSize || 0;
          const prevDeckSize = prevRoom.deckSize || 0;
          const nextDeckSize = updatedRoom.deckSize || 0;

          if (nextDiscardSize > prevDiscardSize) {
            playSoundEffect('play', soundEnabledRef.current);
          } else if (nextDiscardSize < prevDiscardSize && nextDiscardSize > 0) {
            playSoundEffect('shuffle', soundEnabledRef.current);
          } else if (nextDeckSize < prevDeckSize && nextDiscardSize === prevDiscardSize) {
            playSoundEffect('draw', soundEnabledRef.current);
          }
        }
        return updatedRoom;
      });
      if (updatedRoom && updatedRoom.gameStarted) {
        setView('game');
      }
    });

    socket.on('game_started', () => {
      console.log('Socket game_started received');
      playSoundEffect('shuffle', soundEnabledRef.current);
      setView('game');
    });

    socket.on('uno_called', (data: any) => {
      console.log('Socket uno_called received:', data);
      playSoundEffect('uno', soundEnabledRef.current);
      const currentRoom = roomRef.current;
      const callerName = currentRoom?.players.find((p: any) => p.id === data.playerId)?.name || 'Someone';
      setGameNotification({ message: `${callerName} called UNO! 📣`, type: 'info' });
    });

    socket.on('uno_caught', (data: any) => {
      console.log('Socket uno_caught received:', data);
      playSoundEffect('draw', soundEnabledRef.current);
      const currentRoom = roomRef.current;
      const targetName = currentRoom?.players.find((p: any) => p.id === data.caughtPlayerId)?.name || 'Someone';
      const catcherName = currentRoom?.players.find((p: any) => p.id === data.caughtBy)?.name || 'Someone';
      setGameNotification({ message: `${catcherName} caught ${targetName}! 🫵 ${targetName} draws 2 cards!`, type: 'warning' });
    });

    socket.on('uno_catch_failed', () => {
      console.log('Socket uno_catch_failed received');
      setGameNotification({ message: 'Catch failed! Opponent already called UNO or has more/fewer cards.', type: 'error' });
    });

    socket.on('challenge_resolved', (data: any) => {
      console.log('Socket challenge_resolved received:', data);
      const currentRoom = roomRef.current;
      if (!currentRoom) return;

      const challenger = currentRoom.players.find((p: any) => p.id === data.challengerId)?.name || 'Someone';
      const playedById = data.playedBy || currentRoom.pendingChallenge?.playedBy;
      const playedByPlayer = currentRoom.players.find((p: any) => p.id === playedById)?.name || 'the opponent';

      if (data.guilty) {
        setGameNotification({
          message: `${challenger} successfully challenged ${playedByPlayer}! ${playedByPlayer} draws ${data.cardsDrawn} cards! 🫵`,
          type: 'success'
        });
      } else if (data.guilty === false) {
        setGameNotification({
          message: `${challenger} challenged ${playedByPlayer} but failed! ${challenger} draws ${data.cardsDrawn} cards! ❌`,
          type: 'error'
        });
      } else if (data.accepted) {
        setGameNotification({
          message: `${challenger} accepted the penalty and drew ${data.cardsDrawn} cards. 🤝`,
          type: 'info'
        });
      }
    });

    socket.on('error', (err: any) => {
      console.error('Socket error event received:', err);
      setIsLoading(false);
      setActiveModal({
        type: 'alert',
        title: 'Error',
        message: err.message || 'An error occurred',
        onConfirm: () => setActiveModal(null)
      });
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
      setActiveModal({
        type: 'alert',
        title: 'Reconnection Failed',
        message: data.message || 'Session expired or room no longer exists',
        onConfirm: () => setActiveModal(null)
      });
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
      setActiveModal({
        type: 'alert',
        title: 'Kicked From Room',
        message: data.message || 'You have been kicked by the host',
        onConfirm: () => setActiveModal(null)
      });
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
      socket.off('uno_called');
      socket.off('uno_caught');
      socket.off('challenge_resolved');
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

  // Render Custom Alert/Confirm Modal
  const renderModal = () => {
    return (
      <AnimatePresence>
        {activeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="relative bg-white border-3 border-[#0f172a] rounded-[24px] p-6 shadow-[8px_8px_0_#0f172a] flex flex-col items-center max-w-sm w-full font-sans"
            >
              {/* Modal header/title if any */}
              {activeModal.title && (
                <div className={`border-2 border-[#0f172a] px-5 py-2 rounded-[8px] shadow-[2px_2px_0_#0f172a] -mt-10 mb-4 transform -rotate-1 flex items-center gap-2 ${
                  activeModal.title.toLowerCase().includes('error') || 
                  activeModal.title.toLowerCase().includes('kick') || 
                  activeModal.title.toLowerCase().includes('fail')
                    ? 'bg-brand-red text-white' 
                    : activeModal.type === 'confirm'
                      ? 'bg-brand-yellow text-[#0f172a]'
                      : 'bg-brand-blue text-white'
                }`}>
                  {(activeModal.title.toLowerCase().includes('error') || 
                    activeModal.title.toLowerCase().includes('kick') || 
                    activeModal.title.toLowerCase().includes('fail')) && (
                    <span className="w-2 h-2 rounded-full bg-white animate-ping shrink-0" />
                  )}
                  <h3 className="font-black text-xs uppercase tracking-wider select-none">
                    {activeModal.title}
                  </h3>
                </div>
              )}

              {/* Message */}
              <p className="text-[#0f172a] font-bold text-center text-sm mb-6 mt-2 leading-relaxed">
                {activeModal.message}
              </p>

              {/* Actions */}
              <div className="flex gap-4 w-full justify-center">
                {activeModal.type === 'confirm' ? (
                  <>
                    <button
                      onClick={() => {
                        if (activeModal.onCancel) activeModal.onCancel();
                        setActiveModal(null);
                      }}
                      className="px-4 py-2 border-2 border-[#0f172a] rounded-md bg-white hover:bg-neutral-100 text-[#0f172a] font-black text-xs uppercase tracking-wider cursor-pointer shadow-[2px_2px_0_#0f172a] transition-all duration-150 active:translate-y-[2px] active:shadow-[0px_0px_0_#0f172a]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        activeModal.onConfirm();
                      }}
                      className="px-4 py-2 border-2 border-[#0f172a] rounded-md bg-brand-red hover:bg-red-700 text-white font-black text-xs uppercase tracking-wider cursor-pointer shadow-[2px_2px_0_#0f172a] transition-all duration-150 active:translate-y-[2px] active:shadow-[0px_0px_0_#0f172a]"
                    >
                      Confirm
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      activeModal.onConfirm();
                    }}
                    className="px-6 py-2 border-2 border-[#0f172a] rounded-md bg-brand-blue hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider cursor-pointer shadow-[2px_2px_0_#0f172a] transition-all duration-150 active:translate-y-[2px] active:shadow-[0px_0px_0_#0f172a]"
                  >
                    OK
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  };

  // Render Rule Book Modal
  const renderRuleBookModal = () => {
    if (!isRuleBookOpen) return null;
    const isFlipMode = room?.gameMode === 'flip';
    return (
      <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm pointer-events-auto">
        <div className="relative w-full max-w-xl bg-white border-3 border-[#0f172a] rounded-[20px] shadow-[8px_8px_0_#0f172a] flex flex-col max-h-[80vh]">
          {/* Modal Header */}
          <div className="bg-brand-red border-b-3 border-[#0f172a] px-6 py-4 rounded-t-[17px] flex items-center justify-between">
            <h3 className="text-white font-black text-sm sm:text-base tracking-wider uppercase">
              {isFlipMode ? 'UNO FLIP™ Official Rules' : 'UNO Classic Official Rules'}
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
            {isFlipMode ? (
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
    );
  };

  if (view === 'friends') {
    return (
      <div className="min-h-[100dvh] overflow-y-auto bg-neutral-bg text-neutral-text flex flex-col items-center justify-center py-10 px-4 sm:px-6 font-sans">
        <BetaPill />
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
        {renderModal()}
      </div>
    );
  }

  // ─── Play with Computer View ────────────────────────────────────────────────

  if (view === 'computer') {
    // Bot name pool (Indian + US names — no extra library needed)
    const INDIAN_NAMES = ['Arjun', 'Priya', 'Ravi', 'Kavya', 'Vikram', 'Ananya', 'Rohan', 'Divya', 'Amit', 'Pooja'];
    const US_NAMES = ['Jake', 'Emily', 'Tyler', 'Sarah', 'Brandon', 'Olivia', 'Mason', 'Emma', 'Logan', 'Ava'];
    const ALL_BOT_NAMES = [...INDIAN_NAMES, ...US_NAMES];
    const BOT_BG_COLORS = ['cc3333', '0956bf', '379711', '8338ec', 'e67e22', '1abc9c', 'c0392b', '2980b9'];

    return (
      <>
        <CpuLobbyView
          avatarOffset={avatarOffset}
          onNextAvatar={handleNextAvatar}
          isLoading={isLoading}
          allBotNames={ALL_BOT_NAMES}
          botBgColors={BOT_BG_COLORS}
          onBack={() => setView('main')}
          onStart={(cpuPlayerName: string, cpuGameMode: 'classic' | 'flip', cpuBots: any[], cpuAvatarSeed: string) => {
            try { localStorage.removeItem('uno_reconnect_token'); } catch (_) { }
            isCpuGameRef.current = true;
            setIsLoading(true);
            const doStart = () => {
              socket.emit('create_bot_room', {
                playerName: cpuPlayerName,
                gameMode: cpuGameMode,
                avatarSeed: cpuAvatarSeed,
                bots: cpuBots
              });
            };
            if (socket.connected) {
              doStart();
            } else {
              socket.disconnect();
              socket.once('connect', doStart);
              socket.connect();
            }
          }}
        />
        {renderModal()}
      </>
    );
  }

  if (view === 'lobby' && room) {

    const isHost = myPlayerId === room.hostId;
    const canStart = room.players.length >= 2 && room.players.every((p: any) => p.isReady || p.id === room.hostId);

    return (
      <div className="min-h-[100dvh] overflow-y-auto bg-neutral-bg text-neutral-text flex flex-col items-center justify-center py-10 px-4 sm:px-6 font-sans">
        <BetaPill />
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

        {renderRuleBookModal()}
        {renderModal()}
      </div>
    );
  }

  if (view === 'game' && room) {
    const myPlayer = room.players.find((p: any) => p.id === myPlayerId);
    const player = myPlayer || room.players[0];
    const hand = Array.isArray(player?.hand) ? player.hand : [];

    const opponents = (() => {
      if (!room || !room.players || !myPlayerId) return [];
      const myIndex = room.players.findIndex((p: any) => p.id === myPlayerId);
      if (myIndex === -1) return [];

      const list = [];
      const len = room.players.length;
      for (let i = 1; i < len; i++) {
        const idx = (myIndex + i) % len;
        list.push(room.players[idx]);
      }
      return list;
    })();

    const scoreboardPlayers = (() => {
      if (!room || !room.players) return [];
      return [...room.players].sort((a: any, b: any) => (a.handCardCount || 0) - (b.handCardCount || 0));
    })();

    const GAME_BACKGROUNDS: Record<string, string> = {
      RED: '#cc3333',     // Official Mattel Red
      BLUE: '#0956bf',    // Official UNO Blue
      GREEN: '#379711',   // Official UNO Green
      YELLOW: '#ecd407',  // Official UNO Yellow
      PINK: '#ec4899',    // Official Flip Pink
      TEAL: '#14b8a6',    // Official Flip Teal
      ORANGE: '#f97316',  // Official Flip Orange
      PURPLE: '#8b5cf6',  // Official Flip Purple
    };

    const activeColor = room.currentColor?.toUpperCase() || 'GREEN';
    const bgColor = GAME_BACKGROUNDS[activeColor] || '#379711';

    return (
      <LayoutGroup>
        <div 
          style={{ 
            backgroundColor: bgColor,
            backgroundImage: 'radial-gradient(circle at center, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.5) 100%)',
            backgroundBlendMode: 'multiply'
          }}
          className={`h-screen w-screen relative overflow-hidden font-sans select-none flex flex-col items-center justify-end transition-colors duration-500 ${isVeryShort ? 'pb-4' : (isShort ? 'pb-8' : 'pb-16')}`}
        >
          <BetaPill />

          {/* Transient Notification Banner */}
          <AnimatePresence>
            {gameNotification && (
              <motion.div
                initial={{ opacity: 0, y: -50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="absolute top-6 left-1/2 -translate-x-1/2 z-[400] max-w-sm w-full px-4"
              >
                <div
                  className={`border-3 border-[#0f172a] rounded-[16px] p-4 shadow-[4px_4px_0_#0f172a] text-center font-black uppercase text-xs tracking-wider flex items-center justify-center gap-2 select-none ${
                    gameNotification.type === 'info'
                      ? 'bg-[#ecd407] text-[#0f172a]'
                      : gameNotification.type === 'warning'
                      ? 'bg-[#ec4899] text-white'
                      : gameNotification.type === 'error'
                      ? 'bg-[#cc3333] text-white'
                      : 'bg-white text-[#0f172a]'
                  }`}
                >
                  <span>{gameNotification.message}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Opponents Avatars and Cards */}
          {opponents.map((opp, idx) => {
            let fanDirection: 'left' | 'right' | 'down' = 'down';
            let layoutClass = 'flex items-center gap-8 sm:gap-12';

            const scaleVal = isVeryShort ? 0.7 : (isShort ? 0.85 : 1.0);
            const oppTop = isVeryShort ? '28%' : (isShort ? '32%' : '40%');
            const positionStyle: React.CSSProperties = {
              position: 'absolute',
              zIndex: 30,
            };

            if (opponents.length === 1) {
              // 1 Opponent: Top Center
              positionStyle.left = '50%';
              positionStyle.top = isVeryShort ? '8px' : '24px';
              positionStyle.transform = `translateX(-50%) scale(${scaleVal})`;
              positionStyle.transformOrigin = 'top center';
              fanDirection = 'down';
              layoutClass = 'flex items-center gap-8 sm:gap-12 flex-row-reverse';
            } else if (opponents.length === 2) {
              // 2 Opponents: Left Center, Right Center
              if (idx === 0) {
                positionStyle.left = isVeryShort ? '8px' : '24px';
                positionStyle.top = oppTop;
                positionStyle.transform = `translateY(-50%) scale(${scaleVal})`;
                positionStyle.transformOrigin = 'left center';
                fanDirection = 'right';
                layoutClass = 'flex items-center gap-8 sm:gap-12';
              } else {
                positionStyle.right = isVeryShort ? '8px' : '24px';
                positionStyle.top = oppTop;
                positionStyle.transform = `translateY(-50%) scale(${scaleVal})`;
                positionStyle.transformOrigin = 'right center';
                fanDirection = 'left';
                layoutClass = 'flex items-center gap-8 sm:gap-12 flex-row-reverse';
              }
            } else {
              // 3 Opponents: Left, Top, Right
              if (idx === 0) {
                positionStyle.left = isVeryShort ? '8px' : '24px';
                positionStyle.top = oppTop;
                positionStyle.transform = `translateY(-50%) scale(${scaleVal})`;
                positionStyle.transformOrigin = 'left center';
                fanDirection = 'right';
                layoutClass = 'flex items-center gap-8 sm:gap-12';
              } else if (idx === 1) {
                positionStyle.left = '50%';
                positionStyle.top = isVeryShort ? '8px' : '24px';
                positionStyle.transform = `translateX(-50%) scale(${scaleVal})`;
                positionStyle.transformOrigin = 'top center';
                fanDirection = 'down';
                layoutClass = 'flex items-center gap-8 sm:gap-12 flex-row-reverse';
              } else {
                positionStyle.right = isVeryShort ? '8px' : '24px';
                positionStyle.top = oppTop;
                positionStyle.transform = `translateY(-50%) scale(${scaleVal})`;
                positionStyle.transformOrigin = 'right center';
                fanDirection = 'left';
                layoutClass = 'flex items-center gap-8 sm:gap-12 flex-row-reverse';
              }
            }

            return (
              <div key={opp.id} style={positionStyle} className="transition-all duration-300">
                <div className={layoutClass}>
                  <GamePlayerAvatar
                    name={opp.name}
                    avatarSeed={opp.avatarSeed || opp.name}
                    cardCount={opp.handCardCount || 0}
                    isTurn={room.players[room.currentTurn]?.id === opp.id}
                    isMe={false}
                    turnStartedAt={room.turnStartedAt}
                  />
                  <div className="relative flex items-center justify-center h-[86px] sm:h-[136px]">
                    <OpponentCardFan
                      cardCount={opp.handCardCount || 0}
                      direction={fanDirection}
                      side={room.side}
                      gameMode={room.gameMode}
                      isShort={isShort}
                      isVeryShort={isVeryShort}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {/* Active Player Avatar Badge (Bottom Left) */}
          <div
            className="absolute z-[250] transition-all duration-300"
            style={{
              left: isVeryShort ? '16px' : (isShort ? '24px' : '32px'),
              bottom: isVeryShort ? '16px' : (isShort ? '24px' : '32px'),
              transform: isVeryShort ? 'scale(0.7)' : (isShort ? 'scale(0.85)' : 'scale(1.0)'),
              transformOrigin: 'bottom left'
            }}
          >
            <GamePlayerAvatar
              name={player?.name || ''}
              avatarSeed={player?.avatarSeed || ''}
              cardCount={hand.length}
              isTurn={room.players[room.currentTurn]?.id === myPlayerId}
              isMe={true}
              turnStartedAt={room.turnStartedAt}
            />
          </div>

          {/* UNO and Catch UNO Action Panel (Bottom Right) */}
          <div
            className="absolute z-[250] flex flex-col items-end gap-3 transition-all duration-300 pointer-events-auto"
            style={{
              right: isVeryShort ? '16px' : (isShort ? '24px' : '32px'),
              bottom: isVeryShort ? '16px' : (isShort ? '24px' : '32px'),
              transform: isVeryShort ? 'scale(0.7)' : (isShort ? 'scale(0.85)' : 'scale(1.0)'),
              transformOrigin: 'bottom right'
            }}
          >
            <AnimatePresence>
              {room.unoCatchablePlayerId && room.unoCatchablePlayerId !== myPlayerId && (
                <motion.button
                  initial={{ scale: 0, rotate: -15, y: 15 }}
                  animate={{ scale: 1, rotate: 0, y: 0 }}
                  exit={{ scale: 0, rotate: -15, y: 15 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  onClick={() => {
                    socket.emit('catch_uno', { roomId: room.roomId });
                  }}
                  className="btn-3d w-44"
                >
                  <span className="btn-3d-shadow" />
                  <span className="btn-3d-edge" style={{ 
                    background: 'linear-gradient(to left, #7c2d12 0%, #ea580c 8%, #ea580c 92%, #7c2d12 100%)' 
                  }} />
                  <div className="btn-3d-front px-4 flex items-center justify-center gap-2 font-black select-none uppercase tracking-wider text-xs border-3 border-[#0f172a] text-white bg-orange-600 h-12 shadow-inner animate-pulse">
                    <Zap className="w-4 h-4" />
                    <span>Caught!</span>
                  </div>
                </motion.button>
              )}
            </AnimatePresence>

            <button
              onClick={() => {
                socket.emit('call_uno', { roomId: room.roomId });
              }}
              disabled={room.unoStates[myPlayerId] || hand.length > 2}
              className={`btn-3d w-44 transition-all ${room.unoStates[myPlayerId] || hand.length > 2 ? 'opacity-50 cursor-not-allowed filter grayscale' : ''}`}
            >
              <span className="btn-3d-shadow" />
              {room.unoStates[myPlayerId] ? (
                <>
                  <span className="btn-3d-edge" style={{ 
                    background: 'linear-gradient(to left, #14532d 0%, #166534 8%, #166534 92%, #14532d 100%)' 
                  }} />
                  <div className="btn-3d-front flex items-center justify-center gap-2 font-black select-none uppercase tracking-widest text-xs border-3 border-[#0f172a] text-white bg-[#166534] h-12">
                    <Check className="w-4 h-4" />
                    <span>UNO Called</span>
                  </div>
                </>
              ) : (
                <>
                  <span className="btn-3d-edge btn-3d-edge-red" />
                  <div className="btn-3d-front btn-3d-front-red flex items-center justify-center gap-2 font-black select-none uppercase tracking-widest text-xs border-3 border-[#0f172a] text-white h-12">
                    <Megaphone className="w-4 h-4" />
                    <span>UNO!</span>
                  </div>
                </>
              )}
            </button>
          </div>

          {/* Settings button in the top-right */}
          <div
            className="absolute z-50 transition-all duration-300"
            style={{
              top: isVeryShort ? '12px' : '24px',
              right: isVeryShort ? '12px' : '24px',
              transform: isVeryShort ? 'scale(0.8)' : 'scale(1.0)',
              transformOrigin: 'top right'
            }}
          >
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
                        setActiveModal({
                          type: 'confirm',
                          title: 'Leave Game?',
                          message: 'Are you sure you want to leave the game?',
                          onConfirm: () => {
                            handleLeaveLobby();
                            setActiveModal(null);
                          },
                          onCancel: () => setActiveModal(null)
                        });
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

          {/* Center Board (Draw Pile and Discard Pile) */}
          <div
            style={{
              top: isVeryShort ? '28%' : (isShort ? '32%' : '40%'),
              transform: `translate(-50%, -50%) scale(${isVeryShort ? 0.7 : (isShort ? 0.85 : 1.0)})`,
              transformOrigin: 'center center'
            }}
            className="absolute left-1/2 flex items-center justify-center gap-6 sm:gap-16 pointer-events-auto z-10 transition-all duration-300"
          >
            {/* Draw Pile (Clickable to draw a card) */}
            <div
              onClick={() => socket.emit('draw_card', { roomId: room.roomId })}
              className="relative cursor-pointer select-none transition-transform hover:scale-105 active:scale-95 w-[90px] h-[130px] sm:w-[152px] sm:h-[220px]"
              title="Draw Card"
            >
              <div
                className="absolute inset-0 bg-neutral-border rounded-[7px] sm:rounded-[12px] border-3 border-[#0f172a]"
                style={{
                  transform: 'translate(4px, 4px)',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                }}
              />
              <div
                className="absolute inset-0 bg-neutral-border rounded-[7px] sm:rounded-[12px] border-3 border-[#0f172a]"
                style={{
                  transform: 'translate(2px, 2px)',
                  boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
                }}
              />
              <div
                className="absolute inset-0 bg-[#0f172a] rounded-[7px] sm:rounded-[12px] overflow-hidden border-3 border-[#0f172a] flex items-center justify-center shadow-[0_6px_12px_rgba(0,0,0,0.25)]"
              >
                <img
                  src="/cards/Deck.png"
                  alt="Draw Deck"
                  className="w-full h-full object-contain pointer-events-none"
                  style={{
                    imageRendering: 'pixelated',
                    filter: room.gameMode === 'flip' && room.side === 'dark'
                      ? 'hue-rotate(145deg) brightness(0.7) contrast(1.1)'
                      : 'none'
                  }}
                />
              </div>
            </div>

            {/* Discard Pile Stack */}
            <DiscardPile
              room={room}
              side={room.side}
              gameMode={room.gameMode}
              lastPlayedCardKey={lastPlayedCardKey}
              onResetPlayedKey={() => setLastPlayedCardKey(null)}
            />
          </div>

          {/* Fanned Player Cards View in React (Facing the player) */}
          <HandCanvas
            hand={hand}
            side={room.side}
            gameMode={room.gameMode}
            roomId={room.roomId}
            socket={socket}
            onCardPlay={setLastPlayedCardKey}
            room={room}
            myPlayerId={myPlayerId}
            onPlayWild={(cardId, cardKey) => setPendingWildCard({ cardId, key: cardKey })}
            lastPlayedCardKey={lastPlayedCardKey}
            soundEnabled={soundEnabled}
            isShort={isShort}
            isVeryShort={isVeryShort}
          />

          {/* Wild Color Selection Modal */}
          <AnimatePresence>
            {pendingWildCard && (
              <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className="relative bg-white border-3 border-[#0f172a] rounded-[24px] p-6 shadow-[8px_8px_0_#0f172a] flex flex-col items-center max-w-sm w-full"
                >
                  <h3 className="text-[#0f172a] font-black text-lg tracking-wider uppercase mb-5 select-none">
                    Choose a Color
                  </h3>
                  <div className="grid grid-cols-2 gap-4 w-full">
                    {(() => {
                      const isDarkSide = room.gameMode === 'flip' && room.side === 'dark';
                      const colors = isDarkSide
                        ? [
                          { name: 'PINK', hex: '#ec4899', hover: '#db2777', text: 'white' },
                          { name: 'TEAL', hex: '#14b8a6', hover: '#0d9488', text: 'white' },
                          { name: 'ORANGE', hex: '#f97316', hover: '#ea580c', text: 'white' },
                          { name: 'PURPLE', hex: '#8b5cf6', hover: '#7c3aed', text: 'white' }
                        ]
                        : [
                          { name: 'RED', hex: '#cc3333', hover: '#b32424', text: 'white' },
                          { name: 'BLUE', hex: '#0956bf', hover: '#0748a1', text: 'white' },
                          { name: 'GREEN', hex: '#379711', hover: '#2c7a0d', text: 'white' },
                          { name: 'YELLOW', hex: '#ecd407', hover: '#d8c206', text: '#0f172a' }
                        ];
                      return colors.map((c) => (
                        <button
                          key={c.name}
                          onClick={() => {
                            const cardId = pendingWildCard.cardId;
                            const key = pendingWildCard.key;
                            setLastPlayedCardKey(key);
                            socket.emit('play_card', { roomId: room.roomId, cardId, chosenColor: c.name });
                            setPendingWildCard(null);
                          }}
                          style={{ backgroundColor: c.hex }}
                          className="py-4 border-2 border-[#0f172a] rounded-[14px] shadow-[3px_3px_0_#0f172a] hover:scale-105 active:scale-95 transition-all cursor-pointer font-black text-xs uppercase tracking-wider"
                          type="button"
                        >
                          <span style={{ color: c.text }}>{c.name}</span>
                        </button>
                      ));
                    })()}
                  </div>
                  <button
                    onClick={() => setPendingWildCard(null)}
                    className="mt-6 px-4 py-2 border-2 border-[#0f172a] rounded-lg bg-neutral-bg hover:bg-neutral-border text-[#0f172a] font-bold text-xs uppercase cursor-pointer"
                  >
                    Cancel
                  </button>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Challenge Wild Draw Modal */}
          <AnimatePresence>
            {room?.pendingChallenge && (
              <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className="relative bg-white border-3 border-[#0f172a] rounded-[24px] p-6 shadow-[8px_8px_0_#0f172a] flex flex-col items-center max-w-sm w-full"
                >
                  {room.pendingChallenge.targetPlayerId === myPlayerId ? (
                    <>
                      <h3 className="text-[#0f172a] font-black text-lg tracking-wider uppercase mb-2 select-none text-center">
                        {room.pendingChallenge.type.replace(/_/g, ' ')} Played!
                      </h3>
                      <p className="text-xs text-neutral-muted font-bold text-center mb-6 leading-relaxed">
                        {room.players.find((p: any) => p.id === room.pendingChallenge.playedBy)?.name || 'Someone'} played a {room.pendingChallenge.type.replace(/_/g, ' ')}. You can challenge it if you think they had a matching color card in their hand!
                      </p>
                      <div className="flex flex-col gap-3 w-full">
                        <button
                          onClick={() => socket.emit('challenge_wild_draw_four', { roomId: room.roomId, wantsToChallenge: true })}
                          className="btn-3d w-full"
                        >
                          <span className="btn-3d-shadow" />
                          <span className="btn-3d-edge btn-3d-edge-purple" />
                          <div className="btn-3d-front btn-3d-front-purple flex items-center justify-center font-bold select-none uppercase tracking-wider text-xs">
                            Challenge Play
                          </div>
                        </button>
                        <button
                          onClick={() => socket.emit('challenge_wild_draw_four', { roomId: room.roomId, wantsToChallenge: false })}
                          className="btn-3d w-full"
                        >
                          <span className="btn-3d-shadow" />
                          <span className="btn-3d-edge btn-3d-edge-blue" />
                          <div className="btn-3d-front btn-3d-front-blue flex items-center justify-center font-bold select-none uppercase tracking-wider text-xs">
                            Accept (+Draw)
                          </div>
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 className="text-[#0f172a] font-black text-lg tracking-wider uppercase mb-2 select-none text-center animate-pulse">
                        Resolving Challenge...
                      </h3>
                      <p className="text-xs text-neutral-muted font-bold text-center leading-relaxed">
                        Waiting for {room.players.find((p: any) => p.id === room.pendingChallenge.targetPlayerId)?.name || 'the next player'} to decide whether to challenge the play.
                      </p>
                    </>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Game End Victory/Defeat Modal Overlay */}
          <AnimatePresence>
            {room.winner && (
              <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 30 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 30 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className="relative bg-white border-3 border-[#0f172a] rounded-[24px] p-6 sm:p-8 shadow-[8px_8px_0_#0f172a] flex flex-col items-center max-w-md w-full select-none max-h-[90vh] overflow-y-auto"
                >
                  {/* Visual Header */}
                  {room.winner === myPlayerId ? (
                    <div className="flex flex-col items-center mb-6">
                      <Crown className="w-12 h-12 text-brand-yellow drop-shadow-[0_2px_4px_rgba(0,0,0,0.15)] animate-bounce" style={{ fill: '#ecd407' }} />
                      <h2 className="text-[#0f172a] font-black text-3xl tracking-widest uppercase mt-2">
                        Victory!
                      </h2>
                      <p className="text-xs font-black text-brand-green uppercase tracking-wider mt-1 animate-pulse">
                        You dominated the table!
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center mb-6">
                      <h2 className="text-[#0f172a] font-black text-3xl tracking-widest uppercase">
                        Defeat
                      </h2>
                      <p className="text-xs font-black text-neutral-muted uppercase tracking-wider mt-1">
                        Better luck next round!
                      </p>
                    </div>
                  )}

                  {/* Winner's Avatar Showcase */}
                  {(() => {
                    const winnerPlayer = room.players.find((p: any) => p.id === room.winner);
                    if (!winnerPlayer) return null;
                    const winnerAvatarUri = createAvatar(adventurer, {
                      seed: winnerPlayer.avatarSeed || winnerPlayer.name,
                      backgroundColor: ['cc3333', '0956bf', '379711', '8338ec']
                    }).toDataUri();

                    return (
                      <div className="flex flex-col items-center mb-6">
                        <div className={`relative w-20 h-20 bg-white border-4 border-[#0f172a] rounded-[16px] shadow-[4px_4px_0_#0f172a] overflow-hidden flex items-center justify-center ${room.winner === myPlayerId ? 'ring-4 ring-brand-yellow' : ''}`}>
                          {winnerAvatarUri && (
                            <img src={winnerAvatarUri} alt={winnerPlayer.name} className="w-full h-full object-cover" />
                          )}
                        </div>
                        <span className="font-extrabold text-sm text-[#0f172a] uppercase tracking-wide mt-3">
                          {winnerPlayer.name} takes the crown
                        </span>
                      </div>
                    );
                  })()}

                  {/* Scoreboard / Leaderboard Table */}
                  <div className="w-full bg-neutral-bg border-2 border-[#0f172a] rounded-[16px] p-4 shadow-[3px_3px_0_#0f172a] mb-6">
                    <div className="text-[10px] font-black text-neutral-text uppercase tracking-widest border-b-2 border-[#0f172a] pb-1.5 mb-2.5 text-left">
                      Round Standings
                    </div>
                    <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto no-scrollbar">
                      {scoreboardPlayers.map((p: any, rankIdx: number) => {
                        const avatarUri = createAvatar(adventurer, {
                          seed: p.avatarSeed || p.name,
                          backgroundColor: ['cc3333', '0956bf', '379711', '8338ec']
                        }).toDataUri();
                        const isSelf = p.id === myPlayerId;

                        return (
                          <div
                            key={p.id}
                            className={`flex items-center justify-between border-2 border-[#0f172a] rounded-[10px] p-2 shadow-[1.5px_1.5px_0_#0f172a] ${isSelf ? 'bg-white' : 'bg-neutral-card'}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-black text-xs text-[#0f172a] w-4 text-center">
                                #{rankIdx + 1}
                              </span>
                              <div className="w-7 h-7 rounded-full border border-[#0f172a] overflow-hidden bg-neutral-bg">
                                <img src={avatarUri} alt={p.name} className="w-full h-full object-cover" />
                              </div>
                              <span className="font-bold text-xs text-[#0f172a] truncate max-w-[120px]">
                                {p.name}
                              </span>
                            </div>
                            <span className="text-[10px] font-black text-neutral-text bg-white px-2 py-0.5 border border-[#0f172a] rounded">
                              {p.handCardCount || 0} cards
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-3 w-full items-center">
                    {myPlayerId === room.hostId ? (
                      <button
                        onClick={() => socket.emit('back_to_lobby', { roomId: room.roomId })}
                        className="btn-3d w-full"
                      >
                        <span className="btn-3d-shadow" />
                        <span className="btn-3d-edge btn-3d-edge-blue" />
                        <div className="btn-3d-front btn-3d-front-blue flex items-center justify-center font-bold select-none uppercase tracking-wider text-xs">
                          Back to Lobby
                        </div>
                      </button>
                    ) : (
                      <div className="text-[10px] font-black text-neutral-muted uppercase tracking-wider text-center py-2 animate-pulse">
                        Waiting for host to return to lobby...
                      </div>
                    )}

                    <button
                      onClick={() => {
                        setActiveModal({
                          type: 'confirm',
                          title: 'Leave Room?',
                          message: 'Are you sure you want to leave this game room?',
                          onConfirm: () => {
                            handleLeaveLobby();
                            setActiveModal(null);
                          },
                          onCancel: () => setActiveModal(null)
                        });
                      }}
                      className="btn-3d w-full"
                    >
                      <span className="btn-3d-shadow" />
                      <span className="btn-3d-edge btn-3d-edge-red" />
                      <div className="btn-3d-front btn-3d-front-red flex items-center justify-center font-bold select-none uppercase tracking-wider text-xs">
                        Leave Room
                      </div>
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {renderModal()}
          {renderRuleBookModal()}
        </div>
      </LayoutGroup>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-neutral-bg text-neutral-text flex flex-col items-center justify-center py-10 px-4 sm:px-6 font-sans">
      <BetaPill />
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
      {renderModal()}
    </div>
  );
}

export default App;
