/**
 * Redacts a game state so it is safe to send to a specific player.
 * Hides other players' hands and the contents of the draw deck.
 * 
 * @param {Object} gameState - The full in-memory game state.
 * @param {string} recipientPlayerId - The ID of the player receiving the state.
 * @returns {Object} - The redacted state safe for transport.
 */
export function redactGameState(gameState, recipientPlayerId) {
  if (!gameState) return null;

  return {
    roomId: gameState.roomId,
    hostId: gameState.hostId,
    gameStarted: gameState.gameStarted,
    winner: gameState.winner,
    gameMode: gameState.gameMode,
    side: gameState.side,
    currentTurn: gameState.currentTurn,
    turnStartedAt: gameState.turnStartedAt || null,
    direction: gameState.direction,
    currentColor: gameState.currentColor,
    pendingDraw: gameState.pendingDraw,
    unoStates: { ...gameState.unoStates },
    unoCatchablePlayerId: gameState.unoCatchablePlayerId,
    drawnPlayableCard: gameState.players[gameState.currentTurn]?.id === recipientPlayerId 
      ? gameState.drawnPlayableCard 
      : null, // Only reveal the drawn playable card to the active player
    pendingChallenge: gameState.pendingChallenge ? { ...gameState.pendingChallenge } : null,
    deckSize: gameState.deck.length,
    discardPileTop: gameState.discardPile[gameState.discardPile.length - 1] || null,
    discardPileSize: gameState.discardPile.length,
    serverTime: Date.now(),
    players: gameState.players.map(p => ({
      id: p.id,
      name: p.name,
      avatarSeed: p.avatarSeed || '',
      isReady: p.isReady,
      isDisconnected: p.isDisconnected,
      handCardCount: p.hand.length,
      hand: (p.id === recipientPlayerId || gameState.gameMode === 'flip') ? [...p.hand] : p.hand.length
    }))
  };
}
