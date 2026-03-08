const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname + '/public'));

// ===================== Game Logic (moved from script.js) =====================

function getValueRank(value) {
    if (value === 'A') return 14;
    if (value === 'K') return 13;
    if (value === 'Q') return 12;
    if (value === 'J') return 11;
    return parseInt(value);
}

function getSuitRank(suit) {
    const ranks = { 'spades': 4, 'hearts': 3, 'clubs': 2, 'diamonds': 1 };
    return ranks[suit];
}

function evalSanPi(cards) {
    const c1 = cards[0], c2 = cards[1];
    const v1 = getValueRank(c1.value), v2 = getValueRank(c2.value);
    const s1 = getSuitRank(c1.suit), s2 = getSuitRank(c2.suit);
    let highCard, lowCard;
    if (v1 > v2 || (v1 === v2 && s1 > s2)) { highCard = c1; lowCard = c2; }
    else { highCard = c2; lowCard = c1; }
    const highV = getValueRank(highCard.value), lowV = getValueRank(lowCard.value);
    const sHigh = getSuitRank(highCard.suit), sLow = getSuitRank(lowCard.suit);
    let score = 0, name = '', multiplierContrib = 0;
    const isPair = (highV === lowV), isFlush = (highCard.suit === lowCard.suit);
    let isStraight = false, rankDiff = highV - lowV;
    if (rankDiff === 1 || rankDiff === 2) isStraight = true;
    if (highV === 14 && (lowV === 2 || lowV === 3)) isStraight = true;
    if (isPair) { score = 5000000 + highV * 10000 + sHigh * 100 + sLow; name = `三匹 ${highCard.value}`; multiplierContrib = 1; }
    else if (isStraight && isFlush) { score = 4000000 + highV * 10000 + sHigh * 100; name = `同花顺`; }
    else if (isFlush) { score = 3000000 + highV * 10000 + lowV * 100 + sHigh * 10; name = `同花`; }
    else if (isStraight) { score = 2000000 + highV * 10000 + sHigh * 100; name = `顺子`; }
    else { score = 1000000 + highV * 10000 + lowV * 100 + sHigh * 10 + sLow; name = `${highCard.value} 高牌 (带 ${lowCard.value})`; }
    return { score, name, multiplierContrib };
}

function getTenHalfValueRank(value) {
    if (['J', 'Q', 'K'].includes(value)) return 0.5;
    if (value === 'A') return 1;
    return parseInt(value);
}

function evalTenHalf(cards) {
    const c1 = cards[0], c2 = cards[1];
    const v1 = getTenHalfValueRank(c1.value), v2 = getTenHalfValueRank(c2.value);
    let highCard, lowCard;
    if (v1 > v2 || (v1 === v2 && getSuitRank(c1.suit) > getSuitRank(c2.suit))) { highCard = c1; lowCard = c2; }
    else { highCard = c2; lowCard = c1; }
    const sum = v1 + v2;
    let score = 0, multiplierContrib = 0;
    let sumDisplay = sum.toString();
    if (sumDisplay.endsWith('.5')) sumDisplay = sumDisplay.replace('.5', '点半');
    else sumDisplay += ' 点';
    let name = sumDisplay;
    const subSort = getSuitRank(highCard.suit) * 10 + getSuitRank(lowCard.suit);
    if (sum === 10.5) { score = 2000000 + subSort; name = `10点半!`; multiplierContrib = 1; }
    else if (sum > 10.5) { score = (100 - sum) * 10000 + subSort; name = `${sumDisplay} (暴牌)`; }
    else { score = 1000000 + sum * 10000 + subSort; }
    return { score, name, multiplierContrib };
}

function getLaoYanCaiValueRank(value) {
    if (['10', 'J', 'Q', 'K'].includes(value)) return 0;
    if (value === 'A') return 1;
    return parseInt(value);
}

function evalLaoYanCai(cards) {
    const c1 = cards[0], c2 = cards[1];
    const v1 = getLaoYanCaiValueRank(c1.value), v2 = getLaoYanCaiValueRank(c2.value);
    const realV1 = getValueRank(c1.value), realV2 = getValueRank(c2.value);
    let highCard, lowCard;
    if (realV1 > realV2 || (realV1 === realV2 && getSuitRank(c1.suit) > getSuitRank(c2.suit))) { highCard = c1; lowCard = c2; }
    else { highCard = c2; lowCard = c1; }
    const highRealV = getValueRank(highCard.value);
    const sum = (v1 + v2) % 10;
    const isPair = (c1.value === c2.value), isFlush = (c1.suit === c2.suit);
    const isShuangYan = (sum !== 0 && (isPair || isFlush));
    let score = sum * 1000000;
    if (isShuangYan) score += 100000;
    score += highRealV * 1000 + getSuitRank(highCard.suit) * 10 + getSuitRank(lowCard.suit);
    let name = `${sum} 点`, multiplierContrib = 0;
    if (sum === 0) { name = `睡着 (0点)`; }
    else if (isShuangYan) { name += ` (双腌)`; multiplierContrib = 1; }
    return { score, name, multiplierContrib };
}

function getHandEval(cards, rule) {
    if (rule === 'SAN_PI') return evalSanPi(cards);
    if (rule === 'TEN_HALF') return evalTenHalf(cards);
    if (rule === 'LAO_YAN_CAI') return evalLaoYanCai(cards);
    return { score: 0, name: '', multiplierContrib: 0 };
}

function createDeck() {
    const suits = ['hearts', 'diamonds', 'spades', 'clubs'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck = [];
    for (let suit of suits) {
        for (let value of values) {
            deck.push({ suit, value });
        }
    }
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function aiPickCardToPass(cards) {
    let bestScore = -1, cardToPassIndex = 0;
    for (let i = 0; i < cards.length; i++) {
        const remaining = [...cards];
        remaining.splice(i, 1);
        const result = getHandEval(remaining, 'SAN_PI');
        if (result.score > bestScore) { bestScore = result.score; cardToPassIndex = i; }
    }
    return cardToPassIndex;
}

// ===================== Room Management =====================

const rooms = {};
const RANK_NAMES = ['老大', '老二', '小三', '四耶', '老五', '老六', '老七', '老八', '老九', '老十'];

function createRoom(roomCode, hostSocket, hostName) {
    rooms[roomCode] = {
        code: roomCode,
        hostId: hostSocket.id,
        players: [{ id: hostSocket.id, name: hostName, seatIndex: 0, isAI: false }],
        maxPlayers: 4,
        gameState: null,
        started: false,
        spectators: [],       // { id, name }
        joinRequests: []      // { id, name }
    };
    return rooms[roomCode];
}

function getRoom(code) { return rooms[code] || null; }

function broadcastRoomState(room) {
    const publicPlayers = room.players.map(p => ({ name: p.name, seatIndex: p.seatIndex, isAI: p.isAI, id: p.id }));
    const data = {
        code: room.code,
        hostId: room.hostId,
        players: publicPlayers,
        spectators: room.spectators || [],
        maxPlayers: room.maxPlayers,
        started: room.started
    };
    room.players.forEach(p => {
        if (!p.isAI) {
            io.to(p.id).emit('roomUpdate', data);
        }
    });
    // Also update spectators
    (room.spectators || []).forEach(s => {
        io.to(s.id).emit('roomUpdate', data);
    });
    // Update room list for all lobby users
    broadcastRoomList();
}

function broadcastRoomList() {
    const list = Object.values(rooms).map(r => ({
        code: r.code,
        playerCount: r.players.length,
        maxPlayers: r.maxPlayers,
        spectatorCount: (r.spectators || []).length,
        started: r.started,
        hostName: (r.players.find(p => p.id === r.hostId) || {}).name || 'unknown'
    }));
    io.emit('roomList', list);
}

function getPlayerName(room, seatIndex) {
    const p = room.players.find(pl => pl.seatIndex === seatIndex);
    return p ? p.name : `玩家${seatIndex + 1}`;
}

function sanitizeGameStateForPlayer(room, socketId) {
    const gs = room.gameState;
    if (!gs) return null;
    const mySeat = room.players.find(p => p.id === socketId);
    const mySeatIndex = mySeat ? mySeat.seatIndex : -1;

    const isShowdown = gs.phase === 'SHOWDOWN';
    const playersData = {};
    for (const [seatStr, pData] of Object.entries(gs.players)) {
        const seat = parseInt(seatStr);
        playersData[seat] = {
            seatIndex: seat,
            cardCount: pData.cards.length,
            cards: (seat === mySeatIndex || isShowdown) ? pData.cards : pData.cards.map(() => null),
            handScore: isShowdown ? pData.handScore : null,
            handName: isShowdown ? pData.handName : null,
            totalLosses: pData.totalLosses
        };
    }

    // Build name map
    const playerNames = {};
    room.players.forEach(p => { playerNames[p.seatIndex] = p.name; });

    return {
        phase: gs.phase,
        players: playersData,
        playerNames,
        hostId: room.hostId,
        currentRule: gs.currentRule,
        gameMultiplier: gs.gameMultiplier,
        loserId: gs.loserId,
        finalPlayerId: gs.finalPlayerId,
        targetLoserRanks: gs.targetLoserRanks,
        totalPlayers: gs.totalPlayers,
        turnCircle: gs.turnCircle,
        mySeatIndex: gs.turnCircle.includes(mySeatIndex) ? mySeatIndex : -1,
        isSpectator: !gs.turnCircle.includes(mySeatIndex),
        currentPassFrom: gs.passQueue.length > 0 ? gs.passQueue[0].from : null,
        currentPassTo: gs.passQueue.length > 0 ? gs.passQueue[0].to : null,
        message: gs.message || '',
        showdownResult: isShowdown ? gs.showdownResult : null,
        ruleNames: { 'SAN_PI': '三匹', 'TEN_HALF': '10点半', 'LAO_YAN_CAI': '捞腌菜' }
    };
}

function broadcastGameState(room) {
    room.players.forEach(p => {
        if (!p.isAI) {
            const state = sanitizeGameStateForPlayer(room, p.id);
            io.to(p.id).emit('gameStateUpdate', state);
        }
    });
    // Send spectator view (showdown-like: all cards visible)
    (room.spectators || []).forEach(s => {
        const state = sanitizeGameStateForSpectator(room, s);
        io.to(s.id).emit('gameStateUpdate', state);
    });
}

function sanitizeGameStateForSpectator(room, spectator) {
    const gs = room.gameState;
    if (!gs) return null;
    const isShowdown = gs.phase === 'SHOWDOWN';
    const playersData = {};
    for (const [seatStr, pData] of Object.entries(gs.players)) {
        const isTarget = (spectator && spectator.targetSeatIndex !== undefined && spectator.targetSeatIndex == seatStr);
        playersData[seatStr] = {
            cards: (isTarget || isShowdown) ? pData.cards : pData.cards.map(() => null),
            totalLosses: pData.totalLosses || 0,
            handName: isShowdown ? pData.handName : ''
        };
    }
    const playerNames = {};
    room.players.forEach(p => { playerNames[p.seatIndex] = p.name; });
    return {
        phase: gs.phase,
        players: playersData,
        playerNames,
        hostId: room.hostId,
        currentRule: gs.currentRule,
        gameMultiplier: gs.gameMultiplier,
        loserId: gs.loserId,
        finalPlayerId: gs.finalPlayerId,
        targetLoserRanks: gs.targetLoserRanks,
        totalPlayers: gs.totalPlayers,
        turnCircle: gs.turnCircle,
        mySeatIndex: -1,
        isSpectator: true,
        spectatingTargetSeat: spectator ? spectator.targetSeatIndex : undefined,
        currentPassFrom: gs.passQueue.length > 0 ? gs.passQueue[0].from : null,
        currentPassTo: gs.passQueue.length > 0 ? gs.passQueue[0].to : null,
        message: gs.message || '',
        showdownResult: isShowdown ? gs.showdownResult : null,
        ruleNames: { 'SAN_PI': '三匹', 'TEN_HALF': '10点半', 'LAO_YAN_CAI': '捞腌菜' }
    };
}

function startGame(room) {
    room.started = true;
    const n = room.players.length;
    const turnCircle = room.players.map(p => p.seatIndex);

    const players = {};
    for (let i = 0; i < n; i++) {
        players[turnCircle[i]] = { cards: [], seatIndex: turnCircle[i], handScore: 0, handName: '', totalLosses: 0 };
    }

    room.gameState = {
        deck: [],
        players,
        phase: 'PRE_DEAL_RANK',
        currentRule: null,
        gameMultiplier: 1,
        loserId: turnCircle[0], // first game: host decides
        passQueue: [],
        finalPlayerId: turnCircle[0],
        targetLoserRanks: [2],
        totalPlayers: n,
        turnCircle,
        message: '',
        showdownResult: null
    };

    promptRankSelection(room);
}

function promptRankSelection(room) {
    const gs = room.gameState;
    gs.phase = 'PRE_DEAL_RANK';
    gs.finalPlayerId = gs.loserId;

    const loserPlayer = room.players.find(p => p.seatIndex === gs.loserId);

    if (loserPlayer && !loserPlayer.isAI) {
        gs.message = `上一局输家是 ${loserPlayer.name}，请指定这局打第几大的输...`;
        broadcastGameState(room);
    } else {
        // AI picks
        let numTargets = Math.floor(Math.random() * 2) + 1;
        if (numTargets > gs.totalPlayers - 1) numTargets = gs.totalPlayers - 1;
        const ranks = [];
        while (ranks.length < numTargets) {
            const r = Math.floor(Math.random() * gs.totalPlayers) + 1;
            if (!ranks.includes(r)) ranks.push(r);
        }
        ranks.sort((a, b) => a - b);
        gs.targetLoserRanks = ranks;
        const rankTextList = ranks.map(r => r === 1 ? "最大" : (r === gs.totalPlayers ? "最小" : `第 ${r} 大`)).join("、");
        gs.message = `${loserPlayer ? loserPlayer.name : 'AI'} 指定：这局打 ${rankTextList} 的输！开始发牌...`;
        broadcastGameState(room);
        setTimeout(() => dealAndStartPass(room), 2000);
    }
}

function dealAndStartPass(room) {
    const gs = room.gameState;
    const n = gs.totalPlayers;
    const tc = gs.turnCircle;
    const loserIdx = tc.indexOf(gs.loserId);

    const backwardsOrder = [];
    for (let i = 0; i < n; i++) {
        let idx = (loserIdx - i + n) % n;
        backwardsOrder.push(tc[idx]);
    }

    gs.passQueue = [];
    for (let i = n - 1; i > 0; i--) {
        gs.passQueue.push({ from: backwardsOrder[i], to: backwardsOrder[i - 1] });
    }

    gs.deck = createDeck();
    gs.players[backwardsOrder[0]].cards = [gs.deck.pop()];
    for (let i = 1; i < n - 1; i++) {
        gs.players[backwardsOrder[i]].cards = [gs.deck.pop(), gs.deck.pop()];
    }
    gs.players[backwardsOrder[n - 1]].cards = [gs.deck.pop(), gs.deck.pop(), gs.deck.pop()];

    gs.phase = 'PASSING';
    gs.currentRule = null;
    gs.gameMultiplier = 1;
    gs.showdownResult = null;

    // reset hand scores
    for (const seat of tc) {
        gs.players[seat].handScore = 0;
        gs.players[seat].handName = '';
    }

    gs.message = '发牌完成，开始传牌...';
    broadcastGameState(room);
    setTimeout(() => processNextPass(room), 1500);
}

function processNextPass(room) {
    const gs = room.gameState;
    if (gs.passQueue.length === 0) {
        startChooseRule(room);
        return;
    }

    const currentPass = gs.passQueue[0];
    const fromPlayer = room.players.find(p => p.seatIndex === currentPass.from);
    const toPlayer = room.players.find(p => p.seatIndex === currentPass.to);

    if (fromPlayer && !fromPlayer.isAI) {
        gs.phase = 'HUMAN_PASS';
        gs.message = `${fromPlayer.name}，请选择一张牌传给 ${toPlayer ? toPlayer.name : '下家'}`;
        broadcastGameState(room);
    } else {
        gs.phase = 'AI_PASS';
        gs.message = `${fromPlayer ? fromPlayer.name : 'AI'} 正在思考传哪张牌...`;
        broadcastGameState(room);
        setTimeout(() => {
            const cards = gs.players[currentPass.from].cards;
            const idx = aiPickCardToPass(cards);
            const passedCard = cards.splice(idx, 1)[0];
            gs.players[currentPass.to].cards.push(passedCard);
            gs.passQueue.shift();
            processNextPass(room);
        }, 1500);
    }
}

function startChooseRule(room) {
    const gs = room.gameState;
    const finalPlayer = room.players.find(p => p.seatIndex === gs.finalPlayerId);

    if (finalPlayer && !finalPlayer.isAI) {
        gs.phase = 'HUMAN_CHOOSE_RULE';
        gs.message = `传牌完毕！${finalPlayer.name} 请指定本局玩法：`;
        broadcastGameState(room);
    } else {
        gs.phase = 'AI_CHOOSE_RULE';
        gs.message = `传牌完毕！${finalPlayer ? finalPlayer.name : 'AI'} 正在指定玩法...`;
        broadcastGameState(room);
        setTimeout(() => {
            const rules = ['SAN_PI', 'TEN_HALF', 'LAO_YAN_CAI'];
            const chosenRule = rules[Math.floor(Math.random() * rules.length)];
            applyRule(room, chosenRule);
        }, 1500);
    }
}

function applyRule(room, rule) {
    const gs = room.gameState;
    const ruleNames = { 'SAN_PI': '三匹', 'TEN_HALF': '10点半', 'LAO_YAN_CAI': '捞腌菜' };
    gs.currentRule = rule;
    const rankTextList = gs.targetLoserRanks.map(r => r === 1 ? "最大" : (r === gs.totalPlayers ? "最小" : `第${r}大`)).join("、");
    const chooserName = getPlayerName(room, gs.finalPlayerId);
    gs.message = `${chooserName} 指定：${ruleNames[rule]}，打 ${rankTextList}的输！准备结算...`;
    gs.phase = 'SHOWDOWN';

    // Evaluate hands
    let addMultiplier = 0;
    const playersArr = [];
    for (const seat of gs.turnCircle) {
        const result = getHandEval(gs.players[seat].cards, rule);
        gs.players[seat].handScore = result.score;
        gs.players[seat].handName = result.name;
        addMultiplier += result.multiplierContrib;
        playersArr.push(gs.players[seat]);
    }
    gs.gameMultiplier += addMultiplier;

    playersArr.sort((a, b) => b.handScore - a.handScore);

    const loserObjs = gs.targetLoserRanks.map(rank => playersArr[rank - 1]).filter(Boolean);
    let nextRoundLoserId = loserObjs[loserObjs.length - 1].seatIndex;
    for (let obj of loserObjs) {
        if (playersArr.indexOf(obj) > playersArr.indexOf(loserObjs[loserObjs.length - 1])) nextRoundLoserId = obj.seatIndex;
    }
    gs.loserId = nextRoundLoserId;

    const rankings = playersArr.map((p, index) => ({
        seatIndex: p.seatIndex,
        rankName: RANK_NAMES[index] || `第${index + 1}`,
        handName: p.handName,
        isLoser: loserObjs.includes(p)
    }));

    let extraMsg = "";
    loserObjs.forEach(loserObj => {
        let finalMultiplier = gs.gameMultiplier;
        if (loserObj.seatIndex === gs.finalPlayerId) {
            finalMultiplier += 1;
            extraMsg += `（${getPlayerName(room, loserObj.seatIndex)} 触发自摸打脸结论，额外+1倍惩罚！）`;
        }
        gs.players[loserObj.seatIndex].totalLosses += finalMultiplier;
        loserObj.finalM = finalMultiplier;
    });

    const rankTextList2 = gs.targetLoserRanks.map(r => r === 1 ? "最大" : (r === gs.totalPlayers ? "最小" : `第 ${r} 大`)).join("、");
    const loserNames = loserObjs.map(obj => `${getPlayerName(room, obj.seatIndex)} (输${obj.finalM}倍)`).join(" 和 ");

    gs.showdownResult = {
        rankings,
        loserNames,
        rankTextList: rankTextList2,
        extraMsg,
        nextRoundLoserId,
        nextRoundLoserName: getPlayerName(room, nextRoundLoserId)
    };
    gs.message = `游戏结束！出局名次是 ${rankTextList2}，出局者：${loserNames}！ ${extraMsg} 下一局由 ${getPlayerName(room, nextRoundLoserId)} 定规则。`;

    broadcastGameState(room);
}

// ===================== Socket.IO Events =====================

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Send room list on connect
    socket.on('requestRoomList', () => {
        const list = Object.values(rooms).map(r => ({
            code: r.code,
            playerCount: r.players.length,
            maxPlayers: r.maxPlayers,
            spectatorCount: (r.spectators || []).length,
            started: r.started,
            hostName: (r.players.find(p => p.id === r.hostId) || {}).name || 'unknown'
        }));
        socket.emit('roomList', list);
    });

    socket.on('createRoom', ({ name, maxPlayers }) => {
        const code = Math.random().toString(36).substring(2, 6).toUpperCase();
        const room = createRoom(code, socket, name);
        room.maxPlayers = maxPlayers || 4;
        socket.join(code);
        socket.emit('roomCreated', { code });
        broadcastRoomState(room);
    });

    // ---- SPECTATE ----
    socket.on('spectateRoom', ({ code, name }) => {
        const room = getRoom(code);
        if (!room) { socket.emit('error', { msg: '房间不存在！' }); return; }
        room.spectators = room.spectators || [];
        const specObj = { id: socket.id, name: name || '观众', targetSeatIndex: undefined };
        room.spectators.push(specObj);
        socket.join(code);
        socket.emit('spectateStarted', { code });
        broadcastRoomState(room);
        if (room.gameState) {
            const state = sanitizeGameStateForSpectator(room, specObj);
            socket.emit('gameStateUpdate', state);
        }
    });

    // ---- REQUEST SPECTATE TARGET ----
    socket.on('requestSpectateTarget', ({ seatIndex }) => {
        const room = findSpectatorRoom(socket.id);
        if (!room) return;
        const spectator = room.spectators.find(s => s.id === socket.id);
        if (!spectator) return;
        const targetPlayer = room.players.find(p => p.seatIndex === seatIndex);
        if (!targetPlayer) return;

        if (targetPlayer.isAI) {
            // Auto approve for AI
            spectator.targetSeatIndex = seatIndex;
            socket.emit('spectateTargetApproved', { seatIndex });
            socket.emit('gameStateUpdate', sanitizeGameStateForSpectator(room, spectator));
            broadcastRoomState(room);
        } else {
            // Request from Human
            io.to(targetPlayer.id).emit('informSpectateRequest', {
                requesterId: spectator.id,
                requesterName: spectator.name,
                seatIndex
            });
            socket.emit('spectateTargetSent');
        }
    });

    socket.on('approveSpectate', ({ requesterId }) => {
        const room = findRoomBySocket(socket.id);
        if (!room) return;
        const myPlayer = room.players.find(p => p.id === socket.id);
        if (!myPlayer) return;

        const spectator = (room.spectators || []).find(s => s.id === requesterId);
        if (!spectator) return;

        spectator.targetSeatIndex = myPlayer.seatIndex;
        io.to(requesterId).emit('spectateTargetApproved', { seatIndex: myPlayer.seatIndex });
        io.to(requesterId).emit('gameStateUpdate', sanitizeGameStateForSpectator(room, spectator));
        broadcastRoomState(room);
    });

    socket.on('rejectSpectate', ({ requesterId }) => {
        io.to(requesterId).emit('spectateTargetRejected');
    });

    // ---- JOIN REQUEST (mid-game) ----
    socket.on('requestJoinGame', ({ code, name }) => {
        const room = getRoom(code);
        if (!room) { socket.emit('error', { msg: '房间不存在！' }); return; }
        room.joinRequests = room.joinRequests || [];
        // Prevent duplicate
        if (room.joinRequests.some(r => r.id === socket.id)) { socket.emit('error', { msg: '已经发送过申请，请等待房主审批' }); return; }
        room.joinRequests.push({ id: socket.id, name });
        socket.emit('joinRequestSent', { code });
        // Notify host
        const aiPlayers = room.players.filter(p => p.isAI);
        io.to(room.hostId).emit('joinRequest', {
            requesterId: socket.id,
            requesterName: name,
            aiPlayers: aiPlayers.map(p => ({ seatIndex: p.seatIndex, name: p.name })),
            currentCount: room.players.length,
            maxPlayers: room.maxPlayers
        });
    });

    // ---- HOST APPROVES JOIN ----
    socket.on('approveJoin', ({ requesterId, replaceSeatIndex, expandMax }) => {
        const room = findRoomBySocket(socket.id);
        if (!room || room.hostId !== socket.id) return;
        room.joinRequests = room.joinRequests || [];
        const reqIdx = room.joinRequests.findIndex(r => r.id === requesterId);
        if (reqIdx === -1) return;
        const req = room.joinRequests.splice(reqIdx, 1)[0];

        // Remove from spectators if they were spectating
        room.spectators = (room.spectators || []).filter(s => s.id !== requesterId);

        if (replaceSeatIndex !== undefined && replaceSeatIndex !== null) {
            // Replace an AI player
            const aiPlayer = room.players.find(p => p.seatIndex === replaceSeatIndex && p.isAI);
            if (aiPlayer) {
                aiPlayer.id = requesterId;
                aiPlayer.name = req.name;
                aiPlayer.isAI = false;
                const reqSocket = io.sockets.sockets.get(requesterId);
                if (reqSocket) reqSocket.join(room.code);
                io.to(requesterId).emit('joinApproved', { code: room.code });
                broadcastRoomState(room);
                if (room.gameState) broadcastGameState(room);
            }
        } else if (expandMax) {
            // Expand max players and add as new player
            room.maxPlayers = Math.max(room.maxPlayers, room.players.length + 1);
            const seatIndex = room.players.length;
            room.players.push({ id: requesterId, name: req.name, seatIndex, isAI: false });
            const reqSocket = io.sockets.sockets.get(requesterId);
            if (reqSocket) reqSocket.join(room.code);
            io.to(requesterId).emit('joinApproved', { code: room.code });
            // Do NOT insert into current gameState. They will join properly in nextRound()
            broadcastRoomState(room);
            if (room.gameState) broadcastGameState(room);
        }
    });

    // ---- HOST REJECTS JOIN ----
    socket.on('rejectJoin', ({ requesterId }) => {
        const room = findRoomBySocket(socket.id);
        if (!room || room.hostId !== socket.id) return;
        room.joinRequests = (room.joinRequests || []).filter(r => r.id !== requesterId);
        io.to(requesterId).emit('joinRejected');
    });

    socket.on('joinRoom', ({ code, name }) => {
        const room = getRoom(code);
        if (!room) { socket.emit('error', { msg: '房间不存在！' }); return; }

        // Check if this is a reconnection attempt (game already started, matching name)
        if (room.started) {
            const dcPlayer = room.players.find(p => p.isAI && p.originalName === name);
            if (dcPlayer) {
                // Reconnect!
                dcPlayer.id = socket.id;
                dcPlayer.isAI = false;
                dcPlayer.name = name; // restore clean name
                // If this player was the original host, restore host status
                if (dcPlayer.wasHost) {
                    room.hostId = socket.id;
                    dcPlayer.wasHost = false;
                }
                socket.join(code);
                console.log(`Player ${name} reconnected to room ${code} at seat ${dcPlayer.seatIndex}`);
                socket.emit('roomJoined', { code });
                broadcastRoomState(room);
                if (room.gameState) broadcastGameState(room);
                return;
            }
            socket.emit('error', { msg: '游戏已经开始，且没有找到与你同名的断线玩家可以重连！' });
            return;
        }

        if (room.players.length >= room.maxPlayers) { socket.emit('error', { msg: '房间已满！' }); return; }

        const seatIndex = room.players.length;
        room.players.push({ id: socket.id, name, seatIndex, isAI: false });
        socket.join(code);
        socket.emit('roomJoined', { code });
        broadcastRoomState(room);
    });

    socket.on('addAI', () => {
        const room = findRoomBySocket(socket.id);
        if (!room || room.hostId !== socket.id) return;
        if (room.players.length >= room.maxPlayers) return;
        const seatIndex = room.players.length;
        room.players.push({ id: `ai_${seatIndex}_${Date.now()}`, name: `AI ${seatIndex + 1}`, seatIndex, isAI: true });
        broadcastRoomState(room);
    });

    socket.on('removePlayer', ({ seatIndex }) => {
        const room = findRoomBySocket(socket.id);
        if (!room || room.hostId !== socket.id) return;
        const idx = room.players.findIndex(p => p.seatIndex === seatIndex);
        if (idx > 0) { // can't remove host (index 0)
            room.players.splice(idx, 1);
            // re-index seats
            room.players.forEach((p, i) => p.seatIndex = i);
            broadcastRoomState(room);
        }
    });

    socket.on('startGame', () => {
        const room = findRoomBySocket(socket.id);
        if (!room || room.hostId !== socket.id) return;
        if (room.players.length < 3) { socket.emit('error', { msg: '至少需要3名玩家！' }); return; }
        startGame(room);
    });

    socket.on('confirmRanks', ({ ranks }) => {
        const room = findRoomBySocket(socket.id);
        if (!room || !room.gameState) return;
        const gs = room.gameState;
        if (gs.phase !== 'PRE_DEAL_RANK') return;
        const myPlayer = room.players.find(p => p.id === socket.id);
        if (!myPlayer || myPlayer.seatIndex !== gs.finalPlayerId) return;
        if (!ranks || ranks.length === 0) return;

        gs.targetLoserRanks = ranks.sort((a, b) => a - b);
        const rankTextList = gs.targetLoserRanks.map(r => r === 1 ? "最大" : (r === gs.totalPlayers ? "最小" : `第 ${r} 大`)).join("、");
        gs.message = `${myPlayer.name} 指定了：这局打 ${rankTextList} 的输！开始发牌...`;
        broadcastGameState(room);
        setTimeout(() => dealAndStartPass(room), 1500);
    });

    socket.on('passCard', ({ cardIndex }) => {
        const room = findRoomBySocket(socket.id);
        if (!room || !room.gameState) return;
        const gs = room.gameState;
        if (gs.phase !== 'HUMAN_PASS') return;
        const currentPass = gs.passQueue[0];
        if (!currentPass) return;
        const myPlayer = room.players.find(p => p.id === socket.id);
        if (!myPlayer || myPlayer.seatIndex !== currentPass.from) return;

        const cards = gs.players[currentPass.from].cards;
        if (cardIndex < 0 || cardIndex >= cards.length) return;

        const passedCard = cards.splice(cardIndex, 1)[0];
        gs.players[currentPass.to].cards.push(passedCard);
        gs.passQueue.shift();
        processNextPass(room);
    });

    socket.on('chooseRule', ({ rule }) => {
        const room = findRoomBySocket(socket.id);
        if (!room || !room.gameState) return;
        const gs = room.gameState;
        if (gs.phase !== 'HUMAN_CHOOSE_RULE') return;
        const myPlayer = room.players.find(p => p.id === socket.id);
        if (!myPlayer || myPlayer.seatIndex !== gs.finalPlayerId) return;
        if (!['SAN_PI', 'TEN_HALF', 'LAO_YAN_CAI'].includes(rule)) return;

        applyRule(room, rule);
    });

    socket.on('nextRound', () => {
        const room = findRoomBySocket(socket.id);
        if (!room || !room.gameState) return;
        if (room.gameState.phase !== 'SHOWDOWN') return;
        if (room.hostId !== socket.id) return;

        // Reset for next round but keep totalLosses
        const gs = room.gameState;

        // Sync new players
        gs.totalPlayers = room.players.length;
        gs.turnCircle = room.players.map(p => p.seatIndex);

        for (const seat of gs.turnCircle) {
            if (!gs.players[seat]) {
                gs.players[seat] = { cards: [], seatIndex: seat, handScore: 0, handName: '', totalLosses: 0 };
            } else {
                gs.players[seat].cards = [];
                gs.players[seat].handScore = 0;
                gs.players[seat].handName = '';
            }
        }
        gs.showdownResult = null;
        promptRankSelection(room);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const room = findRoomBySocket(socket.id);
        if (!room) return;
        const idx = room.players.findIndex(p => p.id === socket.id);
        if (idx === -1) return;

        if (room.started) {
            // Replace with AI, but save original name for reconnection
            const originalName = room.players[idx].name.replace(' (断线)', ''); // clean name
            room.players[idx].isAI = true;
            room.players[idx].originalName = originalName; // store for reconnection matching
            room.players[idx].wasHost = (room.hostId === socket.id); // remember if they were host
            room.players[idx].name = originalName + ' (断线)';
            room.players[idx].id = `ai_dc_${Date.now()}`;

            // Handle host reassignment if the host disconnected
            if (room.hostId === socket.id) {
                const newHost = room.players.find(p => !p.isAI);
                if (newHost) {
                    room.hostId = newHost.id;
                } else {
                    // No humans left handling
                    delete rooms[room.code];
                    broadcastRoomList();
                    return; // exit the disconnect flow
                }
            }

            broadcastRoomState(room);
            broadcastGameState(room);

            // If it was this player's turn, auto-trigger AI action
            const gs = room.gameState;
            if (gs) {
                if (gs.phase === 'HUMAN_PASS' && gs.passQueue.length > 0 && gs.passQueue[0].from === room.players[idx].seatIndex) {
                    setTimeout(() => processNextPass(room), 1000);
                }
                if (gs.phase === 'HUMAN_CHOOSE_RULE' && gs.finalPlayerId === room.players[idx].seatIndex) {
                    setTimeout(() => {
                        const rules = ['SAN_PI', 'TEN_HALF', 'LAO_YAN_CAI'];
                        applyRule(room, rules[Math.floor(Math.random() * rules.length)]);
                    }, 1000);
                }
                if (gs.phase === 'PRE_DEAL_RANK' && gs.loserId === room.players[idx].seatIndex) {
                    setTimeout(() => {
                        gs.targetLoserRanks = [2];
                        dealAndStartPass(room);
                    }, 1000);
                }
            }
        } else {
            room.players.splice(idx, 1);
            room.players.forEach((p, i) => p.seatIndex = i);
            if (room.players.filter(p => !p.isAI).length === 0) {
                delete rooms[room.code];
                broadcastRoomList();
            } else {
                if (room.hostId === socket.id && room.players.length > 0) {
                    const newHost = room.players.find(p => !p.isAI);
                    if (newHost) room.hostId = newHost.id;
                }
                broadcastRoomState(room);
            }
        }

        // Also remove from spectators
        const specRoom = findSpectatorRoom(socket.id);
        if (specRoom) {
            specRoom.spectators = (specRoom.spectators || []).filter(s => s.id !== socket.id);
            broadcastRoomState(specRoom);
        }
    });
});

function findRoomBySocket(socketId) {
    for (const code of Object.keys(rooms)) {
        if (rooms[code].players.some(p => p.id === socketId)) return rooms[code];
    }
    return null;
}

function findSpectatorRoom(socketId) {
    for (const code of Object.keys(rooms)) {
        if ((rooms[code].spectators || []).some(s => s.id === socketId)) return rooms[code];
    }
    return null;
}

const PORT = process.env.PORT || 3005;
server.listen(PORT, () => {
    console.log(`传牌游戏服务器已启动: http://localhost:${PORT}`);
});
