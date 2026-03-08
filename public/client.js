// ===================== CLIENT-SIDE MULTIPLAYER =====================
const socket = io();

let mySocketId = null;
let currentRoom = null;
let currentRoomState = null;
let isHost = false;
let gameState = null; // sanitized state from server
let selectedCardIndex = -1;
let lastPhase = null; // track phase changes for SFX triggers
let lastRoomPlayerCount = 0; // track player count for join SFX

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

socket.on('connect', () => {
    mySocketId = socket.id;
    socket.emit('requestRoomList');
});

// Auto-fill room code from URL ?room=XXXX and restore cached nickname
(function initLobby() {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl) {
        const input = document.getElementById('room-code-input');
        if (input) input.value = roomFromUrl.toUpperCase();
    }
    const savedName = localStorage.getItem('pass_card_nickname');
    if (savedName) {
        const nameInput = document.getElementById('player-name');
        if (nameInput) nameInput.value = savedName;
    }
})();

// ===================== LOBBY =====================

function createRoom() {
    const name = document.getElementById('player-name').value.trim();
    if (!name) { showLobbyError('请输入你的昵称！'); return; }
    localStorage.setItem('pass_card_nickname', name);
    const maxPlayers = parseInt(document.getElementById('max-players').value) || 4;
    socket.emit('createRoom', { name, maxPlayers });
}

function joinRoom(overrideCode) {
    const name = document.getElementById('player-name').value.trim();
    if (!name) { showLobbyError('请输入你的昵称！'); return; }
    localStorage.setItem('pass_card_nickname', name);
    const code = overrideCode || document.getElementById('room-code-input').value.trim().toUpperCase();
    if (!code) { showLobbyError('请输入房间号！'); return; }
    socket.emit('joinRoom', { code, name });
}

function spectateRoom(code) {
    const name = document.getElementById('player-name').value.trim();
    if (!name) { showLobbyError('请输入你的昵称！'); return; }
    localStorage.setItem('pass_card_nickname', name);
    socket.emit('spectateRoom', { code, name });
}

// ==== ROOM LIST ====
socket.on('roomList', (list) => {
    const container = document.getElementById('room-list');
    if (!container) return;
    if (list.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted); text-align:center; font-size:13px;">暂无房间</p>';
        return;
    }
    container.innerHTML = list.map(r => {
        const btn = r.started
            ? `<button class="btn" onclick="spectateRoom('${r.code}')" style="padding:4px 8px; font-size:12px; background:linear-gradient(135deg,#f59e0b,#d97706);">👀 观战</button>`
            : `<button class="btn" onclick="joinRoom('${r.code}')" style="padding:4px 8px; font-size:12px; background:linear-gradient(135deg,#38bdf8,#0284c7);">👉 加入</button>`;
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:8px 12px; border-radius:4px; margin-bottom:6px; border:1px solid rgba(255,255,255,0.1);">
                <span style="font-size:13px; color:var(--text-primary);"><strong style="color:var(--accent-info); letter-spacing:1px;">${r.code}</strong> (${r.playerCount}/${r.maxPlayers}人) - 房主: ${r.hostName}</span>
                ${btn}
            </div>
        `;
    }).join('');
});

function showLobbyError(msg) {
    document.getElementById('lobby-error').textContent = msg;
    setTimeout(() => { document.getElementById('lobby-error').textContent = ''; }, 3000);
}

function showRules() {
    document.getElementById('rules-modal').classList.remove('hidden');
    if (typeof SFX !== 'undefined') SFX.buttonClick();
}
function closeRules() {
    document.getElementById('rules-modal').classList.add('hidden');
}

function showPlayerListModal() {
    if (!currentRoomState) return;

    const playersDiv = document.getElementById('pl-players-container');
    const specsDiv = document.getElementById('pl-spectators-container');

    if (playersDiv) playersDiv.innerHTML = '';
    if (specsDiv) specsDiv.innerHTML = '';

    if (!currentRoomState.spectators || currentRoomState.spectators.length === 0) {
        if (specsDiv) specsDiv.innerHTML = '<div style="color:var(--text-muted); font-size:12px; text-align:center;">暂无观众</div>';
    } else {
        currentRoomState.spectators.forEach(s => {
            let label = s.name;
            if (s.id === mySocketId) label += ' (你)';
            if (specsDiv) {
                specsDiv.innerHTML += `
                    <div style="background:rgba(255,152,0,0.1); padding:8px 12px; border-radius:4px; border:1px solid rgba(255,152,0,0.3); font-size:13px; color:#ffb74d;">
                        👀 <strong style="color:#ffb74d;">${label}</strong>
                    </div>
                `;
            }
        });
    }

    document.getElementById('player-list-modal').classList.remove('hidden');
    if (typeof SFX !== 'undefined') SFX.buttonClick();
}

function closePlayerListModal() {
    document.getElementById('player-list-modal').classList.add('hidden');
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

socket.on('spectateStarted', ({ code }) => {
    currentRoom = code;
    isHost = false;
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('room-waiting').classList.add('hidden');
    document.getElementById('game-table').classList.remove('hidden');
    document.getElementById('spectator-banner').classList.remove('hidden');
    const roomCodeEl = document.getElementById('game-room-code');
    if (roomCodeEl) roomCodeEl.textContent = currentRoom;
});

// ==== JOIN REQUEST FLOW ====
function requestJoinGame() {
    const name = document.getElementById('player-name').value.trim();
    if (!name) return;
    if (!currentRoom) return;
    socket.emit('requestJoinGame', { code: currentRoom, name });
    document.getElementById('spectator-join-btn').textContent = '申请中...';
    document.getElementById('spectator-join-btn').disabled = true;
}

socket.on('joinRequestSent', () => {
    // optional feedback
});

socket.on('joinRequest', (data) => {
    // Only host receives this
    document.getElementById('join-request-modal').classList.remove('hidden');
    document.getElementById('jr-name').textContent = data.requesterName;

    const optsDiv = document.getElementById('jr-options');
    let html = `<p style="font-size:13px; color:var(--text-muted); margin-bottom:8px;">请选择如何让玩家加入：</p>`;

    // Option 1: Replace AI
    if (data.aiPlayers && data.aiPlayers.length > 0) {
        data.aiPlayers.forEach(ai => {
            html += `<button class="btn" onclick="approveJoin('${data.requesterId}', ${ai.seatIndex}, false)" style="display:block; width:100%; margin-bottom:8px; padding:8px; font-size:13px; background:linear-gradient(135deg,#34d399,#059669);">替换 AI: ${ai.name}</button>`;
        });
    }

    // Option 2: Expand Max Players (add as new)
    if (data.currentCount >= data.maxPlayers) {
        html += `<button class="btn" onclick="approveJoin('${data.requesterId}', null, true)" style="display:block; width:100%; margin-bottom:8px; padding:8px; font-size:13px; background:linear-gradient(135deg,#38bdf8,#0284c7);">增加座位上限 (${data.maxPlayers}->${data.currentCount + 1})</button>`;
    } else {
        html += `<button class="btn" onclick="approveJoin('${data.requesterId}', null, true)" style="display:block; width:100%; margin-bottom:8px; padding:8px; font-size:13px; background:linear-gradient(135deg,#38bdf8,#0284c7);">直接新增玩家</button>`;
    }

    optsDiv.innerHTML = html;

    const rejectBtn = document.getElementById('jr-reject-btn');
    rejectBtn.onclick = () => { rejectJoin(data.requesterId); };
    if (typeof SFX !== 'undefined') SFX.notifyChime();
});

function approveJoin(requesterId, replaceSeatIndex, expandMax) {
    document.getElementById('join-request-modal').classList.add('hidden');
    socket.emit('approveJoin', { requesterId, replaceSeatIndex, expandMax });
}

function rejectJoin(requesterId) {
    document.getElementById('join-request-modal').classList.add('hidden');
    socket.emit('rejectJoin', { requesterId });
}

socket.on('joinApproved', ({ code }) => {
    currentRoom = code;
    document.getElementById('spectator-banner').classList.add('hidden');
    if (typeof SFX !== 'undefined') SFX.notifyChime();
});

socket.on('joinRejected', () => {
    alert('房主拒绝了您的加入申请。');
    const btn = document.getElementById('spectator-join-btn');
    if (btn) {
        btn.textContent = '申请加入游戏';
        btn.disabled = false;
    }
});

socket.on('error', ({ msg }) => {
    showLobbyError(msg);
});

function showRoomWaiting(code) {
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('room-waiting').classList.remove('hidden');
    document.getElementById('room-code-display').textContent = code;

    // Generate share link
    const shareUrl = `${window.location.origin}?room=${code}`;
    const shareLinkInput = document.getElementById('share-link');
    if (shareLinkInput) shareLinkInput.value = shareUrl;

    // Update browser URL without reload
    history.replaceState(null, '', `?room=${code}`);
}

function copyShareLink() {
    const shareLinkInput = document.getElementById('share-link');
    if (!shareLinkInput) return;
    navigator.clipboard.writeText(shareLinkInput.value).then(() => {
        const btn = shareLinkInput.nextElementSibling;
        if (btn) {
            const orig = btn.textContent;
            btn.textContent = '✅ 已复制';
            setTimeout(() => { btn.textContent = orig; }, 1500);
        }
    }).catch(() => {
        shareLinkInput.select();
        document.execCommand('copy');
    });
}

socket.on('roomUpdate', (data) => {
    currentRoom = data.code;
    currentRoomState = data;
    isHost = (data.hostId === mySocketId);

    // Play sound when a new player joins
    const newCount = data.players.length;
    if (newCount > lastRoomPlayerCount && lastRoomPlayerCount > 0) {
        if (typeof SFX !== 'undefined') SFX.notifyChime();
    }
    lastRoomPlayerCount = newCount;

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

    // Process spectator mode
    if (state.isSpectator) {
        document.getElementById('spectator-banner').classList.remove('hidden');
        document.getElementById('room-waiting').classList.add('hidden');
    } else {
        document.getElementById('spectator-banner').classList.add('hidden');
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

// Generate authentic pip layout for playing cards
// Each pip is positioned with (left%, top%) and optional flip
function generatePipLayout(value, sym) {
    // Face cards — large centered letter
    if (['J', 'Q', 'K'].includes(value)) {
        const labels = { J: 'J', Q: 'Q', K: 'K' };
        return `<span class="card-face-letter">${labels[value]}</span>`;
    }
    // Ace — single large centered pip
    if (value === 'A') {
        return `<span class="card-pip" style="left:50%;top:50%;transform:translate(-50%,-50%);font-size:28px;">${sym}</span>`;
    }

    // Pip position maps — [left%, top%, flipped?]
    // Modeled after standard Bicycle deck layouts
    const L = 30, R = 70, C = 50; // left, right, center columns
    const layouts = {
        '2': [[C, 22], [C, 78, 1]],
        '3': [[C, 22], [C, 50], [C, 78, 1]],
        '4': [[L, 22], [R, 22], [L, 78, 1], [R, 78, 1]],
        '5': [[L, 22], [R, 22], [C, 50], [L, 78, 1], [R, 78, 1]],
        '6': [[L, 22], [R, 22], [L, 50], [R, 50], [L, 78, 1], [R, 78, 1]],
        '7': [[L, 22], [R, 22], [L, 50], [R, 50], [C, 36], [L, 78, 1], [R, 78, 1]],
        '8': [[L, 22], [R, 22], [L, 50], [R, 50], [C, 36], [C, 64, 1], [L, 78, 1], [R, 78, 1]],
        '9': [[L, 20], [R, 20], [L, 40], [R, 40], [C, 50], [L, 60, 1], [R, 60, 1], [L, 80, 1], [R, 80, 1]],
        '10': [[L, 20], [R, 20], [C, 30], [L, 40], [R, 40], [L, 60, 1], [R, 60, 1], [C, 70, 1], [L, 80, 1], [R, 80, 1]]
    };

    const positions = layouts[value];
    if (!positions) return `<span class="card-pip" style="left:50%;top:50%;transform:translate(-50%,-50%);font-size:20px;">${sym}</span>`;

    return positions.map(([x, y, flip]) =>
        `<span class="card-pip${flip ? ' pip-flip' : ''}" style="left:${x}%;top:${y}%;">${sym}</span>`
    ).join('');
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

        let rx = 44, ry = 36;
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
                const sym = getSuitSymbol(card.suit);
                const pips = generatePipLayout(card.value, sym);
                el.innerHTML = `
                    <div class="card-corner card-corner-tl">${card.value}<br>${sym}</div>
                    <div class="card-pips">${pips}</div>
                    <div class="card-corner card-corner-br">${card.value}<br>${sym}</div>
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
