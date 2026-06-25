import { normalizeCard } from './src/game/normalizer.js';
import { createDeck, shuffleDeck, dealCards, createFlipDeck, createMercyDeck, getActiveCardFace, FLIP_DECK_MAPPING } from './src/game/deck.js';
import { validatePlayable } from './src/game/validator.js';
import { nextTurn, reverseDirection, skipTurn } from './src/game/turnManager.js';
import { calculateHandScore, checkWinner } from './src/game/rules.js';
import {
  playCard,
  drawCard,
  passTurn,
  resolveChallenge,
  callUno,
  catchUno,
  checkMercyElimination,
  resolveSevenSwap
} from './src/game/engine.js';

let failedTests = 0;
let passedTests = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    failedTests++;
  } else {
    console.log(`✅ PASS: ${message}`);
    passedTests++;
  }
}

console.log('--- STARTING UNO GAME ENGINE TEST SUITE ---');

// 1. Test Normalizer
try {
  const norm1 = normalizeCard('BLUE_NUMBER_5');
  assert(norm1.color === 'BLUE' && norm1.type === 'NUMBER' && norm1.value === 5, 'Normalizes number card: BLUE_NUMBER_5');
  
  const norm2 = normalizeCard('RED_SKIP');
  assert(norm2.color === 'RED' && norm2.type === 'SKIP' && norm2.value === null, 'Normalizes action card: RED_SKIP');
  
  const norm3 = normalizeCard('WILD');
  assert(norm3.color === 'WILD' && norm3.type === 'WILD' && norm3.value === null, 'Normalizes wild card: WILD');

  const norm4 = normalizeCard('WILD_DRAW_FOUR');
  assert(norm4.color === 'WILD' && norm4.type === 'WILD_DRAW_FOUR' && norm4.value === null, 'Normalizes wild card: WILD_DRAW_FOUR');
} catch (e) {
  assert(false, `Normalizer error: ${e.message}`);
}

// 2. Test Deck Generation & Shuffling
try {
  const deck = createDeck();
  assert(deck.length === 108, `Standard deck contains 108 cards (got ${deck.length})`);
  
  // Verify card distribution counts
  const wildCount = deck.filter(c => c === 'WILD').length;
  const wildD4Count = deck.filter(c => c === 'WILD_DRAW_FOUR').length;
  assert(wildCount === 4, `Should contain exactly 4 Wilds (got ${wildCount})`);
  assert(wildD4Count === 4, `Should contain exactly 4 Wild Draw Fours (got ${wildD4Count})`);

  const blueZeros = deck.filter(c => c === 'BLUE_NUMBER_0').length;
  const blueOnes = deck.filter(c => c === 'BLUE_NUMBER_1').length;
  assert(blueZeros === 1, `Should contain exactly 1 Blue 0 card (got ${blueZeros})`);
  assert(blueOnes === 2, `Should contain exactly 2 Blue 1 cards (got ${blueOnes})`);

  const shuffled = shuffleDeck(deck);
  assert(shuffled.length === 108, 'Shuffled deck length matches original');
  assert(JSON.stringify(deck) !== JSON.stringify(shuffled), 'Shuffling changes deck order (high probability)');
} catch (e) {
  assert(false, `Deck error: ${e.message}`);
}

// 3. Test Dealing
try {
  const deck = createDeck();
  const playerIds = ['P1', 'P2', 'P3'];
  const { hands, remainingDeck } = dealCards(deck, playerIds, 7);
  
  assert(hands['P1'].length === 7, `Deals 7 cards to Player 1 (got ${hands['P1'].length})`);
  assert(hands['P2'].length === 7, `Deals 7 cards to Player 2 (got ${hands['P2'].length})`);
  assert(hands['P3'].length === 7, `Deals 7 cards to Player 3 (got ${hands['P3'].length})`);
  assert(remainingDeck.length === 108 - 21, `Remaining deck contains correct count (got ${remainingDeck.length})`);
} catch (e) {
  assert(false, `Dealing error: ${e.message}`);
}

// 4. Test Play Validator
try {
  assert(validatePlayable('BLUE_NUMBER_5', 'BLUE_NUMBER_3', 'BLUE') === true, 'Play card matching color: Blue 5 on Blue 3');
  assert(validatePlayable('RED_NUMBER_5', 'BLUE_NUMBER_5', 'BLUE') === true, 'Play card matching value: Red 5 on Blue 5');
  assert(validatePlayable('RED_NUMBER_5', 'BLUE_NUMBER_3', 'BLUE') === false, 'Disallow non-matching cards: Red 5 on Blue 3');
  assert(validatePlayable('WILD', 'BLUE_NUMBER_3', 'BLUE') === true, 'Wild is always playable on colored numbers');
  assert(validatePlayable('BLUE_NUMBER_5', 'WILD', 'BLUE') === true, 'Play matches active color chosen by wild');
  assert(validatePlayable('RED_NUMBER_5', 'WILD', 'BLUE') === false, 'Disallow play if color does not match active wild color');
} catch (e) {
  assert(false, `Validator error: ${e.message}`);
}

// 5. Test Turn Manager
try {
  // Clockwise
  assert(nextTurn(0, 1, 4) === 1, 'Next turn clockwise (0 -> 1)');
  assert(nextTurn(3, 1, 4) === 0, 'Next turn wrap clockwise (3 -> 0)');
  // Counter-Clockwise
  assert(nextTurn(1, -1, 4) === 0, 'Next turn counter-clockwise (1 -> 0)');
  assert(nextTurn(0, -1, 4) === 3, 'Next turn wrap counter-clockwise (0 -> 3)');
  // Skips
  assert(skipTurn(0, 1, 4) === 2, 'Skip turn clockwise (0 -> 2)');
  assert(skipTurn(3, 1, 4) === 1, 'Skip turn wrap clockwise (3 -> 1)');
  // Reversals
  assert(reverseDirection(1) === -1, 'Reverse direction (1 -> -1)');
} catch (e) {
  assert(false, `TurnManager error: ${e.message}`);
}

// 6. Test Game State Engine Simulation
try {
  const gameState = {
    roomId: 'TEST_ROOM',
    hostId: 'P1',
    gameStarted: true,
    winner: null,
    players: [
      { id: 'P1', name: 'Alice', hand: ['BLUE_NUMBER_1', 'RED_SKIP', 'WILD', 'BLUE_NUMBER_5'], isDisconnected: false },
      { id: 'P2', name: 'Bob', hand: ['GREEN_NUMBER_2', 'BLUE_NUMBER_2'], isDisconnected: false },
      { id: 'P3', name: 'Charlie', hand: ['YELLOW_NUMBER_3', 'RED_NUMBER_3'], isDisconnected: false }
    ],
    deck: ['BLUE_NUMBER_5', 'YELLOW_NUMBER_6'],
    discardPile: ['BLUE_NUMBER_0'],
    currentTurn: 0,
    direction: 1,
    currentColor: 'BLUE',
    pendingDraw: 0,
    unoStates: { P1: false, P2: false, P3: false },
    unoCatchablePlayerId: null,
    drawnPlayableCard: null,
    pendingChallenge: null
  };

  // Turn 0: P1 plays BLUE_NUMBER_1
  playCard(gameState, 'P1', 'BLUE_NUMBER_1');
  assert(gameState.discardPile[gameState.discardPile.length - 1] === 'BLUE_NUMBER_1', 'Top discard is now BLUE_NUMBER_1');
  assert(gameState.players[0].hand.length === 3, 'P1 has 3 cards remaining');
  assert(gameState.currentTurn === 1, 'Turn moves to P2 (Bob)');

  // Turn 1: P2 plays BLUE_NUMBER_2 (matches color)
  playCard(gameState, 'P2', 'BLUE_NUMBER_2');
  assert(gameState.currentTurn === 2, 'Turn moves to P3 (Charlie)');

  // Turn 2: P3 draws a card (top is YELLOW_NUMBER_6 - not playable on BLUE_NUMBER_2)
  const drawResult = drawCard(gameState, 'P3');
  assert(drawResult.card === 'YELLOW_NUMBER_6', 'P3 drew YELLOW_NUMBER_6');
  assert(drawResult.isPlayable === false, 'Drew non-playable card');
  assert(gameState.currentTurn === 0, 'Turn passes back to P1');

  // Turn 0: P1 plays RED_SKIP (matches value or type? Wait, RED_SKIP is not matching BLUE_NUMBER_2 color, but wait, the top discard is BLUE_NUMBER_2, color is BLUE. Can P1 play RED_SKIP? No! Wait, does RED_SKIP match BLUE_NUMBER_2? No color match, no type match.
  // Wait, let's verify if playCard throws error for invalid play.
  let threw = false;
  try {
    playCard(gameState, 'P1', 'RED_SKIP');
  } catch (err) {
    threw = true;
  }
  assert(threw, 'Invalid play (RED_SKIP on BLUE_NUMBER_2) correctly throws error');

  // Turn 0: P1 plays WILD, chooses RED
  playCard(gameState, 'P1', 'WILD', 'RED');
  assert(gameState.currentColor === 'RED', 'Active color set to RED');
  assert(gameState.currentTurn === 1, 'Turn moves to P2');

  // Turn 1: P2 has only GREEN_NUMBER_2. Top is WILD (color RED). P2 draws a card (top is BLUE_NUMBER_5 - not playable)
  drawCard(gameState, 'P2');
  assert(gameState.currentTurn === 2, 'Turn passes to P3');

  // Turn 2: P3 plays RED_NUMBER_3 (matches active color RED)
  playCard(gameState, 'P3', 'RED_NUMBER_3');
  assert(gameState.currentTurn === 0, 'Turn moves to P1');

  // Turn 0: P1 plays RED_SKIP (matches RED color)
  playCard(gameState, 'P1', 'RED_SKIP');
  assert(gameState.currentTurn === 2, 'Turn skips P2, goes to P3');
  assert(gameState.players[0].hand.length === 1, 'P1 hand has 1 card remaining');
  assert(gameState.winner === null, 'P1 is not the winner yet');
} catch (e) {
  assert(false, `Engine simulation error: ${e.message}\nStack: ${e.stack}`);
}

// 7. Test UNO Flip Game Mechanics
try {
  console.log('--- TESTING UNO FLIP MECHANICS ---');

  // Verify deck generation
  const flipDeck = createFlipDeck();
  assert(flipDeck.length === 112, `Flip deck has 112 cards (got ${flipDeck.length})`);

  // Verify getActiveCardFace
  const card0FaceLight = getActiveCardFace('FLIP_CARD_0', 'light', 'flip');
  const card0FaceDark = getActiveCardFace('FLIP_CARD_0', 'dark', 'flip');
  assert(card0FaceLight !== card0FaceDark, 'Card 0 has different faces on light and dark sides');
  assert(card0FaceLight.startsWith('RED_NUMBER_'), `Light face is RED_NUMBER (got ${card0FaceLight})`);
  assert(card0FaceDark.startsWith('ORANGE_NUMBER_'), `Dark face is ORANGE_NUMBER (got ${card0FaceDark})`);

  // Find a FLIP card index in FLIP_DECK_MAPPING
  const flipCardIndex = FLIP_DECK_MAPPING.findIndex(m => m.light.endsWith('_FLIP'));
  assert(flipCardIndex !== -1, 'Found a FLIP card in mapping');
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

  const initialDeckOrder = [...gameWithFlip.deck];

  // Play the FLIP card
  playCard(gameWithFlip, 'P1', flipCardId);
  assert(gameWithFlip.side === 'dark', 'Game transitioned to the dark side');
  assert(JSON.stringify(gameWithFlip.deck) === JSON.stringify(initialDeckOrder.reverse()), 'Draw pile was reversed');
  assert(gameWithFlip.discardPile[0] === flipCardId, 'FLIP card is at the bottom of the reversed discard pile');

  // Verify Dark Side active color
  const topDiscard = gameWithFlip.discardPile[gameWithFlip.discardPile.length - 1];
  const activeTopFace = getActiveCardFace(topDiscard, 'dark', 'flip');
  const expectedColor = activeTopFace.split('_')[0];
  assert(gameWithFlip.currentColor === expectedColor, `Current color updated to dark side color: ${expectedColor}`);

  // Play a SKIP_EVERYONE card on the Dark Side
  const skipEveryoneIdx = FLIP_DECK_MAPPING.findIndex(m => m.dark.endsWith('_SKIP_EVERYONE'));
  assert(skipEveryoneIdx !== -1, 'Found a SKIP_EVERYONE card');
  const skipEveryoneCardId = `FLIP_CARD_${skipEveryoneIdx}`;

  const gameWithSkipEveryone = {
    roomId: 'SKIP_EVERYONE_TEST',
    hostId: 'P1',
    gameStarted: true,
    winner: null,
    gameMode: 'flip',
    side: 'dark',
    players: [
      { id: 'P1', name: 'Alice', hand: [skipEveryoneCardId], isDisconnected: false },
      { id: 'P2', name: 'Bob', hand: ['FLIP_CARD_0'], isDisconnected: false },
      { id: 'P3', name: 'Charlie', hand: ['FLIP_CARD_1'], isDisconnected: false }
    ],
    deck: [],
    discardPile: [`FLIP_CARD_${skipEveryoneIdx + 1}`],
    currentTurn: 0,
    direction: 1,
    currentColor: FLIP_DECK_MAPPING[skipEveryoneIdx].dark.split('_')[0],
    pendingDraw: 0,
    unoStates: { P1: false, P2: false, P3: false },
    unoCatchablePlayerId: null,
    drawnPlayableCard: null,
    pendingChallenge: null
  };

  playCard(gameWithSkipEveryone, 'P1', skipEveryoneCardId);
  assert(gameWithSkipEveryone.currentTurn === 0, 'Skip Everyone keeps turn on the same player (P1)');

} catch (e) {
  assert(false, `UNO Flip testing error: ${e.message}\nStack: ${e.stack}`);
}

// 8. Test UNO Show 'Em No Mercy Game Mechanics
try {
  console.log('--- TESTING UNO SHOW EM NO MERCY ---');

  // Verify Mercy deck generation
  const mercyDeck = createMercyDeck();
  assert(mercyDeck.length === 168, `Mercy deck has 168 cards (got ${mercyDeck.length})`);
  
  // Verify counts of No Mercy specific cards
  const rouletteCount = mercyDeck.filter(c => c === 'WILD_ROULETTE').length;
  const drawTenCount = mercyDeck.filter(c => c === 'WILD_DRAW_TEN').length;
  const skipAllCount = mercyDeck.filter(c => c.endsWith('_SKIP_ALL')).length;
  const discardAllCount = mercyDeck.filter(c => c.endsWith('_DISCARD_ALL')).length;
  
  assert(rouletteCount === 8, `Should contain exactly 8 Wild Roulette cards (got ${rouletteCount})`);
  assert(drawTenCount === 4, `Should contain exactly 4 Wild Draw Ten cards (got ${drawTenCount})`);
  assert(skipAllCount === 8, `Should contain exactly 8 Skip All cards (got ${skipAllCount})`);
  assert(discardAllCount === 12, `Should contain exactly 12 Discard All cards (got ${discardAllCount})`);

  // Test Skip All
  const gameWithSkipAll = {
    roomId: 'SKIP_ALL_TEST',
    hostId: 'P1',
    gameStarted: true,
    winner: null,
    gameMode: 'mercy',
    players: [
      { id: 'P1', name: 'Alice', hand: ['RED_SKIP_ALL'], isDisconnected: false },
      { id: 'P2', name: 'Bob', hand: ['GREEN_NUMBER_2'], isDisconnected: false },
      { id: 'P3', name: 'Charlie', hand: ['YELLOW_NUMBER_3'], isDisconnected: false }
    ],
    deck: [],
    discardPile: ['RED_NUMBER_0'],
    currentTurn: 0,
    direction: 1,
    currentColor: 'RED',
    unoStates: {},
    unoCatchablePlayerId: null,
    drawnPlayableCard: null,
    pendingChallenge: null
  };
  playCard(gameWithSkipAll, 'P1', 'RED_SKIP_ALL');
  assert(gameWithSkipAll.currentTurn === 0, 'Skip All action card keeps turn on playing player (P1)');

  // Test Discard All
  const gameWithDiscardAll = {
    roomId: 'DISCARD_ALL_TEST',
    hostId: 'P1',
    gameStarted: true,
    winner: null,
    gameMode: 'mercy',
    players: [
      { id: 'P1', name: 'Alice', hand: ['RED_DISCARD_ALL', 'RED_NUMBER_5', 'BLUE_NUMBER_5', 'RED_NUMBER_8'], isDisconnected: false },
      { id: 'P2', name: 'Bob', hand: ['GREEN_NUMBER_2'], isDisconnected: false }
    ],
    deck: [],
    discardPile: ['RED_NUMBER_0'],
    currentTurn: 0,
    direction: 1,
    currentColor: 'RED',
    unoStates: {},
    unoCatchablePlayerId: null,
    drawnPlayableCard: null,
    pendingChallenge: null
  };
  playCard(gameWithDiscardAll, 'P1', 'RED_DISCARD_ALL');
  assert(gameWithDiscardAll.players[0].hand.length === 1 && gameWithDiscardAll.players[0].hand[0] === 'BLUE_NUMBER_5', 'Discard All removes all cards matching its color from player hand');
  assert(gameWithDiscardAll.currentTurn === 1, 'Discard All advances turn to Bob (P2)');

  // Test Stacking
  const gameWithStacking = {
    roomId: 'STACKING_TEST',
    hostId: 'P1',
    gameStarted: true,
    winner: null,
    gameMode: 'mercy',
    players: [
      { id: 'P1', name: 'Alice', hand: ['RED_DRAW_TWO', 'BLUE_NUMBER_2'], isDisconnected: false },
      { id: 'P2', name: 'Bob', hand: ['BLUE_DRAW_FOUR', 'GREEN_NUMBER_2'], isDisconnected: false },
      { id: 'P3', name: 'Charlie', hand: ['GREEN_NUMBER_2'], isDisconnected: false }
    ],
    deck: ['YELLOW_NUMBER_1', 'YELLOW_NUMBER_2', 'YELLOW_NUMBER_3', 'YELLOW_NUMBER_4', 'YELLOW_NUMBER_5', 'YELLOW_NUMBER_6'],
    discardPile: ['RED_NUMBER_0'],
    currentTurn: 0,
    direction: 1,
    currentColor: 'RED',
    drawStack: null,
    unoStates: {},
    unoCatchablePlayerId: null,
    drawnPlayableCard: null,
    pendingChallenge: null
  };
  playCard(gameWithStacking, 'P1', 'RED_DRAW_TWO');
  assert(gameWithStacking.drawStack && gameWithStacking.drawStack.count === 2, 'Playing +2 adds 2 to active draw stack');
  assert(gameWithStacking.currentTurn === 1, 'Turn passes to Bob (P2) without forcing P2 to draw immediately');

  playCard(gameWithStacking, 'P2', 'BLUE_DRAW_FOUR', 'BLUE');
  assert(gameWithStacking.drawStack && gameWithStacking.drawStack.count === 6, 'Stacking +4 on +2 increases draw stack count to 6');
  assert(gameWithStacking.currentTurn === 2, 'Turn passes to Charlie (P3) under the +6 stack penalty');

  drawCard(gameWithStacking, 'P3');
  assert(gameWithStacking.players[2].hand.length === 7, 'Charlie cannot stack, so he draws the full 6 stack penalty');
  assert(gameWithStacking.drawStack && gameWithStacking.drawStack.count === 0, 'Draw stack count is reset to 0 after penalty is drawn');
  assert(gameWithStacking.currentTurn === 0, 'Charlie is skipped after drawing, turn moves back to Alice (P1)');

  // Test 7s Swap
  const gameWithSevenSwap = {
    roomId: 'SEVEN_SWAP_TEST',
    hostId: 'P1',
    gameStarted: true,
    winner: null,
    gameMode: 'mercy',
    players: [
      { id: 'P1', name: 'Alice', hand: ['RED_NUMBER_7', 'BLUE_NUMBER_2'], isDisconnected: false },
      { id: 'P2', name: 'Bob', hand: ['GREEN_NUMBER_2'], isDisconnected: false },
      { id: 'P3', name: 'Charlie', hand: ['YELLOW_NUMBER_3'], isDisconnected: false }
    ],
    deck: [],
    discardPile: ['RED_NUMBER_0'],
    currentTurn: 0,
    direction: 1,
    currentColor: 'RED',
    unoStates: {},
    unoCatchablePlayerId: null,
    drawnPlayableCard: null,
    pendingChallenge: null,
    pendingSevenSwap: null
  };
  playCard(gameWithSevenSwap, 'P1', 'RED_NUMBER_7');
  assert(gameWithSevenSwap.pendingSevenSwap && gameWithSevenSwap.pendingSevenSwap.playedBy === 'P1', 'Playing a 7 triggers a pending swap state');
  assert(gameWithSevenSwap.currentTurn === 0, 'Turn stays with Alice (P1) until the 7 swap is resolved');

  resolveSevenSwap(gameWithSevenSwap, 'P1', 'P3');
  assert(gameWithSevenSwap.players[0].hand.length === 1 && gameWithSevenSwap.players[0].hand[0] === 'YELLOW_NUMBER_3', 'P1 hand swapped with P3 hand');
  assert(gameWithSevenSwap.players[2].hand.length === 1 && gameWithSevenSwap.players[2].hand[0] === 'BLUE_NUMBER_2', 'P3 hand swapped with P1 hand (minus the played 7)');
  assert(gameWithSevenSwap.pendingSevenSwap === null, 'Pending swap state is cleared');
  assert(gameWithSevenSwap.currentTurn === 1, 'Turn advances to Bob (P2) after 7 swap resolution');

  // Test Mercy Elimination (25 cards)
  const gameWithMercyKO = {
    roomId: 'MERCY_KO_TEST',
    hostId: 'P1',
    gameStarted: true,
    winner: null,
    gameMode: 'mercy',
    players: [
      { id: 'P1', name: 'Alice', hand: Array(24).fill('BLUE_NUMBER_1'), isDisconnected: false },
      { id: 'P2', name: 'Bob', hand: ['GREEN_NUMBER_2'], isDisconnected: false }
    ],
    deck: ['YELLOW_NUMBER_1', 'YELLOW_NUMBER_2'],
    discardPile: ['BLUE_NUMBER_0'],
    currentTurn: 0,
    direction: 1,
    currentColor: 'BLUE',
    drawStack: null,
    unoStates: {},
    unoCatchablePlayerId: null,
    drawnPlayableCard: null,
    pendingChallenge: null,
    eliminatedPlayers: []
  };
  drawCard(gameWithMercyKO, 'P1');
  assert(gameWithMercyKO.players[0].hand.length === 25, 'Alice hand size increased to 25');
  checkMercyElimination(gameWithMercyKO);
  assert(gameWithMercyKO.eliminatedPlayers.includes('P1'), 'Alice is eliminated by the Mercy Rule');
  assert(gameWithMercyKO.winner === 'P2', 'Bob is declared the winner since only one active player remains');

  // Test Mercy Mode Draw-Until-Playable
  const gameWithDrawUntilPlayable = {
    roomId: 'DRAW_UNTIL_PLAYABLE_TEST',
    hostId: 'P1',
    gameStarted: true,
    winner: null,
    gameMode: 'mercy',
    players: [
      { id: 'P1', name: 'Alice', hand: ['BLUE_NUMBER_1'], isDisconnected: false },
      { id: 'P2', name: 'Bob', hand: ['GREEN_NUMBER_2'], isDisconnected: false }
    ],
    deck: ['BLUE_NUMBER_5', 'YELLOW_NUMBER_8', 'YELLOW_NUMBER_9'],
    discardPile: ['BLUE_NUMBER_0'],
    currentTurn: 0,
    direction: 1,
    currentColor: 'BLUE',
    drawStack: null,
    unoStates: {},
    unoCatchablePlayerId: null,
    drawnPlayableCard: null,
    pendingChallenge: null,
    eliminatedPlayers: []
  };

  let drawRes1 = drawCard(gameWithDrawUntilPlayable, 'P1');
  assert(drawRes1.card === 'YELLOW_NUMBER_9', 'Drew non-playable card');
  assert(drawRes1.isPlayable === false, 'Is not playable');
  assert(gameWithDrawUntilPlayable.currentTurn === 0, 'Turn stays on P1 in Mercy mode after non-playable draw');

  let drawRes2 = drawCard(gameWithDrawUntilPlayable, 'P1');
  assert(drawRes2.card === 'YELLOW_NUMBER_8', 'Drew non-playable card again');
  assert(drawRes2.isPlayable === false, 'Is not playable');
  assert(gameWithDrawUntilPlayable.currentTurn === 0, 'Turn stays on P1 again');

  let drawRes3 = drawCard(gameWithDrawUntilPlayable, 'P1');
  assert(drawRes3.card === 'BLUE_NUMBER_5', 'Drew playable card');
  assert(drawRes3.isPlayable === true, 'Is playable');
  assert(gameWithDrawUntilPlayable.currentTurn === 0, 'Turn stays on P1 for them to play or pass');
  assert(gameWithDrawUntilPlayable.drawnPlayableCard === 'BLUE_NUMBER_5', 'drawnPlayableCard state is tracked');

  // Verify player can draw again even after a playable card is drawn (no restriction)
  let drawRes4 = drawCard(gameWithDrawUntilPlayable, 'P1');
  assert(drawRes4.card === null, 'Allowed to draw again (returns null card since deck is empty)');

  // Test Wild Roulette
  const gameWithRoulette = {
    roomId: 'ROULETTE_TEST',
    hostId: 'P1',
    gameStarted: true,
    winner: null,
    gameMode: 'mercy',
    players: [
      { id: 'P1', name: 'Alice', hand: ['WILD_ROULETTE', 'BLUE_NUMBER_2'], isDisconnected: false },
      { id: 'P2', name: 'Bob', hand: ['GREEN_NUMBER_2'], isDisconnected: false }
    ],
    deck: ['RED_NUMBER_7', 'WILD', 'YELLOW_NUMBER_1', 'YELLOW_NUMBER_2'],
    discardPile: ['BLUE_NUMBER_0'],
    currentTurn: 0,
    direction: 1,
    currentColor: 'BLUE',
    drawStack: null,
    unoStates: {},
    unoCatchablePlayerId: null,
    drawnPlayableCard: null,
    pendingChallenge: null,
    eliminatedPlayers: []
  };

  playCard(gameWithRoulette, 'P1', 'WILD_ROULETTE', 'RED');
  assert(gameWithRoulette.pendingChallenge && gameWithRoulette.pendingChallenge.type === 'WILD_ROULETTE', 'Playing WILD_ROULETTE sets a pending challenge of type WILD_ROULETTE');
  assert(gameWithRoulette.currentColor === 'RED', 'Current color is updated to RED');
  assert(gameWithRoulette.currentTurn === 1, 'Turn moves to P2 (Bob) to resolve the roulette');

  const outcome = resolveChallenge(gameWithRoulette, 'P2', false);
  assert(outcome.accepted === true, 'Challenge is accepted by Bob');
  assert(outcome.cardsDrawn === 4, `Bob should draw 4 cards until RED is found, skipping WILD (got ${outcome.cardsDrawn})`);
  assert(gameWithRoulette.players[1].hand.length === 5, `Bob should end up with 5 cards (1 original + 4 drawn)`);
  assert(gameWithRoulette.pendingChallenge === null, 'Pending challenge is cleared after resolution');
  assert(gameWithRoulette.currentTurn === 0, 'Turn moves back to P1 (Alice) after Bob is skipped');

} catch (e) {
  assert(false, `UNO Show Em No Mercy testing error: ${e.message}\nStack: ${e.stack}`);
}

console.log('--- TEST SUITE COMPLETE ---');
console.log(`Total Passed: ${passedTests}`);
console.log(`Total Failed: ${failedTests}`);

process.exit(failedTests > 0 ? 1 : 0);
