import express from 'express';
import { CONSTS } from "../Constants.js";
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

//const nextbotCount = 0;
const botTypes = ["jason", "louis", "dyfuku", "an", "viet", "minh", "khoa", "ductrinh", "jerry"];
function randRange(min, max) { return Math.random() * (max - min) + min; }
function randRangeInt(min, max) { return Math.round(Math.random()) * (max - min) + min; }
for (let bot of botTypes) {
    let sound = "armed-and-dangerous";

    if (bot == "minh")      sound = "thick-of-it";
    if (bot == "louis")     sound = "man-united";

    nextbots[`${bot}`] = {
        x: randRange(-200, 200),
        y: CONSTS.NEXTBOT_HEIGHT,
        z: randRange(-200, 200),
        //type: botTypes[randRangeInt(0, botTypes.length - 1)]
        type: bot,
        sound: sound
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
const BOT_RADIUS_SQ = BOT_RADIUS * BOT_RADIUS;
const SEPARATION_WEIGHT = 0.1; // How strongly they push away

function applySeparation(dt, currentBot, allBots) {
    let pushX = 0;
    let pushZ = 0;

    for (let id in allBots) {
        let other = allBots[id];
        if (other === currentBot) continue; // Don't push against yourself

        let dx = currentBot.x - other.x;
        let dz = currentBot.z - other.z;
        let distSq = dx * dx + dz * dz;

        // If they are closer than the combined radius
        if (distSq < BOT_RADIUS_SQ && distSq > 0) {
            let dist = Math.sqrt(distSq);
            // Inversely proportional push: closer = stronger push
            pushX += (dx / dist) * SEPARATION_WEIGHT;
            pushZ += (dz / dist) * SEPARATION_WEIGHT;
        }
    }
    
    currentBot.x += pushX * dt;
    currentBot.z += pushZ * dt;
}




// AI Logic Loop (60Hz)
const FREQUENCY = 60;
const STOP_DIST_SQ = 0.5 * 0.5;
const KILL_DIST_SQ = CONSTS.NEXTBOT_KILL_DISTANCE * CONSTS.NEXTBOT_KILL_DISTANCE;
let lastTime = Date.now();

setInterval(() => {
    // Compute delta-time
    const now = Date.now();
    const dt = Math.min((now - lastTime) / 1000, 0.1); // Max dt of 100ms
    lastTime = now;

    // Skip update if dt is (somehow) 0 to avoid NaN errors
    if (dt <= 0) return;


    const playerIds = Object.keys(players);
    if (playerIds.length === 0) return;

    // For each Nextbot,
    for (let id in nextbots) {
        let bot = nextbots[id];

        // TARGET CLOSEST PLAYER
        let closestPlayer = null, closestPlayerID = null;
        let minDistSq = Infinity;

        playerIds.forEach(id => {
            const p = players[id];
            const dx = p.x - bot.x;
            const dz = p.z - bot.z;
            const dSq = dx * dx + dz * dz;

            if (dSq < minDistSq) {
                minDistSq = dSq;
                closestPlayer = p;
                closestPlayerID = id;
            }
        });


        if (closestPlayer) {
            const dx = closestPlayer.x - bot.x;
            const dy = closestPlayer.y - bot.y;
            const dz = closestPlayer.z - bot.z;

            if (minDistSq > STOP_DIST_SQ) { // Stop a bit before "touching" to let jumpscare trigger
                const angle = Math.atan2(dx, dz);
                bot.x += Math.sin(angle) * (CONSTS.NEXTBOT_SPEED * dt);
                bot.z += Math.cos(angle) * (CONSTS.NEXTBOT_SPEED * dt);
            }
            
            // Prevent Nextbot clipping
            applySeparation(dt, bot, nextbots);


            // KILL PLAYER IF WITHIN KILL DISTANCE
            if (minDistSq < KILL_DIST_SQ && dy < CONSTS.NEXTBOT_KILL_DISTANCE) {
                // NOTE: io.to(playerID) emits an event only to the player of that ID
                io.to(closestPlayerID).emit("jumpscare", { type: bot.type });
            }
        }
    }

    io.emit("nextbotsUpdate", nextbots);

}, 1000 / FREQUENCY);

httpServer.listen(port, host, () => console.log(`Server is running on http://${host}:${port}`));