/**
 * Normalizes card IDs into a structured format containing color, type, and value.
 * Standard Format: COLOR_TYPE_VALUE (e.g. BLUE_NUMBER_0, RED_SKIP, WILD, WILD_DRAW_FOUR)
 * 
 * @param {string} cardId 
 * @returns {{color: string, type: string, value: number|null}}
 */
export function normalizeCard(cardId) {
  if (!cardId || typeof cardId !== 'string') {
    throw new Error(`Invalid card ID: ${cardId}`);
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
  // Note: parts[1] + parts[2] might be DRAW_TWO
  let type = parts[1];
  if (parts[2]) {
    type += `_${parts[2]}`; // e.g. DRAW_TWO
  }

  return { color, type, value: null };
}
