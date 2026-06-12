const socket = io();

// 画面要素の取得
const loginScreen = document.getElementById('login-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const resultScreen = document.getElementById('result-screen');

// ログイン画面の要素
const playerNameInput = document.getElementById('player-name-input');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomIdInput = document.getElementById('room-id-input');

// 待機画面（ロビー）の要素
const lobbyRoomId = document.getElementById('lobby-room-id');
const lobbyMemberList = document.getElementById('lobby-member-list');
const hostControls = document.getElementById('host-controls');

// ゲーム画面の要素
const roomDisplay = document.getElementById('room-display');
const myNameDisplay = document.getElementById('my-name-display');
const statusText = document.getElementById('status');
const gameInfoText = document.getElementById('game-info');
const targetCardDiv = document.getElementById('target-card');
const fieldContainer = document.getElementById('field-container');
const revealArea = document.getElementById('reveal-area');
const revealBtn = document.getElementById('reveal-btn');

// 結果画面の要素
const resultVerdict = document.getElementById('result-verdict');
const voteDetailsContainer = document.getElementById('vote-details-container');
const nextRoundBtn = document.getElementById('next-round-btn');

let myName = "";
let hasIVoted = false; // 💡 自分がこのラウンドで投票済みかどうかを覚えるフラグ

function getValidName() {
    const name = playerNameInput.value.trim();
    if (!name) {
        alert('まずはあなたの名前を入力してください');
        return null;
    }
    return name;
}

// 部屋を作成する
createRoomBtn.onclick = () => {
    if (getValidName() !== null) {
        socket.emit('create-room');
    }
};

socket.on('room-created', (roomId) => {
    const name = getValidName();
    socket.emit('join-room', { roomId: roomId, playerName: name });
});

// 部屋に参加する
joinRoomBtn.onclick = () => {
    const name = getValidName();
    if (name === null) return;

    const roomId = roomIdInput.value.trim();
    if (roomId.length === 4) {
        socket.emit('join-room', { roomId: roomId, playerName: name });
    } else {
        alert('部屋IDは4けたの数字で入力してください');
    }
};

socket.on('join-error', (errorMessage) => {
    alert(errorMessage);
});

// 待機室（ロビー）の状態が更新されたとき
socket.on('lobby-update', (data) => {
    loginScreen.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');
    gameScreen.classList.add('hidden');
    resultScreen.classList.add('hidden');

    lobbyRoomId.innerText = data.roomId;
    if (data.myName) {
        myName = data.myName;
    }

    lobbyMemberList.innerHTML = "";
    data.members.forEach(member => {
        const div = document.createElement('div');
        div.innerText = `👤 ${member.name} ${member.isHost ? '👑' : ''}`;
        lobbyMemberList.appendChild(div);
    });

    hostControls.innerHTML = "";
    if (data.isHost) {
        const startBtn = document.createElement('button');
        startBtn.className = 'menu-btn';
        startBtn.style.background = '#ff69b4';
        startBtn.style.margin = '5px';
        startBtn.innerText = '🎮 ゲームをはじめる 🎮';
        startBtn.onclick = () => {
            socket.emit('start-game');
        };
        hostControls.appendChild(startBtn);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'menu-btn';
        closeBtn.style.background = '#778899'; 
        closeBtn.style.boxShadow = '0 5px 0px #4f5d73';
        closeBtn.style.margin = '5px';
        closeBtn.innerText = '🚪 おわる（部屋を解散）';
        closeBtn.onclick = () => {
            if (confirm('部屋を解散して終了しますか？（全員が退出します）')) {
                socket.emit('close-room');
            }
        };
        hostControls.appendChild(closeBtn);
    } else {
        hostControls.innerHTML = `<p style="color: #8b7355; font-size:14px; margin: 10px 0;">ホストがゲームを開始するのを待っています...</p>`;
    }
});

socket.on('room-closed', (message) => {
    if (message) alert(message);
    loginScreen.classList.remove('hidden');
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    resultScreen.classList.add('hidden');
    playerNameInput.value = myName;
});

// ゲームが実際に開始されたとき
socket.on('init-state', (data) => {
    loginScreen.classList.add('hidden');
    lobbyScreen.classList.add('hidden');
    resultScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    revealArea.classList.add('hidden'); 

    hasIVoted = false; // ラウンド開始時に投票フラグをリセット

    roomDisplay.innerText = `ルームID: ${data.roomId}`;
    if (data.myName) {
        myName = data.myName;
    }
    myNameDisplay.innerText = `あなたは: ${myName}`;

    updateUI(data);
});

// 💡 【新設】誰かが投票した時に、現在の投票状況（〇/〇人）をリアルタイムに更新する
socket.on('vote-progress', (data) => {
    // 全員が投票完了（all-voted）になる前、かつゲーム画面が表示されている時だけ上書き
    if (!revealArea.classList.contains('hidden')) return;

    statusText.className = 'status-orange';
    if (hasIVoted) {
        statusText.innerText = `⏳ 投票しました。他のプレイヤーを待っています...（${data.currentVotes} / ${data.totalPlayers} 投票完了）`;
    } else {
        statusText.innerText = ` お題に最も近いカードを選んでください（${data.currentVotes} / ${data.totalPlayers} 投票完了）`;
    }
});

socket.on('all-voted', () => {
    statusText.innerText = ' 全員の投票が完了しました！ボタンを押してください';
    statusText.className = 'status-red'; 
    revealArea.classList.remove('hidden'); 
});

revealBtn.onclick = () => {
    socket.emit('reveal-result');
};

socket.on('show-result-screen', (result) => {
    gameScreen.classList.add('hidden');
    resultScreen.classList.remove('hidden');

    resultVerdict.innerText = result.message;
    resultVerdict.style.color = result.success ? "#20b2aa" : "#ff1493"; 

    voteDetailsContainer.innerHTML = "";
    result.voteDetails.forEach(player => {
        const item = document.createElement('div');
        item.style.marginBottom = "10px";
        item.innerHTML = `👤 <strong>${player.name}</strong> ➡️ <span style="color:#ff69b4; font-weight:bold;">「${player.word}」</span>`;
        voteDetailsContainer.appendChild(item);
    });
});

nextRoundBtn.onclick = () => {
    socket.emit('next-round');
};

socket.on('game-over', (result) => {
    alert(result.message);
});

function updateUI(gameState) {
    gameInfoText.innerText = `カードの残り: ${gameState.cardCount}枚 / 10枚 (1枚になったら勝ち！)`;
    targetCardDiv.innerText = gameState.targetCard;
    fieldContainer.innerHTML = "";
    
    gameState.fieldCards.forEach(cardText => {
        const button = document.createElement('button');
        button.className = 'card field-button';
        button.innerText = cardText;
        
        button.onclick = () => {
            hasIVoted = true; // 投票したことを記録
            socket.emit('submit-vote', cardText);
            disableAllButtons();
        };
        
        fieldContainer.appendChild(button);
    });

    statusText.innerText = ` お題に最も近いカードを選んでください (0 / ${gameState.totalPlayers || 1} 投票完了)`;
    statusText.className = 'status-blue'; 
}

function disableAllButtons() {
    const buttons = document.querySelectorAll('.field-button');
    buttons.forEach(btn => btn.disabled = true);
}