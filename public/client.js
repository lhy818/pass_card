// ===================== CLIENT-SIDE MULTIPLAYER =====================
const socket = io();

let mySocketId = null;
let currentRoom = null;
let isHost = false;
let gameState = null; // sanitized state from server
let selectedCardIndex = -1;
let lastPhase = null; // track phase changes for SFX triggers

// UI refs
const UI = {
    message: null,
    ruleDisplay: null,
    ruleName: null,
    multiplierVal: null,
    targetRanksDisplay: null,
    ruleSelection: null,
    btnAction: null
};

function initUIRefs() {
    UI.message = document.getElementById('message');
    UI.ruleDisplay = document.getElementById('rule-display');
    UI.ruleName = document.getElementById('current-rule-name');
    UI.multiplierVal = document.getElementById('current-multiplier');
    UI.targetRanksDisplay = document.getElementById('current-target-ranks');
    UI.ruleSelection = document.getElementById('rule-selection');
    UI.btnAction = document.getElementById('btn-action');
}

socket.on('connect', () => { mySocketId = socket.id; });

// ===================== LOBBY =====================

function createRoom() {
    const name = document.getElementById('player-name').value.trim();
    if (!name) { showLobbyError('请输入你的昵称！'); return; }
    const maxPlayers = parseInt(document.getElementById('max-players').value) || 4;
    socket.emit('createRoom', { name, maxPlayers });
}

function joinRoom() {
    const name = document.getElementById('player-name').value.trim();
    if (!name) { showLobbyError('请输入你的昵称！'); return; }
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (!code) { showLobbyError('请输入房间号！'); return; }
    socket.emit('joinRoom', { code, name });
}

function showLobbyError(msg) {
    document.getElementById('lobby-error').textContent = msg;
    setTimeout(() => { document.getElementById('lobby-error').textContent = ''; }, 3000);
}

socket.on('roomCreated', ({ code }) => {
    currentRoom = code;
    isHost = true;
    showRoomWaiting(code);
    if (typeof SFX !== 'undefined') SFX.notifyChime();
});

socket.on('roomJoined', ({ code }) => {
    currentRoom = code;
    isHost = false;
    showRoomWaiting(code);
    if (typeof SFX !== 'undefined') SFX.notifyChime();
});

socket.on('error', ({ msg }) => {
    showLobbyError(msg);
});

function showRoomWaiting(code) {
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('room-waiting').classList.remove('hidden');
    document.getElementById('room-code-display').textContent = code;
}

socket.on('roomUpdate', (data) => {
    currentRoom = data.code;
    isHost = (data.hostId === mySocketId);
    const container = document.getElementById('room-players-list');
    container.innerHTML = '';
    data.players.forEach(p => {
        const div = document.createElement('div');
        div.style.cssText = 'color:white; font-size:18px; padding:6px 0; display:flex; align-items:center; justify-content:center; gap:10px;';
        const isMe = (p.id === mySocketId);
        let label = `<span style="font-weight:bold;">${p.name}</span>`;
        if (isMe) label += ' <span style="color:#4caf50;">(你)</span>';
        if (p.isAI) label += ' <span style="color:#ff9800;">🤖</span>';
        if (p.seatIndex === 0) label += ' <span style="color:#ffd54f;">👑</span>';

        let removeBtn = '';
        if (isHost && p.seatIndex > 0) {
            removeBtn = `<button onclick="removePlayer(${p.seatIndex})" style="font-size:12px; padding:2px 8px; cursor:pointer; border:none; border-radius:4px; background:#ff5555; color:white;">移除</button>`;
        }
        div.innerHTML = `座位 ${p.seatIndex + 1}: ${label} ${removeBtn}`;
        container.appendChild(div);
    });

    const hostControls = document.getElementById('host-controls');
    if (isHost) {
        hostControls.classList.remove('hidden');
        hostControls.style.display = 'flex';
    } else {
        hostControls.classList.add('hidden');
    }

    // If game already started
    if (data.started) {
        document.getElementById('room-waiting').classList.add('hidden');
        document.getElementById('game-table').classList.remove('hidden');
        initUIRefs();
    }
});

function addAI() { socket.emit('addAI'); }
function removePlayer(seatIndex) { socket.emit('removePlayer', { seatIndex }); }
function startGame() { socket.emit('startGame'); }

// ===================== GAME STATE RENDERING =====================

socket.on('gameStateUpdate', (state) => {
    const prevPhase = lastPhase;
    gameState = state;
    lastPhase = state.phase;

    // Switch to game view
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('room-waiting').classList.add('hidden');
    document.getElementById('game-table').classList.remove('hidden');
    initUIRefs();

    // Sync host status from server
    if (state.hostId) {
        isHost = (state.hostId === mySocketId);
    }

    // Show room code on the table
    const roomCodeEl = document.getElementById('game-room-code');
    if (roomCodeEl && currentRoom) roomCodeEl.textContent = currentRoom;

    // --- SFX triggers based on phase transitions ---
    if (typeof SFX !== 'undefined' && prevPhase !== null) {
        // Deal cards
        if (prevPhase === 'PRE_DEAL_RANK' && (state.phase === 'PASSING' || state.phase === 'HUMAN_PASS' || state.phase === 'AI_PASS')) {
            SFX.dealCards();
        }
        // AI pass happened
        if (prevPhase === 'AI_PASS' && state.phase !== prevPhase) {
            SFX.cardPass();
        }
        // Rule chosen
        if ((prevPhase === 'HUMAN_CHOOSE_RULE' || prevPhase === 'AI_CHOOSE_RULE') && state.phase === 'SHOWDOWN') {
            SFX.ruleChosen();
            setTimeout(() => SFX.showdownReveal(), 300);
        }
        // Showdown result — play win or lose based on local player's result
        if (prevPhase !== 'SHOWDOWN' && state.phase === 'SHOWDOWN' && state.showdownResult) {
            const myRanking = state.showdownResult.rankings.find(r => r.seatIndex === state.mySeatIndex);
            setTimeout(() => {
                if (myRanking && myRanking.isLoser) {
                    SFX.loseBuzzer();
                } else {
                    SFX.winFanfare();
                }
            }, 800);
        }
    }

    renderAllPlayers();
    renderCards();
    updateControls();
    updateMessage();
});

function getSuitSymbol(suit) {
    if (suit === 'hearts') return '♥';
    if (suit === 'diamonds') return '♦';
    if (suit === 'spades') return '♠';
    if (suit === 'clubs') return '♣';
    return '';
}

function renderAllPlayers() {
    if (!gameState) return;
    const container = document.getElementById('players-container');
    container.innerHTML = '';

    const n = gameState.totalPlayers;
    const tc = gameState.turnCircle;
    const myIdx = tc.indexOf(gameState.mySeatIndex);

    for (let i = 0; i < n; i++) {
        const seatIndex = tc[i];
        // Compute angle relative to my seat
        let diff = i - myIdx;
        if (diff < 0) diff += n;
        const theta = Math.PI / 2 + diff * (2 * Math.PI / n);

        let rx = 40, ry = 35;
        const left = 50 + Math.cos(theta) * rx;
        const top = 50 + Math.sin(theta) * ry;

        const pData = gameState.players[seatIndex];
        const div = document.createElement('div');
        div.className = 'player';
        div.id = `player${seatIndex}`;
        div.style.position = 'absolute';
        div.style.left = `${left}%`;
        div.style.top = `${top}%`;
        div.style.transform = 'translate(-50%, -50%)';

        const isMe = (seatIndex === gameState.mySeatIndex);
        const playerName = (gameState.playerNames && gameState.playerNames[seatIndex]) || `玩家${seatIndex + 1}`;
        const displayLabel = isMe ? `${playerName} (你)` : playerName;

        div.innerHTML = `
            <div class="info">
                <strong>${displayLabel} <span id="cups${seatIndex}" style="color: #ffeb3b; font-weight: normal; font-size: 14px;">(${pData.totalLosses}杯)</span></strong>
                <span id="score${seatIndex}" class="score"></span>
            </div>
            <div class="cards" id="cards${seatIndex}"></div>
            <div class="status" id="status${seatIndex}"></div>
        `;
        container.appendChild(div);
    }

    // Apply showdown rankings and loser tags
    if (gameState.phase === 'SHOWDOWN' && gameState.showdownResult) {
        const result = gameState.showdownResult;
        result.rankings.forEach(r => {
            const scoreEl = document.getElementById(`score${r.seatIndex}`);
            if (scoreEl) {
                scoreEl.innerHTML = `<span style="color:#00ffff; font-weight:bold; margin-right:8px; display:inline-block; background:rgba(0,0,0,0.5); padding:2px 6px; border-radius:4px;">${r.rankName}</span>${r.handName}`;
            }
            const playerEl = document.getElementById(`player${r.seatIndex}`);
            if (playerEl) {
                if (r.isLoser) {
                    playerEl.classList.add('loser-anim');
                    const infoEl = playerEl.querySelector('.info');
                    if (infoEl) infoEl.classList.add('loser-tag');
                } else {
                    playerEl.classList.add('winner-anim');
                }
            }
        });
    }
}

function renderCards() {
    if (!gameState) return;
    const isShowdown = gameState.phase === 'SHOWDOWN';
    const isMyTurnToPass = (gameState.phase === 'HUMAN_PASS' && gameState.currentPassFrom === gameState.mySeatIndex);

    for (const [seatStr, pData] of Object.entries(gameState.players)) {
        const seat = parseInt(seatStr);
        const cardsEl = document.getElementById(`cards${seat}`);
        if (!cardsEl) continue;
        cardsEl.innerHTML = '';

        const isMe = seat === gameState.mySeatIndex;
        const cards = pData.cards || [];

        cards.forEach((card, idx) => {
            const el = document.createElement('div');
            if (!card) {
                el.className = 'card face-down';
            } else {
                el.className = 'card';
                el.dataset.suit = card.suit;
                el.innerHTML = `
                    <div style="position: absolute; top: 5px; left: 5px; font-size: 14px; line-height: 1;">
                        ${card.value}<br>${getSuitSymbol(card.suit)}
                    </div>
                    <div style="font-size: 36px; display: flex; height: 100%; align-items: center; justify-content: center;">
                        ${getSuitSymbol(card.suit)}
                    </div>
                    <div style="position: absolute; bottom: 5px; right: 5px; font-size: 14px; line-height: 1; transform: rotate(180deg);">
                        ${card.value}<br>${getSuitSymbol(card.suit)}
                    </div>
                `;
            }

            if (isMe && isMyTurnToPass && card) {
                el.classList.add('selectable');
                if (selectedCardIndex === idx) el.classList.add('selected');
                el.addEventListener('click', () => {
                    selectedCardIndex = idx;
                    if (typeof SFX !== 'undefined') SFX.cardSelect();
                    renderCards();
                });
                el.addEventListener('dblclick', () => {
                    selectedCardIndex = idx;
                    doPassCard();
                });
            }

            cardsEl.appendChild(el);
        });

        // If showdown, show hand name from server
        if (isShowdown && pData.handName) {
            const scoreEl = document.getElementById(`score${seat}`);
            if (scoreEl && !scoreEl.innerHTML.includes(pData.handName)) {
                // already set in renderAllPlayers via showdownResult
            }
        }
    }
}

function updateControls() {
    if (!gameState) return;

    // Pre-deal rank selection
    const preDealDiv = document.getElementById('pre-deal-rank-selection');
    if (gameState.phase === 'PRE_DEAL_RANK' && gameState.finalPlayerId === gameState.mySeatIndex) {
        preDealDiv.classList.remove('hidden');
        const cbContainer = document.getElementById('pre-loser-rank-checkboxes');
        cbContainer.innerHTML = '';
        for (let i = 1; i <= gameState.totalPlayers; i++) {
            let label = `第 ${i} 大`;
            if (i === 1) label += " (最大)";
            if (i === gameState.totalPlayers) label += " (最小)";
            const labelEl = document.createElement('label');
            labelEl.style.cssText = 'color:white; cursor:pointer; display:flex; align-items:center; gap:4px; font-size:16px;';
            labelEl.innerHTML = `<input type="checkbox" value="${i}" ${i === 2 ? 'checked' : ''}> ${label}`;
            cbContainer.appendChild(labelEl);
        }
    } else {
        preDealDiv.classList.add('hidden');
    }

    // Pass button
    const isMyTurnToPass = (gameState.phase === 'HUMAN_PASS' && gameState.currentPassFrom === gameState.mySeatIndex);
    if (isMyTurnToPass) {
        UI.btnAction.classList.remove('hidden');
        UI.btnAction.textContent = `传牌`;
        UI.btnAction.onclick = doPassCard;
    } else {
        UI.btnAction.classList.add('hidden');
    }

    // Rule selection
    if (gameState.phase === 'HUMAN_CHOOSE_RULE' && gameState.finalPlayerId === gameState.mySeatIndex) {
        UI.ruleSelection.classList.remove('hidden');
    } else {
        UI.ruleSelection.classList.add('hidden');
    }

    // Rule display
    if (gameState.targetLoserRanks && gameState.targetLoserRanks.length > 0 && gameState.phase !== 'PRE_DEAL_RANK') {
        UI.ruleDisplay.classList.remove('hidden');
        const rankTextList = gameState.targetLoserRanks.map(r => r === 1 ? "最大" : (r === gameState.totalPlayers ? "最小" : `第${r}大`)).join("、");
        UI.targetRanksDisplay.textContent = rankTextList;
        if (gameState.currentRule && gameState.ruleNames) {
            UI.ruleName.textContent = gameState.ruleNames[gameState.currentRule] || '（未指定）';
        } else {
            UI.ruleName.textContent = '（未指定）';
        }
        UI.multiplierVal.textContent = gameState.gameMultiplier;
    } else if (gameState.phase === 'PRE_DEAL_RANK') {
        UI.ruleDisplay.classList.add('hidden');
    }

    // Next round button (host only)
    const nextRoundDiv = document.getElementById('next-round-controls');
    if (gameState.phase === 'SHOWDOWN' && isHost) {
        nextRoundDiv.classList.remove('hidden');
    } else {
        nextRoundDiv.classList.add('hidden');
    }
}

function updateMessage() {
    if (!gameState || !UI.message) return;
    UI.message.innerHTML = gameState.message;
}

// ===================== PLAYER ACTIONS =====================

function confirmRanks() {
    const checkedBoxes = Array.from(document.querySelectorAll('#pre-loser-rank-checkboxes input:checked'));
    if (checkedBoxes.length === 0) {
        alert("请至少指定一个输家名次！");
        return;
    }
    const ranks = checkedBoxes.map(cb => parseInt(cb.value));
    if (typeof SFX !== 'undefined') SFX.buttonClick();
    socket.emit('confirmRanks', { ranks });
}

function doPassCard() {
    if (selectedCardIndex === -1) {
        alert("请先选择一张牌！");
        return;
    }
    if (typeof SFX !== 'undefined') SFX.cardPass();
    socket.emit('passCard', { cardIndex: selectedCardIndex });
    selectedCardIndex = -1;
}

function chooseRule(rule) {
    if (typeof SFX !== 'undefined') SFX.buttonClick();
    socket.emit('chooseRule', { rule });
}

function nextRound() {
    if (typeof SFX !== 'undefined') SFX.buttonClick();
    socket.emit('nextRound');
}
