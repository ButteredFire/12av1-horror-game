import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const inDevEnv = (process.env.NODE_ENV === "development");
console.log(`Running in ${(inDevEnv) ? "DEVELOPMENT" : "PRODUCTION"} mode`);

const port = 3000;
const host = "localhost";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let players = {};
let playerCount = 0;


let nextbots = {};
const NEXTBOT_SPEED = 0.15;
const NEXTBOT_KILL_DISTANCE = 1.5;


const nextbotCount = 3;
const botTypes = ["jason"];
function randRange(min, max) { return Math.random() * (max - min) + min; }
function randRangeInt(min, max) { return Math.round(Math.random()) * (max - min) + min; }
for (let i = 0; i < nextbotCount; i++) {
    nextbots[`bot${i}`] = {
        x: randRange(-20, 20),
        z: randRange(-20, 20),
        type: botTypes[randRangeInt(0, botTypes.length - 1)]
    };
}


console.log(nextbots);


io.on("connection", (socket) => {
    console.log("NEW CONNECTION RECEIVED");

    const playerName = socket.handshake.query.playerName || `Ragamuffin #${playerCount + 1}`;

    players[socket.id] = { playerName: playerName, x: 0, y: 0, z: 0, ry: 0 };
    playerCount++;

    // Send the current world state to the new player
    socket.emit("init", {
        playerName: playerName,     // Also pass in player name in case the client sends and keeps an empty name
        id: socket.id,
        players: players,
        nextbots: nextbots
    });

    // Inform others
    socket.broadcast.emit("newPlayer", {
        id: socket.id,
        playerData: players[socket.id]
    });

    socket.on("move", (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].z = data.z;
            players[socket.id].ry = data.ry;
            socket.broadcast.emit("playerMoved", {
                id: socket.id,
                playerData: players[socket.id]
            });
        }
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
        playerCount--;

        io.emit("playerDisconnected", socket.id);
    });
});



const BOT_RADIUS = 5.0; // Distance to keep between bots
const SEPARATION_WEIGHT = 0.1; // How strongly they push away

function applySeparation(currentBot, allBots) {
    let pushX = 0;
    let pushZ = 0;

    for (let id in allBots) {
        let other = allBots[id];
        if (other === currentBot) continue; // Don't push against yourself

        let dx = currentBot.x - other.x;
        let dz = currentBot.z - other.z;
        let distSq = dx * dx + dz * dz;

        // If they are closer than the combined radius
        if (distSq < (BOT_RADIUS * BOT_RADIUS) && distSq > 0) {
            let dist = Math.sqrt(distSq);
            // Inversely proportional push: closer = stronger push
            pushX += (dx / dist) * SEPARATION_WEIGHT;
            pushZ += (dz / dist) * SEPARATION_WEIGHT;
        }
    }
    
    currentBot.x += pushX;
    currentBot.z += pushZ;
}




// AI Logic Loop (60Hz)
const FREQUENCY = 60;
setInterval(() => {
    const playerIds = Object.keys(players);
    if (playerIds.length === 0) return;

    // For each Nextbot,
    for (let id in nextbots) {
        let bot = nextbots[id];

        // TARGET CLOSEST PLAYER
        let closestPlayer = null, closestPlayerID = null;
        let minDist = Infinity;
        playerIds.forEach(id => {
            const p = players[id];
            const dist = Math.hypot(p.x - bot.x, p.z - bot.z);
            if (dist < minDist) {
                minDist = dist;
                closestPlayer = p;
                closestPlayerID = id;
            }
        });

        if (closestPlayer) {
            const dx = closestPlayer.x - bot.x;
            const dz = closestPlayer.z - bot.z;
            const angle = Math.atan2(dx, dz);

            let dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > 0.5) { // Stop a bit before "touching" to let jumpscare trigger
                bot.x += Math.sin(angle) * NEXTBOT_SPEED;
                bot.z += Math.cos(angle) * NEXTBOT_SPEED;
            }
            
            // Prevent Nextbot clipping
            applySeparation(bot, nextbots);


            // KILL PLAYER IF WITHIN KILL DISTANCE
            if (dist < NEXTBOT_KILL_DISTANCE) {
                // NOTE: io.to(playerID) emits an event only to the player of that ID
                io.to(closestPlayerID).emit("jumpscare", { type: bot.type });
            }
        }
    }

    io.emit("nextbotsUpdate", nextbots);

}, 1000 / FREQUENCY);

httpServer.listen(port, host, () => console.log(`Server is running on http://${host}:${port}`));