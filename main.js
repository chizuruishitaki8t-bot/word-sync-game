const socket = io();

// 💡 ネット上のフリーの可愛い効果音ファイルを直接読み込む（一番シンプルで安全！）
const tapSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-84.wav'); // ピコッ
const revealSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-84.wav'); // ファンファーレ

const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const resultScreen = document.getElementById('result-screen');

const playerNameInput = document.getElementById('player-name-input');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomIdInput = document.getElementById('room-id-input');

const roomDisplay = document.getElementById('room-display');
const myNameDisplay = document.getElementById('my-name-display');
const statusText = document.getElementById('status');
const gameInfoText = document.getElementById('game-info');
const targetCardDiv = document.getElementById('target-card');
const fieldContainer = document.getElementById('field-container');
const revealArea = document.getElementById('reveal-area');
const revealBtn = document.getElementById('reveal-btn');

const resultVerdict = document.getElementById('result-verdict');
const voteDetailsContainer = document.getElementById('vote-details-container');
const nextRoundBtn = document.getElementById('next-round-btn');

let myName = "";

function getValidName() {
    const name = playerNameInput.value.trim();
    if (!name) {
        alert('まずはあなたのおなまえを入力してね！');
        return null;
    }
    return name;
}

// 💡 音を鳴らす専用の安全な関数（エラーが起きてもゲームを止めないお守り付き）
function playSound(audioObject) {
    audioObject.currentTime = 0; // 音を最初から再生する
    audioObject.play().catch(error => {
        console.log("ブラウザの制限で音がブロックされました:", error);
    });
}

createRoomBtn.onclick = () => {
    if (getValidName() !== null) {
        playSound(tapSound); // 💡 ピコッ
        socket.emit('create-room');
    }
};

socket.on('room-created', (roomId) => {
    const name = getValidName();
    socket.emit('join-room', { roomId: roomId, playerName: name });
});

joinRoomBtn.onclick = () => {
    const name = getValidName();
    if (name === null) return;

    const roomId = roomIdInput.value.trim();
    if (roomId.length === 4) {
        playSound(tapSound); // 💡 ピコッ
        socket.emit('join-room', { roomId: roomId, playerName: name });
    } else {
        alert('部屋IDは4けたの数字で入力してね。');
    }
};

socket.on('join-error', (errorMessage) => {
    alert(errorMessage);
});

socket.on('init-state', (data) => {
    lobbyScreen.classList.add('hidden');
    resultScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    revealArea.classList.add('hidden'); 

    roomDisplay.innerText = `ルームID: ${data.roomId}`;
    
    if (data.myName) {
        myName = data.myName;
        myNameDisplay.innerText = `あなたは: ${myName}`;
    }

    updateUI(data);
});

socket.on('all-voted', () => {
    statusText.innerText = '🎀 全員の投票が完了しました！結果をオープンしてね。';
    statusText.className = 'status-red'; 
    revealArea.classList.remove('hidden'); 
});

revealBtn.onclick = () => {
    socket.emit('reveal-result');
};

socket.on('show-result-screen', (result) => {
    playSound(revealSound); // 💡 結果画面が開いた瞬間にファンファーレ！

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
    playSound(tapSound); // 💡 ピコッ
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
            playSound(tapSound); // 💡 カードを押したときにピコッ！

            socket.emit('submit-vote', cardText);
            disableAllButtons();
            statusText.innerText = `⏳ 「${cardText}」に投票したよ。みんなを待っています...`;
            statusText.className = 'status-orange'; 
        };
        
        fieldContainer.appendChild(button);
    });

    statusText.innerText = '🧁 お題にいちばん近いカードをえらんでね！';
    statusText.className = 'status-blue'; 
}

function disableAllButtons() {
    const buttons = document.querySelectorAll('.field-button');
    buttons.forEach(btn => btn.disabled = true);
}