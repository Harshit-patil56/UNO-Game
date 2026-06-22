/**
 * Calculates the next turn index.
 * 
 * @param {number} currentTurn - The current player index.
 * @param {number} direction - The direction of play (1 or -1).
 * @param {number} playerCount - The total number of players.
 * @param {number} [steps=1] - Number of steps to advance.
 * @returns {number}
 */
export function nextTurn(currentTurn, direction, playerCount, steps = 1) {
  if (playerCount <= 0) return 0;
  
  // Clean modulo arithmetic handling negative results in JavaScript
  return (currentTurn + (direction * steps) % playerCount + playerCount) % playerCount;
}

/**
 * Reverses the play direction.
 * 
 * @param {number} direction - The current direction (1 or -1).
 * @returns {number}
 */
export function reverseDirection(direction) {
  return -direction;
}

/**
 * Skips the next turn, returning the index of the player after the skipped one.
 * 
 * @param {number} currentTurn - The current player index.
 * @param {number} direction - The direction of play (1 or -1).
 * @param {number} playerCount - The total number of players.
 * @returns {number}
 */
export function skipTurn(currentTurn, direction, playerCount) {
  return nextTurn(currentTurn, direction, playerCount, 2);
}
