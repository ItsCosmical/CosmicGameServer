const WebSocket = require('ws');
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

// Track active connections by room and user ID
const rooms = {};

wss.on('connection', (ws) => {
    let currentRoom = null;
    let currentUser = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // 1. Handle Join Room
            if (data.type === 'join') {
                currentRoom = data.room;
                currentUser = data.user;
                ws.username = currentUser;

                if (!rooms[currentRoom]) rooms[currentRoom] = [];
                
                // Let everyone else in the room know a new peer arrived to start WebRTC
                rooms[currentRoom].forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'new-peer', user: currentUser }));
                    }
                });

                rooms[currentRoom].push(ws);
                console.log(`${currentUser} joined room: ${currentRoom}`);
            } 
            
            // 2. Handle Broadcast & WebRTC Signaling
            else if (data.type === 'broadcast' && currentRoom) {
                rooms[currentRoom].forEach(client => {
                    // If target client is specified (for WebRTC handshakes), route only to them
                    if (data.to) {
                        if (client.username === data.to && client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify(data));
                        }
                    } 
                    // Otherwise, broadcast chat messages universally to everyone else
                    else if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(data));
                    }
                });
            }
        } catch (e) {
            console.error("Payload parse error");
        }
    });

    ws.on('close', () => {
        if (currentRoom && rooms[currentRoom]) {
            rooms[currentRoom] = rooms[currentRoom].filter(client => client !== ws);
            console.log(`${currentUser} left room: ${currentRoom}`);
        }
    });
});

console.log(`Digital Sleepover Server operational on port ${PORT}`);
