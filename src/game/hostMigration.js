/**
 * Nominates a new host if the current host departs.
 * Selects the first active, non-disconnected player.
 * 
 * @param {Object} gameState - The game state object.
 * @param {string} departedHostId - The ID of the host who left.
 * @returns {string|null} - The new host ID, or null if no active player is available.
 */
export function handleHostMigration(gameState, departedHostId) {
  if (gameState.hostId !== departedHostId) {
    // Current host has not departed
    return gameState.hostId;
  }

  // Find first player who is not disconnected
  const newHostCandidate = gameState.players.find(p => !p.isDisconnected && p.id !== departedHostId);

  if (newHostCandidate) {
    gameState.hostId = newHostCandidate.id;
    return gameState.hostId;
  }

  return null;
}
