import crypto from 'crypto';

/**
 * Creates a new player session.
 * 
 * @param {Map<string, Object>} sessionsMap 
 * @param {string} playerId 
 * @param {string} name 
 * @param {string} roomId 
 * @returns {string} - The session token.
 */
export function createSession(sessionsMap, playerId, name, roomId) {
  const sessionToken = crypto.randomUUID();
  sessionsMap.set(sessionToken, { playerId, name, roomId });
  return sessionToken;
}

/**
 * Retrieves a session by its token.
 * 
 * @param {Map<string, Object>} sessionsMap 
 * @param {string} sessionToken 
 * @returns {Object|null}
 */
export function getSession(sessionsMap, sessionToken) {
  if (!sessionToken) return null;
  return sessionsMap.get(sessionToken) || null;
}

/**
 * Removes a session.
 * 
 * @param {Map<string, Object>} sessionsMap 
 * @param {string} sessionToken 
 */
export function removeSession(sessionsMap, sessionToken) {
  sessionsMap.delete(sessionToken);
}
