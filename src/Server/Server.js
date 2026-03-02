import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const inDevEnv = (process.env.NODE_ENV === "development");
console.log(`Running in ${(inDevEnv) ? "DEVELOPMENT" : "PRODUCTION"} mode`);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let players = {};


let nextbots = {};
const NEXTBOT_SPEED = 0.25;


const nextbotCount = 10;
const botTypes = ["jason", "jerma", "obunga"];
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

    const playerName = socket.handshake.query.playerName || "Ragamuffin";
    players[socket.id] = { playerName: playerName, x: 0, y: 0, z: 0, ry: 0 };

    console.log(players);

    // Send the current world state to the new player
    socket.emit("init", {
        id: socket.id,
        players: players,
        nextbots: nextbots
    });

    // Inform others
    socket.broadcast.emit("newPlayer", { id: socket.id, playerData: players[socket.id] });

    socket.on("move", (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].z = data.z;
            players[socket.id].ry = data.ry;
            socket.broadcast.emit("playerMoved", { id: socket.id, playerData: players[socket.id] });
        }
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
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

    // For each Nextbot, target the closest player
    for (let id in nextbots) {
        let bot = nextbots[id];

        let closest = null;
        let minDist = Infinity;
        playerIds.forEach(id => {
            const p = players[id];
            const dist = Math.hypot(p.x - bot.x, p.z - bot.z);
            if (dist < minDist) {
                minDist = dist;
                closest = p;
            }
        });

        if (closest) {
            const dx = closest.x - bot.x;
            const dz = closest.z - bot.z;
            const angle = Math.atan2(dx, dz);

            let dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > 0.5) { // Stop a bit before "touching" to let jumpscare trigger
                bot.x += Math.sin(angle) * NEXTBOT_SPEED;
                bot.z += Math.cos(angle) * NEXTBOT_SPEED;
            }
            
            // Prevent Nextbot clipping
            applySeparation(bot, nextbots);
        }
    }

    io.emit("nextbotsUpdate", nextbots);

}, 1000 / FREQUENCY);

httpServer.listen(3000, () => console.log("Server on port 3000"));