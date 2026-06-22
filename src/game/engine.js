import { createDeck, shuffleDeck, dealCards, getActiveCardFace } from './deck.js';
import { normalizeCard } from './normalizer.js';
import { validatePlayable } from './validator.js';
import { nextTurn, reverseDirection, skipTurn } from './turnManager.js';
import { hasMatchingColor, checkWinner } from './rules.js';

/**
 * Draws specified number of cards for a player.
 * Reshuffles discard pile if the draw deck runs out.
 * 
 * @param {Object} gameState 
 * @param {string} playerId 
 * @param {number} count 
 * @returns {string[]} - The cards drawn.
 */
export function drawPenalty(gameState, playerId, count) {
  const drawnCards = [];
  const player = gameState.players.find(p => p.id === playerId);
  if (!player) return [];

  for (let i = 0; i < count; i++) {
    if (gameState.deck.length === 0) {
      // Reshuffle discard pile (excluding the top card)
      if (gameState.discardPile.length <= 1) {
        // No cards to reshuffle, stop drawing
        break;
      }
      const topCard = gameState.discardPile.pop();
      const newDeck = shuffleDeck(gameState.discardPile);
      gameState.deck = newDeck;
      gameState.discardPile = [topCard];
    }

    if (gameState.deck.length > 0) {
      const card = gameState.deck.pop();
      player.hand.push(card);
      drawnCards.push(card);
    }
  }

  // If player draws cards, reset their UNO state if they now have > 1 card
  if (player.hand.length > 1) {
    gameState.unoStates[playerId] = false;
  }

  return drawnCards;
}

/**
 * Draws a single card for the current player on their turn.
 * 
 * @param {Object} gameState 
 * @param {string} playerId 
 * @returns {{card: string|null, isPlayable: boolean}}
 */
export function drawCard(gameState, playerId) {
  if (gameState.winner) throw new Error('Game has already ended');
  if (gameState.pendingChallenge) throw new Error('Pending challenge must be resolved first');
  
  const activePlayer = gameState.players[gameState.currentTurn];
  if (activePlayer.id !== playerId) {
    throw new Error('It is not your turn');
  }

  // Draw 1 card
  const drawn = drawPenalty(gameState, playerId, 1);
  if (drawn.length === 0) {
    return { card: null, isPlayable: false };
  }

  const card = drawn[0];
  const activeFace = getActiveCardFace(card, gameState.side, gameState.gameMode);
  const activeTopFace = getActiveCardFace(gameState.discardPile[gameState.discardPile.length - 1], gameState.side, gameState.gameMode);
  const isPlayable = validatePlayable(activeFace, activeTopFace, gameState.currentColor);

  // If not playable, turn immediately passes to next player
  if (!isPlayable) {
    // Reset UNO catchable state from previous turn
    gameState.unoCatchablePlayerId = null;
    gameState.currentTurn = nextTurn(gameState.currentTurn, gameState.direction, gameState.players.length);
  } else {
    // Player has drawn a playable card. They can choose to play it (in the same turn) or pass.
    // We mark that this drawn card is playable on their current turn.
    gameState.drawnPlayableCard = card;
  }

  return { card, isPlayable };
}

/**
 * Executes a card play from a player's hand.
 * 
 * @param {Object} gameState 
 * @param {string} playerId 
 * @param {string} cardId 
 * @param {string} [chosenColor] - Required for WILD and WILD_DRAW_FOUR.
 * @returns {Object} - Result of the play.
 */
export function playCard(gameState, playerId, cardId, chosenColor) {
  if (gameState.winner) throw new Error('Game has already ended');
  if (gameState.pendingChallenge) throw new Error('Pending challenge must be resolved first');

  const activePlayer = gameState.players[gameState.currentTurn];
  if (activePlayer.id !== playerId) {
    throw new Error('It is not your turn');
  }

  // Verify player has the card
  const cardIndex = activePlayer.hand.indexOf(cardId);
  if (cardIndex === -1) {
    throw new Error('Card not in hand');
  }

  // If they drew a playable card, they can only play THAT card or pass
  if (gameState.drawnPlayableCard && gameState.drawnPlayableCard !== cardId) {
    throw new Error('You can only play the drawn card or pass');
  }

  const topCardId = gameState.discardPile[gameState.discardPile.length - 1];
  const activeFace = getActiveCardFace(cardId, gameState.side, gameState.gameMode);
  const activeTopFace = getActiveCardFace(topCardId, gameState.side, gameState.gameMode);
  const isPlayable = validatePlayable(activeFace, activeTopFace, gameState.currentColor);
  if (!isPlayable) {
    throw new Error('Card is not playable');
  }

  const card = normalizeCard(activeFace);

  // Validate wild colors dynamically based on active side
  const validColors = (gameState.gameMode === 'flip' && gameState.side === 'dark')
    ? ['PINK', 'TEAL', 'ORANGE', 'PURPLE']
    : ['RED', 'BLUE', 'GREEN', 'YELLOW'];

  if (card.color === 'WILD' && !validColors.includes(chosenColor)) {
    throw new Error(`Must choose a valid color (${validColors.join(', ')}) for Wild cards`);
  }

  // Remove card from hand
  activePlayer.hand.splice(cardIndex, 1);
  gameState.discardPile.push(cardId);

  // Reset drawn playable card state
  gameState.drawnPlayableCard = null;

  // Clear previous catchable state
  const prevUnoCatchable = gameState.unoCatchablePlayerId;
  gameState.unoCatchablePlayerId = null;

  // Set active color
  const colorBeforePlay = gameState.currentColor;
  gameState.currentColor = card.color === 'WILD' ? chosenColor : card.color;

  // Check if player is down to 1 card and did not call UNO
  if (activePlayer.hand.length === 1 && !gameState.unoStates[playerId]) {
    gameState.unoCatchablePlayerId = playerId;
  }

  // Check if the playing player won
  if (checkWinner(activePlayer.hand)) {
    gameState.winner = playerId;
    return { success: true, winner: playerId };
  }

  // Handle Action Effects
  if (card.type === 'SKIP') {
    gameState.currentTurn = skipTurn(gameState.currentTurn, gameState.direction, gameState.players.length);
  } else if (card.type === 'SKIP_EVERYONE') {
    // Skip Everyone: Play returns to the player who laid it. Do not change currentTurn.
  } else if (card.type === 'REVERSE') {
    gameState.direction = reverseDirection(gameState.direction);
    if (gameState.players.length === 2) {
      // In 2-player games, reverse acts as skip (returns to current player)
      gameState.currentTurn = skipTurn(gameState.currentTurn, gameState.direction, gameState.players.length);
    } else {
      gameState.currentTurn = nextTurn(gameState.currentTurn, gameState.direction, gameState.players.length);
    }
  } else if (card.type === 'DRAW_TWO') {
    // Next player draws 2 and loses their turn
    const nextPlayerIdx = nextTurn(gameState.currentTurn, gameState.direction, gameState.players.length);
    const nextPlayer = gameState.players[nextPlayerIdx];
    drawPenalty(gameState, nextPlayer.id, 2);
    gameState.currentTurn = skipTurn(gameState.currentTurn, gameState.direction, gameState.players.length);
  } else if (card.type === 'DRAW_ONE') {
    // Next player draws 1 and loses their turn
    const nextPlayerIdx = nextTurn(gameState.currentTurn, gameState.direction, gameState.players.length);
    const nextPlayer = gameState.players[nextPlayerIdx];
    drawPenalty(gameState, nextPlayer.id, 1);
    gameState.currentTurn = skipTurn(gameState.currentTurn, gameState.direction, gameState.players.length);
  } else if (card.type === 'DRAW_FIVE') {
    // Next player draws 5 and loses their turn
    const nextPlayerIdx = nextTurn(gameState.currentTurn, gameState.direction, gameState.players.length);
    const nextPlayer = gameState.players[nextPlayerIdx];
    drawPenalty(gameState, nextPlayer.id, 5);
    gameState.currentTurn = skipTurn(gameState.currentTurn, gameState.direction, gameState.players.length);
  } else if (card.type === 'FLIP') {
    // 1. Toggle side
    gameState.side = gameState.side === 'light' ? 'dark' : 'light';
    
    // 2. Reverse draw deck
    gameState.deck.reverse();
    
    // 3. Reverse discard pile
    gameState.discardPile.reverse();
    
    // 4. Update currentColor to the color of the new top card of the discard pile
    const newTopCardId = gameState.discardPile[gameState.discardPile.length - 1];
    const newActiveFace = getActiveCardFace(newTopCardId, gameState.side, gameState.gameMode);
    const newNorm = normalizeCard(newActiveFace);
    
    if (newNorm.color === 'WILD') {
      gameState.currentColor = gameState.side === 'light' ? 'BLUE' : 'PINK';
    } else {
      gameState.currentColor = newNorm.color;
    }
    
    // Move to next turn
    gameState.currentTurn = nextTurn(gameState.currentTurn, gameState.direction, gameState.players.length);
  } else if (card.type === 'WILD_DRAW_FOUR' || card.type === 'WILD_DRAW_TWO' || card.type === 'WILD_DRAW_COLOR') {
    // Staging a challenge pending state
    const nextPlayerIdx = nextTurn(gameState.currentTurn, gameState.direction, gameState.players.length);
    const nextPlayer = gameState.players[nextPlayerIdx];
    
    gameState.pendingChallenge = {
      type: card.type,
      playedBy: playerId,
      targetPlayerId: nextPlayer.id,
      colorBeforePlay,
      chosenColor
    };
    
    // Turn is set to the target player so they can resolve the challenge
    gameState.currentTurn = nextPlayerIdx;
  } else {
    // Normal card
    gameState.currentTurn = nextTurn(gameState.currentTurn, gameState.direction, gameState.players.length);
  }

  return { success: true };
}

/**
 * Passes the turn after a player draws a playable card but chooses not to play it.
 * 
 * @param {Object} gameState 
 * @param {string} playerId 
 */
export function passTurn(gameState, playerId) {
  if (gameState.winner) throw new Error('Game has already ended');
  if (gameState.pendingChallenge) throw new Error('Pending challenge must be resolved first');

  const activePlayer = gameState.players[gameState.currentTurn];
  if (activePlayer.id !== playerId) {
    throw new Error('It is not your turn');
  }

  if (!gameState.drawnPlayableCard) {
    throw new Error('You have not drawn a card this turn');
  }

  // Clear playable state
  gameState.drawnPlayableCard = null;
  gameState.unoCatchablePlayerId = null;

  // Advance turn
  gameState.currentTurn = nextTurn(gameState.currentTurn, gameState.direction, gameState.players.length);
}

/**
 * Resolves a Wild Draw Four challenge.
 * 
 * @param {Object} gameState 
 * @param {string} challengerId - The player being forced to draw 4 who challenged.
 * @param {boolean} wantsToChallenge - True to challenge, false to accept.
 * @returns {Object} - Outcome of challenge.
 */
export function resolveChallenge(gameState, challengerId, wantsToChallenge) {
  const challenge = gameState.pendingChallenge;
  if (!challenge) {
    throw new Error('No pending challenge to resolve');
  }
  if (challenge.targetPlayerId !== challengerId) {
    throw new Error('Only the target player can challenge');
  }

  const targetPlayer = gameState.players.find(p => p.id === challengerId);
  const playedPlayer = gameState.players.find(p => p.id === challenge.playedBy);

  let result = {};
  const challengeType = challenge.type || 'WILD_DRAW_FOUR';

  if (wantsToChallenge) {
    const guilty = hasMatchingColor(playedPlayer.hand, challenge.colorBeforePlay, gameState.side, gameState.gameMode);

    if (guilty) {
      let cardsDrawn = 0;
      if (challengeType === 'WILD_DRAW_FOUR') {
        drawPenalty(gameState, challenge.playedBy, 4);
        cardsDrawn = 4;
      } else if (challengeType === 'WILD_DRAW_TWO') {
        drawPenalty(gameState, challenge.playedBy, 2);
        cardsDrawn = 2;
      } else if (challengeType === 'WILD_DRAW_COLOR') {
        const drawn = drawUntilColor(gameState, challenge.playedBy, challenge.chosenColor);
        cardsDrawn = drawn.length;
      }
      
      result = { guilty: true, penalisedPlayerId: challenge.playedBy, cardsDrawn };
    } else {
      let cardsDrawn = 0;
      if (challengeType === 'WILD_DRAW_FOUR') {
        drawPenalty(gameState, challengerId, 6);
        cardsDrawn = 6;
      } else if (challengeType === 'WILD_DRAW_TWO') {
        drawPenalty(gameState, challengerId, 4);
        cardsDrawn = 4;
      } else if (challengeType === 'WILD_DRAW_COLOR') {
        const drawn = drawUntilColor(gameState, challengerId, challenge.chosenColor);
        drawPenalty(gameState, challengerId, 2);
        cardsDrawn = drawn.length + 2;
      }
      
      result = { guilty: false, penalisedPlayerId: challengerId, cardsDrawn };
      gameState.currentTurn = nextTurn(gameState.currentTurn, gameState.direction, gameState.players.length);
    }
  } else {
    let cardsDrawn = 0;
    if (challengeType === 'WILD_DRAW_FOUR') {
      drawPenalty(gameState, challengerId, 4);
      cardsDrawn = 4;
    } else if (challengeType === 'WILD_DRAW_TWO') {
      drawPenalty(gameState, challengerId, 2);
      cardsDrawn = 2;
    } else if (challengeType === 'WILD_DRAW_COLOR') {
      const drawn = drawUntilColor(gameState, challengerId, challenge.chosenColor);
      cardsDrawn = drawn.length;
    }
    
    result = { accepted: true, penalisedPlayerId: challengerId, cardsDrawn };
    gameState.currentTurn = nextTurn(gameState.currentTurn, gameState.direction, gameState.players.length);
  }

  gameState.pendingChallenge = null;
  return result;
}

/**
 * Draws cards for a player until they draw a card matching the chosen color or a Wild card.
 * Used for the Wild Draw Color action in UNO Flip.
 * 
 * @param {Object} gameState 
 * @param {string} playerId 
 * @param {string} color 
 * @returns {string[]} - The cards drawn.
 */
export function drawUntilColor(gameState, playerId, color) {
  const drawnCards = [];
  const player = gameState.players.find(p => p.id === playerId);
  if (!player) return [];

  while (true) {
    if (gameState.deck.length === 0) {
      if (gameState.discardPile.length <= 1) {
        break;
      }
      const topCard = gameState.discardPile.pop();
      const newDeck = shuffleDeck(gameState.discardPile);
      gameState.deck = newDeck;
      gameState.discardPile = [topCard];
    }

    if (gameState.deck.length > 0) {
      const card = gameState.deck.pop();
      player.hand.push(card);
      drawnCards.push(card);

      const activeFace = getActiveCardFace(card, gameState.side, gameState.gameMode);
      const normalized = normalizeCard(activeFace);
      if (normalized.color === color || normalized.color === 'WILD') {
        break;
      }
    } else {
      break;
    }
  }

  if (player.hand.length > 1) {
    gameState.unoStates[playerId] = false;
  }
  return drawnCards;
}

/**
 * Registers a player calling UNO.
 * 
 * @param {Object} gameState 
 * @param {string} playerId 
 */
export function callUno(gameState, playerId) {
  gameState.unoStates[playerId] = true;
}

/**
 * Catch a player who forgot to call UNO when they had 1 card left.
 * 
 * @param {Object} gameState 
 * @param {string} catchingPlayerId 
 * @returns {boolean} - True if catch was successful.
 */
export function catchUno(gameState, catchingPlayerId) {
  const targetPlayerId = gameState.unoCatchablePlayerId;
  if (!targetPlayerId) {
    return false;
  }

  drawPenalty(gameState, targetPlayerId, 2);
  gameState.unoCatchablePlayerId = null;
  return true;
}
