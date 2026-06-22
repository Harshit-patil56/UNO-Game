import { handleHostMigration } from '../game/hostMigration.js';

// In-memory room storage
const rooms = new Map();

/**
 * Generates a unique 6-character alphanumeric room ID.
 * 
 * @returns {string}
 */
function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let roomId;
  do {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    roomId = code;
  } while (rooms.has(roomId));
  return roomId;
}

/**
 * Creates a new room.
 * 
 * @param {string} hostName 
 * @param {string} hostPlayerId 
 * @returns {Object} - The created room state.
 */
export function createRoom(hostName, hostPlayerId, gameMode = 'classic', avatarSeed = '') {
  const roomId = generateRoomId();
  
  const room = {
    roomId,
    hostId: hostPlayerId,
    gameStarted: false,
    winner: null,
    gameMode,
    side: 'light',
    players: [
      {
        id: hostPlayerId,
        name: hostName,
        avatarSeed,
        socketId: null,
        hand: [],
        isReady: true, // Host is implicitly ready
        isDisconnected: false
      }
    ],
    deck: [],
    discardPile: [],
    currentTurn: 0,
    direction: 1,
    currentColor: null,
    pendingDraw: 0,
    unoStates: {},
    unoCatchablePlayerId: null,
    drawnPlayableCard: null,
    pendingChallenge: null
  };

  rooms.set(roomId, room);
  return room;
}

/**
 * Joins an existing room.
 * 
 * @param {string} roomId 
 * @param {string} playerName 
 * @param {string} playerId 
 * @returns {Object} - The joined room.
 */
export function joinRoom(roomId, playerName, playerId, avatarSeed = '') {
  const room = rooms.get(roomId.toUpperCase());
  if (!room) {
    throw new Error('Room not found');
  }

  if (room.gameStarted) {
    throw new Error('Game already started in this room');
  }

  // Prevent duplicate players
  const existingPlayer = room.players.find(p => p.id === playerId);
  if (!existingPlayer) {
    room.players.push({
      id: playerId,
      name: playerName,
      avatarSeed,
      socketId: null,
      hand: [],
      isReady: false,
      isDisconnected: false
    });
  }

  return room;
}

/**
 * Removes a player from the room or marks them disconnected if the game has started.
 * 
 * @param {string} roomId 
 * @param {string} playerId 
 * @returns {Object|null} - The updated room state, or null if room is deleted.
 */
export function leaveRoom(roomId, playerId) {
  const room = rooms.get(roomId.toUpperCase());
  if (!room) return null;

  const playerIndex = room.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return room;

  if (room.gameStarted) {
    // If game started, do not delete them completely, mark disconnected for potential reconnect
    room.players[playerIndex].isDisconnected = true;
    
    // Trigger host migration if host left
    if (room.hostId === playerId) {
      handleHostMigration(room, playerId);
    }
  } else {
    // Game not started: delete player from room completely
    room.players.splice(playerIndex, 1);
    
    // If host left, assign another player or trigger migration
    if (room.hostId === playerId && room.players.length > 0) {
      room.hostId = room.players[0].id;
    }
  }

  // If room is empty or all players are permanently gone/disconnected, clean it up
  const activePlayers = room.players.filter(p => !p.isDisconnected);
  if (room.players.length === 0 || activePlayers.length === 0) {
    rooms.delete(room.roomId);
    return null;
  }

  return room;
}

/**
 * Retrieves a room by its ID.
 * 
 * @param {string} roomId 
 * @returns {Object|null}
 */
export function getRoom(roomId) {
  if (!roomId) return null;
  return rooms.get(roomId.toUpperCase()) || null;
}

/**
 * Deletes a room from memory.
 * 
 * @param {string} roomId 
 */
export function deleteRoom(roomId) {
  rooms.delete(roomId.toUpperCase());
}
