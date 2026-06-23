import crypto from 'crypto';
import fs from 'fs';
import { redactGameState } from '../game/events.js';
import { createRoom, joinRoom, leaveRoom, getRoom } from '../rooms/index.js';
import { createSession, getSession, removeSession } from '../game/reconnect.js';

function logToFile(msg) {
  try {
    fs.appendFileSync('c:/Hackthon/UNO/server.log', `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) {
    // Ignore
  }
}

import {
  playCard,
  drawCard,
  passTurn,
  resolveChallenge,
  callUno,
  catchUno,
  drawPenalty
} from '../game/engine.js';
import { createDeck, shuffleDeck, createFlipDeck, getActiveCardFace, dealCards } from '../game/deck.js';
import { normalizeCard } from '../game/normalizer.js';
import { nextTurn, skipTurn } from '../game/turnManager.js';

// In-memory session store: reconnectToken -> { playerId, name, roomId }
const sessions = new Map();

// Map to track active socket ID -> reconnectToken for clean disconnect handling
const socketToToken = new Map();

// Map to track disconnect grace period timers: playerId -> setTimeout reference
const disconnectTimers = new Map();

// Map to track active turn timers per room: roomId -> setTimeout reference
const turnTimers = new Map();

/**
 * Clears the active turn timer for a given room.
 * 
 * @param {string} roomId 
 */
export function clearRoomTurnTimer(roomId) {
  logToFile(`clearRoomTurnTimer called for room ${roomId}`);
  const timer = turnTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    turnTimers.delete(roomId);
    logToFile(`Timer cleared and removed for room ${roomId}`);
  } else {
    logToFile(`No timer found to clear for room ${roomId}`);
  }
}

/**
 * Starts a 30-second turn timer for the active player in a room.
 * If the timer expires, a card is drawn automatically and the turn is passed.
 * 
 * @param {Object} io - Socket.IO server instance.
 * @param {string} roomId - The ID of the room.
 */
export function startRoomTurnTimer(io, roomId) {
  logToFile(`startRoomTurnTimer called for room ${roomId}`);
  clearRoomTurnTimer(roomId);
  const room = getRoom(roomId);
  if (!room) {
    logToFile(`Room ${roomId} not found`);
    return;
  }
  if (!room.gameStarted) {
    logToFile(`Room ${roomId} game has not started`);
    return;
  }
  if (room.winner) {
    logToFile(`Room ${roomId} already has a winner: ${room.winner}`);
    return;
  }

  const activePlayer = room.players[room.currentTurn];
  if (!activePlayer) {
    logToFile(`No active player found for turn index ${room.currentTurn} in room ${roomId}`);
    return;
  }

  const playerTurnId = activePlayer.id;
  logToFile(`Setting 30s timeout for player ${activePlayer.name} (${playerTurnId}) in room ${roomId}`);

  const timer = setTimeout(() => {
    try {
      logToFile(`Timeout fired for player ${playerTurnId} in room ${roomId}`);
      const currentRoom = getRoom(roomId);
      if (!currentRoom) {
        logToFile(`Timeout callback: Room ${roomId} no longer exists`);
        return;
      }
      if (!currentRoom.gameStarted) {
        logToFile(`Timeout callback: Room ${roomId} game has stopped/returned to lobby`);
        return;
      }
      if (currentRoom.winner) {
        logToFile(`Timeout callback: Room ${roomId} already won by ${currentRoom.winner}`);
        return;
      }

      const currentActivePlayer = currentRoom.players[currentRoom.currentTurn];
      if (!currentActivePlayer) {
        logToFile(`Timeout callback: No current active player found for index ${currentRoom.currentTurn}`);
        return;
      }
      if (currentActivePlayer.id !== playerTurnId) {
        logToFile(`Timeout callback: Turn already changed. Current active player is ${currentActivePlayer.name} (${currentActivePlayer.id}), expected ${playerTurnId}`);
        return;
      }

      logToFile(`Timeout callback executing auto-draw/pass for ${currentActivePlayer.name} (${playerTurnId})`);

      // Perform auto-draw and pass
      try {
        if (currentRoom.pendingChallenge) {
          logToFile(`Resolving pending challenge for player ${playerTurnId}`);
          resolveChallenge(currentRoom, playerTurnId, false);
        } else {
          logToFile(`Drawing card for player ${playerTurnId}`);
          drawCard(currentRoom, playerTurnId);
          logToFile(`Drawn card playable state: ${currentRoom.drawnPlayableCard}`);
          if (currentRoom.drawnPlayableCard) {
            logToFile(`Passing turn for player ${playerTurnId} (playable card drawn)`);
            passTurn(currentRoom, playerTurnId);
          }
        }
        currentRoom.turnStartedAt = Date.now();
      } catch (err) {
        logToFile(`[Turn Timer Error] Failed to execute auto-action: ${err.message}. Stack: ${err.stack}`);
        // Fallback: forcefully advance the turn to prevent game freeze
        try {
          currentRoom.drawnPlayableCard = null;
          currentRoom.unoCatchablePlayerId = null;
          currentRoom.currentTurn = nextTurn(currentRoom.currentTurn, currentRoom.direction, currentRoom.players.length);
          currentRoom.turnStartedAt = Date.now();
          logToFile(`Forcefully advanced turn fallback to turn index ${currentRoom.currentTurn}`);
        } catch (e) {
          logToFile(`[Turn Timer Error] Critical turn advancement fallback failed: ${e.message}`);
        }
      }

      broadcastState(io, currentRoom);
      logToFile(`State broadcasted after auto-turn`);

      // Start timer for the next player
      startRoomTurnTimer(io, roomId);
    } catch (err) {
      logToFile(`[Turn Timer Callback Error]: ${err.message}. Stack: ${err.stack}`);
    }
  }, 30000); // 30 seconds

  turnTimers.set(roomId, timer);
}



/**
 * Broadcasts the redacted game state to all players in the room individually.
 * This guarantees a player only receives their own hand cards.
 * 
 * @param {Object} io - Socket.IO server instance.
 * @param {Object} room - The room state object.
 */
export function broadcastState(io, room) {
  if (!room) return;

  for (const player of room.players) {
    if (!player.isDisconnected && player.socketId) {
      const redactedState = redactGameState(room, player.id);
      io.to(player.socketId).emit(room.gameStarted ? 'game_state_updated' : 'room_updated', redactedState);
    }
  }
}

/**
 * Registers all game-related socket event handlers.
 * 
 * @param {Object} io - Socket.IO server instance.
 * @param {Object} socket - The connected socket client instance.
 */
export function registerSocketHandlers(io, socket) {
  
  // Helper to handle room error messages cleanly
  const sendError = (message) => {
    socket.emit('error', { message });
  };

  // 1. Create Room
  socket.on('create_room', ({ playerName, gameMode, avatarSeed }) => {
    try {
      if (!playerName || typeof playerName !== 'string') {
        return sendError('Player name is required');
      }

      const playerId = crypto.randomUUID();
      const room = createRoom(playerName, playerId, gameMode, avatarSeed);
      
      // Associate socket info
      room.players[0].socketId = socket.id;

      // Create reconnect session
      const reconnectToken = createSession(sessions, playerId, playerName, room.roomId);
      room.players[0].reconnectToken = reconnectToken;
      socketToToken.set(socket.id, reconnectToken);

      socket.join(room.roomId);
      
      socket.emit('room_created', {
        roomId: room.roomId,
        player: room.players[0],
        reconnectToken,
        room: redactGameState(room, playerId)
      });

      broadcastState(io, room);
      console.log(`Room ${room.roomId} created by Host: ${playerName} (${playerId})`);
    } catch (err) {
      sendError(err.message);
    }
  });

  // 2. Join Room
  socket.on('join_room', ({ roomId, playerName, avatarSeed }) => {
    try {
      if (!roomId || !playerName) {
        return sendError('Room ID and Player Name are required');
      }

      const playerId = crypto.randomUUID();
      const room = joinRoom(roomId, playerName, playerId, avatarSeed);

      // Find the player object to record socket details
      const player = room.players.find(p => p.id === playerId);
      player.socketId = socket.id;

      // Create reconnect session
      const reconnectToken = createSession(sessions, playerId, playerName, room.roomId);
      player.reconnectToken = reconnectToken;
      socketToToken.set(socket.id, reconnectToken);

      socket.join(room.roomId);

      socket.emit('room_joined', {
        roomId: room.roomId,
        player,
        reconnectToken,
        room: redactGameState(room, playerId)
      });

      // Broadcast updated lobby/room details to all participants
      broadcastState(io, room);
      console.log(`Player ${playerName} (${playerId}) joined Room ${room.roomId}`);
    } catch (err) {
      sendError(err.message);
    }
  });

  // 3. Ready Toggle (For game start flow)
  socket.on('ready_toggle', ({ roomId }) => {
    try {
      const token = socketToToken.get(socket.id);
      const session = getSession(sessions, token);
      if (!session || session.roomId !== roomId) {
        return sendError('Unauthorized or invalid session');
      }

      const room = getRoom(roomId);
      if (!room) return sendError('Room not found');

      const player = room.players.find(p => p.id === session.playerId);
      if (player) {
        // Toggle ready status. Note: Host is always ready.
        if (room.hostId !== player.id) {
          player.isReady = !player.isReady;
        }
        broadcastState(io, room);
      }
    } catch (err) {
      sendError(err.message);
    }
  });

  // 4. Start Game
  socket.on('start_game', ({ roomId }) => {
    try {
      const token = socketToToken.get(socket.id);
      const session = getSession(sessions, token);
      if (!session || session.roomId !== roomId) {
        return sendError('Unauthorized or invalid session');
      }

      const room = getRoom(roomId);
      if (!room) return sendError('Room not found');

      if (room.hostId !== session.playerId) {
        return sendError('Only the host can start the game');
      }

      if (room.players.length < 2) {
        return sendError('Need at least 2 players to start a game');
      }

      // Check if everyone is ready
      const notReady = room.players.find(p => !p.isReady);
      if (notReady) {
        return sendError(`Waiting for all players to ready up (e.g. ${notReady.name})`);
      }

      // Initialize Deck & Shuffle
      let deck = room.gameMode === 'flip' ? createFlipDeck() : createDeck();
      deck = shuffleDeck(deck);

      // Deal 7 cards to each player
      const playerIds = room.players.map(p => p.id);
      const dealResult = dealCards(deck, playerIds, 7);

      room.deck = dealResult.remainingDeck;
      room.players.forEach(p => {
        p.hand = dealResult.hands[p.id] || [];
      });

      // Flip top card for discard pile (WILD_DRAW_FOUR / WILD_DRAW_TWO is returned to deck if drawn first)
      let topCard = room.deck.pop();
      if (room.gameMode === 'flip') {
        let activeFace = getActiveCardFace(topCard, 'light', room.gameMode);
        while (activeFace === 'WILD_DRAW_TWO') {
          room.deck.unshift(topCard);
          room.deck = shuffleDeck(room.deck);
          topCard = room.deck.pop();
          activeFace = getActiveCardFace(topCard, 'light', room.gameMode);
        }
      } else {
        while (topCard === 'WILD_DRAW_FOUR') {
          room.deck.unshift(topCard);
          room.deck = shuffleDeck(room.deck);
          topCard = room.deck.pop();
        }
      }
      room.discardPile.push(topCard);

      const resolvedTopFace = getActiveCardFace(topCard, 'light', room.gameMode);
      const normalizedTop = normalizeCard(resolvedTopFace);
      
      // Determine starting color
      if (normalizedTop.color === 'WILD') {
        // Pick a random starting color if top card is a standard Wild
        const colors = ['RED', 'BLUE', 'GREEN', 'YELLOW'];
        room.currentColor = colors[Math.floor(Math.random() * colors.length)];
      } else {
        room.currentColor = normalizedTop.color;
      }

      // Set starting player index
      room.currentTurn = 0;
      room.direction = 1;
      room.winner = null;
      room.pendingDraw = 0;
      room.gameStarted = true;
      room.side = 'light'; // Always start on Light side

      // Reset all Uno States
      room.players.forEach(p => {
        room.unoStates[p.id] = false;
      });

      // Apply initial opening card action effect (e.g. SKIP, SKIP_EVERYONE, REVERSE, DRAW_TWO, DRAW_ONE, DRAW_FIVE, FLIP)
      if (normalizedTop.type === 'SKIP') {
        room.currentTurn = nextTurn(room.currentTurn, room.direction, room.players.length);
      } else if (normalizedTop.type === 'SKIP_EVERYONE') {
        room.currentTurn = nextTurn(room.currentTurn, room.direction, room.players.length);
      } else if (normalizedTop.type === 'REVERSE') {
        room.direction = -room.direction;
        if (room.players.length === 2) {
          room.currentTurn = nextTurn(room.currentTurn, room.direction, room.players.length);
        } else {
          room.currentTurn = room.players.length - 1;
        }
      } else if (normalizedTop.type === 'DRAW_TWO') {
        drawPenalty(room, room.players[0].id, 2);
        room.currentTurn = nextTurn(room.currentTurn, room.direction, room.players.length);
      } else if (normalizedTop.type === 'DRAW_ONE') {
        drawPenalty(room, room.players[0].id, 1);
        room.currentTurn = nextTurn(room.currentTurn, room.direction, room.players.length);
      } else if (normalizedTop.type === 'DRAW_FIVE') {
        drawPenalty(room, room.players[0].id, 5);
        room.currentTurn = nextTurn(room.currentTurn, room.direction, room.players.length);
      } else if (normalizedTop.type === 'FLIP') {
        room.side = 'dark';
        room.deck.reverse();
        room.discardPile.reverse();
        const newTop = room.discardPile[room.discardPile.length - 1];
        const newFace = getActiveCardFace(newTop, room.side, room.gameMode);
        const newNorm = normalizeCard(newFace);
        room.currentColor = newNorm.color === 'WILD' ? 'PINK' : newNorm.color;
        room.currentTurn = 0;
      }

      room.turnStartedAt = Date.now();
      io.to(room.roomId).emit('game_started');
      broadcastState(io, room);
      startRoomTurnTimer(io, room.roomId);
      console.log(`Game started in room ${room.roomId}`);
    } catch (err) {
      sendError(err.message);
    }
  });

  // 4b. Back to Lobby (Host only)
  socket.on('back_to_lobby', ({ roomId }) => {
    try {
      const token = socketToToken.get(socket.id);
      const session = getSession(sessions, token);
      if (!session || session.roomId !== roomId) {
        return sendError('Unauthorized or invalid session');
      }

      const room = getRoom(roomId);
      if (!room) return sendError('Room not found');

      if (room.hostId !== session.playerId) {
        return sendError('Only the host can return players to the lobby');
      }

      // Reset room state for lobby
      room.gameStarted = false;
      room.winner = null;
      room.deck = [];
      room.discardPile = [];
      room.currentColor = null;
      room.pendingDraw = 0;
      room.unoCatchablePlayerId = null;
      room.drawnPlayableCard = null;
      room.pendingChallenge = null;
      
      // Reset player hands and ready status
      room.players.forEach(p => {
        p.hand = [];
        p.isReady = p.id === room.hostId; // Host is ready, others need to ready up
      });

      clearRoomTurnTimer(room.roomId);
      broadcastState(io, room);
      console.log(`Room ${room.roomId} returned to lobby by Host`);
    } catch (err) {
      sendError(err.message);
    }
  });

  // 5. Play Card
  socket.on('play_card', ({ roomId, cardId, chosenColor }) => {
    try {
      const token = socketToToken.get(socket.id);
      const session = getSession(sessions, token);
      if (!session || session.roomId !== roomId) {
        return sendError('Unauthorized or invalid session');
      }

      const room = getRoom(roomId);
      if (!room) return sendError('Room not found');

      const result = playCard(room, session.playerId, cardId, chosenColor);
      room.turnStartedAt = Date.now();
      
      broadcastState(io, room);

      if (room.winner) {
        clearRoomTurnTimer(room.roomId);
        io.to(room.roomId).emit('game_ended', { winnerId: room.winner });
        console.log(`Game won by ${session.name} in room ${room.roomId}`);
      } else {
        startRoomTurnTimer(io, room.roomId);
      }
    } catch (err) {
      sendError(err.message);
    }
  });

  // 6. Draw Card
  socket.on('draw_card', ({ roomId }) => {
    try {
      const token = socketToToken.get(socket.id);
      const session = getSession(sessions, token);
      if (!session || session.roomId !== roomId) {
        return sendError('Unauthorized or invalid session');
      }

      const room = getRoom(roomId);
      if (!room) return sendError('Room not found');

      const activePlayerBefore = room.players[room.currentTurn]?.id;
      drawCard(room, session.playerId);
      const activePlayerAfter = room.players[room.currentTurn]?.id;

      if (activePlayerBefore !== activePlayerAfter) {
        room.turnStartedAt = Date.now();
        startRoomTurnTimer(io, room.roomId);
      }
      broadcastState(io, room);
    } catch (err) {
      sendError(err.message);
    }
  });

  // 7. Pass Turn (After drawing a card)
  socket.on('pass_turn', ({ roomId }) => {
    try {
      const token = socketToToken.get(socket.id);
      const session = getSession(sessions, token);
      if (!session || session.roomId !== roomId) {
        return sendError('Unauthorized or invalid session');
      }

      const room = getRoom(roomId);
      if (!room) return sendError('Room not found');

      passTurn(room, session.playerId);
      room.turnStartedAt = Date.now();
      broadcastState(io, room);
      startRoomTurnTimer(io, room.roomId);
    } catch (err) {
      sendError(err.message);
    }
  });

  // 8. Challenge Wild Draw Four
  socket.on('challenge_wild_draw_four', ({ roomId, wantsToChallenge }) => {
    try {
      const token = socketToToken.get(socket.id);
      const session = getSession(sessions, token);
      if (!session || session.roomId !== roomId) {
        return sendError('Unauthorized or invalid session');
      }

      const room = getRoom(roomId);
      if (!room) return sendError('Room not found');

      const outcome = resolveChallenge(room, session.playerId, wantsToChallenge);
      room.turnStartedAt = Date.now();
      
      // Notify the room of the challenge outcome
      io.to(room.roomId).emit('challenge_resolved', {
        challengerId: session.playerId,
        wantsToChallenge,
        ...outcome
      });

      broadcastState(io, room);
      startRoomTurnTimer(io, room.roomId);
    } catch (err) {
      sendError(err.message);
    }
  });

  // 9. Call UNO (For oneself)
  socket.on('call_uno', ({ roomId }) => {
    try {
      const token = socketToToken.get(socket.id);
      const session = getSession(sessions, token);
      if (!session || session.roomId !== roomId) {
        return sendError('Unauthorized or invalid session');
      }

      const room = getRoom(roomId);
      if (!room) return sendError('Room not found');

      callUno(room, session.playerId);
      
      io.to(room.roomId).emit('uno_called', { playerId: session.playerId });
      broadcastState(io, room);
    } catch (err) {
      sendError(err.message);
    }
  });

  // 10. Catch Player (Who forgot to call UNO)
  socket.on('catch_uno', ({ roomId }) => {
    try {
      const token = socketToToken.get(socket.id);
      const session = getSession(sessions, token);
      if (!session || session.roomId !== roomId) {
        return sendError('Unauthorized or invalid session');
      }

      const room = getRoom(roomId);
      if (!room) return sendError('Room not found');

      const targetPlayerId = room.unoCatchablePlayerId;
      const success = catchUno(room, session.playerId);

      if (success) {
        io.to(room.roomId).emit('uno_caught', {
          caughtPlayerId: targetPlayerId,
          caughtBy: session.playerId
        });
        broadcastState(io, room);
      } else {
        socket.emit('uno_catch_failed');
      }
    } catch (err) {
      sendError(err.message);
    }
  });

  // 11. Reconnect Player
  socket.on('reconnect_player', ({ reconnectToken }) => {
    try {
      const session = getSession(sessions, reconnectToken);
      if (!session) {
        socket.emit('reconnect_failed', { message: 'Invalid or expired session token' });
        return;
      }

      const room = getRoom(session.roomId);
      if (!room) {
        socket.emit('reconnect_failed', { message: 'Room no longer exists' });
        return;
      }

      // Clear disconnect timer if any
      const timer = disconnectTimers.get(session.playerId);
      if (timer) {
        clearTimeout(timer);
        disconnectTimers.delete(session.playerId);
      }

      const player = room.players.find(p => p.id === session.playerId);
      if (!player) {
        socket.emit('reconnect_failed', { message: 'Player record not found in room' });
        return;
      }

      // Re-map socket association
      player.socketId = socket.id;
      player.isDisconnected = false;
      socketToToken.set(socket.id, reconnectToken);

      socket.join(room.roomId);

      socket.emit('reconnect_success', {
        roomId: room.roomId,
        player,
        room: redactGameState(room, player.id)
      });

      broadcastState(io, room);
      console.log(`Player ${player.name} (${player.id}) reconnected to Room ${room.roomId}`);
    } catch (err) {
      socket.emit('reconnect_failed', { message: err.message });
    }
  });

  // 12. Transfer Host
  socket.on('transfer_host', ({ roomId, targetPlayerId }) => {
    try {
      const token = socketToToken.get(socket.id);
      const session = getSession(sessions, token);
      if (!session || session.roomId !== roomId) {
        return sendError('Unauthorized or invalid session');
      }

      const room = getRoom(roomId);
      if (!room) return sendError('Room not found');

      if (room.hostId !== session.playerId) {
        return sendError('Only the host can transfer host ownership');
      }

      const target = room.players.find(p => p.id === targetPlayerId);
      if (!target || target.isDisconnected) {
        return sendError('Target player is not active in the room');
      }

      room.hostId = targetPlayerId;
      
      io.to(room.roomId).emit('host_changed', { hostId: targetPlayerId });
      broadcastState(io, room);
      console.log(`Room ${room.roomId} host transferred to ${target.name}`);
    } catch (err) {
      sendError(err.message);
    }
  });

  // 12b. Kick Player (Host only)
  socket.on('kick_player', ({ roomId, targetPlayerId }) => {
    try {
      const token = socketToToken.get(socket.id);
      const session = getSession(sessions, token);
      if (!session || session.roomId !== roomId) {
        return sendError('Unauthorized or invalid session');
      }

      const room = getRoom(roomId);
      if (!room) return sendError('Room not found');

      if (room.hostId !== session.playerId) {
        return sendError('Only the host can kick players');
      }

      if (room.gameStarted) {
        return sendError('Cannot kick players once the game has started');
      }

      if (targetPlayerId === room.hostId) {
        return sendError('Cannot kick the host');
      }

      const targetPlayerIndex = room.players.findIndex(p => p.id === targetPlayerId);
      if (targetPlayerIndex === -1) {
        return sendError('Player not found in room');
      }

      const targetPlayer = room.players[targetPlayerIndex];
      const targetSocketId = targetPlayer.socketId;
      const targetReconnectToken = targetPlayer.reconnectToken;

      console.log(`Host ${session.name} kicked player ${targetPlayer.name} (${targetPlayerId}) from room ${roomId}`);

      // If the target player has an active socket connection
      if (targetSocketId) {
        io.to(targetSocketId).emit('kicked', { message: 'You have been kicked by the host' });
        // Force the socket to leave the Room
        let targetSocket;
        if (io.sockets && io.sockets.sockets) {
          if (typeof io.sockets.sockets.get === 'function') {
            targetSocket = io.sockets.sockets.get(targetSocketId);
          } else {
            targetSocket = io.sockets.sockets[targetSocketId];
          }
        }
        if (targetSocket) {
          targetSocket.leave(roomId);
        }
        socketToToken.delete(targetSocketId);
      }

      // Remove session token
      if (targetReconnectToken) {
        removeSession(sessions, targetReconnectToken);
      }

      // Clear disconnect timer if any
      const timer = disconnectTimers.get(targetPlayerId);
      if (timer) {
        clearTimeout(timer);
        disconnectTimers.delete(targetPlayerId);
      }

      // Evict player from room state
      const updatedRoom = leaveRoom(roomId, targetPlayerId);
      if (updatedRoom) {
        broadcastState(io, updatedRoom);
      }
    } catch (err) {
      sendError(err.message);
    }
  });

  // 13. Disconnect Handling
  socket.on('disconnect', () => {
    const token = socketToToken.get(socket.id);
    if (!token) return;

    const session = getSession(sessions, token);
    if (!session) return;

    socketToToken.delete(socket.id);
    const room = getRoom(session.roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === session.playerId);
    if (!player) return;

    console.log(`Socket disconnected for player ${player.name} (${player.id})`);

    if (room.gameStarted) {
      // Mark as disconnected
      player.isDisconnected = true;
      broadcastState(io, room);

      // Start a 60-second grace window to reconnect
      const timer = setTimeout(() => {
        console.log(`Grace period expired. Evicting player ${player.name} (${player.id}) from room ${room.roomId}`);
        
        // Remove session token
        removeSession(sessions, token);
        disconnectTimers.delete(player.id);
        
        // Remove player from room
        const updatedRoom = leaveRoom(room.roomId, player.id);
        if (updatedRoom) {
          broadcastState(io, updatedRoom);
        } else {
          // Room deleted because it's empty
          clearRoomTurnTimer(room.roomId);
          console.log(`Room ${room.roomId} purged because all players left`);
        }
      }, 60000); // 60 seconds

      disconnectTimers.set(player.id, timer);
    } else {
      // If game has not started, mark player disconnected and wait 10 seconds before evicting
      player.isDisconnected = true;
      broadcastState(io, room);

      const timer = setTimeout(() => {
        console.log(`Lobby grace period expired. Evicting player ${player.name} (${player.id}) from room ${room.roomId}`);
        removeSession(sessions, token);
        disconnectTimers.delete(player.id);
        
        const updatedRoom = leaveRoom(room.roomId, player.id);
        if (updatedRoom) {
          broadcastState(io, updatedRoom);
        } else {
          // Room deleted because it's empty
          clearRoomTurnTimer(room.roomId);
          console.log(`Room ${room.roomId} purged because all players left`);
        }
      }, 10000); // 10 seconds

      disconnectTimers.set(player.id, timer);
    }
  });
}
