/**
 * Generates a standard 108-card UNO deck in the standardized format.
 * 
 * @returns {string[]}
 */
export function createDeck() {
  const deck = [];
  const colors = ['RED', 'BLUE', 'GREEN', 'YELLOW'];

  for (const color of colors) {
    // 1x Number 0
    deck.push(`${color}_NUMBER_0`);

    // 2x Numbers 1-9
    for (let i = 1; i <= 9; i++) {
      deck.push(`${color}_NUMBER_${i}`);
      deck.push(`${color}_NUMBER_${i}`);
    }

    // 2x Action cards of each color
    deck.push(`${color}_SKIP`);
    deck.push(`${color}_SKIP`);
    
    deck.push(`${color}_REVERSE`);
    deck.push(`${color}_REVERSE`);
    
    deck.push(`${color}_DRAW_TWO`);
    deck.push(`${color}_DRAW_TWO`);
  }

  // 4x Wild cards
  for (let i = 0; i < 4; i++) {
    deck.push('WILD');
  }

  // 4x Wild Draw Four cards
  for (let i = 0; i < 4; i++) {
    deck.push('WILD_DRAW_FOUR');
  }

  return deck;
}

/**
 * Shuffles a deck array using the Fisher-Yates algorithm. Returns a new array.
 * 
 * @param {string[]} deck 
 * @returns {string[]}
 */
export function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Deals cards to each player from the deck.
 * 
 * @param {string[]} deck - The deck to deal from.
 * @param {string[]} playerIds - List of player IDs.
 * @param {number} [handSize=7] - Number of cards per hand.
 * @returns {{ hands: Object<string, string[]>, remainingDeck: string[] }}
 */
export function dealCards(deck, playerIds, handSize = 7) {
  const remainingDeck = [...deck];
  const hands = {};

  for (const playerId of playerIds) {
    hands[playerId] = [];
  }

  for (let i = 0; i < handSize; i++) {
    for (const playerId of playerIds) {
      if (remainingDeck.length > 0) {
        hands[playerId].push(remainingDeck.pop());
      }
    }
  }

  return { hands, remainingDeck };
}

// Deterministic pairing of the 112 cards for UNO Flip.
// Each card index 0..111 maps to a specific light face and dark face.
export const FLIP_DECK_MAPPING = [];

const lightColors = ['RED', 'BLUE', 'GREEN', 'YELLOW'];
const darkColors = ['ORANGE', 'PINK', 'TEAL', 'PURPLE'];

// Generate colored cards (104 cards: 26 per color)
for (let c = 0; c < 4; c++) {
  const lc = lightColors[c];
  const dc = darkColors[c];

  // 1. Numbers 1 to 9 (two of each)
  for (let val = 1; val <= 9; val++) {
    FLIP_DECK_MAPPING.push({ light: `${lc}_NUMBER_${val}`, dark: `${dc}_NUMBER_${val}` });
    FLIP_DECK_MAPPING.push({ light: `${lc}_NUMBER_${val}`, dark: `${dc}_NUMBER_${val}` });
  }

  // 2. Action cards (two of each)
  // Reverse
  FLIP_DECK_MAPPING.push({ light: `${lc}_REVERSE`, dark: `${dc}_REVERSE` });
  FLIP_DECK_MAPPING.push({ light: `${lc}_REVERSE`, dark: `${dc}_REVERSE` });

  // Flip
  FLIP_DECK_MAPPING.push({ light: `${lc}_FLIP`, dark: `${dc}_FLIP` });
  FLIP_DECK_MAPPING.push({ light: `${lc}_FLIP`, dark: `${dc}_FLIP` });

  // Skip / Skip Everyone
  FLIP_DECK_MAPPING.push({ light: `${lc}_SKIP`, dark: `${dc}_SKIP_EVERYONE` });
  FLIP_DECK_MAPPING.push({ light: `${lc}_SKIP`, dark: `${dc}_SKIP_EVERYONE` });

  // Draw One / Draw Five
  FLIP_DECK_MAPPING.push({ light: `${lc}_DRAW_ONE`, dark: `${dc}_DRAW_FIVE` });
  FLIP_DECK_MAPPING.push({ light: `${lc}_DRAW_ONE`, dark: `${dc}_DRAW_FIVE` });
}

// Generate Wild cards (8 cards)
// 3. Wild (four cards)
for (let i = 0; i < 4; i++) {
  FLIP_DECK_MAPPING.push({ light: 'WILD', dark: 'WILD' });
}

// 4. Wild Draw Two / Wild Draw Color (four cards)
for (let i = 0; i < 4; i++) {
  FLIP_DECK_MAPPING.push({ light: 'WILD_DRAW_TWO', dark: 'WILD_DRAW_COLOR' });
}

/**
 * Generates a deck of 112 cards for UNO Flip.
 * Cards are identified by 'FLIP_CARD_0' to 'FLIP_CARD_111'.
 * 
 * @returns {string[]}
 */
export function createFlipDeck() {
  const deck = [];
  for (let i = 0; i < 112; i++) {
    deck.push(`FLIP_CARD_${i}`);
  }
  return deck;
}

/**
 * Returns the active face of a card given the current gameMode and side.
 * 
 * @param {string} cardId 
 * @param {string} side - 'light' or 'dark'
 * @param {string} gameMode - 'classic' or 'flip'
 * @returns {string}
 */
export function getActiveCardFace(cardId, side = 'light', gameMode = 'classic') {
  if (gameMode === 'classic') {
    return cardId;
  }
  if (!cardId || !cardId.startsWith('FLIP_CARD_')) {
    return cardId;
  }
  const index = parseInt(cardId.split('_')[2], 10);
  if (isNaN(index) || index < 0 || index >= FLIP_DECK_MAPPING.length) {
    return cardId;
  }
  const sideKey = side === 'dark' ? 'dark' : 'light';
  return FLIP_DECK_MAPPING[index][sideKey];
}
