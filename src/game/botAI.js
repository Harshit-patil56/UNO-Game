import { getActiveCardFace } from './deck.js';
import { normalizeCard } from './normalizer.js';
import { validatePlayable } from './validator.js';

/**
 * Determines the best color for a bot to choose when playing a Wild card.
 * Picks the color the bot has the most of in its hand.
 *
 * @param {string[]} hand - The bot's current hand.
 * @param {string} side - 'light' or 'dark'
 * @param {string} gameMode - 'classic' or 'flip'
 * @returns {string} - The chosen color.
 */
function chooseBestColor(hand, side, gameMode) {
  const isFlipDark = gameMode === 'flip' && side === 'dark';
  const colors = isFlipDark
    ? ['ORANGE', 'PINK', 'TEAL', 'PURPLE']
    : ['RED', 'BLUE', 'GREEN', 'YELLOW'];

  const counts = {};
  for (const color of colors) counts[color] = 0;

  for (const cardId of hand) {
    const face = getActiveCardFace(cardId, side, gameMode);
    try {
      const normalized = normalizeCard(face);
      if (colors.includes(normalized.color)) {
        counts[normalized.color]++;
      }
    } catch (_) {
      // skip invalid cards
    }
  }

  // Return the color with the highest count, falling back to first color
  let best = colors[0];
  for (const color of colors) {
    if (counts[color] > counts[best]) {
      best = color;
    }
  }
  return best;
}

/**
 * Bot action decision.
 * Strategy:
 *   1. If there is a pending challenge targeted at this bot, accept it (draw the penalty).
 *   2. Prefer colored playable cards (non-wild) first — sorted by action cards first (to pressure opponents), then numbers.
 *   3. If only wild cards are playable, play a wild last.
 *   4. If no card is playable, return draw action.
 *   5. If a drawn card is playable (drawnPlayableCard set), play it.
 *
 * @param {Object} room - The full room/game state.
 * @param {string} botId - The bot player's ID.
 * @returns {{ action: 'play'|'draw'|'pass'|'accept_challenge', cardId?: string, chosenColor?: string }}
 */
export function chooseBotAction(room, botId) {
  // Handle pending challenge: bot always accepts (no bluffing logic for simplicity)
  if (room.pendingChallenge && room.pendingChallenge.targetPlayerId === botId) {
    return { action: 'accept_challenge' };
  }

  const bot = room.players.find(p => p.id === botId);
  if (!bot) return { action: 'draw' };

  const hand = bot.hand;
  if (!hand || hand.length === 0) return { action: 'draw' };

  const topCardId = room.discardPile[room.discardPile.length - 1];
  const side = room.side || 'light';
  const gameMode = room.gameMode || 'classic';
  const currentColor = room.currentColor;

  const topFace = getActiveCardFace(topCardId, side, gameMode);

  // If the bot has a drawn playable card, play it
  if (room.drawnPlayableCard) {
    const drawnFace = getActiveCardFace(room.drawnPlayableCard, side, gameMode);
    const isPlayable = validatePlayable(drawnFace, topFace, currentColor);
    if (isPlayable) {
      let chosenColor = undefined;
      const drawnNorm = normalizeCard(drawnFace);
      if (drawnNorm.color === 'WILD') {
        chosenColor = chooseBestColor(hand, side, gameMode);
      }
      return { action: 'play', cardId: room.drawnPlayableCard, chosenColor };
    }
    // Drawn card is not playable — pass
    return { action: 'pass' };
  }

  // Categorize playable cards
  const coloredPlayable = [];
  const wildPlayable = [];

  for (const cardId of hand) {
    let face;
    try {
      face = getActiveCardFace(cardId, side, gameMode);
    } catch (_) {
      continue;
    }

    const isPlayable = validatePlayable(face, topFace, currentColor);
    if (!isPlayable) continue;

    try {
      const norm = normalizeCard(face);
      if (norm.color === 'WILD') {
        wildPlayable.push(cardId);
      } else {
        coloredPlayable.push(cardId);
      }
    } catch (_) {
      // skip
    }
  }

  // Sort colored playable: action cards first (SKIP, DRAW_TWO, REVERSE etc), then numbers
  coloredPlayable.sort((a, b) => {
    const faceA = getActiveCardFace(a, side, gameMode);
    const faceB = getActiveCardFace(b, side, gameMode);
    const normA = normalizeCard(faceA);
    const normB = normalizeCard(faceB);
    const isActionA = normA.type !== 'NUMBER' ? 0 : 1;
    const isActionB = normB.type !== 'NUMBER' ? 0 : 1;
    return isActionA - isActionB;
  });

  // Play colored card first, then wild
  const cardToPlay = coloredPlayable[0] || wildPlayable[0] || null;

  if (cardToPlay) {
    const face = getActiveCardFace(cardToPlay, side, gameMode);
    const norm = normalizeCard(face);
    let chosenColor = undefined;
    if (norm.color === 'WILD') {
      chosenColor = chooseBestColor(hand, side, gameMode);
    }
    return { action: 'play', cardId: cardToPlay, chosenColor };
  }

  // Nothing playable — draw
  return { action: 'draw' };
}
