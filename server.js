const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const WORD_LIST = [
    "リンゴ", "スマートフォン", "おじいちゃん", "カレーライス", "宇宙", "富士山", "猫", "自転車",
    "パスワード", "エアコン", "チョコレート", "新幹線", "涙", "自動販売機", "コンクリート", "宿題",
    "図書館", "マントル", "傘", "サボテン", "映画館", "幽霊", "トランプ", "スニーカー", "タイムマシン",
    "ラーメン", "ひまわり", "ペンギン", "クレジットカード", "教科書", "お祭り", "目覚まし時計", "おにぎり",
    "砂漠", "飛行機雲", "タピオカ", "神社", "マヨネーズ", "消しゴム", "秘密基地", "筋肉", "ダイヤモンド",
    "洗濯機", "お年玉", "クジラ", "人工知能", "遊園地", "流れ星", "ハンバーグ", "メガネ","アイスクリーム","数学",
    "犯罪", "給料", "アイアイ", "アメリカ", "初恋", "ワンピース", "ライブ", "チケット", "コンビニ", "布団", "ハラハラ",
    "さらさら", "プリンセス", "泥だんご", "YouTube", "ゴミ箱", "カラオケ", "マイク", "芸人", "土星", "ことわざ", "爪切り",
    "ばんそうこう", "三角州", "ビーカー", "ワクワク", "化粧"
];

let rooms = {};

function getRandomWords(count, excludeWords = []) {
    const shuffled = WORD_LIST.filter(w => !excludeWords.includes(w)).sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

function createNewRoom(roomId, hostId, existingNames = {}) {
    const initialWords = getRandomWords(5);
    rooms[roomId] = {
        fieldCards: initialWords.slice(0, 4),
        targetCard: initialWords[4],
        votes: {},        
        playerNames: existingNames,  
        cardCount: 4,
        hostId: hostId,       
        isStarted: false      
    };
}

function sendLobbyUpdate(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    const clientIds = io.sockets.adapter.rooms.get(roomId);
    if (!clientIds) return;

    const members = [];
    clientIds.forEach(id => {
        members.push({
            id: id,
            name: room.playerNames[id] || "ゲスト",
            isHost: id === room.hostId
        });
    });

    clientIds.forEach(id => {
        io.to(id).emit('lobby-update', {
            roomId: roomId,
            myName: room.playerNames[id],
            members: members,
            isHost: id === room.hostId
        });
    });
}

// 💡 【新設】現在のリアルタイムな投票状況（投票済み人数 / 全人数）を部屋の全員に伝える関数
function broadcastVoteProgress(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    const totalPlayers = io.sockets.adapter.rooms.get(roomId)?.size || 1;
    const currentVotes = Object.keys(room.votes).length;

    io.to(roomId).emit('vote-progress', {
        currentVotes: currentVotes,
        totalPlayers: totalPlayers
    });
}

io.on('connection', (socket) => {
    let currentRoomId = null;

    socket.on('create-room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        createNewRoom(roomId, socket.id); 
        socket.emit('room-created', roomId);
    });

    socket.on('join-room', (data) => {
        const { roomId, playerName } = data;

        if (!rooms[roomId]) {
            socket.emit('join-error', '指定された部屋が見つかりません。');
            return;
        }

        if (rooms[roomId].isStarted) {
            socket.emit('join-error', 'この部屋のゲームはすでに開始されています。');
            return;
        }

        currentRoomId = roomId;
        socket.join(roomId);

        const room = rooms[roomId];
        room.playerNames[socket.id] = playerName.trim() || "ゲスト";

        sendLobbyUpdate(roomId);
    });

    socket.on('start-game', () => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        const room = rooms[currentRoomId];

        if (socket.id !== room.hostId) return;

        room.isStarted = true;

        const clientIds = io.sockets.adapter.rooms.get(currentRoomId);
        const totalPlayers = clientIds?.size || 1; // 全人数を計算
        if (clientIds) {
            clientIds.forEach(id => {
                io.to(id).emit('init-state', {
                    roomId: currentRoomId,
                    myName: room.playerNames[id],
                    fieldCards: room.fieldCards,
                    targetCard: room.targetCard,
                    cardCount: room.cardCount,
                    totalPlayers: totalPlayers // クライアントの初期表示用に渡す
                });
            });
        }
    });

    socket.on('close-room', () => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        const room = rooms[currentRoomId];

        if (socket.id !== room.hostId) return;

        io.to(currentRoomId).emit('room-closed', 'ホストによって部屋が解散されました。');

        const clientIds = io.sockets.adapter.rooms.get(currentRoomId);
        if (clientIds) {
            const ids = Array.from(clientIds);
            ids.forEach(id => {
                const s = io.sockets.sockets.get(id);
                if (s) s.leave(currentRoomId);
            });
        }

        delete rooms[currentRoomId];
    });

    socket.on('submit-vote', (selectedCard) => {
        if (!currentRoomId || !rooms[currentRoomId]) return;

        const room = rooms[currentRoomId];
        room.votes[socket.id] = selectedCard;

        const totalPlayers = io.sockets.adapter.rooms.get(currentRoomId)?.size || 1;
        const totalVotes = Object.keys(room.votes).length;

        // 💡 投票があるたびに全員に途中経過人数を通知する
        broadcastVoteProgress(currentRoomId);

        if (totalVotes >= totalPlayers) {
            io.to(currentRoomId).emit('all-voted');
        }
    });

    socket.on('reveal-result', () => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        const room = rooms[currentRoomId];

        let voteDetails = [];
        for (let id in room.votes) {
            voteDetails.push({
                name: room.playerNames[id] || "ゲスト",
                word: room.votes[id]
            });
        }

        const voteValues = Object.values(room.votes);
        const isAllMatch = voteValues.every(val => val === voteValues[0]);
        let message = "";

        if (isAllMatch) {
            const matchedCard = voteValues[0];
            room.fieldCards = room.fieldCards.filter(card => card !== matchedCard);
            room.cardCount = room.fieldCards.length;
            message = `🎉 全員一致！「${matchedCard}」を取り除きました！`;
        } else {
            room.fieldCards.push(room.targetCard);
            room.cardCount = room.fieldCards.length;
            message = `💀 不一致... お題の「${room.targetCard}」を場に追加しました。`;
        }

        const nextTarget = getRandomWords(1, [...room.fieldCards, room.targetCard]);
        room.targetCard = nextTarget[0];
        room.votes = {}; 

        io.to(currentRoomId).emit('show-result-screen', {
            success: isAllMatch,
            message: message,
            voteDetails: voteDetails,
            gameState: room
        });
    });

    socket.on('next-round', () => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        const room = rooms[currentRoomId];

        if (room.cardCount <= 1) {
            io.to(currentRoomId).emit('game-over', { won: true, message: "🎉ゲームクリア！みんなの心が1つになりました！" });
            const hostId = room.hostId;
            const currentNames = room.playerNames; 
            createNewRoom(currentRoomId, hostId, currentNames); 
            sendLobbyUpdate(currentRoomId);
            return;
        } else if (room.cardCount >= 10) {
            io.to(currentRoomId).emit('game-over', { won: false, message: "💀ゲームオーバー...カードが10枚になっちゃいました。" });
            const hostId = room.hostId;
            const currentNames = room.playerNames; 
            createNewRoom(currentRoomId, hostId, currentNames); 
            sendLobbyUpdate(currentRoomId);
            return;
        }

        const clientIds = io.sockets.adapter.rooms.get(currentRoomId);
        const totalPlayers = clientIds?.size || 1;
        if (clientIds) {
            clientIds.forEach(id => {
                io.to(id).emit('init-state', {
                    roomId: currentRoomId,
                    myName: room.playerNames[id],
                    fieldCards: room.fieldCards,
                    targetCard: room.targetCard,
                    cardCount: room.cardCount,
                    totalPlayers: totalPlayers // 次のラウンド開始時にも人数を渡す
                });
            });
        }
    });

    socket.on('disconnect', () => {
        if (currentRoomId && rooms[currentRoomId]) {
            const room = rooms[currentRoomId];
            delete room.votes[socket.id];
            delete room.playerNames[socket.id];
            
            const totalPlayers = io.sockets.adapter.rooms.get(currentRoomId)?.size || 0;
            
            if (totalPlayers === 0) {
                delete rooms[currentRoomId];
            } else {
                if (socket.id === room.hostId) {
                    const clientIds = io.sockets.adapter.rooms.get(currentRoomId);
                    if (clientIds) {
                        room.hostId = clientIds.values().next().value; 
                    }
                }
                if (!room.isStarted) {
                    sendLobbyUpdate(currentRoomId);
                } else {
                    // 💡 もしゲーム中に誰かが回線落ちしたら、残りの人で進行できるように
                    // 投票済み人数と全人数の表示を更新して再送する
                    broadcastVoteProgress(currentRoomId);
                    
                    // 万が一、全員投票済みの状態に変化したら全員一致の判定処理へ進める
                    const currentVotes = Object.keys(room.votes).length;
                    if (currentVotes >= totalPlayers) {
                        io.to(currentRoomId).emit('all-voted');
                    }
                }
            }
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`サーバーが起動しました！ http://localhost:${PORT}`);
});