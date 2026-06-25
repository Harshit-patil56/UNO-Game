import { normalizeCard } from './normalizer.js';

/**
 * Returns the draw penalty value for a draw card type (for mercy stacking).
 * @param {string} type 
 * @returns {number}
 */
export function getDrawPenaltyValue(type) {
  if (type === 'DRAW_TWO') return 2;
  if (type === 'DRAW_FOUR') return 4;       // No Mercy colored +4
  if (type === 'WILD_DRAW_FOUR') return 4;
  if (type === 'WILD_DRAW_SIX') return 6;
  if (type === 'WILD_DRAW_TEN') return 10;
  return 0;
}

/**
 * Validates if a card is playable on the current discard pile.
 * In mercy mode with an active draw stack, the player can ONLY play a draw
 * card of equal or higher penalty value (to stack), or must take the entire stack.
 * 
 * @param {string} cardId - The card to be played.\n * @param {string} topDiscardCardId - The card on top of the discard pile.
 * @param {string} currentColor - The current active color (could be chosen by a wild).
 * @param {Object} [drawStack] - { count, minValue } active draw stack in mercy mode.
 * @returns {boolean}
 */
export function validatePlayable(cardId, topDiscardCardId, currentColor, drawStack = null) {
  const card = normalizeCard(cardId);
  const topCard = normalizeCard(topDiscardCardId);

  // In mercy mode with an active draw stack, ONLY stackable draw cards are valid
  if (drawStack && drawStack.count > 0) {
    const cardValue = getDrawPenaltyValue(card.type);
    // Must be a draw card with value >= the minimum required to stack
    if (cardValue >= drawStack.minValue && cardValue > 0) {
      return true;
    }
    return false;
  }

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

  // Check type match for action cards (SKIP, REVERSE, DRAW_TWO, etc.)
  if (card.type !== 'NUMBER' && card.type === topCard.type) {
    return true;
  }

  return false;
}

