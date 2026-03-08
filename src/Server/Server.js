import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import * as THREE from "three";
import { CONSTS } from "../Constants.js";
import * as UTILS from "../Utils.js";
import { createServer } from 'http';
import { Server } from 'socket.io';

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { Pathfinding } from 'three-pathfinding';


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

for (let bot of botTypes) {
    let sound = "armed-and-dangerous";

    if (bot == "minh")      sound = "thick-of-it";
    if (bot == "louis")     sound = "man-united";
    if (bot == "jerry")     sound = "oggy-and-the-cockroaches";

    nextbots[`${bot}`] = {
        x: UTILS.randRange(-200, 200),
        y: CONSTS.NEXTBOT_HEIGHT,
        z: UTILS.randRange(-200, 200),
        //type: botTypes[randRangeInt(0, botTypes.length - 1)]
        type: bot,
        sound: sound
    };
}





import Piscina from 'piscina';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ZONE = "school";
const workerPath = path.resolve(__dirname, "PathfinderWorker.mjs");
const navPath = path.resolve(__dirname, "../../public/map/SchoolModel_NAV.glb");

// Initialize Piscina
const pathPool = new Piscina({
    filename: workerPath,
    workerData: {
        zoneName: ZONE,
        navPath: navPath // Just pass the string path!
    }
});









io.on("connection", (socket) => {
    console.log("NEW CONNECTION RECEIVED");

    const playerName = socket.handshake.query.playerName || `Ragamuffin #${playerCount + 1}`;

    players[socket.id] = {
        playerName: playerName,
        x: 0,
        y: 0,
        z: 0,
        ry: 0,
        chased: false
    };
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







// AI Logic Loop (60Hz)
const FREQUENCY = 30;
const STOP_DIST_SQ = (CONSTS.NEXTBOT_KILL_DISTANCE + 1.0) * (CONSTS.NEXTBOT_KILL_DISTANCE + 1.0);
const KILL_DIST_SQ = CONSTS.NEXTBOT_KILL_DISTANCE * CONSTS.NEXTBOT_KILL_DISTANCE;
const NEXTBOT_REEVAL_INTV = 30;  // Nextbot closest-player re-evaluation interval (seconds)
let lastTime = Date.now();

const PATH_TICK_RATE = 200; // Recalculate path every 200ms (5Hz)


setInterval(() => {
    const now = Date.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    const playerIds = Object.keys(players);
    if (playerIds.length === 0) return;

    
    for (let id in nextbots) {
        const bot = nextbots[id];

        // 1. Target the closest player (Optimization: Use Squared Distance)
        let closestPlayer = null;
        let closestPlayerID = null;
        let minDistSq = Infinity;

        for (let pId of playerIds) {
            const p = players[pId];
            const dx = p.x - bot.x;
            //const dy = (p.y - CONSTS.PLAYER_HEIGHT) - (bot.y - CONSTS.NEXTBOT_HEIGHT);
            const dz = p.z - bot.z;

            //const dSq = dx * dx + dy * dy + dz * dz;
            const dSq = dx * dx + dz * dz;
            //console.log(p.playerName, "dist:", Math.sqrt(dSq), `(dx, dy, dz) = (${dx.toFixed(3)}, ${dy.toFixed(3)}, ${dz.toFixed(3)})`);
            if (dSq < minDistSq) {
                minDistSq = dSq;
                closestPlayer = p;
                closestPlayerID = pId;
            }
        }


        if (closestPlayer) {
            if (!bot.isCalculating && (Date.now() - (bot.lastPathUpdate || 0) > PATH_TICK_RATE)) {
                bot.isCalculating = true;

                // 2. Run the task in the pool
                calcBotPath(id, bot, closestPlayer);
            }

            moveBot(id, dt, bot, closestPlayer, closestPlayerID, minDistSq);
        }
    }
}, 1000 / 20);

setInterval(() => {
    io.emit("nextbotsUpdate", nextbots);
}, 1000 / 60);


async function calcBotPath(id, bot, player) {
    const newPath = await pathPool.run({
        botVec: { x: bot.x, y: bot.y - CONSTS.NEXTBOT_HEIGHT, z: bot.z },
        playerVec: { x: player.x, y: player.y - CONSTS.PLAYER_HEIGHT, z: player.z }
    });

    if (newPath && newPath.length > 0) {
        // If the first waypoint is closer than 1m, it's probably 
        // a "backstep" to a previous position. Skip it.
        const dSq = Math.pow(newPath[0].x - bot.x, 2) + Math.pow(newPath[0].z - bot.z, 2);
        if (dSq < 1.0 && newPath.length > 1) {
            newPath.shift(); 
        }
        
        bot.currentPath = newPath;
    }
    bot.isCalculating = false;
    bot.lastPathUpdate = Date.now();
}


/**
 * Handles high-frequency movement, gravity, and floor snapping.
 * Runs at 60Hz on the Main Thread.
 */
function moveBot(id, dt, bot, closestPlayer, closestPlayerID, minDistSq) {
    if (!bot.currentPath || bot.currentPath.length < 0) return;
    
    const moveTarget = bot.currentPath[0];
    const botPos = new THREE.Vector3(bot.x, bot.y, bot.z);
    const targetPos = new THREE.Vector3(moveTarget.x, moveTarget.y, moveTarget.z);

    const dist = targetPos.sub(botPos);

    if (moveTarget) {
        const dx = moveTarget.x - bot.x;
        const dz = moveTarget.z - bot.z;
        const angle = Math.atan2(dx, dz);

        bot.x += Math.sin(angle) * (CONSTS.NEXTBOT_SPEED * dt);
        bot.z += Math.cos(angle) * (CONSTS.NEXTBOT_SPEED * dt);
        
        // Smoothly interpolate Y to avoid "teleporting" up stairs
        const targetY = (moveTarget.y || 0) + CONSTS.NEXTBOT_HEIGHT;
        bot.y += (targetY - bot.y) * 0.2; 
    }
    else {
        //bot.currentPath.shift();
    }


    /*
    let moveTarget = null;
    if (bot.currentPath && bot.currentPath.length > 0) {
        moveTarget = bot.currentPath[0];
    }
    // DO NOT DEFAULT TO CLOSEST PLAYER (for testing)
    //else {
    //    // Fallback: move toward player if off-mesh
    //    moveTarget = closestPlayer;
    //}

    if (moveTarget) {
        const dx = moveTarget.x - bot.x;
        const dz = moveTarget.z - bot.z;
        const angle = Math.atan2(dx, dz);

        bot.x += Math.sin(angle) * (CONSTS.NEXTBOT_SPEED * dt);
        bot.z += Math.cos(angle) * (CONSTS.NEXTBOT_SPEED * dt);
        
        // Smoothly interpolate Y to avoid "teleporting" up stairs
        const targetY = (moveTarget.y || 0) + CONSTS.NEXTBOT_HEIGHT;
        bot.y += (targetY - bot.y) * 0.2; 
    }

    // 4. OPTIMIZED SEPARATION (Radius checking)
    for (let otherId in nextbots) {
        if (id === otherId) continue;
        const ob = nextbots[otherId];
        const dx = bot.x - ob.x;
        const dz = bot.z - ob.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < 1.44) { // (1.2m radius squared)
            const d = Math.sqrt(dSq) || 1;
            bot.x += (dx / d) * 0.05;
            bot.z += (dz / d) * 0.05;
        }
    }
    */

    // 5. JUMPSCARE TRIGGER
    if (minDistSq < (CONSTS.NEXTBOT_KILL_DISTANCE ** 2)) {
        io.to(closestPlayerID).emit("jumpscare", { botID: id, bot: bot });
        // Reset bot or handle death logic

        bot.x = 0;
        bot.z = 0;
    }
}

httpServer.listen(port, host, () => console.log(`Server is running on http://${host}:${port}`));