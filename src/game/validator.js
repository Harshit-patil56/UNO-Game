import { normalizeCard } from './normalizer.js';

/**
 * Validates if a card is playable on the current discard pile.
 * 
 * @param {string} cardId - The card to be played.
 * @param {string} topDiscardCardId - The card on top of the discard pile.
 * @param {string} currentColor - The current active color (could be chosen by a wild).
 * @returns {boolean}
 */
export function validatePlayable(cardId, topDiscardCardId, currentColor) {
  const card = normalizeCard(cardId);
  const topCard = normalizeCard(topDiscardCardId);

  // Wild cards are always playable
  if (card.color === 'WILD') {
    return true;
  }

  // Check color match
  if (card.color === currentColor) {
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
}
