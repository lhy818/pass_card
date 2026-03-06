const UI = {
    btnStart: document.getElementById('btn-start'),
    btnAction: document.getElementById('btn-action'),
    message: document.getElementById('message'),
    cards1: document.getElementById('cards1'),
    cards2: document.getElementById('cards2'),
    cards3: document.getElementById('cards3'),
    score1: document.getElementById('score1'),
    score2: document.getElementById('score2'),
    score3: document.getElementById('score3'),
    ruleDisplay: document.getElementById('rule-display'),
    ruleName: document.getElementById('current-rule-name'),
    multiplierVal: document.getElementById('current-multiplier'),
    targetRanksDisplay: document.getElementById('current-target-ranks'),
    ruleSelection: document.getElementById('rule-selection')
};

let gameState = {
    deck: [],
    players: {},
    phase: 'IDLE',
    selectedCardIndex: -1,
    currentRule: null,
    gameMultiplier: 1,
    loserId: 1,
    passQueue: [], // array of { from: id, to: id }
    finalPlayerId: 1, // the one who gets 1 card and chooses rule
    targetLoserRanks: [2] // which ranks lose
};

let TOTAL_PLAYERS = 0;
let turnCircle = [];

function setupPlayers(n) {
    TOTAL_PLAYERS = n;
    turnCircle = Array.from({ length: n }, (_, i) => i + 1);

    gameState.players = {};
    for (let i = 1; i <= n; i++) {
        gameState.players[i] = { cards: [], id: i, handScore: 0, totalLosses: 0 };
    }

    const container = document.getElementById('players-container');
    container.innerHTML = '';

    // Position human (id=2) at the bottom (Math.PI / 2)
    const humanIdx = turnCircle.indexOf(2);
    for (let i = 0; i < n; i++) {
        const pId = turnCircle[i];

        let theta = 0;
        if (pId === 2) {
            theta = Math.PI / 2; // Exact bottom
        } else {
            // Distribute remaining players
            let diff = i - humanIdx;
            if (diff < 0) diff += n;
            theta = Math.PI / 2 + diff * (2 * Math.PI / n);
        }

        let rx = 40; // 40%
        let ry = 35; // 35%
        const left = 50 + Math.cos(theta) * rx;
        const top = 50 + Math.sin(theta) * ry;

        const div = document.createElement('div');
        div.className = 'player';
        div.id = `player${pId}`;
        div.style.position = 'absolute';
        div.style.left = `${left}%`;
        div.style.top = `${top}%`;
        div.style.transform = `translate(-50%, -50%)`;
        div.innerHTML = `
            <div class="info">
                <strong>玩家 ${pId} ${pId === 2 ? '(你)' : '(AI)'} <span id="cups${pId}" style="color: #ffeb3b; font-weight: normal; font-size: 14px;">(0杯)</span></strong>
                <span id="score${pId}" class="score"></span>
            </div>
            <div class="cards" id="cards${pId}"></div>
            <div class="status" id="status${pId}"></div>
        `;
        container.appendChild(div);
    }

    const loserRankCheckboxes = document.getElementById('pre-loser-rank-checkboxes');
    if (loserRankCheckboxes) {
        loserRankCheckboxes.innerHTML = '';
        for (let i = 1; i <= n; i++) {
            let label = `第 ${i} 大`;
            if (i === 1) label += " (最大)";
            if (i === n) label += " (最小)";

            const labelEl = document.createElement('label');
            labelEl.style.color = "white";
            labelEl.style.cursor = "pointer";
            labelEl.style.display = "flex";
            labelEl.style.alignItems = "center";
            labelEl.style.gap = "4px";
            labelEl.style.fontSize = "16px";
            labelEl.innerHTML = `<input type="checkbox" value="${i}" ${i === 2 ? 'checked' : ''}> ${label}`;
            loserRankCheckboxes.appendChild(labelEl);
        }
    }
}

function getPlayerName(id) {
    if (id === 2) return "2 (你)";
    return `${id} (AI)`;
}

function initGame() {
    UI.btnStart.classList.add('hidden');
    UI.ruleDisplay.classList.add('hidden');
    UI.ruleName.textContent = '（未指定）';
    UI.targetRanksDisplay.textContent = '（未指定）';
    UI.multiplierVal.textContent = '1';

    const countInput = document.getElementById('player-count');
    const setupControls = document.getElementById('setup-controls');

    if (setupControls) setupControls.classList.add('hidden'); // lock player count

    let requestedCount = countInput ? parseInt(countInput.value) : 4;
    if (requestedCount < 3) requestedCount = 3;
    if (requestedCount > 10) requestedCount = 10;

    if (TOTAL_PLAYERS === 0 || requestedCount !== TOTAL_PLAYERS) {
        setupPlayers(requestedCount);
        gameState.loserId = 2;
    }

    gameState.finalPlayerId = gameState.loserId;

    if (gameState.finalPlayerId === 2) {
        // Human's turn to pick
        const preDealRankSelection = document.getElementById('pre-deal-rank-selection');
        if (preDealRankSelection) preDealRankSelection.classList.remove('hidden');
        UI.message.innerHTML = `上一局输家是你，发牌前请您先指定这局打<strong style="color:#ff5555">第几大</strong>的输...`;
    } else {
        // AI's turn to pick
        let numTargets = Math.floor(Math.random() * 2) + 1; // Pick 1 or 2 losers
        if (numTargets > TOTAL_PLAYERS - 1) numTargets = TOTAL_PLAYERS - 1;
        const ranks = [];
        while (ranks.length < numTargets) {
            const r = Math.floor(Math.random() * TOTAL_PLAYERS) + 1;
            if (!ranks.includes(r)) ranks.push(r);
        }
        ranks.sort((a, b) => a - b);
        gameState.targetLoserRanks = ranks;

        UI.message.innerHTML = `上一局输家是 玩家 ${gameState.finalPlayerId} (AI)，正在思考指定谁输...`;
        setTimeout(() => {
            const rankTextList = gameState.targetLoserRanks.map(r => r === 1 ? "最大" : (r === TOTAL_PLAYERS ? "最小" : `第 ${r} 大`)).join("、");
            UI.message.innerHTML = `玩家 ${gameState.finalPlayerId} (AI) 指定：这局打 <strong>${rankTextList}</strong> 的输！开始发牌...`;
            setTimeout(dealCardsAndStartPass, 1500);
        }, 1500);
    }
}

window.humanConfirmRankAndDeal = function () {
    const checkedBoxes = Array.from(document.querySelectorAll('#pre-loser-rank-checkboxes input:checked'));
    if (checkedBoxes.length === 0) {
        alert("请至少指定一个输家名次！");
        return;
    }
    gameState.targetLoserRanks = checkedBoxes.map(cb => parseInt(cb.value));

    const preDealRankSelection = document.getElementById('pre-deal-rank-selection');
    if (preDealRankSelection) {
        preDealRankSelection.classList.add('hidden');
    }
    const rankTextList = gameState.targetLoserRanks.map(r => r === 1 ? "最大" : (r === TOTAL_PLAYERS ? "最小" : `第 ${r} 大`)).join("、");
    UI.message.innerHTML = `你指定了：这局打 <strong>${rankTextList}</strong> 的输！开始发牌...`;
    setTimeout(dealCardsAndStartPass, 1000);
}

function dealCardsAndStartPass() {
    const loserIdx = turnCircle.indexOf(gameState.loserId);

    // Array of backwards assignment order.
    // Index 0: loser (1 card)
    // Index n-1: starter (3 cards)
    // Index 1 to n-2: intermediates (2 cards)
    const backwardsOrder = [];
    for (let i = 0; i < TOTAL_PLAYERS; i++) {
        let idx = (loserIdx - i + TOTAL_PLAYERS) % TOTAL_PLAYERS;
        backwardsOrder.push(turnCircle[idx]);
    }

    // Pass queue: backwardsOrder[i] passes to backwardsOrder[i-1] for i from n-1 down to 1
    gameState.passQueue = [];
    for (let i = TOTAL_PLAYERS - 1; i > 0; i--) {
        gameState.passQueue.push({ from: backwardsOrder[i], to: backwardsOrder[i - 1] });
    }

    turnCircle.forEach(id => {
        const scoreEl = document.getElementById(`score${id}`);
        if (scoreEl) scoreEl.textContent = '';

        const playerEl = document.getElementById(`player${id}`);
        if (playerEl) {
            playerEl.classList.remove('loser-anim', 'winner-anim');
            const infoEl = playerEl.querySelector('.info');
            if (infoEl) {
                infoEl.classList.remove('loser-tag');
            }
        }
    });

    const rankTextList = gameState.targetLoserRanks.map(r => r === 1 ? "最大" : (r === TOTAL_PLAYERS ? "最小" : `第${r}大`)).join("、");
    UI.targetRanksDisplay.textContent = rankTextList;
    UI.ruleDisplay.classList.remove('hidden');

    if (UI.ruleSelection) UI.ruleSelection.classList.add('hidden');

    gameState.phase = 'IDLE';
    gameState.currentRule = null;
    gameState.gameMultiplier = 1;

    createDeck();

    // Deal cards
    gameState.players[backwardsOrder[0]].cards = [drawCard()]; // Loser
    for (let i = 1; i < TOTAL_PLAYERS - 1; i++) {
        gameState.players[backwardsOrder[i]].cards = [drawCard(), drawCard()];
    }
    gameState.players[backwardsOrder[TOTAL_PLAYERS - 1]].cards = [drawCard(), drawCard(), drawCard()]; // Starter

    renderCards();

    setTimeout(processNextPass, 1500);
}

function createDeck() {
    const suits = ['hearts', 'diamonds', 'spades', 'clubs'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    gameState.deck = [];
    for (let suit of suits) {
        for (let value of values) {
            gameState.deck.push({ suit, value });
        }
    }
    // Fisher-Yates shuffle
    for (let i = gameState.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [gameState.deck[i], gameState.deck[j]] = [gameState.deck[j], gameState.deck[i]];
    }
}

function drawCard() {
    return gameState.deck.pop();
}

function getSuitSymbol(suit) {
    if (suit === 'hearts') return '♥';
    if (suit === 'diamonds') return '♦';
    if (suit === 'spades') return '♠';
    if (suit === 'clubs') return '♣';
    return '';
}

function renderCards() {
    if (TOTAL_PLAYERS === 0) return;
    const isShowdown = gameState.phase === 'SHOWDOWN';

    turnCircle.forEach(id => {
        const cardsEl = document.getElementById(`cards${id}`);
        if (!cardsEl) return;
        cardsEl.innerHTML = '';

        const isSelectable = (gameState.phase === 'HUMAN_PASS') && id === 2;

        // Only show cards if it's SHOWDOWN or if the cards belong to Player 2 (you)
        const isHidden = !isShowdown && id !== 2;

        gameState.players[id].cards.forEach((card, idx) => {
            cardsEl.appendChild(createCardElement(card, isHidden, isSelectable, id, idx));
        });
    });
}

function createCardElement(card, hidden, selectable, playerId, idx) {
    const el = document.createElement('div');
    if (hidden) {
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

    if (selectable) {
        el.classList.add('selectable');
        if (gameState.selectedCardIndex === idx) {
            el.classList.add('selected');
        }
        el.addEventListener('click', () => {
            if (gameState.phase !== 'HUMAN_PASS') return;
            if (playerId !== 2) return;
            gameState.selectedCardIndex = idx;
            renderCards();
        });
        el.addEventListener('dblclick', () => {
            if (gameState.phase !== 'HUMAN_PASS') return;
            if (playerId !== 2) return;
            gameState.selectedCardIndex = idx;
            UI.btnAction.click(); // Automatically trigger the pass action
        });
    }

    return el;
}

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
    const c1 = cards[0];
    const c2 = cards[1];
    const v1 = getValueRank(c1.value);
    const v2 = getValueRank(c2.value);
    const s1 = getSuitRank(c1.suit);
    const s2 = getSuitRank(c2.suit);

    let highCard, lowCard;
    if (v1 > v2 || (v1 === v2 && s1 > s2)) {
        highCard = c1; lowCard = c2;
    } else {
        highCard = c2; lowCard = c1;
    }
    const highV = getValueRank(highCard.value);
    const lowV = getValueRank(lowCard.value);
    const sHigh = getSuitRank(highCard.suit);
    const sLow = getSuitRank(lowCard.suit);

    let score = 0;
    let name = '';
    let multiplierContrib = 0;

    const isPair = (highV === lowV);
    const isFlush = (highCard.suit === lowCard.suit);
    let isStraight = false;
    let rankDiff = highV - lowV;

    // Normal straights and gaps of 1 (e.g. 5,4 or 5,3)
    if (rankDiff === 1 || rankDiff === 2) {
        isStraight = true;
    }

    // Wrap around cases: A,2 (gap 0 equivalent) and A,3 (gap 1 equivalent)
    if (highV === 14) {
        if (lowV === 2 || lowV === 3) isStraight = true;
    }

    if (isPair) {
        score = 5000000 + highV * 10000 + sHigh * 100 + sLow;
        name = `三匹 ${highCard.value}`;
        multiplierContrib = 1; // Pair doubles in SanPi
    } else if (isStraight && isFlush) {
        score = 4000000 + highV * 10000 + sHigh * 100;
        name = `同花顺`;
    } else if (isFlush) {
        score = 3000000 + highV * 10000 + lowV * 100 + sHigh * 10;
        name = `同花`;
    } else if (isStraight) {
        score = 2000000 + highV * 10000 + sHigh * 100;
        name = `顺子`;
    } else {
        score = 1000000 + highV * 10000 + lowV * 100 + sHigh * 10 + sLow;
        name = `${highCard.value} 高牌 (带 ${lowCard.value})`;
    }

    return { score, name, multiplierContrib };
}

function getTenHalfValueRank(value) {
    if (['J', 'Q', 'K'].includes(value)) return 0.5;
    if (value === 'A') return 1;
    return parseInt(value);
}

function evalTenHalf(cards) {
    const c1 = cards[0];
    const c2 = cards[1];
    const v1 = getTenHalfValueRank(c1.value);
    const v2 = getTenHalfValueRank(c2.value);

    let highCard, lowCard;
    if (v1 > v2 || (v1 === v2 && getSuitRank(c1.suit) > getSuitRank(c2.suit))) {
        highCard = c1; lowCard = c2;
    } else {
        highCard = c2; lowCard = c1;
    }

    const sum = v1 + v2;
    let score = 0;
    let multiplierContrib = 0;

    // Format display string: 7.5 -> 7点半
    let sumDisplay = sum.toString();
    if (sumDisplay.endsWith('.5')) {
        sumDisplay = sumDisplay.replace('.5', '点半');
    } else {
        sumDisplay += ' 点';
    }

    let name = sumDisplay;

    const subSort = getSuitRank(highCard.suit) * 10 + getSuitRank(lowCard.suit);

    if (sum === 10.5) {
        score = 2000000 + subSort;
        name = `10点半!`;
        multiplierContrib = 1;
    } else if (sum > 10.5) {
        score = (100 - sum) * 10000 + subSort;
        name = `${sumDisplay} (暴牌)`;
    } else {
        score = 1000000 + sum * 10000 + subSort;
    }

    return { score, name, multiplierContrib };
}

function getLaoYanCaiValueRank(value) {
    if (['10', 'J', 'Q', 'K'].includes(value)) return 0;
    if (value === 'A') return 1;
    return parseInt(value);
}

function evalLaoYanCai(cards) {
    const c1 = cards[0];
    const c2 = cards[1];
    const v1 = getLaoYanCaiValueRank(c1.value);
    const v2 = getLaoYanCaiValueRank(c2.value);

    // Use full face value (A=14, K=13, etc) to determine the high card for tie-breaking
    const realV1 = getValueRank(c1.value);
    const realV2 = getValueRank(c2.value);

    let highCard, lowCard;
    if (realV1 > realV2 || (realV1 === realV2 && getSuitRank(c1.suit) > getSuitRank(c2.suit))) {
        highCard = c1; lowCard = c2;
    } else {
        highCard = c2; lowCard = c1;
    }
    const highRealV = getValueRank(highCard.value);

    const sum = (v1 + v2) % 10;
    const isPair = (c1.value === c2.value);
    const isFlush = (c1.suit === c2.suit);
    const isShuangYan = (sum !== 0 && (isPair || isFlush));

    // Priority: Sum (0-9) > Shuang Yan > High Card Value > High Card Suit
    let score = sum * 1000000;
    if (isShuangYan) {
        score += 100000;
    }
    score += highRealV * 1000 + getSuitRank(highCard.suit) * 10 + getSuitRank(lowCard.suit);

    let name = `${sum} 点`;
    let multiplierContrib = 0;

    if (sum === 0) {
        name = `睡着 (0点)`;
        multiplierContrib = 0;
    } else {
        if (isShuangYan) {
            name += ` (双腌)`;
            multiplierContrib = 1;
        }
    }

    return { score, name, multiplierContrib };
}

function getHandEval(cards, rule) {
    if (rule === 'SAN_PI') return evalSanPi(cards);
    if (rule === 'TEN_HALF') return evalTenHalf(cards);
    if (rule === 'LAO_YAN_CAI') return evalLaoYanCai(cards);
    return { score: 0, name: '', multiplierContrib: 0 };
}

UI.btnStart.addEventListener('click', initGame);

function processNextPass() {
    renderCards();
    if (gameState.passQueue.length === 0) {
        startChooseRule();
        return;
    }

    const currentPass = gameState.passQueue[0];
    if (currentPass.from === 2) {
        gameState.phase = 'HUMAN_PASS';
        UI.message.innerHTML = `请选择你要传给 <strong>玩家 ${getPlayerName(currentPass.to)}</strong> 的牌`;
        UI.btnAction.textContent = `传给玩家 ${currentPass.to}`;
        UI.btnAction.classList.remove('hidden');
        renderCards(); // make selectable
    } else {
        gameState.phase = 'AI_PASS';
        UI.message.innerHTML = `玩家 ${getPlayerName(currentPass.from)} 正在思考传哪张牌给 玩家 ${getPlayerName(currentPass.to)}...`;
        setTimeout(() => {
            aiExecutePass(currentPass.from, currentPass.to);
            gameState.passQueue.shift();
            processNextPass();
        }, 1500);
    }
}

UI.btnAction.addEventListener('click', () => {
    if (gameState.phase === 'HUMAN_PASS') {
        if (gameState.selectedCardIndex === -1) {
            alert("请先选择一张牌！");
            return;
        }

        const currentPass = gameState.passQueue.shift(); // Remove from queue
        const passedCard = gameState.players[2].cards.splice(gameState.selectedCardIndex, 1)[0];
        gameState.players[currentPass.to].cards.push(passedCard);

        gameState.selectedCardIndex = -1;
        UI.btnAction.classList.add('hidden');
        processNextPass(); // Trigger next pass
        renderCards();
    }
});

function aiExecutePass(fromId, toId) {
    let bestScore = -1;
    let cardToPassIndex = -1;
    const cards = gameState.players[fromId].cards;

    for (let i = 0; i < cards.length; i++) {
        // Construct array of remaining cards if card i is passed
        const remaining = [...cards];
        remaining.splice(i, 1);

        const result = getHandEval(remaining, 'SAN_PI');
        if (result.score > bestScore) {
            bestScore = result.score;
            cardToPassIndex = i;
        }
    }

    const passedCard = cards.splice(cardToPassIndex, 1)[0];
    gameState.players[toId].cards.push(passedCard);
}

function startChooseRule() {
    renderCards();
    if (gameState.finalPlayerId === 2) {
        gameState.phase = 'HUMAN_CHOOSE_RULE';
        UI.message.innerHTML = `传牌完毕！你是最后一家 (只有1张牌)，请指定本局玩法：`;
        UI.ruleSelection.classList.remove('hidden');
    } else {
        gameState.phase = 'AI_CHOOSE_RULE';
        UI.message.innerHTML = `传牌完毕！玩家 ${getPlayerName(gameState.finalPlayerId)} 正在指定玩法...`;
        setTimeout(aiChooseRule, 1500);
    }
}

function aiChooseRule() {
    const rules = ['SAN_PI', 'TEN_HALF', 'LAO_YAN_CAI'];
    const chosenRule = rules[Math.floor(Math.random() * rules.length)];

    applyRule(chosenRule, gameState.finalPlayerId);
}

window.humanChooseRule = function (rule) {
    if (gameState.phase !== 'HUMAN_CHOOSE_RULE') return;
    UI.ruleSelection.classList.add('hidden');

    applyRule(rule, 2);
}

function applyRule(rule, chooserId) {
    const ruleNames = {
        'SAN_PI': '三匹',
        'TEN_HALF': '10点半',
        'LAO_YAN_CAI': '捞腌菜'
    };
    gameState.currentRule = rule;
    UI.ruleName.textContent = ruleNames[rule];
    UI.multiplierVal.textContent = gameState.gameMultiplier;
    UI.ruleDisplay.classList.remove('hidden');

    // Make sure we use the same array formatting used above 
    const rankTextList = gameState.targetLoserRanks.map(r => r === 1 ? "最大" : (r === TOTAL_PLAYERS ? "最小" : `第 ${r} 大`)).join("、");
    UI.message.innerHTML = `玩家 ${getPlayerName(chooserId)} 指定：<strong>${ruleNames[rule]}</strong>，打 <strong>${rankTextList}的输</strong>！准备结算...`;

    gameState.phase = 'SHOWDOWN';
    setTimeout(showdown, 1500);
}

function showdown() {
    renderCards();

    let addMultiplier = 0;
    const playersArr = [];

    turnCircle.forEach(id => {
        const result = getHandEval(gameState.players[id].cards, gameState.currentRule);
        gameState.players[id].handScore = result.score;
        document.getElementById(`score${id}`).textContent = result.name;
        addMultiplier += result.multiplierContrib;
        playersArr.push(gameState.players[id]);
    });

    gameState.gameMultiplier += addMultiplier;
    UI.multiplierVal.textContent = gameState.gameMultiplier;

    playersArr.sort((a, b) => b.handScore - a.handScore);

    // Identify losers
    const loserObjs = gameState.targetLoserRanks.map(rank => playersArr[rank - 1]).filter(Boolean);

    // Pick the loser with the worst rank to be the next dealer
    let nextRoundLoserId = loserObjs[loserObjs.length - 1].id;
    for (let obj of loserObjs) {
        if (playersArr.indexOf(obj) > playersArr.indexOf(loserObjs[loserObjs.length - 1])) nextRoundLoserId = obj.id;
    }
    gameState.loserId = nextRoundLoserId; // 下一局由最差的输家首发1张牌

    // Everyone except the loser gets a winner-anim (or just no loser anim)
    const rankNames = ['老大', '老二', '小三', '四耶', '老五', '老六', '老七', '老八', '老九', '老十'];

    playersArr.forEach((p, index) => {
        const playerEl = document.getElementById(`player${p.id}`);
        if (!playerEl) return;

        const scoreEl = document.getElementById(`score${p.id}`);
        if (scoreEl) {
            const rName = rankNames[index] || `第${index + 1}`;
            scoreEl.innerHTML = `<span style="color:#00ffff; font-weight:bold; margin-right:8px; display:inline-block; background:rgba(0,0,0,0.5); padding:2px 6px; border-radius:4px;">${rName}</span>` + scoreEl.innerHTML;
        }

        if (loserObjs.includes(p)) {
            playerEl.classList.add('loser-anim');
            const loserInfoEl = playerEl.querySelector('.info');
            if (loserInfoEl) {
                loserInfoEl.classList.add('loser-tag');
            }
        } else {
            playerEl.classList.add('winner-anim');
        }
    });

    let extraMsg = "";

    loserObjs.forEach(loserObj => {
        let finalMultiplier = gameState.gameMultiplier;

        // 自摸检查
        if (loserObj.id === gameState.finalPlayerId) {
            finalMultiplier += 1;
            extraMsg += `<br>（玩家 ${getPlayerName(loserObj.id)} 触发自摸打脸结论，自己额外加+1倍惩罚！）`;
        }

        gameState.players[loserObj.id].totalLosses += finalMultiplier;
        const cupsEl = document.getElementById(`cups${loserObj.id}`);
        if (cupsEl) {
            cupsEl.innerText = `(${gameState.players[loserObj.id].totalLosses}杯)`;
        }
        loserObj.finalM = finalMultiplier;
    });

    const rankTextList = gameState.targetLoserRanks.map(r => r === 1 ? "最大" : (r === TOTAL_PLAYERS ? "最小" : `第 ${r} 大`)).join("、");
    const loserNames = loserObjs.map(obj => `<strong style="white-space:nowrap">玩家 ${getPlayerName(obj.id)} (输${obj.finalM}倍)</strong>`).join(" 和 ");

    UI.message.innerHTML = `游戏结束！出局名次是 <span style="font-weight:bold">${rankTextList}</span>，出局者：${loserNames}！ ${extraMsg}<br><span style="font-size: 16px; margin-top:8px; display:inline-block;">下一局由顺位最差的 玩家 ${getPlayerName(nextRoundLoserId)} 定规则。</span>`;

    setTimeout(() => {
        UI.btnStart.textContent = "开始下一局";
        UI.btnStart.classList.remove('hidden');
    }, 1500);
}
