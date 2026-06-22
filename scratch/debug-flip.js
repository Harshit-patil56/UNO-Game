import { playCard } from '../src/game/engine.js';
import { getActiveCardFace, FLIP_DECK_MAPPING } from '../src/game/deck.js';
import { normalizeCard } from '../src/game/normalizer.js';

const flipCardIndex = FLIP_DECK_MAPPING.findIndex(m => m.light.endsWith('_FLIP'));
const flipCardId = `FLIP_CARD_${flipCardIndex}`;

const gameWithFlip = {
  roomId: 'FLIP_TEST',
  hostId: 'P1',
  gameStarted: true,
  winner: null,
  gameMode: 'flip',
  side: 'light',
  players: [
    { id: 'P1', name: 'Alice', hand: [flipCardId, 'FLIP_CARD_5'], isDisconnected: false },
    { id: 'P2', name: 'Bob', hand: ['FLIP_CARD_0'], isDisconnected: false }
  ],
  deck: ['FLIP_CARD_1', 'FLIP_CARD_2'],
  discardPile: [`FLIP_CARD_${flipCardIndex + 1}`],
  currentTurn: 0,
  direction: 1,
  currentColor: FLIP_DECK_MAPPING[flipCardIndex].light.split('_')[0],
  pendingDraw: 0,
  unoStates: { P1: false, P2: false },
  unoCatchablePlayerId: null,
  drawnPlayableCard: null,
  pendingChallenge: null
};

console.log('flipCardIndex:', flipCardIndex);
console.log('flipCardId:', flipCardId);
console.log('Mapping at index:', FLIP_DECK_MAPPING[flipCardIndex]);

const activeFace = getActiveCardFace(flipCardId, gameWithFlip.side, gameWithFlip.gameMode);
console.log('activeFace:', activeFace);
const card = normalizeCard(activeFace);
console.log('Normalized card:', card);

console.log('BEFORE PLAY:');
console.log('side:', gameWithFlip.side);
console.log('currentColor:', gameWithFlip.currentColor);
console.log('deck:', gameWithFlip.deck);
console.log('discardPile:', gameWithFlip.discardPile);

playCard(gameWithFlip, 'P1', flipCardId);

console.log('AFTER PLAY:');
console.log('side:', gameWithFlip.side);
console.log('currentColor:', gameWithFlip.currentColor);
console.log('deck:', gameWithFlip.deck);
console.log('discardPile:', gameWithFlip.discardPile);
