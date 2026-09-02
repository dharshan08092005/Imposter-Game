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

// In-memory room store
// roomCode -> Room
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

// Helper to get sanitized room state for a specific player
function getSanitizedRoomState(room, playerId) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return null;

  // Mask sensitive info
  const sanitizedPlayers = room.players.map(p => {
    const isSelf = p.id === playerId;
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
    // Secret info
    myRole: player.role,
    myWord: (!isImposter && room.state !== 'LOBBY') ? room.currentWord : null,
    myCategory: (!isImposter && room.state !== 'LOBBY') ? room.currentCategory : null,
    otherImposters: otherImposters,
    // Game over details
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
  console.log(`Socket connected: ${socket.id}`);

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
        isReady: true, // Host is ready by default
        hasSubmittedClue: false,
        votedFor: null
      }],
      settings: {
        imposterCount: 1,
        turnDuration: 20
      },
      currentWord: null,
      currentCategory: null,
      previousWords: [],
      currentPlayerTurnId: null,
      turnOrder: [],
      messages: [],
      votes: {},
      round: 0,
      eliminationOrder: []
    };

    rooms.set(code, newRoom);
    socketToPlayer.set(socket.id, { roomCode: code, name: hostName.trim() });
    socket.join(code);
    
    console.log(`Room created: ${code} by ${hostName}`);
    broadcastRoomState(code);
  });

  // Join room
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
    if (room.players.some(p => p.name.toLowerCase() === formattedName.toLowerCase())) {
      return socket.emit('errorMsg', 'Name already taken in this room.');
    }

    const newPlayer = {
      id: socket.id,
      name: formattedName,
      isHost: false,
      isAlive: true,
      role: null,
      isReady: false,
      hasSubmittedClue: false,
      votedFor: null
    };

    room.players.push(newPlayer);
    socketToPlayer.set(socket.id, { roomCode: code, name: formattedName });
    socket.join(code);

    console.log(`Player ${formattedName} joined room ${code}`);
    broadcastRoomState(code);
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
    const requiredMinPlayers = room.settings.imposterCount + 2; // Need at least (imposters + 2) to play reasonably
    if (playerCount < requiredMinPlayers) {
      return socket.emit('errorMsg', `At least ${requiredMinPlayers} players are required to start with ${room.settings.imposterCount} imposter(s).`);
    }

    // Check if all players are ready
    const unreadyPlayers = room.players.filter(p => !p.isReady);
    if (unreadyPlayers.length > 0) {
      return socket.emit('errorMsg', 'Wait for all players to be ready.');
    }

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
    // Reset all status first
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

    // Select starting player randomly
    const startIdx = Math.floor(Math.random() * room.players.length);
    room.startingPlayerId = room.players[startIdx].id;
    room.currentPlayerTurnId = room.startingPlayerId;

    // Create turn order starting from the chosen player
    const order = [];
    for (let i = 0; i < playerCount; i++) {
      const idx = (startIdx + i) % playerCount;
      order.push(room.players[idx].id);
    }
    room.turnOrder = order;

    console.log(`Game started in room ${room.code}. Word: ${word}, Imposters: ${imposters.length}`);
    broadcastRoomState(room.code);
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

    // Server-side validation to prevent revealing secret word
    if (formattedClue.toUpperCase() === room.currentWord.toUpperCase()) {
      return socket.emit('errorMsg', "You cannot directly reveal the secret word. Give another clue.");
    }

    // Record the message
    room.messages.push({
      playerId: socket.id,
      playerName: playerInfo.name,
      content: formattedClue,
      timestamp: Date.now()
    });

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.hasSubmittedClue = true;
    }

    // Advance turn to next alive player
    const currentIdx = room.turnOrder.indexOf(socket.id);
    let nextIdx = currentIdx;
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
      // Everyone alive has submitted clues. Move to VOTING.
      room.state = 'VOTING';
      room.currentPlayerTurnId = null;
      room.players.forEach(p => p.votedFor = null);
      room.votes = {};
    }

    broadcastRoomState(room.code);
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
        // Tie or no votes cast at all
        room.eliminationOrder.push({
          name: "None (Tie / Skipped)",
          role: "N/A"
        });
      }

      // Check win condition
      const aliveCrew = room.players.filter(p => p.isAlive && p.role === 'CREWMATE').length;
      const aliveImposters = room.players.filter(p => p.isAlive && p.role === 'IMPOSTER').length;

      if (aliveImposters === 0) {
        // Crewmates win
        room.state = 'GAMEOVER';
        console.log(`Room ${room.code}: Crewmates win!`);
      } else if (aliveImposters >= aliveCrew) {
        // Imposters win
        room.state = 'GAMEOVER';
        console.log(`Room ${room.code}: Imposters win!`);
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
        room.currentPlayerTurnId = randStart.id;
        room.state = 'PLAYING';
      }
    }

    broadcastRoomState(room.code);
  });

  // Play Again (Host confirms)
  socket.on('playAgain', () => {
    const playerInfo = socketToPlayer.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomCode);
    if (!room || room.hostId !== socket.id) {
      return socket.emit('errorMsg', "Only the host can trigger Play Again.");
    }

    // Reset room state back to LOBBY
    room.state = 'LOBBY';
    room.currentWord = null;
    room.currentCategory = null;
    room.currentPlayerTurnId = null;
    room.turnOrder = [];
    room.messages = [];
    room.votes = {};
    room.eliminationOrder = [];
    room.imposters = [];

    // Reset player details but preserve host status, name, and connection
    room.players.forEach(p => {
      p.isAlive = true;
      p.role = null;
      p.isReady = p.isHost; // Host is auto-ready, others need to ready-up
      p.hasSubmittedClue = false;
      p.votedFor = null;
    });

    console.log(`Room ${room.code} reset to lobby for play again.`);
    io.to(room.code).emit('playAgainNotice', {
      message: "New game starting! Returning to lobby..."
    });

    broadcastRoomState(room.code);
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
  const playerInfo = socketToPlayer.get(socket.id);
  if (!playerInfo) return;

  const { roomCode } = playerInfo;
  const room = rooms.get(roomCode);
  if (!room) return;

  // Remove player from the room list
  room.players = room.players.filter(p => p.id !== socket.id);
  socketToPlayer.delete(socket.id);

  console.log(`Player ${playerInfo.name} left room ${roomCode}`);

  if (room.players.length === 0) {
    rooms.delete(roomCode);
    console.log(`Room ${roomCode} deleted as it is empty.`);
  } else {
    // If the host left, transfer host status to another connected player
    if (room.hostId === socket.id) {
      const newHost = room.players[0];
      newHost.isHost = true;
      newHost.isReady = true; // New host becomes ready automatically
      room.hostId = newHost.id;
      console.log(`Host transferred to ${newHost.name} in room ${roomCode}`);
    }

    // If game was playing and player left, we might need to check win conditions or turns
    if (room.state === 'PLAYING') {
      // If leaving player was current turn, advance
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
          // Fallback or transition to voting
          room.state = 'VOTING';
          room.currentPlayerTurnId = null;
          room.players.forEach(p => p.votedFor = null);
          room.votes = {};
        }
      }

      // Check win conditions
      const aliveCrew = room.players.filter(p => p.isAlive && p.role === 'CREWMATE').length;
      const aliveImposters = room.players.filter(p => p.isAlive && p.role === 'IMPOSTER').length;

      if (aliveImposters === 0) {
        room.state = 'GAMEOVER';
      } else if (aliveImposters >= aliveCrew) {
        room.state = 'GAMEOVER';
      }
    } else if (room.state === 'VOTING') {
      // Re-evaluate if all votes are in after someone left
      const alivePlayers = room.players.filter(p => p.isAlive);
      const votesCast = alivePlayers.filter(p => p.votedFor !== null).length;
      if (votesCast === alivePlayers.length && alivePlayers.length > 0) {
        // Tally votes just like in submitVote
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

        if (aliveImposters === 0 || aliveImposters >= aliveCrew) {
          room.state = 'GAMEOVER';
        } else {
          room.round += 1;
          room.players.forEach(p => {
            p.hasSubmittedClue = false;
            p.votedFor = null;
          });
          const aliveOnes = room.players.filter(p => p.isAlive);
          const randStart = aliveOnes[Math.floor(Math.random() * aliveOnes.length)];
          room.currentPlayerTurnId = randStart.id;
          room.state = 'PLAYING';
        }
      }
    }

    broadcastRoomState(roomCode);
  }
}

app.get("/alive", (req, res) => {
  res.send("OK Site Alive!");
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
