import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "https://12av1-jason-backshot-simulator.vercel.app",
        methods: ["GET", "POST"]
    }
});

let players = {};
let nextbotPos = { x: 10, y: 0, z: 10 };
const NEXTBOT_SPEED = 0.2;

io.on("connection", (socket) => {
    players[socket.id] = { x: 0, y: 0, z: 0, ry: 0 };

    // Send the current world state to the new player
    socket.emit("init", { id: socket.id, players });

    // Inform others
    socket.broadcast.emit("newPlayer", { id: socket.id, pos: players[socket.id] });

    socket.on("move", (data) => {
        if (players[socket.id]) {
            players[socket.id] = data;
            socket.broadcast.emit("playerMoved", { id: socket.id, pos: data });
        }
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
        io.emit("playerDisconnected", socket.id);
    });
});


// AI Logic Loop (60Hz)
setInterval(() => {
    const playerIds = Object.keys(players);
    if (playerIds.length === 0) return;

    // Target the closest player
    let closest = null;
    let minDist = Infinity;
    playerIds.forEach(id => {
        const p = players[id];
        const dist = Math.hypot(p.x - nextbotPos.x, p.z - nextbotPos.z);
        if (dist < minDist) { minDist = dist; closest = p; }
    });

    if (closest) {
        const dx = closest.x - nextbotPos.x;
        const dz = closest.z - nextbotPos.z;
        const angle = Math.atan2(dx, dz);
        nextbotPos.x += Math.sin(angle) * NEXTBOT_SPEED;
        nextbotPos.z += Math.cos(angle) * NEXTBOT_SPEED;
        io.emit("nextbotUpdate", nextbotPos);
    }
}, 1000 / 60);

httpServer.listen(3000, () => console.log("Server on port 3000"));