const WebSocket = require('ws');
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const rooms = {};

// Helper to broadcast active rooms and player counts globally
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

// Helper to broadcast exact active user arrays to players inside a specific room
function broadcastUserList(roomName) {
    if (!rooms[roomName]) return;
    const users = rooms[roomName].map(client => client.username).filter(Boolean);
    
    rooms[roomName].forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ dataType: 'user-list', users: users }));
        }
    });
}

wss.on('connection', (ws) => {
    let currentRoom = null;
    let currentUser = null;
    ws.isAlive = true; // Heartbeat tracking flat flag

    // Handle incoming frames from TurboWarp extension
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // Handle ping responses to keep connection alive
            if (data.type === 'pong') {
                ws.isAlive = true;
                return;
            }

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
                console.log(`${currentUser} joined: ${currentRoom}`);
                
                broadcastRoomList();
                broadcastUserList(currentRoom);
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
            console.error("Payload tracking error");
        }
    });

    // Handle normal clean disconnect events
    ws.on('close', () => {
        cleanDisconnect(ws, currentRoom, currentUser);
    });
});

// Central disconnect processor drops broken entities instantly
function cleanDisconnect(ws, roomName, userName) {
    if (roomName && rooms[roomName]) {
        rooms[roomName] = rooms[roomName].filter(client => client !== ws);
        console.log(`${userName || 'Ghost'} dropped from array registry`);
        
        if (rooms[roomName].length === 0) {
            delete rooms[roomName];
        } else {
            broadcastUserList(roomName);
        }
        broadcastRoomList();
    }
}

// AUTOMATIC GHOST CLEANUP HEARTBEAT LOOP
// Checks all clients every 10 seconds. Kicks dead sockets instantly.
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            // Found a ghost! Terminate the connection immediately
            ws.terminate();
            
            // Loop across all active room containers to scrub the ghost out
            Object.keys(rooms).forEach(roomName => {
                if (rooms[roomName].includes(ws)) {
                    cleanDisconnect(ws, roomName, ws.username);
                }
            });
            return;
        }
        
        // Mark them as unconfirmed and send a heartbeat verification ping
        ws.isAlive = false;
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ dataType: 'ping' }));
        }
    });
}, 10000); // 10,000ms = 10 seconds

wss.on('close', () => {
    clearInterval(interval);
});

console.log(`Ghost-Busting Cloud Server running on port ${PORT}`);
