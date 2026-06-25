import { getActiveCardFace } from './deck.js';
import { normalizeCard } from './normalizer.js';
import { validatePlayable, getDrawPenaltyValue } from './validator.js';

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
 *   2. In mercy mode with a pending seven swap, choose the opponent with fewest cards.
 *   3. In mercy mode with an active draw stack, prioritize playing a stacking draw card;
 *      if none available, draw the entire stack.
 *   4. Prefer colored playable cards (non-wild) first — sorted by action cards first (to pressure opponents), then numbers.
 *   5. If only wild cards are playable, play a wild last.
 *   6. If no card is playable, return draw action.
 *   7. If a drawn card is playable (drawnPlayableCard set), play it.
 *
 * @param {Object} room - The full room/game state.
 * @param {string} botId - The bot player's ID.
 * @returns {{ action: 'play'|'draw'|'pass'|'accept_challenge'|'seven_swap', cardId?: string, chosenColor?: string, targetPlayerId?: string }}
 */
export function chooseBotAction(room, botId) {
  // Handle pending challenge: bot always accepts (no bluffing logic for simplicity)
  if (room.pendingChallenge && room.pendingChallenge.targetPlayerId === botId) {
    return { action: 'accept_challenge' };
  }

  // Handle pending seven swap (mercy mode): swap with the player holding fewest cards
  if (room.pendingSevenSwap && room.pendingSevenSwap.playedBy === botId) {
    const candidates = room.players.filter(p => p.id !== botId && !(room.eliminatedPlayers || []).includes(p.id));
    if (candidates.length > 0) {
      const target = candidates.reduce((a, b) => a.hand.length < b.hand.length ? a : b);
      return { action: 'seven_swap', targetPlayerId: target.id };
    }
  }

  const bot = room.players.find(p => p.id === botId);
  if (!bot) return { action: 'draw' };

  const hand = bot.hand;
  if (!hand || hand.length === 0) return { action: 'draw' };

  const topCardId = room.discardPile[room.discardPile.length - 1];
  const side = room.side || 'light';
  const gameMode = room.gameMode || 'classic';
  const currentColor = room.currentColor;
  const drawStack = gameMode === 'mercy' ? (room.drawStack || null) : null;

  const topFace = getActiveCardFace(topCardId, side, gameMode);

  // In mercy mode with an active stack: ONLY stackable draw cards are valid to play
  if (drawStack && drawStack.count > 0) {
    // Find a card that can stack
    const stackable = hand.filter(cardId => {
      try {
        const face = getActiveCardFace(cardId, side, gameMode);
        const norm = normalizeCard(face);
        const val = getDrawPenaltyValue(norm.type);
        return val >= drawStack.minValue && val > 0;
      } catch (_) { return false; }
    });

    if (stackable.length > 0) {
      // Play the stackable card with highest draw value (most aggressive)
      stackable.sort((a, b) => {
        const faceA = getActiveCardFace(a, side, gameMode);
        const faceB = getActiveCardFace(b, side, gameMode);
        const normA = normalizeCard(faceA);
        const normB = normalizeCard(faceB);
        return getDrawPenaltyValue(normB.type) - getDrawPenaltyValue(normA.type);
      });
      const cardToPlay = stackable[0];
      const face = getActiveCardFace(cardToPlay, side, gameMode);
      const norm = normalizeCard(face);
      let chosenColor = undefined;
      if (norm.color === 'WILD') {
        chosenColor = chooseBestColor(hand, side, gameMode);
      }
      return { action: 'play', cardId: cardToPlay, chosenColor };
    }

    // No stackable card, must draw the stack
    return { action: 'draw' };
  }

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

    const isPlayable = validatePlayable(face, topFace, currentColor, drawStack);
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
