import { normalizeCard } from './normalizer.js';
import { getActiveCardFace } from './deck.js';
import { nextTurn, reverseDirection } from './turnManager.js';

/**
 * Checks if a player has any cards matching the specified color.
 * Used to validate if a Wild Draw Four challenge is successful.
 * 
 * @param {string[]} hand - The player's hand.
 * @param {string} color - The color to match.
 * @param {string} [side='light'] - The active side ('light' or 'dark').
 * @param {string} [gameMode='classic'] - The game mode ('classic' or 'flip').
 * @returns {boolean}
 */
export function hasMatchingColor(hand, color, side = 'light', gameMode = 'classic') {
  return hand.some(cardId => {
    const activeFace = getActiveCardFace(cardId, side, gameMode);
    const card = normalizeCard(activeFace);
    return card.color === color;
  });
}

/**
 * Calculates the score of a player's hand.
 * 
 * @param {string[]} hand 
 * @param {string} [side='light'] - The active side ('light' or 'dark').
 * @param {string} [gameMode='classic'] - The game mode ('classic' or 'flip').
 * @returns {number}
 */
export function calculateHandScore(hand, side = 'light', gameMode = 'classic') {
  let score = 0;
  for (const cardId of hand) {
    const activeFace = getActiveCardFace(cardId, side, gameMode);
    const card = normalizeCard(activeFace);
    if (card.type === 'NUMBER') {
      score += card.value;
    } else if (gameMode === 'flip') {
      if (card.type === 'DRAW_ONE') {
        score += 10;
      } else if (card.type === 'DRAW_FIVE' || card.type === 'REVERSE' || card.type === 'SKIP' || card.type === 'FLIP') {
        score += 20;
      } else if (card.type === 'SKIP_EVERYONE') {
        score += 30;
      } else if (card.type === 'WILD') {
        score += 40;
      } else if (card.type === 'WILD_DRAW_TWO') {
        score += 50;
      } else if (card.type === 'WILD_DRAW_COLOR') {
        score += 60;
      }
    } else {
      if (card.type === 'SKIP' || card.type === 'REVERSE' || card.type === 'DRAW_TWO') {
        score += 20;
      } else if (card.type === 'WILD' || card.type === 'WILD_DRAW_FOUR') {
        score += 50;
      }
    }
  }
  return score;
}

/**
 * Checks if a player has won the game (empty hand).
 * 
 * @param {string[]} hand 
 * @returns {boolean}
 */
export function checkWinner(hand) {
  return hand.length === 0;
}
