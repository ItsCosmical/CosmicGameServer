const WebSocket = require('ws');
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const rooms = {};

wss.on('connection', (ws) => {
    let currentRoom = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'join') {
                currentRoom = data.room;
                if (!rooms[currentRoom]) rooms[currentRoom] = [];
                rooms[currentRoom].push(ws);
            } 
            else if (data.type === 'broadcast' && currentRoom) {
                rooms[currentRoom].forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(data));
                    }
                });
            }
        } catch (e) {
            console.error("Invalid frame payload");
        }
    });

    ws.on('close', () => {
        if (currentRoom && rooms[currentRoom]) {
            rooms[currentRoom] = rooms[currentRoom].filter(client => client !== ws);
        }
    });
});

console.log(`Cloud Server online on port ${PORT}`);
