const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { getRandomWord } = require('./words');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// In-memory room store: roomCode -> Room
const rooms = new Map();

// Map of socket.id -> { roomCode, name }
const socketToPlayer = new Map();

// Helper to generate 6-digit room code
function generateRoomCode() {
  let code;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms.has(code));
  return code;
}

// Helper to get available public rooms in LOBBY state
function getAvailableRooms() {
  const list = [];
  for (const [code, room] of rooms.entries()) {
    if (room.state === 'LOBBY') {
      const hostPlayer = room.players.find(p => p.id === room.hostId);
      list.push({
        code: room.code,
        hostName: hostPlayer ? hostPlayer.name : 'Host',
        playerCount: room.players.length,
        maxPlayers: 10,
        settings: room.settings
      });
    }
  }
  return list;
}

// Broadcast available rooms list to all clients
function broadcastAvailableRooms() {
  io.emit('availableRoomsUpdate', getAvailableRooms());
}

// Helper to get sanitized room state for a specific player
function getSanitizedRoomState(room, playerId) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return null;

  const isHost = room.hostId === playerId;

  // Mask sensitive info
  const sanitizedPlayers = room.players.map(p => {
    const revealRole = room.state === 'GAMEOVER' || !p.isAlive;
    return {
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      isAlive: p.isAlive,
      isReady: p.isReady,
      hasSubmittedClue: p.hasSubmittedClue,
      role: revealRole ? p.role : null,
      votedFor: room.state === 'VOTING' && p.votedFor ? 'VOTED' : (room.state === 'GAMEOVER' ? p.votedFor : null)
    };
  });

  const isImposter = player.role === 'IMPOSTER';
  const otherImposters = isImposter 
    ? room.players.filter(p => p.role === 'IMPOSTER' && p.id !== playerId).map(p => p.name)
    : [];

  // Hint for imposter if imposter came as first in round
  const isFirstInRound = (room.roundFirstPlayerId === playerId);
  let imposterHint = null;
  if (isImposter && isFirstInRound && room.state === 'PLAYING') {
    imposterHint = `The secret category is "${room.currentCategory}" (${room.currentWord ? room.currentWord.length : 0} letters).`;
  }

  // Determine winner status for GAMEOVER
  let winner = room.winner;
  if (!winner && room.state === 'GAMEOVER') {
    const aliveImposters = room.players.filter(p => p.isAlive && p.role === 'IMPOSTER').length;
    winner = (aliveImposters === 0) ? 'CREWMATE' : 'IMPOSTER';
  }

  return {
    code: room.code,
    state: room.state,
    hostId: room.hostId,
    settings: room.settings,
    players: sanitizedPlayers,
    currentPlayerTurnId: room.currentPlayerTurnId,
    turnOrder: room.turnOrder,
    messages: room.messages,
    round: room.round,
    eliminationOrder: room.eliminationOrder,
    isReviewing: !!room.isReviewing,
    reviewEndsAt: room.reviewEndsAt || null,
    // Pending requests visible only to the room host while in LOBBY
    pendingRequests: isHost && room.state === 'LOBBY' ? room.pendingRequests : [],
    // Secret info
    myRole: player.role,
    myWord: (!isImposter && room.state !== 'LOBBY') ? room.currentWord : null,
    myCategory: (!isImposter && room.state !== 'LOBBY') ? room.currentCategory : null,
    otherImposters: otherImposters,
    imposterHint: imposterHint,
    // Game over details
    winner: winner,
    winReason: room.winReason || null,
    guesserName: room.guesserName || null,
    secretWord: room.state === 'GAMEOVER' ? room.currentWord : null,
    imposterNames: room.state === 'GAMEOVER' ? room.players.filter(p => p.role === 'IMPOSTER').map(p => p.name) : [],
    votesTally: room.state === 'GAMEOVER' || room.state === 'VOTING' ? room.votes : null
  };
}

// Broadcast state to all players in a room
function broadcastRoomState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  room.players.forEach(player => {
    const state = getSanitizedRoomState(room, player.id);
    io.to(player.id).emit('roomUpdate', state);
  });
}

// Setup Socket connections
io.on('connection', (socket) => {
  // Send available rooms on initial connection
  socket.emit('availableRoomsUpdate', getAvailableRooms());

  socket.on('getAvailableRooms', () => {
    socket.emit('availableRoomsUpdate', getAvailableRooms());
  });

  // Create room
  socket.on('createRoom', (hostName) => {
    if (!hostName || typeof hostName !== 'string') {
      return socket.emit('errorMsg', 'Invalid player name.');
    }
    const code = generateRoomCode();
    const newRoom = {
      code,
      hostId: socket.id,
      state: 'LOBBY',
      players: [{
        id: socket.id,
        name: hostName.trim(),
        isHost: true,
        isAlive: true,
        role: null,
        isReady: true,
        hasSubmittedClue: false,
        votedFor: null
      }],
      pendingRequests: [],
      settings: {
        imposterCount: 1,
        turnDuration: 20
      },
      currentWord: null,
      currentCategory: null,
      previousWords: [],
      currentPlayerTurnId: null,
      roundFirstPlayerId: null,
      turnOrder: [],
      messages: [],
      votes: {},
      round: 0,
      eliminationOrder: [],
      winner: null,
      winReason: null,
      guesserName: null,
      isReviewing: false,
      reviewEndsAt: null,
      reviewTimeout: null
    };

    rooms.set(code, newRoom);
    socketToPlayer.set(socket.id, { roomCode: code, name: hostName.trim() });
    socket.join(code);
    
    broadcastRoomState(code);
    broadcastAvailableRooms();
  });

  // Join room request
  socket.on('joinRoom', ({ code, name }) => {
    if (!code || !name) {
      return socket.emit('errorMsg', 'Room code and name are required.');
    }
    const room = rooms.get(code.trim());
    if (!room) {
      return socket.emit('errorMsg', 'Room not found.');
    }
    if (room.state !== 'LOBBY') {
      return socket.emit('errorMsg', 'Game has already started.');
    }
    
    const formattedName = name.trim();
    if (room.players.some(p => p.name.toLowerCase() === formattedName.toLowerCase()) ||
        room.pendingRequests.some(r => r.name.toLowerCase() === formattedName.toLowerCase())) {
      return socket.emit('errorMsg', 'Name already taken in this room.');
    }

    if (room.players.length >= 10) {
      return socket.emit('errorMsg', 'Room is currently full (max 10 players).');
    }

    // Check if already requested
    if (room.pendingRequests.some(r => r.id === socket.id)) {
      return socket.emit('errorMsg', 'You have already requested to join this room.');
    }

    const hostPlayer = room.players.find(p => p.id === room.hostId);
    const requestItem = {
      id: socket.id,
      name: formattedName,
      requestedAt: Date.now()
    };
    room.pendingRequests.push(requestItem);

    // Notify joining player of pending state
    socket.emit('joinRequested', {
      code: room.code,
      hostName: hostPlayer ? hostPlayer.name : 'Room Head'
    });

    // Notify host of updated pending requests
    io.to(room.hostId).emit('pendingRequestsUpdate', room.pendingRequests);
    broadcastRoomState(room.code);
  });

  // Cancel join request
  socket.on('cancelJoinRequest', () => {
    for (const room of rooms.values()) {
      const idx = room.pendingRequests.findIndex(r => r.id === socket.id);
      if (idx !== -1) {
        room.pendingRequests.splice(idx, 1);
        io.to(room.hostId).emit('pendingRequestsUpdate', room.pendingRequests);
        broadcastRoomState(room.code);
      }
    }
    socket.emit('joinCancelled');
  });

  // Host responds to join request (Accept or Decline)
  socket.on('respondJoinRequest', ({ requestId, accept }) => {
    const playerInfo = socketToPlayer.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomCode);
    if (!room || room.hostId !== socket.id) return;

    const reqIdx = room.pendingRequests.findIndex(r => r.id === requestId);
    if (reqIdx === -1) return;

    const [pendingReq] = room.pendingRequests.splice(reqIdx, 1);
    io.to(room.hostId).emit('pendingRequestsUpdate', room.pendingRequests);

    if (accept) {
      if (room.state !== 'LOBBY') {
        return io.to(pendingReq.id).emit('errorMsg', 'Game has already started.');
      }
      if (room.players.length >= 10) {
        return io.to(pendingReq.id).emit('errorMsg', 'Room is now full.');
      }

      const targetSocket = io.sockets.sockets.get(pendingReq.id);
      if (!targetSocket) return; // Player disconnected

      const newPlayer = {
        id: pendingReq.id,
        name: pendingReq.name,
        isHost: false,
        isAlive: true,
        role: null,
        isReady: false,
        hasSubmittedClue: false,
        votedFor: null
      };

      room.players.push(newPlayer);
      socketToPlayer.set(pendingReq.id, { roomCode: room.code, name: pendingReq.name });
      targetSocket.join(room.code);

      targetSocket.emit('joinAccepted');
      broadcastRoomState(room.code);
      broadcastAvailableRooms();
    } else {
      io.to(pendingReq.id).emit('joinRejected', {
        message: 'The room host declined your join request.'
      });
      broadcastRoomState(room.code);
    }
  });

  // Update Settings (Host only)
  socket.on('updateSettings', (settings) => {
    const playerInfo = socketToPlayer.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomCode);
    if (!room || room.hostId !== socket.id) return;

    if (settings.imposterCount) {
      room.settings.imposterCount = Math.max(1, parseInt(settings.imposterCount) || 1);
    }
    if (settings.turnDuration) {
      room.settings.turnDuration = Math.max(5, parseInt(settings.turnDuration) || 20);
    }

    broadcastRoomState(room.code);
  });

  // Toggle ready status
  socket.on('toggleReady', () => {
    const playerInfo = socketToPlayer.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player && !player.isHost) {
      player.isReady = !player.isReady;
      broadcastRoomState(room.code);
    }
  });

  // Start game (Host only)
  socket.on('startGame', () => {
    const playerInfo = socketToPlayer.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomCode);
    if (!room || room.hostId !== socket.id) return;

    if (room.state !== 'LOBBY') return;

    const playerCount = room.players.length;
    const requiredMinPlayers = room.settings.imposterCount + 2;
    if (playerCount < requiredMinPlayers) {
      return socket.emit('errorMsg', `At least ${requiredMinPlayers} players are required to start with ${room.settings.imposterCount} imposter(s).`);
    }

    // Check if all non-host players are ready
    const unreadyPlayers = room.players.filter(p => !p.isReady);
    if (unreadyPlayers.length > 0) {
      return socket.emit('errorMsg', 'Wait for all players to be ready.');
    }

    // Reject any leftover pending requests because game is starting
    room.pendingRequests.forEach(req => {
      io.to(req.id).emit('joinRejected', { message: 'Game has already started.' });
    });
    room.pendingRequests = [];

    // Select Secret Word
    const { category, word } = getRandomWord(room.previousWords);
    room.currentWord = word;
    room.currentCategory = category;
    
    // Add to history
    room.previousWords.push(word);
    if (room.previousWords.length > 10) {
      room.previousWords.shift();
    }

    // Assign Roles
    room.players.forEach(p => {
      p.role = 'CREWMATE';
      p.isAlive = true;
      p.hasSubmittedClue = false;
      p.votedFor = null;
    });

    // Pick random imposters
    const indices = Array.from({ length: playerCount }, (_, i) => i);
    const imposters = [];
    while (imposters.length < room.settings.imposterCount && indices.length > 0) {
      const randIdx = Math.floor(Math.random() * indices.length);
      const playerIdx = indices.splice(randIdx, 1)[0];
      room.players[playerIdx].role = 'IMPOSTER';
      imposters.push(room.players[playerIdx].id);
    }

    room.imposters = imposters;
    room.state = 'PLAYING';
    room.round = 1;
    room.messages = [];
    room.votes = {};
    room.eliminationOrder = [];
    room.winner = null;
    room.winReason = null;
    room.guesserName = null;

    // Select starting player randomly
    const startIdx = Math.floor(Math.random() * room.players.length);
    room.startingPlayerId = room.players[startIdx].id;
    room.roundFirstPlayerId = room.startingPlayerId;
    room.currentPlayerTurnId = room.startingPlayerId;

    // Create turn order starting from the chosen player
    const order = [];
    for (let i = 0; i < playerCount; i++) {
      const idx = (startIdx + i) % playerCount;
      order.push(room.players[idx].id);
    }
    room.turnOrder = order;

    broadcastRoomState(room.code);
    broadcastAvailableRooms();
  });

  // Submit clue
  socket.on('submitClue', (clueText) => {
    const playerInfo = socketToPlayer.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomCode);
    if (!room || room.state !== 'PLAYING') return;

    if (room.currentPlayerTurnId !== socket.id) {
      return socket.emit('errorMsg', "It's not your turn!");
    }

    const formattedClue = clueText.trim();
    if (!formattedClue) {
      return socket.emit('errorMsg', "Clue cannot be empty.");
    }

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const isMatch = formattedClue.toUpperCase().replace(/\s+/g, ' ') === room.currentWord.toUpperCase().replace(/\s+/g, ' ');

    // If IMPOSTER guesses the correct word in clue -> IMPOSTER WINS IMMEDIATELY!
    if (player.role === 'IMPOSTER' && isMatch) {
      room.state = 'GAMEOVER';
      room.winner = 'IMPOSTER';
      room.winReason = 'GUESS';
      room.guesserName = player.name;
      broadcastRoomState(room.code);
      broadcastAvailableRooms();
      return;
    }

    // Server-side validation to prevent crewmates directly revealing secret word
    if (isMatch) {
      return socket.emit('errorMsg', "You cannot directly reveal the secret word. Give another clue.");
    }

    // Record the message
    room.messages.push({
      playerId: socket.id,
      playerName: playerInfo.name,
      content: formattedClue,
      timestamp: Date.now()
    });

    player.hasSubmittedClue = true;

    // Advance turn to next alive player
    const currentIdx = room.turnOrder.indexOf(socket.id);
    let nextPlayer = null;

    for (let i = 1; i <= room.turnOrder.length; i++) {
      const checkIdx = (currentIdx + i) % room.turnOrder.length;
      const pId = room.turnOrder[checkIdx];
      const p = room.players.find(pl => pl.id === pId);
      if (p && p.isAlive && !p.hasSubmittedClue) {
        nextPlayer = p;
        break;
      }
    }

    if (nextPlayer) {
      room.currentPlayerTurnId = nextPlayer.id;
      broadcastRoomState(room.code);
    } else {
      // Everyone alive has submitted clues. Give players 5 seconds to review clues before voting!
      room.currentPlayerTurnId = null;
      room.isReviewing = true;
      room.reviewEndsAt = Date.now() + 5000;
      broadcastRoomState(room.code);

      if (room.reviewTimeout) {
        clearTimeout(room.reviewTimeout);
      }

      room.reviewTimeout = setTimeout(() => {
        const curRoom = rooms.get(room.code);
        if (!curRoom || curRoom.state !== 'PLAYING') return;

        curRoom.isReviewing = false;
        curRoom.reviewEndsAt = null;
        curRoom.reviewTimeout = null;

        curRoom.state = 'VOTING';
        curRoom.currentPlayerTurnId = null;
        curRoom.players.forEach(p => p.votedFor = null);
        curRoom.votes = {};
        broadcastRoomState(curRoom.code);
      }, 5000);
    }
  });

  // Dedicated Imposter Guess Action
  socket.on('imposterGuessWord', (guessText) => {
    const playerInfo = socketToPlayer.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomCode);
    if (!room || (room.state !== 'PLAYING' && room.state !== 'VOTING')) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isAlive || player.role !== 'IMPOSTER') {
      return socket.emit('errorMsg', "Only an active Imposter can guess the secret word.");
    }

    if (!guessText || typeof guessText !== 'string') {
      return socket.emit('errorMsg', "Please enter a valid guess.");
    }

    const formattedGuess = guessText.trim().toUpperCase().replace(/\s+/g, ' ');
    const targetWord = room.currentWord.toUpperCase().replace(/\s+/g, ' ');

    if (formattedGuess === targetWord) {
      // Imposters win immediately!
      room.state = 'GAMEOVER';
      room.winner = 'IMPOSTER';
      room.winReason = 'GUESS';
      room.guesserName = player.name;
      broadcastRoomState(room.code);
      broadcastAvailableRooms();
    } else {
      // Incorrect guess! Imposter is eliminated
      player.isAlive = false;
      room.eliminationOrder.push({
        name: player.name,
        role: 'IMPOSTER'
      });

      const aliveCrew = room.players.filter(p => p.isAlive && p.role === 'CREWMATE').length;
      const aliveImposters = room.players.filter(p => p.isAlive && p.role === 'IMPOSTER').length;

      if (aliveImposters === 0) {
        room.state = 'GAMEOVER';
        room.winner = 'CREWMATE';
        room.winReason = 'ALL_IMPOSTERS_ELIMINATED';
      } else if (aliveImposters >= aliveCrew) {
        room.state = 'GAMEOVER';
        room.winner = 'IMPOSTER';
      } else {
        // If it was this player's turn in PLAYING, advance turn
        if (room.state === 'PLAYING' && room.currentPlayerTurnId === socket.id) {
          const currentIdx = room.turnOrder.indexOf(socket.id);
          let nextPlayer = null;
          for (let i = 1; i <= room.turnOrder.length; i++) {
            const checkIdx = (currentIdx + i) % room.turnOrder.length;
            const pId = room.turnOrder[checkIdx];
            const p = room.players.find(pl => pl.id === pId);
            if (p && p.isAlive && !p.hasSubmittedClue) {
              nextPlayer = p;
              break;
            }
          }
          if (nextPlayer) {
            room.currentPlayerTurnId = nextPlayer.id;
          } else {
            room.state = 'VOTING';
            room.currentPlayerTurnId = null;
            room.players.forEach(p => p.votedFor = null);
            room.votes = {};
          }
        }
      }

      socket.emit('guessResult', {
        success: false,
        message: `Incorrect guess! "${guessText.trim()}" was not the secret word.`
      });
      broadcastRoomState(room.code);
      broadcastAvailableRooms();
    }
  });

  // Submit vote
  socket.on('submitVote', (votedPlayerId) => {
    const playerInfo = socketToPlayer.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomCode);
    if (!room || room.state !== 'VOTING') return;

    const voter = room.players.find(p => p.id === socket.id);
    if (!voter || !voter.isAlive || voter.votedFor) return;

    const target = room.players.find(p => p.id === votedPlayerId);
    if (!target || !target.isAlive) {
      return socket.emit('errorMsg', "Invalid vote target.");
    }

    voter.votedFor = votedPlayerId;
    room.votes[votedPlayerId] = (room.votes[votedPlayerId] || 0) + 1;

    // Check if all alive players have voted
    const alivePlayers = room.players.filter(p => p.isAlive);
    const votesCast = alivePlayers.filter(p => p.votedFor !== null).length;

    if (votesCast === alivePlayers.length) {
      // Tally votes and eliminate
      let maxVotes = -1;
      let eliminatedId = null;
      let isTie = false;

      alivePlayers.forEach(p => {
        const count = room.votes[p.id] || 0;
        if (count > maxVotes) {
          maxVotes = count;
          eliminatedId = p.id;
          isTie = false;
        } else if (count === maxVotes && count > 0) {
          isTie = true;
        }
      });

      if (!isTie && eliminatedId) {
        const eliminatedPlayer = room.players.find(p => p.id === eliminatedId);
        eliminatedPlayer.isAlive = false;
        room.eliminationOrder.push({
          name: eliminatedPlayer.name,
          role: eliminatedPlayer.role
        });
      } else {
        room.eliminationOrder.push({
          name: "None (Tie / Skipped)",
          role: "N/A"
        });
      }

      // Check win condition
      const aliveCrew = room.players.filter(p => p.isAlive && p.role === 'CREWMATE').length;
      const aliveImposters = room.players.filter(p => p.isAlive && p.role === 'IMPOSTER').length;

      if (aliveImposters === 0) {
        room.state = 'GAMEOVER';
        room.winner = 'CREWMATE';
      } else if (aliveImposters >= aliveCrew) {
        room.state = 'GAMEOVER';
        room.winner = 'IMPOSTER';
      } else {
        // Game continues -> start new round
        room.round += 1;
        room.players.forEach(p => {
          p.hasSubmittedClue = false;
          p.votedFor = null;
        });
        
        // Pick new starting player among remaining alive players
        const aliveOnes = room.players.filter(p => p.isAlive);
        const randStart = aliveOnes[Math.floor(Math.random() * aliveOnes.length)];
        room.roundFirstPlayerId = randStart.id;
        room.currentPlayerTurnId = randStart.id;
        room.state = 'PLAYING';
      }
    }

    broadcastRoomState(room.code);
    if (room.state === 'GAMEOVER') {
      broadcastAvailableRooms();
    }
  });

  // Play Again (Host confirms)
  socket.on('playAgain', () => {
    const playerInfo = socketToPlayer.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomCode);
    if (!room || room.hostId !== socket.id) {
      return socket.emit('errorMsg', "Only the host can trigger Play Again.");
    }

    room.state = 'LOBBY';
    room.currentWord = null;
    room.currentCategory = null;
    room.currentPlayerTurnId = null;
    room.roundFirstPlayerId = null;
    room.turnOrder = [];
    room.messages = [];
    room.votes = {};
    room.eliminationOrder = [];
    room.imposters = [];
    room.winner = null;
    room.winReason = null;
    room.guesserName = null;
    if (room.reviewTimeout) {
      clearTimeout(room.reviewTimeout);
      room.reviewTimeout = null;
    }
    room.isReviewing = false;
    room.reviewEndsAt = null;

    room.players.forEach(p => {
      p.isAlive = true;
      p.role = null;
      p.isReady = p.isHost;
      p.hasSubmittedClue = false;
      p.votedFor = null;
    });

    io.to(room.code).emit('playAgainNotice', {
      message: "New game starting! Returning to lobby..."
    });

    broadcastRoomState(room.code);
    broadcastAvailableRooms();
  });

  // Leave room
  socket.on('leaveRoom', () => {
    handlePlayerLeaving(socket);
  });

  // Disconnect
  socket.on('disconnect', () => {
    handlePlayerLeaving(socket);
  });
});

function handlePlayerLeaving(socket) {
  // First, check if socket has any pending join requests in any room and clean up
  for (const room of rooms.values()) {
    const idx = room.pendingRequests.findIndex(r => r.id === socket.id);
    if (idx !== -1) {
      room.pendingRequests.splice(idx, 1);
      io.to(room.hostId).emit('pendingRequestsUpdate', room.pendingRequests);
      broadcastRoomState(room.code);
    }
  }

  const playerInfo = socketToPlayer.get(socket.id);
  if (!playerInfo) return;

  const { roomCode } = playerInfo;
  const room = rooms.get(roomCode);
  if (!room) return;

  room.players = room.players.filter(p => p.id !== socket.id);
  socketToPlayer.delete(socket.id);

  if (room.players.length === 0) {
    if (room.reviewTimeout) {
      clearTimeout(room.reviewTimeout);
      room.reviewTimeout = null;
    }
    // Notify any remaining pending requests
    room.pendingRequests.forEach(req => {
      io.to(req.id).emit('joinRejected', { message: 'Room has been closed.' });
    });
    rooms.delete(roomCode);
    broadcastAvailableRooms();
  } else {
    // If the host left, transfer host status to another connected player
    if (room.hostId === socket.id) {
      const newHost = room.players[0];
      newHost.isHost = true;
      newHost.isReady = true;
      room.hostId = newHost.id;
      // Update pending requests for the new host
      io.to(newHost.id).emit('pendingRequestsUpdate', room.pendingRequests);
    }

    if (room.state === 'PLAYING') {
      if (room.currentPlayerTurnId === socket.id) {
        const currentIdx = room.turnOrder.indexOf(socket.id);
        let nextPlayer = null;
        for (let i = 1; i <= room.turnOrder.length; i++) {
          const checkIdx = (currentIdx + i) % room.turnOrder.length;
          const pId = room.turnOrder[checkIdx];
          const p = room.players.find(pl => pl.id === pId);
          if (p && p.isAlive && !p.hasSubmittedClue) {
            nextPlayer = p;
            break;
          }
        }
        if (nextPlayer) {
          room.currentPlayerTurnId = nextPlayer.id;
        } else {
          room.state = 'VOTING';
          room.currentPlayerTurnId = null;
          room.players.forEach(p => p.votedFor = null);
          room.votes = {};
        }
      }

      const aliveCrew = room.players.filter(p => p.isAlive && p.role === 'CREWMATE').length;
      const aliveImposters = room.players.filter(p => p.isAlive && p.role === 'IMPOSTER').length;

      if (aliveImposters === 0) {
        room.state = 'GAMEOVER';
        room.winner = 'CREWMATE';
      } else if (aliveImposters >= aliveCrew) {
        room.state = 'GAMEOVER';
        room.winner = 'IMPOSTER';
      }
    } else if (room.state === 'VOTING') {
      const alivePlayers = room.players.filter(p => p.isAlive);
      const votesCast = alivePlayers.filter(p => p.votedFor !== null).length;
      if (votesCast === alivePlayers.length && alivePlayers.length > 0) {
        let maxVotes = -1;
        let eliminatedId = null;
        let isTie = false;

        alivePlayers.forEach(p => {
          const count = room.votes[p.id] || 0;
          if (count > maxVotes) {
            maxVotes = count;
            eliminatedId = p.id;
            isTie = false;
          } else if (count === maxVotes && count > 0) {
            isTie = true;
          }
        });

        if (!isTie && eliminatedId) {
          const eliminatedPlayer = room.players.find(p => p.id === eliminatedId);
          eliminatedPlayer.isAlive = false;
          room.eliminationOrder.push({
            name: eliminatedPlayer.name,
            role: eliminatedPlayer.role
          });
        } else {
          room.eliminationOrder.push({
            name: "None (Tie / Skipped)",
            role: "N/A"
          });
        }

        const aliveCrew = room.players.filter(p => p.isAlive && p.role === 'CREWMATE').length;
        const aliveImposters = room.players.filter(p => p.isAlive && p.role === 'IMPOSTER').length;

        if (aliveImposters === 0) {
          room.state = 'GAMEOVER';
          room.winner = 'CREWMATE';
        } else if (aliveImposters >= aliveCrew) {
          room.state = 'GAMEOVER';
          room.winner = 'IMPOSTER';
        } else {
          room.round += 1;
          room.players.forEach(p => {
            p.hasSubmittedClue = false;
            p.votedFor = null;
          });
          const aliveOnes = room.players.filter(p => p.isAlive);
          const randStart = aliveOnes[Math.floor(Math.random() * aliveOnes.length)];
          room.roundFirstPlayerId = randStart.id;
          room.currentPlayerTurnId = randStart.id;
          room.state = 'PLAYING';
        }
      }
    }

    broadcastRoomState(roomCode);
    broadcastAvailableRooms();
  }
}

app.get("/alive", (req, res) => {
  res.send("OK Site Alive!");
});

if (require.main === module) {
  server.listen(PORT);
}

module.exports = { app, server, io, rooms, socketToPlayer, getAvailableRooms };
