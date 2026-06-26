import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { Users, Cpu, ArrowLeft, Crown, Copy, Check, UserMinus, Settings, BookOpen, Volume2, VolumeX, LogOut, Megaphone, Zap, X } from 'lucide-react';
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


function getCardSoundFile(
  cardId: string,
  side: 'light' | 'dark' = 'light',
  gameMode: 'classic' | 'flip' | 'mercy' = 'classic',
  currentColor?: string,
  _prevColor?: string
): string {
  try {
    const face = getActiveCardFaceFrontend(cardId, side, gameMode);
    const parts = face.split('_');

    const type = parts[1];
    const type2 = parts[2];

    // Power cards: keep the m-0x character voice sounds
    if (type === 'REVERSE') {
      return '/sounds/sound effects/m-05-revers.mp3';
    }
    if (type === 'SKIP') {
      return '/sounds/sound effects/m-06-skip.mp3';
    }
    if (type === 'DRAW' && type2 === 'TWO') {
      return '/sounds/sound effects/m-07-draw2.mp3';
    }
    if (type === 'DRAW' && type2 === 'FOUR') {
      return '/sounds/sound effects/m-08-draw4.mp3';
    }


    // Wild cards only: announce chosen color
    if (face === 'WILD' || face.startsWith('WILD_')) {
      const activeColor = currentColor || 'BLUE';
      if (activeColor === 'RED' || activeColor === 'PINK') {
        return '/sounds/sound effects/m-02-red.mp3';
      }
      if (activeColor === 'BLUE' || activeColor === 'PURPLE') {
        return '/sounds/sound effects/m-04-blue.mp3';
      }
      if (activeColor === 'GREEN' || activeColor === 'TEAL') {
        return '/sounds/sound effects/m-01-green.mp3';
      }
      if (activeColor === 'YELLOW' || activeColor === 'ORANGE') {
        return '/sounds/sound effects/m-03-ylow.mp3';
      }
    }

    // All other cards: original card whoosh sound
    return '/sounds/card-play.mp3';
  } catch (e) {
    // fallback below
  }
  return '/sounds/card-play.mp3';
}

// Play public sound effects
function playSoundEffect(
  soundName: 'draw' | 'play' | 'shuffle' | 'win' | 'lose' | 'uno' | 'drag' | 'turn' | 'invalid' | 'copy' | 'challenge' | 'stack' | 'knockout',
  enabled = true,
  cardId?: string,
  gameMode?: 'classic' | 'flip' | 'mercy',
  side?: 'light' | 'dark',
  currentColor?: string,
  prevColor?: string
) {
  if (!enabled) return;
  try {
    let filePath = '';
    let volume = 0.65;
    switch (soundName) {
      case 'draw':
        // Card draw sound (restored for penalty/stack draws)
        filePath = '/sounds/card-draw.mp3';
        volume = 0.6;
        break;
      case 'shuffle':
        // Original card shuffle sound (restored)
        filePath = '/sounds/card-shuffle.mp3';
        volume = 0.6;
        break;
      case 'win':
        filePath = '/sounds/win.mp3';
        volume = 0.65;
        break;
      case 'lose':
        filePath = '/sounds/lose.mp3';
        volume = 0.65;
        break;
      case 'uno':
        // Downloaded UNO character voice sound
        filePath = '/sounds/sound effects/m-24-uno.mp3';
        volume = 0.75;
        break;
      case 'drag':
        // Original card drag sound (restored)
        filePath = '/sounds/card-drag.mp3';
        volume = 0.35;
        break;
      case 'turn':
        // Player turn sound is completely disabled
        break;
      case 'invalid':
        filePath = '/sounds/sound effects/m-18-oops.mp3';
        volume = 0.55;
        break;
      case 'copy':
        filePath = '/sounds/sound effects/m-22-coptat.mp3';
        volume = 0.65;
        break;
      case 'challenge':
        // Downloaded "call me" sound — fits catching someone without saying UNO
        filePath = '/sounds/sound effects/m-11-callme.mp3';
        volume = 0.7;
        break;
      case 'stack':
        // Stacking sound is disabled to prevent sound clutter
        break;
      case 'knockout':
        // Downloaded "no way" character voice sound - played when someone is eliminated by Mercy rule
        filePath = '/sounds/sound effects/m-21-noway.mp3';
        volume = 0.75;
        break;
      case 'play':
        // Regular cards: original card whoosh; power cards: m-0x voice
        if (cardId) {
          filePath = getCardSoundFile(cardId, side, gameMode, currentColor, prevColor);
        } else {
          filePath = '/sounds/card-play.mp3';
        }
        volume = 0.65;
        break;
      default:
        filePath = '/sounds/card-play.mp3';
    }
    if (!filePath) return;
    const audio = new Audio(filePath);
    audio.volume = volume;
    audio.play().catch(e => console.warn(`Audio play for ${soundName} (${filePath}) blocked or failed:`, e));
  } catch (e) {
    console.warn(`Audio initialization for ${soundName} failed:`, e);
  }
}

function playGameEndSound(isVictory: boolean) {
  try {
    const audio = new Audio(isVictory ? '/sounds/win.mp3' : '/sounds/lose.mp3');
    audio.volume = 0.65;
    audio.play().catch((err) => {
      console.warn('MP3 game end sound failed, falling back to synth:', err);
      playGameEndSoundSynth(isVictory);
    });
  } catch (e) {
    playGameEndSoundSynth(isVictory);
  }
}

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
  gameMode?: 'classic' | 'flip' | 'mercy';
  disabled?: boolean;
  style?: React.CSSProperties;
}

const getActiveCardFaceFrontend = (cardId: string, side: 'light' | 'dark' = 'light', gameMode: 'classic' | 'flip' | 'mercy' = 'classic'): string => {
  if (gameMode === 'classic' || gameMode === 'mercy') return cardId;
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

// Number index to word name for UNO Flip assets
const FLIP_NUM_WORD: Record<string, string> = {
  '1': 'ONE', '2': 'TWO', '3': 'THREE', '4': 'FOUR', '5': 'FIVE',
  '6': 'SIX', '7': 'SEVEN', '8': 'EIGHT', '9': 'NINE'
};

const CLASSIC_AR = 259.76917 / 402.27795;

const getCardAssetUrl = (cardId: string, side: 'light' | 'dark' = 'light', gameMode: 'classic' | 'flip' | 'mercy' = 'classic'): string => {
  if (!cardId) {
    return '/cards/back.svg';
  }

  const face = getActiveCardFaceFrontend(cardId, side, gameMode);

  // ── UNO NO MERCY mode: use mercy WebP assets ───────────────────────────────
  if (gameMode === 'mercy') {
    // Wild cards
    if (face === 'WILD') return '/cards/mercy/wild_roulette.webp'; // plain wild uses roulette art
    if (face === 'WILD_DRAW_FOUR') return '/cards/mercy/wild_draw4.webp';
    if (face === 'WILD_DRAW_SIX') return '/cards/mercy/wild_draw6.webp';
    if (face === 'WILD_DRAW_TEN') return '/cards/mercy/wild_draw10.webp';
    if (face === 'WILD_ROULETTE') return '/cards/mercy/wild_roulette.webp';

    const mercyParts = face.split('_');
    if (mercyParts.length < 2) return '/cards/mercy/wild_roulette.webp';

    const mercyColor = mercyParts[0].toLowerCase(); // red, blue, green, yellow

    // Number cards: RED_NUMBER_0 → red_0.webp
    if (mercyParts[1] === 'NUMBER' && mercyParts[2] !== undefined) {
      return `/cards/mercy/${mercyColor}_${mercyParts[2]}.webp`;
    }
    // Skip → {color}_skip.webp
    if (mercyParts[1] === 'SKIP' && mercyParts.length === 2) {
      return `/cards/mercy/${mercyColor}_skip.webp`;
    }
    // Skip All → {color}_skip_all.webp
    if (mercyParts[1] === 'SKIP' && mercyParts[2] === 'ALL') {
      return `/cards/mercy/${mercyColor}_skip_all.webp`;
    }
    // Reverse → {color}_reverse.webp
    if (mercyParts[1] === 'REVERSE') {
      return `/cards/mercy/${mercyColor}_reverse.webp`;
    }
    // Draw Two → {color}_draw2.webp
    if (mercyParts[1] === 'DRAW' && mercyParts[2] === 'TWO') {
      return `/cards/mercy/${mercyColor}_draw2.webp`;
    }
    // Draw Four (colored) → {color}_draw4.webp
    if (mercyParts[1] === 'DRAW' && mercyParts[2] === 'FOUR') {
      return `/cards/mercy/${mercyColor}_draw4.webp`;
    }
    // Discard All → {color}_discard_all.webp
    if (mercyParts[1] === 'DISCARD' && mercyParts[2] === 'ALL') {
      return `/cards/mercy/${mercyColor}_discard_all.webp`;
    }

    return '/cards/mercy/wild_roulette.webp'; // fallback
  }

  // ── UNO FLIP mode: use flip JPG assets ────────────────────────────────────
  if (gameMode === 'flip') {
    // Wild cards
    if (face === 'WILD') {
      return side === 'dark' ? '/cards/flip/DARK_WILD_CARD.jpg' : '/cards/flip/WILD_CARD.jpg';
    }
    if (face === 'WILD_DRAW_FOUR') {
      return '/cards/flip/WILD_DRAW_FOUR.jpg';
    }
    if (face === 'WILD_DRAW_TWO') {
      // Light-side flip wild draw two — use a representative image
      return '/cards/flip/Blue_WILDTWO.jpg';
    }
    if (face === 'WILD_DRAW_COLOR') {
      // Dark-side flip wild draw color — use a representative image
      return '/cards/flip/Orange_WILD_DRAW_COLOR.jpg';
    }

    const flipParts = face.split('_');
    if (flipParts.length < 2) return '/cards/flip/TOP_CARD.jpg';

    // Capitalize color (e.g. RED → Red, ORANGE → Orange)
    const flipColor = flipParts[0].charAt(0).toUpperCase() + flipParts[0].slice(1).toLowerCase();

    // Number cards: NUMBER_1 → ONE, NUMBER_2 → TWO … NUMBER_9 → NINE
    if (flipParts[1] === 'NUMBER' && flipParts[2]) {
      const word = FLIP_NUM_WORD[flipParts[2]];
      if (word) return `/cards/flip/${flipColor}_${word}.jpg`;
    }
    // Skip (light) → {Color}_SKIP.jpg
    if (flipParts[1] === 'SKIP' && flipParts.length === 2) {
      return `/cards/flip/${flipColor}_SKIP.jpg`;
    }
    // Skip Everyone (dark) → {Color}_SKIP_EVERYONE.jpg
    if (flipParts[1] === 'SKIP' && flipParts[2] === 'EVERYONE') {
      return `/cards/flip/${flipColor}_SKIP_EVERYONE.jpg`;
    }
    // Reverse → {Color}_REVERSE.jpg
    if (flipParts[1] === 'REVERSE') {
      return `/cards/flip/${flipColor}_REVERSE.jpg`;
    }
    // Draw Two (light) → {Color}_DRAW_TWO.jpg
    if (flipParts[1] === 'DRAW' && flipParts[2] === 'TWO') {
      return `/cards/flip/${flipColor}_DRAW_TWO.jpg`;
    }
    // Draw One (light flip action) → {Color}_DRAW_TWO.jpg (matches the light-side draw card image)
    if (flipParts[1] === 'DRAW' && flipParts[2] === 'ONE') {
      return `/cards/flip/${flipColor}_DRAW_TWO.jpg`;
    }
    // Draw Five (dark) → {Color}_DRAW_FIVE.jpg
    if (flipParts[1] === 'DRAW' && flipParts[2] === 'FIVE') {
      return `/cards/flip/${flipColor}_DRAW_FIVE.jpg`;
    }
    // Flip card → {Color}_FLIP.jpg
    if (flipParts[1] === 'FLIP') {
      return `/cards/flip/${flipColor}_FLIP.jpg`;
    }
    // Wild Draw Two per-color (light) → {Color}_WILDTWO.jpg
    if (flipParts[1] === 'WILDTWO') {
      return `/cards/flip/${flipColor}_WILDTWO.jpg`;
    }
    // Wild Draw Color per-color (dark) → {Color}_WILD_DRAW_COLOR.jpg
    if (flipParts[1] === 'WILD' && flipParts[2] === 'DRAW' && flipParts[3] === 'COLOR') {
      return `/cards/flip/${flipColor}_WILD_DRAW_COLOR.jpg`;
    }

    return '/cards/flip/TOP_CARD.jpg';
  }

  // ── CLASSIC mode: use upgraded SVG assets ─────────────────────────────────
  if (face === 'WILD') {
    return '/cards/wild.svg';
  }
  if (face === 'WILD_DRAW_FOUR') {
    return '/cards/wild-draw4.svg';
  }
  if (face === 'WILD_DRAW_TWO') {
    return '/cards/wild-draw4.svg';
  }
  if (face === 'WILD_DRAW_COLOR') {
    return '/cards/wild.svg';
  }

  const parts = face.split('_');
  if (parts.length < 2) return '/cards/back.svg';

  let colorRaw = parts[0].toLowerCase();
  if (colorRaw === 'orange') colorRaw = 'red';
  if (colorRaw === 'pink') colorRaw = 'yellow';
  if (colorRaw === 'teal') colorRaw = 'green';
  if (colorRaw === 'purple') colorRaw = 'blue';

  if (parts[1] === 'NUMBER') {
    const val = parts[2];
    return `/cards/${colorRaw}-${val}.svg`;
  }
  if (parts[1] === 'SKIP') {
    return `/cards/${colorRaw}-skip.svg`;
  }
  if (parts[1] === 'REVERSE') {
    return `/cards/${colorRaw}-reverse.svg`;
  }
  if (parts[1] === 'DRAW' && parts[2] === 'TWO') {
    return `/cards/${colorRaw}-draw2.svg`;
  }
  if (parts[1] === 'DRAW' && parts[2] === 'ONE') {
    return `/cards/${colorRaw}-draw2.svg`;
  }
  if (parts[1] === 'DRAW' && parts[2] === 'FIVE') {
    return `/cards/${colorRaw}-draw2.svg`;
  }
  if (parts[1] === 'FLIP') {
    return `/cards/${colorRaw}-reverse.svg`;
  }
  if (parts[1] === 'SKIP' && parts[2] === 'EVERYONE') {
    return `/cards/${colorRaw}-skip.svg`;
  }

  return '/cards/back.svg';
};

const getPlayDirectionArrowColors = (activeColor: string, gameMode = 'classic') => {
  const colorMap: Record<string, { stroke: string; glow: string }> = gameMode === 'mercy' ? {
    RED: { stroke: 'rgba(255, 92, 92, 0.65)', glow: '#ff5c5c' },
    BLUE: { stroke: 'rgba(75, 150, 230, 0.65)', glow: '#4b96e6' },
    GREEN: { stroke: 'rgba(69, 175, 38, 0.65)', glow: '#45af26' },
    YELLOW: { stroke: 'rgba(255, 212, 63, 0.65)', glow: '#ffd43f' },
    PINK: { stroke: 'rgba(244, 114, 182, 0.65)', glow: '#f472b6' },
    TEAL: { stroke: 'rgba(94, 234, 212, 0.65)', glow: '#5eead4' },
    ORANGE: { stroke: 'rgba(251, 146, 60, 0.65)', glow: '#fb923c' },
    PURPLE: { stroke: 'rgba(192, 132, 252, 0.65)', glow: '#c084fc' },
  } : {
    RED: { stroke: 'rgba(255, 107, 107, 0.65)', glow: '#ff6b6b' },
    BLUE: { stroke: 'rgba(96, 165, 250, 0.65)', glow: '#60a5fa' },
    GREEN: { stroke: 'rgba(74, 222, 128, 0.65)', glow: '#4ade80' },
    YELLOW: { stroke: 'rgba(255, 250, 101, 0.65)', glow: '#fffa65' },
    PINK: { stroke: 'rgba(244, 114, 182, 0.65)', glow: '#f472b6' },
    TEAL: { stroke: 'rgba(94, 234, 212, 0.65)', glow: '#5eead4' },
    ORANGE: { stroke: 'rgba(251, 146, 60, 0.65)', glow: '#fb923c' },
    PURPLE: { stroke: 'rgba(192, 132, 252, 0.65)', glow: '#c084fc' },
  };

  return colorMap[activeColor?.toUpperCase()] || colorMap['GREEN'];
};

const FLIP_AR = 327 / 505; // Cropped aspect ratio: 327 / 505 ≈ 0.6475
const FLIP_CROP_STYLE = {
  width: '102.44%',
  height: '102.38%',
  left: '-1.22%',
  top: '-1.19%',
  maxWidth: 'none',
  maxHeight: 'none',
};

export function UnoCard({ cardId, isBack = false, onClick, className = '', side = 'light', gameMode = 'classic', disabled = false, style }: UnoCardProps) {
  const assetUrl = useMemo(() => {
    if (isBack) {
      if (gameMode === 'flip') return '/cards/flip/TOP_CARD.jpg';
      if (gameMode === 'mercy') return '/cards/mercy/card_back.webp'; // Use No Mercy card back
      return '/cards/back.svg';
    }
    return getCardAssetUrl(cardId, side, gameMode);
  }, [cardId, isBack, side, gameMode]);

  // Standard card height is h-36 = 144px.
  // flipWidth = 144 * FLIP_AR = 93.2px ≈ 93px.
  const flipWidth = Math.round(144 * FLIP_AR);
  const MERCY_AR = 355 / 502;
  const mercyWidth = Math.round(144 * MERCY_AR);
  const classicWidth = Math.round(144 * CLASSIC_AR);

  return (
    <motion.div
      style={
        gameMode === 'flip'
          ? { ...style, width: `${flipWidth}px`, backgroundColor: side === 'dark' ? '#000000' : '#ffffff' }
          : gameMode === 'mercy'
            ? { ...style, width: `${mercyWidth}px`, backgroundColor: '#000000' }
            : { ...style, width: `${classicWidth}px`, backgroundColor: '#ffffff' }
      }
      whileHover={disabled ? {} : { scale: 1.08, y: -16, zIndex: 60, transition: { type: 'spring', stiffness: 300, damping: 15 } }}
      onClick={disabled ? undefined : onClick}
      className={`h-36 rounded-[12px] relative overflow-hidden select-none flex-shrink-0 cursor-pointer transition-shadow duration-200 ${gameMode === 'flip' || gameMode === 'mercy'
        ? 'shadow-[0_6px_18px_-2px_rgba(0,0,0,0.55),0_2px_6px_rgba(0,0,0,0.35)] hover:shadow-[0_12px_28px_-4px_rgba(0,0,0,0.65),0_4px_10px_rgba(0,0,0,0.4)]'
        : 'hover:shadow-[0_10px_25px_-5px_rgba(0,0,0,0.3)]'
        } ${className} ${disabled ? 'opacity-85 cursor-not-allowed' : ''}`}
    >
      <img
        src={assetUrl}
        alt={isBack ? 'Card Back' : cardId}
        className={gameMode === 'flip' ? 'absolute pointer-events-none select-none' : gameMode === 'mercy' ? 'w-full h-full object-cover pointer-events-none select-none block' : 'w-full h-full object-contain pointer-events-none block'}
        style={gameMode === 'flip' ? FLIP_CROP_STYLE : {}}
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
  // No Mercy wild cards
  if (cardId === 'WILD_DRAW_SIX') {
    return { color: 'WILD', type: 'WILD_DRAW_SIX', value: null };
  }
  if (cardId === 'WILD_DRAW_TEN') {
    return { color: 'WILD', type: 'WILD_DRAW_TEN', value: null };
  }
  if (cardId === 'WILD_ROULETTE') {
    return { color: 'WILD', type: 'WILD_ROULETTE', value: null };
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

const validatePlayableClientLogic = (cardId: string, topDiscardCardId: string, currentColor: string, drawStack?: { count: number; minValue: number } | null): boolean => {
  const card = normalizeCardClient(cardId);
  const topCard = normalizeCardClient(topDiscardCardId);

  // In mercy mode with active draw stack: only stackable draw cards are playable
  if (drawStack && drawStack.count > 0) {
    const drawValues: Record<string, number> = {
      'DRAW_TWO': 2, 'DRAW_FOUR': 4, 'WILD_DRAW_FOUR': 4,
      'WILD_DRAW_SIX': 6, 'WILD_DRAW_TEN': 10
    };
    const cardVal = drawValues[card.type] || 0;
    return cardVal >= drawStack.minValue && cardVal > 0;
  }

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
  isEliminated?: boolean;
  gameMode?: 'classic' | 'flip' | 'mercy';
  side?: 'light' | 'dark';
  position?: 'left' | 'right' | 'top' | 'player';
}

function GamePlayerAvatar({
  name,
  avatarSeed,
  cardCount,
  isTurn = false,
  isMe = false,
  turnStartedAt,
  isEliminated = false,
  gameMode = 'classic',
  side = 'light',
  position = 'top'
}: GamePlayerAvatarProps) {
  const isCardIndicatorBlack = gameMode === 'flip' && side === 'dark';
  const [timeLeft, setTimeLeft] = useState(TURN_DURATION);

  // Reset and start countdown whenever this player's turn begins or turnStartedAt changes
  useEffect(() => {
    if (!isTurn || !turnStartedAt || isEliminated) {
      setTimeLeft(TURN_DURATION);
      return;
    }

    const updateTimer = () => {
      const synchronizedNow = Date.now() + serverTimeOffset;
      const elapsed = Math.floor((synchronizedNow - turnStartedAt) / 1000);
      const remaining = Math.max(0, TURN_DURATION - elapsed);
      setTimeLeft(remaining);
    };

    updateTimer(); // run once immediately

    const interval = setInterval(() => {
      updateTimer();
    }, 1000);

    return () => clearInterval(interval);
  }, [isTurn, turnStartedAt, isEliminated]);

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
  const progress = isTurn && !isEliminated ? timeLeft / TURN_DURATION : 1;
  // Color: green > 50%, yellow 25-50%, red < 25%
  const ringColor = progress > 0.5 ? '#379711' : progress > 0.25 ? '#ecd407' : '#cc3333';

  return (
    <motion.div
      animate={isTurn && !isEliminated ? {
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
      className={`flex flex-col items-center select-none ${(!isTurn || isEliminated) ? 'avatar-inactive' : 'avatar-active'
        }`}
    >
      {/* YOUR TURN pill: only shown for the local player when it's their turn */}
      {isMe && isTurn && !isEliminated && (
        <div
          className="your-turn-badge mb-1.5 bg-[#cc3333] border-2 border-[#0f172a] rounded-[6px] px-3 py-1 shadow-[2px_2px_0_#0f172a] flex items-center"
        >
          <span className="text-white font-black text-[9px] sm:text-[10px] tracking-widest uppercase">Your Turn</span>
        </div>
      )}

      {/* Name Label Badge — grey when eliminated, red when active turn, teal otherwise */}
      <div
        className={`border-2 border-white rounded-[8px] px-3.5 py-1.5 flex items-center justify-center min-w-[80px] transition-colors duration-300 ${isEliminated ? 'bg-[#94a3b8]' : isTurn ? 'bg-[#cc3333]' : 'bg-[#1e7b85]'
          }`}
      >
        <span className="text-white font-extrabold text-[10px] sm:text-xs tracking-wider truncate max-w-[85px] uppercase">
          {name}
        </span>
      </div>

      {/* Avatar Wrapper — sized to match avatar box so SVG inset-0 covers it exactly */}
      <div className="relative mt-2 w-[72px] h-[72px] sm:w-[88px] sm:h-[88px]">

        {/* Outer Avatar Image Container */}
        <div
          className="w-full h-full overflow-hidden shadow-[0_8px_16px_rgba(0,0,0,0.15)] bg-white border-[5px] sm:border-[6px] border-white"
          style={{ borderRadius: '22.5%' }}
        >
          {avatarUri && (
            <img src={avatarUri} alt={name} className="w-full h-full object-cover" />
          )}
        </div>

        {/* Death Badge Icon for Eliminated Players */}
        {isEliminated && (
          <div
            className={`absolute z-30 w-9 h-9 sm:w-11 sm:h-11 select-none pointer-events-none ${position === 'right'
              ? '-bottom-2 -left-2'
              : '-bottom-2 -right-2'
              }`}
          >
            <img
              src="/death_image.png"
              alt="Dead"
              className="w-full h-full object-contain"
              style={{ filter: 'drop-shadow(1.5px 0px 0px #fff) drop-shadow(-1.5px 0px 0px #fff) drop-shadow(0px 1.5px 0px #fff) drop-shadow(0px -1.5px 0px #fff) drop-shadow(0px 2px 4px rgba(0,0,0,0.35))' }}
            />
          </div>
        )}

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
        {!isEliminated && (
          <div className="absolute -right-3 -bottom-1.5 z-10">
            <div className="relative w-8 h-10 sm:w-9 sm:h-11">
              {/* Back card */}
              <div className={`absolute left-0.5 top-0.7 w-6.5 h-8.5 sm:w-7 sm:h-9 rounded-[4px] shadow-[0_1.5px_3px_rgba(0,0,0,0.25)] transform -rotate-6 ${isCardIndicatorBlack ? 'bg-black' : 'bg-white'}`} />
              {/* Top card */}
              <div className={`absolute left-1.5 top-0 w-6.5 h-8.5 sm:w-7 sm:h-9 rounded-[4px] shadow-[0_2px_4px_rgba(0,0,0,0.3)] flex items-center justify-center font-black text-xs transform rotate-3 select-none ${isCardIndicatorBlack ? 'bg-black text-white' : 'bg-white text-[#0f172a]'}`}>
                {cardCount}
              </div>
            </div>
          </div>
        )}

      </div>
    </motion.div>
  );
}

interface OpponentCardFanProps {
  cardCount: number;
  direction: 'left' | 'right' | 'down';
  side: 'light' | 'dark';
  gameMode: 'classic' | 'flip' | 'mercy';
  isShort?: boolean;
  isVeryShort?: boolean;
  hand?: string[];
}

function OpponentCardFan({ cardCount, direction: _direction, side, gameMode, isShort = false, isVeryShort = false, hand }: OpponentCardFanProps) {
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
  const cardBackSrc = gameMode === 'flip' ? '/cards/flip/TOP_CARD.jpg' : gameMode === 'mercy' ? '/cards/mercy/card_back.webp' : '/cards/back.svg';
  // Apply a subtle dark overlay filter for the dark side to visually distinguish it
  const cardBackFilter = isDarkSide ? 'brightness(0.85)' : 'none';

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

  // Sizing corrections for Classic, Flip and No Mercy modes based on exact asset aspect ratios
  if (gameMode === 'flip') {
    cardW = Math.round(cardH * FLIP_AR);
  } else if (gameMode === 'mercy') {
    const MERCY_AR = 355 / 502;
    cardW = Math.round(cardH * MERCY_AR);
  } else {
    cardW = Math.round(cardH * CLASSIC_AR);
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

        const cardId = (hand && hand[idx]) || null;
        const assetUrl = cardId
          ? getCardAssetUrl(cardId, side === 'light' ? 'dark' : 'light', gameMode)
          : cardBackSrc;

        return (
          <div key={idx} style={outerStyle} className="relative flex-shrink-0">
            <div
              className={`w-full h-full relative rounded-[6px] overflow-hidden transition-all duration-300 ${(gameMode === 'mercy' || (gameMode === 'flip' && side === 'dark')) ? 'shadow-[0_0_0_1px_rgba(255,255,255,0.15),0_4px_12px_-1px_rgba(0,0,0,0.5),0_1px_4px_rgba(0,0,0,0.3)]' : 'shadow-[1px_2px_4px_rgba(0,0,0,0.18)]'}`}
              style={{
                backgroundColor: (gameMode === 'mercy' || (gameMode === 'flip' && side === 'dark')) ? '#000000' : '#ffffff', // Black for black side so black borders blend cleanly
                WebkitBoxReflect: 'below 1px linear-gradient(transparent 75%, rgba(255, 255, 255, 0.12))',
              }}
            >
              <img
                src={assetUrl}
                alt={cardId || 'Card Back'}
                className={gameMode === 'flip' ? 'absolute pointer-events-none select-none' : gameMode === 'mercy' ? 'w-full h-full object-cover pointer-events-none select-none block' : 'w-full h-full pointer-events-none select-none object-contain block'}
                style={{
                  imageRendering: (gameMode === 'flip' || gameMode === 'mercy' || gameMode === 'classic') ? 'auto' : 'pixelated',
                  ...(gameMode === 'flip' ? FLIP_CROP_STYLE : {}),
                }}
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
  gameMode: 'classic' | 'flip' | 'mercy'
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
  gameMode: 'classic' | 'flip' | 'mercy';
  lastPlayedCardKey: string | null;
  onResetPlayedKey: () => void;
  pendingWildCard: { cardId: string; key: string } | null;
  setPendingWildCard: (val: { cardId: string; key: string } | null) => void;
  socket: any;
  setLastPlayedCardKey: (key: string | null) => void;
}

function DiscardPile({
  room,
  side,
  gameMode,
  lastPlayedCardKey,
  onResetPlayedKey,
  pendingWildCard,
  setPendingWildCard,
  socket,
  setLastPlayedCardKey
}: DiscardPileProps) {
  const [discardHistory, setDiscardHistory] = useState<DiscardHistoryCard[]>([]);
  const lastTopRef = useRef<string | null>(null);
  const lastSizeRef = useRef<number>(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  const [hoveredColor, setHoveredColor] = useState<string | null>(null);

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

  const isDarkSide = gameMode === 'flip' && side === 'dark';
  const colors = isDarkSide
    ? [
      { name: 'PINK', hex: '#ec4899', glow: '#ec4899', hoverGlow: '0 0 24px 8px #ec4899' },
      { name: 'TEAL', hex: '#14b8a6', glow: '#14b8a6', hoverGlow: '0 0 24px 8px #14b8a6' },
      { name: 'ORANGE', hex: '#f97316', glow: '#f97316', hoverGlow: '0 0 24px 8px #f97316' },
      { name: 'PURPLE', hex: '#8b5cf6', glow: '#8b5cf6', hoverGlow: '0 0 24px 8px #8b5cf6' }
    ]
    : gameMode === 'mercy'
      ? [
        { name: 'RED', hex: '#d71809', glow: '#ff3b30', hoverGlow: '0 0 24px 8px #ff3b30' },
        { name: 'BLUE', hex: '#21558c', glow: '#3b82f6', hoverGlow: '0 0 24px 8px #3b82f6' },
        { name: 'GREEN', hex: '#215513', glow: '#22c55e', hoverGlow: '0 0 24px 8px #22c55e' },
        { name: 'YELLOW', hex: '#e3ae15', glow: '#ffd43f', hoverGlow: '0 0 24px 8px #ffd43f' }
      ]
      : [
        { name: 'RED', hex: '#cc3333', glow: '#ff4d4d', hoverGlow: '0 0 24px 8px #ff4d4d' },
        { name: 'BLUE', hex: '#0956bf', glow: '#3b82f6', hoverGlow: '0 0 24px 8px #3b82f6' },
        { name: 'GREEN', hex: '#379711', glow: '#22c55e', hoverGlow: '0 0 24px 8px #22c55e' },
        { name: 'YELLOW', hex: '#ecd407', glow: '#ffd43f', hoverGlow: '0 0 24px 8px #ffd43f' }
      ];

  const targetH = isMobile ? 130 : 220;
  const MERCY_AR = 355 / 502;
  const targetW = gameMode === 'flip'
    ? Math.round(targetH * FLIP_AR)
    : gameMode === 'mercy'
      ? Math.round(targetH * MERCY_AR)
      : Math.round(targetH * CLASSIC_AR);

  return (
    <div
      id="discard-pile-drop-zone"
      className="relative flex items-center justify-center transition-all duration-150 ease-out"
      style={{
        width: gameMode === 'flip'
          ? (isMobile ? '81px' : '137px')
          : gameMode === 'mercy'
            ? (isMobile ? '92px' : '156px')
            : (isMobile ? `${Math.round(130 * CLASSIC_AR)}px` : `${Math.round(220 * CLASSIC_AR)}px`),
        height: isMobile ? '130px' : '220px',
      }}
    >
      <div className="relative w-full h-full">
        {discardHistory.map((card, i) => {
          const isTop = i === discardHistory.length - 1;
          let shadowStyle = isTop
            ? '0 14px 28px rgba(0,0,0,0.32), 0 5px 10px rgba(0,0,0,0.22)'
            : '0 4px 8px rgba(0,0,0,0.18), 0 2px 4px rgba(0,0,0,0.12)';

          if (gameMode === 'mercy' || (gameMode === 'flip' && side === 'dark')) {
            shadowStyle = isTop
              ? '0 0 0 1.5px rgba(255,255,255,0.25), 0 20px 40px -4px rgba(0,0,0,0.6), 0 8px 16px rgba(0,0,0,0.4)'
              : '0 0 0 1px rgba(255,255,255,0.15), 0 6px 16px -2px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.25)';
          }

          const assetUrl = card.cardId === 'DECK_BACK'
            ? (gameMode === 'flip' ? '/cards/flip/TOP_CARD.jpg' : gameMode === 'mercy' ? '/cards/mercy/card_back.webp' : '/cards/back.svg')
            : getCardAssetUrl(card.cardId, side, gameMode);

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
                backgroundColor: (gameMode === 'mercy' || (gameMode === 'flip' && side === 'dark')) ? '#000000' : '#ffffff', // Black for black side so black borders blend cleanly
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
                className={gameMode === 'flip' ? 'absolute pointer-events-none select-none' : gameMode === 'mercy' ? 'w-full h-full object-cover pointer-events-none select-none block' : 'w-full h-full object-contain pointer-events-none select-none block'}
                style={gameMode === 'flip' ? FLIP_CROP_STYLE : {}}
              />
            </motion.div>
          );
        })}

        {/* Wild Card preview and Color Wheel overlay when player is picking color */}
        {pendingWildCard && (
          <>
            {/* Click-outside backdrop to cancel */}
            <div
              className="fixed inset-0 z-[80] bg-black/30 cursor-pointer pointer-events-auto"
              onClick={() => {
                if (setPendingWildCard) setPendingWildCard(null);
              }}
            />

            {/* Preview played Wild card on discard pile */}
            <motion.div
              style={{
                position: 'absolute',
                width: `${targetW}px`,
                height: `${targetH}px`,
                left: `calc(50% - ${targetW / 2}px)`,
                top: `calc(50% - ${targetH / 2}px)`,
                transformOrigin: 'center center',
                zIndex: 90,
                boxShadow: (gameMode === 'mercy' || (gameMode === 'flip' && side === 'dark'))
                  ? '0 0 0 1.5px rgba(255,255,255,0.25), 0 20px 40px -4px rgba(0,0,0,0.6)'
                  : '0 14px 28px rgba(0,0,0,0.32), 0 5px 10px rgba(0,0,0,0.22)',
                backgroundColor: (gameMode === 'mercy' || (gameMode === 'flip' && side === 'dark')) ? '#000000' : '#ffffff',
                borderRadius: isMobile ? '7px' : '12px',
                overflow: 'hidden',
                pointerEvents: 'none',
              }}
              initial={{ scale: 1.25, y: 150, rotate: 0, opacity: 0 }}
              animate={{ scale: 1.0, y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            >
              <img
                src={getCardAssetUrl(pendingWildCard.cardId, side, gameMode)}
                alt="Wild card preview"
                className={gameMode === 'flip' ? 'absolute pointer-events-none select-none' : gameMode === 'mercy' ? 'w-full h-full object-cover pointer-events-none select-none block' : 'w-full h-full object-contain pointer-events-none select-none block'}
                style={{
                  ...(gameMode === 'flip' ? FLIP_CROP_STYLE : {}),
                  filter: 'blur(3.5px)',
                }}
              />
            </motion.div>

            {/* Glowing 2x2 Jelly Color Picker overlay */}
            <div
              className="absolute z-[100] flex items-center justify-center pointer-events-auto animate-fade-in"
              style={{
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: `${targetW * 0.72}px`,
                height: `${targetW * 0.72}px`,
                filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.5))',
              }}
            >
              <motion.div
                initial={{ scale: 0, rotate: -15, opacity: 0 }}
                animate={{ scale: 1.1, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                className="w-full h-full grid grid-cols-2 gap-2 sm:gap-2.5 p-1 sm:p-1.5"
              >
                {/* 1. Top-Left (RED / PINK) */}
                <motion.button
                  animate={
                    hoveredColor === null
                      ? { scale: 1, x: 0, y: 0, opacity: 1 }
                      : hoveredColor === colors[0].name
                        ? { scale: 1.28, x: isMobile ? -4 : -6, y: isMobile ? -4 : -6, opacity: 1 }
                        : { scale: 0.88, x: 0, y: 0, opacity: 1 }
                  }
                  transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                  whileTap={{ scale: 0.92 }}
                  onMouseEnter={() => setHoveredColor(colors[0].name)}
                  onMouseLeave={() => setHoveredColor(null)}
                  onClick={() => {
                    const cardId = pendingWildCard.cardId;
                    const key = pendingWildCard.key;
                    if (setLastPlayedCardKey) setLastPlayedCardKey(key);
                    socket.emit('play_card', { roomId: room.roomId, cardId, chosenColor: colors[0].name });
                    if (setPendingWildCard) setPendingWildCard(null);
                  }}
                  style={{
                    backgroundColor: colors[0].hex,
                    boxShadow: hoveredColor === colors[0].name
                      ? `0 0 0 ${isMobile ? 2.5 : 3.5}px ${colors[0].hex}, 0 ${isMobile ? 5 : 8}px ${isMobile ? 10 : 16}px rgba(0,0,0,0.45), inset 0 2.5px 5px rgba(255,255,255,0.45)`
                      : `0 ${isMobile ? 5 : 8}px ${isMobile ? 10 : 16}px rgba(0,0,0,0.45), inset 0 2.5px 5px rgba(255,255,255,0.45)`,
                    zIndex: hoveredColor === colors[0].name ? 10 : 1,
                    borderRadius: '22.5%',
                    border: isMobile ? '2.5px solid #ffffff' : '3.5px solid #ffffff',
                  }}
                  className="relative w-full h-full cursor-pointer overflow-hidden"
                  type="button"
                >
                  <div className="absolute top-[5%] left-[6%] right-[6%] h-[35%] rounded-t-[10px] sm:rounded-t-[14px] rounded-b-[4px] sm:rounded-b-[6px] bg-white/25 pointer-events-none" />
                </motion.button>

                {/* 2. Top-Right (BLUE / TEAL) */}
                <motion.button
                  animate={
                    hoveredColor === null
                      ? { scale: 1, x: 0, y: 0, opacity: 1 }
                      : hoveredColor === colors[1].name
                        ? { scale: 1.28, x: isMobile ? 4 : 6, y: isMobile ? -4 : -6, opacity: 1 }
                        : { scale: 0.88, x: 0, y: 0, opacity: 1 }
                  }
                  transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                  whileTap={{ scale: 0.92 }}
                  onMouseEnter={() => setHoveredColor(colors[1].name)}
                  onMouseLeave={() => setHoveredColor(null)}
                  onClick={() => {
                    const cardId = pendingWildCard.cardId;
                    const key = pendingWildCard.key;
                    if (setLastPlayedCardKey) setLastPlayedCardKey(key);
                    socket.emit('play_card', { roomId: room.roomId, cardId, chosenColor: colors[1].name });
                    if (setPendingWildCard) setPendingWildCard(null);
                  }}
                  style={{
                    backgroundColor: colors[1].hex,
                    boxShadow: hoveredColor === colors[1].name
                      ? `0 0 0 ${isMobile ? 2.5 : 3.5}px ${colors[1].hex}, 0 ${isMobile ? 5 : 8}px ${isMobile ? 10 : 16}px rgba(0,0,0,0.45), inset 0 2.5px 5px rgba(255,255,255,0.45)`
                      : `0 ${isMobile ? 5 : 8}px ${isMobile ? 10 : 16}px rgba(0,0,0,0.45), inset 0 2.5px 5px rgba(255,255,255,0.45)`,
                    zIndex: hoveredColor === colors[1].name ? 10 : 1,
                    borderRadius: '22.5%',
                    border: isMobile ? '2.5px solid #ffffff' : '3.5px solid #ffffff',
                  }}
                  className="relative w-full h-full cursor-pointer overflow-hidden"
                  type="button"
                >
                  <div className="absolute top-[5%] left-[6%] right-[6%] h-[35%] rounded-t-[10px] sm:rounded-t-[14px] rounded-b-[4px] sm:rounded-b-[6px] bg-white/25 pointer-events-none" />
                </motion.button>

                {/* 3. Bottom-Left (GREEN / ORANGE) */}
                <motion.button
                  animate={
                    hoveredColor === null
                      ? { scale: 1, x: 0, y: 0, opacity: 1 }
                      : hoveredColor === colors[2].name
                        ? { scale: 1.28, x: isMobile ? -4 : -6, y: isMobile ? 4 : 6, opacity: 1 }
                        : { scale: 0.88, x: 0, y: 0, opacity: 1 }
                  }
                  transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                  whileTap={{ scale: 0.92 }}
                  onMouseEnter={() => setHoveredColor(colors[2].name)}
                  onMouseLeave={() => setHoveredColor(null)}
                  onClick={() => {
                    const cardId = pendingWildCard.cardId;
                    const key = pendingWildCard.key;
                    if (setLastPlayedCardKey) setLastPlayedCardKey(key);
                    socket.emit('play_card', { roomId: room.roomId, cardId, chosenColor: colors[2].name });
                    if (setPendingWildCard) setPendingWildCard(null);
                  }}
                  style={{
                    backgroundColor: colors[2].hex,
                    boxShadow: hoveredColor === colors[2].name
                      ? `0 0 0 ${isMobile ? 2.5 : 3.5}px ${colors[2].hex}, 0 ${isMobile ? 5 : 8}px ${isMobile ? 10 : 16}px rgba(0,0,0,0.45), inset 0 2.5px 5px rgba(255,255,255,0.45)`
                      : `0 ${isMobile ? 5 : 8}px ${isMobile ? 10 : 16}px rgba(0,0,0,0.45), inset 0 2.5px 5px rgba(255,255,255,0.45)`,
                    zIndex: hoveredColor === colors[2].name ? 10 : 1,
                    borderRadius: '22.5%',
                    border: isMobile ? '2.5px solid #ffffff' : '3.5px solid #ffffff',
                  }}
                  className="relative w-full h-full cursor-pointer overflow-hidden"
                  type="button"
                >
                  <div className="absolute top-[5%] left-[6%] right-[6%] h-[35%] rounded-t-[10px] sm:rounded-t-[14px] rounded-b-[4px] sm:rounded-b-[6px] bg-white/25 pointer-events-none" />
                </motion.button>

                {/* 4. Bottom-Right (YELLOW / PURPLE) */}
                <motion.button
                  animate={
                    hoveredColor === null
                      ? { scale: 1, x: 0, y: 0, opacity: 1 }
                      : hoveredColor === colors[3].name
                        ? { scale: 1.28, x: isMobile ? 4 : 6, y: isMobile ? 4 : 6, opacity: 1 }
                        : { scale: 0.88, x: 0, y: 0, opacity: 1 }
                  }
                  transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                  whileTap={{ scale: 0.92 }}
                  onMouseEnter={() => setHoveredColor(colors[3].name)}
                  onMouseLeave={() => setHoveredColor(null)}
                  onClick={() => {
                    const cardId = pendingWildCard.cardId;
                    const key = pendingWildCard.key;
                    if (setLastPlayedCardKey) setLastPlayedCardKey(key);
                    socket.emit('play_card', { roomId: room.roomId, cardId, chosenColor: colors[3].name });
                    if (setPendingWildCard) setPendingWildCard(null);
                  }}
                  style={{
                    backgroundColor: colors[3].hex,
                    boxShadow: hoveredColor === colors[3].name
                      ? `0 0 0 ${isMobile ? 2.5 : 3.5}px ${colors[3].hex}, 0 ${isMobile ? 5 : 8}px ${isMobile ? 10 : 16}px rgba(0,0,0,0.45), inset 0 2.5px 5px rgba(255,255,255,0.45)`
                      : `0 ${isMobile ? 5 : 8}px ${isMobile ? 10 : 16}px rgba(0,0,0,0.45), inset 0 2.5px 5px rgba(255,255,255,0.45)`,
                    zIndex: hoveredColor === colors[3].name ? 10 : 1,
                    borderRadius: '22.5%',
                    border: isMobile ? '2.5px solid #ffffff' : '3.5px solid #ffffff',
                  }}
                  className="relative w-full h-full cursor-pointer overflow-hidden"
                  type="button"
                >
                  <div className="absolute top-[5%] left-[6%] right-[6%] h-[35%] rounded-t-[10px] sm:rounded-t-[14px] rounded-b-[4px] sm:rounded-b-[6px] bg-white/25 pointer-events-none" />
                </motion.button>
              </motion.div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface HandCanvasProps {
  hand: string[];
  side: 'light' | 'dark';
  gameMode: 'classic' | 'flip' | 'mercy';
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

    if ((room.eliminatedPlayers || []).includes(myPlayerId)) {
      console.log('[validatePlayableClient] Rejecting because local player is eliminated');
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

    const isPlayable = validatePlayableClientLogic(face, topFace, room.currentColor, room.gameMode === 'mercy' ? room.drawStack : null);
    console.log('[validatePlayableClient] Result of validatePlayableClientLogic:', isPlayable);
    return isPlayable;
  };

  const triggerShake = (index: number) => {
    setShakingIndex(index);
    setTimeout(() => setShakingIndex(null), 450);
  };

  const playCard = (cardId: string, _index: number, instanceId: string) => {
    const face = getActiveCardFaceFrontend(cardId, side, gameMode);
    if (face === 'WILD' || face.startsWith('WILD_')) {
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
      playSoundEffect('invalid', soundEnabled);
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
      playSoundEffect('invalid', soundEnabled);
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
  // Sizing corrections for Flip and No Mercy modes based on exact asset aspect ratios
  const MERCY_AR = 355 / 502;
  const targetW = gameMode === 'flip'
    ? Math.round(targetH * FLIP_AR)
    : gameMode === 'mercy'
      ? Math.round(targetH * MERCY_AR)
      : Math.round(targetH * CLASSIC_AR);

  // Dynamic scale factor for hand sizes > 10 cards (caps at 72% scale)
  const sizeScale = count > 10 ? Math.max(0.72, 1.0 - (count - 10) * 0.018) : 1.0;
  const scaledH = targetH * sizeScale;
  const scaledW = targetW * sizeScale;

  let spacing = isMobile
    ? Math.max(25, 45 - count)
    : Math.max(42, 80 - count);

  const avatarSpace = isVeryShort ? (isMobile ? 60 : 100) : (isShort ? (isMobile ? 80 : 120) : (isMobile ? 100 : 140));
  const maxHandWidth = dimensions.width - avatarSpace;

  const totalHandWidth = (count - 1) * spacing + scaledW;
  if (totalHandWidth > maxHandWidth && count > 1) {
    spacing = (maxHandWidth - scaledW) / (count - 1);
    spacing = Math.max(isMobile ? 12 : 20, spacing);
  }

  const cx = dimensions.width / 2;
  let startX = cx - ((count - 1) * spacing) / 2;
  if (startX < avatarSpace - 10) {
    startX = avatarSpace - 10;
  }

  const baseY = isMobile
    ? dimensions.height - 5 - scaledH / 2
    : dimensions.height - 10 - scaledH / 2;
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

        const isSelected = i === selectedCardIndex;
        const isHovered = i === hoveredIndex;
        const isDragging = i === draggingIndex;
        const isShaking = i === shakingIndex;

        // Dynamic rotation step: flattens the fan rotation as the hand size grows
        const rotStep = count > 10 ? Math.max(0.4, 2.0 * (10 / count)) : 2.0;
        const targetRot = isDragging ? 0 : offset * rotStep;

        // Dynamic arch depth step: flattens the fan arc vertically as hand size grows
        const archStep = count > 10 ? Math.max(1.0, 4.0 * (10 / count)) : 4.0;
        const tYBase = baseY + Math.abs(offset) * archStep;

        // Selected card goes highest, else default stack order
        let zIndex = isSelected ? 2000 : i;
        let targetScale = 1.0;

        let shadowStyle = '0px 3.54px 4px rgba(0,0,0,0.2)';
        if (gameMode === 'mercy' || (gameMode === 'flip' && side === 'dark')) {
          if (isDragging) shadowStyle = '0 0 0 2px rgba(255,255,255,0.35), 0 20px 40px rgba(0,0,0,0.5)';
          else if (isSelected) shadowStyle = '0 0 0 1.5px rgba(255,255,255,0.3), 0 14px 28px rgba(0,0,0,0.42)';
          else if (isHovered) shadowStyle = '0 0 0 1px rgba(255,255,255,0.22), 0 8px 16px rgba(0,0,0,0.35)';
          else shadowStyle = '0 0 0 1px rgba(255,255,255,0.15), 0 3px 8px rgba(0,0,0,0.3)';
        } else {
          if (isDragging) shadowStyle = '12px 18px 10px rgba(0,0,0,0.3)';
          else if (isSelected) shadowStyle = '5px 8px 6px rgba(0,0,0,0.25)';
          else if (isHovered) shadowStyle = '2.5px 2.5px 2px rgba(0,0,0,0.2)';
        }

        const isPlayable = validatePlayableClient(cardId);

        if (isDragging) {
          targetScale = 1.12;
          zIndex = 1000;
        } else if (isHovered) {
          targetScale = 1.08;
        }

        const assetUrl = getCardAssetUrl(cardId, side, gameMode);

        return (
          <motion.div
            key={key}
            style={{
              position: 'absolute',
              left: `${tX - scaledW / 2}px`,
              top: `${tYBase - scaledH / 2}px`,
              width: `${scaledW}px`,
              height: `${scaledH}px`,
              transformOrigin: 'center center',
              zIndex,
              cursor: isDragging ? 'grabbing' : 'pointer',
              touchAction: 'none',
              boxShadow: shadowStyle,
              borderRadius: isMobile ? '7px' : '12px',
              overflow: 'hidden',
              backgroundColor: (gameMode === 'mercy' || (gameMode === 'flip' && side === 'dark')) ? '#000000' : '#ffffff', // Black for black side so black borders blend cleanly
            }}
            animate={{
              x: isShaking ? [-8, 8, -6, 6, 0] : 0,
              y: isSelected ? -35 : (isHovered ? -15 : 0),
              rotate: targetRot,
              scale: targetScale,
            }}
            transition={{
              type: 'spring',
              stiffness: 260,
              damping: 24,
              mass: 0.8,
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
              className={gameMode === 'flip' ? 'absolute pointer-events-none select-none' : gameMode === 'mercy' ? 'w-full h-full object-cover pointer-events-none select-none block' : 'w-full h-full pointer-events-none select-none object-contain block'}
              style={{
                imageRendering: (gameMode === 'flip' || gameMode === 'mercy' || gameMode === 'classic') ? 'auto' : 'pixelated',
                ...(gameMode === 'flip' ? FLIP_CROP_STYLE : {}),
              }}
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
  const [betaHovered, setBetaHovered] = useState(false);
  const [disclaimerHovered, setDisclaimerHovered] = useState(false);

  return (
    <div className="fixed top-4 left-4 z-50 pointer-events-auto select-none flex flex-row items-start gap-2">

      {/* --- Beta 1.4 Pill --- */}
      <div
        className="relative"
        onMouseEnter={() => setBetaHovered(true)}
        onMouseLeave={() => setBetaHovered(false)}
      >
        <div className="bg-[#64748b] text-white border-2 border-[#0f172a] px-2.5 py-1 rounded-[6px] shadow-[2px_2px_0_#0f172a] font-black text-[9px] tracking-wider uppercase cursor-help transition-all hover:-translate-y-0.5 active:translate-y-0 active:shadow-[1px_1px_0_#0f172a]">
          Beta 1.4
        </div>
        <AnimatePresence>
          {betaHovered && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 4 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 mt-1.5 bg-white text-[#0f172a] border-2 border-[#0f172a] px-4 py-3 rounded-[10px] shadow-[4px_4px_0_#0f172a] w-[240px] text-left z-50"
            >
              <p className="text-[10px] font-bold leading-relaxed">
                🚧 The game is in beta. Some features might not work yet — they will come soon. There may be bugs and glitches, so please bear with me!
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* --- Disclaimer Pill --- */}
      <div
        className="relative"
        onMouseEnter={() => setDisclaimerHovered(true)}
        onMouseLeave={() => setDisclaimerHovered(false)}
      >
        <div
          className="bg-[#ea580c] text-white border-2 border-[#0f172a] px-2.5 py-1 rounded-[6px] shadow-[2px_2px_0_#0f172a] font-black text-[9px] tracking-wider uppercase transition-all hover:-translate-y-0.5 active:translate-y-0 active:shadow-[1px_1px_0_#0f172a]"
          style={{ cursor: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24'%3E%3Cpath fill='%23ea580c' d='M12 2L1 21h22L12 2z'/%3E%3Cpath fill='white' d='M12 9v5M12 16.5v1'/%3E%3Cpath stroke='white' stroke-width='2' stroke-linecap='round' d='M12 9v5M12 16.5v1'/%3E%3C/svg%3E") 10 10, auto` }}
        >
          ⚖️ Disclaimer
        </div>
        <AnimatePresence>
          {disclaimerHovered && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 4 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 mt-1.5 bg-white text-[#0f172a] border-2 border-[#0f172a] px-4 py-3 rounded-[10px] shadow-[4px_4px_0_#0f172a] w-[280px] text-left z-50"
            >
              <p className="text-[9px] font-black uppercase tracking-wider text-[#ea580c] mb-2">⚖️ Disclaimer</p>
              <p className="text-[10px] font-medium leading-relaxed text-[#334155]">
                UNO® and all related trademarks, card designs, and assets are the property of <strong>Mattel, Inc.</strong> This is a personal, non-commercial fan project — built just to play with friends and help others enjoy the game online. No profit is made from this site. I do not claim ownership of any UNO® intellectual property. All assets were sourced from publicly available resources on the web.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
  onStart: (playerName: string, gameMode: 'classic' | 'flip' | 'mercy', bots: CpuBot[], avatarSeed: string) => void;
}

function CpuLobbyView({ avatarOffset, onNextAvatar, isLoading, allBotNames, botBgColors, onBack, onStart }: CpuLobbyViewProps) {
  const [cpuPlayerName, setCpuPlayerName] = useState(() => {
    try {
      return localStorage.getItem('uno_player_name') || '';
    } catch (_) {
      return '';
    }
  });
  const [cpuGameMode, setCpuGameMode] = useState<'classic' | 'flip' | 'mercy'>('classic');
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
          <div className={`absolute left-6 -top-5.5 ${cpuGameMode === 'flip' ? 'bg-brand-flip' : cpuGameMode === 'mercy' ? 'bg-[#e67e22]' : 'bg-brand-blue hover:bg-brand-red'} border-2 border-[#0f172a] px-5 py-2.5 rounded-[8px] shadow-[2px_2px_0_#0f172a] transition-all duration-180 ease-out cursor-pointer`}>
            <h2 className="text-white font-black text-xs tracking-wider uppercase select-none flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" />
              {cpuGameMode === 'mercy' ? 'No Mercy Mode' : 'Play vs Computer'}
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
              maxLength={14}
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

          {/* Game Mode Switcher — 3-way: Classic / Flip / No Mercy */}
          <div className="flex flex-col items-center w-full max-w-[320px] mt-2 mb-4">
            <div className="flex w-full bg-neutral-card border-2 border-[#0f172a] rounded-[14px] p-0.5 shadow-[2px_2px_0_#0f172a] overflow-hidden relative">
              <motion.div
                className="absolute top-0.5 bottom-0.5 rounded-[10px] border-2 border-[#0f172a] shadow-[1px_1px_0_#0f172a] z-0"
                style={{ width: 'calc(33.33% - 3px)' }}
                animate={{
                  x: cpuGameMode === 'classic' ? 0 : cpuGameMode === 'flip' ? '100%' : '200%',
                  backgroundColor: cpuGameMode === 'classic' ? '#cc3333' : cpuGameMode === 'flip' ? '#4c1d95' : '#e67e22'
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
              <button
                onClick={() => setCpuGameMode('mercy')}
                className={`flex-1 py-1.5 text-[10px] font-black tracking-wider uppercase rounded-[10px] cursor-pointer relative z-10 transition-colors duration-200 ${cpuGameMode === 'mercy' ? 'text-white' : 'text-[#0f172a] hover:bg-neutral-bg/30'
                  }`}
              >
                No Mercy
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
            <span className={`btn-3d-edge ${cpuGameMode === 'flip' ? 'btn-3d-edge-purple' : cpuGameMode === 'mercy' ? 'btn-3d-edge-orange' : 'btn-3d-edge-green'}`} />
            <div className={`btn-3d-front ${cpuGameMode === 'flip' ? 'btn-3d-front-purple' : cpuGameMode === 'mercy' ? 'btn-3d-front-orange' : 'btn-3d-front-green'} flex items-center justify-center relative w-full px-12 gap-2 text-xs font-bold uppercase tracking-wider`}>
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

interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_DATA: FaqItem[] = [
  {
    question: "How to play UNO?",
    answer: "Play starts by matching the top card of the discard pile by color, number, or action symbol. If you cannot match, you must draw a card from the deck. Special action cards like Skip (miss the next player's turn), Reverse (change play direction), Draw Two (force the next player to draw 2 cards), and Wild cards add strategy to every round. The first player to discard all their cards wins the round. Remember to call 'UNO' when you are down to your last card — if another player catches you before your next turn starts, you must draw 2 penalty cards!"
  },
  {
    question: "What does shuffle hands mean in UNO?",
    answer: "In versions of UNO featuring the 'Shuffle Hands' wild card, the player who plays it collects all cards from every player's hand, shuffles them together into a single deck, and redeals them as evenly as possible to all players starting from their left."
  },
  {
    question: "Is UNO cross platform?",
    answer: "Yes, UNO With Friends is fully cross-platform. Because it runs directly in any modern web browser, players on Windows, Mac, Linux, iOS, and Android can all join the same multiplayer lobby and play together seamlessly. No app store download, operating system compatibility check, or platform-specific account is required — just open the link and play."
  },
  {
    question: "How many cards do you get in UNO?",
    answer: "Each player is dealt exactly 7 cards at the start of a round. The remaining cards are placed face down to form the draw pile. The top card of the draw pile is flipped to start the discard pile. If the starting card is an action card such as a Reverse, Skip, or Draw Two, its effect takes place immediately at the beginning of the round before any player has made a move."
  },
  {
    question: "How many cards in an UNO deck?",
    answer: "A standard classic UNO deck consists of 108 cards: 76 number cards (0-9 in four colors: Red, Blue, Green, and Yellow, with each number 1-9 appearing twice per color and a single 0 per color), 24 action cards (2 Skip, 2 Reverse, and 2 Draw Two per color), and 8 Wild cards (4 standard Wild and 4 Wild Draw Four)."
  },
  {
    question: "How to play UNO Flip?",
    answer: "UNO Flip! features a double-sided deck: a Light Side and a Dark Side. Play starts on the Light Side using the standard colors Red, Blue, Green, and Yellow. When any player plays a 'Flip' card, all cards in every player's hand, the draw deck, and the discard pile instantly flip over to the Dark Side, introducing the colors Orange, Pink, Teal, and Purple along with aggressive penalty cards — Draw Five forces the next player to draw 5 cards, and Skip Everyone gives the current player another turn while everyone else in the round is skipped entirely."
  },
  {
    question: "How to play UNO online with friends?",
    answer: "To play with friends, go to the home menu, enter your name, and choose 'Host Game' to create a private multiplayer room. You will get a 6-character room code and an invite link that you can share with your friends. They can enter this code in the 'Join Game' input to join your lobby instantly. Once everyone is in the lobby and ready, the host clicks Start Game to begin. The game supports up to 4 players simultaneously."
  },
  {
    question: "Is UNO online free?",
    answer: "Yes! UNO With Friends is 100% free to play. There are no fees, hidden paywalls, account registrations, or app store downloads required to start playing with your friends or against the computer. The entire game runs in your browser using WebSockets for real-time multiplayer — no plugins or installations needed."
  },
  {
    question: "Can I play UNO against a computer bot?",
    answer: "Yes! Select 'Play with Computer' on the home screen, enter your name, and add between 1 and 3 CPU bot opponents. The bots play with intelligent strategy — they prioritize colored action cards to pressure you, save Wild cards as a last resort, and automatically pick the best color when playing a Wild. Bot games start immediately with no waiting for other players, making them perfect for solo practice or a quick solo session."
  },
  {
    question: "What happens if I forget to call UNO?",
    answer: "If you play your second-to-last card and are left with only one card in your hand, you must call UNO before the next player begins their turn. If another player spots this and taps the 'Caught!' button first, you are penalized with 2 extra draw cards. This rule is one of the most exciting and tension-filled mechanics in UNO — always keep an eye on opponents who are running low on cards!"
  },
  {
    question: "What is the UNO Wild Draw Four rule?",
    answer: "The Wild Draw Four card lets you choose the new active color and forces the next player to draw 4 cards and lose their turn. However, you may only legally play it when you have no card in your hand that matches the current color. If a player suspects you had a valid play and used the Wild Draw Four illegally, they can challenge you. If caught bluffing, you draw 4 cards instead. If the challenge fails, the challenger draws 6 cards."
  },
  {
    question: "How does the turn timer work?",
    answer: "Each player has 30 seconds to take their turn. A depleting progress ring around your avatar shows how much time remains — green when time is plentiful, yellow as it gets low, and red when nearly expired. If you do not play a card or draw within the 30-second window, the server automatically draws a card for you and passes the turn to the next player. The timer is synchronized across all clients so every player sees the same countdown in real time."
  },
  {
    question: "What are the Dark Side colors in UNO Flip?",
    answer: "On the Dark Side of UNO Flip!, the four colors are Orange, Pink, Teal, and Purple — replacing the standard Light Side colors of Red, Blue, Green, and Yellow. Each Dark Side card is significantly more punishing: Draw Five replaces Draw One, Skip Everyone replaces Skip, and Wild Draw Color (forces all other players to draw until they hit a card matching the chosen color) replaces Wild Draw Two."
  },
  {
    question: "Is there a hand size limit in UNO?",
    answer: "In standard UNO rules, there is no official hand size limit — players can accumulate as many cards as their bad luck demands! However, in the brutal UNO No Mercy variant (fully playable on this platform), a mercy rule instantly eliminates any player who accumulates 25 or more cards in their hand. This creates intense pressure to find plays quickly and not let draw penalties stack up unchecked."
  }
];

const FAQ_VISIBLE_COUNT = 6;

function VisualFaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const toggleIndex = (idx: number) => {
    setOpenIndex(prev => prev === idx ? null : idx);
  };

  const visibleFaqs = showAll ? FAQ_DATA : FAQ_DATA.slice(0, FAQ_VISIBLE_COUNT);
  const hiddenCount = FAQ_DATA.length - FAQ_VISIBLE_COUNT;

  return (
    <div className="mt-12 max-w-2xl mx-auto text-left w-full select-text pointer-events-auto">
      <div className="relative bg-brand-yellow border-2 border-[#0f172a] px-5 py-2 rounded-[8px] shadow-[2px_2px_0_#0f172a] inline-block mb-6 transform -rotate-1">
        <h2 className="text-[#0f172a] font-black text-xs sm:text-sm tracking-wider uppercase select-none">
          Frequently Asked Questions
        </h2>
      </div>

      <div className="flex flex-col gap-3">
        {visibleFaqs.map((item, idx) => {
          const isOpen = openIndex === idx;
          return (
            <div
              key={idx}
              className="bg-white border-3 border-[#0f172a] rounded-[16px] shadow-[4px_4px_0_#0f172a] overflow-hidden transition-all duration-200"
            >
              <button
                onClick={() => toggleIndex(idx)}
                className="w-full text-left p-4 sm:p-5 flex items-center justify-between font-black text-xs sm:text-sm text-[#0f172a] hover:bg-neutral-bg cursor-pointer select-none"
              >
                <h3 className="font-black text-xs sm:text-sm text-[#0f172a] m-0">{item.question}</h3>
                <span className="text-sm font-black transition-transform duration-200 transform flex-shrink-0 ml-2" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  ▼
                </span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                  >
                    <div className="px-4 sm:px-5 pb-4 sm:pb-5 text-neutral-muted font-bold text-xs leading-relaxed border-t border-[#0f172a]/15 pt-3">
                      {item.answer}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Show more / Show less toggle */}
      <div className="flex justify-center mt-5">
        <button
          onClick={() => { setShowAll(v => !v); if (showAll) setOpenIndex(null); }}
          className="flex items-center gap-2 bg-white border-2 border-[#0f172a] px-5 py-2.5 rounded-[10px] shadow-[3px_3px_0_#0f172a] font-black text-xs text-[#0f172a] uppercase tracking-wider hover:shadow-[1px_1px_0_#0f172a] hover:translate-x-[2px] hover:translate-y-[2px] transition-all duration-150 cursor-pointer select-none pointer-events-auto"
        >
          <span>{showAll ? `Show Less` : `Show ${hiddenCount} More Questions`}</span>
          <motion.span animate={{ rotate: showAll ? 180 : 0 }} transition={{ duration: 0.25 }} className="inline-block">
            ▼
          </motion.span>
        </button>
      </div>
    </div>
  );
}

function SeoArticle() {
  const [showMore, setShowMore] = useState(false);
  return (
    <div className="mt-16 max-w-2xl mx-auto text-left bg-white border-3 border-[#0f172a] rounded-[20px] p-6 sm:p-8 shadow-[6px_6px_0_#0f172a] font-sans text-xs text-[#0f172a] leading-relaxed select-text pointer-events-auto">
      <h2 className="font-black text-sm sm:text-base uppercase tracking-wider mb-4 border-b-2 border-[#0f172a] pb-2">
        Welcome to UNO With Friends &ndash; The Ultimate Free Online UNO Game
      </h2>
      <div className="space-y-4">
        <p>
          Are you ready to play the ultimate <strong>uno game</strong> online? Welcome to <strong>UNO With Friends</strong>, a completely browser-based, interactive web application where you can play <strong>online uno with friends free</strong> anytime, anywhere. Whether you want to test your strategy against advanced computer AI bots or gather your buddies for a classic match, this <strong>online uno</strong> experience provides the perfect digital playground. Best of all, it requires no downloads or registration, making it the premier platform for a <strong>free uno with friends</strong> session.
        </p>
        <p>
          To get started with <strong>uno with friends online free</strong>, simply enter your name on the home screen, choose your game mode, and either create a private lobby or join an existing one using a 6-character room code. You can invite players instantly by sharing the direct invite link. If you're playing solo, my smart CPU bots are ready to challenge you in a fast-paced game.
        </p>
        <p>
          The core gameplay follows the official <strong>uno rules</strong>. Each player starts with 7 cards, and the goal is to be the first to discard all cards in your hand. On your turn, you must match the top card of the discard pile by color, number, or symbol. If you don't have a matching card, you must draw from the deck. The excitement comes from action cards like the legendary <strong>uno reverse card</strong> (or <strong>reverse uno card</strong>) which changes the direction of play, Skip cards, and Wild cards. Remember: you must yell <strong>UNO</strong> when you have exactly one card left in your hand, or risk being caught by other players!
        </p>
        <p>
          This web application features two distinct game modes: Classic and <strong>uno flip</strong>. If you choose <strong>uno flip</strong>, you will play with a double-sided deck. The game starts on the Light Side, but the moment a Flip card is played, the deck, discard pile, and everyone's hands flip over to the Dark Side. The Dark Side introduces much more aggressive action cards and rules. To master this mode, you must learn the <strong>uno flip rules</strong>, which include cards like Draw Five (forcing the next player to draw five cards) and Skip Everyone (giving the player who laid it another turn immediately).
        </p>

        {/* Expandable extra paragraphs */}
        <AnimatePresence initial={false}>
          {showMore && (
            <motion.div
              key="seo-extra"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="space-y-4">
                <p>
                  While this app supports the classic game and the flip variant, the world of UNO has many exciting versions. Players often discuss <strong>uno no mercy</strong>, one of the most intense editions of the game. The <strong>uno no mercy rules</strong> are known for stacking draw cards (where +2 and +4 can accumulate), introducing Wild Draw 10 cards, and enforcing a mercy rule where players with 25 or more cards are instantly eliminated. While <strong>uno no mercy</strong> pushes players to the limit, playing <strong>uno flip</strong> on this platform offers a similarly dynamic shift in momentum that will test any veteran player's card game strategy.
                </p>
                <p>
                  One of the most strategic aspects of the classic <strong>uno game</strong> is knowing when to play your action cards. Skip and Reverse cards are most effective when you want to deny a dangerous opponent their turn, especially when they are sitting on just one or two cards. Wild Draw Four cards must be saved carefully &mdash; they can only be played legally when you have no other matching card in your hand, and savvy opponents can challenge the play if they suspect you are bluffing. Building your hand around a dominant color is the simplest way to consistently win rounds of <strong>uno with friends</strong>.
                </p>
                <p>
                  Playing <strong>online uno</strong> against CPU bots is a fantastic way to sharpen your skills before jumping into competitive multiplayer lobbies. The computer opponents on this platform are programmed with intelligent decision-making logic: they prioritize playing action cards to pressure opponents, save Wild cards until no other move is available, and automatically select the color they hold the most of when playing a Wild. Practicing against bots also helps you understand tempo &mdash; how quickly you burn through your hand versus how quickly your opponents do the same.
                </p>
                <p>
                  Multiplayer lobbies on this platform support up to four players simultaneously. Once a room is created, the host receives a unique 6-character alphanumeric room code that can be shared via chat, messaging apps, or the built-in copy-invite-link button. Players who join the lobby can mark themselves as ready, and the host can start the game once everyone is prepared. All game state &mdash; card draws, plays, Wild color selections, UNO calls, and turn timers &mdash; is synchronized across all connected clients in real time through a WebSocket connection.
                </p>
                <p>
                  Every game includes a 30-second turn timer to keep the pace moving and prevent idle players from stalling a lobby. The timer is displayed prominently next to the active player's avatar as a depleting progress ring, changing color from green to yellow to red as time runs low. If a player does not act within their 30 seconds, the server automatically draws a card for them and passes the turn. This ensures that every game of <strong>free uno with friends</strong> remains fast, fair, and fun for all participants.
                </p>
                <p>
                  The UNO Flip! mode on this platform uses an authentic double-sided card representation. On the Light Side, the four standard colors &mdash; Red, Blue, Green, and Yellow &mdash; are in play. When the board flips to the Dark Side, the color scheme switches entirely to Orange, Pink, Teal, and Purple, and the entire hand of every player transforms to reveal its dark-side face. The Dark Side cards carry heavier penalties and fewer exits, making every decision far more consequential. Mastering the timing of a Flip card to catch opponents at a disadvantage is the hallmark of an expert <strong>uno flip</strong> player.
                </p>
                <p>
                  Join the fun today, play a quick game, master the <strong>uno reverse card</strong> timing, and experience the best <strong>uno online game</strong> with your friends for free! Whether you are a casual player looking for a few rounds of the classic card game or a veteran strategist ready to tackle the double-sided chaos of UNO Flip!, this platform has everything you need to enjoy an authentic, polished, and completely <strong>free uno with friends</strong> experience right in your web browser.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Read more / Read less toggle */}
        <div className="flex justify-center pt-1">
          <button
            onClick={() => setShowMore(v => !v)}
            className="flex items-center gap-2 bg-white border-2 border-[#0f172a] px-5 py-2.5 rounded-[10px] shadow-[3px_3px_0_#0f172a] font-black text-xs text-[#0f172a] uppercase tracking-wider hover:shadow-[1px_1px_0_#0f172a] hover:translate-x-[2px] hover:translate-y-[2px] transition-all duration-150 cursor-pointer select-none pointer-events-auto"
          >
            <span>{showMore ? 'Read Less' : 'Read More'}</span>
            <motion.span animate={{ rotate: showMore ? 180 : 0 }} transition={{ duration: 0.25 }} className="inline-block">
              &#9660;
            </motion.span>
          </button>
        </div>
      </div>
    </div>
  );
}

let serverTimeOffset = 0;

function App() {
  const { width, height } = useWindowSize();
  const isShort = height < 680;
  const isVeryShort = height < 520;
  const isMobile = width < 640;

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
  const [gameMode, setGameMode] = useState<'classic' | 'flip' | 'mercy'>(() => {
    try {
      const val = localStorage.getItem('uno_game_mode');
      return (val === 'classic' || val === 'flip' || val === 'mercy') ? val : 'classic';
    } catch (e) {
      return 'classic';
    }
  });
  const [room, setRoom] = useState<any>(null);
  const roomRef = useRef(room);

  const updateRoomState = (newRoom: any) => {
    if (newRoom && newRoom.serverTime) {
      serverTimeOffset = newRoom.serverTime - Date.now();
    }
    if (newRoom && roomRef.current) {
      const oldEliminated = roomRef.current.eliminatedPlayers || [];
      const newEliminated = newRoom.eliminatedPlayers || [];
      const newlyEliminated = newEliminated.filter((id: string) => !oldEliminated.includes(id));
      if (newlyEliminated.length > 0) {
        newlyEliminated.forEach((id: string) => {
          const player = newRoom.players.find((p: any) => p.id === id);
          if (player) {
            pushNotification({
              message: `${player.name} has been ELIMINATED by the Mercy Rule! (25+ cards) 💀`,
              type: 'error'
            });
            playSoundEffect('knockout', soundEnabledRef.current);
          }
        });
      }
    }
    setRoom(newRoom);
  };
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
  const myPlayerIdRef = useRef(myPlayerId);
  useEffect(() => {
    myPlayerIdRef.current = myPlayerId;
  }, [myPlayerId]);
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
  // Stacking notification queue — newest first
  const [gameNotifications, setGameNotifications] = useState<{ id: string; message: string; type: 'info' | 'success' | 'warning' | 'error' }[]>([]);

  const pushNotification = (notif: { message: string; type: 'info' | 'success' | 'warning' | 'error' }) => {
    const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    setGameNotifications(prev => [{ id, ...notif }, ...prev]);
    setTimeout(() => {
      setGameNotifications(prev => prev.filter(n => n.id !== id));
    }, 6000);
  };

  const [activeChallengeOutcome, setActiveChallengeOutcome] = useState<{
    challengerId: string;
    wantsToChallenge: boolean;
    playedBy: string;
    targetPlayerId: string;
    playedPlayerHand: string[];
    colorBeforePlay: string;
    guilty?: boolean;
    accepted?: boolean;
    cardsDrawn: number;
  } | null>(null);
  // Tracks whether the current game was started as a CPU game (to skip lobby flash)
  const isCpuGameRef = useRef(false);

  // Hover states for Explore Game Modes cards (3D parallax mouse follow)
  const [classicHover, setClassicHover] = useState({ rotateX: 0, rotateY: 0, x: 0, y: 0, rotate: 6, scale: 1.0 });
  const [flipHover, setFlipHover] = useState({ rotateX: 0, rotateY: 0, x: 0, y: 0, rotate: -6, scale: 1.0 });
  const [mercyHover, setMercyHover] = useState({ rotateX: 0, rotateY: 0, x: 0, y: 0, rotate: 3, scale: 1.0 });

  const handleShowcaseMouseMove = (e: React.MouseEvent<HTMLDivElement>, type: 'classic' | 'flip' | 'mercy') => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const xc = rect.width / 2;
    const yc = rect.height / 2;
    const dx = (x - xc) / xc; // range -1 to 1
    const dy = (y - yc) / yc; // range -1 to 1

    const maxTilt = 22; // Maximum tilt angle in degrees
    const maxTranslate = 8; // Maximum shift offset in pixels

    if (type === 'classic') {
      setClassicHover({
        rotateX: -dy * maxTilt,
        rotateY: dx * maxTilt,
        x: dx * maxTranslate,
        y: dy * maxTranslate,
        rotate: 6 + dx * 8,
        scale: 1.12,
      });
    } else if (type === 'flip') {
      setFlipHover({
        rotateX: -dy * maxTilt,
        rotateY: dx * maxTilt,
        x: dx * maxTranslate,
        y: dy * maxTranslate,
        rotate: -6 + dx * 8,
        scale: 1.12,
      });
    } else if (type === 'mercy') {
      setMercyHover({
        rotateX: -dy * maxTilt,
        rotateY: dx * maxTilt,
        x: dx * maxTranslate,
        y: dy * maxTranslate,
        rotate: 3 + dx * 8,
        scale: 1.12,
      });
    }
  };

  const handleShowcaseMouseLeave = (type: 'classic' | 'flip' | 'mercy') => {
    if (type === 'classic') {
      setClassicHover({ rotateX: 0, rotateY: 0, x: 0, y: 0, rotate: 6, scale: 1.0 });
    } else if (type === 'flip') {
      setFlipHover({ rotateX: 0, rotateY: 0, x: 0, y: 0, rotate: -6, scale: 1.0 });
    } else if (type === 'mercy') {
      setMercyHover({ rotateX: 0, rotateY: 0, x: 0, y: 0, rotate: 3, scale: 1.0 });
    }
  };

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
      localStorage.setItem('uno_backend_url', BACKEND_URL);
    } catch (_) { }
  }, []);

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

    // Track connect_error retries — redirect to 500 error page if server is unreachable after 3 attempts
    let connectErrorCount = 0;
    socket.on('connect_error', (err) => {
      console.error('Socket connection error occurred:', err);
      connectErrorCount++;
      if (connectErrorCount >= 3) {
        console.warn('Server unreachable after 3 attempts. Redirecting to server error page...');
        window.location.href = '/500.html';
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
      updateRoomState(data.room);
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
      updateRoomState(data.room);
      setView('lobby');
    });

    socket.on('room_updated', (updatedRoom) => {
      console.log('Socket room_updated received. Payload:', updatedRoom);
      updateRoomState(updatedRoom);
      if (updatedRoom && updatedRoom.gameMode) {
        setGameMode(updatedRoom.gameMode);
      }
      if (updatedRoom && !updatedRoom.gameStarted) {
        setView('lobby');
      }
    });

    socket.on('game_state_updated', (updatedRoom) => {
      console.log('Socket game_state_updated received. Payload:', updatedRoom);
      if (updatedRoom && updatedRoom.serverTime) {
        serverTimeOffset = updatedRoom.serverTime - Date.now();
      }

      const prevRoom = roomRef.current;
      if (prevRoom && updatedRoom && updatedRoom.gameStarted) {
        const prevDiscardSize = prevRoom.discardPileSize || 0;
        const nextDiscardSize = updatedRoom.discardPileSize || 0;



        let cardWasPlayed = false;
        if (nextDiscardSize > prevDiscardSize) {
          cardWasPlayed = true;
          const cardId = updatedRoom.discardPileTop;
          playSoundEffect('play', soundEnabledRef.current, cardId, updatedRoom.gameMode, updatedRoom.side, updatedRoom.currentColor, prevRoom.currentColor);
        } else if (nextDiscardSize < prevDiscardSize && nextDiscardSize > 0) {
          playSoundEffect('shuffle', soundEnabledRef.current);
        }

        const prevDeckSize = prevRoom.deckSize || 0;
        const nextDeckSize = updatedRoom.deckSize || 0;

        // Draw check: detect if any player drew cards (only play sound for penalty or stack draw)
        if (nextDeckSize < prevDeckSize) {
          if (prevRoom.gameStarted) {
            // Find newly eliminated players in this update to skip their draw sounds
            const prevEliminated = prevRoom.eliminatedPlayers || [];
            const nextEliminated = updatedRoom.eliminatedPlayers || [];
            const newlyEliminated = nextEliminated.filter((id: string) => !prevEliminated.includes(id));

            let maxDrawn = 0;
            if (prevRoom.players && updatedRoom.players) {
              updatedRoom.players.forEach((nextPlayer: any) => {
                // Skip playing draw sounds for newly eliminated/knocked-out players
                if (newlyEliminated.includes(nextPlayer.id)) {
                  return;
                }

                const prevPlayer = prevRoom.players.find((p: any) => p.id === nextPlayer.id);
                if (prevPlayer) {
                  const prevCount = prevPlayer.handCardCount !== undefined
                    ? prevPlayer.handCardCount
                    : (prevPlayer.hand?.length || 0);
                  const nextCount = nextPlayer.handCardCount !== undefined
                    ? nextPlayer.handCardCount
                    : (nextPlayer.hand?.length || 0);

                  if (nextCount > prevCount) {
                    const diff = nextCount - prevCount;
                    if (diff > maxDrawn) {
                      maxDrawn = diff;
                    }
                  }
                }
              });
            }

            // If the only players drawing cards in this update were knocked out, do not fall back to deck size difference
            let knockedOutPlayerDrew = false;
            if (prevRoom.players && updatedRoom.players) {
              updatedRoom.players.forEach((nextPlayer: any) => {
                if (newlyEliminated.includes(nextPlayer.id)) {
                  const prevPlayer = prevRoom.players.find((p: any) => p.id === nextPlayer.id);
                  if (prevPlayer) {
                    const prevCount = prevPlayer.handCardCount !== undefined ? prevPlayer.handCardCount : (prevPlayer.hand?.length || 0);
                    const nextCount = nextPlayer.handCardCount !== undefined ? nextPlayer.handCardCount : (nextPlayer.hand?.length || 0);
                    if (nextCount > prevCount) {
                      knockedOutPlayerDrew = true;
                    }
                  }
                }
              });
            }

            const fallbackDrawn = knockedOutPlayerDrew ? 0 : (prevDeckSize - nextDeckSize);
            const finalDrawnCount = maxDrawn > 0 ? maxDrawn : fallbackDrawn;

            if (finalDrawnCount > 0) {
              // Play a single draw sound instead of multiple stacked sounds, delaying slightly if a card was played
              const initialDelay = cardWasPlayed ? 800 : 0;
              setTimeout(() => {
                playSoundEffect('draw', soundEnabledRef.current);
              }, initialDelay);
            }
          }
        }


      }

      updateRoomState(updatedRoom);

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
      pushNotification({ message: `${callerName} called UNO! 📣`, type: 'info' });
    });

    socket.on('seven_swapped', (data: any) => {
      console.log('Socket seven_swapped received:', data);
      playSoundEffect('shuffle', soundEnabledRef.current);
      const currentRoom = roomRef.current;
      const player1 = currentRoom?.players.find((p: any) => p.id === data.playedBy)?.name || 'Someone';
      const player2 = currentRoom?.players.find((p: any) => p.id === data.targetPlayerId)?.name || 'Someone';
      pushNotification({ message: `${player1} swapped hands with ${player2}! 🔄`, type: 'info' });
    });

    socket.on('uno_caught', (data: any) => {
      console.log('Socket uno_caught received:', data);
      const currentRoom = roomRef.current;
      const targetName = currentRoom?.players.find((p: any) => p.id === data.caughtPlayerId)?.name || 'Someone';
      const catcherName = currentRoom?.players.find((p: any) => p.id === data.caughtBy)?.name || 'Someone';
      pushNotification({ message: `${catcherName} caught ${targetName}! 🫵 ${targetName} draws 2 cards!`, type: 'warning' });
      playSoundEffect('challenge', soundEnabledRef.current);
    });

    socket.on('uno_catch_failed', () => {
      console.log('Socket uno_catch_failed received');
      pushNotification({ message: 'Catch failed! Opponent already called UNO or has more/fewer cards.', type: 'error' });
    });

    socket.on('challenge_resolved', (data: any) => {
      console.log('Socket challenge_resolved received:', data);
      const currentRoom = roomRef.current;
      if (!currentRoom) return;

      const challenger = currentRoom.players.find((p: any) => p.id === data.challengerId)?.name || 'Someone';
      const playedById = data.playedBy || currentRoom.pendingChallenge?.playedBy;
      const playedByPlayer = currentRoom.players.find((p: any) => p.id === playedById)?.name || 'the opponent';

      if (data.guilty) {
        pushNotification({
          message: `${challenger} successfully challenged ${playedByPlayer}! ${playedByPlayer} draws ${data.cardsDrawn} cards! 🫵`,
          type: 'success'
        });
      } else if (data.guilty === false) {
        pushNotification({
          message: `${challenger} challenged ${playedByPlayer} but failed! ${challenger} draws ${data.cardsDrawn} cards! ❌`,
          type: 'error'
        });
      } else if (data.accepted) {
        pushNotification({
          message: `${challenger} accepted the penalty and drew ${data.cardsDrawn} cards. 🤝`,
          type: 'info'
        });
      }

      if (data.wantsToChallenge) {
        setActiveChallengeOutcome(data);
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
      updateRoomState(data.room);
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
                <div className={`border-2 border-[#0f172a] px-5 py-2 rounded-[8px] shadow-[2px_2px_0_#0f172a] -mt-10 mb-4 transform -rotate-1 flex items-center gap-2 ${activeModal.title.toLowerCase().includes('error') ||
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
    const isMercyMode = room?.gameMode === 'mercy';

    const headerBg = isFlipMode ? 'bg-[#4c1d95]' : isMercyMode ? 'bg-[#c0392b]' : 'bg-brand-red';
    const title = isFlipMode ? 'UNO FLIP™ Official Rules' : isMercyMode ? 'UNO No Mercy Official Rules' : 'UNO Classic Official Rules';

    return (
      <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm pointer-events-auto">
        <div className="relative w-full max-w-xl bg-white border-3 border-[#0f172a] rounded-[20px] shadow-[8px_8px_0_#0f172a] flex flex-col max-h-[80vh]">
          {/* Modal Header */}
          <div className={`${headerBg} border-b-3 border-[#0f172a] px-6 py-4 rounded-t-[17px] flex items-center justify-between`}>
            <h3 className="text-white font-black text-sm sm:text-base tracking-wider uppercase">
              {title}
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
            ) : isMercyMode ? (
              <>
                {/* ── NO MERCY RULES ── */}
                <div className="border-2 border-[#0f172a] p-3 rounded-lg bg-[#c0392b]/10">
                  <span className="font-extrabold uppercase text-[#0f172a] block mb-1">
                    UNO NO MERCY IN A NUTSHELL
                  </span>
                  <p className="leading-relaxed">
                    UNO No Mercy plays like standard UNO but with <strong>brutal</strong> power cards that can stack. Draw cards accumulate across players until someone can't dodge — and if your hand exceeds <strong>25 cards</strong>, you're instantly <strong>eliminated</strong>. Last player standing wins!
                  </p>
                </div>

                <div>
                  <span className="font-extrabold uppercase text-[#0f172a] block border-b-2 border-[#0f172a] pb-1 mb-2">
                    HOW TO PLAY
                  </span>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Match the top card of the discard pile by color, number, or action symbol.</li>
                    <li>If you cannot play, draw one card. If it's playable, play it immediately; otherwise pass.</li>
                    <li><strong>Draw cards stack!</strong> If a Draw Two is played, the next player must play another Draw Two to pass the penalty on — or absorb the full accumulated draw count.</li>
                    <li><strong>Yell "UNO"</strong> when you have exactly 1 card left — or opponents can catch you and force you to draw 2!</li>
                    <li>Any player whose hand reaches <strong>25 cards is immediately eliminated</strong>.</li>
                  </ul>
                </div>

                <div>
                  <span className="font-extrabold uppercase text-[#0f172a] block border-b-2 border-[#0f172a] pb-1 mb-2">
                    ACTION CARDS
                  </span>
                  <ul className="space-y-1.5">
                    <li><strong>Draw Two (+2):</strong> Next player must draw 2 cards and skip their turn — or counter with another Draw Two to stack the penalty.</li>
                    <li><strong>Reverse:</strong> Reverses the direction of play.</li>
                    <li><strong>Skip:</strong> Skips the next player's turn entirely.</li>
                    <li><strong>Wild Card:</strong> Choose any color to continue play.</li>
                    <li><strong>Wild Draw Four (+4):</strong> Choose color; next player draws 4 cards and loses their turn. Can be challenged — if you're caught having a matching color, you draw the 4 instead.</li>
                    <li><strong>Wild Draw Two (Wild +2):</strong> Choose color; next player draws 2 and skips. Can stack with other draw cards.</li>
                    <li><strong>Skip Everyone:</strong> Every other player is skipped — you get an immediate extra turn.</li>
                    <li><strong>Discard All:</strong> Instantly discard every card of a chosen color from your hand.</li>
                    <li><strong>Wild Shuffle Hands:</strong> Collect all hands, shuffle, and redistribute randomly.</li>
                    <li><strong>Wild (Seven-0):</strong> Playing a 7 lets you swap your hand with any player; playing a 0 rotates all hands in play direction.</li>
                  </ul>
                </div>

                <div>
                  <span className="font-extrabold uppercase text-[#0f172a] block border-b-2 border-[#0f172a] pb-1 mb-2">
                    STACKING DRAW CARDS
                  </span>
                  <p className="leading-relaxed mb-1">
                    Draw penalties can be passed along the table. If Player A plays <strong>+2</strong>, Player B can respond with another <strong>+2</strong> to make it +4 for Player C, and so on. The chain breaks when a player cannot match — they absorb the full accumulated total.
                  </p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Draw Two stacks with Draw Two and Wild Draw Two.</li>
                    <li>Wild Draw Four stacks with Wild Draw Four.</li>
                    <li>Stacking across different draw types is <strong>not allowed</strong>.</li>
                  </ul>
                </div>

                <div>
                  <span className="font-extrabold uppercase text-[#0f172a] block border-b-2 border-[#0f172a] pb-1 mb-2">
                    ELIMINATION RULE 💀
                  </span>
                  <p className="leading-relaxed">
                    Any player who holds <strong>25 or more cards</strong> at the end of any turn is <strong>immediately eliminated</strong> from the game. Eliminated players' cards are removed and play continues. The last remaining player wins.
                  </p>
                </div>

                <div>
                  <span className="font-extrabold uppercase text-[#0f172a] block border-b-2 border-[#0f172a] pb-1 mb-2">
                    UNO CALL & CATCH
                  </span>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>When you play down to 1 card, press <strong>UNO</strong> to declare it.</li>
                    <li>If you forget, any opponent can <strong>Catch</strong> you and you draw 2 penalty cards.</li>
                    <li>A false catch (opponent already called UNO or has more than 1 card) costs the catcher nothing — the catch simply fails.</li>
                  </ul>
                </div>

                <div>
                  <span className="font-extrabold uppercase text-[#0f172a] block border-b-2 border-[#0f172a] pb-1 mb-2">
                    WILD DRAW FOUR — CHALLENGE
                  </span>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>A Wild Draw Four can only legally be played if you have <strong>no card matching the current color</strong>.</li>
                    <li>The targeted player may <strong>Challenge</strong> the play before drawing.</li>
                    <li>If the challenge is <strong>successful</strong> (player had a matching card), the offending player draws 4 instead.</li>
                    <li>If the challenge <strong>fails</strong>, the challenger draws 6 cards (4 + 2 penalty).</li>
                  </ul>
                </div>

                <div>
                  <span className="font-extrabold uppercase text-[#0f172a] block border-b-2 border-[#0f172a] pb-1 mb-2">
                    SCORING
                  </span>
                  <div className="grid grid-cols-2 gap-2 font-mono">
                    <div>Number Cards (0-9): Face Value</div>
                    <div>Draw Two / Skip / Reverse: 20 pts</div>
                    <div>Skip Everyone / Discard All: 30 pts</div>
                    <div>Wild / Wild Draw Two: 40 pts</div>
                    <div>Wild Draw Four: 50 pts</div>
                    <div>Wild Shuffle Hands: 60 pts</div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* ── CLASSIC RULES ── */}
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
                maxLength={14}
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
              <label className={`brutalist-label ${roomError ? 'bg-[#cc3333]' : gameMode === 'flip' ? 'bg-brand-flip' : gameMode === 'mercy' ? 'bg-[#e67e22]' : 'bg-brand-red'}`}>
                {roomError ? 'Invalid Room ID!' : 'Room ID'}
              </label>
            </div>

            {/* Game Mode Switcher (Host only chooses this) — 3-way */}
            <div className="flex flex-col items-center w-full max-w-[320px] mt-2 mb-4">
              <div className="flex w-full bg-neutral-card border-2 border-[#0f172a] rounded-[14px] p-0.5 shadow-[2px_2px_0_#0f172a] overflow-hidden relative">
                {/* Sliding animated background highlight */}
                <motion.div
                  className="absolute top-0.5 bottom-0.5 rounded-[10px] border-2 border-[#0f172a] shadow-[1px_1px_0_#0f172a] z-0"
                  style={{ width: 'calc(33.33% - 3px)' }}
                  animate={{
                    x: gameMode === 'classic' ? 0 : gameMode === 'flip' ? '100%' : '200%',
                    backgroundColor: gameMode === 'classic' ? '#cc3333' : gameMode === 'flip' ? '#4c1d95' : '#e67e22'
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
                <button
                  onClick={() => setGameMode('mercy')}
                  className={`flex-1 py-1.5 text-[10px] font-black tracking-wider uppercase rounded-[10px] cursor-pointer relative z-10 transition-colors duration-200 ${gameMode === 'mercy' ? 'text-white' : 'text-[#0f172a] hover:bg-neutral-bg/30'
                    }`}
                >
                  No Mercy
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

            {/* 3D Host Game Button - Mattel Red / Flip Purple / Mercy Orange */}
            <button
              onClick={handleHostGame}
              disabled={isLoading}
              className={`btn-3d w-[256px] ${isLoading ? 'opacity-75 cursor-not-allowed' : ''}`}
            >
              <span className="btn-3d-shadow" />
              <span className={`btn-3d-edge ${gameMode === 'flip' ? 'btn-3d-edge-purple' : gameMode === 'mercy' ? 'btn-3d-edge-orange' : 'btn-3d-edge-red'}`} />
              <div className={`btn-3d-front ${gameMode === 'flip' ? 'btn-3d-front-purple' : gameMode === 'mercy' ? 'btn-3d-front-orange' : 'btn-3d-front-red'} flex items-center justify-center relative w-full px-12 gap-2`}>
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
          onStart={(cpuPlayerName: string, cpuGameMode: 'classic' | 'flip' | 'mercy', cpuBots: any[], cpuAvatarSeed: string) => {
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
            <div className={`absolute left-6 -top-5.5 ${room.gameMode === 'flip' ? 'bg-brand-flip' : room.gameMode === 'mercy' ? 'bg-[#e67e22]' : 'bg-brand-red'} border-2 border-[#0f172a] px-5 py-2.5 rounded-[8px] shadow-[2px_2px_0_#0f172a]`}>
              <h2 className="text-white font-black text-xs tracking-wider uppercase select-none">
                {room.gameMode === 'flip' ? 'UNO FLIP' : room.gameMode === 'mercy' ? 'UNO NO MERCY' : 'UNO CLASSIC'}
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

    const GAME_BACKGROUNDS: Record<string, string> = room.gameMode === 'mercy' ? {
      RED: '#d71809',     // Official No Mercy Red
      BLUE: '#21558c',    // Official No Mercy Blue
      GREEN: '#215513',   // Official No Mercy Green
      YELLOW: '#e3ae15',  // Official No Mercy Yellow
      PINK: '#ec4899',
      TEAL: '#14b8a6',
      ORANGE: '#f97316',
      PURPLE: '#8b5cf6',
    } : {
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
    const bgColor = GAME_BACKGROUNDS[activeColor] || (room.gameMode === 'mercy' ? '#215513' : '#379711');

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


          {/* Stacking Notification Banners — top-right near settings button, newest first */}
          <div
            style={{
              position: 'absolute',
              top: isVeryShort ? '68px' : '84px',
              right: isVeryShort ? '8px' : '16px',
              zIndex: 400,
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              alignItems: 'flex-end',
              pointerEvents: 'none',
            }}
          >
            <AnimatePresence mode="popLayout">
              {gameNotifications.map((notif) => {
                const emojiRegex = /[\u{1F000}-\u{1F9FF}\u{2700}-\u{27BF}\u{2600}-\u{26FF}]/u;
                const match = notif.message.match(emojiRegex);
                let emoji = '';
                let text = notif.message;
                if (match) {
                  emoji = match[0];
                  text = notif.message.replace(emoji, '').replace(/\s+/g, ' ').trim();
                } else {
                  if (notif.type === 'success') emoji = '✅';
                  else if (notif.type === 'warning') emoji = '⚠️';
                  else if (notif.type === 'error') emoji = '❌';
                  else emoji = '📣';
                }

                return (
                  <motion.div
                    key={notif.id}
                    layout
                    initial={{ opacity: 0, x: 60, scale: 0.88 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 60, scale: 0.88 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                    style={{ maxWidth: '320px', width: 'max-content' }}
                    className="pointer-events-auto cursor-pointer"
                    onClick={() => setGameNotifications(prev => prev.filter(n => n.id !== notif.id))}
                  >
                    <div className="flex items-center gap-3 select-none">
                      {/* Emoji Sticker */}
                      <div
                        className="text-4xl select-none shrink-0 flex items-center justify-center transform -rotate-12 transition-all hover:rotate-0 hover:scale-110 duration-200"
                        style={{
                          filter: 'drop-shadow(3px 0 0 white) drop-shadow(-3px 0 0 white) drop-shadow(0 3px 0 white) drop-shadow(0 -3px 0 white) drop-shadow(2px 2px 0 white) drop-shadow(-2px -2px 0 white) drop-shadow(2px -2px 0 white) drop-shadow(-2px 2px 0 white) drop-shadow(3px 3px 0px #0f172a)',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '48px',
                          height: '48px'
                        }}
                      >
                        <span>{emoji}</span>
                      </div>

                      {/* Text Box Sticker Wrapper */}
                      <div 
                        className="bg-white p-[3px] shadow-[4px_4px_0_#0f172a] flex items-stretch"
                        style={{
                          borderRadius: '24px 18px 28px 20px / 20px 28px 18px 24px'
                        }}
                      >
                        {/* Text Box Inner */}
                        <div
                          className={`border-3 border-[#0f172a] px-4 py-3 font-black uppercase text-xs tracking-wider flex items-center ${
                            notif.type === 'info'
                              ? 'bg-[#ecd407] text-[#0f172a]'
                              : notif.type === 'warning'
                                ? 'bg-[#ec4899] text-white'
                                : notif.type === 'error'
                                  ? 'bg-[#cc3333] text-white'
                                  : 'bg-white text-[#0f172a]'
                          }`}
                          style={{
                            borderRadius: '20px 14px 24px 16px / 16px 24px 14px 20px'
                          }}
                        >
                          <span className="text-left">{text}</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>


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
                    isEliminated={(room.eliminatedPlayers || []).includes(opp.id)}
                    gameMode={room.gameMode}
                    side={room.side}
                    position={
                      opponents.length === 1 ? 'top' :
                        opponents.length === 2 ? (idx === 0 ? 'left' : 'right') :
                          (idx === 0 ? 'left' : idx === 1 ? 'top' : 'right')
                    }
                  />
                  <div className="relative flex items-center justify-center h-[86px] sm:h-[136px]">
                    {!(room.eliminatedPlayers || []).includes(opp.id) && (
                      <OpponentCardFan
                        cardCount={opp.handCardCount || 0}
                        direction={fanDirection}
                        side={room.side}
                        gameMode={room.gameMode}
                        isShort={isShort}
                        isVeryShort={isVeryShort}
                        hand={opp.hand}
                      />
                    )}
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
              isEliminated={(room.eliminatedPlayers || []).includes(myPlayerId)}
              gameMode={room.gameMode}
              side={room.side}
              position="player"
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
                  <div className="btn-3d-front px-4 flex items-center justify-center gap-2 font-black select-none uppercase tracking-wider text-xs text-white bg-orange-600 h-12 shadow-inner animate-pulse">
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
                  <div className="btn-3d-front flex items-center justify-center gap-2 font-black select-none uppercase tracking-widest text-xs text-white bg-[#166534] h-12">
                    <Check className="w-4 h-4" />
                    <span>UNO Called</span>
                  </div>
                </>
              ) : (
                <>
                  <span className="btn-3d-edge btn-3d-edge-red" />
                  <div className="btn-3d-front btn-3d-front-red flex items-center justify-center gap-2 font-black select-none uppercase tracking-widest text-xs text-white h-12">
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
            {/* 3D Play Direction Arrow Indicators */}
            <div
              style={{
                position: 'absolute',
                width: '600px',
                height: '600px',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%) rotateX(60deg)',
                transformStyle: 'preserve-3d',
                pointerEvents: 'none',
                zIndex: 0,
              }}
            >
              <motion.div
                animate={{
                  rotate: (room.direction || 1) === 1 ? 360 : -360,
                }}
                transition={{
                  rotate: { repeat: Infinity, ease: 'linear', duration: 15 },
                }}
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {(() => {
                  const colors = getPlayDirectionArrowColors(room.currentColor || 'GREEN', room.gameMode);
                  const isClockwise = (room.direction || 1) === 1;

                  const arrowData = isClockwise
                    ? [
                      {
                        d: "M 393.8,38.1 A 315,315 0 0,1 661.9,306.2",
                        points: "662,306 677,284 641,289",
                        gradX1: 393.8, gradY1: 38.1, gradX2: 661.9, gradY2: 306.2
                      },
                      {
                        d: "M 661.9,393.8 A 315,315 0 0,1 393.8,661.9",
                        points: "394,662 416,677 411,641",
                        gradX1: 661.9, gradY1: 393.8, gradX2: 393.8, gradY2: 661.9
                      },
                      {
                        d: "M 306.2,661.9 A 315,315 0 0,1 38.1,393.8",
                        points: "38,394 23,416 59,411",
                        gradX1: 306.2, gradY1: 661.9, gradX2: 38.1, gradY2: 393.8
                      },
                      {
                        d: "M 38.1,306.2 A 315,315 0 0,1 306.2,38.1",
                        points: "306,38 284,23 289,59",
                        gradX1: 38.1, gradY1: 306.2, gradX2: 306.2, gradY2: 38.1
                      }
                    ]
                    : [
                      {
                        d: "M 661.9,306.2 A 315,315 0 0,0 393.8,38.1",
                        points: "394,38 416,23 411,59",
                        gradX1: 661.9, gradY1: 306.2, gradX2: 393.8, gradY2: 38.1
                      },
                      {
                        d: "M 393.8,661.9 A 315,315 0 0,0 661.9,393.8",
                        points: "662,394 677,416 641,411",
                        gradX1: 393.8, gradY1: 661.9, gradX2: 661.9, gradY2: 393.8
                      },
                      {
                        d: "M 38.1,393.8 A 315,315 0 0,0 306.2,661.9",
                        points: "306,662 284,677 289,641",
                        gradX1: 38.1, gradY1: 393.8, gradX2: 306.2, gradY2: 661.9
                      },
                      {
                        d: "M 306.2,38.1 A 315,315 0 0,0 38.1,306.2",
                        points: "38,306 23,284 59,289",
                        gradX1: 306.2, gradY1: 38.1, gradX2: 38.1, gradY2: 306.2
                      }
                    ];

                  return (
                    <svg viewBox="0 0 700 700" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0px 8px 12px rgba(0,0,0,0.4))' }}>
                      <defs>
                        {/* Glow filter for core */}
                        <filter id="arrow-glow" x="-20%" y="-20%" width="140%" height="140%">
                          <feGaussianBlur stdDeviation="6" result="blur" />
                          <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>

                        {/* Tail blur filter for "fire's end" tail */}
                        <filter id="tail-blur" x="-30%" y="-30%" width="160%" height="160%">
                          <feGaussianBlur stdDeviation="12" result="blur" />
                        </filter>

                        {/* Four quadrant gradients mapped to coordinates */}
                        {arrowData.map((arrow, idx) => (
                          <linearGradient
                            key={idx}
                            id={`grad-${idx}`}
                            x1={arrow.gradX1}
                            y1={arrow.gradY1}
                            x2={arrow.gradX2}
                            y2={arrow.gradY2}
                            gradientUnits="userSpaceOnUse"
                          >
                            <stop offset="0%" stopColor={colors.glow} stopOpacity="0" />
                            <stop offset="40%" stopColor={colors.glow} stopOpacity="0.25" />
                            <stop offset="85%" stopColor={colors.glow} stopOpacity="0.8" />
                            <stop offset="100%" stopColor={colors.glow} stopOpacity="1" />
                          </linearGradient>
                        ))}
                      </defs>
                      <g filter="url(#arrow-glow)">
                        {arrowData.map((arrow, idx) => (
                          <g key={idx}>
                            {/* Blurred underlay tail glow (fires end tail) */}
                            <path
                              d={arrow.d}
                              fill="none"
                              stroke={`url(#grad-${idx})`}
                              strokeWidth="28"
                              strokeLinecap="round"
                              filter="url(#tail-blur)"
                              opacity="0.75"
                            />
                            {/* Main Core overlay (Thicker) */}
                            <path
                              d={arrow.d}
                              fill="none"
                              stroke={`url(#grad-${idx})`}
                              strokeWidth="12"
                              strokeLinecap="round"
                            />
                            {/* Arrowhead polygon (Pointed correctly) */}
                            <polygon
                              points={arrow.points}
                              fill={colors.glow}
                            />
                          </g>
                        ))}
                      </g>
                    </svg>
                  );
                })()}
              </motion.div>
            </div>

            {/* Draw Pile (Clickable to draw a card) */}
            <div
              onClick={() => {
                if (room.players[room.currentTurn]?.id === myPlayerId && !(room.eliminatedPlayers || []).includes(myPlayerId)) {
                  socket.emit('draw_card', { roomId: room.roomId });
                }
              }}
              className={`relative select-none flex-shrink-0 transition-transform ${room.players[room.currentTurn]?.id === myPlayerId && !(room.eliminatedPlayers || []).includes(myPlayerId) ? 'cursor-pointer hover:scale-105 active:scale-95' : 'cursor-not-allowed opacity-75'}`}
              style={{
                width: room.gameMode === 'flip'
                  ? (isMobile ? '81px' : '137px')
                  : room.gameMode === 'mercy'
                    ? (isMobile ? '92px' : '156px')
                    : (isMobile ? `${Math.round(130 * CLASSIC_AR)}px` : `${Math.round(220 * CLASSIC_AR)}px`),
                height: isMobile ? '130px' : '220px',
              }}
              title={room.gameMode === 'mercy' && room.drawStack?.count > 0 ? `Draw ${room.drawStack.count} cards (or stack)` : 'Draw Card'}
            >
              <div
                className={`absolute inset-0 rounded-[7px] sm:rounded-[12px] ${(room.gameMode === 'mercy' || (room.gameMode === 'flip' && room.side === 'dark')) ? 'bg-black' : 'bg-white'}`}
                style={{
                  transform: 'translate(4px, 4px)',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                }}
              />
              <div
                className={`absolute inset-0 rounded-[7px] sm:rounded-[12px] ${(room.gameMode === 'mercy' || (room.gameMode === 'flip' && room.side === 'dark')) ? 'bg-black' : 'bg-white'}`}
                style={{
                  transform: 'translate(2px, 2px)',
                  boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
                }}
              />
              <div
                className={`absolute inset-0 rounded-[7px] sm:rounded-[12px] overflow-hidden flex items-center justify-center ${(room.gameMode === 'mercy' || (room.gameMode === 'flip' && room.side === 'dark')) ? 'shadow-[0_0_0_1.5px_rgba(255,255,255,0.25),0_16px_36px_-4px_rgba(0,0,0,0.6),0_6px_12px_rgba(0,0,0,0.4)]' : 'shadow-[0_6px_12px_rgba(0,0,0,0.25)]'}`}
                style={{ backgroundColor: (room.gameMode === 'mercy' || (room.gameMode === 'flip' && room.side === 'dark')) ? '#000000' : '#ffffff' }}
              >
                <img
                  src={room.gameMode === 'flip' ? '/cards/flip/TOP_CARD.jpg' : room.gameMode === 'mercy' ? '/cards/mercy/card_back.webp' : '/cards/back.svg'}
                  alt="Draw Deck"
                  className={room.gameMode === 'flip' ? 'absolute pointer-events-none' : room.gameMode === 'mercy' ? 'w-full h-full pointer-events-none object-cover block' : 'w-full h-full pointer-events-none object-contain block'}
                  style={
                    room.gameMode === 'flip'
                      ? {
                        ...FLIP_CROP_STYLE,
                        imageRendering: 'auto',
                      }
                      : {
                        imageRendering: (room.gameMode === 'mercy' || room.gameMode === 'classic') ? 'auto' : 'pixelated',
                      }
                  }
                />
              </div>

              {/* No Mercy Draw Stack Badge on Deck */}
              {room.gameMode === 'mercy' && room.drawStack && room.drawStack.count > 0 && (
                <div
                  className="absolute -top-2 -right-2 z-30 w-7 h-7 sm:w-10 sm:h-10 rounded-full border-2 border-[#0f172a] bg-[#cc3333] shadow-[1px_1px_0_#0f172a] sm:shadow-[2px_2px_0_#0f172a] flex items-center justify-center select-none pointer-events-none"
                >
                  <div className="flex items-center justify-center font-black text-white text-[9px] sm:text-[14px] leading-none">
                    <span className="text-[7px] sm:text-[11px] mr-[0.5px] sm:mr-[1px] transform -translate-y-[0.5px]">+</span>
                    <span>{room.drawStack.count}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Discard Pile Stack */}
            <DiscardPile
              room={room}
              side={room.side}
              gameMode={room.gameMode}
              lastPlayedCardKey={lastPlayedCardKey}
              onResetPlayedKey={() => setLastPlayedCardKey(null)}
              pendingWildCard={pendingWildCard}
              setPendingWildCard={setPendingWildCard}
              socket={socket}
              setLastPlayedCardKey={setLastPlayedCardKey}
            />
          </div>

          {/* Fanned Player Cards View in React (Facing the player) */}
          {!(room.eliminatedPlayers || []).includes(myPlayerId) && (
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
          )}



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
                      {(room.pendingChallenge.type === 'WILD_ROULETTE' || room.pendingChallenge.type === 'WILD_DRAW_COLOR') ? (
                        <>
                          <h3 className="text-[#0f172a] font-black text-lg tracking-wider uppercase mb-2 select-none text-center">
                            {room.pendingChallenge.type === 'WILD_ROULETTE' ? 'COLOR ROULETTE' : 'WILD DRAW COLOR'}!
                          </h3>
                          <p className="text-xs text-neutral-muted font-bold text-center mb-6 leading-relaxed">
                            {room.players.find((p: any) => p.id === room.pendingChallenge.playedBy)?.name || 'Someone'} played a {room.pendingChallenge.type === 'WILD_ROULETTE' ? 'Color Roulette' : 'Wild Draw Color'}. You must draw cards until you get a{' '}
                            <span
                              className="font-black px-2 py-0.5 rounded border border-[#0f172a]"
                              style={{
                                color:
                                  room.gameMode === 'mercy'
                                    ? room.pendingChallenge.chosenColor === 'YELLOW'
                                      ? '#e3ae15'
                                      : room.pendingChallenge.chosenColor === 'RED'
                                        ? '#d71809'
                                        : room.pendingChallenge.chosenColor === 'BLUE'
                                          ? '#21558c'
                                          : room.pendingChallenge.chosenColor === 'GREEN'
                                            ? '#215513'
                                            : '#0f172a'
                                    : room.pendingChallenge.chosenColor === 'YELLOW'
                                      ? '#d8c206'
                                      : room.pendingChallenge.chosenColor === 'RED'
                                        ? '#cc3333'
                                        : room.pendingChallenge.chosenColor === 'BLUE'
                                          ? '#0956bf'
                                          : room.pendingChallenge.chosenColor === 'GREEN'
                                            ? '#379711'
                                            : room.pendingChallenge.chosenColor === 'PINK'
                                              ? '#ec4899'
                                              : room.pendingChallenge.chosenColor === 'TEAL'
                                                ? '#14b8a6'
                                                : room.pendingChallenge.chosenColor === 'ORANGE'
                                                  ? '#f97316'
                                                  : room.pendingChallenge.chosenColor === 'PURPLE'
                                                    ? '#8b5cf6'
                                                    : '#0f172a',
                                backgroundColor: 'rgba(15, 23, 42, 0.05)'
                              }}
                            >
                              {room.pendingChallenge.chosenColor}
                            </span>{' '}
                            card.
                          </p>
                          <div className="w-full">
                            <button
                              onClick={() => socket.emit('challenge_wild_draw_four', { roomId: room.roomId, wantsToChallenge: false })}
                              className="btn-3d w-full"
                            >
                              <span className="btn-3d-shadow" />
                              <span className="btn-3d-edge btn-3d-edge-red" />
                              <div className="btn-3d-front btn-3d-front-red flex items-center justify-center font-bold select-none uppercase tracking-wider text-xs">
                                Draw Cards
                              </div>
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <h3 className="text-[#0f172a] font-black text-lg tracking-wider uppercase mb-2 select-none text-center">
                            {room.pendingChallenge.type.replace(/_/g, ' ')} Played!
                          </h3>
                          <p className="text-xs text-neutral-muted font-bold text-center mb-6 leading-relaxed">
                            {room.players.find((p: any) => p.id === room.pendingChallenge.playedBy)?.name || 'Someone'} played a {room.pendingChallenge.type.replace(/_/g, ' ')}.<br />
                            <span className="text-[#e67e22] font-black uppercase tracking-wider text-[10px] block mt-1">Rule:</span> You can challenge if you think they had a card matching the color before this wild was played. If you are <span className="text-green-600 font-bold">right</span>, they draw the penalty. If you are <span className="text-red-600 font-bold">wrong</span>, you must draw the penalty + 2 extra cards!
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
                      )}
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


          {/* Challenge Outcome Modal */}
          <AnimatePresence>
            {activeChallengeOutcome && (
              <div className="fixed inset-0 z-[610] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className="relative bg-white border-3 border-[#0f172a] rounded-[24px] p-6 shadow-[8px_8px_0_#0f172a] flex flex-col items-center max-w-xl w-full"
                >
                  {(() => {
                    const challengerName = room.players.find((p: any) => p.id === activeChallengeOutcome.challengerId)?.name || 'Someone';
                    const challengedName = room.players.find((p: any) => p.id === activeChallengeOutcome.playedBy)?.name || 'Someone';
                    const isGuilty = activeChallengeOutcome.guilty;
                    const colorMap: Record<string, string> = room.gameMode === 'mercy' ? {
                      YELLOW: '#e3ae15',
                      RED: '#d71809',
                      BLUE: '#21558c',
                      GREEN: '#215513',
                      PINK: '#ec4899',
                      TEAL: '#14b8a6',
                      ORANGE: '#f97316',
                      PURPLE: '#8b5cf6'
                    } : {
                      YELLOW: '#d8c206',
                      RED: '#cc3333',
                      BLUE: '#0956bf',
                      GREEN: '#379711',
                      PINK: '#ec4899',
                      TEAL: '#14b8a6',
                      ORANGE: '#f97316',
                      PURPLE: '#8b5cf6'
                    };
                    const targetColorHex = colorMap[activeChallengeOutcome.colorBeforePlay] || '#0f172a';

                    return (
                      <>
                        {/* Title & Badge */}
                        <div className="flex flex-col items-center gap-2 mb-4">
                          <div className={`w-14 h-14 rounded-full border-3 border-[#0f172a] flex items-center justify-center shadow-[3px_3px_0_#0f172a] ${isGuilty ? 'bg-green-500' : 'bg-red-500'}`}>
                            {isGuilty ? (
                              <Check className="w-8 h-8 text-white stroke-[3]" />
                            ) : (
                              <X className="w-8 h-8 text-white stroke-[3]" />
                            )}
                          </div>
                          <h3 className={`font-black text-xl tracking-widest uppercase text-center ${isGuilty ? 'text-green-600' : 'text-red-600'}`}>
                            {isGuilty ? 'Challenge Successful!' : 'Challenge Failed!'}
                          </h3>
                        </div>

                        {/* Description */}
                        <p className="text-xs font-bold text-neutral-muted text-center mb-6 leading-relaxed px-4">
                          {isGuilty ? (
                            <span>
                              <strong className="text-[#0f172a]">{challengerName}</strong> successfully caught <strong className="text-[#0f172a]">{challengedName}</strong> bluffing! <strong className="text-[#0f172a]">{challengedName}</strong> had matching cards of the color{' '}
                              <span className="px-2 py-0.5 rounded border border-[#0f172a] font-black" style={{ color: targetColorHex, backgroundColor: 'rgba(15,23,42,0.05)' }}>
                                {activeChallengeOutcome.colorBeforePlay}
                              </span>{' '}
                              and must draw <strong className="text-[#0f172a]">{activeChallengeOutcome.cardsDrawn} cards</strong> as penalty!
                            </span>
                          ) : (
                            <span>
                              <strong className="text-[#0f172a]">{challengerName}</strong> challenged <strong className="text-[#0f172a]">{challengedName}</strong> but failed! <strong className="text-[#0f172a]">{challengedName}</strong> did not have any cards matching{' '}
                              <span className="px-2 py-0.5 rounded border border-[#0f172a] font-black" style={{ color: targetColorHex, backgroundColor: 'rgba(15,23,42,0.05)' }}>
                                {activeChallengeOutcome.colorBeforePlay}
                              </span>. <strong className="text-[#0f172a]">{challengerName}</strong> must draw <strong className="text-[#0f172a]">{activeChallengeOutcome.cardsDrawn} cards</strong> (draw penalty + 2 extra cards)!
                            </span>
                          )}
                        </p>



                        {/* Close button */}
                        <button
                          onClick={() => setActiveChallengeOutcome(null)}
                          className="btn-3d w-full max-w-xs"
                        >
                          <span className="btn-3d-shadow" />
                          <span className="btn-3d-edge btn-3d-edge-blue" />
                          <div className="btn-3d-front btn-3d-front-blue flex items-center justify-center font-bold select-none uppercase tracking-wider text-xs h-10">
                            Got It
                          </div>
                        </button>
                      </>
                    );
                  })()}
                </motion.div>
              </div>
            )}
          </AnimatePresence>


          {/* No Mercy: 7s Hand Swap Modal */}
          <AnimatePresence>
            {room.gameMode === 'mercy' && room.pendingSevenSwap && room.pendingSevenSwap.playedBy === myPlayerId && (
              <div className="fixed inset-0 z-[610] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className="relative bg-white border-3 border-[#0f172a] rounded-[24px] p-6 shadow-[8px_8px_0_#e67e22] flex flex-col items-center max-w-sm w-full"
                >
                  <div className="w-12 h-12 rounded-full bg-[#e67e22] border-3 border-[#0f172a] flex items-center justify-center mb-3 shadow-[3px_3px_0_#0f172a]">
                    <span className="text-white font-black text-2xl select-none">7</span>
                  </div>
                  <h3 className="text-[#0f172a] font-black text-lg tracking-wider uppercase mb-1 select-none text-center">
                    7 Played! Swap Hands
                  </h3>
                  <p className="text-xs text-neutral-muted font-bold text-center mb-5 leading-relaxed">
                    Choose an opponent to swap your hand with!
                  </p>
                  <div className="flex flex-col gap-2 w-full">
                    {room.players
                      .filter((p: any) => p.id !== myPlayerId && !(room.eliminatedPlayers || []).includes(p.id))
                      .map((p: any) => (
                        <button
                          key={p.id}
                          onClick={() => socket.emit('resolve_seven_swap', { roomId: room.roomId, targetPlayerId: p.id })}
                          className="btn-3d w-full"
                        >
                          <span className="btn-3d-shadow" />
                          <span className="btn-3d-edge btn-3d-edge-orange" />
                          <div className="btn-3d-front btn-3d-front-orange flex items-center justify-center gap-2 font-bold select-none uppercase tracking-wider text-xs">
                            <span>Swap with {p.name}</span>
                            <span className="text-white/70 text-[10px]">({p.handCardCount} cards)</span>
                          </div>
                        </button>
                      ))
                    }
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* No Mercy: Waiting for 7 swap (other players see this) */}
          <AnimatePresence>
            {room.gameMode === 'mercy' && room.pendingSevenSwap && room.pendingSevenSwap.playedBy !== myPlayerId && (
              <div className="fixed inset-0 z-[610] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className="relative bg-white border-3 border-[#0f172a] rounded-[24px] p-6 shadow-[8px_8px_0_#e67e22] flex flex-col items-center max-w-sm w-full"
                >
                  <h3 className="text-[#0f172a] font-black text-lg tracking-wider uppercase mb-2 select-none text-center animate-pulse">
                    Hand Swap in Progress...
                  </h3>
                  <p className="text-xs text-neutral-muted font-bold text-center leading-relaxed">
                    {room.players.find((p: any) => p.id === room.pendingSevenSwap.playedBy)?.name || 'Someone'} played a 7 and is choosing who to swap hands with!
                  </p>
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

        {/* Game Modes Showcase Section */}
        <div className="mt-16 max-w-2xl mx-auto px-4">
          <div className="flex justify-center mb-6">
            <div className="relative bg-brand-yellow border-2 border-[#0f172a] px-5 py-2 rounded-[8px] shadow-[2px_2px_0_#0f172a] transform -rotate-1 select-none">
              <h3 className="text-[#0f172a] font-black text-xs uppercase tracking-wider">
                Explore Game Modes
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            {/* Classic UNO Card */}
            <motion.div
              whileHover={{ y: -4, boxShadow: '6px 6px 0 #0f172a' }}
              onMouseMove={(e) => handleShowcaseMouseMove(e, 'classic')}
              onMouseLeave={() => handleShowcaseMouseLeave('classic')}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              onClick={() => {
                setGameMode('classic');
                setNameError(false);
                setView('friends');
              }}
              className="bg-white border-3 border-[#0f172a] rounded-[20px] p-5 shadow-[4px_4px_0_#0f172a] flex flex-col justify-between relative cursor-pointer"
            >
              {/* UPGRADED! Floating Icon (half on main card, half outside) */}
              <motion.div
                className="absolute -top-12 -right-12 w-24 h-24 z-20 flex items-center justify-center pointer-events-none"
                animate={{ y: [2, -4, 2] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <svg viewBox="0 0 512 512" className="w-full h-full">
                  <defs>
                    {/* Organic hand-drawn wobble line filter */}
                    <filter id="hand-drawn-wobble" x="-10%" y="-10%" width="120%" height="120%">
                      <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="noise" />
                      <feDisplacementMap in="SourceGraphic" in2="noise" scale="4.5" xChannelSelector="R" yChannelSelector="G" />
                    </filter>

                    {/* Smooth blur filter for blending inside color edges */}
                    <filter id="color-blur" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="8" />
                    </filter>

                    {/* Blue Outer Gradient */}
                    <linearGradient id="blueOuterGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                      <stop offset="0%" stopColor="#1d4ed8" />
                      <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>

                    {/* Blue Inner Gradient */}
                    <linearGradient id="blueInnerGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                      <stop offset="0%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#60a5fa" />
                    </linearGradient>

                    {/* Blue Core Gradient */}
                    <linearGradient id="blueCoreGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                      <stop offset="0%" stopColor="#60a5fa" />
                      <stop offset="100%" stopColor="#ffffff" />
                    </linearGradient>

                    {/* Clip path of the arrow itself so all inner details stay inside */}
                    <clipPath id="arrow-clip">
                      <path d="M 256,120 L 360,260 L 300,260 L 300,370 L 212,370 L 212,260 L 152,260 Z" />
                    </clipPath>

                    {/* Diagonal cut glossy shine gradient */}
                    <linearGradient id="shineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
                      <stop offset="42%" stopColor="#ffffff" stopOpacity="0.28" />
                      <stop offset="42.1%" stopColor="#ffffff" stopOpacity="0" />
                      <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                    </linearGradient>
                  </defs>

                  {/* Apply the wobble filter to the entire group so all parts warp identically */}
                  <g filter="url(#hand-drawn-wobble)">
                    {/* 0. Hand-drawn wobbly shadow layer of the arrow (rendered behind) */}
                    <path
                      d="M 256,120 L 360,260 L 300,260 L 300,370 L 212,370 L 212,260 L 152,260 Z"
                      fill="#0f172a"
                      transform="translate(16, 16)"
                    />

                    {/* --- MAIN ARROW --- */}
                    {/* Inner details clipped to the arrow shape */}
                    <g clipPath="url(#arrow-clip)">
                      {/* 1. Outer Arrow Layer */}
                      <path
                        d="M 256,120 L 360,260 L 300,260 L 300,370 L 212,370 L 212,260 L 152,260 Z"
                        fill="url(#blueOuterGrad)"
                      />

                      {/* 2. Middle Arrow Layer */}
                      <path
                        d="M 256,120 L 360,260 L 300,260 L 300,370 L 212,370 L 212,260 L 152,260 Z"
                        transform="translate(256, 245) scale(0.72) translate(-256, -245)"
                        fill="url(#blueInnerGrad)"
                        filter="url(#color-blur)"
                      />

                      {/* 3. Core Arrow Layer */}
                      <path
                        d="M 256,120 L 360,260 L 300,260 L 300,370 L 212,370 L 212,260 L 152,260 Z"
                        transform="translate(256, 245) scale(0.44) translate(-256, -245)"
                        fill="url(#blueCoreGrad)"
                        filter="url(#color-blur)"
                      />

                      {/* 4. Diagonal Gloss Shine Overlay */}
                      <path
                        d="M 256,120 L 360,260 L 300,260 L 300,370 L 212,370 L 212,260 L 152,260 Z"
                        fill="url(#shineGrad)"
                      />
                    </g>

                    {/* Outer border/stroke drawn on top so the borders are crisp */}
                    <path
                      d="M 256,120 L 360,260 L 300,260 L 300,370 L 212,370 L 212,260 L 152,260 Z"
                      fill="none"
                      stroke="#0f172a"
                      strokeWidth="18"
                      strokeLinejoin="round"
                    />
                  </g>
                </svg>
              </motion.div>
              <div className="mt-2">
                <div
                  className="mb-4 flex items-center justify-start select-none"
                  style={{ perspective: '600px' }}
                >
                  <motion.div
                    className="w-[54px] h-[84px] rounded-[6px] overflow-hidden bg-white relative shadow-[0_6px_12px_rgba(0,0,0,0.25)]"
                    animate={classicHover}
                    transition={{ type: 'spring', stiffness: 180, damping: 15 }}
                  >
                    <img
                      src="/cards/wild-draw4.svg"
                      alt="Classic UNO Card"
                      className="w-full h-full object-contain pointer-events-none block"
                      style={{ imageRendering: 'auto' }}
                    />
                  </motion.div>
                </div>
                <h3 className="font-black text-xs uppercase text-[#0f172a] tracking-wide mb-1.5">
                  Classic UNO
                </h3>
                <p className="text-[10px] font-bold text-neutral-muted leading-relaxed">
                  The standard cards and rules. Match by color/number and use Reverse, Skip, and Draw Two actions to empty your hand.
                </p>
              </div>
            </motion.div>

            {/* UNO Flip Card */}
            <motion.div
              whileHover={{ y: -4, boxShadow: '6px 6px 0 #0f172a' }}
              onMouseMove={(e) => handleShowcaseMouseMove(e, 'flip')}
              onMouseLeave={() => handleShowcaseMouseLeave('flip')}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              onClick={() => {
                setGameMode('flip');
                setNameError(false);
                setView('friends');
              }}
              className="bg-white border-3 border-[#0f172a] rounded-[20px] p-5 shadow-[4px_4px_0_#0f172a] flex flex-col justify-between relative cursor-pointer"
            >
              {/* NEW! Starburst Badge (half on main card, half outside) */}
              <div className="absolute -top-6 -right-6 w-14 h-14 z-20 flex items-center justify-center pointer-events-none drop-shadow-[2.5px_2.5px_0_#0f172a]">
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  <polygon
                    points="98,50 86,60 92,74 76,76 74,92 60,86 50,98 40,86 26,92 24,76 8,74 14,60 2,50 14,40 8,26 24,24 26,8 40,14 50,2 60,14 74,8 76,24 92,26 86,40"
                    fill="#ecd407"
                    stroke="#0f172a"
                    strokeWidth="6"
                    strokeLinejoin="miter"
                  />
                  <text
                    x="50%"
                    y="55%"
                    dominantBaseline="middle"
                    textAnchor="middle"
                    fill="#0f172a"
                    fontSize="18"
                    fontFamily="sans-serif"
                    fontWeight="900"
                    letterSpacing="0.5"
                  >
                    NEW!
                  </text>
                </svg>
              </div>
              <div className="mt-2">
                <div
                  className="mb-4 flex items-center justify-start select-none"
                  style={{ perspective: '600px' }}
                >
                  <motion.div
                    className="relative"
                    animate={flipHover}
                    transition={{ type: 'spring', stiffness: 180, damping: 15 }}
                  >
                    {/* Card container */}
                    <div
                      className="w-[56px] h-[84px] rounded-[8px] overflow-hidden bg-white relative shadow-[0_12px_24px_-4px_rgba(0,0,0,0.22),0_4px_8px_rgba(0,0,0,0.15)]"
                    >
                      <img
                        src="/cards/flip/Purple_FLIP.jpg"
                        alt="UNO Flip Card"
                        className="absolute pointer-events-none select-none"
                        style={{
                          width: '102.44%',
                          height: '102.38%',
                          left: '-1.22%',
                          top: '-1.19%',
                          maxWidth: 'none',
                          maxHeight: 'none',
                        }}
                      />
                    </div>
                  </motion.div>
                </div>
                <h3 className="font-black text-xs uppercase text-[#0f172a] tracking-wide mb-1.5">
                  UNO Flip!
                </h3>
                <p className="text-[10px] font-bold text-neutral-muted leading-relaxed">
                  A double-sided deck of cards. Play normally on the Light Side, then play a Flip card to swap to the aggressive Dark Side!
                </p>
              </div>
            </motion.div>

            <motion.div
              whileHover={{ y: -4, boxShadow: '6px 6px 0 #0f172a' }}
              onMouseMove={(e) => handleShowcaseMouseMove(e, 'mercy')}
              onMouseLeave={() => handleShowcaseMouseLeave('mercy')}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              onClick={() => {
                setGameMode('mercy');
                setNameError(false);
                setView('friends');
              }}
              className="bg-white border-3 border-[#0f172a] rounded-[20px] p-5 shadow-[4px_4px_0_#0f172a] flex flex-col justify-between relative group cursor-pointer"
            >
              {/* HOT! Flame Badge — with fire animation */}
              <motion.div
                className="absolute -top-8 -right-6 w-14 h-16 z-20 flex items-center justify-center pointer-events-none drop-shadow-[2.5px_2.5px_0_#0f172a]"
                animate={{ y: [0, -2, 1, -1, 0], rotate: [-0.5, 0.5, -0.3, 0.4, -0.5] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
              >
                <svg viewBox="0 0 100 110" className="w-full h-full" style={{ overflow: 'visible' }}>
                  <defs>
                    {/* Outer flame gradient: Deep Red to Flame Orange */}
                    <linearGradient id="flameOuterGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                      <stop offset="0%" stopColor="#d71809" />
                      <stop offset="100%" stopColor="#f97316" />
                    </linearGradient>
                    {/* Inner flame gradient: Flame Orange to bright Yellow */}
                    <linearGradient id="flameInnerGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                      <stop offset="0%" stopColor="#f97316" />
                      <stop offset="100%" stopColor="#ecd407" />
                    </linearGradient>
                    {/* Core flame gradient: Yellow to White */}
                    <linearGradient id="flameCoreGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                      <stop offset="0%" stopColor="#ecd407" />
                      <stop offset="100%" stopColor="#ffffff" />
                    </linearGradient>
                  </defs>

                  {/* Outer Flame — flickers scaleY from base */}
                  <motion.path
                    d="M 50 100 C 25 100, 10 80, 10 55 C 10 40, 20 30, 30 40 C 35 45, 40 35, 45 15 C 47 8, 53 8, 55 15 C 60 35, 65 45, 70 40 C 80 30, 90 40, 90 55 C 90 80, 75 100, 50 100 Z"
                    fill="url(#flameOuterGrad)"
                    stroke="#0f172a"
                    strokeWidth="6"
                    strokeLinejoin="round"
                    animate={{
                      scaleY: [1, 1.05, 0.97, 1.03, 0.98, 1],
                      scaleX: [1, 0.98, 1.01, 0.99, 1.01, 1],
                    }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", times: [0, 0.2, 0.4, 0.6, 0.8, 1] }}
                    style={{ transformBox: 'fill-box', transformOrigin: 'bottom center' }}
                  />

                  {/* Middle Flame — shimmers opacity, offset timing */}
                  <motion.path
                    d="M 50 88 C 36 88, 26 76, 26 60 C 26 51, 31 44, 38 50 C 41 53, 43 45, 46 31 C 47 25, 53 25, 54 31 C 57 45, 59 53, 62 50 C 69 44, 74 51, 74 60 C 74 76, 64 88, 50 88 Z"
                    fill="url(#flameInnerGrad)"
                    animate={{
                      opacity: [0.88, 1, 0.82, 1, 0.9, 0.88],
                      scaleY: [1, 1.03, 0.98, 1.02, 0.99, 1],
                    }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut", delay: 0.2, times: [0, 0.2, 0.45, 0.65, 0.85, 1] }}
                    style={{ transformBox: 'fill-box', transformOrigin: 'bottom center' }}
                  />

                  {/* Core Glow — faster pulse, different phase */}
                  <motion.path
                    d="M 50 76 C 43 76, 36 69, 36 60 C 36 54, 39 49, 43 54 C 45 56, 46 50, 47 42 C 48 37, 52 37, 53 42 C 54 50, 55 56, 57 54 C 61 49, 64 54, 64 60 C 64 69, 57 76, 50 76 Z"
                    fill="url(#flameCoreGrad)"
                    animate={{
                      opacity: [0.75, 1, 0.78, 1, 0.8, 0.75],
                      scaleY: [1, 1.07, 0.94, 1.05, 0.97, 1],
                    }}
                    transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: 0.4, times: [0, 0.25, 0.45, 0.65, 0.82, 1] }}
                    style={{ transformBox: 'fill-box', transformOrigin: 'bottom center' }}
                  />

                  {/* HOT! Text — static for readability */}
                  <text
                    x="50%"
                    y="65%"
                    dominantBaseline="middle"
                    textAnchor="middle"
                    fill="#0f172a"
                    stroke="#ffffff"
                    strokeWidth="4.5"
                    paintOrder="stroke fill"
                    fontSize="15"
                    fontFamily="sans-serif"
                    fontWeight="900"
                    letterSpacing="0.5"
                  >
                    HOT!
                  </text>
                </svg>
              </motion.div>
              <div className="mt-2">



                <div
                  className="mb-4 flex items-center justify-start select-none"
                  style={{ perspective: '600px' }}
                >
                  <motion.div
                    className="w-[56px] h-[84px] rounded-[8px] overflow-hidden bg-[#000000] relative shadow-[0_6px_12px_rgba(0,0,0,0.25)]"
                    animate={mercyHover}
                    transition={{ type: 'spring', stiffness: 180, damping: 15 }}
                  >
                    <img
                      src="/cards/mercy/card_back.webp"
                      alt="UNO No Mercy Card"
                      className="w-full h-full object-cover pointer-events-none block"
                    />
                  </motion.div>
                </div>
                <h3 className="font-black text-xs uppercase text-[#0f172a] tracking-wide mb-1.5">
                  UNO No Mercy
                </h3>
                <p className="text-[10px] font-bold text-neutral-muted leading-relaxed">
                  The most brutal UNO edition yet. Stacking draw penalties, tougher Action cards, and instant elimination if you hold 25+ cards.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
        <SeoArticle />
        <VisualFaqSection />

        {/* Footer Links for Multi-Page Application (SEO) */}
        <footer className="mt-16 border-t-2 border-[#0f172a]/15 pt-6 pb-4 w-full max-w-2xl mx-auto flex flex-wrap justify-center gap-6 text-[10px] sm:text-xs font-black uppercase tracking-wider">
          <a href="/about.html" className="text-neutral-muted hover:text-brand-red transition-colors cursor-pointer select-none">
            About Us
          </a>
          <a href="/privacy.html" className="text-neutral-muted hover:text-brand-blue transition-colors cursor-pointer select-none">
            Privacy Policy
          </a>
          <a href="/terms.html" className="text-neutral-muted hover:text-brand-green transition-colors cursor-pointer select-none">
            Terms & Conditions
          </a>
          <a href="/contact.html" className="text-neutral-muted hover:text-brand-yellow transition-colors cursor-pointer select-none">
            Contact Us
          </a>
        </footer>
      </div>
      {renderModal()}
    </div>
  );
}

export default App;
