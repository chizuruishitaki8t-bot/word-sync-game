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
    "洗濯機", "お年玉", "クジラ", "人工知能", "遊園地", "流れ星", "ハンバーグ", "メガネ"
];

let rooms = {};

function getRandomWords(count, excludeWords = []) {
    const shuffled = WORD_LIST.filter(w => !excludeWords.includes(w)).sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

function createNewRoom(roomId) {
    const initialWords = getRandomWords(5);
    rooms[roomId] = {
        fieldCards: initialWords.slice(0, 4),
        targetCard: initialWords[4],
        votes: {},        
        playerNames: {},  
        cardCount: 4
    };
}

io.on('connection', (socket) => {
    let currentRoomId = null;

    socket.on('create-room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        createNewRoom(roomId);
        socket.emit('room-created', roomId);
    });

    // 💡 変更：部屋に入るときに「なまえ（playerName）」も一緒に受け取る
    socket.on('join-room', (data) => {
        const { roomId, playerName } = data;

        if (!rooms[roomId]) {
            socket.emit('join-error', '指定された部屋が見つかりません。');
            return;
        }

        currentRoomId = roomId;
        socket.join(roomId);

        const room = rooms[roomId];
        // 💡 入力された名前をセット（空っぽなら「ゲスト」にする）
        room.playerNames[socket.id] = playerName.trim() || "ゲスト";

        socket.emit('init-state', {
            roomId: roomId,
            myName: room.playerNames[socket.id],
            fieldCards: room.fieldCards,
            targetCard: room.targetCard,
            cardCount: room.cardCount
        });
    });

    socket.on('submit-vote', (selectedCard) => {
        if (!currentRoomId || !rooms[currentRoomId]) return;

        const room = rooms[currentRoomId];
        room.votes[socket.id] = selectedCard;

        const totalPlayers = io.sockets.adapter.rooms.get(currentRoomId)?.size || 1;
        const totalVotes = Object.keys(room.votes).length;

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
            createNewRoom(currentRoomId);
        } else if (room.cardCount >= 10) {
            io.to(currentRoomId).emit('game-over', { won: false, message: "💀ゲームオーバー...カードが10枚になっちゃいました。" });
            createNewRoom(currentRoomId);
        }

        io.to(currentRoomId).emit('init-state', {
            roomId: currentRoomId,
            fieldCards: room.fieldCards,
            targetCard: room.targetCard,
            cardCount: room.cardCount
        });
    });

    socket.on('disconnect', () => {
        if (currentRoomId && rooms[currentRoomId]) {
            delete rooms[currentRoomId].votes[socket.id];
            delete rooms[currentRoomId].playerNames[socket.id];
            const totalPlayers = io.sockets.adapter.rooms.get(currentRoomId)?.size || 0;
            if (totalPlayers === 0) delete rooms[currentRoomId];
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`サーバーが起動しました！ http://localhost:${PORT}`);
});