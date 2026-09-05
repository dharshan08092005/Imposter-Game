// Silence all console logging in client browser
['log', 'info', 'warn', 'error', 'debug', 'trace'].forEach(method => {
  console[method] = () => {};
});

// Connect to socket.io
const socket = io();

// Client State
let localPlayerId = null;
let currentRoom = null;
let pendingJoinCode = null;

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
const elRefreshRoomsBtn = document.getElementById('refresh-rooms-btn');
const elAvailableRoomsContainer = document.getElementById('available-rooms-container');

// Lobby Elements
const elLobbyCodeDisplay = document.getElementById('lobby-code-display');
const elLobbyPlayersContainer = document.getElementById('lobby-players-container');
const elPlayerCount = document.getElementById('player-count');
const elSettingImposters = document.getElementById('setting-imposters');
const elSettingDuration = document.getElementById('setting-duration');
const elLobbyReadyBtn = document.getElementById('lobby-ready-btn');
const elLobbyStartBtn = document.getElementById('lobby-start-btn');
const elLobbyLeaveBtn = document.getElementById('lobby-leave-btn');

// Host Requests Panel Elements
const elLobbyRequestsPanel = document.getElementById('lobby-requests-panel');
const elRequestsCount = document.getElementById('requests-count');
const elRequestsList = document.getElementById('requests-list');

// Game Screen Elements
const elGameRound = document.getElementById('game-round-display');
const elCurrentTurnPlayer = document.getElementById('current-turn-player-name');
const elRoleDisplayContainer = document.getElementById('role-display-container');
const elRoundReviewBanner = document.getElementById('round-review-banner');
const elReviewRoundNum = document.getElementById('review-round-num');
const elReviewTimerSeconds = document.getElementById('review-timer-seconds');
const elClueInputPanel = document.getElementById('clue-input-panel');
const elClueTextInput = document.getElementById('clue-text-input');
const elSubmitClueBtn = document.getElementById('submit-clue-btn');
const elClueErrorMsg = document.getElementById('clue-error-msg');
const elCluesLogContainer = document.getElementById('clues-log-container');
const elGameLeaveBtn = document.getElementById('game-leave-btn');
const elImposterOpenGuessBtn = document.getElementById('imposter-open-guess-btn');
const elVotingOpenGuessBtn = document.getElementById('voting-open-guess-btn');

// Voting Screen Elements
const elVotingPlayersGrid = document.getElementById('voting-players-grid');
const elVotingStatusText = document.getElementById('voting-status-text');
const elVotingCluesContainer = document.getElementById('voting-clues-container');

let reviewInterval = null;

// Game Over Screen Elements
const elWinnerAnnouncement = document.getElementById('winner-announcement');
const elGameOverReasonBanner = document.getElementById('gameover-reason-banner');
const elRevealedSecretWord = document.getElementById('revealed-secret-word');
const elRevealedImpostersList = document.getElementById('revealed-imposters-list');
const elEliminationTableBody = document.getElementById('elimination-table-body');
const elSummaryRounds = document.getElementById('summary-rounds');
const elSummaryPlayers = document.getElementById('summary-players');
const elNonHostPlayAgainMsg = document.getElementById('non-host-play-again-msg');
const elHostPlayAgainBtn = document.getElementById('host-play-again-btn');
const elReturnHomeBtn = document.getElementById('return-home-btn');

// Dialog Elements
const elConfirmDialog = document.getElementById('confirmation-dialog');
const elConfirmCancelBtn = document.getElementById('confirm-cancel-btn');
const elConfirmOkBtn = document.getElementById('confirm-ok-btn');

const elJoinWaitingDialog = document.getElementById('join-waiting-dialog');
const elWaitingHostName = document.getElementById('waiting-host-name');
const elWaitingRoomCode = document.getElementById('waiting-room-code');
const elCancelJoinRequestBtn = document.getElementById('cancel-join-request-btn');

const elImposterGuessDialog = document.getElementById('imposter-guess-dialog');
const elImposterGuessInput = document.getElementById('imposter-guess-input');
const elImposterGuessCancelBtn = document.getElementById('imposter-guess-cancel-btn');
const elImposterGuessSubmitBtn = document.getElementById('imposter-guess-submit-btn');

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
  socket.emit('getAvailableRooms');
});

socket.on('errorMsg', (msg) => {
  showToast(msg, 'error');
  if (currentRoom && currentRoom.state === 'PLAYING') {
    elClueErrorMsg.textContent = msg;
    elClueErrorMsg.style.display = 'block';
  }
});

socket.on('playAgainNotice', (data) => {
  showToast(data.message, 'notice');
});

// Available Rooms Sync Handler
socket.on('availableRoomsUpdate', (roomsList) => {
  renderAvailableRooms(roomsList || []);
});

function renderAvailableRooms(rooms) {
  if (!elAvailableRoomsContainer) return;
  elAvailableRoomsContainer.innerHTML = '';

  if (!rooms || rooms.length === 0) {
    elAvailableRoomsContainer.innerHTML = `
      <div class="no-rooms-placeholder">
        <span>🏝️</span>
        <p>No active public rooms right now. Create one above!</p>
      </div>
    `;
    return;
  }

  rooms.forEach(room => {
    const card = document.createElement('div');
    card.className = 'room-card';

    const info = document.createElement('div');
    info.className = 'room-card-info';
    info.innerHTML = `
      <div class="room-card-code">#${escapeHtml(room.code)}</div>
      <div class="room-card-host">Host: <strong>${escapeHtml(room.hostName)}</strong></div>
      <div class="room-card-count">👥 ${room.playerCount}/${room.maxPlayers || 10} Players</div>
    `;

    const joinBtn = document.createElement('button');
    joinBtn.className = 'btn btn-primary btn-sm btn-join-room';
    joinBtn.textContent = 'Request to Join';
    joinBtn.addEventListener('click', () => {
      const name = elNameInput.value.trim();
      if (!name) {
        elNameInput.focus();
        return showToast('Please enter your name first!', 'error');
      }
      elRoomCodeInput.value = room.code;
      pendingJoinCode = room.code;
      socket.emit('joinRoom', { code: room.code, name });
    });

    card.appendChild(info);
    card.appendChild(joinBtn);
    elAvailableRoomsContainer.appendChild(card);
  });
}

// Join Request Flow Events
socket.on('joinRequested', (data) => {
  pendingJoinCode = data.code;
  elWaitingHostName.textContent = data.hostName || 'Host';
  elWaitingRoomCode.textContent = `#${data.code}`;
  elJoinWaitingDialog.classList.add('active');
});

socket.on('joinAccepted', () => {
  elJoinWaitingDialog.classList.remove('active');
  pendingJoinCode = null;
  showToast('Host accepted your join request! Welcome to the room.', 'success');
});

socket.on('joinRejected', (data) => {
  elJoinWaitingDialog.classList.remove('active');
  pendingJoinCode = null;
  showToast(data.message || 'The host declined your join request.', 'error');
});

socket.on('joinCancelled', () => {
  elJoinWaitingDialog.classList.remove('active');
  pendingJoinCode = null;
});

// Dedicated guess result feedback
socket.on('guessResult', (data) => {
  if (!data.success) {
    showToast(data.message, 'error');
  }
});

// Primary State Sync Handler
socket.on('roomUpdate', (roomState) => {
  if (!roomState) {
    currentRoom = null;
    showScreen('landing');
    return;
  }

  currentRoom = roomState;
  const isHost = roomState.hostId === localPlayerId;
  const myPlayerObj = roomState.players.find(p => p.id === localPlayerId);

  // Screen Switching
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

  // Render Host Pending Requests Panel
  if (isHost && room.pendingRequests && room.pendingRequests.length > 0) {
    elLobbyRequestsPanel.style.display = 'block';
    elRequestsCount.textContent = room.pendingRequests.length;
    elRequestsList.innerHTML = '';

    room.pendingRequests.forEach(req => {
      const item = document.createElement('div');
      item.className = 'request-item';

      const playerLabel = document.createElement('div');
      playerLabel.className = 'request-name';
      playerLabel.innerHTML = `👤 <strong>${escapeHtml(req.name)}</strong> wants to join`;

      const actions = document.createElement('div');
      actions.className = 'request-actions';

      const acceptBtn = document.createElement('button');
      acceptBtn.className = 'btn btn-success btn-sm';
      acceptBtn.textContent = '✓ Accept';
      acceptBtn.addEventListener('click', () => {
        socket.emit('respondJoinRequest', { requestId: req.id, accept: true });
      });

      const declineBtn = document.createElement('button');
      declineBtn.className = 'btn btn-danger-sm btn-sm';
      declineBtn.textContent = '✕ Decline';
      declineBtn.addEventListener('click', () => {
        socket.emit('respondJoinRequest', { requestId: req.id, accept: false });
      });

      actions.appendChild(acceptBtn);
      actions.appendChild(declineBtn);

      item.appendChild(playerLabel);
      item.appendChild(actions);
      elRequestsList.appendChild(item);
    });
  } else {
    elLobbyRequestsPanel.style.display = 'none';
  }

  // Render player cards
  elLobbyPlayersContainer.innerHTML = '';
  room.players.forEach(p => {
    const card = document.createElement('div');
    card.className = 'player-lobby-card';
    
    const info = document.createElement('div');
    info.className = 'player-info-name';
    if (p.isHost) {
      info.innerHTML = `👑 ${escapeHtml(p.name)}`;
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
  
  const currentTurnPlayer = room.players.find(p => p.id === room.currentPlayerTurnId);
  elCurrentTurnPlayer.textContent = currentTurnPlayer ? currentTurnPlayer.name : '...';

  // Toggle Turn indicators styling
  if (!room.isReviewing && room.currentPlayerTurnId === localPlayerId) {
    document.getElementById('turn-badge').className = 'badge badge-warning animate-pulse';
  } else if (room.isReviewing) {
    document.getElementById('turn-badge').className = 'badge badge-warning animate-pulse';
    elCurrentTurnPlayer.textContent = 'Reviewing Clues';
  } else {
    document.getElementById('turn-badge').className = 'badge';
  }

  // Handle Review Countdown Phase (when all clues submitted)
  if (room.isReviewing) {
    if (elRoundReviewBanner) {
      elRoundReviewBanner.style.display = 'flex';
      if (elReviewRoundNum) elReviewRoundNum.textContent = room.round;
    }
    if (reviewInterval) clearInterval(reviewInterval);
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil(((room.reviewEndsAt || (Date.now() + 5000)) - Date.now()) / 1000));
      if (elReviewTimerSeconds) elReviewTimerSeconds.textContent = remaining;
      if (remaining <= 0 && reviewInterval) {
        clearInterval(reviewInterval);
        reviewInterval = null;
      }
    };
    updateCountdown();
    reviewInterval = setInterval(updateCountdown, 250);
  } else {
    if (elRoundReviewBanner) {
      elRoundReviewBanner.style.display = 'none';
    }
    if (reviewInterval) {
      clearInterval(reviewInterval);
      reviewInterval = null;
    }
  }

  // Toggle Imposter Guess Button visibility
  const isAliveImposter = room.myRole === 'IMPOSTER' && self && self.isAlive;
  elImposterOpenGuessBtn.style.display = isAliveImposter ? 'inline-block' : 'none';

  // Render Role & Secret Info
  elRoleDisplayContainer.innerHTML = '';
  const roleCard = document.createElement('div');
  
  if (room.myRole === 'IMPOSTER') {
    roleCard.className = 'role-banner role-banner-imposter';
    
    let otherImpostersText = '';
    if (room.otherImposters && room.otherImposters.length > 0) {
      otherImpostersText = `<div class="other-imposters-panel">Other Imposters: • ${escapeHtml(room.otherImposters.join(', '))}</div>`;
    }

    let hintHtml = '';
    if (room.imposterHint) {
      hintHtml = `
        <div class="imposter-hint-box">
          <div class="hint-header">
            <span class="hint-badge">💡 FIRST IN ROUND HINT</span>
            <span class="hint-subtitle">You are taking the first turn!</span>
          </div>
          <div class="hint-text">${escapeHtml(room.imposterHint)}</div>
          <p class="hint-tip">Give a subtle clue relating to this category to blend in seamlessly without revealing your identity.</p>
        </div>
      `;
    }
    
    roleCard.innerHTML = `
      <div>
        <div class="role-title imposter-text">🔴 YOU ARE THE IMPOSTER</div>
        <div class="role-desc">You don't know the secret word. Listen carefully to clues, bluff, or guess the secret word to win instantly!</div>
        ${otherImpostersText}
        ${hintHtml}
      </div>
    `;
  } else {
    roleCard.className = 'role-banner role-banner-crewmate';
    roleCard.innerHTML = `
      <div>
        <div class="role-title crewmate-text">🔵 YOU ARE A CREWMATE</div>
        <div class="role-desc">Give a clue without making it too obvious. Category: <strong>${escapeHtml(room.myCategory || 'General')}</strong></div>
      </div>
      <div class="word-reveal-box">
        <span class="word-label">Secret Word</span>
        <span class="word-val">${escapeHtml(room.myWord || '----')}</span>
      </div>
    `;
  }
  elRoleDisplayContainer.appendChild(roleCard);

  // Turn-based Clue Form visibility
  if (!room.isReviewing && room.currentPlayerTurnId === localPlayerId) {
    elClueInputPanel.style.display = 'block';
    elClueErrorMsg.style.display = 'none';
    
    const clueInstruction = document.getElementById('clue-instruction-text');
    if (room.myRole === 'CREWMATE') {
      clueInstruction.textContent = "💡 Give a clue without directly saying the word.";
    } else {
      if (room.imposterHint) {
        clueInstruction.textContent = `💡 Hint: ${room.imposterHint} Give a subtle clue to blend in!`;
      } else {
        clueInstruction.textContent = "🤫 Listen carefully to clues and pretend you know the word! (Or submit the secret word to win!)";
      }
    }
  } else {
    elClueInputPanel.style.display = 'none';
  }

  // Render Clue list
  elCluesLogContainer.innerHTML = '';
  if (room.messages.length === 0) {
    elCluesLogContainer.innerHTML = '<div style="color:var(--text-dim); text-align:center; padding: 1.5rem 0;">No clues submitted yet this round...</div>';
  } else {
    room.messages.forEach(msg => {
      const bubble = document.createElement('div');
      bubble.className = 'clue-bubble';
      
      const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const isSelf = msg.playerId === localPlayerId;
      
      bubble.innerHTML = `
        <div class="clue-bubble-header">
          <span class="clue-bubble-author">${escapeHtml(msg.playerName)} ${isSelf ? '(You)' : ''}</span>
          <span class="clue-bubble-time">${timeStr}</span>
        </div>
        <div class="clue-bubble-body">${escapeHtml(msg.content)}</div>
      `;
      elCluesLogContainer.appendChild(bubble);
    });
    elCluesLogContainer.scrollTop = elCluesLogContainer.scrollHeight;
  }
}

function renderVoting(room, self) {
  if (reviewInterval) {
    clearInterval(reviewInterval);
    reviewInterval = null;
  }
  if (elRoundReviewBanner) {
    elRoundReviewBanner.style.display = 'none';
  }

  elVotingPlayersGrid.innerHTML = '';
  
  const isAliveImposter = room.myRole === 'IMPOSTER' && self && self.isAlive;
  elVotingOpenGuessBtn.style.display = isAliveImposter ? 'inline-block' : 'none';

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

    if (p.isAlive && !hasVoted && p.id !== localPlayerId && self && self.isAlive) {
      item.addEventListener('click', () => {
        socket.emit('submitVote', p.id);
      });
    }

    elVotingPlayersGrid.appendChild(item);
  });

  // Render Clues Reference inside Voting Screen
  if (elVotingCluesContainer) {
    elVotingCluesContainer.innerHTML = '';
    if (!room.messages || room.messages.length === 0) {
      elVotingCluesContainer.innerHTML = '<div style="color:var(--text-dim); text-align:center; padding: 1.5rem 0;">No clues were submitted.</div>';
    } else {
      room.messages.forEach(msg => {
        const bubble = document.createElement('div');
        bubble.className = 'clue-bubble';
        const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const isSelf = msg.playerId === localPlayerId;
        bubble.innerHTML = `
          <div class="clue-bubble-header">
            <span class="clue-bubble-author">${escapeHtml(msg.playerName)} ${isSelf ? '(You)' : ''}</span>
            <span class="clue-bubble-time">${timeStr}</span>
          </div>
          <div class="clue-bubble-body">${escapeHtml(msg.content)}</div>
        `;
        elVotingCluesContainer.appendChild(bubble);
      });
      elVotingCluesContainer.scrollTop = elVotingCluesContainer.scrollHeight;
    }
  }
}

function renderGameOver(room, isHost) {
  const crewmatesWin = (room.winner === 'CREWMATE');

  elWinnerAnnouncement.textContent = crewmatesWin ? '🔵 CREWMATES WIN' : '🔴 IMPOSTERS WIN';
  elWinnerAnnouncement.className = `winner-title ${crewmatesWin ? 'crew-win' : 'imposter-win'}`;

  // If imposter won by correct guess
  if (room.winReason === 'GUESS') {
    elGameOverReasonBanner.style.display = 'block';
    elGameOverReasonBanner.className = 'win-reason-banner guess-win';
    elGameOverReasonBanner.innerHTML = `
      🎯 <strong>IMPOSTER CRACKED THE CODE!</strong><br>
      <span>${escapeHtml(room.guesserName || 'The Imposter')} correctly guessed the secret word: <strong>${escapeHtml(room.secretWord || '')}</strong>!</span>
    `;
  } else {
    elGameOverReasonBanner.style.display = 'none';
  }

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
        <td><strong>${escapeHtml(entry.name)}</strong></td>
        <td>
          <span class="badge ${entry.role === 'IMPOSTER' ? 'badge-danger' : (entry.role === 'CREWMATE' ? 'badge-accent' : '')}">
            ${escapeHtml(entry.role || 'N/A')}
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
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.toString().replace(/[&<>"']/g, m => map[m]);
}

// DOM Event Listeners

// Host game
elCreateBtn.addEventListener('click', () => {
  const name = elNameInput.value.trim();
  if (!name) {
    elNameInput.focus();
    return showToast('Please enter your name to create a game.', 'error');
  }
  socket.emit('createRoom', name);
});

// Join game by code
elJoinBtn.addEventListener('click', () => {
  const name = elNameInput.value.trim();
  const code = elRoomCodeInput.value.trim();
  if (!name) {
    elNameInput.focus();
    return showToast('Please enter your name.', 'error');
  }
  if (!code) {
    elRoomCodeInput.focus();
    return showToast('Please enter a 6-digit room code.', 'error');
  }
  socket.emit('joinRoom', { code, name });
});

// Refresh available rooms
elRefreshRoomsBtn.addEventListener('click', () => {
  socket.emit('getAvailableRooms');
  showToast('Refreshing available rooms...', 'info');
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
  elClueTextInput.value = '';
});

elClueTextInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    elSubmitClueBtn.click();
  }
});

// Cancel join request
elCancelJoinRequestBtn.addEventListener('click', () => {
  socket.emit('cancelJoinRequest');
});

// Imposter Guess Modal Flow
function openImposterGuessModal() {
  elImposterGuessInput.value = '';
  elImposterGuessDialog.classList.add('active');
  setTimeout(() => elImposterGuessInput.focus(), 150);
}

elImposterOpenGuessBtn.addEventListener('click', openImposterGuessModal);
elVotingOpenGuessBtn.addEventListener('click', openImposterGuessModal);

elImposterGuessCancelBtn.addEventListener('click', () => {
  elImposterGuessDialog.classList.remove('active');
});

elImposterGuessSubmitBtn.addEventListener('click', () => {
  const guess = elImposterGuessInput.value.trim();
  if (!guess) {
    return showToast('Please enter a word guess.', 'error');
  }
  elImposterGuessDialog.classList.remove('active');
  socket.emit('imposterGuessWord', guess);
});

elImposterGuessInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    elImposterGuessSubmitBtn.click();
  }
});

// Leaving Game/Lobby
function leaveCurrentRoom() {
  socket.emit('leaveRoom');
  showScreen('landing');
  currentRoom = null;
  socket.emit('getAvailableRooms');
}
elLobbyLeaveBtn.addEventListener('click', leaveCurrentRoom);
elGameLeaveBtn.addEventListener('click', leaveCurrentRoom);
elReturnHomeBtn.addEventListener('click', leaveCurrentRoom);

// Play Again Flow
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
