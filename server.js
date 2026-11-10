const WebSocket = require('ws');
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const rooms = {};

// Helper to broadcast the updated list of rooms and their current user counts
function broadcastRoomList() {
    const list = Object.keys(rooms).map(roomName => ({
        name: roomName,
        count: rooms[roomName].length
    })).filter(r => r.count > 0);

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ dataType: 'room-list', rooms: list }));
        }
    });
}

wss.on('connection', (ws) => {
    let currentRoom = null;
    let currentUser = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'join') {
                currentRoom = data.room;
                currentUser = data.user;
                ws.username = currentUser;

                if (!rooms[currentRoom]) rooms[currentRoom] = [];
                
                rooms[currentRoom].forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'new-peer', user: currentUser }));
                    }
                });

                rooms[currentRoom].push(ws);
                console.log(`${currentUser} joined room: ${currentRoom}`);
                broadcastRoomList();
            } 
            else if (data.type === 'broadcast' && currentRoom) {
                rooms[currentRoom].forEach(client => {
                    if (data.to) {
                        if (client.username === data.to && client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify(data));
                        }
                    } else if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(data));
                    }
                });
            }
        } catch (e) {
            console.error("Payload error");
        }
    });

    ws.on('close', () => {
        if (currentRoom && rooms[currentRoom]) {
            rooms[currentRoom] = rooms[currentRoom].filter(client => client !== ws);
            if (rooms[currentRoom].length === 0) {
                delete rooms[currentRoom];
            }
            console.log(`${currentUser} left room: ${currentRoom}`);
            broadcastRoomList();
        }
    });
});

console.log(`Digital Sleepover Server running on port ${PORT}`);
