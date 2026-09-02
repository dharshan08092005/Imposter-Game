// Connect to socket.io
const socket = io();

// Client State
let localPlayerId = null;
let currentRoom = null;

// Screen DOM Elements
const screens = {
  landing: document.getElementById('landing-screen'),
  lobby: document.getElementById('lobby-screen'),
  game: document.getElementById('game-screen'),
  voting: document.getElementById('voting-screen'),
  gameover: document.getElementById('gameover-screen'),
};

// UI DOM Elements
const elNameInput = document.getElementById('player-name');
const elCreateBtn = document.getElementById('create-room-btn');
const elRoomCodeInput = document.getElementById('room-code-input');
const elJoinBtn = document.getElementById('join-room-btn');

const elLobbyCodeDisplay = document.getElementById('lobby-code-display');
const elLobbyPlayersContainer = document.getElementById('lobby-players-container');
const elPlayerCount = document.getElementById('player-count');
const elSettingImposters = document.getElementById('setting-imposters');
const elSettingDuration = document.getElementById('setting-duration');
const elLobbyReadyBtn = document.getElementById('lobby-ready-btn');
const elLobbyStartBtn = document.getElementById('lobby-start-btn');
const elLobbyLeaveBtn = document.getElementById('lobby-leave-btn');

const elGameRound = document.getElementById('game-round-display');
const elCurrentTurnPlayer = document.getElementById('current-turn-player-name');
const elRoleDisplayContainer = document.getElementById('role-display-container');
const elClueInputPanel = document.getElementById('clue-input-panel');
const elClueTextInput = document.getElementById('clue-text-input');
const elSubmitClueBtn = document.getElementById('submit-clue-btn');
const elClueErrorMsg = document.getElementById('clue-error-msg');
const elCluesLogContainer = document.getElementById('clues-log-container');
const elGameLeaveBtn = document.getElementById('game-leave-btn');

const elVotingPlayersGrid = document.getElementById('voting-players-grid');
const elVotingStatusText = document.getElementById('voting-status-text');

const elWinnerAnnouncement = document.getElementById('winner-announcement');
const elRevealedSecretWord = document.getElementById('revealed-secret-word');
const elRevealedImpostersList = document.getElementById('revealed-imposters-list');
const elEliminationTableBody = document.getElementById('elimination-table-body');
const elSummaryRounds = document.getElementById('summary-rounds');
const elSummaryPlayers = document.getElementById('summary-players');
const elNonHostPlayAgainMsg = document.getElementById('non-host-play-again-msg');
const elHostPlayAgainBtn = document.getElementById('host-play-again-btn');
const elReturnHomeBtn = document.getElementById('return-home-btn');

const elConfirmDialog = document.getElementById('confirmation-dialog');
const elConfirmCancelBtn = document.getElementById('confirm-cancel-btn');
const elConfirmOkBtn = document.getElementById('confirm-ok-btn');

const elToastContainer = document.getElementById('toast-container');

// Helper to switch active screen
function showScreen(screenKey) {
  Object.keys(screens).forEach(key => {
    if (key === screenKey) {
      screens[key].classList.add('active');
    } else {
      screens[key].classList.remove('active');
    }
  });
}

// Toast Notifications
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  elToastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// Socket Connection Events
socket.on('connect', () => {
  localPlayerId = socket.id;
  console.log('Connected with local player ID:', localPlayerId);
});

socket.on('errorMsg', (msg) => {
  showToast(msg, 'error');
  // If there's a clue validation error specifically
  if (currentRoom && currentRoom.state === 'PLAYING') {
    elClueErrorMsg.textContent = msg;
    elClueErrorMsg.style.display = 'block';
  }
});

socket.on('playAgainNotice', (data) => {
  showToast(data.message, 'notice');
});

// Primary State Sync Handler
socket.on('roomUpdate', (roomState) => {
  if (!roomState) {
    // If room is invalid, return to landing
    currentRoom = null;
    showScreen('landing');
    return;
  }

  currentRoom = roomState;
  const isHost = roomState.hostId === localPlayerId;
  const myPlayerObj = roomState.players.find(p => p.id === localPlayerId);

  // 1. Navigation / Screen Switching
  if (roomState.state === 'LOBBY') {
    showScreen('lobby');
    renderLobby(roomState, isHost, myPlayerObj);
  } else if (roomState.state === 'PLAYING') {
    showScreen('game');
    renderGame(roomState, myPlayerObj);
  } else if (roomState.state === 'VOTING') {
    showScreen('voting');
    renderVoting(roomState, myPlayerObj);
  } else if (roomState.state === 'GAMEOVER') {
    showScreen('gameover');
    renderGameOver(roomState, isHost);
  }
});

// Render Screens Detail Functions

function renderLobby(room, isHost, self) {
  elLobbyCodeDisplay.textContent = room.code;
  elPlayerCount.textContent = room.players.length;

  // Render player cards
  elLobbyPlayersContainer.innerHTML = '';
  room.players.forEach(p => {
    const card = document.createElement('div');
    card.className = 'player-lobby-card';
    
    const info = document.createElement('div');
    info.className = 'player-info-name';
    if (p.isHost) {
      info.innerHTML = `👑 ${p.name}`;
    } else {
      info.textContent = p.name;
    }
    if (p.id === localPlayerId) {
      info.innerHTML += ' <span style="font-size:0.75rem; color:var(--text-dim)">(You)</span>';
    }

    const state = document.createElement('div');
    state.className = `ready-indicator ${p.isReady ? 'ready' : 'not-ready'}`;
    state.textContent = p.isReady ? 'READY' : 'WAITING';

    card.appendChild(info);
    card.appendChild(state);
    elLobbyPlayersContainer.appendChild(card);
  });

  // Host configuration inputs enabling/disabling
  elSettingImposters.disabled = !isHost;
  elSettingDuration.disabled = !isHost;

  // Sync settings values
  elSettingImposters.value = room.settings.imposterCount;
  elSettingDuration.value = room.settings.turnDuration;

  // Actions visibility
  if (isHost) {
    elLobbyReadyBtn.style.display = 'none';
    elLobbyStartBtn.style.display = 'block';
  } else {
    elLobbyReadyBtn.style.display = 'block';
    elLobbyStartBtn.style.display = 'none';
    elLobbyReadyBtn.textContent = self && self.isReady ? 'Cancel Ready' : 'Ready Up';
    elLobbyReadyBtn.className = `btn btn-full ${self && self.isReady ? 'btn-secondary' : 'btn-primary btn-glow'}`;
  }
}

function renderGame(room, self) {
  elGameRound.textContent = room.round;
  
  // Find current player name
  const currentTurnPlayer = room.players.find(p => p.id === room.currentPlayerTurnId);
  elCurrentTurnPlayer.textContent = currentTurnPlayer ? currentTurnPlayer.name : '...';

  // Toggle Turn indicators styling
  if (room.currentPlayerTurnId === localPlayerId) {
    document.getElementById('turn-badge').className = 'badge badge-warning animate-pulse';
  } else {
    document.getElementById('turn-badge').className = 'badge';
  }

  // Render Role & Secret Info
  elRoleDisplayContainer.innerHTML = '';
  const roleCard = document.createElement('div');
  
  if (room.myRole === 'IMPOSTER') {
    roleCard.className = 'role-banner role-banner-imposter';
    
    let otherImpostersText = '';
    if (room.otherImposters && room.otherImposters.length > 0) {
      otherImpostersText = `<div class="other-imposters-panel">Other Imposters: • ${room.otherImposters.join(', ')}</div>`;
    }
    
    roleCard.innerHTML = `
      <div>
        <div class="role-title imposter-text">🔴 YOU ARE THE IMPOSTER</div>
        <div class="role-desc">You don't know the secret word. Listen carefully to everyone's clues and try to figure it out. Don't get caught.</div>
        ${otherImpostersText}
      </div>
    `;
  } else {
    roleCard.className = 'role-banner role-banner-crewmate';
    roleCard.innerHTML = `
      <div>
        <div class="role-title crewmate-text">🔵 YOU ARE A CREWMATE</div>
        <div class="role-desc">Give a clue without making it too obvious. Category: <strong>${room.myCategory || 'General'}</strong></div>
      </div>
      <div class="word-reveal-box">
        <span class="word-label">Secret Word</span>
        <span class="word-val">${room.myWord || '----'}</span>
      </div>
    `;
  }
  elRoleDisplayContainer.appendChild(roleCard);

  // Turn-based Clue Form visibility
  if (room.currentPlayerTurnId === localPlayerId) {
    elClueInputPanel.style.display = 'block';
    elClueErrorMsg.style.display = 'none';
    elClueTextInput.value = '';
    
    const clueInstruction = document.getElementById('clue-instruction-text');
    if (room.myRole === 'CREWMATE') {
      clueInstruction.textContent = "💡 Give a clue without directly saying the word.";
    } else {
      clueInstruction.textContent = "🤫 Listen carefully to clues and pretend you know the word!";
    }
  } else {
    elClueInputPanel.style.display = 'none';
  }

  // Render Clue list
  elCluesLogContainer.innerHTML = '';
  if (room.messages.length === 0) {
    elCluesLogContainer.innerHTML = '<div style="color:var(--text-dim); text-align:center; padding: 1.5rem 0;">No clues submitted yet this round...</div>';
  } else {
    // Show in chronological order
    room.messages.forEach(msg => {
      const bubble = document.createElement('div');
      bubble.className = 'clue-bubble';
      
      const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      const isSelf = msg.playerId === localPlayerId;
      
      bubble.innerHTML = `
        <div class="clue-bubble-header">
          <span class="clue-bubble-author">${msg.playerName} ${isSelf ? '(You)' : ''}</span>
          <span class="clue-bubble-time">${timeStr}</span>
        </div>
        <div class="clue-bubble-body">${escapeHtml(msg.content)}</div>
      `;
      elCluesLogContainer.appendChild(bubble);
    });
    // Auto scroll to bottom
    elCluesLogContainer.scrollTop = elCluesLogContainer.scrollHeight;
  }
}

function renderVoting(room, self) {
  elVotingPlayersGrid.innerHTML = '';
  
  // Instructions
  const hasVoted = self && self.votedFor !== null;
  elVotingStatusText.textContent = hasVoted 
    ? "Vote submitted! Waiting for other players..." 
    : "Cast your vote by selecting a player card.";

  room.players.forEach(p => {
    const item = document.createElement('div');
    item.className = 'vote-item';
    
    if (!p.isAlive) {
      item.classList.add('dead');
    }
    
    if (hasVoted) {
      item.classList.add('disabled');
      if (self.votedFor === p.id) {
        item.classList.add('selected');
      }
    }

    const name = document.createElement('div');
    name.className = 'vote-player-name';
    name.textContent = p.name;
    if (p.id === localPlayerId) {
      name.innerHTML += ' <span style="font-size:0.7rem; color:var(--text-dim)">(You)</span>';
    }

    const status = document.createElement('div');
    status.className = 'vote-status-indicator';
    if (!p.isAlive) {
      status.textContent = 'ELIMINATED';
      status.style.color = 'var(--danger)';
    } else {
      status.textContent = p.votedFor ? 'Voted' : 'Voting...';
      if (p.votedFor) {
        status.classList.add('voted');
      }
    }

    item.appendChild(name);
    item.appendChild(status);

    if (p.isAlive && !hasVoted && p.id !== localPlayerId && self.isAlive) {
      item.addEventListener('click', () => {
        socket.emit('submitVote', p.id);
      });
    }

    elVotingPlayersGrid.appendChild(item);
  });
}

function renderGameOver(room, isHost) {
  // Check winner
  // We can look at player statuses or just trust room details or check if crewmates won
  // Wait, let's tally crew vs imposter to declare or just display room.state wins if backend logs.
  // Actually, we can check how many imposters are alive. If 0, crewmates win.
  const aliveImposters = room.players.filter(p => p.isAlive && p.role === 'IMPOSTER').length;
  const crewmatesWin = aliveImposters === 0;

  elWinnerAnnouncement.textContent = crewmatesWin ? '🔵 CREWMATES WIN' : '🔴 IMPOSTERS WIN';
  elWinnerAnnouncement.className = `winner-title ${crewmatesWin ? 'crew-win' : 'imposter-win'}`;

  // Reveal secret word
  elRevealedSecretWord.textContent = room.secretWord || '----';

  // Reveal imposters
  elRevealedImpostersList.innerHTML = '';
  room.imposterNames.forEach(name => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = name;
    elRevealedImpostersList.appendChild(tag);
  });

  // Render Elimination table
  elEliminationTableBody.innerHTML = '';
  if (room.eliminationOrder.length === 0) {
    elEliminationTableBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No players were eliminated!</td></tr>';
  } else {
    room.eliminationOrder.forEach((entry, idx) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${idx + 1}</td>
        <td><strong>${entry.name}</strong></td>
        <td>
          <span class="badge ${entry.role === 'IMPOSTER' ? 'badge-danger' : (entry.role === 'CREWMATE' ? 'badge-accent' : '')}">
            ${entry.role || 'N/A'}
          </span>
        </td>
      `;
      elEliminationTableBody.appendChild(row);
    });
  }

  // Summary Metrics
  elSummaryRounds.textContent = room.round;
  elSummaryPlayers.textContent = room.players.length;

  // Actions based on Host
  if (isHost) {
    elHostPlayAgainBtn.style.display = 'block';
    elNonHostPlayAgainMsg.style.display = 'none';
  } else {
    elHostPlayAgainBtn.style.display = 'none';
    elNonHostPlayAgainMsg.style.display = 'block';
  }
}

// Helpers
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// DOM Event Listeners

// Host game
elCreateBtn.addEventListener('click', () => {
  const name = elNameInput.value.trim();
  if (!name) {
    return showToast('Please enter your name to create a game.', 'error');
  }
  socket.emit('createRoom', name);
});

// Join game
elJoinBtn.addEventListener('click', () => {
  const name = elNameInput.value.trim();
  const code = elRoomCodeInput.value.trim();
  if (!name || !code) {
    return showToast('Please enter both your name and room code.', 'error');
  }
  socket.emit('joinRoom', { code, name });
});

// Host settings real-time update
function onSettingsChange() {
  socket.emit('updateSettings', {
    imposterCount: parseInt(elSettingImposters.value),
    turnDuration: parseInt(elSettingDuration.value)
  });
}
elSettingImposters.addEventListener('change', onSettingsChange);
elSettingDuration.addEventListener('change', onSettingsChange);

// Ready toggle
elLobbyReadyBtn.addEventListener('click', () => {
  socket.emit('toggleReady');
});

// Host starts game
elLobbyStartBtn.addEventListener('click', () => {
  socket.emit('startGame');
});

// Submitting clue
elSubmitClueBtn.addEventListener('click', () => {
  const clue = elClueTextInput.value.trim();
  if (!clue) {
    return showToast('Please type a clue before submitting.', 'error');
  }
  socket.emit('submitClue', clue);
});

elClueTextInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    elSubmitClueBtn.click();
  }
});

// Leaving Game/Lobby
function leaveCurrentRoom() {
  socket.emit('leaveRoom');
  showScreen('landing');
  currentRoom = null;
}
elLobbyLeaveBtn.addEventListener('click', leaveCurrentRoom);
elGameLeaveBtn.addEventListener('click', leaveCurrentRoom);
elReturnHomeBtn.addEventListener('click', leaveCurrentRoom);

// Play Again Flow (Host triggers confirmation modal)
elHostPlayAgainBtn.addEventListener('click', () => {
  elConfirmDialog.classList.add('active');
});

elConfirmCancelBtn.addEventListener('click', () => {
  elConfirmDialog.classList.remove('active');
});

elConfirmOkBtn.addEventListener('click', () => {
  elConfirmDialog.classList.remove('active');
  socket.emit('playAgain');
});
