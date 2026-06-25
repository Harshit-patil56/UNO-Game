import { createDeck, shuffleDeck, dealCards, getActiveCardFace } from './deck.js';
import { normalizeCard } from './normalizer.js';
import { validatePlayable, getDrawPenaltyValue } from './validator.js';
import { nextTurn, reverseDirection, skipTurn } from './turnManager.js';
import { hasMatchingColor, checkWinner } from './rules.js';

/**
 * Calculates the next turn index, skipping any players that are eliminated.
 * 
 * @param {Object} gameState
 * @param {number} currentIdx - Start index
 * @param {number} steps - Number of steps to advance
 * @returns {number}
 */
export function getNextActivePlayerIndex(gameState, currentIdx, steps = 1) {
  const eliminated = gameState.eliminatedPlayers || [];
  const len = gameState.players.length;
  if (len <= 0) return 0;
  const direction = gameState.direction || 1;
  let nextIdx = currentIdx;

  for (let s = 0; s < steps; s++) {
    let found = false;
    for (let i = 0; i < len; i++) {
      nextIdx = (nextIdx + (direction * 1) + len) % len;
      if (!eliminated.includes(gameState.players[nextIdx].id)) {
        found = true;
        break;
      }
    }
    if (!found) break;
  }
  return nextIdx;
}


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
 * In mercy mode with an active draw stack, draws the ENTIRE stack instead.
 * 
 * @param {Object} gameState 
 * @param {string} playerId 
 * @returns {{card: string|null, isPlayable: boolean, drewStack?: number}}
 */
export function drawCard(gameState, playerId) {
  if (gameState.winner) throw new Error('Game has already ended');
  if (gameState.pendingChallenge) throw new Error('Pending challenge must be resolved first');
  if (gameState.pendingSevenSwap) throw new Error('Pending seven swap must be resolved first');
  
  const activePlayer = gameState.players[gameState.currentTurn];
  if (activePlayer.id !== playerId) {
    throw new Error('It is not your turn');
  }

  // In mercy mode with an active draw stack, drawing means taking the whole stack
  if (gameState.gameMode === 'mercy' && gameState.drawStack && gameState.drawStack.count > 0) {
    const stackCount = gameState.drawStack.count;
    drawPenalty(gameState, playerId, stackCount);
    // Clear the stack
    gameState.drawStack = { count: 0, minValue: 0 };
    // Check mercy elimination
    checkMercyElimination(gameState);
    // Skip this player's turn
    gameState.unoCatchablePlayerId = null;
    gameState.currentTurn = getNextActivePlayerIndex(gameState, gameState.currentTurn, 1);
    return { card: null, isPlayable: false, drewStack: stackCount };
  }

  // Draw 1 card
  const drawn = drawPenalty(gameState, playerId, 1);
  if (drawn.length === 0) {
    return { card: null, isPlayable: false };
  }

  const card = drawn[0];
  const activeFace = getActiveCardFace(card, gameState.side, gameState.gameMode);
  const activeTopFace = getActiveCardFace(gameState.discardPile[gameState.discardPile.length - 1], gameState.side, gameState.gameMode);
  const drawStack = gameState.gameMode === 'mercy' ? gameState.drawStack : null;
  const isPlayable = validatePlayable(activeFace, activeTopFace, gameState.currentColor, drawStack);

  // If not playable, turn immediately passes to next player
  if (!isPlayable) {
    // Reset UNO catchable state from previous turn
    gameState.unoCatchablePlayerId = null;
    gameState.currentTurn = getNextActivePlayerIndex(gameState, gameState.currentTurn, 1);
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
  const drawStack = gameState.gameMode === 'mercy' ? gameState.drawStack : null;
  const isPlayable = validatePlayable(activeFace, activeTopFace, gameState.currentColor, drawStack);
  if (!isPlayable) {
    throw new Error('Card is not playable');
  }

  const card = normalizeCard(activeFace);

  // Validate wild colors dynamically based on active side
  const validColors = (gameState.gameMode === 'flip' && gameState.side === 'dark')
    ? ['PINK', 'TEAL', 'ORANGE', 'PURPLE']
    : ['RED', 'BLUE', 'GREEN', 'YELLOW'];

  if (card.color === 'WILD' && !['SKIP_ALL', 'DISCARD_ALL'].includes(card.type) && !validColors.includes(chosenColor)) {
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
    gameState.currentTurn = getNextActivePlayerIndex(gameState, gameState.currentTurn, 2);
  } else if (card.type === 'SKIP_ALL' || card.type === 'SKIP_EVERYONE') {
    // Skip All / Skip Everyone: Play returns directly to the player who laid it (no turn advance)
    // currentTurn stays the same — the next broadcastState will show it's their turn again
  } else if (card.type === 'DISCARD_ALL') {
    // Discard all cards in hand matching the card's color
    const handBefore = [...activePlayer.hand];
    activePlayer.hand = activePlayer.hand.filter(c => {
      try {
        const f = getActiveCardFace(c, gameState.side, gameState.gameMode);
        const n = normalizeCard(f);
        return n.color !== card.color;
      } catch (_) { return true; }
    });
    // After discarding, check for a win
    if (checkWinner(activePlayer.hand)) {
      gameState.winner = playerId;
      return { success: true, winner: playerId, discardedCards: handBefore.length - activePlayer.hand.length };
    }
    gameState.currentTurn = getNextActivePlayerIndex(gameState, gameState.currentTurn, 1);
  } else if (card.type === 'REVERSE') {
    gameState.direction = reverseDirection(gameState.direction);
    if (gameState.players.length === 2) {
      // In 2-player games, reverse acts as skip (returns to current player)
      gameState.currentTurn = getNextActivePlayerIndex(gameState, gameState.currentTurn, 2);
    } else {
      gameState.currentTurn = getNextActivePlayerIndex(gameState, gameState.currentTurn, 1);
    }
  } else if (card.type === 'DRAW_TWO') {
    if (gameState.gameMode === 'mercy') {
      // Mercy: Add to draw stack, pass turn without forcing draw
      gameState.drawStack = gameState.drawStack || { count: 0, minValue: 0 };
      gameState.drawStack.count += 2;
      gameState.drawStack.minValue = Math.max(gameState.drawStack.minValue, 2);
      gameState.currentTurn = getNextActivePlayerIndex(gameState, gameState.currentTurn, 1);
    } else {
      // Next player draws 2 and loses their turn
      const nextPlayerIdx = getNextActivePlayerIndex(gameState, gameState.currentTurn, 1);
      const nextPlayer = gameState.players[nextPlayerIdx];
      drawPenalty(gameState, nextPlayer.id, 2);
      gameState.currentTurn = getNextActivePlayerIndex(gameState, gameState.currentTurn, 2);
    }
  } else if (card.type === 'DRAW_FOUR') {
    // No Mercy colored +4: mercy stack
    gameState.drawStack = gameState.drawStack || { count: 0, minValue: 0 };
    gameState.drawStack.count += 4;
    gameState.drawStack.minValue = Math.max(gameState.drawStack.minValue, 4);
    gameState.currentTurn = getNextActivePlayerIndex(gameState, gameState.currentTurn, 1);
  } else if (card.type === 'DRAW_ONE') {
    // Next player draws 1 and loses their turn
    const nextPlayerIdx = getNextActivePlayerIndex(gameState, gameState.currentTurn, 1);
    const nextPlayer = gameState.players[nextPlayerIdx];
    drawPenalty(gameState, nextPlayer.id, 1);
    gameState.currentTurn = getNextActivePlayerIndex(gameState, gameState.currentTurn, 2);
  } else if (card.type === 'DRAW_FIVE') {
    // Next player draws 5 and loses their turn
    const nextPlayerIdx = getNextActivePlayerIndex(gameState, gameState.currentTurn, 1);
    const nextPlayer = gameState.players[nextPlayerIdx];
    drawPenalty(gameState, nextPlayer.id, 5);
    gameState.currentTurn = getNextActivePlayerIndex(gameState, gameState.currentTurn, 2);
  } else if (card.type === 'NUMBER' && card.value === 0 && gameState.gameMode === 'mercy') {
    // Mercy 0s Rule: All players shift their hands in the current direction of play
    const players = gameState.players;
    const n = players.length;
    if (gameState.direction === 1) {
      // Clockwise: each player passes hand to the next
      const firstHand = players[0].hand;
      for (let i = 0; i < n - 1; i++) {
        players[i].hand = players[i + 1].hand;
      }
      players[n - 1].hand = firstHand;
    } else {
      // Counter-clockwise: each player passes hand to the previous
      const lastHand = players[n - 1].hand;
      for (let i = n - 1; i > 0; i--) {
        players[i].hand = players[i - 1].hand;
      }
      players[0].hand = lastHand;
    }
    // Check if any player won after the rotation
    for (const p of players) {
      if (checkWinner(p.hand)) {
        gameState.winner = p.id;
        return { success: true, winner: p.id, zeroRotation: true };
      }
    }
    gameState.currentTurn = getNextActivePlayerIndex(gameState, gameState.currentTurn, 1);
  } else if (card.type === 'NUMBER' && card.value === 7 && gameState.gameMode === 'mercy') {
    // Mercy 7s Rule: The player must choose an opponent to swap hands with
    gameState.pendingSevenSwap = { playedBy: playerId };
    // Turn stays with current player until they choose
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
    gameState.currentTurn = getNextActivePlayerIndex(gameState, gameState.currentTurn, 1);
  } else if (card.type === 'WILD_DRAW_FOUR' || card.type === 'WILD_DRAW_TWO' || card.type === 'WILD_DRAW_COLOR') {
    // Staging a challenge pending state
    const nextPlayerIdx = getNextActivePlayerIndex(gameState, gameState.currentTurn, 1);
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
  } else if (card.type === 'WILD_DRAW_SIX') {
    // No Mercy: Add 6 to draw stack
    gameState.drawStack = gameState.drawStack || { count: 0, minValue: 0 };
    gameState.drawStack.count += 6;
    gameState.drawStack.minValue = Math.max(gameState.drawStack.minValue, 6);
    gameState.currentTurn = getNextActivePlayerIndex(gameState, gameState.currentTurn, 1);
  } else if (card.type === 'WILD_DRAW_TEN') {
    // No Mercy: Add 10 to draw stack
    gameState.drawStack = gameState.drawStack || { count: 0, minValue: 0 };
    gameState.drawStack.count += 10;
    gameState.drawStack.minValue = Math.max(gameState.drawStack.minValue, 10);
    gameState.currentTurn = getNextActivePlayerIndex(gameState, gameState.currentTurn, 1);
  } else if (card.type === 'WILD_ROULETTE') {
    // No Mercy: Wild Roulette = draws cards until a card of the chosen color appears (like WILD_DRAW_COLOR)
    const nextPlayerIdx = getNextActivePlayerIndex(gameState, gameState.currentTurn, 1);
    const nextPlayer = gameState.players[nextPlayerIdx];
    
    gameState.pendingChallenge = {
      type: 'WILD_ROULETTE',
      playedBy: playerId,
      targetPlayerId: nextPlayer.id,
      colorBeforePlay,
      chosenColor
    };
    
    gameState.currentTurn = nextPlayerIdx;
  } else {
    // Normal card
    gameState.currentTurn = getNextActivePlayerIndex(gameState, gameState.currentTurn, 1);
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
  gameState.currentTurn = getNextActivePlayerIndex(gameState, gameState.currentTurn, 1);
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
      } else if (challengeType === 'WILD_DRAW_COLOR' || challengeType === 'WILD_ROULETTE') {
        const allowWildToStop = challengeType !== 'WILD_ROULETTE';
        const drawn = drawUntilColor(gameState, challenge.playedBy, challenge.chosenColor, allowWildToStop);
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
      } else if (challengeType === 'WILD_DRAW_COLOR' || challengeType === 'WILD_ROULETTE') {
        const allowWildToStop = challengeType !== 'WILD_ROULETTE';
        const drawn = drawUntilColor(gameState, challengerId, challenge.chosenColor, allowWildToStop);
        drawPenalty(gameState, challengerId, 2);
        cardsDrawn = drawn.length + 2;
      }
      
      result = { guilty: false, penalisedPlayerId: challengerId, cardsDrawn };
      gameState.currentTurn = getNextActivePlayerIndex(gameState, gameState.currentTurn, 1);
    }
  } else {
    let cardsDrawn = 0;
    if (challengeType === 'WILD_DRAW_FOUR') {
      drawPenalty(gameState, challengerId, 4);
      cardsDrawn = 4;
    } else if (challengeType === 'WILD_DRAW_TWO') {
      drawPenalty(gameState, challengerId, 2);
      cardsDrawn = 2;
    } else if (challengeType === 'WILD_DRAW_COLOR' || challengeType === 'WILD_ROULETTE') {
      const allowWildToStop = challengeType !== 'WILD_ROULETTE';
      const drawn = drawUntilColor(gameState, challengerId, challenge.chosenColor, allowWildToStop);
      cardsDrawn = drawn.length;
    }
    
    result = { accepted: true, penalisedPlayerId: challengerId, cardsDrawn };
    gameState.currentTurn = getNextActivePlayerIndex(gameState, gameState.currentTurn, 1);
  }

  gameState.pendingChallenge = null;
  return result;
}

/**
 * Draws cards for a player until they draw a card matching the chosen color or a Wild card.
 * Used for the Wild Draw Color action in UNO Flip, and Wild Roulette in UNO No Mercy (where Wilds don't stop).
 * 
 * @param {Object} gameState 
 * @param {string} playerId 
 * @param {string} color 
 * @param {boolean} [allowWildToStop=true] - Whether a Wild card matches/stops the draw.
 * @returns {string[]} - The cards drawn.
 */
export function drawUntilColor(gameState, playerId, color, allowWildToStop = true) {
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
      
      const isMatch = normalized.color === color;
      const isWildMatch = allowWildToStop && normalized.color === 'WILD';
      
      if (isMatch || isWildMatch) {
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

/**
 * Checks for mercy elimination: removes any player with 25 or more cards from the active game.
 * Sets gameState.winner if only one player remains.
 * 
 * @param {Object} gameState 
 * @returns {string[]} - IDs of players who were eliminated.
 */
export function checkMercyElimination(gameState) {
  if (gameState.gameMode !== 'mercy') return [];
  if (!gameState.eliminatedPlayers) gameState.eliminatedPlayers = [];

  const eliminated = [];
  for (const player of gameState.players) {
    if (!gameState.eliminatedPlayers.includes(player.id) && player.hand.length >= 25) {
      gameState.eliminatedPlayers.push(player.id);
      eliminated.push(player.id);
    }
  }

  // Check if only one active player remains
  const activePlayers = gameState.players.filter(p => !gameState.eliminatedPlayers.includes(p.id));
  if (activePlayers.length === 1) {
    gameState.winner = activePlayers[0].id;
  }

  // If the active turn player was eliminated, we must advance the turn
  if (eliminated.includes(gameState.players[gameState.currentTurn]?.id) && !gameState.winner) {
    gameState.currentTurn = getNextActivePlayerIndex(gameState, gameState.currentTurn, 1);
  }

  return eliminated;
}

/**
 * Resolves a pending 7-swap: the playing player swaps hands with a chosen opponent.
 * 
 * @param {Object} gameState 
 * @param {string} playerId - The player resolving the 7 (must be the one who played it).
 * @param {string} targetPlayerId - The opponent to swap hands with.
 * @returns {{ success: boolean }}
 */
export function resolveSevenSwap(gameState, playerId, targetPlayerId) {
  if (!gameState.pendingSevenSwap) {
    throw new Error('No pending seven swap to resolve');
  }
  if (gameState.pendingSevenSwap.playedBy !== playerId) {
    throw new Error('Only the player who played the 7 can resolve the swap');
  }

  const player = gameState.players.find(p => p.id === playerId);
  const target = gameState.players.find(p => p.id === targetPlayerId);

  if (!player || !target) {
    throw new Error('Invalid player for seven swap');
  }
  if (playerId === targetPlayerId) {
    throw new Error('Cannot swap with yourself');
  }

  // Swap hands
  const tempHand = player.hand;
  player.hand = target.hand;
  target.hand = tempHand;

  // Reset UNO states for both players
  gameState.unoStates[playerId] = false;
  gameState.unoStates[targetPlayerId] = false;

  // Clear pending state and advance turn
  gameState.pendingSevenSwap = null;
  gameState.unoCatchablePlayerId = null;
  gameState.currentTurn = nextTurn(gameState.currentTurn, gameState.direction, gameState.players.length);

  // Check if either player now has a winning hand (empty)
  if (checkWinner(player.hand)) {
    gameState.winner = playerId;
    return { success: true, winner: playerId };
  }
  if (checkWinner(target.hand)) {
    gameState.winner = targetPlayerId;
    return { success: true, winner: targetPlayerId };
  }

  return { success: true };
}

